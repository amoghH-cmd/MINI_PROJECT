import { useEffect,useState } from 'react';
import { useNavigate,useParams,Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import { getTender,getRequirements } from '../../services/tenders.js';
import { createSubmission } from '../../services/bidder.js';
import { apiError } from '../../services/api.js';
import { fmtDateTime } from '../../utils/format.js';
export default function BidTender(){const {id}=useParams(),nav=useNavigate();const [t,setT]=useState(null),[req,setReq]=useState([]),[error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{Promise.all([getTender(id),getRequirements(id)]).then(([t,r])=>{setT(t);setReq(r.items||r.requirements||[])}).catch(e=>setError(apiError(e).message))},[id]);
 const start=async()=>{setBusy(true);setError('');try{const s=await createSubmission(id);nav(`/bidder/submissions/${s.id}`)}catch(e){setError(apiError(e).message)}finally{setBusy(false)}};
 return <><p className="mb-3"><Link to="/bidder" className="text-gov underline">Bidder workspace</Link> / Tender details</p><h1 className="mb-3">{t?.title||'Tender details'}</h1>{error&&<p role="alert" className="field-error mb-3">{error}</p>}{t&&<><Panel title="Tender notice"><dl className="grid sm:grid-cols-2 gap-3 p-4 text-[13px]"><div><dt className="text-muted">Tender number</dt><dd>{t.tenderNo}</dd></div><div><dt className="text-muted">Department</dt><dd>{t.department}</dd></div><div><dt className="text-muted">Deadline</dt><dd>{fmtDateTime(t.submissionDeadline)}</dd></div><div><dt className="text-muted">Status</dt><dd>{t.status}</dd></div></dl></Panel><div className="mt-4"><Panel title="Approved eligibility requirements"><div className="p-4 text-[13px]">{req.length?req.map(r=><p key={r.id||r.code} className="border-b border-line py-2"><strong>{r.code}</strong> — {r.description}{r.mandatory?' (Mandatory)':''}</p>):'No approved requirements were returned.'}</div></Panel></div><button className="btn-primary mt-4" onClick={start} disabled={busy||!t.acceptingSubmissions}>{busy?'Creating…':'Start bid submission'}</button>{!t.acceptingSubmissions && <p className="text-muted mt-2">This tender is closed to new submissions.</p>}</>}</>;
}
