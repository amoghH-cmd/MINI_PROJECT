import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { api, apiError } from '../../services/api.js';
import { fmtDateTime, fmtInr } from '../../utils/format.js';

export default function AssignedTenders() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    api
      .get('/tenders', { params: { pageSize: 100 } })
      .then((r) => setData(r.data))
      .catch((e) => setError(apiError(e).message))
      .finally(() => setLoading(false));
  }, []);

  return (
    <>
      <h1 className="mb-3">Assigned tenders</h1>
      <p className="mb-4 text-[13px] text-muted">
        Tenders assigned to you for technical evaluation. Documents become visible after a tender closes.
      </p>
      {error && <p role="alert" className="field-error mb-3">{error}</p>}
      <Panel title={`Tenders (${data.total ?? 0})`}>
        {loading ? (
          <p className="p-4 text-[13px] text-muted" role="status">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Tender number</th>
                  <th>Title</th>
                  <th>Department</th>
                  <th>Status</th>
                  <th>Deadline</th>
                  <th>Evidence</th>
                </tr>
              </thead>
              <tbody>
                {data.items?.map((t) => (
                  <tr key={t.id}>
                    <td className="font-mono text-[12px]">{t.tenderNo}</td>
                    <td>{t.title}</td>
                    <td>{t.department}</td>
                    <td><StatusBadge status={t.status} /></td>
                    <td>{fmtDateTime(t.submissionDeadline)}</td>
                    <td>{['closed', 'under_evaluation', 'evaluated'].includes(t.status) ? <Link className="text-gov-link" to={`/reviewer/evidence?tender=${t.id}`}>Review evidence</Link> : <span className="text-muted">Available after close</span>}</td>
                  </tr>
                ))}
                {!data.items?.length && (
                  <tr>
                    <td colSpan="6" className="text-muted text-center py-4">
                      No tenders have been assigned to you yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        )}
      </Panel>
    </>
  );
}
