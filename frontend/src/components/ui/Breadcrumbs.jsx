import { Link } from 'react-router-dom';
export default function Breadcrumbs({ items }) {
  return (
    <nav aria-label="Breadcrumb" className="text-[12px] text-muted mb-2">
      <ol className="flex flex-wrap gap-1">
        {items.map((it, i) => (
          <li key={it.label} className="flex gap-1">
            {it.to && i < items.length - 1 ? <Link to={it.to} className="text-gov underline">{it.label}</Link> : <span aria-current={i === items.length - 1 ? 'page' : undefined}>{it.label}</span>}
            {i < items.length - 1 && <span aria-hidden="true">/</span>}
          </li>
        ))}
      </ol>
    </nav>
  );
}
