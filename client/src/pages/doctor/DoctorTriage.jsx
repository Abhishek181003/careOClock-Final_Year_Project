import { Fragment, useEffect, useMemo, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Search, Stethoscope, X, Pill, FileText, Activity,
  RefreshCw, Users, AlertOctagon, PhoneCall, AlertTriangle,
  CheckCircle2, ChevronDown, ChevronUp, ShieldAlert,
} from 'lucide-react';
import { api } from '../../api/client';
import RiskBadge from '../../components/RiskBadge';
import AssessmentCard from '../../components/AssessmentCard';
import MedicineManager from '../../components/MedicineManager';
import ReportManager from '../../components/ReportManager';
import '../../components/dashboards/Dashboards.css';

const TIER_RANK = { critical: 0, high: 1, moderate: 2, medium: 2, stable: 3, low: 3, pending: 4 };

export default function DoctorTriage() {
  const [searchParams] = useSearchParams();
  const urlPatientId = searchParams.get('patientId');

  const [patients, setPatients] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [tierFilter, setTierFilter] = useState('all');
  const [sortBy, setSortBy] = useState('severity'); // 'severity' | 'name' | 'score'
  const [expandedId, setExpandedId] = useState(urlPatientId || null);
  const [activeModal, setActiveModal] = useState(null); // { type: 'medicines' | 'reports', patient: object }

  // Auto-expand patient if directed from clinical alert
  useEffect(() => {
    if (urlPatientId) {
      setExpandedId(urlPatientId);
      setTierFilter('all');
    }
  }, [urlPatientId]);

  // Load assigned patients from backend
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

    // Auto-refresh when careoclock refresh event fires
    const onRefresh = () => loadPatients();
    window.addEventListener('careoclock:refresh', onRefresh);
    return () => window.removeEventListener('careoclock:refresh', onRefresh);
  }, [loadPatients]);

  // Counts by tier
  const tierCounts = useMemo(() => {
    const counts = { critical: 0, high: 0, moderate: 0, stable: 0, pending: 0 };
    for (const p of patients) {
      const t = (p.tier || 'pending').toLowerCase();
      if (t === 'critical') counts.critical++;
      else if (t === 'high') counts.high++;
      else if (t === 'moderate' || t === 'medium') counts.moderate++;
      else if (t === 'stable' || t === 'low') counts.stable++;
      else counts.pending++;
    }
    return counts;
  }, [patients]);

  const sortedPatients = useMemo(() => {
    return [...patients].sort((a, b) => {
      if (sortBy === 'name') {
        return (a.name || '').localeCompare(b.name || '');
      }
      if (sortBy === 'score') {
        return (b.riskScore || 0) - (a.riskScore || 0);
      }
      // Default: severity tier rank then score
      const rankA = TIER_RANK[a.tier] ?? 99;
      const rankB = TIER_RANK[b.tier] ?? 99;
      if (rankA !== rankB) return rankA - rankB;
      return (b.riskScore || 0) - (a.riskScore || 0);
    });
  }, [patients, sortBy]);

  const filteredPatients = useMemo(() => {
    return sortedPatients.filter((p) => {
      const matchesTier =
        tierFilter === 'all' ||
        p.tier === tierFilter ||
        (tierFilter === 'moderate' && p.tier === 'medium') ||
        (tierFilter === 'stable' && p.tier === 'low');

      const q = searchQuery.toLowerCase().trim();
      const matchesQuery =
        !q ||
        (p.name && p.name.toLowerCase().includes(q)) ||
        (p.tier && p.tier.toLowerCase().includes(q)) ||
        (p.keyDeviation && p.keyDeviation.toLowerCase().includes(q));

      return matchesTier && matchesQuery;
    });
  }, [sortedPatients, tierFilter, searchQuery]);

  const toggleTierFilter = (tier) => {
    setTierFilter((prev) => (prev === tier ? 'all' : tier));
  };

  const [isSigningOff, setIsSigningOff] = useState(false);

  const handleDoctorSignOff = async (alertId) => {
    if (!alertId || isSigningOff) return;
    try {
      setIsSigningOff(true);
      await api.patch(`/clinical/alerts/${alertId}/acknowledge`, {
        resolutionNotes: 'Reviewed, confirmed clinically, and resolved by physician',
      });
      await loadPatients();
      window.dispatchEvent(new CustomEvent('careoclock:refresh'));
    } catch (err) {
      console.error('Failed to sign off alert:', err);
    } finally {
      setIsSigningOff(false);
    }
  };

  return (
    <div className="dash dash--wide dash-enter">
      {/* ── Physician Header ────────────────────────────────────── */}
      <div className="doc-header">
        <div>
          <div className="doc-header__title">
            <Stethoscope size={26} style={{ color: '#1D6F64' }} />
            <span>Physician Triage Queue</span>
          </div>
          <div className="doc-header__subtitle">
            Active Clinical Roster: {patients.length} assigned patient{patients.length === 1 ? '' : 's'} • Prioritized by dual-layer risk score
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => loadPatients()}
            title="Refresh Triage Queue"
            className="triage-icon-btn"
            aria-label="Refresh Roster"
          >
            <RefreshCw size={16} className={isLoading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* ── Interactive Tier Summary Metric Strip ────────────────── */}
      <div className="tier-summary-strip dash-enter dash-enter--d1">
        {/* Critical */}
        <div
          onClick={() => toggleTierFilter('critical')}
          className={`tier-summary-card tier-summary-card--critical ${tierFilter === 'critical' ? 'tier-summary-card--active' : ''}`}
          role="button"
          tabIndex={0}
          title="Filter critical patients"
        >
          <div className="tier-summary-card__icon" style={{ background: 'rgba(166, 66, 59, 0.12)', color: '#A6423B' }}>
            <PhoneCall size={18} />
          </div>
          <div>
            <div className="tier-summary-card__count" style={{ color: '#A6423B' }}>
              {tierCounts.critical}
            </div>
            <div className="tier-summary-card__label" style={{ color: '#A6423B' }}>
              Critical
            </div>
          </div>
        </div>

        {/* High Risk */}
        <div
          onClick={() => toggleTierFilter('high')}
          className={`tier-summary-card tier-summary-card--high ${tierFilter === 'high' ? 'tier-summary-card--active' : ''}`}
          role="button"
          tabIndex={0}
          title="Filter high risk patients"
        >
          <div className="tier-summary-card__icon" style={{ background: 'rgba(197, 106, 63, 0.12)', color: '#C56A3F' }}>
            <AlertOctagon size={18} />
          </div>
          <div>
            <div className="tier-summary-card__count" style={{ color: '#C56A3F' }}>
              {tierCounts.high}
            </div>
            <div className="tier-summary-card__label" style={{ color: '#C56A3F' }}>
              High Risk
            </div>
          </div>
        </div>

        {/* Moderate */}
        <div
          onClick={() => toggleTierFilter('moderate')}
          className={`tier-summary-card tier-summary-card--moderate ${tierFilter === 'moderate' ? 'tier-summary-card--active' : ''}`}
          role="button"
          tabIndex={0}
          title="Filter moderate risk patients"
        >
          <div className="tier-summary-card__icon" style={{ background: 'rgba(184, 134, 58, 0.12)', color: '#B8863A' }}>
            <AlertTriangle size={18} />
          </div>
          <div>
            <div className="tier-summary-card__count" style={{ color: '#B8863A' }}>
              {tierCounts.moderate}
            </div>
            <div className="tier-summary-card__label" style={{ color: '#B8863A' }}>
              Moderate
            </div>
          </div>
        </div>

        {/* Stable */}
        <div
          onClick={() => toggleTierFilter('stable')}
          className={`tier-summary-card tier-summary-card--stable ${tierFilter === 'stable' ? 'tier-summary-card--active' : ''}`}
          role="button"
          tabIndex={0}
          title="Filter stable patients"
        >
          <div className="tier-summary-card__icon" style={{ background: 'rgba(29, 111, 100, 0.12)', color: '#1D6F64' }}>
            <CheckCircle2 size={18} />
          </div>
          <div>
            <div className="tier-summary-card__count" style={{ color: '#1D6F64' }}>
              {tierCounts.stable}
            </div>
            <div className="tier-summary-card__label" style={{ color: '#1D6F64' }}>
              Stable
            </div>
          </div>
        </div>
      </div>

      {/* ── Search & Filter Bar ─────────────────────────────────── */}
      <div className="doc-filter-bar dash-enter dash-enter--d2">
        <div className="doc-search-wrap">
          <Search size={16} />
          <input
            type="text"
            className="doc-search-input"
            placeholder="Search patients by name, symptoms, or deviation..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink"
              aria-label="Clear search"
            >
              <X size={15} />
            </button>
          )}
        </div>

        <select
          className="doc-filter-select"
          value={tierFilter}
          onChange={(e) => setTierFilter(e.target.value)}
          aria-label="Filter by tier"
        >
          <option value="all">All Tiers ({patients.length})</option>
          <option value="critical">Critical ({tierCounts.critical})</option>
          <option value="high">High Risk ({tierCounts.high})</option>
          <option value="moderate">Moderate ({tierCounts.moderate})</option>
          <option value="stable">Stable ({tierCounts.stable})</option>
          <option value="pending">Pending ({tierCounts.pending})</option>
        </select>

        <select
          className="doc-filter-select"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort roster"
        >
          <option value="severity">Sort: Clinical Severity</option>
          <option value="score">Sort: Highest Risk Score</option>
          <option value="name">Sort: Patient Name (A-Z)</option>
        </select>
      </div>

      {/* ── Loading Spinner ─────────────────────────────────────── */}
      {isLoading && (
        <div className="py-16 text-center text-ink-soft">
          <div className="dash-spinner" />
          <p className="text-sm">Retrieving assigned patient roster and clinical telemetry...</p>
        </div>
      )}

      {/* ── Zero-State when no patients assigned ────────────────── */}
      {!isLoading && patients.length === 0 && (
        <div className="doc-zero-state dash-enter dash-enter--d3">
          <div className="doc-zero-state__icon">
            <Users size={28} />
          </div>
          <h3 className="doc-zero-state__title">No Patients Assigned Yet</h3>
          <p className="doc-zero-state__text">
            Your physician triage queue is currently clear. When patients select your name in their{' '}
            <strong className="text-ink">Profile &gt; Care Circle</strong>, their live telemetry, automated AI risk scores, and medical records will appear here in real time.
          </p>
          <button
            onClick={() => loadPatients()}
            className="triage-action-btn triage-action-btn--primary"
            style={{ padding: '0.6rem 1.4rem', fontSize: '0.9rem' }}
          >
            <RefreshCw size={14} className="inline mr-1.5" />
            Refresh Roster
          </button>
        </div>
      )}

      {/* ── Zero Results after filter ───────────────────────────── */}
      {!isLoading && patients.length > 0 && filteredPatients.length === 0 && (
        <div className="p-12 text-center rounded-2xl border border-line bg-surface">
          <ShieldAlert size={36} className="mx-auto text-ink-soft mb-2" />
          <h3 className="font-display font-bold text-base text-ink">No matching patients</h3>
          <p className="text-sm text-ink-soft mt-1">
            No patients match the filter criteria &quot;{tierFilter !== 'all' ? tierFilter : searchQuery}&quot;.
          </p>
          <button
            onClick={() => { setTierFilter('all'); setSearchQuery(''); }}
            className="mt-3 text-xs font-bold text-brand hover:underline"
          >
            Reset all filters
          </button>
        </div>
      )}

      {/* ── Patient Triage Table ────────────────────────────────── */}
      {!isLoading && filteredPatients.length > 0 && (
        <div className="triage-table-wrap dash-enter dash-enter--d3">
          <table className="triage-table">
            <thead>
              <tr>
                <th style={{ width: '28%' }}>Patient</th>
                <th style={{ width: '14%' }}>Age / Sex</th>
                <th style={{ width: '18%' }}>Severity Tier</th>
                <th style={{ width: '14%' }}>Score</th>
                <th style={{ width: '16%' }}>Last Check-In</th>
                <th style={{ width: '10%', textAlign: 'right' }}>Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredPatients.map((patient) => {
                const isExpanded = expandedId === patient.id;
                const tierKey = (patient.tier || 'stable').toLowerCase();
                const initials = patient.name
                  ? patient.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
                  : 'PT';

                return (
                  <Fragment key={patient.id}>
                    <tr>
                      <td>
                        <div className="flex items-center gap-3">
                          <span className={`triage-row-indicator triage-row-indicator--${tierKey}`} />
                          <div className="w-8 h-8 rounded-full bg-paper border border-line flex items-center justify-center text-xs font-bold text-ink shrink-0">
                            {initials}
                          </div>
                          <div>
                            <div className="font-bold text-ink leading-tight">{patient.name}</div>
                            {patient.keyDeviation && (
                              <div className="text-xs text-ink-soft truncate max-w-xs" title={patient.keyDeviation}>
                                {patient.keyDeviation}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="text-ink-soft text-xs">
                        {patient.age ? `${patient.age}y` : '—'} • {patient.sex || '—'}
                      </td>
                      <td>
                        <RiskBadge tier={patient.tier} size="sm" />
                      </td>
                      <td>
                        <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-paper border border-line text-ink">
                          {patient.riskScore || 0}/100
                        </span>
                      </td>
                      <td className="text-ink-soft text-xs">
                        <div>{patient.lastCheckInAt}</div>
                        {(patient.lastCheckInAt === 'No check-ins yet' ||
                          (patient.assessment?.recordedAt &&
                            new Date().getTime() - new Date(patient.assessment.recordedAt).getTime() > 24 * 3600 * 1000)) && (
                          <span className="inline-block text-[10px] font-bold text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded border border-amber-300 mt-1">
                            ⚠️ Check-in Overdue
                          </span>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setExpandedId((id) => (id === patient.id ? null : patient.id))}
                            className="triage-action-btn triage-action-btn--primary"
                            aria-expanded={isExpanded}
                          >
                            {isExpanded ? (
                              <span className="inline-flex items-center gap-1">
                                Hide <ChevronUp size={13} />
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1">
                                Review <ChevronDown size={13} />
                              </span>
                            )}
                          </button>
                          <button
                            onClick={() => setActiveModal({ type: 'medicines', patient })}
                            title="Patient Medications"
                            className="triage-icon-btn"
                            aria-label={`Medications for ${patient.name}`}
                          >
                            <Pill size={15} />
                          </button>
                          <button
                            onClick={() => setActiveModal({ type: 'reports', patient })}
                            title="Medical Reports"
                            className="triage-icon-btn"
                            aria-label={`Medical reports for ${patient.name}`}
                          >
                            <FileText size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>

                    {/* ── Expanded Clinical Trajectory Row ── */}
                    {isExpanded && (
                      <tr className="triage-expanded-row">
                        <td colSpan={6}>
                          <div className="max-w-4xl mx-auto space-y-4">
                            <div className="flex items-center justify-between">
                              <h3 className="text-sm font-bold font-display text-ink flex items-center gap-2">
                                <Activity size={18} style={{ color: '#1D6F64' }} />
                                Clinical Trajectory &amp; Telemetry for {patient.name}
                              </h3>
                              <button
                                onClick={() => setExpandedId(null)}
                                className="text-xs text-ink-soft hover:text-ink font-semibold"
                              >
                                Collapse View &times;
                              </button>
                            </div>

                            {patient.activeAlert && (
                              <div className="p-4 rounded-ritual bg-rose-50 border border-rose-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-sm">
                                <div className="space-y-1">
                                  <div className="font-bold text-rose-900 flex items-center gap-2 text-sm">
                                    <AlertOctagon size={16} className="text-rose-600 shrink-0" />
                                    <span>Active Incident: {patient.activeAlert.title}</span>
                                    <span className="font-mono text-[11px] bg-rose-200/80 text-rose-900 px-2 py-0.5 rounded uppercase font-bold">
                                      {patient.activeAlert.tier}
                                    </span>
                                  </div>
                                  <p className="text-rose-800 text-xs">
                                    {patient.activeAlert.message}
                                  </p>
                                  <div className="flex flex-wrap items-center gap-3 pt-1 text-[11px]">
                                    <span className="font-semibold text-ink">Family Awareness Status:</span>
                                    {patient.activeAlert.patientCheckedAt ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-medium">
                                        <CheckCircle2 size={12} className="text-emerald-700" /> Patient checked ({new Date(patient.activeAlert.patientCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                      </span>
                                    ) : null}
                                    {patient.activeAlert.caregiverCheckedAt ? (
                                      <span className="inline-flex items-center gap-1 text-emerald-800 bg-emerald-100 px-2 py-0.5 rounded font-medium">
                                        <CheckCircle2 size={12} className="text-emerald-700" /> Caregiver checked ({new Date(patient.activeAlert.caregiverCheckedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })})
                                      </span>
                                    ) : null}
                                    {!patient.activeAlert.patientCheckedAt && !patient.activeAlert.caregiverCheckedAt && (
                                      <span className="text-amber-800 bg-amber-100 px-2 py-0.5 rounded font-medium">
                                        Awaiting family check-in
                                      </span>
                                    )}
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleDoctorSignOff(patient.activeAlert.id)}
                                  disabled={isSigningOff}
                                  className="px-4 py-2 rounded-ritual bg-rose-700 hover:bg-rose-800 text-white font-bold shrink-0 transition-colors shadow-sm flex items-center justify-center gap-1.5 self-start sm:self-auto"
                                  title="Clinically sign off and resolve this emergency alert"
                                >
                                  <CheckCircle2 size={14} />
                                  <span>{isSigningOff ? 'Signing off...' : 'Sign Off & Resolve Alert'}</span>
                                </button>
                              </div>
                            )}

                            <AssessmentCard
                              role="doctor"
                              assessment={patient.assessment || {
                                overallTier: patient.tier,
                                overallScore: patient.riskScore,
                                plainLanguageSummary: patient.keyDeviation || 'No active check-in deviations.',
                              }}
                            />

                            <div className="flex items-center justify-between pt-2 border-t border-line text-xs text-ink-soft flex-wrap gap-2">
                              <span>Patient Clinical ID: <code>{patient.id}</code></span>
                              <div className="flex gap-2">
                                <button
                                  onClick={() => setActiveModal({ type: 'medicines', patient })}
                                  className="text-brand font-bold hover:underline inline-flex items-center gap-1"
                                >
                                  <Pill size={13} /> Open Medication Chart
                                </button>
                                <span>•</span>
                                <button
                                  onClick={() => setActiveModal({ type: 'reports', patient })}
                                  className="text-brand font-bold hover:underline inline-flex items-center gap-1"
                                >
                                  <FileText size={13} /> Review Lab Reports
                                </button>
                              </div>
                            </div>
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

      {/* ── Patient Specific Modal for Medicines or Reports ──────── */}
      {activeModal && (
        <div className="doc-modal-overlay" onClick={() => setActiveModal(null)}>
          <div className="doc-modal-pane" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start sm:items-center justify-between pb-3 border-b border-line mb-4 shrink-0">
              <div>
                <h3 className="font-display font-bold text-lg text-ink">
                  {activeModal.type === 'medicines'
                    ? 'Clinical Medication Orders & Adherence'
                    : 'Medical Reports & Diagnostic Records'}
                </h3>
                <p className="text-xs text-ink-soft">
                  Patient: <strong className="text-ink">{activeModal.patient.name}</strong> (
                  {activeModal.patient.age ? `${activeModal.patient.age}y` : 'Age N/A'},{' '}
                  {activeModal.patient.sex || 'Sex N/A'})
                </p>
              </div>
              <button
                onClick={() => setActiveModal(null)}
                className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
                aria-label="Close dialog"
              >
                <X size={20} />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto min-h-0">
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
        </div>
      )}
    </div>
  );
}
