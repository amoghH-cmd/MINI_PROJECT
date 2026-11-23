const Document = require('../../models/Document');
const BidSubmission = require('../../models/BidSubmission');
const { storage } = require('../../services/storage');
const audit = require('../../services/audit.service');
const queue = require('../../jobs/queue');
const { E } = require('../../utils/errors');
const { actorOf } = require('../../utils/http');
const { DOC_TYPE_KEYS } = require('../../config/docTypes');
const { getSubmissionFor, getTenderFor, documentsVisibleTo } = require('../../services/access');
const Tender = require('../../models/Tender');
const ExtractedField = require('../../models/ExtractedField');
const { presentDoc } = require('../submissions/submission.service');

const MAX_LIVE_DOCS = 60;

function assertUploadable(sub, tender) {
  if (!tender.isAcceptingSubmissions()) throw E.conflict('Submission window closed');                          // HLD S5: 409
  if (sub.status !== 'draft') throw E.conflict('This submission has been submitted; further uploads are not permitted');
}
function assertCategory(category) {
  if (category && !DOC_TYPE_KEYS.includes(category)) throw E.unprocessable('Validation failed', [{ path: 'category', message: `Category must be one of: ${DOC_TYPE_KEYS.join(', ')}` }]);
}

async function storeOne(user, sub, tender, file, { category, replaces }) {
  const saved = await storage.save(file.buffer, { ext: file.ext, folder: 'documents' });
  try {
    // Exact-hash matches elsewhere in this tender (other bids, or the same bid). Recorded for staff; never shown to bidders.
    const dupes = await Document.find({ tenderId: tender._id, sha256: saved.sha256, superseded: false }).select('_id').lean();
    const doc = await Document.create({
      submissionId: sub._id, tenderId: tender._id, organizationId: sub.organizationId, originalName: file.originalName,
      storagePath: saved.key, sha256: saved.sha256, mimeType: file.mime, size: saved.size,
      declaredCategory: category || null, processingStatus: 'queued', uploadedBy: user._id, replacesId: replaces?._id || null,
      duplicateOf: dupes.map((d) => d._id),
    });
    const job = await queue.enqueue('process_document', { documentId: String(doc._id), submissionId: String(sub._id), tenderId: String(tender._id) }, { idempotencyKey: `process:${doc._id}` });
    await audit.append({
      actor: actorOf(user), action: replaces ? 'DOCUMENT_REPLACED' : 'DOCUMENT_UPLOADED', entity: 'document', entityId: doc.id,
      meta: { tenderId: String(tender._id), submissionId: String(sub._id), sha256: saved.sha256, size: saved.size, category: category || null, replacesId: replaces ? String(replaces._id) : null, jobId: String(job._id) },
    });
    return doc;
  } catch (err) { await storage.remove(saved.key); throw err; }
}

async function upload(user, submissionId, files, { category } = {}) {
  assertCategory(category);
  const { sub, tender } = await getSubmissionFor(user, submissionId);
  assertUploadable(sub, tender);
  const live = await Document.countDocuments({ submissionId: sub._id, superseded: false });
  if (live + files.length > MAX_LIVE_DOCS) throw E.unprocessable('Too many documents', [{ path: 'files', message: `A submission can hold at most ${MAX_LIVE_DOCS} documents` }]);
  const docs = [];
  for (const f of files) docs.push(await storeOne(user, sub, tender, f, { category }));
  return docs.map((d) => presentDoc(d, user));
}

async function replace(user, submissionId, documentId, file) {
  const { sub, tender } = await getSubmissionFor(user, submissionId);
  assertUploadable(sub, tender);
  const old = await Document.findOne({ _id: documentId, submissionId: sub._id });
  if (!old || old.superseded) throw E.notFound('Document not found');
  const doc = await storeOne(user, sub, tender, file, { category: old.declaredCategory, replaces: old });
  old.superseded = true; await old.save(); // the old file is kept on disk for the audit record
  return presentDoc(doc, user);
}

// Scope first (404 if the user has no relation to this submission), then confidentiality rules.
async function loadVisible(user, documentId) {
  const doc = await Document.findById(documentId);
  if (!doc) throw E.notFound('Document not found');
  const sub = await BidSubmission.findById(doc.submissionId);
  const tender = await Tender.findById(doc.tenderId);
  if (!sub || !tender) throw E.notFound('Document not found');
  await getSubmissionFor(user, sub._id);
  if (!documentsVisibleTo(user, tender, sub)) throw E.notFound('Document not found');
  return { doc, sub, tender };
}

async function openFile(user, documentId) {
  const { doc, sub, tender } = await loadVisible(user, documentId);
  await audit.safeAppend({ actor: actorOf(user), action: 'DOCUMENT_VIEWED', entity: 'document', entityId: doc.id, meta: { tenderId: String(tender._id), submissionId: String(sub._id) } });
  return { stream: storage.createReadStream(doc.storagePath), name: doc.originalName, mime: doc.mimeType };
}

// What the AI service extracted from a document, with page/bbox evidence. Staff only; these are proposals, not findings.
async function getFields(user, documentId) {
  const { doc } = await loadVisible(user, documentId);
  const rows = await ExtractedField.find({ documentId: doc._id }).sort({ page: 1, fieldName: 1 }).lean();
  return {
    document: { id: String(doc._id), originalName: doc.originalName, declaredCategory: doc.declaredCategory, docType: doc.docType, classifyConfidence: doc.classifyConfidence,
      processingStatus: doc.processingStatus, pageCount: doc.pageCount, processing: doc.processing, pdfSignals: doc.pdfSignals },
    fields: rows.map((f) => ({ id: String(f._id), fieldName: f.fieldName, rawValue: f.rawValue, normalizedValue: f.normalizedValue, confidence: f.confidence, page: f.page,
      bbox: f.bbox && f.bbox.length ? f.bbox : null, pageSize: f.pageSize && f.pageSize.length ? f.pageSize : null, method: f.method, attrs: f.attrs, officerCorrected: f.officerCorrected })),
  };
}
module.exports = { upload, replace, openFile, getFields };
