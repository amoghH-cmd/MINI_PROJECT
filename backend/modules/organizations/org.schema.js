const { z } = require('zod');
const { ORG_TYPES } = require('../../models/Organization');
const { validateGstin, validatePan, validateUdyam, validateCin } = require('../../utils/identifiers');

const check = (fn, label) => (v, ctx) => { const r = fn(v); if (!r.ok) ctx.addIssue({ code: 'custom', message: `${label}: ${r.reason}` }); };
const address = z.object({
  line1: z.string().trim().min(3).max(200),
  city: z.string().trim().min(2).max(100),
  state: z.string().trim().min(2).max(100),
  pincode: z.string().regex(/^\d{6}$/, 'PIN code must be 6 digits'),
});
const createBody = z.object({
  legalName: z.string().trim().min(3).max(200),
  gstin: z.string().superRefine(check(validateGstin, 'GSTIN')),
  pan: z.string().superRefine(check(validatePan, 'PAN')),
  udyamNo: z.string().superRefine(check(validateUdyam, 'Udyam')).optional().or(z.literal('')),
  cin: z.string().superRefine(check(validateCin, 'CIN')).optional().or(z.literal('')),
  type: z.enum(ORG_TYPES).default('OTHER'),
  registeredAddress: address,
}).superRefine((v, ctx) => {
  const g = validateGstin(v.gstin);
  if (g.ok && validatePan(v.pan).ok && g.pan !== v.pan.trim().toUpperCase())
    ctx.addIssue({ code: 'custom', path: ['pan'], message: 'PAN does not match the PAN embedded in the GSTIN' });
});
// GSTIN and PAN identify the legal entity and are not editable here once registered.
const updateBody = z.object({
  udyamNo: createBody.innerType().shape.udyamNo, cin: createBody.innerType().shape.cin,
  type: z.enum(ORG_TYPES), registeredAddress: address,
}).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update');
module.exports = { createBody, updateBody };
