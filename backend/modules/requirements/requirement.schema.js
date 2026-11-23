const { z } = require('zod');
const { REQ_TYPES } = require('../../models/TenderRequirement');

// Structure is validated on save; rule CONTENT is validated at approval so officers can keep work-in-progress drafts.
// Origin/source are never accepted from the client: provenance comes from the extraction service only.
const item = z.object({
  code: z.string().trim().regex(/^[A-Za-z0-9_-]{2,20}$/, 'Code: 2-20 letters, digits, - or _'),
  type: z.enum(REQ_TYPES),
  description: z.string().trim().min(5, 'At least 5 characters').max(2000),
  rule: z.record(z.any()).default({}),
  mandatory: z.boolean().default(true),
});
const saveBody = z.object({ requirements: z.array(item).max(100) }).superRefine((v, ctx) => {
  const seen = new Set();
  v.requirements.forEach((r, i) => {
    if (seen.has(r.code)) ctx.addIssue({ code: 'custom', path: ['requirements', i, 'code'], message: `Duplicate code ${r.code}` });
    seen.add(r.code);
  });
});
const getQuery = z.object({ version: z.coerce.number().int().min(1).optional() });
module.exports = { saveBody, getQuery };
