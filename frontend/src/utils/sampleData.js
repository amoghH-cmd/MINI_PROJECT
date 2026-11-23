// FICTIONAL layout-preview data used only until the tenders/compliance modules exist (Phases 4-6).
// Nothing here is read from the backend or from any real document.
export const SAMPLE_TENDERS = [
  { id: 't1', no: 'BCVP/DEMO/MM/2026/014', title: 'Supply of Seamless Carbon Steel Pipes (Demo)', status: 'OPEN', bids: 5, review: 7, clar: 1, deadline: '2026-12-04' },
  { id: 't2', no: 'BCVP/DEMO/MM/2026/019', title: 'Annual Rate Contract for Valves and Fittings (Demo)', status: 'OPEN', bids: 3, review: 2, clar: 0, deadline: '2026-12-11' },
  { id: 't3', no: 'BCVP/DEMO/CIV/2026/007', title: 'Civil Repair Works, Tank Farm Area (Demo)', status: 'CLOSED', bids: 6, review: 11, clar: 2, deadline: '2026-11-18' },
  { id: 't4', no: 'BCVP/DEMO/IT/2026/003', title: 'Network Switches and Cabling (Demo)', status: 'DRAFT', bids: 0, review: 0, clar: 0, deadline: '2027-01-08' },
];
export const SAMPLE_ACTIVITY = [
  { id: 'a1', at: '2026-11-21 16:42', who: 'Meenakshi Sundaram', what: 'Approved requirement set v2 for BCVP/DEMO/MM/2026/014' },
  { id: 'a2', at: '2026-11-21 11:05', who: 'Bidder (Sample Fabricators Pvt Ltd)', what: 'Uploaded 4 documents to BCVP/DEMO/MM/2026/014' },
  { id: 'a3', at: '2026-11-20 15:30', who: 'Dr. Anitha Raghavan', what: 'Added technical comment on BCVP/DEMO/CIV/2026/007' },
  { id: 'a4', at: '2026-11-20 10:12', who: 'Meenakshi Sundaram', what: 'Requested clarification from Sample Engineering Works' },
];
export const SAMPLE_EVIDENCE = {
  requirement: { code: 'REQ-03', text: 'Bidder must hold a valid GST registration on the bid opening date.', mandatory: true, rule: 'date_valid_on', version: 2 },
  bidder: 'Sample Fabricators Pvt Ltd (fictional)',
  document: 'gst_registration_certificate.pdf',
  pages: [
    ['FORM GST REG-06', 'Registration Certificate (SAMPLE TEXT)', 'Legal Name: Sample Fabricators Private Limited', 'Trade Name: Sample Fabricators', 'GSTIN: 29AAAAA0000A1Z5 (placeholder)', 'Date of Liability: 01/04/2019', 'Valid From: 01/04/2019    Valid Upto: Not Applicable'],
    ['Annexure A (SAMPLE TEXT)', 'Principal Place of Business', 'Plot 12, Industrial Estate Phase II, Sample City', 'Details of Additional Places of Business: Nil'],
  ],
  fields: [
    { id: 'f1', name: 'GSTIN', value: '29AAAAA0000A1Z5', conf: 0.97, page: 1, line: 4 },
    { id: 'f2', name: 'Legal name', value: 'Sample Fabricators Private Limited', conf: 0.95, page: 1, line: 2 },
    { id: 'f3', name: 'Valid from', value: '2019-04-01', conf: 0.93, page: 1, line: 6 },
    { id: 'f4', name: 'Valid upto', value: 'Not applicable', conf: 0.81, page: 1, line: 6 },
  ],
  result: { status: 'REVIEW', reason: 'Validity end date reads "Not Applicable"; the rule needs an end date or an officer decision. Registry check was not available.' },
};
