const Tender = require('../../models/Tender');
const User = require('../../models/User');
const BidSubmission = require('../../models/BidSubmission');
const TenderRequirement = require('../../models/TenderRequirement');
const { storage } = require('../../services/storage');
const audit = require('../../services/audit.service');
const queue = require('../../jobs/queue');
const { E } = require('../../utils/errors');
const { escapeRe, actorOf } = require('../../utils/http');
const { ROLES } = require('../../config/permissions');
const { tenderFilterFor, getTenderFor, assertOwner } = require('../../services/access');

const snapshot = (t) => ({
  tenderNo: t.tenderNo, title: t.title, department: t.department, estimatedValue: t.estimatedValue,
  bidOpeningDate: t.bidOpeningDate, submissionDeadline: t.submissionDeadline, status: t.status,
});

// Bidders get a reduced view; staff see everything including the stored file hash.
function present(t, user) {
  const o = t.toObject ? t.toObject() : t;
  const out = {
    id: String(o._id), tenderNo: o.tenderNo, gemBidNo: o.gemBidNo, title: o.title, department: o.department, description: o.description,
    estimatedValue: o.estimatedValue, bidOpeningDate: o.bidOpeningDate, submissionDeadline: o.submissionDeadline,
    status: o.status, acceptingSubmissions: t.isAcceptingSubmissions ? t.isAcceptingSubmissions() : (o.status === 'open' && new Date() <= new Date(o.submissionDeadline)),
    approvedRequirementVersion: o.approvedRequirementVersion, createdAt: o.createdAt,
    hasFile: !!o.tenderFile?.storagePath, fileName: o.tenderFile?.originalName,
  };
  if (user.role !== ROLES.BIDDER) {
    out.ownerId = String(o.ownerId);
    out.assignedReviewerIds = (o.assignedReviewerIds || []).map(String);
    out.fileSha256 = o.tenderFile?.sha256;
  }
  return out;
}

async function create(user, body, file) {
  if (await Tender.exists({ tenderNo: body.tenderNo })) throw E.conflict(`Tender number ${body.tenderNo} already exists`);
  const saved = await storage.save(file.buffer, { ext: file.ext, folder: 'tenders' });
  let tender;
  try {
    tender = await Tender.create({
      ...body, ownerId: user._id, status: 'draft',
      tenderFile: { originalName: file.originalName, storagePath: saved.key, sha256: saved.sha256, size: saved.size, mimeType: file.mime },
    });
  } catch (err) {
    await storage.remove(saved.key); // no orphan file when the record is not created
    if (err.code === 11000) throw E.conflict(`Tender number ${body.tenderNo} already exists`);
    throw err;
  }
  const job = await queue.enqueue('extract_requirements', { tenderId: String(tender._id) }, { idempotencyKey: `extract:${tender._id}` });
  await audit.append({ actor: actorOf(user), action: 'TENDER_CREATED', entity: 'tender', entityId: tender.id, after: snapshot(tender), meta: { tenderId: tender.id, fileSha256: saved.sha256 } });
  return { tender: present(tender, user), jobId: String(job._id) };
}

async function list(user, q) {
  const filter = { $and: [await tenderFilterFor(user)] };
  if (q.status) filter.$and.push({ status: q.status });
  if (q.q) { const re = new RegExp(escapeRe(q.q), 'i'); filter.$and.push({ $or: [{ tenderNo: re }, { title: re }, { gemBidNo: re }] }); }
  const [items, total] = await Promise.all([
    Tender.find(filter).sort({ createdAt: -1 }).skip((q.page - 1) * q.pageSize).limit(q.pageSize),
    Tender.countDocuments(filter),
  ]);
  return { items: items.map((t) => present(t, user)), page: q.page, pageSize: q.pageSize, total };
}

async function get(user, id) {
  const t = await getTenderFor(user, id);
  const out = present(t, user);
  if (user.role === ROLES.OFFICER) {
    out.submissionCount = await BidSubmission.countDocuments({ tenderId: t._id, status: { $ne: 'draft' } });
    out.jobs = (await require('../../models/ProcessingJob').find({ 'refs.tenderId': String(t._id) }).sort({ createdAt: -1 }).limit(5).lean())
      .map((j) => ({ id: String(j._id), type: j.type, status: j.status, attempts: j.attempts, lastError: j.lastError }));
  }
  return out;
}

async function update(user, id, patch) {
  const t = await getTenderFor(user, id); assertOwner(user, t);
  if (!['draft', 'requirements_review', 'open'].includes(t.status)) throw E.conflict('Tender metadata cannot be changed after the tender has closed');
  if (t.status === 'open' && (await BidSubmission.exists({ tenderId: t._id }))) throw E.conflict('Tender metadata is locked because bids have been received');
  const next = { bidOpeningDate: patch.bidOpeningDate ?? t.bidOpeningDate, submissionDeadline: patch.submissionDeadline ?? t.submissionDeadline };
  if (next.bidOpeningDate < next.submissionDeadline) throw E.unprocessable('Validation failed', [{ path: 'bidOpeningDate', message: 'Bid opening cannot be before the submission deadline' }]);
  const before = snapshot(t);
  t.set(patch); await t.save();
  await audit.append({ actor: actorOf(user), action: 'TENDER_UPDATED', entity: 'tender', entityId: t.id, before, after: snapshot(t), meta: { tenderId: t.id } });
  return present(t, user);
}

async function close(user, id) {
  const t = await getTenderFor(user, id); assertOwner(user, t);
  if (t.status !== 'open') throw E.conflict('Only an open tender can be closed');
  const before = snapshot(t);
  t.status = 'closed'; await t.save();
  await audit.append({ actor: actorOf(user), action: 'TENDER_CLOSED', entity: 'tender', entityId: t.id, before, after: snapshot(t), meta: { tenderId: t.id } });
  return present(t, user);
}

async function assignReviewers(user, id, reviewerIds) {
  const t = await getTenderFor(user, id); assertOwner(user, t);
  const unique = [...new Set(reviewerIds)];
  const found = await User.find({ _id: { $in: unique }, role: ROLES.REVIEWER, active: true }).select('_id');
  if (found.length !== unique.length) throw E.unprocessable('Validation failed', [{ path: 'reviewerIds', message: 'Every id must be an active TEC reviewer' }]);
  const before = { assignedReviewerIds: t.assignedReviewerIds.map(String) };
  t.assignedReviewerIds = unique; await t.save();
  await audit.append({ actor: actorOf(user), action: 'TENDER_REVIEWERS_ASSIGNED', entity: 'tender', entityId: t.id, before, after: { assignedReviewerIds: unique }, meta: { tenderId: t.id } });
  return present(t, user);
}

async function openFile(user, id) {
  const t = await getTenderFor(user, id);
  if (!t.tenderFile?.storagePath) throw E.notFound('No tender file');
  return { stream: storage.createReadStream(t.tenderFile.storagePath), name: t.tenderFile.originalName, mime: t.tenderFile.mimeType };
}

const listReviewers = () => User.find({ role: ROLES.REVIEWER, active: true }).select('name designation department').lean()
  .then((rows) => rows.map((r) => ({ id: String(r._id), name: r.name, designation: r.designation, department: r.department })));

module.exports = { create, list, get, update, close, assignReviewers, openFile, listReviewers, present };
