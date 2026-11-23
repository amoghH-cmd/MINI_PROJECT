import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { getOpenTenders, getMySubmissions, getMyOrganisation } from '../../services/bidder.js';
import { apiError } from '../../services/api.js';
import { fmtDateTime, fmtInr } from '../../utils/format.js';
export default function BidderHome() {
 const [data,setData]=useState({tenders:[],submissions:[],org:null}); const [loading,setLoading]=useState(true);const [error,setError]=useState('');
 useEffect(()=>{let active=true;Promise.all([getOpenTenders(),getMySubmissions(),getMyOrganisation().catch(e=>e.response?.status===404?null:Promise.reject(e))]).then(([tenders,submissions,org])=>{if(active)setData({tenders,submissions,org});}).catch(e=>{if(active)setError(apiError(e).message);}).finally(()=>{if(active)setLoading(false);});return()=>{active=false};},[]);
 const existing=new Map(data.submissions.map(s=>[s.tenderId,s]));
 return <><h1 className="mb-3">Bidder workspace</h1><p className="mb-4 text-[13px]">Browse published tenders, prepare your supporting documents and track submissions.</p>
 {!data.org&&!loading&&!error&&<div className="panel p-4 mb-4 border-l-4 border-l-amber-600"><strong>Organisation registration required.</strong> <Link className="text-gov underline" to="organisation">Register your organisation</Link> before creating a bid.</div>}
 {error&&<p role="alert" className="field-error mb-3">{error}</p>}{loading&&<p role="status">Loading tender register…</p>}
 <Panel title="My bid submissions"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tender</th><th>Status</th><th>Submitted</th><th>Action</th></tr></thead><tbody>{data.submissions.map(s=><tr key={s.id}><td>{s.tenderNo} — {s.tenderTitle}</td><td><StatusBadge status={s.status}/></td><td>{s.submittedAt?fmtDateTime(s.submittedAt):'Not submitted'}</td><td><Link className="text-gov underline" to={`/bidder/submissions/${s.id}`}>View bid</Link></td></tr>)}{!data.submissions.length&&<tr><td colSpan="4">No bids created yet.</td></tr>}</tbody></table></div></Panel>
 <div className="mt-4"><Panel title="Open tenders"><div className="overflow-x-auto"><table className="tbl"><thead><tr><th>Tender number</th><th>Description</th><th>Estimated value</th><th>Deadline</th><th>Action</th></tr></thead><tbody>{data.tenders.filter(t=>t.acceptingSubmissions).map(t=><tr key={t.id}><td>{t.tenderNo}</td><td>{t.title}</td><td>{fmtInr(t.estimatedValue)}</td><td>{fmtDateTime(t.submissionDeadline)}</td><td>{existing.has(t.id)?<Link className="text-gov underline" to={`/bidder/submissions/${existing.get(t.id).id}`}>{existing.get(t.id).status === 'draft' ? 'Continue bid' : 'View bid'}</Link>:<Link className="text-gov underline" to={`/bidder/tenders/${t.id}`}>View tender</Link>}</td></tr>)}{!data.tenders.some(t=>t.acceptingSubmissions)&&<tr><td colSpan="5">No open tenders currently available.</td></tr>}</tbody></table></div></Panel></div></>;
}
