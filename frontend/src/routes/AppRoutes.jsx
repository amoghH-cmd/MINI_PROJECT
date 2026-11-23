import { Navigate, Outlet, Route, Routes } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import RoleLayout from '../layouts/RoleLayout.jsx';
import Register from '../pages/auth/Register.jsx';
import ProcessingJobs from '../pages/admin/ProcessingJobs.jsx';
import Login from '../pages/auth/Login.jsx';
import Dashboard from '../pages/officer/Dashboard.jsx';
import EvidenceReview from '../pages/officer/EvidenceReview.jsx';
import Tenders from '../pages/officer/Tenders.jsx';
import TenderCreate from '../pages/officer/TenderCreate.jsx';
import TenderDetail from '../pages/officer/TenderDetail.jsx';
import Bidders from '../pages/officer/Bidders.jsx';
import BidderHome from '../pages/bidder/BidderHome.jsx';
import Organisation from '../pages/bidder/Organisation.jsx';
import BidTender from '../pages/bidder/BidTender.jsx';
import BidSubmission from '../pages/bidder/BidSubmission.jsx';
import AssignedTenders from '../pages/reviewer/AssignedTenders.jsx';
import AuditTrail from '../pages/auditor/AuditTrail.jsx';
import AdminUsers from '../pages/admin/Users.jsx';
import NotImplemented from '../pages/common/NotImplemented.jsx';
import { Forbidden, NotFoundPage } from '../pages/common/ErrorPages.jsx';
import { NAV, ROLE_META } from '../utils/roles.js';

// Client-side guard is for navigation only; the backend enforces authorisation on every API call.
function RoleGuard({ role }) {
  const { user, booting } = useAuth();
  if (booting) return <p className="p-6 text-[13px]" role="status">Restoring session…</p>;
  if (!user) return <Navigate to="/login" replace />;
  if (user.role !== role) return <Navigate to="/forbidden" replace />;
  return <Outlet />;
}

const READY = {
  PROCUREMENT_OFFICER: {
    '': <Dashboard />,
    tenders: <Tenders />,
    bidders: <Bidders />,
    evidence: <EvidenceReview />,
  },
  TEC_REVIEWER: {
    '': <AssignedTenders />,
    evidence: <EvidenceReview />,
  },
  BIDDER: {
    '': <BidderHome />,
    organisation: <Organisation />,
  },
  AUDITOR: {
    '': <AuditTrail />,
  },
  ADMIN: {
    '': <AdminUsers />,
    jobs: <ProcessingJobs />,
  },
};

function Home() {
  const { user, booting } = useAuth();
  if (booting) return null;
  return <Navigate to={user ? ROLE_META[user.role].base : '/login'} replace />;
}

export default function AppRoutes() {
  return (
    <Routes>
      <Route path="/register" element={<Register />} />
      <Route path="/login" element={<Login />} />
      <Route path="/" element={<Home />} />
      {Object.entries(ROLE_META).map(([role, { base }]) => (
        <Route key={role} element={<RoleGuard role={role} />}>
          <Route path={base} element={<RoleLayout />}>
            {NAV[role].map((n) => (
              <Route key={n.label} index={n.to === ''} path={n.to === '' ? undefined : n.to}
                element={READY[role]?.[n.to] ?? <NotImplemented title={n.label} phase={n.phase} />} />
            ))}
            {role === 'BIDDER' && (<><Route path="tenders/:id" element={<BidTender />} /><Route path="submissions/:id" element={<BidSubmission />} /></>)}
            {role === 'PROCUREMENT_OFFICER' && (<>
              <Route path="tenders/new" element={<TenderCreate />} />
              <Route path="tenders/:id" element={<TenderDetail />} />
            </>)}
          </Route>
        </Route>
      ))}
      <Route element={<RoleLayout />}><Route path="/forbidden" element={<Forbidden />} /></Route>
      <Route path="*" element={<NotFoundPage />} />
    </Routes>
  );
}
