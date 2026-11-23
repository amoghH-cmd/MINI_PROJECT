// Role vocabulary mirrors backend/config/permissions.js.
export const ROLES = { ADMIN: 'ADMIN', OFFICER: 'PROCUREMENT_OFFICER', REVIEWER: 'TEC_REVIEWER', BIDDER: 'BIDDER', AUDITOR: 'AUDITOR' };

export const ROLE_META = {
  ADMIN: { label: 'Administrator', base: '/admin' },
  PROCUREMENT_OFFICER: { label: 'Procurement Officer', base: '/officer' },
  TEC_REVIEWER: { label: 'TEC Reviewer', base: '/reviewer' },
  BIDDER: { label: 'Bidder', base: '/bidder' },
  AUDITOR: { label: 'Auditor', base: '/auditor' },
};

// Every item here gets a route. `phase` says when the real screen lands; until then it renders an
// honest "not yet implemented" screen rather than a fake one.
export const NAV = {
  PROCUREMENT_OFFICER: [
    { to: '', label: 'Dashboard', ready: true },
    { to: 'tenders', label: 'Tenders', ready: true },
    { to: 'bidders', label: 'Bidders', ready: true },
    { to: 'evaluation', label: 'Compliance Matrix', phase: 6 },
    { to: 'evidence', label: 'Evidence Review', ready: true },
    { to: 'comparison', label: 'Comparison', phase: 7 },
    { to: 'clarifications', label: 'Clarifications', phase: 6 },
    { to: 'reports', label: 'Reports', phase: 7 },
  ],
  TEC_REVIEWER: [
    { to: '', label: 'Assigned Tenders', ready: true },
    { to: 'evidence', label: 'Evidence Review', ready: true },
    { to: 'recommendations', label: 'Recommendations', phase: 6 },
  ],
  BIDDER: [
    { to: '', label: 'My Tenders', ready: true },
    { to: 'organisation', label: 'Organisation Profile', ready: true },
    { to: 'clarifications', label: 'Clarifications', phase: 6 },
  ],
  AUDITOR: [
    { to: '', label: 'Audit Trail', ready: true },
    { to: 'reports', label: 'Reports', phase: 7 },
    { to: 'rules', label: 'Rule Versions', phase: 7 },
  ],
  ADMIN: [
    { to: '', label: 'Users and Roles', ready: true },
    { to: 'templates', label: 'Rule Templates', phase: 7 },
    { to: 'adapters', label: 'Verification Adapters', phase: 7 },
    { to: 'jobs', label: 'Processing Jobs', ready: true },
    { to: 'config', label: 'System Configuration', phase: 7 },
  ],
};
