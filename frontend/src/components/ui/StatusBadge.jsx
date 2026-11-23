// Status is always colour + text label (never colour alone).
const STYLES = {
  // Compliance outcomes
  PASS: 'text-ok border-ok bg-[#EAF5EE]',
  FAIL: 'text-bad border-bad bg-[#FBEDED]',
  MISSING: 'text-[#7A2E2E] border-[#7A2E2E] bg-[#F6ECEC]',
  REVIEW: 'text-warn border-warn bg-[#FBF3E4]',
  WAIVED: 'text-[#46606F] border-[#46606F] bg-[#EDF1F4]',
  // Workflow / tender status
  DRAFT: 'text-muted border-[#9AA7B2] bg-white',
  REQUIREMENTS_REVIEW: 'text-warn border-warn bg-[#FBF3E4]',
  OPEN: 'text-gov border-gov bg-[#EAF1F7]',
  CLOSED: 'text-muted border-[#9AA7B2] bg-[#F3F5F7]',
  UNDER_EVALUATION: 'text-gov border-gov bg-[#EAF1F7]',
  EVALUATED: 'text-ok border-ok bg-[#EAF5EE]',
  // Submission status
  SUBMITTED: 'text-gov border-gov bg-[#EAF1F7]',
  UNDER_REVIEW: 'text-warn border-warn bg-[#FBF3E4]',
  DECIDED: 'text-ok border-ok bg-[#EAF5EE]',
  // Job / processing status
  QUEUED: 'text-muted border-[#9AA7B2] bg-white',
  PROCESSING: 'text-gov border-gov bg-[#EAF1F7]',
  RUNNING: 'text-gov border-gov bg-[#EAF1F7]',
  DONE: 'text-ok border-ok bg-[#EAF5EE]',
  FAILED: 'text-bad border-bad bg-[#FBEDED]',
  NEEDS_REVIEW: 'text-warn border-warn bg-[#FBF3E4]',
  // User status
  ACTIVE: 'text-ok border-ok bg-[#EAF5EE]',
  INACTIVE: 'text-muted border-[#9AA7B2] bg-[#F3F5F7]',
  // Consistency outcomes
  MATCH: 'text-ok border-ok bg-[#EAF5EE]',
  PROBABLE_MATCH: 'text-warn border-warn bg-[#FBF3E4]',
  MISMATCH: 'text-bad border-bad bg-[#FBEDED]',
  INSUFFICIENT_DATA: 'text-muted border-[#9AA7B2] bg-white',
  // Roles
  ADMIN: 'text-[#46606F] border-[#46606F] bg-[#EDF1F4]',
  PROCUREMENT_OFFICER: 'text-gov border-gov bg-[#EAF1F7]',
  TEC_REVIEWER: 'text-warn border-warn bg-[#FBF3E4]',
  BIDDER: 'text-muted border-[#9AA7B2] bg-white',
  AUDITOR: 'text-[#46606F] border-[#46606F] bg-[#EDF1F4]',
};

const LABELS = {
  REQUIREMENTS_REVIEW: 'Req. Review',
  UNDER_EVALUATION: 'Under Eval.',
  UNDER_REVIEW: 'Under Review',
  NEEDS_REVIEW: 'Needs Review',
  PROBABLE_MATCH: 'Probable Match',
  INSUFFICIENT_DATA: 'Insufficient Data',
  PROCUREMENT_OFFICER: 'Officer',
  TEC_REVIEWER: 'Reviewer',
};

export default function StatusBadge({ status, label }) {
  const key = String(status ?? '').toUpperCase().replace(/ /g, '_');
  const displayLabel = label || LABELS[key] || key.replace(/_/g, ' ');
  return (
    <span
      className={`status-badge ${STYLES[key] || STYLES.DRAFT}`}
      title={displayLabel}
    >
      {displayLabel}
    </span>
  );
}
