// Resource scoping (HLD 4.11: "checked in middleware and again in services").
// Out-of-scope READS return 404 so existence is not revealed; WRITE attempts by a role that holds the
// permission but does not own the resource return 403.
const Tender = require('../models/Tender');
const BidSubmission = require('../models/BidSubmission');
const { ROLES } = require('../config/permissions');
const { E } = require('../utils/errors');

const same = (a, b) => a != null && b != null && String(a) === String(b);

async function tenderFilterFor(user) {
  switch (user.role) {
    case ROLES.OFFICER: return { ownerId: user._id };
    case ROLES.REVIEWER: return { assignedReviewerIds: user._id };
    case ROLES.AUDITOR: return {};
    case ROLES.BIDDER: {
      // Bidders see published (open) tenders plus any tender they already have a submission on.
      const mine = user.organizationId ? await BidSubmission.distinct('tenderId', { organizationId: user.organizationId }) : [];
      return { $or: [{ status: 'open' }, { _id: { $in: mine } }] };
    }
    default: return { _id: null }; // Admin: no access to procurement records
  }
}

async function getTenderFor(user, id) {
  const tender = await Tender.findOne({ $and: [{ _id: id }, await tenderFilterFor(user)] });
  if (!tender) throw E.notFound('Tender not found');
  return tender;
}

function assertOwner(user, tender) {
  if (!same(tender.ownerId, user._id)) throw E.forbidden('Only the procurement officer who owns this tender can do this');
}

async function getSubmissionFor(user, id) {
  const sub = await BidSubmission.findById(id);
  if (!sub) throw E.notFound('Submission not found');
  const tender = await Tender.findById(sub.tenderId);
  if (!tender) throw E.notFound('Submission not found');
  const ok =
    (user.role === ROLES.BIDDER && same(sub.organizationId, user.organizationId)) ||
    (user.role === ROLES.OFFICER && same(tender.ownerId, user._id)) ||
    (user.role === ROLES.REVIEWER && tender.assignedReviewerIds.some((r) => same(r, user._id))) ||
    user.role === ROLES.AUDITOR;
  if (!ok) throw E.notFound('Submission not found');
  return { sub, tender };
}

// Bidder documents are confidential. Staff see files only from submitted bids; reviewers additionally only
// once the tender has closed. Auditors never get raw bidder documents.
function documentsVisibleTo(user, tender, sub) {
  if (user.role === ROLES.BIDDER) return same(sub.organizationId, user.organizationId);
  if (sub.status === 'draft') return false;
  if (user.role === ROLES.OFFICER) return same(tender.ownerId, user._id);
  if (user.role === ROLES.REVIEWER) {
    return tender.assignedReviewerIds.some((r) => same(r, user._id)) && ['closed', 'under_evaluation', 'evaluated'].includes(tender.status);
  }
  return false;
}
module.exports = { tenderFilterFor, getTenderFor, assertOwner, getSubmissionFor, documentsVisibleTo, same };
