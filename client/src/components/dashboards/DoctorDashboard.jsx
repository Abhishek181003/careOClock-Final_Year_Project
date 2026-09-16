import { useState, useMemo } from 'react';
import {
  Stethoscope,
  Search,
  ChevronRight,
  X,
  Activity,
  Pill,
  FileText,
  Clock,
} from 'lucide-react';
import ReportManager from '../ReportManager.jsx';
import MedicineManager from '../MedicineManager.jsx';
import './Dashboards.css';

const TIER_ORDER = { critical: 4, high: 3, medium: 2, low: 1 };

/**
 * Doctor Dashboard (Phase 9 - Risk-Prioritized Triage & Deep Explanation)
 *
 * Provides:
 * 1. Triage queue automatically sorted by highest risk tier first.
 * 2. Search & filter by risk tier.
 * 3. Detailed breakdown modal per patient with clinical vitals trajectory,
 *    NEWS2 scores, AI anomaly rationale, adherence PDC, and records.
 */
export default function DoctorDashboard({ token, doctorName = 'Dr. Evelyn Reed, MD' }) {
  const [patients] = useState([
    {
      id: 'demo-p-1',
      name: 'Arthur Pendelton',
      age: 74,
      sex: 'Male',
      riskTier: 'medium',
      riskScore: 62,
      lastVitals: { hr: 98, bp: '142/88', spo2: 94, temp: 37.1 },
      symptoms: ['Mild shortness of breath', 'Fatigue'],
      adherenceRate7d: 85,
      lastUpdated: '15 mins ago',
      news2Score: 4,
      explanation:
        'Heart rate is 18 bpm above personal baseline. Mild tachypnea with reported dyspnea. Adherence is optimal (85%).',
    },
    {
      id: 'demo-p-2',
      name: 'Eleanor Vance',
      age: 81,
      sex: 'Female',
      riskTier: 'critical',
      riskScore: 88,
      lastVitals: { hr: 115, bp: '168/98', spo2: 89, temp: 38.3 },
      symptoms: ['Chest tightness', 'Dizziness'],
      adherenceRate7d: 45,
      lastUpdated: '5 mins ago',
      news2Score: 8,
      explanation:
        'Severe hypoxia (SpO2 89%) and tachycardia. Patient non-adherent with antihypertensives (45% PDC). Immediate evaluation advised.',
    },
    {
      id: 'demo-p-3',
      name: 'George Henderson',
      age: 68,
      sex: 'Male',
      riskTier: 'low',
      riskScore: 18,
      lastVitals: { hr: 72, bp: '122/78', spo2: 98, temp: 36.6 },
      symptoms: [],
      adherenceRate7d: 96,
      lastUpdated: '1 hour ago',
      news2Score: 0,
      explanation: 'All vitals within normal expected bounds. 14-day consecutive adherence streak.',
    },
    {
      id: 'demo-p-4',
      name: 'Martha Stewart',
      age: 77,
      sex: 'Female',
      riskTier: 'high',
      riskScore: 74,
      lastVitals: { hr: 104, bp: '155/92', spo2: 92, temp: 37.8 },
      symptoms: ['Cough', 'Fever'],
      adherenceRate7d: 78,
      lastUpdated: '25 mins ago',
      news2Score: 6,
      explanation:
        'Fever with declining SpO2 indicating potential respiratory tract infection. Suboptimal medication adherence.',
    },
  ]);

  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [selectedPatient, setSelectedPatient] = useState(null);
  const [activeDetailTab, setActiveDetailTab] = useState('clinical'); // 'clinical' | 'medicines' | 'reports'

  // Sort patients: Most at-risk first (Critical > High > Medium > Low)
  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      const tierDiff = (TIER_ORDER[b.riskTier] || 0) - (TIER_ORDER[a.riskTier] || 0);
      if (tierDiff !== 0) return tierDiff;
      return (b.riskScore || 0) - (a.riskScore || 0);
    });
  }, [patients]);

  const filteredPatients = sortedPatients.filter((p) => {
    const matchesTier = tierFilter === 'all' || p.riskTier === tierFilter;
    const matchesQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.riskTier.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTier && matchesQuery;
  });

  return (
    <div className="dashboard-container" style={{ maxWidth: '900px' }}>
      {/* Doctor Header & Metrics */}
      <div className="patient-quick-health-banner">
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <Stethoscope size={20} color="#3b82f6" />
            <h2 style={{ fontSize: '1.25rem', color: '#f8fafc', margin: 0 }}>
              Physician Triage Overview
            </h2>
          </div>
          <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
            Active roster: {patients.length} assigned patients • Sorted by risk priority (NFR2/FR4)
          </p>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem', flexWrap: 'wrap' }}>
          <span className="tier-badge tier-critical">
            {patients.filter((p) => p.riskTier === 'critical').length} Critical
          </span>
          <span className="tier-badge tier-high">
            {patients.filter((p) => p.riskTier === 'high').length} High Risk
          </span>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="doctor-header-row">
        <div className="doctor-filter-bar" style={{ flex: 1 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: '220px' }}>
            <Search
              size={14}
              style={{
                position: 'absolute',
                left: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                color: '#64748b',
              }}
            />
            <input
              type="text"
              className="doctor-search-input"
              style={{ paddingLeft: '2rem', width: '100%' }}
              placeholder="Search assigned patients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>

          <select
            className="doctor-search-input"
            value={tierFilter}
            onChange={(e) => setTierFilter(e.target.value)}
          >
            <option value="all">All Tiers ({patients.length})</option>
            <option value="critical">Critical</option>
            <option value="high">High Risk</option>
            <option value="medium">Medium Risk</option>
            <option value="low">Low Risk</option>
          </select>
        </div>
      </div>

      {/* Triage Patient Queue (Most at-risk first) */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.85rem' }}>
        {filteredPatients.map((patient) => (
          <div
            key={patient.id}
            className="doctor-patient-card"
            onClick={() => setSelectedPatient(patient)}
          >
            <div className="doctor-patient-card-header">
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <span style={{ fontSize: '1.05rem', fontWeight: 700, color: '#f8fafc' }}>
                    {patient.name}
                  </span>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                    ({patient.age}y, {patient.sex})
                  </span>
                </div>
                <div
                  style={{
                    fontSize: '0.78rem',
                    color: '#64748b',
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.35rem',
                    marginTop: '0.2rem',
                  }}
                >
                  <Clock size={12} /> Last recorded: {patient.lastUpdated}
                </div>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                <span className={`tier-badge tier-${patient.riskTier}`}>
                  {patient.riskTier} (Score: {patient.riskScore})
                </span>
                <ChevronRight size={18} color="#64748b" />
              </div>
            </div>

            {/* Vitals Summary Pill Strip */}
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(110px, 1fr))',
                gap: '0.5rem',
              }}
            >
              <div className="patient-stat-pill" style={{ padding: '0.5rem 0.75rem' }}>
                <span className="patient-stat-label">HR</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                  {patient.lastVitals.hr} bpm
                </span>
              </div>
              <div className="patient-stat-pill" style={{ padding: '0.5rem 0.75rem' }}>
                <span className="patient-stat-label">BP</span>
                <span style={{ fontSize: '0.95rem', fontWeight: 700, color: '#f8fafc' }}>
                  {patient.lastVitals.bp}
                </span>
              </div>
              <div className="patient-stat-pill" style={{ padding: '0.5rem 0.75rem' }}>
                <span className="patient-stat-label">SpO2</span>
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: patient.lastVitals.spo2 < 92 ? '#f87171' : '#f8fafc',
                  }}
                >
                  {patient.lastVitals.spo2}%
                </span>
              </div>
              <div className="patient-stat-pill" style={{ padding: '0.5rem 0.75rem' }}>
                <span className="patient-stat-label">7d PDC Adherence</span>
                <span
                  style={{
                    fontSize: '0.95rem',
                    fontWeight: 700,
                    color: patient.adherenceRate7d < 80 ? '#fbbf24' : '#34d399',
                  }}
                >
                  {patient.adherenceRate7d}%
                </span>
              </div>
            </div>

            {/* Plain clinical rationale snippet */}
            <div
              style={{
                fontSize: '0.8rem',
                color: '#cbd5e1',
                background: 'rgba(255, 255, 255, 0.03)',
                padding: '0.5rem 0.75rem',
                borderRadius: '8px',
                borderLeft:
                  patient.riskTier === 'critical'
                    ? '3px solid #ef4444'
                    : patient.riskTier === 'high'
                      ? '3px solid #f59e0b'
                      : '3px solid #06b6d4',
              }}
            >
              <strong>Clinical Assessment:</strong> {patient.explanation}
            </div>
          </div>
        ))}
      </div>

      {/* Detailed Patient Breakdown Modal */}
      {selectedPatient && (
        <div className="doctor-detail-modal" onClick={() => setSelectedPatient(null)}>
          <div className="doctor-detail-pane" onClick={(e) => e.stopPropagation()}>
            <div
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                borderBottom: '1px solid rgba(255, 255, 255, 0.1)',
                paddingBottom: '0.85rem',
              }}
            >
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.65rem' }}>
                  <h3 style={{ fontSize: '1.35rem', color: '#ffffff', margin: 0 }}>
                    {selectedPatient.name}
                  </h3>
                  <span className={`tier-badge tier-${selectedPatient.riskTier}`}>
                    {selectedPatient.riskTier.toUpperCase()} RISK
                  </span>
                </div>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0.25rem 0 0 0' }}>
                  Age {selectedPatient.age} • {selectedPatient.sex} • Assigned to {doctorName}
                </p>
              </div>

              <button
                onClick={() => setSelectedPatient(null)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '0.25rem',
                }}
              >
                <X size={22} />
              </button>
            </div>

            {/* Detail Tabs */}
            <div className="patient-segmented-nav">
              <button
                className={`patient-nav-btn ${activeDetailTab === 'clinical' ? 'active' : ''}`}
                onClick={() => setActiveDetailTab('clinical')}
              >
                <Activity size={15} /> Clinical Trajectory & Risk
              </button>
              <button
                className={`patient-nav-btn ${activeDetailTab === 'medicines' ? 'active' : ''}`}
                onClick={() => setActiveDetailTab('medicines')}
              >
                <Pill size={15} /> Medication Inventory (FR6)
              </button>
              <button
                className={`patient-nav-btn ${activeDetailTab === 'reports' ? 'active' : ''}`}
                onClick={() => setActiveDetailTab('reports')}
              >
                <FileText size={15} /> Medical Reports (FR7)
              </button>
            </div>

            {/* Tab 1: Clinical Trajectory */}
            {activeDetailTab === 'clinical' && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div
                  style={{
                    background: 'rgba(30, 41, 59, 0.6)',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    borderRadius: '12px',
                    padding: '1rem',
                  }}
                >
                  <h4 style={{ color: '#06b6d4', margin: '0 0 0.5rem 0', fontSize: '0.95rem' }}>
                    Multi-Factor Risk Analysis (FR4 / NFR2 Monotone Triage)
                  </h4>
                  <p style={{ fontSize: '0.85rem', color: '#e2e8f0', lineHeight: 1.5, margin: 0 }}>
                    {selectedPatient.explanation}
                  </p>
                </div>

                <div className="patient-stats-strip">
                  <div className="patient-stat-pill">
                    <span className="patient-stat-label">NEWS2 Baseline</span>
                    <span className="patient-stat-val">{selectedPatient.news2Score} / 20</span>
                  </div>
                  <div className="patient-stat-pill">
                    <span className="patient-stat-label">Monotone Risk Score</span>
                    <span className="patient-stat-val">{selectedPatient.riskScore} / 100</span>
                  </div>
                  <div className="patient-stat-pill">
                    <span className="patient-stat-label">7d PDC Adherence</span>
                    <span className="patient-stat-val">{selectedPatient.adherenceRate7d}%</span>
                  </div>
                </div>

                {selectedPatient.symptoms.length > 0 && (
                  <div style={{ fontSize: '0.82rem', color: '#f8fafc' }}>
                    <strong>Active Reported Symptoms:</strong>{' '}
                    {selectedPatient.symptoms.map((s, i) => (
                      <span
                        key={i}
                        style={{
                          background: 'rgba(239, 68, 68, 0.15)',
                          border: '1px solid rgba(239, 68, 68, 0.3)',
                          color: '#fca5a5',
                          padding: '0.2rem 0.5rem',
                          borderRadius: '6px',
                          marginLeft: '0.4rem',
                        }}
                      >
                        {s}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Tab 2: Medicine Inventory */}
            {activeDetailTab === 'medicines' && (
              <MedicineManager
                token={token}
                patientId={selectedPatient.id}
                userRole="doctor"
              />
            )}

            {/* Tab 3: Medical Reports */}
            {activeDetailTab === 'reports' && (
              <ReportManager
                token={token}
                patientId={selectedPatient.id}
                userRole="doctor"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
