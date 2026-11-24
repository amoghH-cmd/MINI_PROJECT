import { useEffect, useState } from 'react';
import { Plus, Search } from 'lucide-react';
import { Link, useSearchParams } from 'react-router-dom';
import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';
import DataTable from '../../components/ui/DataTable.jsx';
import StatusBadge from '../../components/ui/StatusBadge.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { listTenders } from '../../services/tenders.js';
import { fmtDateTime, fmtInr, humanize } from '../../utils/format.js';

const STATUSES = ['draft', 'requirements_review', 'open', 'closed', 'under_evaluation', 'evaluated'];
const PAGE_SIZE = 10;
const COLUMNS = [
  { key: 'tenderNo', header: 'Tender no.', render: (tender) => <Link className="text-gov-link whitespace-nowrap" to={tender.id}>{tender.tenderNo}</Link> },
  { key: 'title', header: 'Title' },
  { key: 'status', header: 'Status', render: (tender) => <StatusBadge status={tender.status} /> },
  { key: 'estimatedValue', header: 'Estimated value', className: 'text-right whitespace-nowrap', render: (tender) => fmtInr(tender.estimatedValue) },
  { key: 'submissionDeadline', header: 'Submission deadline', className: 'whitespace-nowrap', render: (tender) => fmtDateTime(tender.submissionDeadline) },
];

export default function Tenders() {
  const [params, setParams] = useSearchParams();
  const search = (params.get('q') ?? '').slice(0, 100);
  const query = search.trim();
  const status = STATUSES.includes(params.get('status')) ? params.get('status') : '';
  const requestedPage = Number(params.get('page'));
  const page = Number.isSafeInteger(requestedPage) && requestedPage > 0 ? requestedPage : 1;
  const [debouncedQuery, setDebouncedQuery] = useState(query);

  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 300);
    return () => clearTimeout(timer);
  }, [query]);

  const { loading, data, error, reload } = useAsync(
    () => listTenders({ page, pageSize: PAGE_SIZE, q: debouncedQuery || undefined, status: status || undefined }),
    [page, debouncedQuery, status],
  );
  const pending = loading || query !== debouncedQuery;
  const results = pending ? null : data;
  const lastPage = Math.max(1, Math.ceil((results?.total ?? 0) / PAGE_SIZE));

  function updateParams(nextSearch, nextStatus, nextPage = 1, replace = false) {
    const next = new URLSearchParams();
    if (nextSearch) next.set('q', nextSearch);
    if (nextStatus) next.set('status', nextStatus);
    if (nextPage > 1) next.set('page', String(nextPage));
    setParams(next, { replace, preventScrollReset: true });
  }

  return (
    <>
      <Breadcrumbs items={[{ label: 'Home', to: '/officer' }, { label: 'Tenders' }]} />
      <div className="workspace-page-heading">
        <div>
          <h1>Tenders</h1>
          <p>Find and manage your procurement tenders.</p>
        </div>
        <Link to="new" className="btn-primary"><Plus size={18} aria-hidden="true" /> Create tender</Link>
      </div>
      <Panel title="Tender register">
        <div className="tender-toolbar">
          <div className="min-w-0 flex-1 basis-56">
            <label htmlFor="tender-search" className="field-label">Search tenders</label>
            <div className="relative">
              <Search size={18} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" aria-hidden="true" />
              <input id="tender-search" type="search" className="field-input pl-10" placeholder="Tender number or title"
                maxLength={100} value={search} onChange={(event) => updateParams(event.target.value, status, 1, true)} />
            </div>
          </div>
          <div className="min-w-0 flex-1 basis-44 sm:flex-none">
            <label htmlFor="tender-status" className="field-label">Status</label>
            <select id="tender-status" className="field-input" value={status} onChange={(event) => updateParams(search, event.target.value)}>
              <option value="">All statuses</option>
              {STATUSES.map((value) => <option key={value} value={value}>{humanize(value)}</option>)}
            </select>
          </div>
          <button type="button" className="btn-secondary min-h-11" disabled={!search && !status}
            onClick={() => updateParams('', '')}>Clear filters</button>
        </div>
        {error && !pending ? (
          <div role="alert" className="flex flex-wrap items-center gap-3 p-4 text-sm text-bad">
            <span>{error}</span>
            <button type="button" className="btn-secondary" onClick={reload}>Retry</button>
          </div>
        ) : (
          <DataTable caption="Tenders" columns={COLUMNS} loading={pending} rows={results?.items ?? []} pageSize={PAGE_SIZE}
            empty={page > lastPage ? 'There are no tenders on this page.' : query || status ? 'No tenders match your filters.' : 'No tenders yet.'} />
        )}
        {results && (
          <div className="tender-pagination">
            <p role="status">
              {results.items.length > 0
                ? <>Showing {(page - 1) * PAGE_SIZE + 1}–{(page - 1) * PAGE_SIZE + results.items.length} of {results.total} tenders</>
                : <>{results.total} {results.total === 1 ? 'tender' : 'tenders'}</>}
            </p>
            {(lastPage > 1 || page > 1) && (
              <nav aria-label="Tender pages" className="flex flex-wrap items-center gap-2">
                <button type="button" className="btn-secondary" disabled={page <= 1}
                  onClick={() => updateParams(search, status, Math.min(page - 1, lastPage))}>Previous</button>
                <button type="button" className="btn-secondary" disabled={page >= lastPage}
                  onClick={() => updateParams(search, status, page + 1)}>Next</button>
              </nav>
            )}
          </div>
        )}
      </Panel>
    </>
  );
}
