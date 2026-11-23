// Document categories (HLD FR08). Labels are what officers and bidders see.
const DOC_TYPES = Object.freeze({
  GST_CERTIFICATE: 'GST registration certificate',
  PAN_CARD: 'PAN card',
  INCORPORATION_CERTIFICATE: 'Incorporation / registration certificate',
  UDYAM_CERTIFICATE: 'Udyam / MSME certificate',
  FINANCIAL_STATEMENT: 'Audited financial statements',
  TURNOVER_CERTIFICATE: 'Turnover certificate (CA)',
  EXPERIENCE_LETTER: 'Experience / work order / completion certificate',
  DECLARATION: 'Required declaration',
  OTHER: 'Other tender-specific document',
});
module.exports = { DOC_TYPES, DOC_TYPE_KEYS: Object.keys(DOC_TYPES) };
