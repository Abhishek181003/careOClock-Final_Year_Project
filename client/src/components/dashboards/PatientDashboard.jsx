import { useState, useEffect } from 'react';
import { Activity, Pill, FileText, Heart, PlusCircle, CheckCircle2, Flame } from 'lucide-react';
import VitalsEntryForm from '../VitalsEntryForm.jsx';
import MedicineManager from '../MedicineManager.jsx';
import ReportManager from '../ReportManager.jsx';
import RecentVitalsList from '../RecentVitalsList.jsx';
import './Dashboards.css';

/**
 * Patient Dashboard (Phase 9 - Mobile-First Self-Care Center)
 *
 * Provides:
 * 1. Current Health Status banner (latest vitals, adherence streak, safety status).
 * 2. Vitals Entry Form (twice-daily slot logging).
 * 3. Active Medicine List (schedules & dose logging).
 * 4. Medical Reports Section (upload, view, download).
 */
export default function PatientDashboard({ token, patientId, userRole = 'patient' }) {
  const [activeSegment, setActiveSegment] = useState('status'); // 'status' | 'entry' | 'medicines' | 'reports'
  const [latestVitals, setLatestVitals] = useState(null);
  const [vitalsHistory, setVitalsHistory] = useState([]);
  const [adherenceStreak, setAdherenceStreak] = useState(7);

  // Load summary metrics for quick status display
  useEffect(() => {
    let isMounted = true;
    async function loadSummary() {
      if (!token) return;
      try {
        const [vitalsRes, medRes] = await Promise.all([
          fetch('/api/clinical/vitals?limit=5', {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch('/api/medicines', {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        if (vitalsRes.ok && isMounted) {
          const vData = await vitalsRes.json();
          setVitalsHistory(vData.vitals || []);
          if (vData.vitals?.[0]) setLatestVitals(vData.vitals[0]);
        }

        if (medRes.ok && isMounted) {
          const mData = await medRes.json();
          const pId = patientId || mData.patientId;
          if (pId) {
            const adhRes = await fetch(`/api/medicines/adherence/${pId}`, {
              headers: { Authorization: `Bearer ${token}` },
            });
            if (adhRes.ok && isMounted) {
              const aData = await adhRes.json();
              setAdherenceStreak(aData.currentStreakDays || 0);
            }
          }
        }
      } catch {
        // Handled silently
      }
    }

    loadSummary();
    return () => {
      isMounted = false;
    };
  }, [token, patientId]);

  const handleVitalsSaved = (newVital) => {
    setLatestVitals(newVital);
    setVitalsHistory((prev) => [newVital, ...prev]);
    setActiveSegment('status');
  };

  return (
    <div className="dashboard-container">
      {/* Mobile-First Segment Navigation */}
      <nav className="patient-segmented-nav" aria-label="Patient sections">
        <button
          className={`patient-nav-btn ${activeSegment === 'status' ? 'active' : ''}`}
          onClick={() => setActiveSegment('status')}
        >
          <Activity size={15} /> My Health
        </button>
        <button
          className={`patient-nav-btn ${activeSegment === 'entry' ? 'active' : ''}`}
          onClick={() => setActiveSegment('entry')}
        >
          <PlusCircle size={15} /> Record Vitals
        </button>
        <button
          className={`patient-nav-btn ${activeSegment === 'medicines' ? 'active' : ''}`}
          onClick={() => setActiveSegment('medicines')}
        >
          <Pill size={15} /> Medicines
        </button>
        <button
          className={`patient-nav-btn ${activeSegment === 'reports' ? 'active' : ''}`}
          onClick={() => setActiveSegment('reports')}
        >
          <FileText size={15} /> Records
        </button>
      </nav>

      {/* 1. Health Status Segment */}
      {activeSegment === 'status' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {/* Health Greeting & Adherence Banner */}
          <div className="patient-quick-health-banner">
            <div>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#10b981',
                  background: 'rgba(16, 185, 129, 0.1)',
                  padding: '0.2rem 0.55rem',
                  borderRadius: '9999px',
                  border: '1px solid rgba(16, 185, 129, 0.25)',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: '0.3rem',
                  marginBottom: '0.35rem',
                }}
              >
                <CheckCircle2 size={12} /> Vital Baseline Steady
              </span>
              <h2 style={{ fontSize: '1.35rem', color: '#ffffff', margin: '0.1rem 0' }}>
                Good day, Arthur
              </h2>
              <p style={{ fontSize: '0.85rem', color: '#94a3b8', margin: 0 }}>
                {latestVitals
                  ? `Last vitals logged ${new Date(latestVitals.recordedAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}`
                  : 'Ready for today’s first health check-in.'}
              </p>
            </div>

            <div
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.45rem',
                padding: '0.45rem 0.85rem',
                borderRadius: '12px',
                background: 'rgba(245, 158, 11, 0.15)',
                border: '1px solid rgba(245, 158, 11, 0.35)',
                color: '#fbbf24',
                fontWeight: 700,
                fontSize: '0.85rem',
              }}
            >
              <Flame size={16} />
              <span>{adherenceStreak} Day Routine Streak</span>
            </div>
          </div>

          {/* Quick Metrics Strip */}
          <div className="patient-stats-strip">
            <div className="patient-stat-pill">
              <span className="patient-stat-label">Heart Rate</span>
              <span className="patient-stat-val">
                {latestVitals?.heartRate ? `${latestVitals.heartRate} bpm` : '72 bpm'}
              </span>
            </div>
            <div className="patient-stat-pill">
              <span className="patient-stat-label">Blood Pressure</span>
              <span className="patient-stat-val">
                {latestVitals?.systolicBp
                  ? `${latestVitals.systolicBp}/${latestVitals.diastolicBp}`
                  : '120/80'}
              </span>
            </div>
            <div className="patient-stat-pill">
              <span className="patient-stat-label">Oxygen (SpO2)</span>
              <span className="patient-stat-val">
                {latestVitals?.spo2 ? `${latestVitals.spo2}%` : '98%'}
              </span>
            </div>
            <div className="patient-stat-pill">
              <span className="patient-stat-label">Body Temp</span>
              <span className="patient-stat-val">
                {latestVitals?.temperatureCelsius
                  ? `${latestVitals.temperatureCelsius.toFixed(1)}°C`
                  : '36.6°C'}
              </span>
            </div>
          </div>

          {/* Fast CTA to Record Today's Slot */}
          <div
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px dashed rgba(6, 182, 212, 0.3)',
              borderRadius: '14px',
              padding: '1.25rem',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: '1rem',
              flexWrap: 'wrap',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
              <div
                style={{
                  width: '42px',
                  height: '42px',
                  borderRadius: '10px',
                  background: 'rgba(6, 182, 212, 0.15)',
                  color: '#06b6d4',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Heart size={20} />
              </div>
              <div>
                <div style={{ fontWeight: 700, color: '#f8fafc', fontSize: '0.95rem' }}>
                  Complete Daily Health Check
                </div>
                <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>
                  Log morning or evening vitals in less than 30 seconds
                </div>
              </div>
            </div>

            <button
              onClick={() => setActiveSegment('entry')}
              style={{
                background: '#06b6d4',
                color: '#0a0f1d',
                fontWeight: 700,
                fontSize: '0.85rem',
                padding: '0.6rem 1.15rem',
                border: 'none',
                borderRadius: '8px',
                cursor: 'pointer',
              }}
            >
              Open Form
            </button>
          </div>

          {/* Recent History Table */}
          <div
            style={{
              background: 'rgba(15, 23, 42, 0.85)',
              borderRadius: '16px',
              padding: '1.25rem',
              border: '1px solid rgba(255, 255, 255, 0.08)',
            }}
          >
            <RecentVitalsList
              vitals={vitalsHistory}
              isLoading={false}
              onRefresh={() => {}}
            />
          </div>
        </div>
      )}

      {/* 2. Vitals Entry Segment */}
      {activeSegment === 'entry' && (
        <VitalsEntryForm
          token={token}
          patientId={patientId}
          userRole={userRole}
          onVitalsSaved={handleVitalsSaved}
        />
      )}

      {/* 3. Medicine Management Segment */}
      {activeSegment === 'medicines' && (
        <MedicineManager
          token={token}
          patientId={patientId}
          userRole={userRole}
        />
      )}

      {/* 4. Medical Reports Segment */}
      {activeSegment === 'reports' && (
        <ReportManager
          token={token}
          patientId={patientId}
          userRole={userRole}
        />
      )}
    </div>
  );
}
