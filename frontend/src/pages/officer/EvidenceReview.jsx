import { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileSearch, RefreshCw } from 'lucide-react';
import Panel from '../../components/ui/Panel.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { api, apiError } from '../../services/api.js';
import { listTenders } from '../../services/tenders.js';
import { fmtDateTime, humanize } from '../../utils/format.js';

const fetchData = (path, params) => api.get(path, { params }).then(({ data }) => data);

function Feedback({ request, label }) {
  if (request.loading) return <p className="p-4 text-muted" role="status">Loading {label}…</p>;
  if (request.error) return <p className="p-4 text-bad" role="alert">{request.error} <button className="text-gov-link" onClick={request.reload}>Retry</button></p>;
  return null;
}

function DocumentEvidence({ document }) {
  const request = useAsync(() => fetchData(`/documents/${document.id}/fields`), [document.id]);
  const [fileError, setFileError] = useState('');
  const [opening, setOpening] = useState(false);

  async function openFile() {
    setFileError('');
    const tab = window.open('about:blank', '_blank');
    if (!tab) {
      setFileError('Allow pop-ups for this site to open the document.');
      return;
    }
    tab.opener = null;
    setOpening(true);
    try {
      const { data } = await api.get(`/documents/${document.id}/file`, { responseType: 'blob' });
      const url = URL.createObjectURL(data);
      tab.location.replace(url);
      setTimeout(() => URL.revokeObjectURL(url), 60000);
    } catch (error) {
      tab.close();
      setFileError(apiError(error).message);
    } finally {
      setOpening(false);
    }
  }

  const { fields = [], document: details } = request.data || {};
  return (
    <Panel title="Extracted fields" actions={<button className="btn-secondary" disabled={opening} onClick={openFile}>{opening ? 'Opening…' : 'Open original'}</button>}>
      <div className="p-4 border-b border-line flex flex-wrap items-center gap-3">
        <FileSearch size={19} className="text-gov" aria-hidden="true" />
        <strong className="break-all">{document.originalName}</strong>
        <StatusBadge status={details?.processingStatus ?? document.processingStatus} />
        {details?.docType && <span className="text-muted">{humanize(details.docType)}</span>}
        <button className="ml-auto btn-secondary" onClick={request.reload} aria-label="Refresh extracted fields"><RefreshCw size={15} aria-hidden="true" /></button>
      </div>
      {fileError && <p className="p-4 text-bad" role="alert">{fileError}</p>}
      <Feedback request={request} label="extracted fields" />
      {request.data && !request.loading && (fields.length ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Field</th><th>Extracted value</th><th>Page</th><th>Confidence</th></tr></thead>
            <tbody>{fields.map((field) => (
              <tr key={field.id}>
                <th scope="row">{humanize(field.fieldName)}</th>
                <td className="break-words max-w-xs">{String(field.rawValue ?? field.normalizedValue ?? '—')}</td>
                <td>{field.page ?? '—'}</td>
                <td>{field.confidence == null ? '—' : `${Math.round(field.confidence * 100)}%`}</td>
              </tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="p-4 text-muted">{details.processing?.error?.message || 'No extracted fields are available for this document yet.'}</p>)}
    </Panel>
  );
}

function ConsistencyFindings({ id }) {
  const request = useAsync(() => fetchData(`/submissions/${id}/verifications`), [id]);

  return (
    <Panel title="Cross-document checks" actions={<button className="btn-secondary" disabled={request.loading} onClick={request.reload}>Refresh</button>}>
      <Feedback request={request} label="cross-document checks" />
      {!request.loading && request.data && (request.data.items.length ? (
        <div className="overflow-x-auto">
          <table className="tbl">
            <thead><tr><th>Field</th><th>Result</th><th>Explanation</th></tr></thead>
            <tbody>{request.data.items.map((item) => (
              <tr key={item.id}><td>{humanize(item.subtype)}</td><td><StatusBadge status={item.outcome} /></td><td>{item.details?.explanation || '—'}</td></tr>
            ))}</tbody>
          </table>
        </div>
      ) : <p className="p-4 text-muted">No cross-document checks are available for this bid yet.</p>)}
    </Panel>
  );
}

function SubmissionEvidence({ id }) {
  const request = useAsync(() => fetchData(`/submissions/${id}`).then((data) => data.submission), [id]);
  const [documentId, setDocumentId] = useState('');
  if (request.loading || request.error) return <Feedback request={request} label="submission" />;
  if (!request.data) return null;
  if (!request.data.documentsVisible) return <p className="panel p-4 text-muted">Documents become available to reviewers after the tender closes.</p>;
  const documents = request.data.documents.filter((document) => !document.superseded);
  const selected = documents.find((document) => document.id === documentId) ?? documents[0];
  return (
    <div className="space-y-4">
      <Panel title="Submitted documents">
        {documents.length ? (
          <div className="p-4">
            <label className="field-label" htmlFor="evidence-document">Document</label>
            <select className="field-input" id="evidence-document" value={selected.id} onChange={(event) => setDocumentId(event.target.value)}>
              {documents.map((document) => <option key={document.id} value={document.id}>{document.originalName}</option>)}
            </select>
          </div>
        ) : <p className="p-4 text-muted">No documents are available for this bid.</p>}
      </Panel>
      {selected && <DocumentEvidence key={selected.id} document={selected} />}
      <ConsistencyFindings id={id} />
    </div>
  );
}

function TenderSubmissions({ id }) {
  const [page, setPage] = useState(1);
  const [submissionId, setSubmissionId] = useState('');
  const request = useAsync(() => fetchData('/submissions', { tenderId: id, page, pageSize: 25 }), [id, page]);
  const items = request.data?.items ?? [];
  const pageCount = Math.ceil((request.data?.total ?? 0) / 25);
  return (
    <div className="space-y-4">
      <Panel title="Submitted bids">
        <Feedback request={request} label="bids" />
        {!request.loading && request.data && (items.length ? (
          <div className="overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Bidder</th><th>Submitted</th><th>Status</th><th>Evidence</th></tr></thead>
              <tbody>{items.map((bid) => (
                <tr key={bid.id}>
                  <td>{bid.organization?.legalName ?? 'Organisation unavailable'}</td>
                  <td>{bid.submittedAt ? fmtDateTime(bid.submittedAt) : '—'}</td>
                  <td><StatusBadge status={bid.status} /></td>
                  <td><button className={submissionId === bid.id ? 'btn-primary' : 'btn-secondary'} aria-pressed={submissionId === bid.id} onClick={() => setSubmissionId(bid.id)}>View evidence</button></td>
                </tr>
              ))}</tbody>
            </table>
          </div>
        ) : <p className="p-4 text-muted">No bids have been submitted for this tender.</p>)}
        {pageCount > 1 && <div className="p-3 flex items-center gap-3">
          <button className="btn-secondary" disabled={request.loading || page === 1} onClick={() => { setSubmissionId(''); setPage(page - 1); }}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button className="btn-secondary" disabled={request.loading || page >= pageCount} onClick={() => { setSubmissionId(''); setPage(page + 1); }}>Next</button>
        </div>}
      </Panel>
      {submissionId && <SubmissionEvidence key={submissionId} id={submissionId} />}
    </div>
  );
}

export default function EvidenceReview() {
  const [params, setParams] = useSearchParams();
  const tenderId = params.get('tender') || '';
  const [page, setPage] = useState(1);
  const tenders = useAsync(() => listTenders({ page, pageSize: 25 }), [page]);
  const pageCount = Math.ceil((tenders.data?.total ?? 0) / 25);
  return (
    <div className="space-y-4">
      <div><h1>Evidence review</h1><p className="text-muted mt-1">Inspect submitted documents and compare extracted values against the originals.</p></div>
      <Panel title="Tenders" actions={tenderId && <button className="btn-secondary" onClick={() => setParams({})}>Clear selection</button>}>
        <Feedback request={tenders} label="tenders" />
        {!tenders.loading && tenders.data && (tenders.data.items.length ? (
          <div className="p-4 flex flex-wrap items-center gap-2">
            {tenders.data.items.map((tender) => (
              <button key={tender.id} className={tenderId === tender.id ? 'btn-primary' : 'btn-secondary'} title={tender.title}
                aria-pressed={tenderId === tender.id} onClick={() => setParams({ tender: tender.id })}>{tender.tenderNo}</button>
            ))}
          </div>
        ) : <p className="p-4 text-muted">No tenders are available.</p>)}
        {pageCount > 1 && <div className="px-4 pb-4 flex items-center gap-3">
          <button className="btn-secondary" disabled={tenders.loading || page <= 1} onClick={() => setPage(page - 1)}>Previous</button>
          <span>Page {page} of {pageCount}</span>
          <button className="btn-secondary" disabled={tenders.loading || page >= pageCount} onClick={() => setPage(page + 1)}>Next</button>
        </div>}
      </Panel>
      {tenderId && <TenderSubmissions key={tenderId} id={tenderId} />}
    </div>
  );
}
