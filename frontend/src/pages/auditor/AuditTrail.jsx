import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import { api, apiError } from '../../services/api.js';
import { fmtDateTime, humanize } from '../../utils/format.js';

const ACTIONS = ['', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'USER_REGISTERED', 'TENDER_CREATED', 'TENDER_UPDATED', 'TENDER_CLOSED',
  'REQUIREMENTS_SAVED', 'REQUIREMENTS_APPROVED', 'SUBMISSION_CREATED', 'SUBMISSION_SUBMITTED',
  'DOCUMENT_UPLOADED', 'DOCUMENT_REPLACED', 'DOCUMENT_VIEWED'];

export default function AuditTrail() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filters, setFilters] = useState({ action: '', entity: '' });
  const [page, setPage] = useState(1);
  const [chainResult, setChainResult] = useState(null);
  const [verifying, setVerifying] = useState(false);
  const pageSize = 25;

  const load = (pg = page, selectedFilters = filters) => {
    setError('');
    setLoading(true);
    const params = { page: pg, pageSize };
    if (selectedFilters.action) params.action = selectedFilters.action;
    if (selectedFilters.entity) params.entity = selectedFilters.entity;
    api
      .get('/audit', { params })
      .then((r) => { setData(r.data); setPage(pg); })
      .catch((e) => setError(apiError(e).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const verifyChain = async () => {
    setVerifying(true);
    setChainResult(null);
    try {
      const r = await api.get('/audit/verify-chain');
      setChainResult(r.data);
    } catch (e) {
      setError(apiError(e).message);
    } finally {
      setVerifying(false);
    }
  };

  return (
    <>
      <h1 className="mb-3">Audit trail</h1>
      <p className="mb-4 text-[13px] text-muted">
        Hash-chained append-only log of all system events. Every entry is tamper-evident.
      </p>

      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <label className="field-label">
          Action
          <select className="field-input mt-1 w-48" value={filters.action} onChange={(e) => setFilters((f) => ({ ...f, action: e.target.value }))}>
            {ACTIONS.map((a) => <option key={a} value={a}>{a || '(all)'}</option>)}
          </select>
        </label>
        <label className="field-label">
          Entity
          <input className="field-input mt-1 w-40" placeholder="e.g. tender" value={filters.entity} onChange={(e) => setFilters((f) => ({ ...f, entity: e.target.value }))} />
        </label>
        <button className="btn-primary" onClick={() => load(1)}>Filter</button>
        <button className="btn-secondary" onClick={() => { const cleared = { action: '', entity: '' }; setFilters(cleared); load(1, cleared); }}>Clear</button>
        <button className="btn-secondary ml-auto" onClick={verifyChain} disabled={verifying}>
          {verifying ? 'Verifying…' : 'Verify chain integrity'}
        </button>
      </div>

      {chainResult && (
        <div className={`mb-4 px-3 py-2 rounded border text-[13px] ${chainResult.valid ? 'border-ok bg-[#EAF5EE] text-ok' : 'border-bad bg-[#FBEDED] text-bad'}`} role="status">
          Chain: {chainResult.valid ? `✓ Intact (${chainResult.checked} entries verified)` : `✗ BROKEN at sequence ${chainResult.brokenAtSeq}: ${chainResult.reason}`}
        </div>
      )}

      {error && <p role="alert" className="field-error mb-3">{error}</p>}

      <Panel title={`Audit entries (${data.total ?? 0})`}>
        {loading ? (
          <p className="p-4 text-[13px] text-muted" role="status">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>#</th>
                  <th>Timestamp</th>
                  <th>Action</th>
                  <th>Entity</th>
                  <th>Actor role</th>
                </tr>
              </thead>
              <tbody>
                {data.items?.map((e) => (
                  <tr key={e._id ?? e.seq}>
                    <td className="text-muted font-mono">{e.seq}</td>
                    <td className="whitespace-nowrap">{fmtDateTime(e.at)}</td>
                    <td className="font-medium">{humanize(e.action)}</td>
                    <td>{e.entity}{e.entityId ? <span className="block text-[11px] text-muted font-mono">{e.entityId}</span> : null}</td>
                    <td className="text-muted">{e.actorRole || '—'}</td>
                  </tr>
                ))}
                {!data.items?.length && (
                  <tr><td colSpan="5" className="text-muted text-center py-4">No audit entries found.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data.total > pageSize && (
          <div className="flex gap-2 items-center px-3 py-2 border-t border-line text-[13px]">
            <button className="btn-secondary !py-0.5" onClick={() => load(page - 1)} disabled={page === 1}>Prev</button>
            <span>Page {page} of {Math.ceil(data.total / pageSize)}</span>
            <button className="btn-secondary !py-0.5" onClick={() => load(page + 1)} disabled={page >= Math.ceil(data.total / pageSize)}>Next</button>
          </div>
        )}
      </Panel>
    </>
  );
}
