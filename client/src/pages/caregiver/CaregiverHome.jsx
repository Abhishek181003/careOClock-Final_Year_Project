import { useEffect, useState, useCallback, useMemo } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2,
  AlertCircle,
  Phone,
  Clock,
  Heart,
  Shield,
  Users,
  ArrowRight,
  UserPlus,
  Sparkles,
  Activity,
  RefreshCw,
  User,
  Stethoscope,
  ChevronRight,
  Pill,
  ExternalLink,
} from 'lucide-react';
import { api } from '../../api/client';
import AssessmentCard from '../../components/AssessmentCard';
import { CONFIG } from '../../config';
import '../../components/dashboards/Dashboards.css';

/**
 * Caregiver Dashboard (NFR3 Zero-Training, Zero-Jargon Reassurance Screen)
 *
 * Strictly Read-Only:
 * - Supports MULTIPLE linked patients with a seamless switcher.
 * - Displays complete personal details, physician connection, and reassurance stats for the active patient.
 * - Multi-patient summary roster for fast glance over all loved ones.
 * - Highlights overdue check-ins and missed medication alerts.
 * - NO editable fields, forms, or clinical data manipulation.
 */
export default function CaregiverHome() {
  const [linkedPatients, setLinkedPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState('');
  const [statusByPatientId, setStatusByPatientId] = useState({});
  const [assessment, setAssessment] = useState(null);
  const [patientMedicines, setPatientMedicines] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Invite code linking modal/card state
  const [showAddModal, setShowAddModal] = useState(false);
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');

  // Currently active patient object
  const activePatient = useMemo(() => {
    if (!linkedPatients.length) return null;
    return linkedPatients.find((p) => p._id === selectedPatientId) || linkedPatients[0];
  }, [linkedPatients, selectedPatientId]);

  // Load all linked patients for the caregiver
  const fetchCaregiverData = useCallback(async (preferredPatientId = null) => {
    try {
      setIsLoading(true);

      // Fetch all links from /caregiver/links
      const linksRes = await api.get('/caregiver/links');
      const rawLinks = linksRes.data?.links || [];
      const activeLinks = rawLinks.filter((l) => l.status === 'active' && l.patientId);

      const patients = activeLinks.map((l) => l.patientId);
      setLinkedPatients(patients);

      if (patients.length > 0) {
        const nextSelectedId = preferredPatientId ||
          (patients.some((p) => p._id === selectedPatientId) ? selectedPatientId : patients[0]._id);
        setSelectedPatientId(nextSelectedId);
      } else {
        setSelectedPatientId('');
      }
    } catch (err) {
      console.error('Failed to load caregiver data:', err);
      setLinkedPatients([]);
      setSelectedPatientId('');
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedPatientId]);

  useEffect(() => {
    fetchCaregiverData();
  }, [fetchCaregiverData]);

  // Load telemetry and metrics for the currently active patient
  const loadActivePatientDetails = useCallback(async (patient) => {
    if (!patient?._id) return;

    try {
      // 1. Fetch latest vitals for selected patient
      const vitalsRes = await api.get(`/clinical/vitals?patientId=${patient._id}&limit=1`);
      const latest = vitalsRes.data?.vitals?.[0];

      // Check if today's check-in is overdue (after 12 PM with no readings today, or no readings at all)
      const currentHour = new Date().getHours();
      const todayStr = new Date().toISOString().slice(0, 10);
      const latestDateStr = latest?.recordedAt ? new Date(latest.recordedAt).toISOString().slice(0, 10) : null;
      const isToday = latestDateStr === todayStr;
      const isOverdue = (!isToday && currentHour >= 12) || !latest;

      const pName = patient.userId?.displayName || patient.displayName || 'Loved One';
      const firstName = pName.split(' ')[0];

      let newStatusState = null;
      if (latest) {
        const timeStr = new Date(latest.recordedAt).toLocaleTimeString([], {
          hour: '2-digit',
          minute: '2-digit',
        });

        const hasElevatedVitals =
          latest.heartRate > 100 || latest.spo2 < 93 || latest.systolicBp > 145;
        const symptoms = latest.symptomFlags || latest.symptoms || [];

        if (hasElevatedVitals || symptoms.length > 0) {
          const symptomText =
            symptoms.length > 0
              ? `${firstName} reported feeling ${symptoms.join(' and ')}.`
              : 'Vital signs are slightly elevated from usual comfortable baseline.';
          newStatusState = {
            level: 'attention',
            heading: `Please Check In on ${firstName}`,
            plainReason: `${symptomText} A friendly phone call or in-person visit is recommended today.`,
            lastChecked: `Today at ${timeStr}`,
            medicationStatus: 'Daily schedule active',
            vitalsComfort: 'Slightly elevated',
            isOverdue,
          };
        } else {
          newStatusState = {
            level: 'fine',
            heading: `${firstName} is Doing Great`,
            plainReason: 'All recorded readings are in their comfortable normal range today.',
            lastChecked: `Today at ${timeStr}`,
            medicationStatus: 'All doses logged on time',
            vitalsComfort: 'Comfortable & resting',
            isOverdue,
          };
        }
      } else {
        newStatusState = {
          level: isOverdue ? 'attention' : 'fine',
          heading: isOverdue ? `Check-in Overdue for ${firstName}` : `${firstName} is Monitored`,
          plainReason: isOverdue
            ? `${firstName} has not logged their scheduled daily health ritual yet today.`
            : 'Waiting for their first daily health check-in readings today.',
          lastChecked: 'No readings logged today yet',
          medicationStatus: 'Daily routine active',
          vitalsComfort: 'Awaiting daily check-in',
          isOverdue,
        };
      }

      setStatusByPatientId((prev) => ({
        ...prev,
        [patient._id]: newStatusState,
      }));

      // 2. Fetch latest AI assessment
      try {
        const assessRes = await api.get(`/clinical/assessments/${patient._id}?limit=1`);
        const assessments = assessRes.data?.assessments || [];
        setAssessment(assessments[0] || null);
      } catch {
        setAssessment(null);
      }

      // 3. Fetch medicines to check missed doses
      try {
        const medRes = await api.get(`/medicines?patientId=${patient._id}`);
        setPatientMedicines(medRes.data?.medicines || []);
      } catch {
        setPatientMedicines([]);
      }
    } catch (err) {
      console.error('Failed to load active patient details:', err);
    }
  }, []);

  useEffect(() => {
    if (activePatient) {
      loadActivePatientDetails(activePatient);
    }
  }, [activePatient, loadActivePatientDetails]);

  // Handle linking a new patient code
  const handleLinkPatient = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLinkError('');
    setLinkSuccess('');
    setIsLinking(true);

    try {
      const res = await api.post('/caregiver/accept', { inviteCode: inviteCode.trim() });
      setLinkSuccess(res.data?.message || 'Patient successfully linked to your care circle!');
      const newPatientId = res.data?.link?.patientId;
      setInviteCode('');
      setTimeout(() => {
        setShowAddModal(false);
        setLinkSuccess('');
      }, 1500);
      await fetchCaregiverData(newPatientId);
    } catch (err) {
      setLinkError(
        err.response?.data?.error ||
          err.response?.data?.details?.[0]?.message ||
          'Unable to link patient. Please verify the invite code.'
      );
    } finally {
      setIsLinking(false);
    }
  };

  // Derive active patient status
  const currentStatus = activePatient ? statusByPatientId[activePatient._id] : null;
  const isFine = currentStatus?.level === 'fine';
  const patientDisplayName = activePatient?.userId?.displayName || activePatient?.displayName || 'Loved One';
  const firstName = patientDisplayName.split(' ')[0];
  const patientPhone = activePatient?.phone || activePatient?.emergencyContact?.phone || '';
  const assignedDoctorName = activePatient?.assignedDoctorId?.displayName
    ? `Dr. ${activePatient.assignedDoctorId.displayName.replace(/^Dr\.\s*/i, '')}`
    : null;

  // Check for missed morning medicines (after 12 PM with morning slot medicines)
  const currentHour = new Date().getHours();
  const missedMorningMedicines = useMemo(() => {
    if (currentHour < 12) return [];
    return patientMedicines.filter((m) => m.schedule?.includes('morning'));
  }, [patientMedicines, currentHour]);

  if (isLoading) {
    return (
      <div className="dash dash-enter py-16 text-center text-ink-soft">
        <div className="dash-spinner" />
        <p className="text-sm font-medium">Checking care circle status...</p>
      </div>
    );
  }

  // ── Empty State: No Patients Linked ──────────────────────────────────────
  if (!linkedPatients.length) {
    return (
      <div className="dash dash-enter space-y-6">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Family Caregiver Portal</span>
          <h1 className="font-display font-extrabold text-2xl text-ink mt-0.5">Welcome to CareOClock</h1>
        </div>

        <div className="assess-card p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Users size={26} />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-ink">No Loved Ones Connected Yet</h2>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                Connect your elderly family members to view reassuring daily health summaries, medication adherence, and proactive alerts from one calm dashboard.
              </p>
            </div>
          </div>

          <hr className="border-line" />

          {/* Connect Patient Form */}
          <form onSubmit={handleLinkPatient} className="space-y-4">
            <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
              <UserPlus size={18} className="text-brand" /> Link with a Family Member
            </h3>
            <p className="text-xs text-ink-soft">
              Enter the 8-character invite code generated from your family member&apos;s CareOClock profile (or provided by their clinic).
            </p>

            <div className="flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. CC-A9B2K4"
                className="flex-1 rounded-xl border border-line px-4 py-3 text-base bg-paper text-ink uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-brand"
                required
              />
              <button
                type="submit"
                disabled={isLinking || !inviteCode.trim()}
                className="cg-action-btn cg-action-btn--primary disabled:opacity-50 shrink-0 justify-center"
              >
                {isLinking ? 'Connecting...' : 'Connect Loved One'}
                <ArrowRight size={16} />
              </button>
            </div>

            {linkError && (
              <div role="alert" className="p-3 rounded-xl bg-tier-critical/10 border border-tier-critical/30 text-tier-critical text-sm">
                {linkError}
              </div>
            )}

            {linkSuccess && (
              <div role="alert" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-sm">
                {linkSuccess}
              </div>
            )}
          </form>

          <div className="p-4 rounded-xl bg-paper border border-line text-xs text-ink-soft space-y-1.5">
            <p className="font-bold text-ink flex items-center gap-1.5">
              <Sparkles size={14} className="text-brand" /> How to get an invite code?
            </p>
            <p>1. Ask your loved one to log into CareOClock.</p>
            <p>2. Open their <strong>Profile &gt; Care Circle</strong>.</p>
            <p>3. Tap <strong>&quot;Invite Family Caregiver&quot;</strong> to generate and share the 8-character code with you.</p>
          </div>
        </div>
      </div>
    );
  }

  // ── Multi-Patient Active State ──────────────────────────────────────────
  return (
    <div className="dash dash-enter space-y-6">
      {/* ── Top Bar with Header & Add Loved One Trigger ─────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
            Family Caregiver Portal • Read-Only Reassurance
          </span>
          <h1 className="font-display font-extrabold text-2xl text-ink mt-0.5">
            Care Circle Overview
          </h1>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowAddModal(true)}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full border border-line bg-surface hover:bg-paper text-ink text-xs font-semibold shadow-sm transition-colors"
          >
            <UserPlus size={14} className="text-brand" />
            <span>Connect Another Loved One</span>
          </button>

          <button
            onClick={() => {
              setIsRefreshing(true);
              fetchCaregiverData();
            }}
            title="Refresh Status"
            className="triage-icon-btn"
            aria-label="Refresh caregiver status"
          >
            <RefreshCw size={16} className={isRefreshing ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Multi-Patient Switcher Tabs (Visible when >= 1 patient) ── */}
      <div className="bg-surface rounded-ritual border border-line p-2 shadow-sm">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 sm:pb-0">
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft px-3 shrink-0">
            Loved Ones ({linkedPatients.length}):
          </span>

          {linkedPatients.map((p) => {
            const isSelected = p._id === activePatient?._id;
            const pName = p.userId?.displayName || p.displayName || 'Loved One';
            const status = statusByPatientId[p._id];
            const isOverdue = status?.isOverdue;

            return (
              <button
                key={p._id}
                onClick={() => setSelectedPatientId(p._id)}
                className={`flex items-center gap-2.5 px-4 py-2 rounded-full text-sm font-semibold transition-all shrink-0 ${
                  isSelected
                    ? 'bg-brand text-white shadow-ritual scale-[1.02]'
                    : 'bg-paper text-ink-soft hover:text-ink hover:bg-line/40'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand'
                  }`}
                >
                  {pName[0]}
                </div>
                <span>{pName}</span>
                {p.age && (
                  <span className={`text-xs ${isSelected ? 'text-white/80' : 'text-ink-soft'}`}>
                    ({p.age}y)
                  </span>
                )}
                {/* Status Dot */}
                <span
                  className={`w-2 h-2 rounded-full ${
                    isOverdue
                      ? 'bg-amber-400 animate-pulse'
                      : status?.level === 'attention'
                      ? 'bg-rose-400'
                      : 'bg-emerald-400'
                  }`}
                  title={isOverdue ? 'Check-in overdue' : 'Monitored'}
                />
              </button>
            );
          })}
        </div>
      </div>

      {/* ── Active Patient Personal Details Banner ─────────────────── */}
      {activePatient && (
        <div className="rounded-ritual bg-surface border border-line p-5 shadow-ritual space-y-4">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-4 border-b border-line">
            <div className="flex items-center gap-3.5">
              <div className="w-14 h-14 rounded-full bg-brand/15 text-brand flex items-center justify-center font-display font-extrabold text-xl shrink-0">
                {patientDisplayName[0]}
              </div>
              <div>
                <div className="flex items-center gap-2 flex-wrap">
                  <h2 className="text-xl font-display font-bold text-ink">{patientDisplayName}</h2>
                  <span className="text-xs px-2.5 py-0.5 rounded-full bg-paper border border-line font-medium text-ink-soft">
                    {activePatient.age ? `${activePatient.age} years old` : 'Senior'} • {activePatient.sex || 'Gender N/A'}
                  </span>
                </div>
                <p className="text-xs text-ink-soft mt-0.5 flex items-center gap-2">
                  <span>Care Circle Status: Actively Protected</span>
                  {assignedDoctorName && (
                    <>
                      <span>•</span>
                      <span className="text-brand font-medium flex items-center gap-1">
                        <Stethoscope size={13} /> {assignedDoctorName}
                      </span>
                    </>
                  )}
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              {patientPhone && (
                <a
                  href={`tel:${patientPhone}`}
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand text-white font-semibold text-xs shadow-sm hover:bg-brand-dark transition-all"
                >
                  <Phone size={14} /> Call {firstName}
                </a>
              )}
              <Link
                to={`/app/health?patientId=${activePatient._id}`}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full border border-line hover:bg-paper text-ink text-xs font-semibold transition-colors"
              >
                <span>View Full Telemetry</span>
                <ChevronRight size={14} />
              </Link>
            </div>
          </div>

          {/* Quick Details Chips */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <div className="p-2.5 rounded-clinical bg-paper/60 border border-line">
              <span className="text-ink-soft block text-[11px]">Primary Phone</span>
              <span className="font-semibold text-ink">{patientPhone || 'Not on file'}</span>
            </div>
            <div className="p-2.5 rounded-clinical bg-paper/60 border border-line">
              <span className="text-ink-soft block text-[11px]">Assigned Physician</span>
              <span className="font-semibold text-ink">{assignedDoctorName || 'Not assigned'}</span>
            </div>
            <div className="p-2.5 rounded-clinical bg-paper/60 border border-line">
              <span className="text-ink-soft block text-[11px]">Active Prescriptions</span>
              <span className="font-semibold text-ink">
                {patientMedicines.length} medication{patientMedicines.length === 1 ? '' : 's'}
              </span>
            </div>
            <div className="p-2.5 rounded-clinical bg-paper/60 border border-line">
              <span className="text-ink-soft block text-[11px]">Check-in Frequency</span>
              <span className="font-semibold text-ink">Twice Daily (Morning/Evening)</span>
            </div>
          </div>
        </div>
      )}

      {/* ── Scheduled Check-in Overdue Alert ──────────────────────── */}
      {currentStatus?.isOverdue && (
        <div
          role="alert"
          className="p-4 rounded-ritual bg-amber-500/10 border border-amber-500/30 text-amber-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-amber-100 text-amber-800 flex items-center justify-center shrink-0 mt-0.5">
              <Clock size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-ink">
                Scheduled Health Check-in Overdue for {firstName}
              </h3>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                {firstName} has not logged their scheduled daily health ritual yet today. A friendly reassurance call or visit is recommended.
              </p>
            </div>
          </div>
          {patientPhone && (
            <a
              href={`tel:${patientPhone}`}
              className="px-4 py-2 rounded-full bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Phone size={13} /> Call {firstName} Now
            </a>
          )}
        </div>
      )}

      {/* ── Missed Medication Reminder for Caregiver ───────────────── */}
      {missedMorningMedicines.length > 0 && (
        <div
          role="alert"
          className="p-4 rounded-ritual bg-rose-500/10 border border-rose-500/30 text-rose-900 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 animate-fade-in"
        >
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full bg-rose-100 text-rose-800 flex items-center justify-center shrink-0 mt-0.5">
              <Pill size={18} />
            </div>
            <div>
              <h3 className="font-display font-bold text-sm text-ink">
                Medication Check: Morning Doses for {firstName}
              </h3>
              <p className="text-xs text-ink-soft mt-0.5 leading-relaxed">
                It is now afternoon and {firstName} has scheduled morning medications (
                <strong className="text-ink font-semibold">
                  {missedMorningMedicines.map((m) => m.name).join(', ')}
                </strong>
                ). Please verify they have taken their prescribed doses.
              </p>
            </div>
          </div>
          {patientPhone && (
            <a
              href={`tel:${patientPhone}`}
              className="px-4 py-2 rounded-full bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold shrink-0 flex items-center gap-1.5 shadow-sm transition-all"
            >
              <Phone size={13} /> Call to Remind
            </a>
          )}
        </div>
      )}

      {/* ── Hero Status Reassurance Card ─────────────────────────── */}
      {currentStatus && (
        <div
          className={`cg-hero ${isFine ? 'cg-hero--fine' : 'cg-hero--attention'} dash-enter dash-enter--d1`}
        >
          <div className="cg-hero__icon">
            {isFine ? (
              <CheckCircle2 size={32} style={{ color: '#1D6F64' }} />
            ) : (
              <AlertCircle size={32} style={{ color: '#B8863A' }} />
            )}
          </div>

          <div>
            <h2 className="cg-hero__heading">{currentStatus.heading}</h2>
            <p className="cg-hero__reason">{currentStatus.plainReason}</p>
          </div>
        </div>
      )}

      {/* ── Reassurance Info Tiles (Read-Only) ────────────────────── */}
      {currentStatus && (
        <div className="cg-info-grid dash-enter dash-enter--d2">
          {/* Last check-in */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(29, 111, 100, 0.08)', color: '#1D6F64' }}>
              <Clock size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Latest Check-In</div>
              <div className="cg-info-tile__value">{currentStatus.lastChecked}</div>
            </div>
          </div>

          {/* Routine Status */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(91, 90, 140, 0.08)', color: '#5B5A8C' }}>
              <Heart size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Medication Routine</div>
              <div className="cg-info-tile__value">
                {patientMedicines.length > 0 ? `${patientMedicines.length} Prescriptions Active` : 'No routine active'}
              </div>
            </div>
          </div>

          {/* Vitals Comfort Status */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(232, 162, 77, 0.1)', color: '#E8A24D' }}>
              <Activity size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Vital Signs State</div>
              <div className="cg-info-tile__value">{currentStatus.vitalsComfort || 'Comfortable & resting'}</div>
            </div>
          </div>

          {/* Care Circle Safety */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}>
              <Shield size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Care Circle Protection</div>
              <div className="cg-info-tile__value">Active &amp; Connected</div>
            </div>
          </div>
        </div>
      )}

      {/* ── Assessment Summary in Plain Language ─────────────────── */}
      <section className="health-section dash-enter dash-enter--d3">
        <div className="health-section__header flex items-center justify-between">
          <div>
            <h2 className="health-section__title">Health Status Summary for {firstName}</h2>
            <span className="health-section__subtitle">Non-clinical reassurance view</span>
          </div>
          <Link
            to={`/app/health?patientId=${activePatient?._id}`}
            className="text-xs font-semibold text-brand hover:text-brand-dark flex items-center gap-1"
          >
            <span>Telemetry Trends</span>
            <ExternalLink size={12} />
          </Link>
        </div>
        <AssessmentCard
          role="caregiver"
          assessment={
            assessment || {
              overallTier: isFine ? 'stable' : 'moderate',
              plainLanguageSummary:
                currentStatus?.plainReason || 'Patient status is comfortably monitored with daily telemetry.',
            }
          }
        />
      </section>

      {/* ── Direct Action Buttons ─────────────────────────────────── */}
      <div className="cg-action-bar dash-enter dash-enter--d4">
        {patientPhone && (
          <a href={`tel:${patientPhone}`} className="cg-action-btn cg-action-btn--primary">
            <Phone size={18} aria-hidden="true" /> Call {firstName} Directly
          </a>
        )}
        <a
          href={`tel:${CONFIG.SUPPORT_PHONE || '5550144'}`}
          className="cg-action-btn cg-action-btn--secondary"
        >
          <Shield size={18} style={{ color: '#1D6F64' }} aria-hidden="true" /> Contact Care Clinic
        </a>
      </div>

      {/* ── Reassurance Footer Note ──────────────────────────────── */}
      <div className="cg-footer dash-enter dash-enter--d5">
        Caregiver Reassurance View • Read-Only Patient Safety Mode Active
      </div>

      {/* ── Modal: Connect Another Loved One ──────────────────────── */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-ritual shadow-modal border border-line p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-display font-bold text-lg text-ink flex items-center gap-2">
                <UserPlus size={18} className="text-brand" /> Link Another Family Member
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-ink-soft hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-soft leading-relaxed">
              Enter the 8-character invite code generated from your family member&apos;s CareOClock profile (Profile &gt; Care Circle &gt; Invite Family Caregiver).
            </p>

            <form onSubmit={handleLinkPatient} className="space-y-4">
              <input
                type="text"
                value={inviteCode}
                onChange={(e) => setInviteCode(e.target.value.toUpperCase())}
                placeholder="e.g. CC-X8Y9Z0"
                className="w-full rounded-xl border border-line px-4 py-3 text-base bg-paper text-ink uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-brand"
                required
              />

              {linkError && (
                <div role="alert" className="p-3 rounded-xl bg-tier-critical/10 border border-tier-critical/30 text-tier-critical text-xs">
                  {linkError}
                </div>
              )}

              {linkSuccess && (
                <div role="alert" className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-xs">
                  {linkSuccess}
                </div>
              )}

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-full border border-line text-ink-soft hover:text-ink text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isLinking || !inviteCode.trim()}
                  className="px-5 py-2 rounded-full bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-all disabled:opacity-50"
                >
                  {isLinking ? 'Connecting...' : 'Connect Loved One'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
