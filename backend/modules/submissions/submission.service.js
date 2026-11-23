const BidSubmission = require('../../models/BidSubmission');
const Organization = require('../../models/Organization');
const Document = require('../../models/Document');
const ProcessingJob = require('../../models/ProcessingJob');
const VerificationResult = require('../../models/VerificationResult');
const TenderRequirement = require('../../models/TenderRequirement');
const Tender = require('../../models/Tender');
const audit = require('../../services/audit.service');
const { E } = require('../../utils/errors');
const { actorOf } = require('../../utils/http');
const { ROLES } = require('../../config/permissions');
const { tenderFilterFor, getTenderFor, getSubmissionFor, documentsVisibleTo } = require('../../services/access');
const { computeChecklist } = require('./checklist');

const presentDoc = (d, user) => {
  const o = {
    id: String(d._id), originalName: d.originalName, mimeType: d.mimeType, size: d.size, sha256: d.sha256,
    declaredCategory: d.declaredCategory, docType: d.docType, classifyConfidence: d.classifyConfidence,
    processingStatus: d.processingStatus, processingError: d.processing?.error ? d.processing.error.message : null, superseded: d.superseded, replacesId: d.replacesId ? String(d.replacesId) : null, uploadedAt: d.createdAt,
  };
  // Duplicate matches across bidders are a staff-only screening signal; bidders must not learn about other bidders' files.
  if (user.role !== ROLES.BIDDER) o.duplicateOf = (d.duplicateOf || []).map(String);
  return o;
};

async function approvedRequirements(tender) {
  if (!tender.approvedRequirementVersion) return [];
  return TenderRequirement.find({ tenderId: tender._id, version: tender.approvedRequirementVersion, approved: true }).lean();
}

async function presentSubmission(user, sub, tender, { withDocs = true } = {}) {
  const org = await Organization.findById(sub.organizationId).select('legalName gstin').lean();
  const out = {
    id: String(sub._id), tenderId: String(sub.tenderId), tenderNo: tender.tenderNo, tenderTitle: tender.title, status: sub.status, submittedAt: sub.submittedAt,
    organization: org ? { id: String(org._id), legalName: org.legalName } : null, acceptingSubmissions: tender.isAcceptingSubmissions(),
  };
  if (!withDocs) return out;
  const visible = documentsVisibleTo(user, tender, sub);
  out.documentsVisible = visible;
  if (visible) {
    const docs = await Document.find({ submissionId: sub._id }).sort({ createdAt: 1 });
    out.documents = docs.map((d) => presentDoc(d, user));
    const jobs = await ProcessingJob.find({ 'refs.submissionId': String(sub._id) }).sort({ createdAt: -1 }).lean();
    out.jobs = jobs.map((j) => ({ id: String(j._id), type: j.type, status: j.status, attempts: j.attempts, lastError: j.lastError, documentId: j.refs?.documentId }));
    const cl = computeChecklist(await approvedRequirements(tender), docs);
    out.checklist = cl.items; out.completenessPct = cl.completenessPct;
  } else { out.documents = []; }
  return out;
}

async function create(user, tenderId) {
  if (!user.organizationId) throw E.unprocessable('Register your organisation before submitting a bid', [{ path: 'organization', message: 'Organisation profile required' }]);
  const tender = await getTenderFor(user, tenderId);
  if (!tender.isAcceptingSubmissions()) throw E.conflict('This tender is not accepting submissions');
  let sub;
  try { sub = await BidSubmission.create({ tenderId: tender._id, organizationId: user.organizationId, createdBy: user._id }); }
  catch (err) { if (err.code === 11000) throw E.conflict('Your organisation already has a submission for this tender'); throw err; }
  await audit.append({ actor: actorOf(user), action: 'SUBMISSION_CREATED', entity: 'submission', entityId: sub.id, meta: { tenderId: String(tender._id) } });
  return presentSubmission(user, sub, tender, { withDocs: false });
}

async function list(user, { tenderId, page, pageSize }) {
  let filter;
  if (user.role === ROLES.BIDDER) filter = user.organizationId ? { organizationId: user.organizationId } : { _id: null };
  else { const ids = await Tender.distinct('_id', await tenderFilterFor(user)); filter = { tenderId: { $in: ids } }; }
  if (tenderId) filter = { $and: [filter, { tenderId }] };
  if (user.role !== ROLES.BIDDER) filter = { $and: [filter, { status: { $ne: 'draft' } }] }; // staff do not see unsubmitted drafts
  const [rows, total] = await Promise.all([BidSubmission.find(filter).sort({ createdAt: -1 }).skip((page - 1) * pageSize).limit(pageSize), BidSubmission.countDocuments(filter)]);
  const tenders = new Map((await Tender.find({ _id: { $in: rows.map((r) => r.tenderId) } })).map((t) => [String(t._id), t]));
  const items = [];
  for (const r of rows) items.push(await presentSubmission(user, r, tenders.get(String(r.tenderId)), { withDocs: false }));
  return { items, page, pageSize, total };
}

async function get(user, id) {
  const { sub, tender } = await getSubmissionFor(user, id);
  return presentSubmission(user, sub, tender);
}

async function submit(user, id) {
  const { sub, tender } = await getSubmissionFor(user, id);
  if (!tender.isAcceptingSubmissions()) throw E.conflict('Submission window closed');
  if (sub.status !== 'draft') throw E.conflict('This submission has already been submitted');
  const live = await Document.countDocuments({ submissionId: sub._id, superseded: false });
  if (live === 0) throw E.unprocessable('Upload at least one document before submitting', [{ path: 'documents', message: 'No documents uploaded' }]);
  sub.status = 'submitted'; sub.submittedAt = new Date(); await sub.save();
  await audit.append({ actor: actorOf(user), action: 'SUBMISSION_SUBMITTED', entity: 'submission', entityId: sub.id, before: { status: 'draft' }, after: { status: 'submitted' }, meta: { tenderId: String(tender._id), documents: live } });
  return presentSubmission(user, sub, tender);
}
// Cross-document consistency findings (AI proposes, the rule engine in phase 6 decides what they mean). Staff only.
async function verifications(user, id) {
  const { sub, tender } = await getSubmissionFor(user, id);
  if (!documentsVisibleTo(user, tender, sub) || user.role === ROLES.BIDDER) throw E.notFound('Submission not found');
  const rows = await VerificationResult.find({ submissionId: sub._id }).sort({ subtype: 1, outcome: 1 }).lean();
  return { items: rows.map((r) => ({ id: String(r._id), type: r.type, subtype: r.subtype, outcome: r.outcome, score: r.score, details: r.details, createdAt: r.createdAt })) };
}
module.exports = { create, list, get, submit, presentDoc, verifications };
