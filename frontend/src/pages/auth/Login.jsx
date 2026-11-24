import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { ClipboardList, Eye, EyeOff, FileCheck2, ShieldCheck } from 'lucide-react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext.jsx';
import { apiError } from '../../services/api.js';
import { ROLE_META } from '../../utils/roles.js';
import Panel from '../../components/ui/Panel.jsx';
import Masthead from '../../layouts/Masthead.jsx';
import { SiteFooter } from '../../layouts/RoleLayout.jsx';

const schema = z.object({
  email: z.string().min(1, 'Enter your email address').email('Enter a valid email address'),
  password: z.string().min(1, 'Enter your password'),
});

const DEMO = [
  ['Procurement Officer', 'officer'],
  ['TEC Reviewer', 'reviewer'],
  ['Bidder', 'bidder'],
  ['Auditor', 'auditor'],
  ['Administrator', 'admin'],
];

export default function Login() {
  const { user, login, booting } = useAuth();
  const nav = useNavigate();
  const { state } = useLocation();
  const [show, setShow] = useState(false);
  const [serverError, setServerError] = useState('');
  const { register, handleSubmit, setValue, formState: { errors, isSubmitting } } = useForm({ resolver: zodResolver(schema), defaultValues: { email: state?.registeredEmail ?? '' } });

  if (!booting && user) return <Navigate to={ROLE_META[user.role].base} replace />;

  const onSubmit = async (v) => {
    setServerError('');
    try {
      const u = await login(v.email, v.password);
      nav(ROLE_META[u.role].base, { replace: true });
    } catch (e) {
      setServerError(apiError(e).message);
    }
  };

  return (
    <div className="public-shell">
      <Masthead />
      <main id="main" tabIndex={-1} className="auth-grid">
        <section className="auth-hero" aria-labelledby="auth-heading">
          <h1 id="auth-heading">Technical bid evaluation</h1>
          <p className="mt-5 max-w-md text-base leading-relaxed sm:text-lg">
            Manage tenders, submit bids and review supporting evidence in one workspace.
          </p>
          <ul className="mt-8 space-y-4">
            <li className="auth-feature"><ClipboardList size={22} aria-hidden="true" /> Tender requirements and deadlines</li>
            <li className="auth-feature"><FileCheck2 size={22} aria-hidden="true" /> AI-assisted document review</li>
            <li className="auth-feature"><ShieldCheck size={22} aria-hidden="true" /> Verifiable audit trail</li>
          </ul>
          <p className="mt-8 max-w-md border-t border-white/20 pt-4 text-sm">
            Sample organisations and tenders are fictional. Automated findings are advisory.
          </p>
        </section>
        <Panel title="Sign in to VeriBid" className="auth-card">
          <form onSubmit={handleSubmit(onSubmit)} noValidate className="p-5 space-y-4">
            {state?.registeredEmail && <p className="text-ok" role="status">Account created. Sign in to set up your organisation.</p>}
            {serverError && (
              <div role="alert" className="text-[13px] border border-bad bg-[#FBEDED] text-bad px-3 py-2 rounded">
                {serverError}
              </div>
            )}

            <div>
              <label htmlFor="email" className="field-label">Email address</label>
              <input
                id="email"
                type="email"
                autoComplete="username"
                className="field-input"
                aria-invalid={!!errors.email}
                {...register('email')}
              />
              {errors.email && <p className="field-error">{errors.email.message}</p>}
            </div>

            <div>
              <label htmlFor="password" className="field-label">Password</label>
              <div className="relative">
                <input
                  id="password"
                  type={show ? 'text' : 'password'}
                  autoComplete="current-password"
                  className="field-input !pr-10"
                  aria-invalid={!!errors.password}
                  {...register('password')}
                />
                <button
                  type="button"
                  onClick={() => setShow(!show)}
                  aria-label={show ? 'Hide password' : 'Show password'}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-muted hover:text-ink"
                >
                  {show ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              {errors.password && <p className="field-error">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              className="btn-primary w-full justify-center"
              disabled={isSubmitting}
            >
              {isSubmitting ? 'Signing in…' : 'Sign in'}
            </button>
            <p className="text-muted">New bidder? <Link to="/register" className="text-gov-link">Create an account</Link></p>
          </form>

          {/* Demo quick-fill */}
          <div className="auth-demo text-sm">
            <div className="font-semibold text-ink mb-2">Demo accounts (fictional)</div>
            <div className="flex flex-wrap gap-2">
              {DEMO.map(([label, p]) => (
                <button
                  key={p}
                  type="button"
                  className="btn-secondary"
                  onClick={() => setValue('email', `${p}@demo.bcvp.test`)}
                >
                  {label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-muted leading-snug">
              Fills the email only. The password is the{' '}
              <code className="bg-[#E3E9EE] px-1 rounded">SEED_DEMO_PASSWORD</code> value from the backend{' '}
              <code className="bg-[#E3E9EE] px-1 rounded">.env</code> file{' '}
              (default: <code className="bg-[#E3E9EE] px-1 rounded">Project@2026</code>).
            </p>
          </div>
        </Panel>
      </main>

      <SiteFooter />
    </div>
  );
}
