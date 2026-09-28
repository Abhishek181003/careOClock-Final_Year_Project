import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, Lock, AlertCircle, HeartPulse } from 'lucide-react';
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

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError('');
    setIsSubmitting(true);
    try {
      const user = await login(form.email, form.password);
      const fallback = HOME_BY_ROLE[user.role] ?? '/';
      navigate(location.state?.from?.pathname ?? fallback, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          "That email and password combination was not recognized. Please check and try again."
      );
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
    </div>
  );
}
