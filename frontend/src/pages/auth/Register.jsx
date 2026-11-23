import { useState } from 'react';
import { Link, Navigate, useNavigate } from 'react-router-dom';
import Masthead from '../../layouts/Masthead.jsx';
import { SiteFooter } from '../../layouts/RoleLayout.jsx';
import Panel from '../../components/ui/Panel.jsx';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { api, apiError } from '../../services/api.js';
import { ROLE_META } from '../../utils/roles.js';

export default function Register() {
  const { user, booting } = useAuth();
  const navigate = useNavigate();
  const [failure, setFailure] = useState(null);
  const [busy, setBusy] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setFailure(null);
    setBusy(true);
    try {
      const form = new FormData(event.currentTarget);
      const email = form.get('email').trim();
      await api.post('/auth/register', { name: form.get('name').trim(), email, password: form.get('password') });
      navigate('/login', { replace: true, state: { registeredEmail: email } });
    } catch (error) {
      setFailure(apiError(error));
    } finally {
      setBusy(false);
    }
  }

  if (user) return <Navigate to={ROLE_META[user.role].base} replace />;
  return (
    <div className="public-shell">
      <Masthead />
      <main id="main" tabIndex={-1} className="auth-grid">
        <section className="auth-hero" aria-labelledby="register-heading">
          <h1 id="register-heading">Create a bidder account</h1>
          <p className="mt-5 max-w-md leading-relaxed sm:text-lg">After signing in, register your organisation to start preparing bids.</p>
        </section>
        <Panel title="Account details" className="auth-card">
          <form className="p-5 space-y-4" onSubmit={submit}>
            {failure && <div role="alert" className="text-bad">
              <p className="text-bad">{failure.message}</p>
              {failure.fields.map(({ path, message }) => <p className="field-error" key={`${path}-${message}`}>{message}</p>)}
            </div>}
            <label className="field-label">Full name<input className="field-input mt-1" name="name" autoComplete="name" minLength={2} maxLength={120} required /></label>
            <label className="field-label">Email address<input className="field-input mt-1" name="email" type="email" autoComplete="email" maxLength={200} required /></label>
            <label className="field-label">Password<input className="field-input mt-1" name="password" type="password" autoComplete="new-password" minLength={10} maxLength={128}
              pattern="(?=.*[A-Za-z])(?=.*[0-9]).{10,128}" aria-describedby="password-rules" required /></label>
            <p id="password-rules" className="text-muted">Use at least 10 characters with a letter and a number.</p>
            <button className="btn-primary w-full justify-center" disabled={busy || booting}>{busy ? 'Creating account…' : 'Create account'}</button>
            <p>Already registered? <Link className="text-gov-link" to="/login">Sign in</Link></p>
          </form>
        </Panel>
      </main>
      <SiteFooter />
    </div>
  );
}
