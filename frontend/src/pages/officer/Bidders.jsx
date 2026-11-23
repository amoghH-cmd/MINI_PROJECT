import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { api } from '../../services/api.js';
import { apiError } from '../../services/api.js';
import { fmtDateTime, fmtInr } from '../../utils/format.js';

export default function Bidders() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [page, setPage] = useState(1);
  const pageSize = 25;

  useEffect(() => {
    setLoading(true);
    api
      .get('/organizations', { params: { page, pageSize } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e).message))
      .finally(() => setLoading(false));
  }, [page]);

  return (
    <>
      <h1 className="mb-3">Bidder register</h1>
      <p className="mb-4 text-[13px] text-muted">
        Organisations that have submitted bids to your tenders. Qualification decisions are made separately after tender closure.
      </p>
      {error && <p role="alert" className="field-error mb-3">{error}</p>}
      <Panel title={`Organisations (${data.total ?? 0})`}>
        {loading ? (
          <p className="p-4 text-[13px] text-muted" role="status">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Legal name</th>
                  <th>GSTIN</th>
                  <th>Type</th>
                  <th>Registered</th>
                </tr>
              </thead>
              <tbody>
                {data.items?.map((o) => (
                  <tr key={o.id}>
                    <td>{o.legalName}</td>
                    <td className="font-mono text-[12px]">{o.gstin}</td>
                    <td>{o.type?.replace(/_/g, ' ')}</td>
                    <td>{fmtDateTime(o.createdAt)}</td>
                  </tr>
                ))}
                {!data.items?.length && (
                  <tr>
                    <td colSpan="4" className="text-muted text-center py-4">
                      No bidder organisations found for your tenders.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        {data.total > pageSize && (
          <div className="flex gap-2 items-center px-3 py-2 border-t border-line text-[13px]">
            <button className="btn-secondary !py-0.5" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>Prev</button>
            <span>Page {page} of {Math.ceil(data.total / pageSize)}</span>
            <button className="btn-secondary !py-0.5" onClick={() => setPage((p) => p + 1)} disabled={page >= Math.ceil(data.total / pageSize)}>Next</button>
          </div>
        )}
      </Panel>
    </>
  );
}
