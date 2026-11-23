// Job handlers. They persist what the AI service returns; they never decide compliance.
const crypto = require('crypto');
const Tender = require('../models/Tender');
const TenderRequirement = require('../models/TenderRequirement');
const Document = require('../models/Document');
const ExtractedField = require('../models/ExtractedField');
const VerificationResult = require('../models/VerificationResult');
const BidSubmission = require('../models/BidSubmission');
const Organization = require('../models/Organization');
const audit = require('../services/audit.service');
const ai = require('../services/aiClient');
const queue = require('./queue');

const fatal = (msg) => Object.assign(new Error(msg), { fatal: true });

// ---- extract_requirements -------------------------------------------------------------------
async function extractRequirements(job) {
  const tender = await Tender.findById(job.refs.tenderId);
  if (!tender) throw fatal('Tender not found');
  const res = await ai.extractTender({ filePath: tender.tenderFile.storagePath, tenderId: String(tender._id) });

  // Never overwrite work the officer already started: extraction only seeds an empty requirement set.
  if (await TenderRequirement.exists({ tenderId: tender._id })) return { skipped: 'requirements already exist', candidates: res.candidates.length, warnings: res.warnings };
  if (res.candidates.length) {
    await TenderRequirement.insertMany(res.candidates.map((c) => ({
      tenderId: tender._id, version: 1, code: c.code, type: c.type, description: c.description, rule: c.rule, mandatory: c.mandatory,
      origin: 'ai', source: { page: c.sourcePage, text: c.text, confidence: c.confidence },
      approved: false, // AI proposals are drafts; only an officer's approval makes them rules
    })));
    if (tender.status === 'draft') { tender.status = 'requirements_review'; await tender.save(); }
  }
  await audit.append({ actor: null, action: 'REQUIREMENTS_EXTRACTED', entity: 'tender_requirements', entityId: String(tender._id),
    meta: { tenderId: String(tender._id), candidates: res.candidates.length, needingInput: res.candidates.filter((c) => c.needsOfficerInput).length, warnings: res.warnings } });
  return { candidates: res.candidates.length, warnings: res.warnings };
}

// ---- process_document -----------------------------------------------------------------------
async function processDocument(job) {
  const doc = await Document.findById(job.refs.documentId);
  if (!doc) throw fatal('Document not found');
  if (doc.superseded) return { skipped: 'superseded' };
  doc.processingStatus = 'processing'; await doc.save();

  let res;
  try { res = await ai.processDocument({ filePath: doc.storagePath, docId: String(doc._id), declaredCategory: doc.declaredCategory }); }
  catch (err) {
    const last = err.fatal || job.attempts >= job.maxAttempts;
    doc.processingStatus = last ? 'failed' : 'queued';
    if (last) {
      doc.processing = { error: { code: err.code || 'ERROR', message: err.message } };
      await audit.append({ actor: null, action: 'DOCUMENT_PROCESSING_FAILED', entity: 'document', entityId: doc.id, meta: { tenderId: String(doc.tenderId), submissionId: String(doc.submissionId), code: err.code, message: err.message } });
    }
    await doc.save();
    throw err;
  }

  await ExtractedField.deleteMany({ documentId: doc._id });      // idempotent on retry / reprocess
  if (res.fields.length) {
    await ExtractedField.insertMany(res.fields.map((f) => ({
      documentId: doc._id, submissionId: doc.submissionId, tenderId: doc.tenderId, fieldName: f.fieldName, rawValue: f.rawValue,
      normalizedValue: f.normalizedValue, confidence: f.confidence, page: f.page, bbox: f.bbox || undefined, pageSize: f.pageSize || undefined, method: f.method, attrs: f.attrs || {},
    })));
  }
  doc.docType = res.docType; doc.classifyConfidence = res.classifyConfidence; doc.pageCount = res.pageCount; doc.pdfSignals = res.pdfSignals;
  doc.processing = { ocrPages: res.ocrPages, ocrConfidence: res.ocrConfidence, lowConfidence: res.lowConfidence, warnings: res.warnings, classifyBasis: res.classifyBasis };
  doc.processingStatus = res.lowConfidence || res.warnings.length ? 'needs_review' : 'done';
  await doc.save();
  await audit.append({ actor: null, action: 'DOCUMENT_PROCESSED', entity: 'document', entityId: doc.id,
    meta: { tenderId: String(doc.tenderId), submissionId: String(doc.submissionId), docType: res.docType, fields: res.fields.length, lowConfidence: res.lowConfidence, ocrPages: res.ocrPages.length } });
  await maybeEnqueueConsistency(doc.submissionId, doc.tenderId);
  return { docType: res.docType, fields: res.fields.length, status: doc.processingStatus };
}

// Run the cross-document check once every live document of the submission has finished (HLD S6/S7).
async function maybeEnqueueConsistency(submissionId, tenderId) {
  const live = await Document.find({ submissionId, superseded: false }).select('_id processingStatus').lean();
  if (live.some((d) => ['queued', 'processing'].includes(d.processingStatus))) return null;
  const processed = live.filter((d) => ['done', 'needs_review'].includes(d.processingStatus));
  if (!processed.length) return null;
  const key = 'consistency:' + crypto.createHash('sha256').update(processed.map((d) => `${d._id}:${d.processingStatus}`).sort().join('|')).digest('hex').slice(0, 24);
  return queue.enqueue('consistency', { submissionId: String(submissionId), tenderId: String(tenderId) }, { idempotencyKey: key });
}

// ---- consistency ----------------------------------------------------------------------------
const COMPARED = ['legal_name', 'gstin', 'pan', 'address'];
async function consistency(job) {
  const sub = await BidSubmission.findById(job.refs.submissionId);
  if (!sub) throw fatal('Submission not found');
  const org = await Organization.findById(sub.organizationId);
  const docs = await Document.find({ submissionId: sub._id, superseded: false, processingStatus: { $in: ['done', 'needs_review'] } }).select('_id docType').lean();
  const typeOf = new Map(docs.map((d) => [String(d._id), d.docType || 'OTHER']));
  const fields = await ExtractedField.find({ documentId: { $in: docs.map((d) => d._id) }, fieldName: { $in: COMPARED } }).lean();
  const a = org?.registeredAddress || {};
  const res = await ai.consistency({
    fields: fields.map((f) => ({ docId: String(f.documentId), docType: typeOf.get(String(f.documentId)), fieldName: f.fieldName, rawValue: f.rawValue, normalizedValue: f.normalizedValue })),
    orgProfile: org ? { legalName: org.legalName, gstin: org.gstin, pan: org.pan, address: [a.line1, a.city, a.state, a.pincode].filter(Boolean).join(', ') } : null,
  });
  await VerificationResult.deleteMany({ submissionId: sub._id, type: 'consistency' });
  if (res.findings.length) {
    await VerificationResult.insertMany(res.findings.map((f) => ({
      submissionId: sub._id, tenderId: sub.tenderId, type: 'consistency', subtype: f.type, outcome: f.verdict, score: f.score,
      details: { fieldA: f.fieldA, fieldB: f.fieldB, explanation: f.explanation }, sourceJobId: job._id,
    })));
  }
  await audit.append({ actor: null, action: 'CONSISTENCY_CHECKED', entity: 'submission', entityId: String(sub._id),
    meta: { tenderId: String(sub.tenderId), findings: res.findings.length, mismatches: res.findings.filter((f) => f.verdict === 'MISMATCH').length } });
  return { findings: res.findings.length };
}

function registerAll(worker) {
  worker.register('extract_requirements', extractRequirements);
  worker.register('process_document', processDocument);
  worker.register('consistency', consistency);
}
module.exports = { registerAll, extractRequirements, processDocument, consistency, maybeEnqueueConsistency };
