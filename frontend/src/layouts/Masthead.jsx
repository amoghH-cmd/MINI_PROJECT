import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { Activity, Building2, ClipboardList, FileSearch, FolderOpen, LayoutDashboard, LogOut, ShieldCheck, Users } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.jsx';
import { NAV, ROLE_META } from '../utils/roles.js';

const ICONS = {
  Dashboard: LayoutDashboard,
  Tenders: FolderOpen,
  Bidders: Users,
  'Evidence Review': FileSearch,
  'Assigned Tenders': ClipboardList,
  'My Tenders': FolderOpen,
  'Organisation Profile': Building2,
  'Audit Trail': ShieldCheck,
  'Users and Roles': Users,
  'Processing Jobs': Activity,
};

export default function Masthead() {
  const { user, logout } = useAuth();
  const [textSize, setTextSize] = useState(() => document.documentElement.style.fontSize || '100%');
  const meta = user && ROLE_META[user.role];
  const items = user ? NAV[user.role].filter((item) => item.ready) : [];

  return (
    <header className={user ? 'workspace-sidebar' : 'public-header'}>
      <a href="#main" className="skip-link">Skip to main content</a>
      <div className="brand-row">
        <Link to={meta?.base ?? '/login'} className="brand">
          <span className="brand-icon"><ShieldCheck size={22} aria-hidden="true" /></span>
          <span><strong>VeriBid</strong><small>Bid compliance platform</small></span>
        </Link>
        {!user && <span className="public-label">Academic prototype</span>}
      </div>
      <div className="text-size-control" role="group" aria-label="Text size">
        {[['A-', '90%', 'Decrease text size'], ['A', '100%', 'Default text size'], ['A+', '112.5%', 'Increase text size']].map(([label, size, description]) => (
          <button key={label} type="button" aria-label={description} aria-pressed={textSize === size} onClick={() => { document.documentElement.style.fontSize = size; setTextSize(size); }}>{label}</button>
        ))}
      </div>
      {user && (
        <>
          <nav className="workspace-nav" aria-label="Main navigation">
            <ul>
              {items.map((item) => {
                const Icon = ICONS[item.label];
                return (
                  <li key={item.label}>
                    <NavLink to={item.to ? meta.base + '/' + item.to : meta.base} end={!item.to}>
                      <Icon size={19} aria-hidden="true" />
                      {item.label}
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          </nav>
          <div className="workspace-account">
            <div className="account-avatar" aria-hidden="true">{user.name?.trim().slice(0, 1).toUpperCase() || 'U'}</div>
            <div className="account-details"><strong>{user.name}</strong><span>{user.designation || meta.label}</span>{user.department && <span>{user.department}</span>}</div>
            <button className="account-logout" onClick={logout} aria-label="Log out" title="Log out"><LogOut size={17} aria-hidden="true" /><span>Log out</span></button>
          </div>
        </>
      )}
    </header>
  );
}
