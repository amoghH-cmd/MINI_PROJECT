const { z } = require('zod');
const { pageQuery } = require('../../utils/http');
const { TENDER_STATUS } = require('../../models/Tender');

const base = z.object({
  tenderNo: z.string().trim().min(3).max(60).regex(/^[A-Za-z0-9][A-Za-z0-9/\-_.]*$/, 'Use letters, digits and / - _ . only'),
  gemBidNo: z.string().trim().max(60).optional(),
  title: z.string().trim().min(5, 'At least 5 characters').max(300),
  department: z.string().trim().min(2).max(150),
  description: z.string().trim().max(5000).optional(),
  estimatedValue: z.coerce.number().min(0).max(1e13),
  bidOpeningDate: z.coerce.date(),
  submissionDeadline: z.coerce.date(),
});
const order = (v, ctx) => {
  if (v.bidOpeningDate && v.submissionDeadline && v.bidOpeningDate < v.submissionDeadline)
    ctx.addIssue({ code: 'custom', path: ['bidOpeningDate'], message: 'Bid opening cannot be before the submission deadline' });
};
const createBody = base.superRefine(order).superRefine((v, ctx) => {
  if (v.submissionDeadline <= new Date()) ctx.addIssue({ code: 'custom', path: ['submissionDeadline'], message: 'Submission deadline must be in the future' });
});
const updateBody = base.omit({ tenderNo: true }).partial().refine((v) => Object.keys(v).length > 0, 'Nothing to update').superRefine(order);
const listQuery = z.object({ ...pageQuery, status: z.enum(TENDER_STATUS).optional(), q: z.string().trim().max(100).optional() });
const reviewersBody = z.object({ reviewerIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(20) });
module.exports = { createBody, updateBody, listQuery, reviewersBody };
