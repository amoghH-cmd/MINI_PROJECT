import { useState } from 'react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { listTenders } from '../../services/tenders.js';
import { fmtDateTime, fmtInr } from '../../utils/format.js';

const STATUSES = ['draft', 'requirements_review', 'open', 'closed', 'under_evaluation', 'evaluated'];

export default function Tenders() {
  const [q, setQ] = useState(''); const [status, setStatus] = useState('');
  const [applied, setApplied] = useState({});
  const { loading, data, error } = useAsync(() => listTenders({ pageSize: 100, ...applied }), [applied]);
  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: '/officer' }, { label: 'Tenders' }]} />
      <h1 className="mb-3">Tenders</h1>
      <Panel title="Tender register" actions={<Link to="new" className="btn-primary !py-0.5">Create tender</Link>}>
        <form className="flex flex-wrap gap-2 items-end p-3 border-b border-line" onSubmit={(e) => { e.preventDefault(); setApplied({ q: q || undefined, status: status || undefined }); }}>
          <div><label htmlFor="q" className="field-label">Search</label><input id="q" className="field-input w-64" placeholder="Tender no. or title" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div><label htmlFor="st" className="field-label">Status</label>
            <select id="st" className="field-input" value={status} onChange={(e) => setStatus(e.target.value)}><option value="">All</option>{STATUSES.map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}</select></div>
          <button className="btn-secondary">Apply</button>
          <button type="button" className="btn-secondary" onClick={() => { setQ(''); setStatus(''); setApplied({}); }}>Reset</button>
        </form>
        <DataTable caption="Tenders" loading={loading} error={error} rows={data?.items || []} empty="No tenders match. Use “Create tender” to add one." columns={[
          { key: 'tenderNo', header: 'Tender no.', render: (t) => <Link className="text-gov underline font-medium" to={t.id}>{t.tenderNo}</Link> },
          { key: 'title', header: 'Title' },
          { key: 'status', header: 'Status', render: (t) => <StatusBadge status={t.status} /> },
          { key: 'estimatedValue', header: 'Estimated value', className: 'text-right whitespace-nowrap', render: (t) => fmtInr(t.estimatedValue) },
          { key: 'submissionDeadline', header: 'Submission deadline', className: 'whitespace-nowrap', render: (t) => fmtDateTime(t.submissionDeadline) },
        ]} />
        {data && <div className="px-3 py-2 text-[12px] text-muted border-t border-line">{data.total} tender(s)</div>}
      </Panel>
    </>
  );
}
