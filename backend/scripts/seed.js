// Seeds DEMO accounts only. All data is fictional.
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const env = require('../config/env');
const User = require('../models/User');
const audit = require('../services/audit.service');
const Organization = require('../models/Organization');
const Tender = require('../models/Tender');
const TenderRequirement = require('../models/TenderRequirement');
const { makeGstin, normalizeName } = require('../utils/identifiers');
const { storage } = require('../services/storage');

const DEMO = [
  { name: 'Rajesh Kumar Iyer', email: 'admin@demo.bcvp.test', role: 'ADMIN', designation: 'System Administrator', department: 'IT Cell' },
  { name: 'Meenakshi Sundaram', email: 'officer@demo.bcvp.test', role: 'PROCUREMENT_OFFICER', designation: 'Deputy General Manager (Materials)', department: 'Materials Management' },
  { name: 'Dr. Anitha Raghavan', email: 'reviewer@demo.bcvp.test', role: 'TEC_REVIEWER', designation: 'Chief Manager (Technical)', department: 'Engineering Services' },
  { name: 'Sanjay Verma', email: 'auditor@demo.bcvp.test', role: 'AUDITOR', designation: 'Internal Audit Officer', department: 'Internal Audit' },
  { name: 'Bidder Demo User', email: 'bidder@demo.bcvp.test', role: 'BIDDER', designation: 'Authorised Signatory', department: '' },
];

(async () => {
  await mongoose.connect(env.MONGO_URI, { serverSelectionTimeoutMS: 8000 });
  const hash = await bcrypt.hash(env.SEED_DEMO_PASSWORD, 12);
  for (const d of DEMO) {
    const existing = await User.findOne({ email: d.email });
    if (existing) { console.log('exists  ', d.email); continue; }
    const u = await User.create({ ...d, passwordHash: hash });
    await audit.append({ actor: null, action: 'USER_SEEDED', entity: 'user', entityId: u.id, after: { email: d.email, role: d.role } });
    console.log('created ', d.email, `(${d.role})`);
  }
  // ---- fictional demo tender with an approved requirement set (checksum-valid but NON-EXISTENT identifiers) ----
  const officer = await User.findOne({ email: 'officer@demo.bcvp.test' });
  const bidder = await User.findOne({ email: 'bidder@demo.bcvp.test' });
  if (!bidder.organizationId) {
    const gstin = makeGstin('29', 'AABCS1234F');
    const org = await Organization.create({ legalName: 'Sample Fabricators Private Limited', normalizedName: normalizeName('Sample Fabricators Private Limited'), gstin, pan: 'AABCS1234F',
      type: 'PRIVATE_LIMITED', registeredAddress: { line1: 'Plot 12, Industrial Estate Phase II', city: 'Sample City', state: 'Karnataka', pincode: '560001' }, ownerUserId: bidder._id });
    bidder.organizationId = org._id; await bidder.save();
    console.log('created  demo organisation (fictional)');
  }
  const TENDER_NO = 'BCVP/DEMO/MM/2026/014';
  if (!(await Tender.exists({ tenderNo: TENDER_NO }))) {
    const pdf = Buffer.from('%PDF-1.4\n% FICTIONAL DEMO NIT - not a real tender\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n');
    const saved = await storage.save(pdf, { ext: '.pdf', folder: 'tenders' });
    const day = 86400000;
    const t = await Tender.create({ tenderNo: TENDER_NO, title: 'Supply of Seamless Carbon Steel Pipes (Demo)', department: 'Materials Management', estimatedValue: 25000000,
      submissionDeadline: new Date(Date.now() + 14 * day), bidOpeningDate: new Date(Date.now() + 15 * day), ownerId: officer._id, status: 'open', approvedRequirementVersion: 1,
      tenderFile: { originalName: 'demo_nit.pdf', storagePath: saved.key, sha256: saved.sha256, size: saved.size, mimeType: 'application/pdf' } });
    const rows = [
      ['REQ-01', 'DOCUMENT', 'Valid GST registration certificate', { type: 'document_present', docType: 'GST_CERTIFICATE' }],
      ['REQ-02', 'REGISTRATION', 'GSTIN to be verified against the GST registry', { type: 'registry_verified', registry: 'GST' }],
      ['REQ-03', 'VALIDITY', 'Udyam certificate valid on the bid opening date', { type: 'date_valid_on', docType: 'UDYAM_CERTIFICATE', dateField: 'valid_upto', onDate: 'bid_opening_date' }],
      ['REQ-04', 'FINANCIAL', 'Average annual turnover of at least Rs 2 crore over the last 3 years', { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 'turnover', min: 2, unit: 'INR_CRORE', years: 3, aggregate: 'average' }],
      ['REQ-05', 'EXPERIENCE', 'At least 2 similar supply orders of Rs 50 lakh or more in the last 5 years', { type: 'count_min', docType: 'EXPERIENCE_LETTER', minCount: 2, minValue: 5000000, sinceYears: 5 }],
      ['REQ-06', 'DECLARATION', 'Land border sharing declaration under GFR Rule 144(xi)', { type: 'declaration_present', declarationCode: 'LAND_BORDER_144XI' }],
      ['REQ-07', 'CONSISTENCY', 'Legal name and PAN consistent across submitted documents', { type: 'cross_doc_consistency', fields: ['legal_name', 'pan'], minScore: 90 }],
    ];
    await TenderRequirement.insertMany(rows.map(([code, type, description, rule]) => ({ tenderId: t._id, version: 1, code, type, description, rule, mandatory: true, origin: 'officer', approved: true, approvedAt: new Date(), approvedBy: officer._id })));
    await audit.append({ actor: null, action: 'DEMO_TENDER_SEEDED', entity: 'tender', entityId: t.id, meta: { tenderId: t.id } });
    console.log('created  demo tender', TENDER_NO, '(open, requirement set v1 approved)');
  } else console.log('exists   demo tender', TENDER_NO);
  console.log('\nDemo password is taken from SEED_DEMO_PASSWORD. Demo accounts only - do not use in a real deployment.');
  await mongoose.disconnect();
})().catch((e) => { console.error(e.message); process.exit(1); });
