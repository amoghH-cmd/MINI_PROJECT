const Tender = require('../../models/Tender');
const BidSubmission = require('../../models/BidSubmission');
const AuditLog = require('../../models/AuditLog');
const User = require('../../models/User');

// Everything here is counted from real records. Figures that depend on modules not built yet are returned as null
// (the UI shows "not available") rather than as a misleading zero.
async function officer(user) {
  const now = new Date();
  const tenders = await Tender.find({ ownerId: user._id }).lean();
  const ids = tenders.map((t) => t._id);
  const submitted = await BidSubmission.countDocuments({ tenderId: { $in: ids }, status: { $ne: 'draft' } });
  const closedIds = tenders.filter((t) => ['closed', 'under_evaluation'].includes(t.status) || (t.status === 'open' && t.submissionDeadline < now)).map((t) => t._id);
  const pendingEvaluations = closedIds.length ? (await BidSubmission.distinct('tenderId', { tenderId: { $in: closedIds }, status: { $ne: 'draft' } })).length : 0;

  const upcoming = tenders.filter((t) => t.status === 'open' && t.submissionDeadline >= now)
    .sort((a, b) => a.submissionDeadline - b.submissionDeadline).slice(0, 5)
    .map((t) => ({ id: String(t._id), tenderNo: t.tenderNo, title: t.title, submissionDeadline: t.submissionDeadline }));

  const entries = ids.length ? await AuditLog.find({ 'meta.tenderId': { $in: ids.map(String) } }).sort({ seq: -1 }).limit(10).lean() : [];
  const actors = new Map((await User.find({ _id: { $in: entries.map((e) => e.actorId).filter(Boolean) } }).select('name').lean()).map((u) => [String(u._id), u.name]));
  const recentActivity = entries.map((e) => ({ id: String(e._id), at: e.at, actor: actors.get(String(e.actorId)) || e.actorRole || 'System', action: e.action, entityId: e.entityId, tenderId: e.meta?.tenderId }));

  return {
    totals: {
      totalTenders: tenders.length,
      activeTenders: tenders.filter((t) => t.status === 'open' && t.submissionDeadline >= now).length,
      submittedBids: submitted,
      pendingEvaluations,
      findingsRequiringReview: null,   // available once the compliance engine exists (phase 6)
      pendingClarifications: null,     // available once clarifications exist (phase 6)
    },
    upcomingDeadlines: upcoming,
    recentActivity,
  };
}
module.exports = { officer };
