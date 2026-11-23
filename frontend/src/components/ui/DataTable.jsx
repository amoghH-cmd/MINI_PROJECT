import { useMemo, useState } from 'react';
import { Inbox } from 'lucide-react';

/** columns: [{ key, header, render?(row), className? }]. Client-side pagination for small lists;
 *  server-driven tables will pass `page`/`total`/`onPage` later. */
export default function DataTable({ caption, columns, rows, pageSize = 8, empty = 'No records found.', loading = false, error = null, rowKey = 'id' }) {
  const [page, setPage] = useState(1);
  const pages = Math.max(1, Math.ceil(rows.length / pageSize));
  const cur = Math.min(page, pages);
  const slice = useMemo(() => rows.slice((cur - 1) * pageSize, cur * pageSize), [rows, cur, pageSize]);

  if (loading) return <p className="p-4 text-[13px] text-muted" role="status">Loading records…</p>;
  if (error) return <p className="p-4 text-[13px] text-bad" role="alert">{error}</p>;
  return (
    <div>
      <div className="overflow-x-auto">
        <table className="tbl">
          {caption && <caption className="sr-only">{caption}</caption>}
          <thead><tr>{columns.map((c) => <th key={c.key} scope="col" className={c.className}>{c.header}</th>)}</tr></thead>
          <tbody>
            {slice.length === 0 && <tr><td colSpan={columns.length} className="table-empty"><Inbox size={24} aria-hidden="true" />{empty}</td></tr>}
            {slice.map((r) => (
              <tr key={r[rowKey]}>{columns.map((c) => <td key={c.key} className={c.className}>{c.render ? c.render(r) : r[c.key]}</td>)}</tr>
            ))}
          </tbody>
        </table>
      </div>
      {rows.length > pageSize && (
        <nav aria-label="Pagination" className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-paper px-4 py-3 text-sm">
          <span>Showing {(cur - 1) * pageSize + 1}–{Math.min(cur * pageSize, rows.length)} of {rows.length}</span>
          <span className="flex gap-1">
            <button className="btn-secondary !py-0.5" disabled={cur === 1} onClick={() => setPage(cur - 1)}>Previous</button>
            <button className="btn-secondary !py-0.5" disabled={cur === pages} onClick={() => setPage(cur + 1)}>Next</button>
          </span>
        </nav>
      )}
    </div>
  );
}
