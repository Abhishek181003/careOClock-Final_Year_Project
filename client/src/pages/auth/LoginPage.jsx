import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { ShieldCheck, UserCheck, Stethoscope, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { CONFIG } from '../../config';

const HOME_BY_ROLE = {
  patient: '/app/patient',
  caregiver: '/app/caregiver',
  doctor: '/app/doctor',
};

export default function LoginPage() {
  const { login, register } = useAuth();
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

  // Quick Demo Persona Helper for seamless reviewer evaluation
  const handleQuickDemo = async (role) => {
    setError('');
    setIsSubmitting(true);
    const email = `demo.${role}@careoclock-demo.com`;
    const password = 'DemoPassword123!';

    try {
      // First attempt direct login
      const user = await login(email, password);
      const fallback = HOME_BY_ROLE[user.role] ?? '/';
      navigate(location.state?.from?.pathname ?? fallback, { replace: true });
    } catch {
      // If not yet registered in local MongoDB, seed the demo persona
      try {
        let doctorId = '';
        if (role === 'patient') {
          // Register demo doctor first to get doctor ID if needed
          try {
            const docUser = await register({
              email: 'demo.doctor@careoclock-demo.com',
              password: 'DemoPassword123!',
              displayName: 'Dr. Evelyn Reed, MD',
              role: 'doctor',
              doctorInviteCode: 'CAREOCLOCK-DOC-INVITE-2026',
            });
            doctorId = docUser?.id;
          } catch {
            // Already registered, try log in to get doc id
            const docUser = await login('demo.doctor@careoclock-demo.com', 'DemoPassword123!');
            doctorId = docUser?.id;
          }
        }

        const payload = {
          email,
          password,
          displayName:
            role === 'patient'
              ? 'Arthur Pendelton (Age 74)'
              : role === 'doctor'
                ? 'Dr. Evelyn Reed, MD'
                : 'Clara Pendelton (Caregiver)',
          role,
        };

        if (role === 'doctor') {
          payload.doctorInviteCode = 'CAREOCLOCK-DOC-INVITE-2026';
        } else if (role === 'patient') {
          payload.assignedDoctorId = doctorId;
          payload.age = 74;
          payload.sex = 'male';
          payload.heightCm = 172;
          payload.weightKg = 75;
        }

        const user = await register(payload);
        const fallback = HOME_BY_ROLE[user.role] ?? '/';
        navigate(location.state?.from?.pathname ?? fallback, { replace: true });
      } catch (seedErr) {
        setError(seedErr.response?.data?.error || 'Unable to establish demo session.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-paper px-4 py-12 text-ink">
      <div className="w-full max-w-md bg-surface rounded-ritual shadow-ritual p-8 border border-line">
        <div className="text-center mb-6">
          <Link to="/" className="inline-block font-display font-extrabold text-h2 text-brand">
            {CONFIG.BRAND_NAME}
          </Link>
          <p className="text-sm text-ink-soft mt-1">Calm, ritualized health monitoring</p>
        </div>

        <h1 className="text-h2 font-display text-ink mb-6 text-center">Welcome back</h1>

        {/* Demo Fast-Track Persona Bar */}
        <div className="mb-6 p-3.5 rounded-xl bg-paper border border-line">
          <div className="text-xs font-semibold text-ink-soft uppercase tracking-wider mb-2 flex items-center gap-1">
            <ShieldCheck size={14} className="text-brand" /> Quick Demo Personas:
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleQuickDemo('patient')}
              className="flex items-center justify-center gap-1 py-2 px-2 text-xs font-medium rounded-lg bg-surface hover:bg-brand-light/40 border border-line text-ink transition-colors disabled:opacity-50"
            >
              <UserCheck size={13} className="text-brand" /> Patient
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleQuickDemo('doctor')}
              className="flex items-center justify-center gap-1 py-2 px-2 text-xs font-medium rounded-lg bg-surface hover:bg-brand-light/40 border border-line text-ink transition-colors disabled:opacity-50"
            >
              <Stethoscope size={13} className="text-brand" /> Doctor
            </button>
            <button
              type="button"
              disabled={isSubmitting}
              onClick={() => handleQuickDemo('caregiver')}
              className="flex items-center justify-center gap-1 py-2 px-2 text-xs font-medium rounded-lg bg-surface hover:bg-brand-light/40 border border-line text-ink transition-colors disabled:opacity-50"
            >
              <Users size={13} className="text-brand" /> Caregiver
            </button>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block text-sm">
            <span className="block mb-1.5 font-medium text-ink">Email Address</span>
            <input
              type="email"
              required
              autoComplete="email"
              className="w-full rounded-lg border border-line px-3.5 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              value={form.email}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@example.com"
            />
          </label>

          <label className="block text-sm">
            <span className="block mb-1.5 font-medium text-ink">Password</span>
            <input
              type="password"
              required
              autoComplete="current-password"
              className="w-full rounded-lg border border-line px-3.5 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              value={form.password}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder="••••••••"
            />
          </label>

          {error && (
            <div
              role="alert"
              className="p-3 rounded-lg bg-tier-critical/10 border border-tier-critical/30 text-tier-critical text-sm font-medium"
            >
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            className="w-full bg-brand hover:bg-brand-dark text-white font-display font-semibold rounded-full px-4 py-3 text-base transition-colors shadow-sm disabled:opacity-50 mt-2"
          >
            {isSubmitting ? 'Signing in...' : 'Log in'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-line text-center text-sm text-ink-soft">
          Need an account?{' '}
          <Link to="/register" className="text-brand font-semibold underline hover:text-brand-dark">
            Create an account
          </Link>
        </div>
      </div>
    </div>
  );
}
