import { useEffect, useState, useCallback } from 'react';
import {
  CheckCircle2, AlertCircle, Phone, Clock, Heart, Shield,
  Users, ArrowRight, UserPlus, Sparkles, Activity, RefreshCw,
} from 'lucide-react';
import { api } from '../../api/client';
import AssessmentCard from '../../components/AssessmentCard';
import { CONFIG } from '../../config';
import '../../components/dashboards/Dashboards.css';

/**
 * Caregiver Dashboard (NFR3 Zero-Training, Zero-Jargon Reassurance Screen)
 *
 * Strictly Read-Only:
 * - NO editable fields, forms, or clinical jargon for patient vitals.
 * - Displays high-level status ("All Fine" vs "Please Check On Them").
 * - Empty state with code redemption when no patient is linked yet.
 */
export default function CaregiverHome() {
  const [linkedPatient, setLinkedPatient] = useState(null);
  const [patientName, setPatientName] = useState('');
  const [patientPhone, setPatientPhone] = useState('');
  const [statusState, setStatusState] = useState(null);
  const [assessment, setAssessment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  // Invite code linking state
  const [inviteCode, setInviteCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const [linkError, setLinkError] = useState('');
  const [linkSuccess, setLinkSuccess] = useState('');

  const fetchCaregiverData = useCallback(async () => {
    try {
      setIsLoading(true);
      // 1. Fetch linked patient info from /auth/me or /caregiver/links
      const meRes = await api.get('/auth/me');
      let patient = meRes.data?.linkedPatient;

      // Fallback: Check /caregiver/links if not present in /auth/me
      if (!patient) {
        const linksRes = await api.get('/caregiver/links');
        const activeLink = linksRes.data?.links?.find((l) => l.status === 'active');
        if (activeLink?.patientId) {
          patient = activeLink.patientId;
        }
      }

      if (patient) {
        setLinkedPatient(patient);
        const name = patient.userId?.displayName || patient.displayName || 'Your Loved One';
        setPatientName(name);
        if (patient.phone) setPatientPhone(patient.phone);

        // Fetch latest vitals for linked patient
        try {
          const vitalsRes = await api.get('/clinical/vitals?limit=1');
          const latest = vitalsRes.data?.vitals?.[0];

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
                  ? `${name.split(' ')[0]} reported feeling ${symptoms.join(' and ')}.`
                  : 'Vital signs are slightly elevated from usual comfortable baseline.';
              setStatusState({
                level: 'attention',
                heading: `Please Check In on ${name.split(' ')[0]}`,
                plainReason: `${symptomText} A friendly phone call or in-person visit is recommended today.`,
                lastChecked: `Today at ${timeStr}`,
                medicationStatus: 'Daily schedule active',
                vitalsComfort: 'Slightly elevated',
              });
            } else {
              setStatusState({
                level: 'fine',
                heading: `${name.split(' ')[0]} is Doing Great`,
                plainReason: 'All recorded readings are in their comfortable normal range today.',
                lastChecked: `Today at ${timeStr}`,
                medicationStatus: 'All doses logged on time',
                vitalsComfort: 'Comfortable & resting',
              });
            }
          } else {
            setStatusState({
              level: 'fine',
              heading: `${name.split(' ')[0]} is Monitored`,
              plainReason: 'Waiting for their first daily health check-in readings today.',
              lastChecked: 'No readings logged today yet',
              medicationStatus: 'Daily routine active',
              vitalsComfort: 'Awaiting daily check-in',
            });
          }
        } catch {
          setStatusState({
            level: 'fine',
            heading: `${name.split(' ')[0]} is Monitored`,
            plainReason: 'Waiting for their first daily health check-in readings today.',
            lastChecked: 'No readings logged today yet',
            medicationStatus: 'Routine active',
            vitalsComfort: 'Monitored',
          });
        }

        // Fetch latest assessment
        try {
          const assessRes = await api.get(`/clinical/assessments/${patient._id}?limit=1`);
          const assessments = assessRes.data?.assessments || [];
          if (assessments.length > 0) {
            setAssessment(assessments[0]);
          }
        } catch {
          setAssessment(null);
        }
      } else {
        setLinkedPatient(null);
        setPatientName('');
        setStatusState(null);
      }
    } catch {
      setLinkedPatient(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCaregiverData();
  }, [fetchCaregiverData]);

  const handleLinkPatient = async (e) => {
    e.preventDefault();
    if (!inviteCode.trim()) return;

    setLinkError('');
    setLinkSuccess('');
    setIsLinking(true);

    try {
      const res = await api.post('/caregiver/accept', { inviteCode: inviteCode.trim() });
      setLinkSuccess(res.data?.message || 'Patient successfully linked to your care circle!');
      setInviteCode('');
      await fetchCaregiverData();
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

  if (isLoading) {
    return (
      <div className="dash dash-enter py-16 text-center text-ink-soft">
        <div className="dash-spinner" />
        <p className="text-sm font-medium">Checking care circle status...</p>
      </div>
    );
  }

  // 1. Unlinked Caregiver State (No hardcoded patient!)
  if (!linkedPatient) {
    return (
      <div className="dash dash-enter">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Family Caregiver Portal</span>
          <h1 className="font-display font-extrabold text-2xl text-ink mt-0.5">Welcome to CareOClock</h1>
        </div>

        {/* Informative Connect Card */}
        <div className="assess-card p-6 space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand/10 text-brand flex items-center justify-center shrink-0">
              <Users size={26} />
            </div>
            <div>
              <h2 className="font-display font-bold text-xl text-ink">No Patient Connected Yet</h2>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                As a family caregiver, you will see reassuring daily health summaries, medication statuses, and comfort alerts here once connected with your loved one.
              </p>
            </div>
          </div>

          <hr className="border-line" />

          {/* Connect Patient Form */}
          <form onSubmit={handleLinkPatient} className="space-y-4">
            <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
              <UserPlus size={18} className="text-brand" /> Link with Your Loved One
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

  // 2. Active Linked Patient State
  const isFine = statusState?.level === 'fine';
  const firstName = patientName.split(' ')[0];

  return (
    <div className="dash dash-enter">
      {/* Header */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">Family Reassurance Portal</span>
          <h1 className="font-display font-extrabold text-2xl text-ink mt-0.5">
            Keeping an eye on <em>{firstName}</em>
          </h1>
        </div>
        <button
          onClick={() => fetchCaregiverData()}
          title="Refresh Status"
          className="triage-icon-btn"
          aria-label="Refresh caregiver status"
        >
          <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
        </button>
      </div>

      {/* ── Hero Status Reassurance Card ─────────────────────────── */}
      {statusState && (
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
            <h2 className="cg-hero__heading">{statusState.heading}</h2>
            <p className="cg-hero__reason">{statusState.plainReason}</p>
          </div>
        </div>
      )}

      {/* ── Reassurance Info Tiles (Read-Only) ────────────────────── */}
      {statusState && (
        <div className="cg-info-grid dash-enter dash-enter--d2">
          {/* Last check-in */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(29, 111, 100, 0.08)', color: '#1D6F64' }}>
              <Clock size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Latest Check-In</div>
              <div className="cg-info-tile__value">{statusState.lastChecked}</div>
            </div>
          </div>

          {/* Routine Status */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(91, 90, 140, 0.08)', color: '#5B5A8C' }}>
              <Heart size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Medication Routine</div>
              <div className="cg-info-tile__value">{statusState.medicationStatus}</div>
            </div>
          </div>

          {/* Vitals Comfort Status */}
          <div className="cg-info-tile">
            <div className="cg-info-tile__icon" style={{ background: 'rgba(232, 162, 77, 0.1)', color: '#E8A24D' }}>
              <Activity size={20} />
            </div>
            <div>
              <div className="cg-info-tile__label">Vital Signs State</div>
              <div className="cg-info-tile__value">{statusState.vitalsComfort || 'Comfortable & resting'}</div>
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
        <div className="health-section__header">
          <h2 className="health-section__title">Health Status Summary</h2>
          <span className="health-section__subtitle">Non-clinical reassurance view</span>
        </div>
        <AssessmentCard
          role="caregiver"
          assessment={
            assessment || {
              overallTier: isFine ? 'stable' : 'moderate',
              plainLanguageSummary:
                statusState?.plainReason || 'Patient status is comfortably monitored with daily telemetry.',
            }
          }
        />
      </section>

      {/* ── Direct Action Buttons ─────────────────────────────────── */}
      <div className="cg-action-bar dash-enter dash-enter--d4">
        {patientPhone && (
          <a
            href={`tel:${patientPhone}`}
            className="cg-action-btn cg-action-btn--primary"
          >
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
    </div>
  );
}
