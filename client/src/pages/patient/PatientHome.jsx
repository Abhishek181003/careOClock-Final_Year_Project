import { useEffect, useState, useCallback } from 'react';
import { Link } from 'react-router-dom';
import {
  CheckCircle2, Sunrise, Sunset, Flame, Pill, FileText,
  Activity, ChevronRight, X, Users, Watch, Calendar,
  Heart, Wind, Thermometer, ShieldAlert, PhoneCall,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import { CONFIG } from '../../config';
import VitalsEntryForm from '../../components/VitalsEntryForm';
import AssessmentCard from '../../components/AssessmentCard';
import '../../components/dashboards/Dashboards.css';

/* ── Time-of-day helpers ──────────────────────────────────── */
function getTimeOfDay() {
  const h = new Date().getHours();
  if (h >= 5 && h < 12) return 'morning';
  if (h >= 12 && h < 17) return 'afternoon';
  return 'evening';
}

function getGreeting(name) {
  const tod = getTimeOfDay();
  const prefix =
    tod === 'morning' ? 'Good morning' : tod === 'afternoon' ? 'Good afternoon' : 'Good evening';
  const tip =
    tod === 'morning'
      ? 'Start your day with a glass of water and your scheduled morning vitals.'
      : tod === 'afternoon'
      ? 'Stay hydrated and take a restful pause this afternoon.'
      : 'Wind down peacefully and record your evening readings before rest.';
  return { prefix, name, tod, tip };
}

export default function PatientHome() {
  const { user } = useAuth();
  const [todayStatus, setTodayStatus] = useState({
    morning: { done: false, assessment: null },
    evening: { done: false, assessment: null },
  });
  const [activeSlot, setActiveSlot] = useState(null);
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [latestVitals, setLatestVitals] = useState(null);
  const [nextMedicine, setNextMedicine] = useState(null);
  const [streakDays, setStreakDays] = useState(0);
  const [patientId, setPatientId] = useState('');

  const loadPatientData = useCallback(async () => {
    try {
      // 1. Fetch vitals history to identify morning and evening checkins
      const vitalsRes = await api.get('/clinical/vitals?limit=10');
      const vitals = vitalsRes.data?.vitals || [];
      const pid = vitalsRes.data?.patientId || '';
      if (pid) setPatientId(pid);
      if (vitals.length > 0) {
        setLatestVitals(vitals[0]);
      }

      const todayStr = new Date().toISOString().slice(0, 10);
      let morningDone = false;
      let eveningDone = false;

      for (const v of vitals) {
        const vDate = new Date(v.recordedAt).toISOString().slice(0, 10);
        if (vDate === todayStr) {
          if (v.slot === 'morning') morningDone = true;
          if (v.slot === 'evening') eveningDone = true;
        }
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

      // 4. Fetch active medicines for next dose reminder
      try {
        const medRes = await api.get('/medicines');
        const meds = medRes.data?.medicines || [];
        if (meds.length > 0) {
          setNextMedicine(meds[0]);
        }
      } catch {
        // Fallback
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

  const firstName = user?.displayName
    ? user.displayName.split(' ')[0]
    : user?.email
      ? user.email.split('@')[0]
      : 'there';
  const { prefix, tod, tip } = getGreeting(firstName);
  const isMorningTime = tod === 'morning';

  return (
    <div className="dash">
      {/* ── Hero Greeting Banner ──────────────────────────── */}
      <div
        className={`patient-hero ${isMorningTime ? 'patient-hero--morning' : 'patient-hero--evening'} dash-enter`}
      >
        <div className="patient-hero__top">
          <div>
            <div className="patient-hero__eyebrow">
              {isMorningTime ? <Sunrise size={15} /> : <Sunset size={15} />}
              Daily Health Ritual
            </div>
            <h1 className="patient-hero__title">
              {prefix}, <em>{firstName}</em>
            </h1>
            <p className="text-xs text-white/80 mt-1 max-w-md leading-relaxed">
              {tip}
            </p>
          </div>
          <div className="streak-pill">
            <Flame size={16} />
            {streakDays} Day Streak
          </div>
        </div>
      </div>

      {/* ── Twice-Daily Check-In Slot Cards ────────────────── */}
      <div className="slot-grid dash-enter dash-enter--d1">
        <SlotCard
          accent="dawn"
          icon={Sunrise}
          label="Morning Check-in"
          time="6:00 AM – 11:59 AM"
          done={todayStatus.morning.done}
          onCheckIn={() => setActiveSlot('morning')}
        />
        <SlotCard
          accent="dusk"
          icon={Sunset}
          label="Evening Check-in"
          time="5:00 PM – 10:00 PM"
          done={todayStatus.evening.done}
          onCheckIn={() => setActiveSlot('evening')}
        />
      </div>

      {/* ── In-Place Check-In Form Drawer ─────────────────── */}
      {activeSlot && (
        <div className="checkin-drawer">
          <div className="checkin-drawer__header">
            <h2 className="checkin-drawer__title">
              <Activity size={20} style={{ color: '#1D6F64' }} />
              Recording {activeSlot === 'morning' ? 'Morning' : 'Evening'} Vitals
            </h2>
            <button
              onClick={() => setActiveSlot(null)}
              className="checkin-drawer__close"
              aria-label="Close form"
            >
              <X size={18} />
            </button>
          </div>
          <VitalsEntryForm
            initialSlot={activeSlot}
            hideHeader={true}
            patientId={patientId}
            userRole="patient"
            onVitalsSaved={handleVitalsSaved}
          />
        </div>
      )}

      {/* ── Latest Vitals Telemetry Glance ────────────────── */}
      {!activeSlot && latestVitals && (
        <section className="dash-enter dash-enter--d2 space-y-2">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
              <Activity size={14} style={{ color: '#1D6F64' }} />
              Latest Recorded Telemetry
            </h2>
            <span className="text-xs text-ink-soft">
              {new Date(latestVitals.recordedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} • {latestVitals.slot === 'morning' ? 'Morning Check-in' : 'Evening Check-in'}
            </span>
          </div>
          <div className="vitals-glance-grid">
            {/* Heart Rate */}
            <div className="vital-tile">
              <div className="vital-tile__header">
                <span className="vital-tile__label">Heart Rate</span>
                <Heart size={14} className="text-rose-500" />
              </div>
              <div className="vital-tile__value">
                {latestVitals.heartRate ?? '—'} <span className="vital-tile__unit">bpm</span>
              </div>
              <div className="vital-tile__status vital-tile__status--optimal">
                {latestVitals.heartRate ? (latestVitals.heartRate > 100 ? 'Elevated' : latestVitals.heartRate < 60 ? 'Low' : 'Resting Normal') : 'Awaiting reading'}
              </div>
            </div>

            {/* Blood Pressure */}
            <div className="vital-tile">
              <div className="vital-tile__header">
                <span className="vital-tile__label">Blood Pressure</span>
                <Activity size={14} className="text-teal-600" />
              </div>
              <div className="vital-tile__value">
                {latestVitals.systolicBp && latestVitals.diastolicBp ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}` : '—'} <span className="vital-tile__unit">mmHg</span>
              </div>
              <div className="vital-tile__status vital-tile__status--optimal">
                {latestVitals.systolicBp ? (latestVitals.systolicBp > 140 ? 'Elevated' : 'Optimal') : 'Awaiting reading'}
              </div>
            </div>

            {/* Oxygen SpO2 */}
            <div className="vital-tile">
              <div className="vital-tile__header">
                <span className="vital-tile__label">Oxygen (SpO2)</span>
                <Wind size={14} className="text-blue-500" />
              </div>
              <div className="vital-tile__value">
                {latestVitals.spo2 ?? '—'} <span className="vital-tile__unit">%</span>
              </div>
              <div className="vital-tile__status vital-tile__status--optimal">
                {latestVitals.spo2 ? (latestVitals.spo2 >= 95 ? 'Optimal' : latestVitals.spo2 >= 92 ? 'Acceptable' : 'Low') : 'Awaiting reading'}
              </div>
            </div>

            {/* Temperature */}
            <div className="vital-tile">
              <div className="vital-tile__header">
                <span className="vital-tile__label">Temperature</span>
                <Thermometer size={14} className="text-amber-500" />
              </div>
              <div className="vital-tile__value">
                {latestVitals.temperature ?? '—'} <span className="vital-tile__unit">°C</span>
              </div>
              <div className="vital-tile__status vital-tile__status--optimal">
                {latestVitals.temperature ? (latestVitals.temperature > 37.5 ? 'Fever' : 'Normal') : 'Awaiting reading'}
              </div>
            </div>
          </div>
        </section>
      )}

      {/* ── Medication Upcoming Dose Reminder ─────────────── */}
      {!activeSlot && nextMedicine && (
        <Link to="/app/medicine" className="med-reminder-strip dash-enter dash-enter--d2">
          <div className="med-reminder-strip__left">
            <div className="med-reminder-strip__icon">
              <Pill size={18} />
            </div>
            <div>
              <div className="med-reminder-strip__title">
                Active Prescription: {nextMedicine.name} ({nextMedicine.dosage})
              </div>
              <div className="med-reminder-strip__subtitle">
                {nextMedicine.frequency || 'Daily schedule active'} • Tap to review instructions &amp; record compliance
              </div>
            </div>
          </div>
          <span className="med-reminder-strip__pill">
            View Schedule &rarr;
          </span>
        </Link>
      )}

      {/* ── Today's Health Assessment ─────────────────────── */}
      {!activeSlot && (
        <section className="health-section dash-enter dash-enter--d2">
          <div className="health-section__header">
            <h2 className="health-section__title">Today&apos;s Health Assessment</h2>
            <span className="health-section__subtitle">Dual Clinical Aggregator</span>
          </div>
          <AssessmentCard
            role="patient"
            assessment={
              latestAssessment || {
                overallTier: 'pending',
                overallScore: 0,
                plainLanguageSummary:
                  'No health check-ins recorded yet today. Complete your morning or evening check-in above to calculate your personalized clinical risk assessment.',
              }
            }
          />
        </section>
      )}

      {/* ── Quick Access Cards ────────────────────────────── */}
      <div className="quick-grid dash-enter dash-enter--d3">
        <Link to="/app/medicine" className="quick-card">
          <div className="quick-card__left">
            <div
              className="quick-card__icon"
              style={{ background: 'rgba(29, 111, 100, 0.08)', color: '#1D6F64' }}
            >
              <Pill size={20} />
            </div>
            <div>
              <div className="quick-card__title">Medication Tracker</div>
              <div className="quick-card__desc">Doses, schedule &amp; stock</div>
            </div>
          </div>
          <ChevronRight size={18} className="quick-card__arrow" />
        </Link>

        <Link to="/app/reports" className="quick-card">
          <div className="quick-card__left">
            <div
              className="quick-card__icon"
              style={{ background: 'rgba(91, 90, 140, 0.08)', color: '#5B5A8C' }}
            >
              <FileText size={20} />
            </div>
            <div>
              <div className="quick-card__title">Medical Records</div>
              <div className="quick-card__desc">Prescriptions &amp; lab reports</div>
            </div>
          </div>
          <ChevronRight size={18} className="quick-card__arrow" />
        </Link>

        <Link to="/app/wearable" className="quick-card">
          <div className="quick-card__left">
            <div
              className="quick-card__icon"
              style={{ background: 'rgba(232, 162, 77, 0.08)', color: '#E8A24D' }}
            >
              <Watch size={20} />
            </div>
            <div>
              <div className="quick-card__title">Wearable Sync</div>
              <div className="quick-card__desc">Fitbit, Apple Health &amp; more</div>
            </div>
          </div>
          <ChevronRight size={18} className="quick-card__arrow" />
        </Link>

        <Link to="/app/appointments" className="quick-card">
          <div className="quick-card__left">
            <div
              className="quick-card__icon"
              style={{ background: 'rgba(29, 111, 100, 0.08)', color: '#1D6F64' }}
            >
              <Calendar size={20} />
            </div>
            <div>
              <div className="quick-card__title">Appointments</div>
              <div className="quick-card__desc">Upcoming visits &amp; teleconsults</div>
            </div>
          </div>
          <ChevronRight size={18} className="quick-card__arrow" />
        </Link>

        <Link to="/app/profile" className="quick-card">
          <div className="quick-card__left">
            <div
              className="quick-card__icon"
              style={{ background: 'rgba(59, 130, 246, 0.08)', color: '#3b82f6' }}
            >
              <Users size={20} />
            </div>
            <div>
              <div className="quick-card__title">Care Circle &amp; Doctor</div>
              <div className="quick-card__desc">Assign physician &amp; invite family</div>
            </div>
          </div>
          <ChevronRight size={18} className="quick-card__arrow" />
        </Link>
      </div>

      {/* ── Emergency Support & Clinic Helpline ────────────── */}
      <div className="emergency-reassurance dash-enter dash-enter--d4">
        <div className="emergency-reassurance__left">
          <div className="emergency-reassurance__icon">
            <ShieldAlert size={20} />
          </div>
          <div>
            <div className="emergency-reassurance__title">Clinical Support &amp; Emergency Helpline</div>
            <div className="emergency-reassurance__desc">
              If you experience sudden chest discomfort, severe breathlessness, or acute distress, call for immediate help.
            </div>
          </div>
        </div>
        <a
          href={`tel:${CONFIG.SUPPORT_PHONE || '911'}`}
          className="emergency-reassurance__call-btn"
        >
          <PhoneCall size={14} /> Call Helpline
        </a>
      </div>
    </div>
  );
}

/* ── Slot Status Card Component ───────────────────────────── */
function SlotCard({ accent, icon: Icon, label, time, done, onCheckIn }) {
  return (
    <div
      className={`slot-card slot-card--${accent} ${done ? 'slot-card--done' : 'slot-card--pending'}`}
    >
      <div className="slot-card__header">
        <div className={`slot-card__icon slot-card__icon--${accent}`}>
          <Icon size={20} />
        </div>
        <div>
          <div className="slot-card__label">{label}</div>
          <div className="slot-card__time">{time}</div>
        </div>
      </div>

      <div className="slot-card__footer">
        {done ? (
          <span className="slot-done-badge">
            <CheckCircle2 size={18} />
            Logged for today
          </span>
        ) : (
          <button
            onClick={onCheckIn}
            className={`slot-cta slot-cta--${accent}`}
          >
            Check in now
          </button>
        )}
      </div>
    </div>
  );
}
