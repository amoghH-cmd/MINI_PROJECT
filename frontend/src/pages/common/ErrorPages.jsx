import { Link } from 'react-router-dom';
import Panel from '../../components/ui/Panel.jsx';
const Box = ({ title, children }) => (
  <div className="max-w-xl mx-auto mt-10"><Panel title={title}><div className="p-4 text-[13px] space-y-3">{children}<Link to="/" className="btn-primary inline-flex">Return to home</Link></div></Panel></div>
);
export const Forbidden = () => <Box title="403 – Access denied"><p>Your role does not permit access to this page. The attempt may be recorded in the audit trail.</p></Box>;
export const NotFoundPage = () => <Box title="404 – Page not found"><p>The page you requested does not exist.</p></Box>;
