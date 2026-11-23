const Organization = require('../../models/Organization');
const User = require('../../models/User');
const Tender = require('../../models/Tender');
const BidSubmission = require('../../models/BidSubmission');
const audit = require('../../services/audit.service');
const { E } = require('../../utils/errors');
const { actorOf } = require('../../utils/http');
const { normalizeName } = require('../../utils/identifiers');
const { ROLES } = require('../../config/permissions');
const { tenderFilterFor, same } = require('../../services/access');

const present = (o) => ({
  id: String(o._id), legalName: o.legalName, gstin: o.gstin, pan: o.pan, udyamNo: o.udyamNo, cin: o.cin,
  type: o.type, registeredAddress: o.registeredAddress, createdAt: o.createdAt,
});
const snap = (o) => ({ legalName: o.legalName, gstin: o.gstin, pan: o.pan, udyamNo: o.udyamNo, cin: o.cin, type: o.type, registeredAddress: o.registeredAddress });

async function create(user, body) {
  if (user.organizationId) throw E.conflict('Your account is already linked to an organisation');
  const norm = (s) => String(s || '').trim().toUpperCase();
  let org;
  try {
    org = await Organization.create({
      ...body, gstin: norm(body.gstin), pan: norm(body.pan), udyamNo: norm(body.udyamNo), cin: norm(body.cin),
      normalizedName: normalizeName(body.legalName), ownerUserId: user._id,
    });
  } catch (err) {
    if (err.code === 11000) throw E.conflict('An organisation with this GSTIN is already registered');
    throw err;
  }
  user.organizationId = org._id; await user.save();
  await audit.append({ actor: actorOf(user), action: 'ORGANIZATION_REGISTERED', entity: 'organization', entityId: org.id, after: snap(org) });
  return present(org);
}

async function mine(user) {
  if (!user.organizationId) throw E.notFound('No organisation registered for this account');
  const org = await Organization.findById(user.organizationId);
  if (!org) throw E.notFound('No organisation registered for this account');
  return present(org);
}

async function updateMine(user, patch) {
  if (!user.organizationId) throw E.notFound('No organisation registered for this account');
  const org = await Organization.findById(user.organizationId);
  const before = snap(org);
  const norm = (s) => String(s || '').trim().toUpperCase();
  const next = { ...patch };
  if ('udyamNo' in next) next.udyamNo = norm(next.udyamNo);
  if ('cin' in next) next.cin = norm(next.cin);
  org.set(next); await org.save();
  await audit.append({ actor: actorOf(user), action: 'ORGANIZATION_UPDATED', entity: 'organization', entityId: org.id, before, after: snap(org) });
  return present(org);
}

// Staff see only organisations that have submitted to tenders they own / are assigned to; auditors see all.
async function visibleOrgIds(user) {
  if (user.role === ROLES.AUDITOR) return null;
  const tenderIds = await Tender.distinct('_id', await tenderFilterFor(user));
  return BidSubmission.distinct('organizationId', { tenderId: { $in: tenderIds } });
}
async function list(user, { page, pageSize }) {
  const ids = await visibleOrgIds(user);
  const filter = ids ? { _id: { $in: ids } } : {};
  const [items, total] = await Promise.all([
    Organization.find(filter).sort({ legalName: 1 }).skip((page - 1) * pageSize).limit(pageSize), Organization.countDocuments(filter)]);
  return { items: items.map(present), page, pageSize, total };
}
async function getById(user, id) {
  const ids = await visibleOrgIds(user);
  if (ids && !ids.some((x) => same(x, id))) throw E.notFound('Organisation not found');
  const org = await Organization.findById(id);
  if (!org) throw E.notFound('Organisation not found');
  return present(org);
}
module.exports = { create, mine, updateMine, list, getById };
