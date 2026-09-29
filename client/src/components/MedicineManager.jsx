import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Pill,
  Clock,
  Plus,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Trash2,
  Search,
  Activity,
  PackagePlus,
  Info,
  Calendar,
  Sparkles,
  Heart,
  X,
  Stethoscope,
  ShieldCheck,
  Send,
} from 'lucide-react';
import ConfirmModal from './common/ConfirmModal';
import './MedicineManager.css';

const MOTIVATIONAL_QUOTES = [
  'Consistency in routine is the foundation of lifelong vitality.',
  'Taking medications on schedule is your daily commitment to good health.',
  'Every dose taken on time brings peace of mind to your loved ones.',
  'Small daily habits create powerful long-term well-being.',
];

const SLOT_CONFIGS = [
  { id: 'morning', label: 'Morning', icon: Clock },
  { id: 'afternoon', label: 'Afternoon', icon: Clock },
  { id: 'evening', label: 'Evening', icon: Clock },
  { id: 'night', label: 'Night', icon: Clock },
];

export default function MedicineManager({ token: propToken, patientId, userRole = 'patient' }) {
  const token =
    propToken ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('careoclock_token') : '');

  const [medicines, setMedicines] = useState([]);
  const [prescriptions, setPrescriptions] = useState([]);
  const [adherenceData, setAdherenceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [medDeleteTarget, setMedDeleteTarget] = useState(null);
  const [isDeletingMed, setIsDeletingMed] = useState(false);

  // Filtering & Modal States
  const [activeSlotFilter, setActiveSlotFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingMed, setIsAddingMed] = useState(false);

  // Refill Dialog State (Replaces hardcoded +30)
  const [refillTarget, setRefillTarget] = useState(null);
  const [refillAmount, setRefillAmount] = useState(30);
  const [isRefillingStock, setIsRefillingStock] = useState(false);

  // Proposal Action States
  const [proposalActionLoading, setProposalActionLoading] = useState(null);

  // New Medicine / Doctor Prescription Form State
  const [newMed, setNewMed] = useState({
    name: '',
    dosage: '',
    schedule: ['morning'],
    frequency: 'daily',
    durationDays: 14,
    stockCount: 30,
    lowStockThreshold: 5,
    unit: 'tablets',
    instructions: '',
    clinicalJustification: '',
  });

  const quoteIndex = new Date().getDay() % MOTIVATIONAL_QUOTES.length;
  const dailyQuote = MOTIVATIONAL_QUOTES[quoteIndex];

  // Fetch medicines, proposed prescriptions, and adherence metrics
  const loadMedicineData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');

    try {
      const queryParam = patientId && userRole !== 'patient' ? `?patientId=${patientId}` : '';

      // 1. Fetch Active Medicines
      const medRes = await fetch(`/api/medicines${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const medData = await medRes.json();

      if (medRes.ok) {
        setMedicines(medData.medicines || []);
      } else {
        setError(medData.error || 'Failed to load medicines.');
      }

      // 2. Fetch Prescriptions (to display physician proposals)
      try {
        const prescRes = await fetch(`/api/clinical/prescriptions${queryParam}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const prescData = await prescRes.json();
        if (prescRes.ok) {
          setPrescriptions(prescData.prescriptions || []);
        }
      } catch {
        setPrescriptions([]);
      }

      // 3. Fetch Adherence Metrics
      const targetId = patientId || (medData.patientId ? medData.patientId : '');
      if (targetId) {
        const adhRes = await fetch(`/api/medicines/adherence/${targetId}`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const adhJson = await adhRes.json();
        if (adhRes.ok) {
          setAdherenceData(adhJson);
        }
      }
    } catch (err) {
      setError(err.message || 'Error connecting to medicine services.');
    } finally {
      setIsLoading(false);
    }
  }, [token, patientId, userRole]);

  useEffect(() => {
    loadMedicineData();
  }, [loadMedicineData]);

  // Handle logging a dose (Patient only)
  const handleLogDose = async (medicine, action) => {
    setError('');
    setSuccessNotice('');

    try {
      const res = await fetch(`/api/medicines/${medicine._id}/doses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          quantity: 1,
          slot: medicine.schedule?.[0] || 'morning',
          notes: action === 'taken' ? 'Logged via Medication Manager' : 'Marked missed',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || 'Failed to log dose.');
        return;
      }

      setSuccessNotice(
        action === 'taken'
          ? `✓ Dose recorded for ${medicine.name}! Remaining stock: ${data.medicine?.stockCount ?? (medicine.stockCount - 1)} ${medicine.unit || 'tablets'}.`
          : `Dose of ${medicine.name} marked as missed.`
      );

      // Trigger global event so open dashboards refresh
      window.dispatchEvent(new CustomEvent('careoclock:refresh'));

      loadMedicineData();
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to log dose action.');
    }
  };

  // Handle flexible stock replenishment
  const handleConfirmRefill = async (e) => {
    e?.preventDefault();
    if (!refillTarget) return;

    const countToAdd = parseInt(refillAmount, 10);
    if (isNaN(countToAdd) || countToAdd <= 0) {
      setError('Please specify a positive number of doses to add.');
      return;
    }

    setError('');
    setSuccessNotice('');
    setIsRefillingStock(true);

    try {
      const newStock = (refillTarget.stockCount || 0) + countToAdd;
      const res = await fetch(`/api/medicines/${refillTarget._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stockCount: newStock }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessNotice(
          `Refilled ${refillTarget.name} with +${countToAdd} ${refillTarget.unit || 'tablets'}! Total stock: ${newStock}.`
        );
        setRefillTarget(null);
        setRefillAmount(30);
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || 'Failed to update stock count.');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to medicine service.');
    } finally {
      setIsRefillingStock(false);
    }
  };

  // Handle accepting a proposed prescription (Patient / Caregiver)
  const handleAcceptPrescription = async (prescriptionId) => {
    setProposalActionLoading(prescriptionId);
    setError('');
    setSuccessNotice('');

    try {
      const res = await fetch(`/api/clinical/prescriptions/${prescriptionId}/accept`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessNotice('✓ Prescription accepted and added to your active daily routine!');
        loadMedicineData();
        window.dispatchEvent(new CustomEvent('careoclock:refresh'));
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || 'Failed to accept prescription.');
      }
    } catch (err) {
      setError(err.message || 'Error accepting prescription.');
    } finally {
      setProposalActionLoading(null);
    }
  };

  // Handle declining a proposed prescription
  const handleRejectPrescription = async (prescriptionId) => {
    setProposalActionLoading(prescriptionId);
    setError('');

    try {
      const res = await fetch(`/api/clinical/prescriptions/${prescriptionId}/reject`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
      });

      const data = await res.json();
      if (res.ok) {
        setSuccessNotice('Prescription proposal declined.');
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || 'Failed to decline prescription.');
      }
    } catch (err) {
      setError(err.message || 'Error declining prescription.');
    } finally {
      setProposalActionLoading(null);
    }
  };

  // Handle deleting a medicine with ConfirmModal
  const handleDeleteMedicine = (medicineId, medName) => {
    setMedDeleteTarget({ id: medicineId, name: medName });
  };

  const handleConfirmDeleteMedicine = async () => {
    if (!medDeleteTarget) return;
    setIsDeletingMed(true);

    try {
      const res = await fetch(`/api/medicines/${medDeleteTarget.id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMedicines((prev) => prev.filter((m) => m._id !== medDeleteTarget.id));
        setSuccessNotice(`"${medDeleteTarget.name}" removed from active schedule.`);
        setMedDeleteTarget(null);
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove medication.');
      }
    } catch (err) {
      setError(err.message || 'Error removing medication.');
    } finally {
      setIsDeletingMed(false);
    }
  };

  // Handle form submission: Doctor writes prescription proposal; Patient adds routine medicine
  const handleCreateMedicine = async (e) => {
    e.preventDefault();
    setError('');

    if (!newMed.name || !newMed.dosage) {
      setError('Medication name and dosage are required.');
      return;
    }

    try {
      if (userRole === 'doctor') {
        // Doctor sends proposed prescription order with mandatory clinical justification
        if (!newMed.clinicalJustification.trim()) {
          setError('Please provide a clinical justification / rationale for the patient and caregiver.');
          return;
        }

        const res = await fetch('/api/clinical/prescriptions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify({
            patientId,
            medicationName: newMed.name,
            dose: newMed.dosage,
            schedule: newMed.schedule,
            instructions: newMed.instructions,
            durationDays: parseInt(newMed.durationDays, 10) || 0,
            clinicalJustification: newMed.clinicalJustification.trim(),
          }),
        });

        const data = await res.json();
        if (res.ok) {
          setSuccessNotice(
            `✓ Prescription proposal for "${newMed.name}" sent to patient for review and acceptance!`
          );
          setIsAddingMed(false);
          setNewMed({
            name: '',
            dosage: '',
            schedule: ['morning'],
            frequency: 'daily',
            durationDays: 14,
            stockCount: 30,
            lowStockThreshold: 5,
            unit: 'tablets',
            instructions: '',
            clinicalJustification: '',
          });
          loadMedicineData();
          setTimeout(() => setSuccessNotice(''), 4000);
        } else {
          setError(data.error || 'Failed to send prescription proposal.');
        }
      } else {
        // Patient adds directly to their inventory
        const payload = {
          ...newMed,
          durationDays: parseInt(newMed.durationDays, 10) || 0,
          patientId: patientId || undefined,
        };

        const res = await fetch('/api/medicines', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          body: JSON.stringify(payload),
        });

        const data = await res.json();
        if (res.ok) {
          setSuccessNotice(`✓ Medication "${newMed.name}" added to your daily schedule!`);
          setIsAddingMed(false);
          setNewMed({
            name: '',
            dosage: '',
            schedule: ['morning'],
            frequency: 'daily',
            durationDays: 14,
            stockCount: 30,
            lowStockThreshold: 5,
            unit: 'tablets',
            instructions: '',
            clinicalJustification: '',
          });
          loadMedicineData();
          setTimeout(() => setSuccessNotice(''), 4000);
        } else {
          setError(data.message || data.error || 'Failed to create medication.');
        }
      }
    } catch (err) {
      setError(err.message || 'Error creating medication.');
    }
  };

  const toggleSlot = (slotId) => {
    setNewMed((prev) => {
      const exists = prev.schedule.includes(slotId);
      if (exists) {
        if (prev.schedule.length === 1) return prev;
        return { ...prev, schedule: prev.schedule.filter((s) => s !== slotId) };
      }
      return { ...prev, schedule: [...prev.schedule, slotId] };
    });
  };

  // Filter medicines by search and active timing slot
  const filteredMedicines = useMemo(() => {
    return medicines.filter((med) => {
      const matchesSearch =
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (med.instructions && med.instructions.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSlot = activeSlotFilter === 'all' || med.schedule?.includes(activeSlotFilter);
      return matchesSearch && matchesSlot;
    });
  }, [medicines, searchQuery, activeSlotFilter]);

  // Filter pending proposed prescriptions
  const proposedPrescriptions = useMemo(() => {
    return prescriptions.filter((p) => p.status === 'proposed');
  }, [prescriptions]);

  const past30 = adherenceData?.past30Days;
  const lowStockCount = medicines.filter(
    (m) => m.stockCount <= (m.lowStockThreshold || 5) && m.stockCount > 0
  ).length;

  return (
    <div className="space-y-6">
      {/* ── Inspirational Reassurance Hero ────────────────────────────── */}
      <div className="p-4 sm:p-5 rounded-ritual bg-brand-light/30 border border-brand/20 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-ink">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-brand text-white flex items-center justify-center flex-shrink-0 shadow-sm">
            <Sparkles size={20} />
          </div>
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-brand block">
              {userRole === 'doctor' ? 'Clinical Medication Review' : 'Medication Ritual'}
            </span>
            <p className="text-xs sm:text-sm font-medium italic text-ink-soft">
              &quot;{dailyQuote}&quot;
            </p>
          </div>
        </div>

        {userRole === 'doctor' && (
          <span className="text-xs px-3 py-1 rounded-full bg-surface border border-line font-semibold text-ink-soft shrink-0">
            Physician Perspective: Read &amp; Order
          </span>
        )}
      </div>

      {/* ── Pending Prescriptions Proposals Banner (Patient & Caregiver) ── */}
      {userRole !== 'doctor' && proposedPrescriptions.length > 0 && (
        <div className="p-5 rounded-ritual bg-amber-500/10 border-2 border-amber-500/30 space-y-4 animate-fade-in shadow-sm">
          <div className="flex items-center gap-2 text-amber-900 font-bold text-base">
            <Stethoscope size={20} className="text-amber-700" />
            <span>Prescription Recommendation from Your Physician ({proposedPrescriptions.length})</span>
          </div>

          <p className="text-xs text-ink-soft">
            Your designated doctor has recommended the following medication regimen. Review the clinical justification and accept to add directly to your daily routine.
          </p>

          <div className="space-y-3">
            {proposedPrescriptions.map((prop) => (
              <div
                key={prop._id}
                className="bg-surface rounded-clinical p-4 border border-line space-y-3 shadow-sm"
              >
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2">
                  <div>
                    <h4 className="font-bold text-base text-ink">
                      {prop.medicationName} — <span className="text-brand">{prop.dose}</span>
                    </h4>
                    <p className="text-xs text-ink-soft mt-0.5">
                      Schedule: <strong className="capitalize">{prop.schedule?.join(', ')}</strong> •{' '}
                      {prop.durationDays > 0 ? `Prescribed Course: ${prop.durationDays} days` : 'Ongoing medication'}
                    </p>
                    {prop.doctorId?.displayName && (
                      <p className="text-xs text-brand font-medium mt-0.5 flex items-center gap-1">
                        <Stethoscope size={12} />
                        <span>Prescribed by Dr. {prop.doctorId.displayName.replace(/^Dr\.\s*/i, '')}</span>
                      </p>
                    )}
                  </div>

                  <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold border border-amber-200">
                    Awaiting Acceptance
                  </span>
                </div>

                {prop.clinicalJustification && (
                  <div className="p-3 rounded-clinical bg-paper border border-line text-xs space-y-1">
                    <strong className="text-ink font-semibold flex items-center gap-1">
                      <Info size={13} className="text-brand" /> Clinical Justification / Reason:
                    </strong>
                    <p className="text-ink-soft italic leading-relaxed">
                      &quot;{prop.clinicalJustification}&quot;
                    </p>
                  </div>
                )}

                <div className="flex items-center justify-end gap-2 pt-1 border-t border-line">
                  <button
                    type="button"
                    disabled={proposalActionLoading === prop._id}
                    onClick={() => handleRejectPrescription(prop._id)}
                    className="px-3.5 py-1.5 rounded-full border border-line text-xs font-semibold text-ink-soft hover:text-ink hover:bg-paper transition-colors disabled:opacity-50"
                  >
                    Decline
                  </button>
                  <button
                    type="button"
                    disabled={proposalActionLoading === prop._id}
                    onClick={() => handleAcceptPrescription(prop._id)}
                    className="px-4 py-1.5 rounded-full bg-brand text-white text-xs font-bold hover:bg-brand-dark shadow-sm flex items-center gap-1.5 transition-all disabled:opacity-50"
                  >
                    <CheckCircle2 size={14} />
                    <span>{proposalActionLoading === prop._id ? 'Accepting...' : 'Accept & Add to Routine'}</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Adherence & Inventory Summary Cards ───────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Weekly Adherence Rate */}
        <div className="p-4 rounded-ritual bg-surface border border-line shadow-ritual space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              7-Day Adherence
            </span>
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-800 border border-emerald-200">
              {adherenceData?.past7Days?.status || 'Good'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-display font-extrabold text-ink">
              {adherenceData?.past7Days?.adherenceRate != null
                ? `${adherenceData.past7Days.adherenceRate}%`
                : '100%'}
            </span>
            <span className="text-xs text-ink-soft">Doses Taken on Schedule</span>
          </div>

          <div className="w-full bg-paper rounded-full h-2.5 overflow-hidden border border-line">
            <div
              className="bg-brand h-full rounded-full transition-all duration-500"
              style={{ width: `${Math.min(adherenceData?.past7Days?.adherenceRate ?? 100, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>Taken: {adherenceData?.past7Days?.dosesTaken ?? 0}</span>
            <span>Scheduled: {adherenceData?.past7Days?.totalScheduled ?? 0}</span>
          </div>
        </div>

        {/* 30-Day Monthly Consistency */}
        <div className="p-4 rounded-ritual bg-surface border border-line shadow-ritual space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              30-Day Adherence
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                (past30?.adherenceRate ?? 100) >= 80
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : 'bg-amber-50 text-amber-800 border-amber-200'
              }`}
            >
              {past30?.status || 'Active'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-display font-extrabold text-ink">
              {past30?.adherenceRate != null ? `${past30.adherenceRate}%` : '100%'}
            </span>
            <span className="text-xs text-ink-soft">Monthly Consistency</span>
          </div>

          <div className="w-full bg-paper rounded-full h-2.5 overflow-hidden border border-line">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (past30?.adherenceRate ?? 100) >= 80 ? 'bg-emerald-500' : 'bg-amber-500'
              }`}
              style={{ width: `${Math.min(past30?.adherenceRate ?? 100, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>Taken: {past30?.dosesTaken ?? 0}</span>
            <span>Missed: {past30?.dosesMissed ?? 0}</span>
          </div>
        </div>

        {/* Inventory Stock Status */}
        <div className="p-4 rounded-ritual bg-surface border border-line shadow-ritual space-y-3 sm:col-span-2 lg:col-span-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Prescription Inventory
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                lowStockCount > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-300'
                  : 'bg-emerald-50 text-emerald-800 border-emerald-200'
              }`}
            >
              {lowStockCount > 0 ? `${lowStockCount} Need Refill` : 'All Stocked'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-display font-extrabold text-ink">
              {medicines.length}
            </span>
            <span className="text-xs text-ink-soft">Active Prescriptions Tracked</span>
          </div>

          <p className="text-xs text-ink-soft leading-relaxed">
            {lowStockCount > 0 ? (
              <span className="text-amber-800 font-medium flex items-center gap-1">
                <AlertTriangle size={13} className="text-amber-600 flex-shrink-0" />
                {lowStockCount} medication{lowStockCount > 1 ? 's are' : ' is'} running low on doses.
              </span>
            ) : (
              <span className="text-emerald-800 font-medium flex items-center gap-1">
                <CheckCircle2 size={13} className="text-emerald-600 flex-shrink-0" />
                All prescription stocks are healthy and above refill thresholds.
              </span>
            )}
          </p>
        </div>
      </div>

      {/* ── Notification & Alert Banners ──────────────────────────────── */}
      {error && (
        <div className="p-3.5 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-center justify-between gap-3 animate-pop">
          <div className="flex items-center gap-2">
            <AlertTriangle size={16} className="text-rose-600 flex-shrink-0" />
            <span>{error}</span>
          </div>
          <button onClick={() => setError('')} className="text-rose-600 hover:text-rose-900">
            <X size={14} />
          </button>
        </div>
      )}

      {successNotice && (
        <div className="p-3.5 rounded-ritual bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-center justify-between gap-3 animate-pop">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={16} className="text-emerald-600 flex-shrink-0" />
            <span className="font-medium">{successNotice}</span>
          </div>
          <button onClick={() => setSuccessNotice('')} className="text-emerald-600 hover:text-emerald-900">
            <X size={14} />
          </button>
        </div>
      )}

      {/* ── Filter Toolbar & Action Buttons ───────────────────────────── */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 flex-wrap">
        {/* Search Bar */}
        <div className="relative flex-1 min-w-[220px]">
          <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-soft" />
          <input
            type="text"
            placeholder="Search medications or instructions..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 rounded-full border border-line bg-surface text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
          />
        </div>

        {/* Add / Prescribe Action */}
        <button
          type="button"
          onClick={() => setIsAddingMed(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          {userRole === 'doctor' ? (
            <>
              <Stethoscope size={16} />
              <span>Prescribe New Medication</span>
            </>
          ) : (
            <>
              <Plus size={16} />
              <span>Add Medication</span>
            </>
          )}
        </button>
      </div>

      {/* Ritual Slot Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1" role="tablist">
        <button
          type="button"
          onClick={() => setActiveSlotFilter('all')}
          className={`px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
            activeSlotFilter === 'all'
              ? 'bg-brand text-white shadow-sm'
              : 'bg-paper text-ink-soft hover:bg-surface border border-line'
          }`}
        >
          All ({medicines.length})
        </button>

        {SLOT_CONFIGS.map(({ id, label, icon: SlotIcon }) => {
          const count = medicines.filter((m) => m.schedule?.includes(id)).length;
          const isSelected = activeSlotFilter === id;
          return (
            <button
              key={id}
              type="button"
              onClick={() => setActiveSlotFilter(id)}
              className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-semibold whitespace-nowrap transition-all ${
                isSelected
                  ? 'bg-brand text-white shadow-sm'
                  : 'bg-paper text-ink-soft hover:bg-surface border border-line'
              }`}
            >
              <SlotIcon size={14} />
              <span>{label}</span>
              <span
                className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                  isSelected ? 'bg-white/25 text-white' : 'bg-surface text-ink-soft border border-line'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      {/* ── Medication Cards Grid ─────────────────────────────────────── */}
      {filteredMedicines.length === 0 ? (
        <div className="p-10 rounded-ritual bg-surface border border-line shadow-ritual text-center space-y-3">
          <div className="w-14 h-14 mx-auto rounded-full bg-brand-light/50 flex items-center justify-center text-brand">
            <Pill size={28} />
          </div>
          <div>
            <h4 className="text-base font-display font-bold text-ink">No Medications Found</h4>
            <p className="text-xs text-ink-soft max-w-md mx-auto mt-1">
              {searchQuery || activeSlotFilter !== 'all'
                ? 'No prescriptions match your selected filters. Try clearing your search query or selecting "All".'
                : userRole === 'doctor'
                ? 'No medications currently scheduled for this patient. Click "Prescribe New Medication" to propose a prescription.'
                : 'Your medication schedule is currently empty. Click "Add Medication" above to track doses, schedules, and stock levels.'}
            </p>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMedicines.map((med) => {
            const isZero = med.stockCount === 0;
            const isLow = med.stockCount <= (med.lowStockThreshold || 5);

            // Compute remaining days in duration course if durationDays > 0
            let durationString = 'Ongoing routine';
            let daysRemaining = null;
            if (med.durationDays && med.durationDays > 0) {
              const start = new Date(med.startDate || med.createdAt);
              const now = new Date();
              const diffDays = Math.floor((now - start) / (1000 * 60 * 60 * 24));
              daysRemaining = Math.max(0, med.durationDays - diffDays);
              durationString = `${med.durationDays} Days Course (${daysRemaining} days remaining)`;
            }

            return (
              <div
                key={med._id}
                className="p-5 rounded-ritual bg-surface border border-line shadow-ritual hover:shadow-md transition-all flex flex-col justify-between space-y-4 animate-pop"
              >
                {/* Card Header & Title */}
                <div className="space-y-2.5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-2.5">
                      <div className="w-10 h-10 rounded-full bg-brand-light text-brand flex items-center justify-center flex-shrink-0">
                        <Pill size={20} />
                      </div>
                      <div>
                        <h3 className="text-base font-display font-bold text-ink leading-tight">
                          {med.name}
                        </h3>
                        <span className="text-xs font-semibold text-ink-soft">
                          {med.dosage} • {med.frequency || 'daily'}
                        </span>
                      </div>
                    </div>

                    {/* Stock Pill (Shown for patient/caregiver, hidden or read-only for doctor) */}
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                        isZero
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : isLow
                          ? 'bg-amber-50 text-amber-800 border-amber-300'
                          : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {isZero ? (
                        <>
                          <XCircle size={11} /> Out of Stock
                        </>
                      ) : isLow ? (
                        <>
                          <AlertTriangle size={11} /> Low: {med.stockCount} {med.unit || 'left'}
                        </>
                      ) : (
                        <>
                          <CheckCircle2 size={11} /> {med.stockCount} {med.unit || 'tablets'}
                        </>
                      )}
                    </span>
                  </div>

                  {/* Scheduled Slot Badges */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {med.schedule?.map((slot) => {
                      const cfg = SLOT_CONFIGS.find((s) => s.id === slot);
                      const Icon = cfg?.icon || Clock;
                      return (
                        <span
                          key={slot}
                          className="inline-flex items-center gap-1 text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-paper text-ink-soft border border-line"
                        >
                          <Icon size={11} />
                          <span>{slot}</span>
                        </span>
                      );
                    })}
                  </div>

                  {/* Duration Badge */}
                  <div className="flex items-center gap-1 text-[11px] text-ink-soft font-medium">
                    <Calendar size={12} className="text-brand" />
                    <span>{durationString}</span>
                  </div>

                  {/* Clinical Instructions / Justification */}
                  {med.clinicalJustification && (
                    <div className="p-2.5 rounded-clinical bg-brand/5 border border-brand/15 text-xs text-ink space-y-0.5">
                      <strong className="text-brand font-semibold block text-[11px]">
                        Clinical Rationale:
                      </strong>
                      <span className="text-ink-soft leading-snug">{med.clinicalJustification}</span>
                    </div>
                  )}

                  {med.instructions && (
                    <div className="p-2.5 rounded-clinical bg-paper border border-line text-xs text-ink-soft flex items-start gap-1.5">
                      <Info size={14} className="text-brand flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{med.instructions}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Toolbar */}
                <div className="pt-2 border-t border-line flex flex-col gap-2">
                  {userRole === 'doctor' ? (
                    /* Doctor Action Toolbar: Clean clinical view (No taking doses or refill buttons) */
                    <div className="flex items-center justify-between text-xs text-ink-soft">
                      <span className="flex items-center gap-1 font-medium text-emerald-800">
                        <ShieldCheck size={14} className="text-emerald-600" /> Active Schedule
                      </span>
                      <button
                        type="button"
                        onClick={() => handleDeleteMedicine(med._id, med.name)}
                        className="p-1.5 rounded-full hover:bg-rose-50 text-ink-soft hover:text-rose-600 transition-colors"
                        title="Discontinue this medication"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ) : (
                    /* Patient / Caregiver Toolbar: Dose logging & Custom Refill */
                    <div className="flex items-center gap-2">
                      {/* Take Dose Button */}
                      <button
                        type="button"
                        onClick={() => handleLogDose(med, 'taken')}
                        disabled={isZero}
                        className="flex-1 py-2 px-3 rounded-full bg-brand hover:bg-brand-dark text-white font-semibold text-xs transition-all flex items-center justify-center gap-1.5 disabled:opacity-40 disabled:cursor-not-allowed active:scale-95 shadow-sm"
                        title={isZero ? 'Stock is depleted. Please refill first.' : 'Record dose taken'}
                      >
                        <CheckCircle2 size={14} />
                        <span>{isZero ? 'Depleted' : 'Take Dose'}</span>
                      </button>

                      {/* Mark Missed Button */}
                      <button
                        type="button"
                        onClick={() => handleLogDose(med, 'missed')}
                        className="py-2 px-3 rounded-full bg-paper hover:bg-surface text-ink-soft hover:text-ink font-semibold text-xs border border-line transition-all active:scale-95"
                        title="Record dose missed"
                      >
                        <span>Missed</span>
                      </button>

                      {/* Flexible Refill Button */}
                      <button
                        type="button"
                        onClick={() => {
                          setRefillTarget(med);
                          setRefillAmount(30);
                        }}
                        className="p-2 rounded-full bg-paper hover:bg-brand-light text-brand hover:text-brand-dark border border-line transition-all active:scale-95"
                        title="Refill stock inventory"
                      >
                        <PackagePlus size={15} />
                      </button>

                      {/* Delete Medicine Button */}
                      <button
                        type="button"
                        onClick={() => handleDeleteMedicine(med._id, med.name)}
                        className="p-2 rounded-full hover:bg-rose-50 text-ink-soft hover:text-rose-600 border border-transparent hover:border-rose-200 transition-all active:scale-95"
                        title="Remove prescription from schedule"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Doctor View: Proposed Prescriptions Section ───────────────── */}
      {userRole === 'doctor' && proposedPrescriptions.length > 0 && (
        <div className="p-5 rounded-ritual bg-surface border border-line space-y-3">
          <div className="flex items-center gap-2 text-ink font-bold text-base">
            <Stethoscope size={18} className="text-brand" />
            <span>Prescription Orders Pending Patient / Caregiver Confirmation</span>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {proposedPrescriptions.map((p) => (
              <div key={p._id} className="p-3.5 rounded-clinical bg-paper border border-line space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-bold text-sm text-ink">{p.medicationName} ({p.dose})</h4>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                    Proposed
                  </span>
                </div>
                <p className="text-xs text-ink-soft">
                  Schedule: {p.schedule?.join(', ')} • {p.durationDays > 0 ? `${p.durationDays} days` : 'Ongoing'}
                </p>
                {p.clinicalJustification && (
                  <p className="text-xs text-ink-soft italic">
                    Reason: {p.clinicalJustification}
                  </p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Modal: Add Medicine / Doctor Clinical Prescription Order ──── */}
      {isAddingMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl max-h-[88vh] overflow-y-auto bg-surface rounded-ritual shadow-2xl border border-line p-6 relative space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-full bg-brand-light flex items-center justify-center text-brand">
                  {userRole === 'doctor' ? <Stethoscope size={20} /> : <Pill size={20} />}
                </div>
                <div>
                  <h3 className="text-lg font-display font-bold text-ink">
                    {userRole === 'doctor'
                      ? 'Write Clinical Prescription Proposal'
                      : 'Add New Medication'}
                  </h3>
                  <p className="text-xs text-ink-soft">
                    {userRole === 'doctor'
                      ? 'Orders are sent to the patient/caregiver to review and confirm into their active schedule.'
                      : 'Schedule your prescription or OTC medications with automatic inventory tracking.'}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsAddingMed(false)}
                className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleCreateMedicine} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {/* Medication Name */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Medication Name *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Metformin, Amlodipine"
                    value={newMed.name}
                    onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  />
                </div>

                {/* Dosage */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Dosage &amp; Strength *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 500mg, 1 tablet"
                    value={newMed.dosage}
                    onChange={(e) => setNewMed({ ...newMed, dosage: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  />
                </div>
              </div>

              {/* Schedule Slots Multi-Select */}
              <div className="space-y-1.5">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Scheduled Dose Timing Slots *
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {SLOT_CONFIGS.map(({ id, label, icon: SlotIcon }) => {
                    const isSelected = newMed.schedule.includes(id);
                    return (
                      <button
                        type="button"
                        key={id}
                        onClick={() => toggleSlot(id)}
                        className={`p-2.5 rounded-clinical border text-xs font-semibold flex items-center justify-center gap-1.5 transition-all ${
                          isSelected
                            ? 'bg-brand text-white border-brand shadow-sm'
                            : 'bg-paper text-ink-soft border-line hover:bg-surface'
                        }`}
                      >
                        <SlotIcon size={14} />
                        <span>{label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Duration in Days & Frequency */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Duration (Days) *
                  </label>
                  <div className="flex items-center gap-2">
                    <input
                      type="number"
                      min="0"
                      value={newMed.durationDays}
                      onChange={(e) =>
                        setNewMed({ ...newMed, durationDays: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                    />
                    <span className="text-[11px] text-ink-soft whitespace-nowrap">
                      {newMed.durationDays > 0 ? `${newMed.durationDays} days` : '0 = Ongoing'}
                    </span>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Frequency
                  </label>
                  <select
                    value={newMed.frequency}
                    onChange={(e) => setNewMed({ ...newMed, frequency: e.target.value })}
                    className="w-full px-3 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  >
                    <option value="daily">Daily</option>
                    <option value="twice_daily">Twice Daily</option>
                    <option value="every_other_day">Every Other Day</option>
                    <option value="as_needed">As Needed (PRN)</option>
                  </select>
                </div>
              </div>

              {/* Clinical Justification (Crucial for Doctor order) */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Clinical Rationale / Justification {userRole === 'doctor' ? '*' : '(Optional)'}
                </label>
                <textarea
                  rows={2}
                  required={userRole === 'doctor'}
                  placeholder={
                    userRole === 'doctor'
                      ? 'Why is this medication prescribed or adjusted? (Visible to patient & family caregiver)'
                      : 'Note on why you take this medication'
                  }
                  value={newMed.clinicalJustification}
                  onChange={(e) =>
                    setNewMed({ ...newMed, clinicalJustification: e.target.value })
                  }
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                />
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Patient Instructions (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Take with food; do not crush tablet"
                  value={newMed.instructions}
                  onChange={(e) => setNewMed({ ...newMed, instructions: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                />
              </div>

              {/* Inventory settings for patient self-adding */}
              {userRole !== 'doctor' && (
                <div className="grid grid-cols-2 gap-3 pt-1">
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Initial Stock
                    </label>
                    <input
                      type="number"
                      min="0"
                      value={newMed.stockCount}
                      onChange={(e) =>
                        setNewMed({ ...newMed, stockCount: parseInt(e.target.value, 10) || 0 })
                      }
                      className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs font-mono font-bold"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                      Unit
                    </label>
                    <select
                      value={newMed.unit}
                      onChange={(e) => setNewMed({ ...newMed, unit: e.target.value })}
                      className="w-full px-3 py-2 rounded-clinical border border-line bg-paper text-ink text-xs"
                    >
                      <option value="tablets">Tablets</option>
                      <option value="capsules">Capsules</option>
                      <option value="drops">Drops</option>
                      <option value="ml">Milliliters</option>
                    </select>
                  </div>
                </div>
              )}

              {/* Modal Actions */}
              <div className="pt-3 border-t border-line flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddingMed(false)}
                  className="px-4 py-2 rounded-full border border-line bg-paper hover:bg-surface text-ink-soft hover:text-ink text-xs font-semibold transition-all"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95 flex items-center gap-1.5"
                >
                  {userRole === 'doctor' ? (
                    <>
                      <Send size={14} />
                      <span>Send Prescription Order</span>
                    </>
                  ) : (
                    <span>Save to Daily Routine</span>
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Modal: Custom Specific Stock Replenishment ───────────────── */}
      {refillTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-md bg-surface rounded-ritual shadow-modal border border-line p-6 space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <h3 className="font-display font-bold text-base text-ink flex items-center gap-2">
                <PackagePlus size={18} className="text-brand" />
                <span>Refill Stock: {refillTarget.name}</span>
              </h3>
              <button
                onClick={() => setRefillTarget(null)}
                className="text-ink-soft hover:text-ink text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-ink-soft">
              Current inventory: <strong>{refillTarget.stockCount} {refillTarget.unit || 'tablets'}</strong>. Select a quick quantity or enter a custom amount to add.
            </p>

            <form onSubmit={handleConfirmRefill} className="space-y-4">
              {/* Quick Presets */}
              <div className="grid grid-cols-4 gap-2">
                {[10, 30, 60, 90].map((amt) => (
                  <button
                    key={amt}
                    type="button"
                    onClick={() => setRefillAmount(amt)}
                    className={`py-2 rounded-clinical border text-xs font-bold transition-all ${
                      refillAmount === amt
                        ? 'bg-brand text-white border-brand shadow-sm'
                        : 'bg-paper text-ink border-line hover:bg-surface'
                    }`}
                  >
                    +{amt}
                  </button>
                ))}
              </div>

              {/* Exact Custom Amount */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Or Enter Specific Quantity to Add:
                </label>
                <input
                  type="number"
                  min="1"
                  max="1000"
                  value={refillAmount}
                  onChange={(e) => setRefillAmount(parseInt(e.target.value, 10) || '')}
                  className="w-full px-3.5 py-2.5 rounded-clinical border border-line bg-paper text-ink text-sm font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                  required
                />
              </div>

              <div className="p-3 rounded bg-brand/5 border border-brand/20 text-xs text-ink flex items-center justify-between">
                <span>New Total Inventory:</span>
                <strong className="text-brand text-sm font-mono">
                  {(refillTarget.stockCount || 0) + (parseInt(refillAmount, 10) || 0)} {refillTarget.unit || 'tablets'}
                </strong>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRefillTarget(null)}
                  className="px-4 py-2 rounded-full border border-line text-ink-soft hover:text-ink text-xs font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isRefillingStock}
                  className="px-5 py-2 rounded-full bg-brand text-white text-xs font-bold hover:bg-brand-dark transition-all disabled:opacity-50"
                >
                  {isRefillingStock ? 'Updating...' : 'Confirm Stock Addition'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ── Critical Alert: Irreversible Medication Schedule Removal ──── */}
      <ConfirmModal
        isOpen={Boolean(medDeleteTarget)}
        title="Remove Medication Schedule?"
        message={`Are you sure you want to remove "${medDeleteTarget?.name}" from your active schedule? This will stop daily dosage reminders and compliance streak calculations for this medication.`}
        confirmLabel="Confirm Removal"
        cancelLabel="Keep in Schedule"
        isLoading={isDeletingMed}
        onConfirm={handleConfirmDeleteMedicine}
        onCancel={() => setMedDeleteTarget(null)}
      />
    </div>
  );
}
