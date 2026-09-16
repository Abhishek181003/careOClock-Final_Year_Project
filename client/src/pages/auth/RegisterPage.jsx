import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { CONFIG } from '../../config';

const ROLES = [
  { value: 'patient', label: 'Patient (Self-check-in)' },
  { value: 'caregiver', label: 'Family Member or Caregiver' },
  { value: 'doctor', label: 'Doctor / Physician' },
];

export default function RegisterPage() {
  const { register } = useAuth();
  const navigate = useNavigate();
  const [role, setRole] = useState('patient');
  const [doctors, setDoctors] = useState([]);
  const [form, setForm] = useState({
    displayName: '',
    email: '',
    password: '',
    assignedDoctorId: '',
    doctorInviteCode: 'CAREOCLOCK-DOC-INVITE-2026',
    inviteCode: '',
    age: '72',
    sex: 'male',
  });
  const [error, setError] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch available doctors when role is patient
  useEffect(() => {
    if (role !== 'patient') return;
    api
      .get('/auth/doctors')
      .then((res) => {
        const list = res.data?.doctors || res.data || [];
        setDoctors(list);
      })
      .catch(() => setDoctors([]));
  }, [role]);

  const set = (field) => (e) => setForm((f) => ({ ...f, [field]: e.target.value }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setIsSubmitting(true);

    const payload = {
      displayName: form.displayName,
      email: form.email,
      password: form.password,
      role,
    };

    if (role === 'patient') {
      payload.age = form.age ? parseInt(form.age, 10) : 70;
      payload.sex = form.sex || 'male';
      if (form.assignedDoctorId) {
        payload.assignedDoctorId = form.assignedDoctorId;
      }
    } else if (role === 'doctor') {
      payload.doctorInviteCode = form.doctorInviteCode || 'CAREOCLOCK-DOC-INVITE-2026';
    } else if (role === 'caregiver') {
      if (form.inviteCode) {
        payload.inviteCode = form.inviteCode;
      }
    }

    try {
      const user = await register(payload);
      navigate(`/app/${user.role}`, { replace: true });
    } catch (err) {
      setError(
        err.response?.data?.error ||
          err.response?.data?.details?.[0]?.message ||
          "Unable to create account. Please check the provided information."
      );
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
          <p className="text-sm text-ink-soft mt-1">Join the daily care ritual</p>
        </div>

        <h1 className="text-h2 font-display text-ink mb-6 text-center">Create account</h1>

        <fieldset className="mb-5 p-3 rounded-xl bg-paper border border-line">
          <legend className="text-xs font-semibold uppercase tracking-wider text-ink-soft px-1">
            Account Role
          </legend>
          <div className="space-y-2 mt-1.5">
            {ROLES.map((r) => (
              <label
                key={r.value}
                className={`flex items-center gap-2.5 p-2 rounded-lg cursor-pointer text-sm font-medium transition-colors ${
                  role === r.value ? 'bg-brand-light/50 text-brand-dark' : 'text-ink hover:bg-surface'
                }`}
              >
                <input
                  type="radio"
                  name="role"
                  value={r.value}
                  checked={role === r.value}
                  onChange={() => setRole(r.value)}
                  className="accent-brand"
                />
                {r.label}
              </label>
            ))}
          </div>
        </fieldset>

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field
            label="Full Name"
            value={form.displayName}
            onChange={set('displayName')}
            placeholder="Arthur Pendelton"
            required
          />
          <Field
            label="Email Address"
            type="email"
            value={form.email}
            onChange={set('email')}
            placeholder="name@example.com"
            required
          />
          <Field
            label="Password"
            type="password"
            value={form.password}
            onChange={set('password')}
            placeholder="At least 6 characters"
            required
          />

          {role === 'patient' && (
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Age"
                type="number"
                value={form.age}
                onChange={set('age')}
                min="18"
                max="120"
                required
              />
              <label className="block text-sm">
                <span className="block mb-1.5 font-medium text-ink">Biological Sex</span>
                <select
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  value={form.sex}
                  onChange={set('sex')}
                >
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                  <option value="other">Other</option>
                </select>
              </label>
            </div>
          )}

          {role === 'patient' && doctors.length > 0 && (
            <label className="block text-sm">
              <span className="block mb-1.5 font-medium text-ink">
                Primary Care Physician <span className="text-xs text-ink-soft font-normal">(Optional — can connect later)</span>
              </span>
              <select
                className="w-full rounded-lg border border-line px-3 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                value={form.assignedDoctorId}
                onChange={set('assignedDoctorId')}
              >
                <option value="">-- Connect with doctor later --</option>
                {doctors.map((doc) => (
                  <option key={doc._id || doc.id} value={doc._id || doc.id}>
                    {doc.displayName || doc.name} ({doc.email})
                  </option>
                ))}
              </select>
            </label>
          )}

          {role === 'doctor' && (
            <Field
              label="Doctor Invite / Credential Code"
              value={form.doctorInviteCode}
              onChange={set('doctorInviteCode')}
              required
            />
          )}

          {role === 'caregiver' && (
            <Field
              label="Patient Link / Invite Code (Optional)"
              value={form.inviteCode}
              onChange={set('inviteCode')}
              placeholder="Enter patient invite code if available (or connect later)"
            />
          )}

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
            {isSubmitting ? 'Creating account...' : 'Create account'}
          </button>
        </form>

        <div className="mt-6 pt-5 border-t border-line text-center text-sm text-ink-soft">
          Already have an account?{' '}
          <Link to="/login" className="text-brand font-semibold underline hover:text-brand-dark">
            Log in
          </Link>
        </div>
      </div>
    </div>
  );
}

function Field({ label, ...inputProps }) {
  return (
    <label className="block text-sm">
      <span className="block mb-1.5 font-medium text-ink">{label}</span>
      <input
        className="w-full rounded-lg border border-line px-3.5 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
        {...inputProps}
      />
    </label>
  );
}
