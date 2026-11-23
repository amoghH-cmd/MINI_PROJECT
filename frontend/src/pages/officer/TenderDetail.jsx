import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import RequirementEditor from './RequirementEditor.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { assignReviewers, closeTender, getTender, listReviewers, openTenderFile } from '../../services/tenders.js';
import { apiError } from '../../services/api.js';
import { fmtDateTime, fmtInr } from '../../utils/format.js';

const Row = ({ k, children }) => (<div className="grid sm:grid-cols-[140px_minmax(0,1fr)] gap-2 py-1 border-b border-line last:border-0"><dt className="text-muted">{k}</dt><dd>{children}</dd></div>);

export default function TenderDetail() {
  const { id } = useParams();
  const t = useAsync(() => getTender(id), [id]);
  const rv = useAsync(listReviewers, []);
  const [sel, setSel] = useState([]);
  const [note, setNote] = useState(null);
  const [confirmClose, setConfirmClose] = useState(false);
  useEffect(() => { if (t.data) setSel(t.data.assignedReviewerIds || []); }, [t.data]);

  const run = async (fn, ok) => { setNote(null); try { await fn(); setNote({ kind: 'ok', text: ok }); await t.reload(); } catch (e) { setNote({ kind: 'err', text: apiError(e).message }); } };
  const tender = t.data;
  const editableStatus = tender && ['draft', 'requirements_review', 'open'].includes(tender.status);
  const hasBids = tender?.submissionCount > 0;
  const lockedReason = tender && !editableStatus ? 'The tender has closed; requirements can no longer be changed.' : hasBids ? 'Requirements are frozen because bids have been received.' : null;

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: '/officer' }, { label: 'Tenders', to: '/officer/tenders' }, { label: tender?.tenderNo || 'Tender' }]} />
      {t.loading && !tender && <p role="status" className="text-[13px] text-muted">Loading tender…</p>}
      {t.error && <p role="alert" className="text-[13px] text-bad">{t.error}</p>}
      {tender && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-3"><h1>{tender.title}</h1><StatusBadge status={tender.status} /></div>
          {note && <p role={note.kind === 'err' ? 'alert' : 'status'} className={`mb-3 text-[13px] px-3 py-2 rounded border ${note.kind === 'err' ? 'border-bad bg-[#FBEDED] text-bad' : 'border-ok bg-[#EAF5EE] text-ok'}`}>{note.text}</p>}
          <div className="grid lg:grid-cols-[3fr_2fr] gap-4 items-start">
            <div className="space-y-4">
              <Panel title="Tender details" actions={tender.hasFile && <button className="btn-secondary !py-0.5" onClick={() => openTenderFile(id).catch((e) => setNote({ kind: 'err', text: apiError(e).message }))}>Open NIT/ATC PDF</button>}>
                <dl className="p-3 text-[13px]">
                  <Row k="Tender number">{tender.tenderNo}</Row>
                  {tender.gemBidNo && <Row k="GeM bid number">{tender.gemBidNo}</Row>}
                  <Row k="Department">{tender.department}</Row>
                  <Row k="Estimated value">{fmtInr(tender.estimatedValue)}</Row>
                  <Row k="Submission deadline">{fmtDateTime(tender.submissionDeadline)}</Row>
                  <Row k="Bid opening">{fmtDateTime(tender.bidOpeningDate)}</Row>
                  <Row k="Bids received">{tender.submissionCount ?? 0} <Link className="text-gov-link ml-2" to={`/officer/evidence?tender=${id}`}>Review submitted bids</Link></Row>
                  <Row k="Document SHA-256"><span className="font-mono text-[11px] break-all">{tender.fileSha256}</span></Row>
                  {tender.description && <Row k="Description">{tender.description}</Row>}
                </dl>
              </Panel>
              <RequirementEditor tenderId={id} canEdit={editableStatus && !hasBids} lockedReason={lockedReason} onChanged={t.reload} />
            </div>
            <div className="space-y-4">
              <Panel title="Processing jobs" actions={<button className="btn-secondary" disabled={t.loading} onClick={t.reload}>Refresh</button>}>
                {tender.jobs?.length ? (
                  <div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Job</th><th>Status</th><th>Tries</th></tr></thead><tbody>
                    {tender.jobs.map((j) => (<tr key={j.id}><td>{j.type.replace(/_/g, ' ')}{j.lastError && <div className="text-[12px] text-bad">{j.lastError}</div>}</td><td><StatusBadge status={j.status} /></td><td>{j.attempts}</td></tr>))}
                  </tbody></table></div>
                ) : <p className="p-3 text-[13px] text-muted">No jobs.</p>}
              </Panel>
              <Panel title="TEC reviewers">
                <div className="p-3 text-[13px] space-y-2">
                  {rv.loading && <p className="text-muted">Loading…</p>}
                  {rv.data?.length === 0 && <p className="text-muted">No active TEC reviewers exist.</p>}
                  {rv.data?.map((u) => (
                    <label key={u.id} className="flex gap-2 items-start"><input type="checkbox" className="mt-1" checked={sel.includes(u.id)} onChange={(e) => setSel(e.target.checked ? [...sel, u.id] : sel.filter((x) => x !== u.id))} /><span>{u.name}<span className="block text-[12px] text-muted">{[u.designation, u.department].filter(Boolean).join(', ')}</span></span></label>
                  ))}
                  {rv.data?.length > 0 && <button className="btn-secondary" onClick={() => run(() => assignReviewers(id, sel), 'Reviewer assignment saved.')}>Save assignment</button>}
                  <p className="text-[12px] text-muted">Reviewers see bidder files only after the tender is closed.</p>
                </div>
              </Panel>
              <Panel title="Tender status">
                <div className="p-3 text-[13px] space-y-2">
                  {tender.status === 'open' ? (
                    confirmClose ? (
                      <div role="alertdialog" aria-label="Confirm close" className="border border-warn bg-[#FBF3E4] p-3 space-y-2"><p>Close this tender? Bidders can no longer submit or change documents.</p>
                        <div className="flex gap-2"><button className="btn-primary" onClick={() => { setConfirmClose(false); run(() => closeTender(id), 'Tender closed.'); }}>Close tender</button><button className="btn-secondary" onClick={() => setConfirmClose(false)}>Cancel</button></div></div>
                    ) : <button className="btn-secondary" onClick={() => setConfirmClose(true)}>Close tender…</button>
                  ) : <p className="text-muted">{tender.status === 'closed' ? 'Closed to submissions.' : 'The tender opens to bidders when a requirement version is approved.'}</p>}
                </div>
              </Panel>
            </div>
          </div>
        </>
      )}
    </>
  );
}
