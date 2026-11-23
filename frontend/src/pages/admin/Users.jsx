import { useEffect, useState } from 'react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { api, apiError } from '../../services/api.js';
import { fmtDateTime } from '../../utils/format.js';

const ROLES = ['ADMIN', 'PROCUREMENT_OFFICER', 'TEC_REVIEWER', 'BIDDER', 'AUDITOR'];

export default function Users() {
  const [data, setData] = useState({ items: [], total: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [page, setPage] = useState(1);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'PROCUREMENT_OFFICER', designation: '', department: '' });
  const [busy, setBusy] = useState(false);
  const pageSize = 25;

  const load = (pg = page) => {
    setLoading(true);
    api.get('/admin/users', { params: { page: pg, pageSize } })
      .then((r) => { setData(r.data); setPage(pg); })
      .catch((e) => setError(apiError(e).message))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(1); }, []);

  const createUser = async (e) => {
    e.preventDefault();
    setBusy(true); setError(''); setMsg('');
    try {
      await api.post('/admin/users', form);
      setMsg(`User ${form.email} created.`);
      setForm({ name: '', email: '', password: '', role: 'PROCUREMENT_OFFICER', designation: '', department: '' });
      setCreating(false);
      load(1);
    } catch (err) {
      setError(apiError(err).message);
    } finally { setBusy(false); }
  };

  const toggleActive = async (id, active) => {
    try {
      await api.patch(`/admin/users/${id}`, { active: !active });
      load(page);
    } catch (err) { setError(apiError(err).message); }
  };

  return (
    <>
      <h1 className="mb-3">Users &amp; roles</h1>
      <p className="mb-4 text-[13px] text-muted">
        Manage staff accounts. Bidder self-registration is handled through the public registration endpoint.
        Never share admin credentials.
      </p>

      {error && <p role="alert" className="field-error mb-3">{error}</p>}
      {msg && <p role="status" className="mb-3 text-[13px] text-ok">{msg}</p>}

      <div className="mb-4">
        {creating ? (
          <Panel title="Create staff account">
            <form onSubmit={createUser} className="p-4 max-w-[640px] space-y-3">
              <div className="grid sm:grid-cols-2 gap-3">
                {[['name', 'Full name'], ['email', 'Email address'], ['password', 'Temporary password'], ['designation', 'Designation'], ['department', 'Department']].map(([k, l]) => (
                  <label key={k} className="field-label">{l}
                    <input type={k === 'password' ? 'password' : 'text'} className="field-input mt-1" required={['name', 'email', 'password'].includes(k)}
                      value={form[k]} onChange={(e) => setForm((f) => ({ ...f, [k]: e.target.value }))} />
                  </label>
                ))}
                <label className="field-label">Role
                  <select className="field-input mt-1" value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value }))}>
                    {ROLES.filter((r) => r !== 'BIDDER').map((r) => <option key={r} value={r}>{r.replace(/_/g, ' ')}</option>)}
                  </select>
                </label>
              </div>
              <div className="flex gap-2">
                <button type="submit" className="btn-primary" disabled={busy}>{busy ? 'Creating…' : 'Create account'}</button>
                <button type="button" className="btn-secondary" onClick={() => setCreating(false)}>Cancel</button>
              </div>
            </form>
          </Panel>
        ) : (
          <button className="btn-primary" onClick={() => setCreating(true)}>+ Create staff account</button>
        )}
      </div>

      <Panel title={`Users (${data.total ?? 0})`}>
        {loading ? (
          <p className="p-4 text-[13px] text-muted" role="status">Loading…</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Designation</th>
                  <th>Status</th>
                  <th>Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items?.map((u) => (
                  <tr key={u.id}>
                    <td>{u.name}</td>
                    <td className="text-[12px]">{u.email}</td>
                    <td><StatusBadge status={u.role} /></td>
                    <td className="text-muted">{[u.designation, u.department].filter(Boolean).join(', ') || '—'}</td>
                    <td><StatusBadge status={u.active ? 'ACTIVE' : 'INACTIVE'} /></td>
                    <td>
                      <button className={u.active ? 'btn-danger !py-0.5' : 'btn-secondary !py-0.5'}
                        onClick={() => toggleActive(u.id, u.active)}>
                        {u.active ? 'Deactivate' : 'Activate'}
                      </button>
                    </td>
                  </tr>
                ))}
                {!data.items?.length && (
                  <tr><td colSpan="6" className="text-muted text-center py-4">No users found.</td></tr>
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
