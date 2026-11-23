require('./setup');
const test = require('node:test');
const assert = require('node:assert/strict');
const id = require('../utils/identifiers');
const { validateRule, requiredDocType } = require('../modules/requirements/rule.schema');
const { computeChecklist } = require('../modules/submissions/checklist');
const { documentsVisibleTo } = require('../services/access');

test('GSTIN: generated fictional IDs validate; any single-character change is caught by the checksum', () => {
  const g = id.makeGstin('29', 'AABCS1234F');
  assert.equal(id.validateGstin(g).ok, true); assert.equal(id.validateGstin(g).pan, 'AABCS1234F');
  const chars = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const pos of [2, 6, 10, 12]) {
    const swapped = g.slice(0, pos) + (g[pos] === 'A' ? 'B' : 'A') + g.slice(pos + 1);
    assert.equal(id.validateGstin(swapped).ok, false, `position ${pos}`);
  }
  assert.ok(chars.includes(g[14]));
});
test('GSTIN/PAN/Udyam/CIN: rejects malformed input with a reason', () => {
  assert.match(id.validateGstin('123').reason, /15 characters/);
  assert.match(id.validateGstin('99ZZZZZ0000Z1Z5').reason, /PAN/);
  assert.match(id.validateGstin('00' + id.makeGstin('29', 'AABCS1234F').slice(2)).reason, /state code/);
  assert.equal(id.validatePan('aabcs1234f').ok, true, 'case-insensitive input');
  assert.equal(id.validatePan('AABXS1234F').ok, false, 'invalid holder type (4th char)');
  assert.equal(id.validateUdyam('UDYAM-KA-03-0012345').ok, true);
  assert.equal(id.validateUdyam('UDYAM-KA-3-12345').ok, false);
  assert.equal(id.validateCin('U12345KA2019PTC123456').ok, true);
  assert.equal(id.validateCin('X12345').ok, false);
});
test('name normalisation unifies common legal-name variants', () => {
  assert.equal(id.normalizeName('Sample Fabricators Private Limited'), id.normalizeName('SAMPLE FABRICATORS PVT. LTD.'));
  assert.equal(id.normalizeName('A & B Works'), 'a and b works');
});

test('rule schema: accepts each rule type and rejects malformed or unknown ones', () => {
  const ok = [
    { type: 'document_present', docType: 'GST_CERTIFICATE' },
    { type: 'field_format', field: 'gstin' },
    { type: 'date_valid_on', docType: 'UDYAM_CERTIFICATE', dateField: 'valid_upto', onDate: 'bid_opening_date' },
    { type: 'date_valid_on', docType: 'UDYAM_CERTIFICATE', dateField: 'valid_upto', onDate: '2026-12-31' },
    { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 'turnover', min: 2, unit: 'INR_CRORE', years: 3, aggregate: 'average' },
    { type: 'count_min', docType: 'EXPERIENCE_LETTER', minCount: 2, minValue: 5000000 },
    { type: 'declaration_present', declarationCode: 'LAND_BORDER_144XI' },
    { type: 'cross_doc_consistency', fields: ['legal_name', 'pan'] },
    { type: 'registry_verified', registry: 'GST' },
  ];
  ok.forEach((r) => assert.equal(validateRule(r).ok, true, JSON.stringify(r)));
  const bad = [{}, { type: 'x' }, { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 't', min: -1, unit: 'INR' },
    { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 't', min: 5, unit: 'USD' }, { type: 'date_valid_on', docType: 'PAN_CARD', dateField: 'd', onDate: '31/12/2026' },
    { type: 'count_min', docType: 'EXPERIENCE_LETTER', minCount: 0 }, { type: 'registry_verified', registry: 'MCA' }, null];
  bad.forEach((r) => assert.equal(validateRule(r).ok, false, JSON.stringify(r)));
  assert.equal(validateRule({ type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 't', min: 1, unit: 'INR' }).rule.aggregate, 'latest', 'default applied');
});
test('requiredDocType maps rules to upload categories', () => {
  assert.equal(requiredDocType({ type: 'declaration_present', declarationCode: 'X1' }), 'DECLARATION');
  assert.equal(requiredDocType({ type: 'registry_verified', registry: 'GST' }), null);
  assert.equal(requiredDocType(null), null);
});

test('checklist: counts mandatory categories, ignores superseded files, marks declared vs classified', () => {
  const reqs = [
    { code: 'R1', mandatory: true, rule: { type: 'document_present', docType: 'GST_CERTIFICATE' } },
    { code: 'R2', mandatory: true, rule: { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 't', min: 1, unit: 'INR' } },
    { code: 'R3', mandatory: false, rule: { type: 'document_present', docType: 'UDYAM_CERTIFICATE' } },
    { code: 'R4', mandatory: true, rule: { type: 'registry_verified', registry: 'GST' } },
  ];
  let c = computeChecklist(reqs, []);
  assert.equal(c.items.length, 3); assert.equal(c.completenessPct, 0);
  c = computeChecklist(reqs, [{ declaredCategory: 'GST_CERTIFICATE', docType: null }, { declaredCategory: 'FINANCIAL_STATEMENT', docType: 'FINANCIAL_STATEMENT', superseded: true }]);
  assert.equal(c.completenessPct, 50); assert.equal(c.items.find((i) => i.docType === 'GST_CERTIFICATE').basis, 'declared');
  c = computeChecklist(reqs, [{ declaredCategory: null, docType: 'FINANCIAL_STATEMENT' }]);
  assert.equal(c.items.find((i) => i.docType === 'FINANCIAL_STATEMENT').basis, 'classified');
  assert.equal(computeChecklist([{ code: 'R', mandatory: false, rule: { type: 'document_present', docType: 'PAN_CARD' } }], []).completenessPct, null, 'not computable without mandatory items');
});

test('document visibility matrix', () => {
  const oid = (n) => ({ toString: () => n });
  const tender = (status) => ({ ownerId: oid('off'), assignedReviewerIds: [oid('rev')], status });
  const sub = (status) => ({ status, organizationId: oid('org1') });
  const U = (role, id, org) => ({ role, _id: oid(id), organizationId: org ? oid(org) : null });
  assert.equal(documentsVisibleTo(U('BIDDER', 'b', 'org1'), tender('open'), sub('draft')), true);
  assert.equal(documentsVisibleTo(U('BIDDER', 'b2', 'org2'), tender('open'), sub('draft')), false);
  assert.equal(documentsVisibleTo(U('PROCUREMENT_OFFICER', 'off'), tender('open'), sub('draft')), false);
  assert.equal(documentsVisibleTo(U('PROCUREMENT_OFFICER', 'off'), tender('open'), sub('submitted')), true);
  assert.equal(documentsVisibleTo(U('PROCUREMENT_OFFICER', 'other'), tender('open'), sub('submitted')), false);
  assert.equal(documentsVisibleTo(U('TEC_REVIEWER', 'rev'), tender('open'), sub('submitted')), false);
  assert.equal(documentsVisibleTo(U('TEC_REVIEWER', 'rev'), tender('closed'), sub('submitted')), true);
  assert.equal(documentsVisibleTo(U('AUDITOR', 'aud'), tender('closed'), sub('submitted')), false);
});
