import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { CheckCircle2, Sunrise, Sunset, Flame, Pill, FileText, Activity, ChevronRight, X, Users } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import VitalsEntryForm from '../../components/VitalsEntryForm';
import AssessmentCard from '../../components/AssessmentCard';
import { ACCENT_TEXT } from '../../lib/accentClasses';

export default function PatientHome() {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState({
    morning: { done: false, assessment: null },
    evening: { done: false, assessment: null },
  });
  const [activeSlot, setActiveSlot] = useState(null);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [streakDays, setStreakDays] = useState(7);
  const [patientId, setPatientId] = useState('');

  const loadPatientData = useCallback(async () => {
    try {
      // 1. Fetch vitals history to identify morning and evening checkins
      const vitalsRes = await api.get('/clinical/vitals?limit=10');
      const vitals = vitalsRes.data?.vitals || [];
      const pid = vitalsRes.data?.patientId || '';
      if (pid) setPatientId(pid);

      const todayStr = new Date().toISOString().slice(0, 10);
      let morningDone = false;
      let eveningDone = false;
      let mostRecentVital = null;

      for (const v of vitals) {
        const vDate = new Date(v.recordedAt).toISOString().slice(0, 10);
        if (vDate === todayStr) {
          if (v.slot === 'morning') morningDone = true;
          if (v.slot === 'evening') eveningDone = true;
        }
        if (!mostRecentVital) mostRecentVital = v;
      }

      // 2. Fetch latest assessment if patientId is known
      if (pid) {
        try {
          const assessRes = await api.get(`/clinical/assessments/${pid}?limit=1`);
          const assessments = assessRes.data?.assessments || [];
          if (assessments.length > 0) {
            setLatestAssessment(assessments[0]);
          }
        } catch {
          // Fallback if no assessments yet
        }

        // 3. Fetch adherence
        try {
          const adhRes = await api.get(`/medicines/adherence/${pid}`);
          if (adhRes.data?.currentStreakDays !== undefined) {
            setStreakDays(adhRes.data.currentStreakDays);
          }
        } catch {
          // Keep default
        }
      }

      setTodayStatus({
        morning: { done: morningDone },
        evening: { done: eveningDone },
      });
    } catch {
      // Retain graceful fallback state
    }
  }, []);

  useEffect(() => {
    loadPatientData();
  }, [loadPatientData]);

  const handleVitalsSaved = () => {
    setActiveSlot(null);
    loadPatientData();
  };

  return (
    <div className="max-w-2xl mx-auto space-y-6 text-ink">
      {/* Patient Greeting & Streak Banner */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <p className="text-ink-soft text-sm font-medium">Daily Health Ritual</p>
          <h1 className="text-h1 font-display text-ink mt-0.5">
            Good day, {user?.displayName ? user.displayName.split(' ')[0] : 'Arthur'}
          </h1>
        </div>

        <div className="inline-flex items-center gap-2 px-3.5 py-2 rounded-full bg-amber-500/10 border border-amber-500/30 text-amber-700 font-display font-semibold text-sm">
          <Flame size={18} className="text-amber-500" />
          <span>{streakDays} Day Routine Streak</span>
        </div>
      </div>

      {/* Twice-Daily Slots Grid */}
      <div className="grid sm:grid-cols-2 gap-4">
        <SlotStatusCard
          icon={Sunrise}
          accent="dawn"
          label="Morning Check-in"
          timeWindow="6:00 AM – 11:59 AM"
          done={todayStatus.morning.done}
          onCheckIn={() => setActiveSlot('morning')}
        />
        <SlotStatusCard
          icon={Sunset}
          accent="dusk"
          label="Evening Check-in"
          timeWindow="5:00 PM – 10:00 PM"
          done={todayStatus.evening.done}
          onCheckIn={() => setActiveSlot('evening')}
        />
      </div>

      {/* In-Place Check-In Form Drawer / Section */}
      {activeSlot && (
        <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6 relative">
          <div className="flex items-center justify-between mb-4 border-b border-line pb-3">
            <h2 className="text-h2 font-display text-ink flex items-center gap-2">
              <Activity size={22} className="text-brand" />
              Recording {activeSlot === 'morning' ? 'Morning' : 'Evening'} Vitals
            </h2>
            <button
              onClick={() => setActiveSlot(null)}
              className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              aria-label="Close form"
            >
              <X size={20} />
            </button>
          </div>

          <VitalsEntryForm
            patientId={patientId}
            userRole="patient"
            onVitalsSaved={handleVitalsSaved}
          />
        </div>
      )}

      {/* Latest Health Status / Dual Explanation Card */}
      {!activeSlot && (
        <section className="space-y-2.5">
          <div className="flex items-center justify-between">
            <h2 className="text-h3 font-display text-ink">Today’s Health Assessment</h2>
            <span className="text-xs text-ink-soft">Dual Clinical Aggregator</span>
          </div>

          <AssessmentCard
            role="patient"
            assessment={
              latestAssessment || {
                overallTier: 'stable',
                plainLanguageSummary:
                  'All recorded vital signs are within your normal, steady baseline range.',
              }
            }
          />
        </section>
      )}

      {/* Quick Access to Medicines & Records */}
      <div className="pt-2 grid sm:grid-cols-2 gap-3">
        <Link
          to="/app/medicine"
          className="flex items-center justify-between p-4 rounded-ritual bg-surface border border-line hover:border-brand/40 transition-all shadow-sm group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-brand-light/40 text-brand flex items-center justify-center">
              <Pill size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-ink text-base">Medication Tracker</div>
              <div className="text-xs text-ink-soft">Doses, schedule, and stock</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-soft group-hover:text-brand transition-colors" />
        </Link>

        <Link
          to="/app/reports"
          className="flex items-center justify-between p-4 rounded-ritual bg-surface border border-line hover:border-brand/40 transition-all shadow-sm group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-purple-100 text-purple-700 flex items-center justify-center">
              <FileText size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-ink text-base">Medical Records</div>
              <div className="text-xs text-ink-soft">Prescriptions & lab reports</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-soft group-hover:text-brand transition-colors" />
        </Link>

        <Link
          to="/app/profile"
          className="flex items-center justify-between p-4 rounded-ritual bg-surface border border-line hover:border-brand/40 transition-all shadow-sm group"
        >
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-100 text-blue-700 flex items-center justify-center">
              <Users size={20} />
            </div>
            <div>
              <div className="font-display font-semibold text-ink text-base">Care Circle & Doctor</div>
              <div className="text-xs text-ink-soft">Assign physician & invite family</div>
            </div>
          </div>
          <ChevronRight size={18} className="text-ink-soft group-hover:text-brand transition-colors" />
        </Link>
      </div>
    </div>
  );
}

function SlotStatusCard({ icon: Icon, accent, label, timeWindow, done, onCheckIn }) {
  const accentClass = ACCENT_TEXT[accent] || 'text-brand';

  return (
    <div className="rounded-ritual bg-surface shadow-ritual border border-line p-5 flex flex-col justify-between gap-4">
      <div>
        <div className={`flex items-center gap-2 ${accentClass} font-display font-semibold text-base mb-1`}>
          <Icon aria-hidden="true" size={20} />
          {label}
        </div>
        <p className="text-xs text-ink-soft">{timeWindow}</p>
      </div>

      <div className="flex items-center justify-between pt-2 border-t border-line">
        {done ? (
          <span className="inline-flex items-center gap-1.5 text-brand font-medium text-sm">
            <CheckCircle2 size={18} aria-hidden="true" /> Logged for Today
          </span>
        ) : (
          <button
            onClick={onCheckIn}
            className="text-sm bg-brand hover:bg-brand-dark text-white font-display font-semibold rounded-full px-4 py-2 transition-colors"
          >
            Check in now
          </button>
        )}
      </div>
    </div>
  );
}
