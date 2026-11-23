import { Outlet } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import Masthead from './Masthead.jsx';

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <span>VeriBid · Academic prototype for SIH26100. No government affiliation.</span>
      <span>Qualification decisions are made by authorised officers.</span>
    </footer>
  );
}

export default function RoleLayout() {
  const { user } = useAuth();
  return (
    <div className={user ? 'workspace-shell' : 'public-shell'}>
      <Masthead />
      <div className="workspace-body">
        <main id="main" className="workspace-content" tabIndex={-1}>
          <Outlet />
        </main>
        <SiteFooter />
      </div>
    </div>
  );
}
