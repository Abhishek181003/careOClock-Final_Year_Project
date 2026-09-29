import { useState, useMemo } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, AlertCircle, HeartPulse, ShieldAlert, Clock, X } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import './AuthPages.css';

const HOME_BY_ROLE = {
  patient: '/app/patient',
  caregiver: '/app/caregiver',
  doctor: '/app/doctor',
};

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: '', password: '' });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [lockoutNotice, setLockoutNotice] = useState(null); // { title: string, message: string }

  // Check if redirected due to session expiration or security revocation
  const sessionRevokedNotice = useMemo(() => {
    const params = new URLSearchParams(location.search);
    const reason = params.get('reason');
    if (reason === 'session_expired') {
      return 'For your health privacy, your previous session expired due to inactivity. Please sign in again to continue.';
    }
    if (reason === 'revoked') {
      return 'We signed you out to protect your clinical records. Please verify your credentials to continue.';
    }
    return null;
  }, [location.search]);

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsSubmitting(false);
    setLockoutNotice(null);

    try {
      setIsSubmitting(true);
      const user = await login(form.email, form.password);
      const fallback = HOME_BY_ROLE[user.role] ?? '/';
      navigate(location.state?.from?.pathname ?? fallback, { replace: true });
    } catch (err) {
      const status = err.response?.status;
      const errorMsg = err.response?.data?.error || 'Authentication error. Please check your credentials.';

      // Critical Alert: Account Locked after Failed Attempts (Modal on Sign-in Screen)
      if (status === 423 || errorMsg.toLowerCase().includes('locked')) {
        setLockoutNotice({
          title: 'Account Temporarily Locked for Security',
          message: errorMsg,
        });
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="auth-page">
      {/* ── Left: Visual Panel ─────────────────────────────── */}
      <div className="auth-panel-visual">
        <div
          className="auth-panel-visual__bg"
          style={{ backgroundImage: "url('/assets/images/hero-bg.jpg')" }}
        />
        <div className="auth-panel-visual__overlay" />
        <div className="auth-panel-visual__content">
          <div className="auth-panel-visual__badge">
            <span className="auth-panel-visual__badge-dot" />
            Trusted Home Health Monitoring
          </div>
          <h2 className="auth-panel-visual__title">
            Your daily <em>care ritual</em>,<br />
            simplified.
          </h2>
          <p className="auth-panel-visual__subtitle">
            CareOClock turns a simple two‑minute check‑in into peace of mind
            for patients, families, and physicians — every morning, every evening.
          </p>
          <div className="auth-panel-visual__stats">
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">2 min</span>
              <span className="auth-panel-visual__stat-label">Per check-in</span>
            </div>
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">2×</span>
              <span className="auth-panel-visual__stat-label">Daily rituals</span>
            </div>
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">100%</span>
              <span className="auth-panel-visual__stat-label">Free to use</span>
            </div>
          </div>
        </div>
      </div>

      {/* ── Right: Form Panel ─────────────────────────────── */}
      <div className="auth-panel-form">
        <div className="auth-form-container">
          {/* Brand */}
          <div className="auth-brand auth-animate">
            <Link to="/" className="auth-brand__link">
              Care<span className="brand-o">O</span>Clock
            </Link>
            <p className="auth-brand__tagline">Calm, ritualized health monitoring</p>
          </div>

          {/* Title */}
          <h1 className="auth-title auth-animate auth-animate--d1">Welcome back</h1>
          <p className="auth-title-sub auth-animate auth-animate--d1">
            Sign in to continue your care journey
          </p>

          {/* Security Notice: Forced Sign-out / Session Expiration Banner */}
          {sessionRevokedNotice && (
            <div
              role="alert"
              className="p-3.5 mb-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-900 text-xs flex items-start gap-2.5 animate-fade-in"
            >
              <Clock size={16} className="text-amber-700 shrink-0 mt-0.5" />
              <span>{sessionRevokedNotice}</span>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form auth-animate auth-animate--d2">
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-email">
                Email Address
              </label>
              <input
                id="login-email"
                type="email"
                required
                autoComplete="email"
                className="auth-field__input"
                value={form.email}
                onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
                placeholder="name@example.com"
              />
            </div>

            <div className="auth-field">
              <label className="auth-field__label" htmlFor="login-password">
                Password
              </label>
              <input
                id="login-password"
                type="password"
                required
                autoComplete="current-password"
                className="auth-field__input"
                value={form.password}
                onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
                placeholder="••••••••"
              />
            </div>

            {error && (
              <div role="alert" className="auth-error">
                <AlertCircle size={16} className="auth-error__icon" />
                <span>{error}</span>
              </div>
            )}

            <button
              type="submit"
              disabled={isSubmitting}
              className={`auth-submit-btn ${isSubmitting ? 'auth-submit-btn--loading' : ''}`}
            >
              {isSubmitting ? 'Signing in...' : 'Sign in'}
            </button>
          </form>

          {/* Footer */}
          <div className="auth-footer auth-animate auth-animate--d5">
            Don&apos;t have an account?{' '}
            <Link to="/register" className="auth-footer__link">
              Create an account
            </Link>
          </div>

          {/* Trust badges */}
          <div className="auth-trust auth-animate auth-animate--d6">
            <span className="auth-trust__item">
              <Lock size={13} /> End-to-end encrypted
            </span>
            <span className="auth-trust__item">
              <ShieldCheck size={13} /> HIPAA-ready
            </span>
            <span className="auth-trust__item">
              <HeartPulse size={13} /> AI-powered insights
            </span>
          </div>
        </div>
      </div>

      {/* ── Critical Alert: Account Locked after Failed Attempts Modal ────── */}
      {lockoutNotice && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="lockout-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-md bg-surface rounded-ritual shadow-2xl border border-rose-300 p-6 space-y-4 animate-scale-up text-ink">
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-3 text-rose-700">
                <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0">
                  <ShieldAlert size={22} className="text-rose-700" />
                </div>
                <div>
                  <h3 id="lockout-modal-title" className="font-display font-bold text-lg text-ink">
                    {lockoutNotice.title}
                  </h3>
                  <span className="text-xs text-rose-600 font-semibold">Brute-Force Guard Activated</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setLockoutNotice(null)}
                className="p-1 rounded-full text-ink-soft hover:bg-paper"
              >
                <X size={18} />
              </button>
            </div>

            <p className="text-sm text-ink leading-relaxed">
              {lockoutNotice.message}
            </p>

            <div className="p-3.5 rounded-ritual bg-rose-50 border border-rose-200 text-xs text-rose-900 space-y-1.5">
              <p className="font-semibold">Why is my account locked?</p>
              <p className="leading-relaxed">
                To protect your sensitive medical history and doctor-patient communications from unauthorized guessing, five consecutive incorrect passwords automatically engage a 15-minute security lock.
              </p>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={() => setLockoutNotice(null)}
                className="w-full sm:w-auto px-5 py-2.5 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-bold transition-all shadow-sm"
              >
                I Understand / Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
