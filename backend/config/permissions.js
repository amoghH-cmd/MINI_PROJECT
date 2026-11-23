// Single source of truth for authorisation. Routes call requirePermission(action).
// Resource scoping (tender owner / assignee / bidder's own submission) is enforced
// separately in services, as the HLD requires ("checked in middleware and again in services").
const ROLES = Object.freeze({
  ADMIN: 'ADMIN',
  OFFICER: 'PROCUREMENT_OFFICER',
  REVIEWER: 'TEC_REVIEWER',
  BIDDER: 'BIDDER',
  AUDITOR: 'AUDITOR',
});
const { ADMIN, OFFICER, REVIEWER, BIDDER, AUDITOR } = ROLES;

const PERMISSIONS = Object.freeze({
  'user:manage': [ADMIN],
  'ruletemplate:manage': [ADMIN],
  'adapter:configure': [ADMIN],
  'job:monitor': [ADMIN],
  'config:view': [ADMIN],

  'tender:create': [OFFICER],
  'tender:update': [OFFICER],
  'tender:close': [OFFICER],
  'tender:assign': [OFFICER],
  'dashboard:officer': [OFFICER],
  'organization:manage': [BIDDER],
  'organization:read': [OFFICER, REVIEWER, AUDITOR],
  'submission:submit': [BIDDER],
  // Auditor deliberately excluded: bidder documents are confidential; auditors inspect decisions and reports.
  'document:read': [OFFICER, REVIEWER, BIDDER],
  'extraction:read': [OFFICER, REVIEWER],
  'tender:read': [OFFICER, REVIEWER, AUDITOR, BIDDER],
  'requirement:edit': [OFFICER],
  'requirement:approve': [OFFICER],
  'requirement:read': [OFFICER, REVIEWER, AUDITOR, BIDDER],

  'submission:create': [BIDDER],
  'submission:upload': [BIDDER],
  'submission:read': [OFFICER, REVIEWER, BIDDER, AUDITOR],
  'evaluation:run': [OFFICER],
  'check:read': [OFFICER, REVIEWER, AUDITOR],
  'check:override': [OFFICER],
  'comment:add': [OFFICER, REVIEWER],
  'recommendation:submit': [REVIEWER],
  'clarification:request': [OFFICER],
  'clarification:respond': [BIDDER],
  // Only a human procurement officer may record a final decision (HLD S12).
  'decision:record': [OFFICER],
  'report:generate': [OFFICER],
  'report:read': [OFFICER, REVIEWER, AUDITOR],

  'audit:read': [AUDITOR],
});

function can(role, action) {
  const allowed = PERMISSIONS[action];
  return Array.isArray(allowed) && allowed.includes(role);
}

module.exports = { ROLES, PERMISSIONS, can };
