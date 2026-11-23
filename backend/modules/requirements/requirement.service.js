const TenderRequirement = require('../../models/TenderRequirement');
const BidSubmission = require('../../models/BidSubmission');
const audit = require('../../services/audit.service');
const { E } = require('../../utils/errors');
const { actorOf } = require('../../utils/http');
const { canonicalJson } = require('../../utils/hash');
const { ROLES } = require('../../config/permissions');
const { getTenderFor, assertOwner } = require('../../services/access');
const { validateRule } = require('./rule.schema');

async function versionsOf(tenderId) {
  const rows = await TenderRequirement.find({ tenderId }).select('version approved approvedAt').lean();
  const map = new Map();
  for (const r of rows) {
    const v = map.get(r.version) || { version: r.version, approved: r.approved, approvedAt: r.approvedAt, count: 0 };
    v.count += 1; map.set(r.version, v);
  }
  return [...map.values()].sort((a, b) => a.version - b.version);
}

function presentRow(r, user) {
  const v = validateRule(r.rule);
  const out = { id: String(r._id), code: r.code, type: r.type, description: r.description, rule: r.rule, mandatory: r.mandatory, ruleValid: v.ok, ruleErrors: v.errors };
  if (user.role !== ROLES.BIDDER) Object.assign(out, { origin: r.origin, editedByOfficer: r.editedByOfficer, source: r.source });
  return out;
}

async function get(user, tenderId, version) {
  const tender = await getTenderFor(user, tenderId);
  const versions = await versionsOf(tender._id);
  // Bidders only ever see the approved version; they never see drafts or AI provenance.
  let target = version;
  if (user.role === ROLES.BIDDER) target = tender.approvedRequirementVersion;
  else if (!target) target = versions.length ? versions[versions.length - 1].version : null;
  if (!target) return { tenderId: String(tender._id), version: null, approved: false, requirements: [], versions: user.role === ROLES.BIDDER ? [] : versions };
  const rows = await TenderRequirement.find({ tenderId: tender._id, version: target }).sort({ code: 1 });
  return {
    tenderId: String(tender._id), version: target, approved: rows.length > 0 && rows.every((r) => r.approved),
    requirements: rows.map((r) => presentRow(r, user)), versions: user.role === ROLES.BIDDER ? [] : versions,
  };
}

async function save(user, tenderId, items) {
  const tender = await getTenderFor(user, tenderId); assertOwner(user, tender);
  if (!['draft', 'requirements_review', 'open'].includes(tender.status)) throw E.conflict('Requirements cannot be changed after the tender has closed');
  if (await BidSubmission.exists({ tenderId: tender._id })) throw E.conflict('Requirements are frozen because bids have been received');

  const versions = await versionsOf(tender._id);
  const latest = versions[versions.length - 1];
  // Approved versions are immutable: editing starts a new draft version. An existing draft is edited in place.
  const target = latest && !latest.approved ? latest.version : (latest ? latest.version + 1 : 1);
  const prev = latest ? await TenderRequirement.find({ tenderId: tender._id, version: latest.version }).lean() : [];
  const prevByCode = new Map(prev.map((p) => [p.code, p]));

  const ops = items.map((it) => {
    const p = prevByCode.get(it.code);
    const changed = !!p && (p.description !== it.description || canonicalJson(p.rule) !== canonicalJson(it.rule) || p.mandatory !== it.mandatory || p.type !== it.type);
    return {
      updateOne: {
        filter: { tenderId: tender._id, version: target, code: it.code },
        update: { $set: { type: it.type, description: it.description, rule: it.rule, mandatory: it.mandatory, approved: false, approvedAt: null, approvedBy: null,
          origin: p?.origin ?? 'officer', source: p?.source, editedByOfficer: p?.origin === 'ai' ? (p.editedByOfficer || changed) : false } },
        upsert: true,
      },
    };
  });
  if (ops.length) await TenderRequirement.bulkWrite(ops);
  await TenderRequirement.deleteMany({ tenderId: tender._id, version: target, code: { $nin: items.map((i) => i.code) } });

  if (tender.status === 'draft') { tender.status = 'requirements_review'; await tender.save(); }
  await audit.append({
    actor: actorOf(user), action: 'REQUIREMENTS_SAVED', entity: 'tender_requirements', entityId: String(tender._id),
    after: { version: target, codes: items.map((i) => i.code) }, meta: { tenderId: String(tender._id), version: target, count: items.length },
  });
  return get(user, tenderId, target);
}

async function approve(user, tenderId) {
  const tender = await getTenderFor(user, tenderId); assertOwner(user, tender);
  if (!['draft', 'requirements_review', 'open'].includes(tender.status)) throw E.conflict('Requirements cannot be approved after the tender has closed');
  if (await BidSubmission.exists({ tenderId: tender._id })) throw E.conflict('Requirements are frozen because bids have been received');
  const versions = await versionsOf(tender._id);
  const latest = versions[versions.length - 1];
  if (!latest) throw E.conflict('There are no requirements to approve');
  if (latest.approved) throw E.conflict(`Version ${latest.version} is already approved. Edit the requirements to start a new version.`);

  const rows = await TenderRequirement.find({ tenderId: tender._id, version: latest.version });
  const errors = [];
  for (const r of rows) {
    const v = validateRule(r.rule);
    if (!v.ok) v.errors.forEach((e) => errors.push({ path: `${r.code}.rule.${e.path}`, message: e.message }));
  }
  if (errors.length) throw E.unprocessable('One or more requirements have an invalid rule configuration', errors);

  const now = new Date();
  await TenderRequirement.updateMany({ tenderId: tender._id, version: latest.version }, { $set: { approved: true, approvedAt: now, approvedBy: user._id } });
  const before = { status: tender.status, approvedRequirementVersion: tender.approvedRequirementVersion };
  tender.approvedRequirementVersion = latest.version; tender.status = 'open'; await tender.save();
  await audit.append({
    actor: actorOf(user), action: 'REQUIREMENTS_APPROVED', entity: 'tender_requirements', entityId: String(tender._id),
    before, after: { status: 'open', approvedRequirementVersion: latest.version },
    meta: { tenderId: String(tender._id), version: latest.version, count: rows.length, codes: rows.map((r) => r.code), aiOrigin: rows.filter((r) => r.origin === 'ai').length },
  });
  return { version: latest.version, approvedAt: now, requirementCount: rows.length, tenderStatus: 'open' };
}

module.exports = { get, save, approve };
