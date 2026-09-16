import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  User,
  Mail,
  Shield,
  Stethoscope,
  Users,
  Copy,
  Check,
  Edit3,
  Plus,
  Trash2,
  Heart,
  Activity,
  AlertCircle,
  CheckCircle2,
  Calendar,
  Sparkles,
  X,
  Search,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';

export default function ProfilePage() {
  const { user, refreshUser } = useAuth();

  const [profileData, setProfileData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Doctor Assignment state
  const [doctors, setDoctors] = useState([]);
  const [doctorSearch, setDoctorSearch] = useState('');
  const [isDoctorModalOpen, setIsDoctorModalOpen] = useState(false);
  const [isAssigningDoctor, setIsAssigningDoctor] = useState(false);

  // Caregiver Links & Invite state
  const [caregiverLinks, setCaregiverLinks] = useState([]);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);
  const [generatedInvite, setGeneratedInvite] = useState(null);
  const [isGeneratingInvite, setIsGeneratingInvite] = useState(false);
  const [copiedCode, setCopiedCode] = useState(false);

  // Caregiver Patient Link Modal state (for caregiver role)
  const [isLinkPatientModalOpen, setIsLinkPatientModalOpen] = useState(false);
  const [patientInviteCodeInput, setPatientInviteCodeInput] = useState('');
  const [isLinkingPatient, setIsLinkingPatient] = useState(false);

  // Edit Name Modal state
  const [isEditNameModalOpen, setIsEditNameModalOpen] = useState(false);
  const [nameInput, setNameInput] = useState('');
  const [isSavingName, setIsSavingName] = useState(false);

  // Edit Baseline Modal state (Patient only)
  const [isEditBaselineModalOpen, setIsEditBaselineModalOpen] = useState(false);
  const [baselineForm, setBaselineForm] = useState({
    age: '',
    sex: 'male',
    heightCm: '',
    weightKg: '',
    smokingPackYears: '0',
    alcoholUse: 'none',
    conditionsStr: '',
  });
  const [isSavingBaseline, setIsSavingBaseline] = useState(false);

  const fetchFullProfile = useCallback(async () => {
    try {
      setIsLoading(true);
      setError('');
      const res = await api.get('/auth/me');
      setProfileData(res.data);
      setNameInput(res.data?.user?.displayName || '');

      if (res.data?.patient) {
        const p = res.data.patient;
        setBaselineForm({
          age: p.age ?? '',
          sex: p.sex ?? 'male',
          heightCm: p.heightCm ?? '',
          weightKg: p.weightKg ?? '',
          smokingPackYears: p.smokingPackYears ?? '0',
          alcoholUse: p.alcoholUse ?? 'none',
          conditionsStr: (p.existingConditions || []).join(', '),
        });
      }

      // If patient or caregiver, fetch caregiver links
      if (res.data?.user?.role === 'patient' || res.data?.user?.role === 'caregiver') {
        try {
          const linksRes = await api.get('/caregiver/links');
          setCaregiverLinks(linksRes.data?.links || []);
        } catch {
          setCaregiverLinks([]);
        }
      }

      // Fetch doctors directory
      try {
        const docRes = await api.get('/auth/doctors');
        setDoctors(docRes.data?.doctors || []);
      } catch {
        setDoctors([]);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to load profile data.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchFullProfile();
  }, [fetchFullProfile]);

  const showSuccess = (msg) => {
    setSuccessMessage(msg);
    setTimeout(() => setSuccessMessage(''), 4000);
  };

  // --- Actions ---

  // 1. Update Display Name
  const handleSaveName = async (e) => {
    e.preventDefault();
    if (!nameInput.trim()) return;
    setIsSavingName(true);
    try {
      await api.put('/auth/profile', { displayName: nameInput.trim() });
      await refreshUser();
      await fetchFullProfile();
      setIsEditNameModalOpen(false);
      showSuccess('Display name updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update name.');
    } finally {
      setIsSavingName(false);
    }
  };

  // 2. Assign / Change Doctor
  const handleAssignDoctor = async (doctorId) => {
    setIsAssigningDoctor(true);
    try {
      const res = await api.put('/auth/assign-doctor', { doctorId });
      await refreshUser();
      await fetchFullProfile();
      setIsDoctorModalOpen(false);
      showSuccess(res.data?.message || 'Primary care physician updated.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to assign doctor.');
    } finally {
      setIsAssigningDoctor(false);
    }
  };

  // 3. Generate Caregiver Invite Code
  const handleGenerateCaregiverInvite = async () => {
    setIsGeneratingInvite(true);
    try {
      const res = await api.post('/caregiver/invite');
      setGeneratedInvite(res.data);
      const linksRes = await api.get('/caregiver/links');
      setCaregiverLinks(linksRes.data?.links || []);
      showSuccess('Invite code created! Valid for 48 hours.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to generate invite code.');
    } finally {
      setIsGeneratingInvite(false);
    }
  };

  // 4. Revoke Caregiver Link
  const handleRevokeLink = async (linkId) => {
    if (!window.confirm('Are you sure you want to disconnect this caregiver?')) return;
    try {
      await api.post(`/caregiver/revoke/${linkId}`);
      const linksRes = await api.get('/caregiver/links');
      setCaregiverLinks(linksRes.data?.links || []);
      showSuccess('Caregiver link revoked.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to revoke link.');
    }
  };

  // 5. Caregiver connects to patient with code
  const handleCaregiverConnectPatient = async (e) => {
    e.preventDefault();
    if (!patientInviteCodeInput.trim()) return;
    setIsLinkingPatient(true);
    try {
      await api.post('/caregiver/accept', { inviteCode: patientInviteCodeInput.trim() });
      await refreshUser();
      await fetchFullProfile();
      setIsLinkPatientModalOpen(false);
      setPatientInviteCodeInput('');
      showSuccess('Successfully linked to patient!');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to link patient with this code.');
    } finally {
      setIsLinkingPatient(false);
    }
  };

  // 6. Update Patient Baseline Health Data
  const handleSaveBaseline = async (e) => {
    e.preventDefault();
    setIsSavingBaseline(true);
    try {
      const conditions = baselineForm.conditionsStr
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean);

      await api.put('/auth/profile', {
        age: baselineForm.age ? parseInt(baselineForm.age, 10) : undefined,
        sex: baselineForm.sex,
        heightCm: baselineForm.heightCm ? parseFloat(baselineForm.heightCm) : undefined,
        weightKg: baselineForm.weightKg ? parseFloat(baselineForm.weightKg) : undefined,
        smokingPackYears: baselineForm.smokingPackYears
          ? parseFloat(baselineForm.smokingPackYears)
          : 0,
        alcoholUse: baselineForm.alcoholUse,
        existingConditions: conditions,
      });

      await fetchFullProfile();
      setIsEditBaselineModalOpen(false);
      showSuccess('Health baseline updated successfully.');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to update health baseline.');
    } finally {
      setIsSavingBaseline(false);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedCode(true);
    setTimeout(() => setCopiedCode(false), 2500);
  };

  if (isLoading) {
    return (
      <div className="max-w-4xl mx-auto py-16 text-center text-ink-soft">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent mb-3" />
        <p className="text-sm font-medium">Loading your profile...</p>
      </div>
    );
  }

  const currentUser = profileData?.user || user;
  const patientRecord = profileData?.patient;
  const assignedDoctor = patientRecord?.assignedDoctorId;
  const role = currentUser?.role || 'patient';

  const filteredDoctors = doctors.filter(
    (d) =>
      d.displayName?.toLowerCase().includes(doctorSearch.toLowerCase()) ||
      d.email?.toLowerCase().includes(doctorSearch.toLowerCase())
  );

  return (
    <div className="max-w-4xl mx-auto space-y-8 text-ink">
      {/* Toast Notifications */}
      {successMessage && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 flex items-center gap-3 animate-in fade-in"
        >
          <CheckCircle2 size={20} className="text-emerald-600 shrink-0" />
          <span className="text-sm font-medium">{successMessage}</span>
        </div>
      )}

      {error && (
        <div
          role="alert"
          className="p-4 rounded-xl bg-tier-critical/10 border border-tier-critical/30 text-tier-critical flex items-center justify-between gap-3"
        >
          <div className="flex items-center gap-3">
            <AlertCircle size={20} className="shrink-0" />
            <span className="text-sm font-medium">{error}</span>
          </div>
          <button
            onClick={() => setError('')}
            className="text-tier-critical hover:opacity-75"
            aria-label="Dismiss error"
          >
            <X size={18} />
          </button>
        </div>
      )}

      {/* 1. Header Profile Banner */}
      <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 sm:p-8 flex flex-col sm:flex-row sm:items-center justify-between gap-6">
        <div className="flex items-center gap-5">
          {/* Avatar Circle */}
          <div className="w-20 h-20 rounded-full bg-gradient-to-tr from-brand to-brand-light text-white font-display font-extrabold text-2xl flex items-center justify-center shadow-md shrink-0">
            {currentUser?.displayName
              ? currentUser.displayName
                  .split(' ')
                  .map((n) => n[0])
                  .join('')
                  .toUpperCase()
                  .slice(0, 2)
              : 'U'}
          </div>

          <div className="space-y-1">
            <div className="flex items-center gap-3 flex-wrap">
              <h1 className="text-h2 font-display font-bold text-ink">
                {currentUser?.displayName || 'CareOClock Member'}
              </h1>
              <span
                className={`px-3 py-1 rounded-full text-xs font-semibold uppercase tracking-wider ${
                  role === 'doctor'
                    ? 'bg-blue-500/15 text-blue-700 border border-blue-500/30'
                    : role === 'caregiver'
                    ? 'bg-purple-500/15 text-purple-700 border border-purple-500/30'
                    : 'bg-emerald-500/15 text-emerald-800 border border-emerald-500/30'
                }`}
              >
                {role === 'doctor' ? 'Physician' : role === 'caregiver' ? 'Family Caregiver' : 'Patient'}
              </span>
            </div>

            <p className="text-sm text-ink-soft flex items-center gap-2">
              <Mail size={15} /> {currentUser?.email}
            </p>

            <p className="text-xs text-ink-soft flex items-center gap-2 pt-1">
              <Calendar size={14} /> Member since{' '}
              {currentUser?.createdAt
                ? new Date(currentUser.createdAt).toLocaleDateString(undefined, {
                    month: 'long',
                    year: 'numeric',
                  })
                : '2026'}
            </p>
          </div>
        </div>

        <button
          onClick={() => {
            setNameInput(currentUser?.displayName || '');
            setIsEditNameModalOpen(true);
          }}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full border border-line bg-paper hover:bg-surface text-sm font-semibold text-ink transition-colors shadow-sm self-start sm:self-center"
        >
          <Edit3 size={16} className="text-brand" /> Edit Name
        </button>
      </div>

      {/* 2. ROLE: PATIENT SPECIFIC SECTIONS */}
      {role === 'patient' && (
        <div className="space-y-8">
          {/* Section: Primary Care Physician Connection */}
          <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-700 flex items-center justify-center shrink-0">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <h2 className="text-h3 font-display font-bold text-ink">Primary Care Physician</h2>
                  <p className="text-xs text-ink-soft">
                    Clinical oversight for reviewing vital trends and medical deterioration alerts
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setDoctorSearch('');
                  setIsDoctorModalOpen(true);
                }}
                className="bg-brand hover:bg-brand-dark text-white font-display font-semibold text-sm px-4 py-2 rounded-full transition-colors shadow-sm flex items-center gap-2"
              >
                <Stethoscope size={15} />
                {assignedDoctor ? 'Change Doctor' : 'Assign a Doctor'}
              </button>
            </div>

            <hr className="border-line" />

            {assignedDoctor ? (
              <div className="flex items-center justify-between p-4 rounded-xl bg-paper border border-line flex-wrap gap-4">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center">
                    Dr
                  </div>
                  <div>
                    <h3 className="text-base font-display font-bold text-ink">
                      {assignedDoctor.displayName}
                    </h3>
                    <p className="text-xs text-ink-soft">{assignedDoctor.email}</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-800 border border-emerald-500/30">
                    Active Oversight
                  </span>
                  <button
                    onClick={() => handleAssignDoctor(null)}
                    disabled={isAssigningDoctor}
                    className="text-xs text-tier-critical hover:underline ml-2"
                  >
                    Unassign
                  </button>
                </div>
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-start gap-3">
                <AlertCircle size={20} className="text-amber-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-sm font-semibold text-amber-900">No Doctor Assigned Yet</p>
                  <p className="text-xs text-amber-800">
                    You can check in your daily vitals independently, but connecting with a doctor allows them to review your health trends and respond to any high-risk alerts.
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Section: Care Circle (Caregivers) */}
          <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-700 flex items-center justify-center shrink-0">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="text-h3 font-display font-bold text-ink">My Care Circle (Caregivers)</h2>
                  <p className="text-xs text-ink-soft">
                    Family members or caregivers who receive reassuring summaries of your health
                  </p>
                </div>
              </div>

              <button
                onClick={() => {
                  setGeneratedInvite(null);
                  setIsInviteModalOpen(true);
                }}
                className="bg-brand hover:bg-brand-dark text-white font-display font-semibold text-sm px-4 py-2 rounded-full transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} /> Invite Caregiver
              </button>
            </div>

            <hr className="border-line" />

            {caregiverLinks.length > 0 ? (
              <div className="space-y-3">
                {caregiverLinks.map((link) => (
                  <div
                    key={link._id}
                    className="flex items-center justify-between p-4 rounded-xl bg-paper border border-line flex-wrap gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-purple-100 text-purple-800 font-bold text-sm flex items-center justify-center">
                        {link.caregiverUserId?.displayName?.[0] || 'C'}
                      </div>
                      <div>
                        <div className="text-sm font-bold text-ink">
                          {link.caregiverUserId?.displayName || 'Pending Caregiver Invite'}
                        </div>
                        <div className="text-xs text-ink-soft">
                          {link.caregiverUserId?.email || (
                            <span className="font-mono text-brand font-semibold">
                              Code: {link.inviteCode || 'Active Invite'}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <span
                        className={`text-xs px-2.5 py-1 rounded-full font-semibold uppercase ${
                          link.status === 'active'
                            ? 'bg-emerald-500/10 text-emerald-800'
                            : 'bg-amber-500/10 text-amber-800'
                        }`}
                      >
                        {link.status}
                      </span>
                      <button
                        onClick={() => handleRevokeLink(link._id)}
                        className="p-1.5 rounded-lg text-ink-soft hover:text-tier-critical hover:bg-tier-critical/10 transition-colors"
                        title="Revoke link"
                      >
                        <Trash2 size={16} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 rounded-xl bg-paper border border-line text-sm text-ink-soft text-center py-6">
                <Users size={28} className="mx-auto text-ink-soft/60 mb-2" />
                <p className="font-medium text-ink">No caregivers linked yet</p>
                <p className="text-xs text-ink-soft mt-1">
                  Invite your children, spouse, or personal caregiver so they can keep an eye on your safety.
                </p>
              </div>
            )}
          </div>

          {/* Section: Baseline Clinical Profile */}
          <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-brand-light/50 text-brand flex items-center justify-center shrink-0">
                  <Activity size={20} />
                </div>
                <div>
                  <h2 className="text-h3 font-display font-bold text-ink">Health Baseline & Metrics</h2>
                  <p className="text-xs text-ink-soft">
                    Used by CareOClock AI models to calibrate personalized health deterioration scores
                  </p>
                </div>
              </div>

              <button
                onClick={() => setIsEditBaselineModalOpen(true)}
                className="px-4 py-2 rounded-full border border-line bg-paper hover:bg-surface text-sm font-semibold text-ink transition-colors shadow-sm flex items-center gap-2"
              >
                <Edit3 size={15} className="text-brand" /> Edit Baseline
              </button>
            </div>

            <hr className="border-line" />

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
              <div className="p-3.5 rounded-xl bg-paper border border-line">
                <div className="text-xs text-ink-soft uppercase font-semibold">Age</div>
                <div className="text-h3 font-display font-bold text-ink mt-0.5">
                  {patientRecord?.age || 'Not set'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-paper border border-line">
                <div className="text-xs text-ink-soft uppercase font-semibold">Biological Sex</div>
                <div className="text-h3 font-display font-bold text-ink mt-0.5 capitalize">
                  {patientRecord?.sex || 'Not set'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-paper border border-line">
                <div className="text-xs text-ink-soft uppercase font-semibold">Height & Weight</div>
                <div className="text-base font-display font-bold text-ink mt-0.5">
                  {patientRecord?.heightCm ? `${patientRecord.heightCm} cm` : '—'} /{' '}
                  {patientRecord?.weightKg ? `${patientRecord.weightKg} kg` : '—'}
                </div>
              </div>

              <div className="p-3.5 rounded-xl bg-paper border border-line">
                <div className="text-xs text-ink-soft uppercase font-semibold">BMI Index</div>
                <div className="text-h3 font-display font-bold text-brand mt-0.5">
                  {patientRecord?.bmi ? patientRecord.bmi.toFixed(1) : '—'}
                </div>
              </div>
            </div>

            {patientRecord?.existingConditions?.length > 0 && (
              <div className="pt-2">
                <div className="text-xs text-ink-soft font-semibold uppercase mb-2">
                  Existing Clinical Conditions
                </div>
                <div className="flex flex-wrap gap-2">
                  {patientRecord.existingConditions.map((cond, idx) => (
                    <span
                      key={idx}
                      className="px-3 py-1 rounded-full bg-paper border border-line text-xs font-medium text-ink"
                    >
                      {cond}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. ROLE: DOCTOR SPECIFIC SECTIONS */}
      {role === 'doctor' && (
        <div className="space-y-6">
          <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-500/15 text-blue-700 flex items-center justify-center shrink-0">
                  <Stethoscope size={20} />
                </div>
                <div>
                  <h2 className="text-h3 font-display font-bold text-ink">Clinical Practice Overview</h2>
                  <p className="text-xs text-ink-soft">Physician credentials and patient caseload</p>
                </div>
              </div>

              <Link
                to="/app/doctor"
                className="bg-brand hover:bg-brand-dark text-white font-display font-semibold text-sm px-5 py-2.5 rounded-full transition-colors shadow-sm"
              >
                Go to Triage Dashboard &rarr;
              </Link>
            </div>

            <hr className="border-line" />

            <div className="grid sm:grid-cols-2 gap-4">
              <div className="p-4 rounded-xl bg-paper border border-line flex items-center justify-between">
                <div>
                  <div className="text-xs text-ink-soft uppercase font-semibold">
                    Monitored Patients
                  </div>
                  <div className="text-h2 font-display font-extrabold text-ink mt-1">
                    {profileData?.doctorStats?.assignedPatientsCount ?? 0}
                  </div>
                </div>
                <Users size={32} className="text-brand opacity-60" />
              </div>

              <div className="p-4 rounded-xl bg-paper border border-line space-y-2">
                <div className="text-xs text-ink-soft uppercase font-semibold">
                  Shareable Doctor ID for Patients
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    readOnly
                    value={currentUser?._id || ''}
                    className="flex-1 bg-surface border border-line rounded-lg px-3 py-1.5 text-xs font-mono text-ink select-all"
                  />
                  <button
                    onClick={() => copyToClipboard(currentUser?._id || '')}
                    className="p-2 rounded-lg bg-surface border border-line hover:bg-paper text-ink transition-colors"
                    title="Copy Doctor ID"
                  >
                    {copiedCode ? <Check size={16} className="text-emerald-600" /> : <Copy size={16} />}
                  </button>
                </div>
                <p className="text-xs text-ink-soft">
                  Patients can also search and assign you directly from their profile.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 4. ROLE: CAREGIVER SPECIFIC SECTIONS */}
      {role === 'caregiver' && (
        <div className="space-y-6">
          <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 space-y-4">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-purple-500/15 text-purple-700 flex items-center justify-center shrink-0">
                  <Users size={20} />
                </div>
                <div>
                  <h2 className="text-h3 font-display font-bold text-ink">Monitored Loved Ones</h2>
                  <p className="text-xs text-ink-soft">Patients linked to your family reassurance account</p>
                </div>
              </div>

              <button
                onClick={() => {
                  setPatientInviteCodeInput('');
                  setIsLinkPatientModalOpen(true);
                }}
                className="bg-brand hover:bg-brand-dark text-white font-display font-semibold text-sm px-4 py-2 rounded-full transition-colors shadow-sm flex items-center gap-2"
              >
                <Plus size={16} /> Link Another Patient
              </button>
            </div>

            <hr className="border-line" />

            {caregiverLinks.length > 0 ? (
              <div className="space-y-3">
                {caregiverLinks.map((link) => (
                  <div
                    key={link._id}
                    className="flex items-center justify-between p-4 rounded-xl bg-paper border border-line flex-wrap gap-4"
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-emerald-100 text-emerald-800 font-bold flex items-center justify-center">
                        {link.patientId?.userId?.displayName?.[0] || 'P'}
                      </div>
                      <div>
                        <div className="text-base font-bold text-ink">
                          {link.patientId?.userId?.displayName || 'Patient'}
                        </div>
                        <div className="text-xs text-ink-soft">
                          Age: {link.patientId?.age || '—'} • Sex: {link.patientId?.sex || '—'}
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-3">
                      <Link
                        to="/app/caregiver"
                        className="text-xs font-semibold px-3 py-1.5 rounded-full bg-brand text-white hover:bg-brand-dark transition-colors"
                      >
                        View Dashboard
                      </Link>
                      <button
                        onClick={() => handleRevokeLink(link._id)}
                        className="text-xs text-tier-critical hover:underline"
                      >
                        Disconnect
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-6 rounded-xl bg-paper border border-line text-center space-y-3">
                <Users size={32} className="mx-auto text-ink-soft/60" />
                <p className="font-semibold text-ink">No patients linked yet</p>
                <p className="text-xs text-ink-soft max-w-md mx-auto">
                  Ask your family member to generate an 8-character invite code from their profile, then click &quot;Link Another Patient&quot; above.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* --- MODALS --- */}

      {/* Modal 1: Edit Name */}
      {isEditNameModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-ritual border border-line max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-display font-bold text-ink">Edit Display Name</h3>
              <button onClick={() => setIsEditNameModalOpen(false)}>
                <X size={20} className="text-ink-soft hover:text-ink" />
              </button>
            </div>
            <form onSubmit={handleSaveName} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft mb-1.5">
                  Full Name
                </label>
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-base bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsEditNameModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-line text-sm text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingName}
                  className="px-5 py-2 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark"
                >
                  {isSavingName ? 'Saving...' : 'Save Changes'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 2: Assign / Change Doctor */}
      {isDoctorModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-ritual border border-line max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-display font-bold text-ink">Select Primary Care Physician</h3>
              <button onClick={() => setIsDoctorModalOpen(false)}>
                <X size={20} className="text-ink-soft hover:text-ink" />
              </button>
            </div>

            <div className="relative">
              <Search size={18} className="absolute left-3 top-3 text-ink-soft" />
              <input
                type="text"
                value={doctorSearch}
                onChange={(e) => setDoctorSearch(e.target.value)}
                placeholder="Search physician by name or email..."
                className="w-full rounded-lg border border-line pl-10 pr-4 py-2.5 text-sm bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
              />
            </div>

            <div className="flex-1 overflow-y-auto space-y-2 pr-1 min-h-[180px]">
              {filteredDoctors.length > 0 ? (
                filteredDoctors.map((doc) => {
                  const isCurrent = assignedDoctor?._id === doc._id;
                  return (
                    <div
                      key={doc._id}
                      className={`p-3.5 rounded-xl border flex items-center justify-between gap-3 transition-colors ${
                        isCurrent
                          ? 'bg-brand-light/30 border-brand'
                          : 'bg-paper border-line hover:border-brand/40'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-full bg-blue-100 text-blue-800 font-bold flex items-center justify-center shrink-0">
                          Dr
                        </div>
                        <div>
                          <div className="text-sm font-bold text-ink">{doc.displayName}</div>
                          <div className="text-xs text-ink-soft">{doc.email}</div>
                        </div>
                      </div>

                      <button
                        onClick={() => handleAssignDoctor(doc._id)}
                        disabled={isAssigningDoctor || isCurrent}
                        className={`text-xs font-semibold px-4 py-2 rounded-full transition-colors ${
                          isCurrent
                            ? 'bg-emerald-600 text-white cursor-default'
                            : 'bg-brand hover:bg-brand-dark text-white'
                        }`}
                      >
                        {isCurrent ? 'Current Doctor' : 'Select'}
                      </button>
                    </div>
                  );
                })
              ) : (
                <p className="text-center text-sm text-ink-soft py-8">
                  No registered physicians found matching &quot;{doctorSearch}&quot;.
                </p>
              )}
            </div>

            <div className="pt-3 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => setIsDoctorModalOpen(false)}
                className="px-4 py-2 rounded-full border border-line text-sm text-ink hover:bg-paper"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 3: Invite Caregiver */}
      {isInviteModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-ritual border border-line max-w-md w-full p-6 space-y-5 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-display font-bold text-ink">Invite Family / Caregiver</h3>
              <button onClick={() => setIsInviteModalOpen(false)}>
                <X size={20} className="text-ink-soft hover:text-ink" />
              </button>
            </div>

            {generatedInvite ? (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-900 space-y-2">
                  <p className="text-xs uppercase font-semibold tracking-wider text-emerald-800">
                    Share this 8-character invite code
                  </p>
                  <div className="font-mono text-3xl font-extrabold text-brand tracking-widest py-1 select-all">
                    {generatedInvite.inviteCode}
                  </div>
                  <p className="text-xs text-ink-soft">
                    Valid for 48 hours. Your family member can enter this code in their Caregiver portal to connect.
                  </p>
                </div>

                <button
                  onClick={() => copyToClipboard(generatedInvite.inviteCode)}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-display font-semibold rounded-full px-4 py-3 text-base transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  {copiedCode ? <Check size={18} /> : <Copy size={18} />}
                  {copiedCode ? 'Code Copied!' : 'Copy Invite Code'}
                </button>
              </div>
            ) : (
              <div className="space-y-4">
                <p className="text-sm text-ink-soft leading-relaxed">
                  Generate an easy-to-share 8-character code. Your family member or caregiver can enter this code when registering or inside their Caregiver portal to link with your account.
                </p>

                <button
                  onClick={handleGenerateCaregiverInvite}
                  disabled={isGeneratingInvite}
                  className="w-full bg-brand hover:bg-brand-dark text-white font-display font-semibold rounded-full px-4 py-3 text-base transition-colors shadow-sm flex items-center justify-center gap-2"
                >
                  <Sparkles size={18} />
                  {isGeneratingInvite ? 'Generating Code...' : 'Generate New Invite Code'}
                </button>
              </div>
            )}

            <div className="pt-2 border-t border-line flex justify-end">
              <button
                type="button"
                onClick={() => setIsInviteModalOpen(false)}
                className="px-4 py-2 rounded-full border border-line text-sm text-ink hover:bg-paper"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal 4: Link Patient (For Caregiver Role) */}
      {isLinkPatientModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-ritual border border-line max-w-md w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-display font-bold text-ink">Link with Loved One</h3>
              <button onClick={() => setIsLinkPatientModalOpen(false)}>
                <X size={20} className="text-ink-soft hover:text-ink" />
              </button>
            </div>
            <form onSubmit={handleCaregiverConnectPatient} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft mb-1.5">
                  Patient Invite Code
                </label>
                <input
                  type="text"
                  value={patientInviteCodeInput}
                  onChange={(e) => setPatientInviteCodeInput(e.target.value.toUpperCase())}
                  placeholder="e.g. CC-A9B2K4"
                  className="w-full rounded-lg border border-line px-3 py-2.5 text-base uppercase font-mono tracking-wider bg-paper text-ink focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
                <p className="text-xs text-ink-soft mt-1">
                  Ask your family member to generate this code from their CareOClock Profile &gt; Care Circle.
                </p>
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsLinkPatientModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-line text-sm text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLinkingPatient}
                  className="px-5 py-2 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark"
                >
                  {isLinkingPatient ? 'Linking...' : 'Connect'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Edit Baseline Health Profile */}
      {isEditBaselineModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-surface rounded-ritual border border-line max-w-lg w-full p-6 space-y-4 shadow-xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between">
              <h3 className="text-h3 font-display font-bold text-ink">Edit Health Baseline</h3>
              <button onClick={() => setIsEditBaselineModalOpen(false)}>
                <X size={20} className="text-ink-soft hover:text-ink" />
              </button>
            </div>
            <form onSubmit={handleSaveBaseline} className="space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                    Age
                  </label>
                  <input
                    type="number"
                    value={baselineForm.age}
                    onChange={(e) => setBaselineForm({ ...baselineForm, age: e.target.value })}
                    min="18"
                    max="120"
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-paper text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                    Biological Sex
                  </label>
                  <select
                    value={baselineForm.sex}
                    onChange={(e) => setBaselineForm({ ...baselineForm, sex: e.target.value })}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-paper text-ink"
                  >
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={baselineForm.heightCm}
                    onChange={(e) => setBaselineForm({ ...baselineForm, heightCm: e.target.value })}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-paper text-ink"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={baselineForm.weightKg}
                    onChange={(e) => setBaselineForm({ ...baselineForm, weightKg: e.target.value })}
                    className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-paper text-ink"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold uppercase text-ink-soft mb-1">
                  Existing Medical Conditions (comma-separated)
                </label>
                <input
                  type="text"
                  value={baselineForm.conditionsStr}
                  onChange={(e) =>
                    setBaselineForm({ ...baselineForm, conditionsStr: e.target.value })
                  }
                  placeholder="e.g. Hypertension, Type 2 Diabetes, Asthma"
                  className="w-full rounded-lg border border-line px-3 py-2 text-sm bg-paper text-ink"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-line">
                <button
                  type="button"
                  onClick={() => setIsEditBaselineModalOpen(false)}
                  className="px-4 py-2 rounded-full border border-line text-sm text-ink hover:bg-paper"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isSavingBaseline}
                  className="px-5 py-2 rounded-full bg-brand text-white font-semibold text-sm hover:bg-brand-dark"
                >
                  {isSavingBaseline ? 'Saving...' : 'Save Baseline'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
