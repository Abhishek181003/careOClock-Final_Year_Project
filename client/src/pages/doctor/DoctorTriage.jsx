import { Fragment, useEffect, useMemo, useState } from 'react';
import { Search, Stethoscope, X, Pill, FileText, Activity } from 'lucide-react';
import { api } from '../../api/client';
import RiskBadge from '../../components/RiskBadge';
import AssessmentCard from '../../components/AssessmentCard';
import MedicineManager from '../../components/MedicineManager';
import ReportManager from '../../components/ReportManager';

const TIER_RANK = { critical: 0, high: 1, moderate: 2, medium: 2, stable: 3, low: 3 };

const DEMO_PATIENTS = [
  {
    id: 'demo-p-1',
    name: 'Arthur Pendelton',
    age: 74,
    sex: 'Male',
    tier: 'moderate',
    riskScore: 62,
    lastCheckInAt: 'Today, 8:30 AM',
    keyDeviation: 'HR +18 bpm vs personal baseline; mild dyspnea reported',
    assessment: {
      overallTier: 'moderate',
      overallScore: 62,
      plainLanguageSummary:
        'Resting heart rate is 18 bpm higher than usual baseline. Reported mild shortness of breath.',
      layer1: {
        news2Subtotal: 4,
        points: [
          { label: 'Heart Rate (98 bpm)', points: 1 },
          { label: 'Respiration Rate (21 bpm)', points: 2 },
          { label: 'SpO2 (94%)', points: 1 },
        ],
      },
      layer2: {
        deviations: [
          { feature: 'Heart Rate', current: '98 bpm', baselineMean: '74', baselineSD: '4.2', zScore: 5.7, trend: 'Rising' },
          { feature: 'Systolic BP', current: '142 mmHg', baselineMean: '128', baselineSD: '6.1', zScore: 2.3, trend: 'Stable' },
          { feature: 'SpO2', current: '94%', baselineMean: '97.5%', baselineSD: '0.8', zScore: -4.4, trend: 'Falling' },
        ],
      },
    },
  },
  {
    id: 'demo-p-2',
    name: 'Eleanor Vance',
    age: 81,
    sex: 'Female',
    tier: 'critical',
    riskScore: 88,
    lastCheckInAt: 'Today, 9:15 AM',
    keyDeviation: 'Severe hypoxia (SpO2 89%) and tachycardia (115 bpm)',
    assessment: {
      overallTier: 'critical',
      overallScore: 88,
      plainLanguageSummary:
        'SpO2 is critically low at 89% with high heart rate and chest tightness reported. Immediate doctor evaluation advised.',
      layer1: {
        news2Subtotal: 8,
        points: [
          { label: 'Heart Rate (115 bpm)', points: 2 },
          { label: 'SpO2 (89% Scale 1)', points: 3 },
          { label: 'Systolic BP (168 mmHg)', points: 2 },
          { label: 'Temperature (38.3 °C)', points: 1 },
        ],
      },
      layer2: {
        deviations: [
          { feature: 'SpO2', current: '89%', baselineMean: '96.2%', baselineSD: '0.9', zScore: -8.0, trend: 'Critically Low' },
          { feature: 'Heart Rate', current: '115 bpm', baselineMean: '78', baselineSD: '5.1', zScore: 7.2, trend: 'Spike' },
        ],
      },
    },
  },
  {
    id: 'demo-p-3',
    name: 'George Henderson',
    age: 68,
    sex: 'Male',
    tier: 'stable',
    riskScore: 18,
    lastCheckInAt: 'Today, 7:45 AM',
    keyDeviation: 'Normal steady state across all physiological parameters',
    assessment: {
      overallTier: 'stable',
      overallScore: 18,
      plainLanguageSummary:
        'All vital signs remain inside normal expected bounds with consistent daily compliance.',
      layer1: { news2Subtotal: 0, points: [] },
      layer2: {
        deviations: [
          { feature: 'Heart Rate', current: '72 bpm', baselineMean: '71', baselineSD: '3.8', zScore: 0.2, trend: 'Steady' },
        ],
      },
    },
  },
  {
    id: 'demo-p-4',
    name: 'Martha Stewart',
    age: 77,
    sex: 'Female',
    tier: 'high',
    riskScore: 74,
    lastCheckInAt: 'Today, 8:05 AM',
    keyDeviation: 'Fever (37.8°C) accompanied by persistent cough and tachypnea',
    assessment: {
      overallTier: 'high',
      overallScore: 74,
      plainLanguageSummary:
        'Fever with declining SpO2 indicating potential lower respiratory infection. Requires close observation.',
      layer1: {
        news2Subtotal: 6,
        points: [
          { label: 'Heart Rate (104 bpm)', points: 1 },
          { label: 'SpO2 (92%)', points: 2 },
          { label: 'Temperature (37.8 °C)', points: 1 },
          { label: 'Respiration Rate (22 bpm)', points: 2 },
        ],
      },
      layer2: {
        deviations: [
          { feature: 'Temperature', current: '37.8 °C', baselineMean: '36.5', baselineSD: '0.3', zScore: 4.3, trend: 'Rising' },
          { feature: 'SpO2', current: '92%', baselineMean: '97.0%', baselineSD: '0.8', zScore: -6.2, trend: 'Falling' },
        ],
      },
    },
  },
];

export default function DoctorTriage() {
  const [patients, setPatients] = useState(DEMO_PATIENTS);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // { type: 'medicines' | 'reports', patient: object }

  // Attempt to load assigned patient alerts from backend
  useEffect(() => {
    api
      .get('/clinical/alerts')
      .then((res) => {
        if (res.data?.alerts && res.data.alerts.length > 0) {
          setPatients((prev) => {
            const hasNewAlerts = res.data.alerts.some((a) => a.status === 'active');
            return hasNewAlerts ? [...prev] : prev;
          });
        }
      })
      .catch(() => {});
  }, []);

  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      const rankA = TIER_RANK[a.tier] ?? 99;
      const rankB = TIER_RANK[b.tier] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return (b.riskScore || 0) - (a.riskScore || 0);
    });
  }, [patients]);

  const filteredPatients = sortedPatients.filter((p) => {
    const matchesTier = tierFilter === 'all' || p.tier === tierFilter;
    const matchesQuery =
      p.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.tier.toLowerCase().includes(searchQuery.toLowerCase()) ||
      p.keyDeviation.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesTier && matchesQuery;
  });

  return (
    <div className="space-y-6 text-ink">
      {/* Header with Physician Metrics */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope size={24} className="text-brand" />
            <h1 className="text-h1 font-display text-ink">Physician Triage Queue</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Active roster: {patients.length} assigned patients • Sorted by clinical severity (NFR2/FR4)
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-critical/10 text-tier-critical border border-tier-critical/30">
            {patients.filter((p) => p.tier === 'critical').length} Critical
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-high/10 text-tier-high border border-tier-high/30">
            {patients.filter((p) => p.tier === 'high').length} High Risk
          </span>
          <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-moderate/10 text-tier-moderate border border-tier-moderate/30">
            {patients.filter((p) => p.tier === 'moderate' || p.tier === 'medium').length} Moderate
          </span>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[240px]">
          <Search
            size={16}
            className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft pointer-events-none"
          />
          <input
            type="text"
            className="w-full rounded-clinical border border-line pl-10 pr-4 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="Search patients by name, tier, or symptoms..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
        </div>

        <select
          className="rounded-clinical border border-line px-3.5 py-2 text-sm bg-surface text-ink focus:outline-none focus:ring-2 focus:ring-brand"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
        >
          <option value="all">All Tiers ({patients.length})</option>
          <option value="critical">Critical</option>
          <option value="high">High Risk</option>
          <option value="moderate">Moderate</option>
          <option value="stable">Stable</option>
        </select>
      </div>

      {/* Clinical Dense Triage Table (rounded-clinical, flat 4px radius) */}
      <div className="rounded-clinical border border-line overflow-x-auto bg-surface shadow-sm">
        <table className="w-full text-sm text-left">
          <thead className="bg-paper text-ink-soft uppercase text-xs tracking-wider border-b border-line">
            <tr>
              <th className="py-3 px-4 font-semibold">Patient</th>
              <th className="py-3 px-4 font-semibold">Age / Sex</th>
              <th className="py-3 px-4 font-semibold">Severity Tier</th>
              <th className="py-3 px-4 font-semibold">Last Check-In</th>
              <th className="py-3 px-4 font-semibold">Primary Clinical Indicator</th>
              <th className="py-3 px-4 font-semibold text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-line">
            {filteredPatients.map((patient) => {
              const isExpanded = expandedId === patient.id;
              return (
                <Fragment key={patient.id}>
                  <tr className={`hover:bg-paper/60 transition-colors ${isExpanded ? 'bg-paper/80' : ''}`}>
                    <td className="py-3 px-4 font-semibold text-ink">{patient.name}</td>
                    <td className="py-3 px-4 text-ink-soft">
                      {patient.age}y • {patient.sex}
                    </td>
                    <td className="py-3 px-4">
                      <RiskBadge tier={patient.tier} size="sm" />
                    </td>
                    <td className="py-3 px-4 text-ink-soft">{patient.lastCheckInAt}</td>
                    <td className="py-3 px-4 text-ink max-w-xs truncate" title={patient.keyDeviation}>
                      {patient.keyDeviation}
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setExpandedId((id) => (id === patient.id ? null : patient.id))}
                          className="px-3 py-1 rounded-clinical text-xs font-semibold bg-brand text-white hover:bg-brand-dark transition-colors"
                        >
                          {isExpanded ? 'Hide' : 'Review'}
                        </button>
                        <button
                          onClick={() => setActiveModal({ type: 'medicines', patient })}
                          title="Patient Medicines"
                          className="p-1 rounded-clinical border border-line hover:bg-paper text-ink-soft hover:text-ink transition-colors"
                        >
                          <Pill size={15} />
                        </button>
                        <button
                          onClick={() => setActiveModal({ type: 'reports', patient })}
                          title="Medical Reports"
                          className="p-1 rounded-clinical border border-line hover:bg-paper text-ink-soft hover:text-ink transition-colors"
                        >
                          <FileText size={15} />
                        </button>
                      </div>
                    </td>
                  </tr>

                  {/* Expanded Dual Explanation & Trajectory Row */}
                  {isExpanded && (
                    <tr>
                      <td colSpan={6} className="p-4 bg-paper border-b border-line">
                        <div className="max-w-4xl mx-auto space-y-4">
                          <div className="flex items-center justify-between">
                            <h3 className="text-h3 font-display text-ink flex items-center gap-2">
                              <Activity size={18} className="text-brand" />
                              Clinical Trajectory for {patient.name}
                            </h3>
                            <button
                              onClick={() => setExpandedId(null)}
                              className="text-xs text-ink-soft hover:text-ink underline"
                            >
                              Collapse
                            </button>
                          </div>

                          <AssessmentCard
                            role="doctor"
                            assessment={patient.assessment}
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Patient Specific Modal for Medicines or Reports */}
      {activeModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto bg-surface rounded-ritual shadow-ritual border border-line p-6 relative">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h3 className="text-h2 font-display text-ink">
                  {activeModal.type === 'medicines' ? 'Medication Inventory' : 'Medical Reports & Records'}
                </h3>
                <p className="text-xs text-ink-soft">
                  Viewing records for {activeModal.patient.name} ({activeModal.patient.age}y, {activeModal.patient.sex})
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-2 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {activeModal.type === 'medicines' ? (
              <MedicineManager
                patientId={activeModal.patient.id}
                userRole="doctor"
              />
            ) : (
              <ReportManager
                patientId={activeModal.patient.id}
                userRole="doctor"
              />
            )}
          </div>
        </div>
      )}
    </div>
  );
}
