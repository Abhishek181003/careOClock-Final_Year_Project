import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import {
  UserCheck, Stethoscope, Users, ShieldCheck,
  AlertCircle, Lock, HeartPulse, UserPlus,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { CONFIG } from '../../config';
import './AuthPages.css';

const ROLES = [
  { value: 'patient', label: 'Patient', sub: 'Self check-in', icon: UserCheck },
  { value: 'doctor', label: 'Doctor', sub: 'Physician', icon: Stethoscope },
  { value: 'caregiver', label: 'Caregiver', sub: 'Family member', icon: Users },
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
    <div className="auth-page">
      {/* ── Left: Visual Panel ─────────────────────────────── */}
      <div className="auth-panel-visual">
        <div
          className="auth-panel-visual__bg"
          style={{ backgroundImage: "url('/assets/images/family-care.jpg')" }}
        />
        <div className="auth-panel-visual__overlay" />
        <div className="auth-panel-visual__content">
          <div className="auth-panel-visual__badge">
            <span className="auth-panel-visual__badge-dot" />
            Join the Care Community
          </div>
          <h2 className="auth-panel-visual__title">
            Start your <em>care ritual</em><br />
            in minutes.
          </h2>
          <p className="auth-panel-visual__subtitle">
            Whether you&apos;re a patient tracking your own health, a family
            member staying connected, or a physician monitoring your panel —
            CareOClock brings everyone together.
          </p>
          <div className="auth-panel-visual__stats">
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">3</span>
              <span className="auth-panel-visual__stat-label">Roles supported</span>
            </div>
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">30s</span>
              <span className="auth-panel-visual__stat-label">To sign up</span>
            </div>
            <div className="auth-panel-visual__stat">
              <span className="auth-panel-visual__stat-value">Free</span>
              <span className="auth-panel-visual__stat-label">Forever</span>
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
            <p className="auth-brand__tagline">Join the daily care ritual</p>
          </div>

          {/* Title */}
          <h1 className="auth-title auth-animate auth-animate--d1">Create your account</h1>
          <p className="auth-title-sub auth-animate auth-animate--d1">
            Choose your role to get started
          </p>

          {/* Role Selector */}
          <fieldset className="auth-role-selector auth-animate auth-animate--d2">
            <legend className="auth-role-selector__legend">
              <UserPlus size={13} />
              I am a…
            </legend>
            <div className="auth-role-selector__options">
              {ROLES.map((r) => (
                <label
                  key={r.value}
                  className={`auth-role-option ${role === r.value ? 'auth-role-option--active' : ''}`}
                >
                  <input
                    type="radio"
                    name="role"
                    value={r.value}
                    checked={role === r.value}
                    onChange={() => setRole(r.value)}
                  />
                  <span className="auth-role-option__icon">
                    <r.icon size={16} />
                  </span>
                  <span className="auth-role-option__label">
                    {r.label}
                    <br />
                    <span style={{ fontWeight: 400, fontSize: '0.68rem', color: '#4B5A57' }}>
                      {r.sub}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          </fieldset>

          {/* Form */}
          <form onSubmit={handleSubmit} className="auth-form auth-animate auth-animate--d3">
            {/* Full Name */}
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="reg-name">
                Full Name
              </label>
              <input
                id="reg-name"
                type="text"
                required
                className="auth-field__input"
                value={form.displayName}
                onChange={set('displayName')}
                placeholder="Arthur Pendelton"
              />
            </div>

            {/* Email */}
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="reg-email">
                Email Address
              </label>
              <input
                id="reg-email"
                type="email"
                required
                className="auth-field__input"
                value={form.email}
                onChange={set('email')}
                placeholder="name@example.com"
              />
            </div>

            {/* Password */}
            <div className="auth-field">
              <label className="auth-field__label" htmlFor="reg-password">
                Password
              </label>
              <input
                id="reg-password"
                type="password"
                required
                className="auth-field__input"
                value={form.password}
                onChange={set('password')}
                placeholder="At least 6 characters"
              />
            </div>

            {/* Patient-specific: Age + Sex */}
            {role === 'patient' && (
              <div className="auth-field-row">
                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="reg-age">
                    Age
                  </label>
                  <input
                    id="reg-age"
                    type="number"
                    required
                    min="18"
                    max="120"
                    className="auth-field__input"
                    value={form.age}
                    onChange={set('age')}
                  />
                </div>
                <div className="auth-field">
                  <label className="auth-field__label" htmlFor="reg-sex">
                    Biological Sex
                  </label>
                  <select
                    id="reg-sex"
                    className="auth-field__select"
                    value={form.sex}
                    onChange={set('sex')}
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>
            )}

            {/* Patient-specific: Primary Care Physician */}
            {role === 'patient' && doctors.length > 0 && (
              <div className="auth-field">
                <label className="auth-field__label" htmlFor="reg-doctor">
                  Primary Care Physician{' '}
                  <span className="optional-hint">(Optional — can connect later)</span>
                </label>
                <select
                  id="reg-doctor"
                  className="auth-field__select"
                  value={form.assignedDoctorId}
                  onChange={set('assignedDoctorId')}
                >
                  <option value="">— Connect with doctor later —</option>
                  {doctors.map((doc) => (
                    <option key={doc._id || doc.id} value={doc._id || doc.id}>
                      {doc.displayName || doc.name} ({doc.email})
                    </option>
                  ))}
                </select>
              </div>
            )}

            {/* Doctor-specific: Invite Code */}
            {role === 'doctor' && (
              <div className="auth-field">
                <label className="auth-field__label" htmlFor="reg-doc-code">
                  Doctor Invite / Credential Code
                </label>
                <input
                  id="reg-doc-code"
                  type="text"
                  required
                  className="auth-field__input"
                  value={form.doctorInviteCode}
                  onChange={set('doctorInviteCode')}
                />
              </div>
            )}

            {/* Caregiver-specific: Patient Link Code */}
            {role === 'caregiver' && (
              <div className="auth-field">
                <label className="auth-field__label" htmlFor="reg-invite">
                  Patient Link / Invite Code{' '}
                  <span className="optional-hint">(Optional)</span>
                </label>
                <input
                  id="reg-invite"
                  type="text"
                  className="auth-field__input"
                  value={form.inviteCode}
                  onChange={set('inviteCode')}
                  placeholder="Enter patient invite code if available"
                />
              </div>
            )}

            {/* Error */}
            {error && (
              <div role="alert" className="auth-error">
                <AlertCircle size={16} className="auth-error__icon" />
                <span>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={isSubmitting}
              className={`auth-submit-btn ${isSubmitting ? 'auth-submit-btn--loading' : ''}`}
            >
              {isSubmitting ? 'Creating account...' : 'Create account'}
            </button>
          </form>

          {/* Footer */}
          <div className="auth-footer auth-animate auth-animate--d5">
            Already have an account?{' '}
            <Link to="/login" className="auth-footer__link">
              Sign in
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
