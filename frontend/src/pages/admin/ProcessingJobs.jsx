import { useState } from 'react';
import { RefreshCw } from 'lucide-react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { api } from '../../services/api.js';
import { fmtDateTime, humanize } from '../../utils/format.js';

const PAGE_SIZE = 25;
const TYPES = ['extract_requirements', 'process_document', 'consistency', 'evaluate', 'build_report'];
const STATUSES = ['queued', 'running', 'done', 'failed'];

export default function ProcessingJobs() {
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState('');
  const [type, setType] = useState('');
  const { data, loading, error, reload } = useAsync(() => api.get('/admin/jobs', {
    params: { page, pageSize: PAGE_SIZE, status: status || undefined, type: type || undefined },
  }).then(({ data }) => data), [page, status, type]);
  const pages = Math.ceil((data?.total ?? 0) / PAGE_SIZE);

  return (
    <section className="space-y-4">
      <div><h1>Processing jobs</h1><p className="text-muted mt-1">Monitor background work and inspect failed jobs.</p></div>
      <Panel title={data ? `Job queue (${data.total})` : 'Job queue'} actions={<button className="btn-secondary" disabled={loading} onClick={reload}><RefreshCw size={15} aria-hidden="true" /> Refresh</button>}>
        <div className="p-4 border-b border-line flex flex-wrap gap-4">
          <label className="field-label">Status
            <select className="field-input mt-1" value={status} onChange={(event) => { setPage(1); setStatus(event.target.value); }}>
              <option value="">All statuses</option>
              {STATUSES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
          </label>
          <label className="field-label">Job type
            <select className="field-input mt-1" value={type} onChange={(event) => { setPage(1); setType(event.target.value); }}>
              <option value="">All types</option>
              {TYPES.map((item) => <option key={item} value={item}>{humanize(item)}</option>)}
            </select>
          </label>
        </div>
        {loading && <p className="p-4 text-muted" role="status">Loading jobs…</p>}
        {error && <p className="p-4 text-bad" role="alert">{error}</p>}
        {!loading && data && (data.items.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Job</th><th>Status</th><th>Attempts</th><th>Updated</th><th>Last error</th></tr></thead>
              <tbody>{data.items.map((job) => (
                <tr key={job._id}>
                  <td>{humanize(job.type)}</td><td><StatusBadge status={job.status} /></td>
                  <td>{job.attempts} / {job.maxAttempts}</td><td>{fmtDateTime(job.updatedAt)}</td>
                  <td className="max-w-sm break-words">{job.lastError || '—'}</td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="p-4 text-muted">No jobs match these filters.</p>)}
        {(pages > 1 || page > 1) && <div className="p-3 flex items-center gap-3">
          <button className="btn-secondary" disabled={loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page}{pages >= page ? ` of ${pages}` : ''}</span>
          <button className="btn-secondary" disabled={loading || page >= pages} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </Panel>
    </section>
  );
}
