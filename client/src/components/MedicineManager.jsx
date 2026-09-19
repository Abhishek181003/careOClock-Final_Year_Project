import { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Pill,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Plus,
  Clock,
  Trash2,
  RefreshCw,
  X,
  XCircle,
  PackagePlus,
  Search,
  Sunrise,
  Sun,
  Sunset,
  Moon,
  Info,
} from 'lucide-react';
import './MedicineManager.css';

const MOTIVATIONAL_QUOTES = [
  'Every dose taken on time is an investment in your future strength.',
  'Consistency in your health routine builds a resilient tomorrow.',
  'Small daily habits yield profound longevity and vitality.',
  'Staying on schedule keeps your vitals steady and your heart strong.',
  'Your daily care routine empowers a healthier, more vibrant life.',
];

const SLOT_CONFIGS = [
  { id: 'morning', label: 'Morning', icon: Sunrise, color: 'amber' },
  { id: 'noon', label: 'Noon', icon: Sun, color: 'orange' },
  { id: 'evening', label: 'Evening', icon: Sunset, color: 'indigo' },
  { id: 'night', label: 'Night', icon: Moon, color: 'purple' },
];

export default function MedicineManager({ token: propToken, patientId, userRole = 'patient' }) {
  const token =
    propToken ||
    (typeof localStorage !== 'undefined' ? localStorage.getItem('careoclock_token') : '');

  const [medicines, setMedicines] = useState([]);
  const [adherenceData, setAdherenceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');

  // Filtering & Modal States
  const [activeSlotFilter, setActiveSlotFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [isAddingMed, setIsAddingMed] = useState(false);
  const [refillLoadingId, setRefillLoadingId] = useState(null);

  // New Medicine Form State
  const [newMed, setNewMed] = useState({
    name: '',
    dosage: '',
    schedule: ['morning'],
    frequency: 'daily',
    stockCount: 30,
    lowStockThreshold: 5,
    unit: 'tablets',
    instructions: '',
  });

  const quoteIndex = new Date().getDay() % MOTIVATIONAL_QUOTES.length;
  const dailyQuote = MOTIVATIONAL_QUOTES[quoteIndex];

  // Fetch medicines and adherence metrics
  const loadMedicineData = useCallback(async () => {
    if (!token) return;
    setIsLoading(true);
    setError('');

    try {
      const queryParam = patientId && userRole !== 'patient' ? `?patientId=${patientId}` : '';

      // 1. Fetch Medicines
      const medRes = await fetch(`/api/medicines${queryParam}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const medData = await medRes.json();

      if (medRes.ok) {
        setMedicines(medData.medicines || []);
      } else {
        setError(medData.error || 'Failed to load medicines.');
      }

      // 2. Fetch Adherence Metrics
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

  // Handle logging a dose
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

      // Refresh list and adherence in background
      loadMedicineData();
      setTimeout(() => setSuccessNotice(''), 4000);
    } catch (err) {
      setError(err.message || 'Failed to log dose action.');
    }
  };

  // Handle quick stock replenishment (+30 doses)
  const handleQuickRefill = async (medicine, countToAdd = 30) => {
    setError('');
    setSuccessNotice('');
    setRefillLoadingId(medicine._id);

    try {
      const newStock = (medicine.stockCount || 0) + countToAdd;
      const res = await fetch(`/api/medicines/${medicine._id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ stockCount: newStock }),
      });

      const data = await res.json();

      if (res.ok) {
        setSuccessNotice(`Refilled ${medicine.name} with +${countToAdd} ${medicine.unit || 'tablets'}! Total: ${newStock}.`);
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || 'Failed to update stock.');
      }
    } catch (err) {
      setError(err.message || 'Failed to connect to medicine service.');
    } finally {
      setRefillLoadingId(null);
    }
  };

  // Handle deleting a medicine
  const handleDeleteMedicine = async (medicineId, medName) => {
    if (!window.confirm(`Are you sure you want to remove "${medName}" from your active schedule?`)) {
      return;
    }

    try {
      const res = await fetch(`/api/medicines/${medicineId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMedicines((prev) => prev.filter((m) => m._id !== medicineId));
        setSuccessNotice(`"${medName}" removed from active schedule.`);
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 3000);
      } else {
        const data = await res.json();
        setError(data.error || 'Failed to remove medication.');
      }
    } catch (err) {
      setError(err.message || 'Error removing medication.');
    }
  };

  // Handle adding a new medicine
  const handleCreateMedicine = async (e) => {
    e.preventDefault();
    setError('');

    if (!newMed.name || !newMed.dosage) {
      setError('Medication name and dosage are required.');
      return;
    }

    try {
      const payload = {
        ...newMed,
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
        setMedicines((prev) => [data.medicine, ...prev]);
        setIsAddingMed(false);
        setSuccessNotice(`Added ${data.medicine.name} to active schedule.`);
        setNewMed({
          name: '',
          dosage: '',
          schedule: ['morning'],
          frequency: 'daily',
          stockCount: 30,
          lowStockThreshold: 5,
          unit: 'tablets',
          instructions: '',
        });
        loadMedicineData();
        setTimeout(() => setSuccessNotice(''), 4000);
      } else {
        setError(data.error || data.details?.[0]?.message || 'Failed to add medication.');
      }
    } catch (err) {
      setError(err.message || 'Failed to add medication.');
    }
  };

  const toggleSlot = (slot) => {
    setNewMed((prev) => {
      const exists = prev.schedule.includes(slot);
      const updated = exists ? prev.schedule.filter((s) => s !== slot) : [...prev.schedule, slot];
      return { ...prev, schedule: updated.length > 0 ? updated : ['morning'] };
    });
  };

  // Filtered medicines
  const filteredMedicines = useMemo(() => {
    return medicines.filter((med) => {
      const matchesSearch =
        med.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        med.dosage.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (med.instructions && med.instructions.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchesSlot =
        activeSlotFilter === 'all' ||
        (med.schedule && med.schedule.includes(activeSlotFilter));

      return matchesSearch && matchesSlot;
    });
  }, [medicines, searchQuery, activeSlotFilter]);

  const streak = adherenceData?.currentStreakDays ?? 0;
  const past7 = adherenceData?.past7Days;
  const past30 = adherenceData?.past30Days;
  const lowStockCount = medicines.filter(
    (m) => m.stockCount <= (m.lowStockThreshold || 5)
  ).length;

  return (
    <div className="w-full space-y-6 text-ink">
      {/* ── Top Motivation & Daily Streak Banner ──────────────────────── */}
      <div className="p-5 rounded-ritual bg-surface border border-line shadow-ritual flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-full bg-brand-light flex items-center justify-center text-brand">
              <Pill size={20} />
            </div>
            <div>
              <h2 className="text-h2 font-display text-ink">Medication Schedule & Adherence</h2>
              <p className="text-xs text-ink-soft italic">“{dailyQuote}”</p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3 flex-wrap">
          {/* Adherence Streak Badge */}
          <div
            className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-amber-50 border border-amber-200 text-amber-900 font-bold text-xs shadow-sm"
            title="Consecutive days with 100% medication adherence"
          >
            <Flame size={16} className="text-amber-500 animate-flame" />
            <span>{streak}-Day Adherence Streak!</span>
          </div>

          {/* Quick Refresh Button */}
          <button
            type="button"
            onClick={loadMedicineData}
            title="Refresh medication data"
            className="p-2 rounded-full border border-line bg-paper hover:bg-surface text-ink-soft hover:text-ink transition-all"
          >
            <RefreshCw size={15} className={isLoading ? 'spinning' : ''} />
          </button>
        </div>
      </div>

      {/* ── Adherence Overview Metric Cards ───────────────────────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* 7-Day Adherence (PDC) */}
        <div className="p-4 rounded-ritual bg-surface border border-line shadow-ritual space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              7-Day Adherence (PDC)
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                past7?.status === 'Optimal'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : past7?.status === 'Suboptimal'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
              }`}
            >
              {past7?.status || 'Active'}
            </span>
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-display font-extrabold text-ink">
              {past7?.adherenceRate != null ? `${past7.adherenceRate}%` : '100%'}
            </span>
            <span className="text-xs text-ink-soft">Proportion of Days Covered</span>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-paper rounded-full h-2.5 overflow-hidden border border-line">
            <div
              className={`h-full rounded-full transition-all duration-500 ${
                (past7?.adherenceRate ?? 100) >= 80
                  ? 'bg-emerald-500'
                  : (past7?.adherenceRate ?? 100) >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(past7?.adherenceRate ?? 100, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>Doses Taken: {past7?.dosesTaken ?? 0}</span>
            <span>Scheduled: {past7?.dosesScheduled ?? 0}</span>
          </div>
        </div>

        {/* 30-Day Monthly Baseline */}
        <div className="p-4 rounded-ritual bg-surface border border-line shadow-ritual space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              30-Day Baseline
            </span>
            <span
              className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                past30?.status === 'Optimal'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : past30?.status === 'Suboptimal'
                    ? 'bg-amber-50 text-amber-800 border-amber-200'
                    : 'bg-rose-50 text-rose-800 border-rose-200'
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
                (past30?.adherenceRate ?? 100) >= 80
                  ? 'bg-emerald-500'
                  : (past30?.adherenceRate ?? 100) >= 50
                    ? 'bg-amber-500'
                    : 'bg-rose-500'
              }`}
              style={{ width: `${Math.min(past30?.adherenceRate ?? 100, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between text-[11px] text-ink-soft">
            <span>Doses Taken: {past30?.dosesTaken ?? 0}</span>
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

        {/* Add Medication CTA */}
        <button
          type="button"
          onClick={() => setIsAddingMed(true)}
          className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
        >
          <Plus size={16} />
          <span>Add Medication</span>
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
                : 'Your medication schedule is currently empty. Click "Add Medication" above to track doses, schedules, and stock levels.'}
            </p>
          </div>
          {(searchQuery || activeSlotFilter !== 'all') && (
            <button
              type="button"
              onClick={() => {
                setSearchQuery('');
                setActiveSlotFilter('all');
              }}
              className="text-xs font-semibold text-brand hover:underline"
            >
              Reset Filters
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredMedicines.map((med) => {
            const isZero = med.stockCount === 0;
            const isLow = med.stockCount <= (med.lowStockThreshold || 5);
            const isRefilling = refillLoadingId === med._id;

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

                    {/* Stock Pill */}
                    <span
                      className={`inline-flex items-center gap-1 text-[11px] font-bold px-2.5 py-0.5 rounded-full border whitespace-nowrap ${
                        isZero
                          ? 'bg-rose-50 text-rose-800 border-rose-200'
                          : isLow
                            ? 'bg-amber-50 text-amber-800 border-amber-300'
                            : 'bg-emerald-50 text-emerald-800 border-emerald-200'
                      }`}
                      title={`Low stock alert triggers at ${med.lowStockThreshold || 5} ${med.unit || 'tablets'}`}
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

                  {/* Clinical Instructions */}
                  {med.instructions && (
                    <div className="p-2.5 rounded-clinical bg-paper border border-line text-xs text-ink-soft flex items-start gap-1.5">
                      <Info size={14} className="text-brand flex-shrink-0 mt-0.5" />
                      <span className="leading-snug">{med.instructions}</span>
                    </div>
                  )}
                </div>

                {/* Card Actions Toolbar */}
                <div className="pt-2 border-t border-line flex flex-col gap-2">
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

                    {/* Quick Refill (+30) Button */}
                    <button
                      type="button"
                      onClick={() => handleQuickRefill(med, 30)}
                      disabled={isRefilling}
                      className="p-2 rounded-full bg-paper hover:bg-brand-light text-brand hover:text-brand-dark border border-line transition-all active:scale-95"
                      title="Quick refill: Add +30 doses to stock"
                    >
                      <PackagePlus size={15} className={isRefilling ? 'animate-spin' : ''} />
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
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Modal: Add New Medication ─────────────────────────────────── */}
      {isAddingMed && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm animate-fade-in">
          <div className="w-full max-w-xl max-h-[90vh] overflow-y-auto bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-5">
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
                  <Pill size={18} />
                </div>
                <div>
                  <h3 className="text-h3 font-display text-ink">Add New Medication</h3>
                  <p className="text-xs text-ink-soft">
                    Schedule prescription or OTC medications with automatic inventory tracking.
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
                    placeholder="e.g. Amlodipine, Metformin"
                    value={newMed.name}
                    onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  />
                </div>

                {/* Dosage */}
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Dosage & Strength *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="e.g. 5mg, 1 tablet"
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

              {/* Inventory Stock & Threshold */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Initial Stock Count *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={newMed.stockCount}
                    onChange={(e) =>
                      setNewMed({ ...newMed, stockCount: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Low Stock Alert
                  </label>
                  <input
                    type="number"
                    min="0"
                    value={newMed.lowStockThreshold}
                    onChange={(e) =>
                      setNewMed({ ...newMed, lowStockThreshold: parseInt(e.target.value, 10) || 0 })
                    }
                    className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
                  />
                </div>

                <div className="space-y-1">
                  <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                    Unit Type
                  </label>
                  <select
                    value={newMed.unit}
                    onChange={(e) => setNewMed({ ...newMed, unit: e.target.value })}
                    className="w-full px-3 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                  >
                    <option value="tablets">Tablets</option>
                    <option value="capsules">Capsules</option>
                    <option value="inhalations">Inhalations</option>
                    <option value="drops">Drops</option>
                    <option value="ml">Milliliters (ml)</option>
                    <option value="units">Units (Insulin)</option>
                  </select>
                </div>
              </div>

              {/* Instructions */}
              <div className="space-y-1">
                <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
                  Clinical Instructions (Optional)
                </label>
                <input
                  type="text"
                  placeholder="e.g. Take with breakfast; avoid grapefruit"
                  value={newMed.instructions}
                  onChange={(e) => setNewMed({ ...newMed, instructions: e.target.value })}
                  className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-medium"
                />
              </div>

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
                  className="px-5 py-2 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-semibold shadow-sm hover:shadow-md transition-all active:scale-95"
                >
                  Save Medication
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
