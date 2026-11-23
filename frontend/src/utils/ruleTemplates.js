// Starting points for the JSON rule editor. The backend validates the final JSON at approval.
export const RULE_TEMPLATES = {
  document_present: { type: 'document_present', docType: 'GST_CERTIFICATE' },
  field_format: { type: 'field_format', field: 'gstin' },
  date_valid_on: { type: 'date_valid_on', docType: 'UDYAM_CERTIFICATE', dateField: 'valid_upto', onDate: 'bid_opening_date' },
  numeric_min: { type: 'numeric_min', docType: 'FINANCIAL_STATEMENT', field: 'turnover', min: 2, unit: 'INR_CRORE', years: 3, aggregate: 'average' },
  count_min: { type: 'count_min', docType: 'EXPERIENCE_LETTER', minCount: 2, minValue: 5000000, sinceYears: 5 },
  declaration_present: { type: 'declaration_present', declarationCode: 'LAND_BORDER_144XI' },
  cross_doc_consistency: { type: 'cross_doc_consistency', fields: ['legal_name', 'pan'], minScore: 90 },
  registry_verified: { type: 'registry_verified', registry: 'GST' },
};
export const REQ_TYPES = ['DOCUMENT', 'IDENTITY', 'VALIDITY', 'FINANCIAL', 'EXPERIENCE', 'DECLARATION', 'CONSISTENCY', 'REGISTRATION'];
