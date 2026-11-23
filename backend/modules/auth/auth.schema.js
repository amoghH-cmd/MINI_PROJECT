const { z } = require('zod');
const password = z.string().min(10, 'At least 10 characters').max(128)
  .regex(/[A-Za-z]/, 'Must contain a letter').regex(/\d/, 'Must contain a digit');

const loginBody = z.object({ email: z.string().email().max(200), password: z.string().min(1).max(128) });
// Public registration creates BIDDER accounts only; officer/reviewer/auditor/admin accounts are created by an Admin.
const registerBody = z.object({
  name: z.string().trim().min(2).max(120),
  email: z.string().email().max(200),
  password,
});
module.exports = { loginBody, registerBody };
