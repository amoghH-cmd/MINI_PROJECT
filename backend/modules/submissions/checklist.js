// Pure function: which document categories do approved requirements call for, and how many are covered?
// completenessPct is a plain count of mandatory categories with at least one file. It is NOT a quality score
// and plays no part in qualification.
const { DOC_TYPES } = require('../../config/docTypes');
const { requiredDocType } = require('../requirements/rule.schema');

function computeChecklist(requirements, documents) {
  const slots = new Map();
  for (const r of requirements) {
    const dt = requiredDocType(r.rule);
    if (!dt) continue;
    const s = slots.get(dt) || { docType: dt, label: DOC_TYPES[dt], mandatory: false, requirementCodes: [] };
    s.mandatory = s.mandatory || !!r.mandatory;
    s.requirementCodes.push(r.code);
    slots.set(dt, s);
  }
  const live = documents.filter((d) => !d.superseded);
  const items = [...slots.values()].map((s) => {
    const files = live.filter((d) => (d.docType || d.declaredCategory) === s.docType);
    return {
      ...s,
      uploaded: files.length,
      // 'declared' = the bidder chose this category; it is not confirmed until classification runs.
      basis: files.length === 0 ? null : files.every((d) => d.docType) ? 'classified' : 'declared',
    };
  });
  const mandatory = items.filter((i) => i.mandatory);
  const covered = mandatory.filter((i) => i.uploaded > 0).length;
  return { items, completenessPct: mandatory.length ? Math.round((100 * covered) / mandatory.length) : null };
}
module.exports = { computeChecklist };
