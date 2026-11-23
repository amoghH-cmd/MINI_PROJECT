// Versioned JSON rule model (HLD: "rules are data, not code"). The Phase 6 engine evaluates exactly
// these shapes, and ONLY from officer-approved requirements. Invalid rules are rejected at approval (422).
const { z } = require('zod');
const { DOC_TYPE_KEYS } = require('../../config/docTypes');

const docType = z.enum(DOC_TYPE_KEYS);
const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

const rules = [
  z.object({ type: z.literal('document_present'), docType }),
  z.object({ type: z.literal('field_format'), field: z.enum(['gstin', 'pan', 'udyam_no', 'cin']), docType: docType.optional() }),
  z.object({ type: z.literal('date_valid_on'), docType, dateField: z.string().min(1).max(60), onDate: z.union([z.enum(['bid_opening_date', 'submission_deadline']), isoDate]) }),
  z.object({
    type: z.literal('numeric_min'), docType, field: z.string().min(1).max(60), min: z.number().positive(),
    unit: z.enum(['INR', 'INR_LAKH', 'INR_CRORE']), years: z.number().int().min(1).max(10).optional(),
    aggregate: z.enum(['latest', 'average', 'each']).default('latest'),
  }),
  z.object({ type: z.literal('count_min'), docType, minCount: z.number().int().min(1).max(100), minValue: z.number().positive().optional(), sinceYears: z.number().int().min(1).max(20).optional() }),
  z.object({ type: z.literal('declaration_present'), declarationCode: z.string().min(2).max(60) }),
  z.object({ type: z.literal('cross_doc_consistency'), fields: z.array(z.enum(['legal_name', 'gstin', 'pan', 'address', 'registration_no'])).min(1), minScore: z.number().min(50).max(100).default(90) }),
  z.object({ type: z.literal('registry_verified'), registry: z.enum(['GST', 'PAN', 'UDYAM']) }),
];
const ruleSchema = z.discriminatedUnion('type', rules);
const RULE_TYPES = rules.map((r) => r.shape.type.value);

function validateRule(rule) {
  const r = ruleSchema.safeParse(rule);
  if (r.success) return { ok: true, rule: r.data, errors: [] };
  const errors = r.error.issues.map((i) => ({ path: i.path.join('.') || 'type', message: i.message }));
  return { ok: false, errors };
}

// Which document category must be present for a rule to have anything to evaluate (drives the upload checklist).
function requiredDocType(rule) {
  if (!rule || typeof rule !== 'object') return null;
  switch (rule.type) {
    case 'document_present': case 'date_valid_on': case 'numeric_min': case 'count_min': return rule.docType || null;
    case 'declaration_present': return 'DECLARATION';
    case 'field_format': return rule.docType || null;
    default: return null; // consistency / registry rules draw on other documents' fields
  }
}
module.exports = { ruleSchema, validateRule, requiredDocType, RULE_TYPES };
