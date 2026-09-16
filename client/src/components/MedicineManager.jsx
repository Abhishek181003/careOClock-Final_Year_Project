import { useState, useEffect, useCallback } from 'react';
import {
  Pill,
  CheckCircle2,
  AlertTriangle,
  Flame,
  Plus,
  Clock,
  Trash2,
  RefreshCw,
  TrendingUp,
  X,
  XCircle,
} from 'lucide-react';
import './MedicineManager.css';

const MOTIVATIONAL_QUOTES = [
  'Every dose taken on time is an investment in your future strength.',
  'Consistency in your health routine builds a resilient tomorrow.',
  'Small daily habits yield profound longevity and vitality.',
  'Staying on schedule keeps your vitals steady and your heart strong.',
];

export default function MedicineManager({ token: propToken, patientId, userRole }) {
  const token = propToken || (typeof localStorage !== 'undefined' ? localStorage.getItem('careoclock_token') : '');
  const [medicines, setMedicines] = useState([]);
  const [adherenceData, setAdherenceData] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState('');
  const [successNotice, setSuccessNotice] = useState('');
  const [isAddingMed, setIsAddingMed] = useState(false);

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
  const handleLogDose = async (medicineId, action) => {
    setError('');
    setSuccessNotice('');

    try {
      const res = await fetch(`/api/medicines/${medicineId}/doses`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          action,
          quantity: 1,
          slot: 'morning',
          notes: action === 'taken' ? 'Logged via Medicine Manager' : 'Marked missed',
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.message || data.error || 'Failed to log dose.');
        return;
      }

      setSuccessNotice(
        action === 'taken'
          ? `Dose recorded! Remaining stock: ${data.medicine?.remainingStock}`
          : 'Dose marked as missed.'
      );

      // Refresh list and adherence in background
      loadMedicineData();
    } catch (err) {
      setError(err.message || 'Failed to log dose action.');
    }
  };

  // Handle deleting a medicine
  const handleDeleteMedicine = async (medicineId) => {
    if (!window.confirm('Are you sure you want to remove this medication from your active list?')) {
      return;
    }

    try {
      const res = await fetch(`/api/medicines/${medicineId}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` },
      });

      if (res.ok) {
        setMedicines((prev) => prev.filter((m) => m._id !== medicineId));
        setSuccessNotice('Medication removed from active schedule.');
        loadMedicineData();
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
      setError('Name and dosage are required.');
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

  const streak = adherenceData?.currentStreakDays ?? 0;
  const past7 = adherenceData?.past7Days;
  const past30 = adherenceData?.past30Days;

  return (
    <div className="med-manager-container">
      {/* Motivation & Header Card */}
      <div className="med-header-card">
        <div>
          <div className="med-header-title">
            <Pill size={22} style={{ color: '#06b6d4' }} />
            <span>Medicine Schedule & Adherence (FR6)</span>
          </div>
          <p className="med-quote">“{dailyQuote}”</p>
        </div>

        <div className="med-streak-badge" title="Consecutive days with 100% medication adherence">
          <Flame size={16} />
          <span>{streak}-Day Adherence Streak!</span>
        </div>
      </div>

      {/* Adherence Statistics Overview */}
      <div className="med-adherence-grid">
        {/* 7-Day Adherence */}
        <div className="med-adherence-card">
          <div className="med-adherence-header">
            <span className="med-adherence-label">7-Day Adherence (PDC)</span>
            <span
              className={`med-status-pill ${
                past7?.status === 'Optimal'
                  ? 'optimal'
                  : past7?.status === 'Suboptimal'
                    ? 'suboptimal'
                    : past7?.status === 'Poor / Non-adherent'
                      ? 'poor'
                      : 'none'
              }`}
            >
              {past7?.status || 'No History'}
            </span>
          </div>

          <div className="med-adherence-stat">
            <span className="med-adherence-num">
              {past7?.adherenceRate != null ? `${past7.adherenceRate}%` : 'N/A'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Proportion of Days</span>
          </div>

          <div className="med-progress-bar-bg" role="progressbar" aria-valuenow={past7?.adherenceRate || 0} aria-valuemin="0" aria-valuemax="100">
            <div
              className={`med-progress-bar-fill ${
                (past7?.adherenceRate || 0) >= 80
                  ? 'optimal'
                  : (past7?.adherenceRate || 0) >= 50
                    ? 'suboptimal'
                    : 'poor'
              }`}
              style={{ width: `${Math.min(past7?.adherenceRate || 0, 100)}%` }}
            />
          </div>

          <div className="med-adherence-meta">
            <span>Doses Taken: {past7?.dosesTaken ?? 0}</span>
            <span>Scheduled: {past7?.dosesScheduled ?? 0}</span>
          </div>
        </div>

        {/* 30-Day Adherence */}
        <div className="med-adherence-card">
          <div className="med-adherence-header">
            <span className="med-adherence-label">30-Day Adherence</span>
            <span
              className={`med-status-pill ${
                past30?.status === 'Optimal'
                  ? 'optimal'
                  : past30?.status === 'Suboptimal'
                    ? 'suboptimal'
                    : past30?.status === 'Poor / Non-adherent'
                      ? 'poor'
                      : 'none'
              }`}
            >
              {past30?.status || 'No History'}
            </span>
          </div>

          <div className="med-adherence-stat">
            <span className="med-adherence-num">
              {past30?.adherenceRate != null ? `${past30.adherenceRate}%` : 'N/A'}
            </span>
            <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>Monthly Baseline</span>
          </div>

          <div className="med-progress-bar-bg" role="progressbar" aria-valuenow={past30?.adherenceRate || 0} aria-valuemin="0" aria-valuemax="100">
            <div
              className={`med-progress-bar-fill ${
                (past30?.adherenceRate || 0) >= 80
                  ? 'optimal'
                  : (past30?.adherenceRate || 0) >= 50
                    ? 'suboptimal'
                    : 'poor'
              }`}
              style={{ width: `${Math.min(past30?.adherenceRate || 0, 100)}%` }}
            />
          </div>

          <div className="med-adherence-meta">
            <span>Doses Taken: {past30?.dosesTaken ?? 0}</span>
            <span>Missed: {past30?.dosesMissed ?? 0}</span>
          </div>
        </div>
      </div>

      {/* Alerts & Notifications */}
      {error && (
        <div className="alert-box error" role="alert" style={{ background: 'rgba(239, 68, 68, 0.15)', border: '1px solid rgba(239, 68, 68, 0.3)', color: '#f87171', padding: '0.75rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <AlertTriangle size={18} />
          <span>{error}</span>
        </div>
      )}

      {successNotice && (
        <div className="alert-box success" role="status" style={{ background: 'rgba(16, 185, 129, 0.15)', border: '1px solid rgba(16, 185, 129, 0.3)', color: '#34d399', padding: '0.75rem 1rem', borderRadius: '10px', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
          <CheckCircle2 size={18} />
          <span>{successNotice}</span>
        </div>
      )}

      {/* Medicines Section Header */}
      <div className="med-section-header">
        <div className="med-section-title">
          <TrendingUp size={18} style={{ color: '#06b6d4' }} />
          <span>Active Medications ({medicines.length})</span>
        </div>

        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button
            type="button"
            className="med-btn-cancel"
            onClick={loadMedicineData}
            title="Refresh medicine list"
          >
            <RefreshCw size={14} className={isLoading ? 'spinning' : ''} />
          </button>

          <button
            type="button"
            className="med-add-btn"
            onClick={() => setIsAddingMed(!isAddingMed)}
          >
            {isAddingMed ? <X size={15} /> : <Plus size={15} />}
            <span>{isAddingMed ? 'Cancel' : 'Add Medication'}</span>
          </button>
        </div>
      </div>

      {/* Add Medication Form */}
      {isAddingMed && (
        <form onSubmit={handleCreateMedicine} className="med-form-card">
          <h4 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc' }}>
            New Prescription or OTC Medication
          </h4>

          <div className="med-form-grid">
            <div className="med-form-field">
              <label className="med-form-label">Medication Name *</label>
              <input
                type="text"
                className="med-form-input"
                placeholder="e.g. Amlodipine, Metformin"
                value={newMed.name}
                onChange={(e) => setNewMed({ ...newMed, name: e.target.value })}
                required
              />
            </div>

            <div className="med-form-field">
              <label className="med-form-label">Dosage & Strength *</label>
              <input
                type="text"
                className="med-form-input"
                placeholder="e.g. 5mg, 1 tablet"
                value={newMed.dosage}
                onChange={(e) => setNewMed({ ...newMed, dosage: e.target.value })}
                required
              />
            </div>

            <div className="med-form-field">
              <label className="med-form-label">Initial Stock Count *</label>
              <input
                type="number"
                min="0"
                className="med-form-input"
                value={newMed.stockCount}
                onChange={(e) => setNewMed({ ...newMed, stockCount: parseInt(e.target.value, 10) || 0 })}
                required
              />
            </div>

            <div className="med-form-field">
              <label className="med-form-label">Low-Stock Alert Threshold</label>
              <input
                type="number"
                min="0"
                className="med-form-input"
                value={newMed.lowStockThreshold}
                onChange={(e) =>
                  setNewMed({ ...newMed, lowStockThreshold: parseInt(e.target.value, 10) || 0 })
                }
              />
            </div>
          </div>

          <div className="med-form-field">
            <label className="med-form-label">Scheduled Dose Times</label>
            <div className="med-slots-toggle">
              {['morning', 'noon', 'evening', 'night'].map((slot) => (
                <button
                  key={slot}
                  type="button"
                  className={`med-slot-chip ${newMed.schedule.includes(slot) ? 'selected' : ''}`}
                  onClick={() => toggleSlot(slot)}
                >
                  {slot.toUpperCase()}
                </button>
              ))}
            </div>
          </div>

          <div className="med-form-field">
            <label className="med-form-label">Clinical Instructions</label>
            <input
              type="text"
              className="med-form-input"
              placeholder="e.g. Take with breakfast; avoid grapefruit"
              value={newMed.instructions}
              onChange={(e) => setNewMed({ ...newMed, instructions: e.target.value })}
            />
          </div>

          <div className="med-form-actions">
            <button
              type="button"
              className="med-btn-cancel"
              onClick={() => setIsAddingMed(false)}
            >
              Cancel
            </button>
            <button type="submit" className="med-btn-submit">
              Save Medication
            </button>
          </div>
        </form>
      )}

      {/* Medicine Cards List */}
      {medicines.length === 0 ? (
        <div className="med-empty-state">
          <Pill size={36} style={{ marginBottom: '0.75rem', opacity: 0.5 }} />
          <p style={{ margin: 0, fontWeight: 600 }}>No medications logged yet.</p>
          <p style={{ margin: '0.25rem 0 0 0', fontSize: '0.8rem' }}>
            Click &ldquo;Add Medication&rdquo; above to set up daily schedules and automatic stock decrement.
          </p>
        </div>
      ) : (
        <div className="med-cards-grid">
          {medicines.map((med) => {
            const isZero = med.stockCount === 0;
            const isLow = med.stockCount <= (med.lowStockThreshold || 5);

            return (
              <div key={med._id} className="med-card">
                <div className="med-card-top">
                  <div>
                    <div className="med-card-name">{med.name}</div>
                    <div className="med-card-dosage">{med.dosage}</div>
                  </div>

                  <span
                    className={`med-stock-pill ${isZero ? 'danger' : isLow ? 'warning' : 'good'}`}
                    title={`Low stock threshold: ${med.lowStockThreshold}`}
                  >
                    {isZero ? (
                      <>
                        <XCircle size={12} /> Out of Stock
                      </>
                    ) : isLow ? (
                      <>
                        <AlertTriangle size={12} /> Low: {med.stockCount} {med.unit}
                      </>
                    ) : (
                      <>
                        <CheckCircle2 size={12} /> {med.stockCount} {med.unit}
                      </>
                    )}
                  </span>
                </div>

                <div className="med-card-schedule">
                  {med.schedule?.map((slot) => (
                    <span key={slot} className="med-schedule-badge">
                      <Clock size={10} style={{ marginRight: '0.2rem', verticalAlign: 'middle' }} />
                      {slot}
                    </span>
                  ))}
                </div>

                {med.instructions && (
                  <div className="med-instructions">{med.instructions}</div>
                )}

                <div className="med-card-actions">
                  <button
                    type="button"
                    className="med-btn-take"
                    onClick={() => handleLogDose(med._id, 'taken')}
                    disabled={isZero}
                    title={isZero ? 'Cannot log dose: stock is 0' : 'Log dose taken (stock -1)'}
                  >
                    <CheckCircle2 size={15} />
                    <span>{isZero ? 'Stock Empty' : 'Take Dose'}</span>
                  </button>

                  <button
                    type="button"
                    className="med-btn-missed"
                    onClick={() => handleLogDose(med._id, 'missed')}
                    title="Record dose missed (does not deplete stock)"
                  >
                    <span>Missed</span>
                  </button>

                  <button
                    type="button"
                    className="med-btn-icon"
                    onClick={() => handleDeleteMedicine(med._id)}
                    title="Remove from schedule"
                  >
                    <Trash2 size={15} />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
