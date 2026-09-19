import { Fragment, useEffect, useMemo, useState, useCallback } from 'react';
import { Search, Stethoscope, X, Pill, FileText, Activity, RefreshCw, Users } from 'lucide-react';
import { api } from '../../api/client';
import RiskBadge from '../../components/RiskBadge';
import AssessmentCard from '../../components/AssessmentCard';
import MedicineManager from '../../components/MedicineManager';
import ReportManager from '../../components/ReportManager';

const TIER_RANK = { critical: 0, high: 1, moderate: 2, medium: 2, stable: 3, low: 3, pending: 4 };

export default function DoctorTriage() {
  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [expandedId, setExpandedId] = useState(null);
  const [activeModal, setActiveModal] = useState(null); // { type: 'medicines' | 'reports', patient: object }

  // Load real assigned patients from backend with zero dummy fallbacks
  const loadPatients = useCallback(async () => {
    setIsLoading(true);
    try {
      const res = await api.get('/clinical/patients');
      setPatients(res.data?.patients || []);
    } catch (err) {
      console.error('Failed to load doctor triage patients:', err);
      setPatients([]);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPatients();
  }, [loadPatients]);

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
      (p.keyDeviation && p.keyDeviation.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchesTier && matchesQuery;
  });

  return (
    <div className="space-y-6 text-ink pb-12">
      {/* Header with Physician Metrics */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Stethoscope size={24} className="text-brand" />
            <h1 className="text-h1 font-display text-ink">Physician Triage Queue</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Active Clinical Roster: {patients.length} assigned patient{patients.length === 1 ? '' : 's'} • Sorted by clinical severity (NFR2/FR4)
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-critical/10 text-tier-critical border border-tier-critical/30">
              {patients.filter((p) => p.tier === 'critical').length} Critical
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-high/10 text-tier-high border border-tier-high/30">
              {patients.filter((p) => p.tier === 'high').length} High Risk
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-tier-moderate/10 text-tier-moderate border border-tier-moderate/30">
              {patients.filter((p) => p.tier === 'moderate' || p.tier === 'medium').length} Moderate
            </span>
            <span className="px-3 py-1 rounded-full text-xs font-semibold bg-emerald-50 text-emerald-800 border border-emerald-200">
              {patients.filter((p) => p.tier === 'stable' || p.tier === 'low').length} Stable
            </span>
          </div>

          <button
            onClick={() => loadPatients()}
            title="Refresh Triage Queue"
            className="p-2 rounded-full border border-line bg-surface hover:bg-paper text-ink-soft hover:text-ink transition-colors"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="py-16 text-center text-ink-soft">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-2 border-brand border-t-transparent mb-2" />
          <p className="text-sm">Retrieving assigned patient roster and clinical telemetry...</p>
        </div>
      )}

      {/* Clean Zero-State when no real patients linked */}
      {!isLoading && patients.length === 0 && (
        <div className="py-16 px-6 text-center space-y-4 rounded-ritual bg-surface border border-line shadow-ritual max-w-2xl mx-auto">
          <div className="w-14 h-14 rounded-full bg-brand-light flex items-center justify-center mx-auto text-brand">
            <Users size={28} />
          </div>
          <div className="space-y-1.5">
            <h3 className="text-h2 font-display text-ink">No Patients Assigned Yet</h3>
            <p className="text-sm text-ink-soft max-w-md mx-auto leading-relaxed">
              Your physician triage queue is currently clear. When patients register and select your name in their{' '}
              <strong className="text-ink">Profile &gt; Care Circle</strong>, their live telemetry, automated AI risk scores, and medical records will appear here in real time.
            </p>
          </div>
          <button
            onClick={() => loadPatients()}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors shadow-sm"
          >
            <RefreshCw size={14} />
            <span>Refresh Roster</span>
          </button>
        </div>
      )}

      {/* Filter and Search Bar for Active Roster */}
      {!isLoading && patients.length > 0 && (
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
            <option value="pending">Pending</option>
          </select>
        </div>
      )}

      {/* Clinical Dense Triage Table (rounded-clinical, flat 4px radius) */}
      {!isLoading && patients.length > 0 && (
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
      )}

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
