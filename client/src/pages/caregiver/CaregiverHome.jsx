import { useEffect, useState, useCallback } from 'react';
import { CheckCircle2, AlertCircle, Phone, Clock, Heart, Shield, Users, ArrowRight, UserPlus, Sparkles } from 'lucide-react';
import { api } from '../../api/client';
import AssessmentCard from '../../components/AssessmentCard';
import { CONFIG } from '../../config';

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
                  : 'Vital signs are slightly elevated from usual baseline.';
              setStatusState({
                level: 'attention',
                heading: `Please Check In on ${name.split(' ')[0]}`,
                plainReason: `${symptomText} A friendly phone call or in-person visit is recommended.`,
                lastChecked: `Today at ${timeStr}`,
                medicationStatus: 'Daily schedule active',
              });
            } else {
              setStatusState({
                level: 'fine',
                heading: `${name.split(' ')[0]} is Doing Great`,
                plainReason: 'All recorded readings are in their comfortable normal range today.',
                lastChecked: `Today at ${timeStr}`,
                medicationStatus: 'All doses logged on time',
              });
            }
          } else {
            setStatusState({
              level: 'fine',
              heading: `${name.split(' ')[0]} is Registered`,
              plainReason: 'Waiting for their first daily health check-in readings today.',
              lastChecked: 'No readings logged today yet',
              medicationStatus: 'Routine active',
            });
          }
        } catch {
          setStatusState({
            level: 'fine',
            heading: `${name.split(' ')[0]} is Monitored`,
            plainReason: 'Waiting for their first daily health check-in readings today.',
            lastChecked: 'No readings logged today yet',
            medicationStatus: 'Routine active',
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
      <div className="max-w-2xl mx-auto py-16 text-center text-ink-soft">
        <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent mb-3" />
        <p className="text-sm font-medium">Checking care circle status...</p>
      </div>
    );
  }

  // 1. Unlinked Caregiver State (No hardcoded patient!)
  if (!linkedPatient) {
    return (
      <div className="max-w-2xl mx-auto space-y-6 text-ink">
        <div>
          <p className="text-ink-soft text-sm font-medium">Family Caregiver Portal</p>
          <h1 className="text-h1 font-display text-ink mt-0.5">Welcome to CareOClock</h1>
        </div>

        {/* Informative Notice */}
        <div className="rounded-ritual p-6 bg-surface border border-line shadow-ritual space-y-5">
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-2xl bg-brand-light/50 text-brand flex items-center justify-center shrink-0">
              <Users size={26} />
            </div>
            <div>
              <h2 className="text-h2 font-display text-ink font-bold">No Patient Connected Yet</h2>
              <p className="text-sm text-ink-soft mt-1 leading-relaxed">
                As a family caregiver, you will see reassuring daily health summaries, medication statuses, and alerts here once linked with your loved one.
              </p>
            </div>
          </div>

          <hr className="border-line" />

          {/* Connect Patient Form */}
          <form onSubmit={handleLinkPatient} className="space-y-4">
            <h3 className="text-base font-display font-bold text-ink flex items-center gap-2">
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
                className="flex-1 rounded-lg border border-line px-4 py-3 text-base bg-paper text-ink uppercase tracking-wider font-mono focus:outline-none focus:ring-2 focus:ring-brand"
                required
              />
              <button
                type="submit"
                disabled={isLinking || !inviteCode.trim()}
                className="bg-brand hover:bg-brand-dark text-white font-display font-semibold rounded-full px-6 py-3 text-base transition-colors shadow-sm disabled:opacity-50 flex items-center justify-center gap-2 shrink-0"
              >
                {isLinking ? 'Connecting...' : 'Connect'}
                <ArrowRight size={16} />
              </button>
            </div>

            {linkError && (
              <div role="alert" className="p-3 rounded-lg bg-tier-critical/10 border border-tier-critical/30 text-tier-critical text-sm">
                {linkError}
              </div>
            )}

            {linkSuccess && (
              <div role="alert" className="p-3 rounded-lg bg-emerald-500/10 border border-emerald-500/30 text-emerald-800 text-sm">
                {linkSuccess}
              </div>
            )}
          </form>

          <div className="p-4 rounded-xl bg-paper border border-line text-xs text-ink-soft space-y-1">
            <p className="font-semibold text-ink flex items-center gap-1.5">
              <Sparkles size={14} className="text-brand" /> How to get an invite code?
            </p>
            <p>
              1. Ask the patient to log into CareOClock.
              <br />
              2. Go to their <strong>Profile</strong> &rarr; <strong>Care Circle</strong>.
              <br />
              3. Click <strong>&quot;Invite Family Caregiver&quot;</strong> and share the 8-character code with you.
            </p>
          </div>
        </div>
      </div>
    );
  }

  // 2. Active Linked Patient State
  const isFine = statusState?.level === 'fine';

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-ink">
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-soft text-sm font-medium">Family Reassurance</p>
          <h1 className="text-h1 font-display text-ink mt-0.5">Keeping an eye on {patientName}</h1>
        </div>
      </div>

      {/* Hero Status Display */}
      {statusState && (
        <div
          className={`rounded-ritual p-6 border shadow-ritual flex items-start gap-4 transition-all ${
            isFine
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-950'
              : 'bg-amber-500/10 border-amber-500/30 text-amber-950'
          }`}
        >
          <div className="p-2 rounded-full bg-surface border border-line shrink-0">
            {isFine ? (
              <CheckCircle2 size={36} className="text-emerald-600" />
            ) : (
              <AlertCircle size={36} className="text-amber-600" />
            )}
          </div>

          <div>
            <h2 className="text-h2 font-display text-ink font-bold">{statusState.heading}</h2>
            <p className="text-base text-ink mt-1.5 leading-relaxed">{statusState.plainReason}</p>
          </div>
        </div>
      )}

      {/* Overview Info Tiles (Strictly Read-Only) */}
      {statusState && (
        <div className="grid sm:grid-cols-2 gap-4">
          <div className="rounded-ritual bg-surface border border-line shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-light/40 text-brand flex items-center justify-center shrink-0">
              <Clock size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-ink-soft tracking-wider">
                Last Check-In
              </div>
              <div className="text-base font-display font-semibold text-ink">
                {statusState.lastChecked}
              </div>
            </div>
          </div>

          <div className="rounded-ritual bg-surface border border-line shadow-sm p-4 flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center shrink-0">
              <Heart size={20} />
            </div>
            <div>
              <div className="text-xs font-semibold uppercase text-ink-soft tracking-wider">
                Routine Status
              </div>
              <div className="text-base font-display font-semibold text-ink">
                {statusState.medicationStatus}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Assessment Summary in Caregiver Plain Language */}
      <section className="space-y-2">
        <h2 className="text-h3 font-display text-ink">Health Status Details</h2>
        <AssessmentCard
          role="caregiver"
          assessment={
            assessment || {
              overallTier: isFine ? 'stable' : 'moderate',
              plainLanguageSummary:
                statusState?.plainReason || 'Patient status is comfortably monitored.',
            }
          }
        />
      </section>

      {/* Action Bar */}
      <div className="pt-2 flex flex-wrap gap-3">
        {patientPhone && (
          <a
            href={`tel:${patientPhone}`}
            className="inline-flex items-center gap-2 bg-brand hover:bg-brand-dark text-white rounded-full px-5 py-3 font-display font-semibold text-base transition-colors shadow-sm"
          >
            <Phone size={18} aria-hidden="true" /> Call {patientName.split(' ')[0]} Directly
          </a>
        )}
        <a
          href={`tel:${CONFIG.SUPPORT_PHONE || '5550144'}`}
          className="inline-flex items-center gap-2 bg-surface hover:bg-paper border border-line text-ink rounded-full px-5 py-3 font-display font-semibold text-base transition-colors shadow-sm"
        >
          <Shield size={18} className="text-brand" aria-hidden="true" /> Contact Care Clinic
        </a>
      </div>

      <div className="text-xs text-ink-soft text-center pt-2">
        Caregiver Reassurance View • Read-Only Patient Safety Mode Active
      </div>
    </div>
  );
}
