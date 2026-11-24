import { Activity, CalendarClock, Files, FolderOpen, Plus } from 'lucide-react';
import { Link } from 'react-router-dom';
import Breadcrumbs from '../../components/ui/Breadcrumbs.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { useAsync } from '../../hooks/useAsync.js';
import { getOfficerDashboard } from '../../services/tenders.js';
import { fmtDate, fmtDateTime, humanize } from '../../utils/format.js';

const FIGURES = [
  ['totalTenders', 'Total tenders', Files, 'tenders'],
  ['activeTenders', 'Active tenders', FolderOpen],
  ['submittedBids', 'Submitted bids', CalendarClock],
];

export default function Dashboard() {
  const { loading, data, error, reload } = useAsync(getOfficerDashboard, []);
  return (
    <>
      <Breadcrumbs items={[{ label: 'Home' }, { label: 'Dashboard' }]} />
      <div className="dashboard-hero">
        <div><h1>Procurement dashboard</h1><p className="mt-2">Track your tenders, submissions and deadlines.</p></div>
        <Link className="btn-secondary" to="tenders/new"><Plus size={16} aria-hidden="true" /> Create tender</Link>
      </div>
      {loading && <p role="status" className="text-[13px] text-muted">Loading dashboard…</p>}
      {error && <div role="alert" className="text-[13px] border border-bad bg-[#FBEDED] text-bad px-3 py-2 rounded mb-3">{error} <button className="underline ml-2" onClick={reload}>Retry</button></div>}
      {data && (
        <>
          <dl className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-5" aria-label="Summary">
            {FIGURES.map(([k, label, Icon, to]) => (
              <div key={k} className="panel metric-card relative p-5">
                <div className="metric-icon mb-3"><Icon size={18} aria-hidden="true" /></div>
                <dt className="text-sm font-medium text-muted">{to ? <Link className="metric-link" to={to}>{label}</Link> : label}</dt>
                <dd className="mt-1 text-3xl leading-tight font-bold tabular-nums text-navy">
                  {data.totals[k] ?? "—"}
                </dd>
              </div>
            ))}
          </dl>
          <div className="grid lg:grid-cols-2 gap-4 items-start">
            <Panel title="Upcoming submission deadlines" actions={<Link to="tenders" className="text-sm text-gov-link">All tenders</Link>}>
              {data.upcomingDeadlines.length === 0 ? <p className="dashboard-empty"><CalendarClock className="shrink-0" size={20} aria-hidden="true" />No open tenders with upcoming deadlines.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {data.upcomingDeadlines.map((t) => (
                    <li key={t.id} className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-5 py-3"><Link className="text-gov underline" to={`tenders/${t.id}`}>{t.tenderNo}</Link><time dateTime={t.submissionDeadline}>{fmtDateTime(t.submissionDeadline)}</time></li>
                  ))}
                </ul>
              )}
            </Panel>
            <Panel title="Recent activity on your tenders">
              {data.recentActivity.length === 0 ? <p className="dashboard-empty"><Activity size={20} aria-hidden="true" />No activity yet.</p> : (
                <ul className="divide-y divide-line text-sm">
                  {data.recentActivity.map((a) => (
                    <li key={a.id} className="px-5 py-3"><div className="text-muted">{fmtDateTime(a.at)}</div><div><b className="font-semibold">{a.actor}:</b> {humanize(a.action)}</div></li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
          <p className="text-[12px] text-muted mt-3">Figures are counted from stored records as of {fmtDate(new Date())}.</p>
        </>
      )}
    </>
  );
}
