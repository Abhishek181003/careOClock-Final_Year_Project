import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  Heart,
  Activity,
  Wind,
  Thermometer,
  Sunrise,
  Sunset,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Info,
  Check,
  Plus,
  Watch,
  Layers,
} from 'lucide-react';
import {
  PHYSIOLOGICAL_BOUNDS,
  CLINICAL_SYMPTOMS,
  getDefaultSlot,
  classifyVital,
} from '../constants/vitalsConfig.js';
import { submitVitals } from '../services/vitalsApi.js';
import {
  fetchWearablesStatus,
  fetchWearablesLatestReadings,
  simulateWearableSyncPlaceholder,
} from '../services/wearableIntegration.js';
import RiskBadge from './RiskBadge';
import './VitalsEntryForm.css';

/**
 * CareOClock — Universal Health Data Entry Form
 *
 * Designed for elderly accessibility, zero cognitive load, and immediate feedback:
 * - High-contrast large inputs for low-vision readability.
 * - Live physiological categorization (Normal, Elevated, Alert).
 * - Real-time pulse pressure calculation.
 * - Tactile, accessible symptom chips with escalator alerts.
 * - In-place instant AI risk assessment report upon submission.
 */
export default function VitalsEntryForm({
  token,
  patientId,
  userRole = 'patient',
  initialSlot,
  hideHeader = false,
  onVitalsSaved,
}) {
  // Form State
  const [slot, setSlot] = useState(() => initialSlot || getDefaultSlot());

  useEffect(() => {
    if (initialSlot) {
      setSlot(initialSlot);
    }
  }, [initialSlot]);
  const [systolicBp, setSystolicBp] = useState('');
  const [diastolicBp, setDiastolicBp] = useState('');
  const [heartRate, setHeartRate] = useState('');
  const [spo2, setSpo2] = useState('');
  const [temperatureC, setTemperatureC] = useState('');
  const [respirationRate, setRespirationRate] = useState('');
  const [symptomFlags, setSymptomFlags] = useState([]);
  const [notes, setNotes] = useState('');
  const [spo2Scale, setSpo2Scale] = useState(1);
  const [onSupplementalOxygen, setOnSupplementalOxygen] = useState(false);
  const [adherenceRate, setAdherenceRate] = useState('');
  const [showClinicalContext, setShowClinicalContext] = useState(false);

  // UI / Submission State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatingSample, setIsSimulatingSample] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [sampleNotice, setSampleNotice] = useState('');

  // Wearable Synchronization State (Phase 11)
  const [wearableStatus, setWearableStatus] = useState(null);
  const [fieldSources, setFieldSources] = useState({});
  const [vitalMetadata, setVitalMetadata] = useState({});
  const [liveDisagreements, setLiveDisagreements] = useState([]);
  const [isDemoReading, setIsDemoReading] = useState(false);
  const [isFetchingWearables, setIsFetchingWearables] = useState(false);

  // Check Wearable Connection Status on Mount
  useEffect(() => {
    let isMounted = true;
    async function loadStatus() {
      try {
        const data = await fetchWearablesStatus(token, patientId);
        if (isMounted) setWearableStatus(data);
      } catch {
        // Fallback gracefully if endpoint or network unavail
      }
    }
    loadStatus();
    return () => {
      isMounted = false;
    };
  }, [token, patientId]);

  // Pulse pressure calculation
  const sbpNum = parseFloat(systolicBp);
  const dbpNum = parseFloat(diastolicBp);
  const pulsePressure = !isNaN(sbpNum) && !isNaN(dbpNum) ? sbpNum - dbpNum : null;

  // Toggle symptom chip (cap at 4 per clinical safety spec)
  const toggleSymptom = (symptomId) => {
    if (symptomFlags.includes(symptomId)) {
      setSymptomFlags(symptomFlags.filter((id) => id !== symptomId));
    } else {
      if (symptomFlags.length >= 4) {
        setErrorMessage('Maximum 4 clinical symptoms can be selected per reading.');
        return;
      }
      setErrorMessage('');
      setSymptomFlags([...symptomFlags, symptomId]);
    }
  };

  // Smart Telemetry Fetch from Wearables (Phase 11 Provider-Agnostic Sync)
  const handleFetchWearables = async () => {
    try {
      setIsFetchingWearables(true);
      setErrorMessage('');
      setLiveDisagreements([]);

      if (wearableStatus?.connectedCount > 0) {
        // Fetch from real multi-provider wearable sync layer
        const syncData = await fetchWearablesLatestReadings(token, patientId);
        const { vitals, sources, vitalMetadata: meta, vitalDisagreements, isDemoReading: demo } = syncData;

        // Auto-fill only parameters that were actually supplied by connected devices
        if (vitals.systolicBp != null) setSystolicBp(String(vitals.systolicBp));
        if (vitals.diastolicBp != null) setDiastolicBp(String(vitals.diastolicBp));
        if (vitals.heartRate != null) setHeartRate(String(vitals.heartRate));
        if (vitals.spo2 != null) setSpo2(String(vitals.spo2));
        if (vitals.temperatureC != null) setTemperatureC(String(vitals.temperatureC));
        if (vitals.respirationRate != null) setRespirationRate(String(vitals.respirationRate));

        setFieldSources(sources || {});
        setVitalMetadata(meta || {});
        setLiveDisagreements(vitalDisagreements || []);
        setIsDemoReading(!!demo);

        const providerNames =
          syncData.providers?.map((p) => p.replace('_', ' ').toUpperCase()).join(' & ') || 'wearables';
        setSampleNotice(
          `Telemetry synchronized from ${providerNames}. Please review values and fill in any unmeasured fields before saving.`
        );
      } else {
        // Zero wearables connected -> load sample data with educational prompt
        const data = await simulateWearableSyncPlaceholder('oura');
        setSlot(data.slot);
        setSystolicBp(String(data.vitals.systolicBp));
        setDiastolicBp(String(data.vitals.diastolicBp));
        setHeartRate(String(data.vitals.heartRate));
        setSpo2(String(data.vitals.spo2));
        setTemperatureC(String(data.vitals.temperatureC));
        setRespirationRate(String(data.vitals.respirationRate));
        setNotes(data.vitals.notes || 'Routine check-in, feeling well.');
        setFieldSources({
          systolicBp: 'sample',
          diastolicBp: 'sample',
          heartRate: 'sample',
          spo2: 'sample',
          temperatureC: 'sample',
          respirationRate: 'sample',
        });
        setSampleNotice(
          'Sample vitals loaded. You can connect your Oura Ring, Withings BPM, or Google Watch under Wearables to sync automatically.'
        );
      }
    } catch (err) {
      setErrorMessage(err.message || 'Failed to sync wearable readings.');
    } finally {
      setIsFetchingWearables(false);
    }
  };

  // Helper to render provenance & estimation tags below inputs
  const renderProvenanceBadge = (fieldKey) => {
    const src = fieldSources[fieldKey];
    if (!src) return null;

    const meta = vitalMetadata[fieldKey];
    const isEstimated = meta?.isEstimated;

    return (
      <div className="flex items-center gap-1 pt-0.5 text-[10px]">
        <span className="font-semibold uppercase tracking-wider px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 border border-emerald-200">
          {src === 'sample' ? 'Sample' : `From ${src.replace('_', ' ')}`}
        </span>
        {isEstimated && (
          <span
            className="text-amber-800 font-medium px-1 rounded bg-amber-100 border border-amber-200"
            title={meta?.clinicalNote || 'Derived estimate'}
          >
            Estimated
          </span>
        )}
      </div>
    );
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessData(null);
    setSampleNotice('');

    // Client-side Pulse Pressure Validation
    if (pulsePressure !== null && pulsePressure < PHYSIOLOGICAL_BOUNDS.pulsePressure.minDiff) {
      setErrorMessage(
        `Systolic BP (${systolicBp} mmHg) must exceed Diastolic (${diastolicBp} mmHg) by at least ${PHYSIOLOGICAL_BOUNDS.pulsePressure.minDiff} mmHg pulse pressure.`
      );
      return;
    }

    const hasWearableData =
      Object.keys(fieldSources).length > 0 && !Object.values(fieldSources).includes('sample');

    const payload = {
      slot,
      systolicBp: parseFloat(systolicBp),
      diastolicBp: parseFloat(diastolicBp),
      heartRate: parseFloat(heartRate),
      spo2: parseFloat(spo2),
      temperatureC: parseFloat(temperatureC),
      respirationRate: respirationRate ? parseFloat(respirationRate) : undefined,
      symptomFlags,
      notes: notes.trim(),
      spo2Scale,
      onSupplementalOxygen: spo2Scale === 2 ? onSupplementalOxygen : false,
      adherenceRate7d: adherenceRate !== '' ? parseFloat(adherenceRate) / 100 : undefined,
      source: hasWearableData ? 'wearable' : 'manual',
      isDemoReading,
      vitalMetadata,
    };

    if (userRole === 'doctor' && patientId) {
      payload.patientId = patientId;
    }

    try {
      setIsSubmitting(true);
      const result = await submitVitals(payload, token);
      setSuccessData(result);

      // Reset form fields
      setSystolicBp('');
      setDiastolicBp('');
      setHeartRate('');
      setSpo2('');
      setTemperatureC('');
      setRespirationRate('');
      setSymptomFlags([]);
      setNotes('');

      if (onVitalsSaved) {
        onVitalsSaved(result.vitals);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error submitting vitals reading.');
    } finally {
      setIsSubmitting(false);
    }
  };

  // Real-time classification status indicator
  const renderVitalStatusBadge = (field, value) => {
    const classification = classifyVital(field, value);
    if (classification === 'empty') return null;

    if (classification === 'invalid') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200">
          Out of bounds
        </span>
      );
    }
    if (classification === 'alert') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
          ⚠️ Clinical Alert
        </span>
      );
    }
    if (classification === 'elevated') {
      return (
        <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-amber-100 text-amber-900 border border-amber-300">
          Elevated
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 border border-emerald-300">
        ✓ Normal
      </span>
    );
  };

  const hasEscalatorSymptom = symptomFlags.some(
    (id) => CLINICAL_SYMPTOMS.find((s) => s.id === id)?.isEscalator
  );

  return (
    <div className="w-full space-y-6 text-ink">
      {/* ── Form Header & Top Actions ────────────────────────────────── */}
      {!hideHeader ? (
        <div className="flex items-start justify-between gap-4 flex-wrap pb-3 border-b border-line">
          <div>
            <h2 className="text-h2 font-display text-ink flex items-center gap-2">
              <Activity className="text-brand" size={24} />
              <span>Record Health Telemetry</span>
            </h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Log your physiological check-in. Our dual-layer clinical AI evaluates your readings in real time.
            </p>
          </div>

          <div className="flex items-center gap-2">
            {wearableStatus?.connectedCount > 0 && (
              <Link
                to="/app/wearable"
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-xs font-semibold hover:bg-emerald-100 transition-colors"
                title="Manage paired wearables"
              >
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>{wearableStatus.connectedCount} Wearable{wearableStatus.connectedCount > 1 ? 's' : ''} Synced</span>
              </Link>
            )}

            <button
              type="button"
              onClick={handleFetchWearables}
              disabled={isFetchingWearables || isSubmitting}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-light/60 hover:bg-brand-light text-brand-dark text-xs font-semibold border border-brand/20 transition-all active:scale-95 disabled:opacity-50"
              title="Synchronize telemetry from paired devices or load sample"
            >
              <Watch size={14} className={isFetchingWearables ? 'animate-spin' : 'text-brand'} />
              <span>{isFetchingWearables ? 'Fetching Telemetry...' : 'Fetch from Wearables'}</span>
            </button>
          </div>
        </div>
      ) : (
        <div className="flex items-center justify-between pb-1 flex-wrap gap-2">
          {wearableStatus?.connectedCount > 0 ? (
            <Link
              to="/app/wearable"
              className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-50 border border-emerald-300 text-emerald-800 text-[11px] font-semibold hover:bg-emerald-100 transition-colors"
            >
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
              <span>{wearableStatus.connectedCount} Synced</span>
            </Link>
          ) : (
            <Link to="/app/wearable" className="text-[11px] text-brand hover:underline font-medium">
              + Pair Watch / Ring
            </Link>
          )}

          <button
            type="button"
            onClick={handleFetchWearables}
            disabled={isFetchingWearables || isSubmitting}
            className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full bg-brand-light/60 hover:bg-brand-light text-brand-dark text-xs font-semibold border border-brand/20 transition-all active:scale-95 disabled:opacity-50"
            title="Synchronize telemetry from paired devices or load sample"
          >
            <Watch size={13} className={isFetchingWearables ? 'animate-spin' : 'text-brand'} />
            <span>{isFetchingWearables ? 'Fetching...' : 'Fetch from Wearables'}</span>
          </button>
        </div>
      )}

      {/* Disagreement Warning Callout */}
      {liveDisagreements.length > 0 && (
        <div className="p-3.5 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1 animate-fade-in">
          <div className="font-bold flex items-center gap-1.5 text-rose-800">
            <AlertTriangle size={15} />
            <span>Cross-Device Disagreement Notice</span>
          </div>
          {liveDisagreements.map((d, i) => (
            <p key={i} className="text-[11px] leading-relaxed">
              {d.message}
            </p>
          ))}
        </div>
      )}

      {/* Error Alert Banner */}
      {errorMessage && (
        <div className="p-3.5 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-2.5 animate-shake">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="font-medium text-xs leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {/* Sample Loaded Notice Banner */}
      {sampleNotice && (
        <div className="p-3 rounded-ritual bg-teal-50 border border-teal-200 text-teal-900 text-xs flex items-center gap-2">
          <Info size={16} className="text-teal-600 flex-shrink-0" />
          <span>{sampleNotice}</span>
        </div>
      )}

      {/* ── In-Place Assessment Success Confirmation Card ───────────── */}
      {successData && (
        <div className="p-5 rounded-ritual bg-gradient-to-br from-emerald-50 via-surface to-teal-50/40 border border-emerald-300 shadow-ritual space-y-3 animate-fade-in">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <CheckCircle2 size={22} className="text-emerald-600" />
              <div>
                <h4 className="font-display font-bold text-ink text-base">
                  Vitals Recorded Successfully!
                </h4>
                <p className="text-xs text-ink-soft">
                  Stored {successData.vitals?.slot} reading • Stored securely in clinical database
                </p>
              </div>
            </div>

            {successData.assessment && (
              <RiskBadge
                tier={successData.assessment.overallTier?.toLowerCase() || 'stable'}
                size="md"
              />
            )}
          </div>

          {successData.assessment && (
            <div className="p-3.5 rounded-clinical bg-white/90 border border-emerald-200 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="font-bold text-ink uppercase tracking-wider text-[11px]">
                  Real-time AI Health Evaluation
                </span>
                {successData.assessment.overallScore != null && (
                  <span className="font-display font-extrabold text-ink bg-paper px-2 py-0.5 rounded-full border border-line">
                    Composite Score: {successData.assessment.overallScore} / 100
                  </span>
                )}
              </div>
              <p className="text-sm text-ink leading-relaxed font-medium">
                {typeof successData.assessment.explanation === 'object'
                  ? successData.assessment.explanation?.summary
                  : successData.assessment.explanation ||
                    successData.assessment.plainLanguageSummary ||
                    'All vital signs remain inside normal expected bounds.'}
              </p>
            </div>
          )}

          <div className="flex justify-end pt-1">
            <button
              type="button"
              onClick={() => setSuccessData(null)}
              className="text-xs font-semibold text-emerald-800 hover:text-emerald-950 underline"
            >
              Dismiss / Record Another Reading
            </button>
          </div>
        </div>
      )}

      {/* ── Main Submission Form ─────────────────────────────────────── */}
      <form onSubmit={handleSubmit} noValidate className="space-y-6">
        {/* Check-in Ritual Slot Selection (Morning vs Evening) */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
            Assessment Slot
          </label>
          <div className="grid grid-cols-2 gap-3" role="radiogroup" aria-label="Assessment Slot">
            <button
              type="button"
              onClick={() => setSlot('morning')}
              className={`p-3.5 rounded-ritual border text-left transition-all flex items-center gap-3 ${
                slot === 'morning'
                  ? 'border-brand bg-brand-light/30 shadow-sm ring-1 ring-brand/30'
                  : 'border-line bg-paper hover:bg-surface text-ink-soft'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  slot === 'morning' ? 'bg-amber-100 text-amber-700' : 'bg-line text-ink-soft'
                }`}
              >
                <Sunrise size={18} />
              </div>
              <div>
                <span className="text-sm font-display font-bold text-ink block">Morning Check-In</span>
                <span className="text-[11px] text-ink-soft block">Waking / fasting baseline</span>
              </div>
            </button>

            <button
              type="button"
              onClick={() => setSlot('evening')}
              className={`p-3.5 rounded-ritual border text-left transition-all flex items-center gap-3 ${
                slot === 'evening'
                  ? 'border-brand bg-brand-light/30 shadow-sm ring-1 ring-brand/30'
                  : 'border-line bg-paper hover:bg-surface text-ink-soft'
              }`}
            >
              <div
                className={`w-9 h-9 rounded-full flex items-center justify-center ${
                  slot === 'evening' ? 'bg-indigo-100 text-indigo-700' : 'bg-line text-ink-soft'
                }`}
              >
                <Sunset size={18} />
              </div>
              <div>
                <span className="text-sm font-display font-bold text-ink block">Evening Check-In</span>
                <span className="text-[11px] text-ink-soft block">End-of-day response</span>
              </div>
            </button>
          </div>
        </div>

        {/* ── Vital Signs Grid ───────────────────────────────────────── */}
        <div className="space-y-4">
          <label className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Physiological Measurements
          </label>

          {/* Blood Pressure Card (Dual Systolic / Diastolic) */}
          <div className="p-4 rounded-ritual bg-paper border border-line space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-800 flex items-center justify-center">
                  <Activity size={16} />
                </div>
                <div>
                  <span className="text-sm font-display font-bold text-ink">Blood Pressure</span>
                  <span className="text-[11px] text-ink-soft ml-1.5 font-normal">
                    Arterial pressure (target &lt; 120 / 80 mmHg)
                  </span>
                </div>
              </div>
              <span className="text-xs font-mono text-ink-soft font-semibold px-2 py-0.5 rounded bg-surface border border-line">
                mmHg
              </span>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {/* Systolic Input */}
              <div className="space-y-1.5">
                <label htmlFor="systolic-input" className="block text-xs font-semibold text-ink-soft">
                  Systolic (Upper Number)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="systolic-input"
                    name="systolicBp"
                    inputMode="decimal"
                    placeholder="120"
                    min={PHYSIOLOGICAL_BOUNDS.systolicBp.min}
                    max={PHYSIOLOGICAL_BOUNDS.systolicBp.max}
                    step="1"
                    required
                    value={systolicBp}
                    onChange={(e) => setSystolicBp(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
                  />
                </div>
                {renderVitalStatusBadge('systolicBp', systolicBp)}
                {renderProvenanceBadge('systolicBp')}
              </div>

              {/* Diastolic Input */}
              <div className="space-y-1.5">
                <label htmlFor="diastolic-input" className="block text-xs font-semibold text-ink-soft">
                  Diastolic (Lower Number)
                </label>
                <div className="relative">
                  <input
                    type="number"
                    id="diastolic-input"
                    name="diastolicBp"
                    inputMode="decimal"
                    placeholder="80"
                    min={PHYSIOLOGICAL_BOUNDS.diastolicBp.min}
                    max={PHYSIOLOGICAL_BOUNDS.diastolicBp.max}
                    step="1"
                    required
                    value={diastolicBp}
                    onChange={(e) => setDiastolicBp(e.target.value)}
                    className="w-full px-3.5 py-2.5 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand focus:border-transparent transition-all"
                  />
                </div>
                {renderVitalStatusBadge('diastolicBp', diastolicBp)}
                {renderProvenanceBadge('diastolicBp')}
              </div>
            </div>

            {/* Live Pulse Pressure Indicator */}
            {pulsePressure !== null && (
              <div
                className={`text-xs px-3 py-1.5 rounded-clinical flex items-center justify-between font-mono ${
                  pulsePressure < 10
                    ? 'bg-rose-100 text-rose-900 border border-rose-200'
                    : 'bg-surface text-ink-soft border border-line'
                }`}
              >
                <span>Calculated Pulse Pressure:</span>
                <span className="font-bold">
                  {pulsePressure} mmHg{' '}
                  {pulsePressure < 10 ? '⚠️ (Systolic must exceed Diastolic by ≥ 10)' : '• Valid'}
                </span>
              </div>
            )}
          </div>

          {/* 4 Supporting Telemetry Inputs in 2x2 Responsive Grid */}
          <div className="grid sm:grid-cols-2 gap-3">
            {/* Heart Rate */}
            <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Heart size={16} className="text-rose-500" />
                  <label htmlFor="hr-input" className="text-xs font-bold text-ink">
                    Heart Rate (Pulse)
                  </label>
                </div>
                <span className="text-[11px] font-mono text-ink-soft">bpm</span>
              </div>

              <input
                type="number"
                id="hr-input"
                name="heartRate"
                inputMode="decimal"
                placeholder="72"
                min={PHYSIOLOGICAL_BOUNDS.heartRate.min}
                max={PHYSIOLOGICAL_BOUNDS.heartRate.max}
                step="1"
                required
                value={heartRate}
                onChange={(e) => setHeartRate(e.target.value)}
                className="w-full px-3 py-2 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex items-center justify-between text-[11px] text-ink-soft">
                <span>Expected: 60–100 bpm</span>
                {renderVitalStatusBadge('heartRate', heartRate)}
              </div>
              {renderProvenanceBadge('heartRate')}
            </div>

            {/* Oxygen Saturation (SpO2) */}
            <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wind size={16} className="text-sky-500" />
                  <label htmlFor="spo2-input" className="text-xs font-bold text-ink">
                    Blood Oxygen (SpO2)
                  </label>
                </div>
                <span className="text-[11px] font-mono text-ink-soft">%</span>
              </div>

              <input
                type="number"
                id="spo2-input"
                name="spo2"
                inputMode="decimal"
                placeholder="98"
                min={PHYSIOLOGICAL_BOUNDS.spo2.min}
                max={PHYSIOLOGICAL_BOUNDS.spo2.max}
                step="1"
                required
                value={spo2}
                onChange={(e) => setSpo2(e.target.value)}
                className="w-full px-3 py-2 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex items-center justify-between text-[11px] text-ink-soft">
                <span>Healthy: 95–100%</span>
                {renderVitalStatusBadge('spo2', spo2)}
              </div>
              {renderProvenanceBadge('spo2')}
            </div>

            {/* Body Temperature */}
            <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Thermometer size={16} className="text-amber-500" />
                  <label htmlFor="temp-input" className="text-xs font-bold text-ink">
                    Body Temperature
                  </label>
                </div>
                <span className="text-[11px] font-mono text-ink-soft">°C</span>
              </div>

              <input
                type="number"
                id="temp-input"
                name="temperatureC"
                inputMode="decimal"
                placeholder="36.6"
                min={PHYSIOLOGICAL_BOUNDS.temperatureC.min}
                max={PHYSIOLOGICAL_BOUNDS.temperatureC.max}
                step="0.1"
                required
                value={temperatureC}
                onChange={(e) => setTemperatureC(e.target.value)}
                className="w-full px-3 py-2 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex items-center justify-between text-[11px] text-ink-soft">
                <span>Normal: 36.1–37.2°C</span>
                {renderVitalStatusBadge('temperatureC', temperatureC)}
              </div>
              {renderProvenanceBadge('temperatureC')}
            </div>

            {/* Respiration Rate */}
            <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-2">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <Wind size={16} className="text-purple-500" />
                  <label htmlFor="rr-input" className="text-xs font-bold text-ink">
                    Respiration Rate
                  </label>
                </div>
                <span className="text-[11px] font-mono text-ink-soft">breaths/min</span>
              </div>

              <input
                type="number"
                id="rr-input"
                name="respirationRate"
                inputMode="decimal"
                placeholder="16"
                min={PHYSIOLOGICAL_BOUNDS.respirationRate.min}
                max={PHYSIOLOGICAL_BOUNDS.respirationRate.max}
                step="1"
                value={respirationRate}
                onChange={(e) => setRespirationRate(e.target.value)}
                className="w-full px-3 py-2 rounded-clinical border border-line bg-surface text-ink text-lg font-mono font-bold focus:outline-none focus:ring-2 focus:ring-brand"
              />
              <div className="flex items-center justify-between text-[11px] text-ink-soft">
                <span>Normal: 12–20 br/min</span>
                {renderVitalStatusBadge('respirationRate', respirationRate)}
              </div>
              {renderProvenanceBadge('respirationRate')}
            </div>
          </div>
        </div>

        {/* ── Symptoms Multi-Select Checklist ─────────────────────────── */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold uppercase tracking-wider text-ink-soft">
              Active Symptoms (Optional)
            </label>
            <span className="text-xs font-mono text-ink-soft font-semibold px-2 py-0.5 rounded-full bg-paper border border-line">
              {symptomFlags.length} / 4 selected
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {CLINICAL_SYMPTOMS.map((sym) => {
              const isSelected = symptomFlags.includes(sym.id);
              return (
                <button
                  type="button"
                  key={sym.id}
                  onClick={() => toggleSymptom(sym.id)}
                  aria-pressed={isSelected}
                  className={`p-2.5 rounded-clinical border text-left transition-all flex items-center justify-between gap-2 ${
                    isSelected
                      ? 'border-brand bg-brand text-white shadow-sm'
                      : 'border-line bg-paper hover:bg-surface text-ink'
                  }`}
                >
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-bold truncate">
                      {sym.label} {sym.isEscalator && '🚨'}
                    </div>
                    <div
                      className={`text-[10px] truncate ${
                        isSelected ? 'text-white/80' : 'text-ink-soft'
                      }`}
                    >
                      {sym.subtext}
                    </div>
                  </div>

                  <div
                    className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-xs ${
                      isSelected ? 'bg-white text-brand' : 'bg-surface border border-line text-ink-soft'
                    }`}
                  >
                    {isSelected ? <Check size={12} strokeWidth={3} /> : <Plus size={12} />}
                  </div>
                </button>
              );
            })}
          </div>

          {/* Escalator Warning Alert */}
          {hasEscalatorSymptom && (
            <div className="p-3 rounded-clinical bg-amber-50 border border-amber-300 text-amber-950 text-xs flex items-center gap-2">
              <AlertTriangle size={16} className="text-amber-600 flex-shrink-0" />
              <span>
                <strong>Clinical Note:</strong> You have selected an acute symptom. If experiencing severe chest pain,
                collapse, or acute breathlessness, call emergency services (112/911) immediately.
              </span>
            </div>
          )}
        </div>

        {/* ── Patient Observation Notes ───────────────────────────────── */}
        <div className="space-y-1.5">
          <label htmlFor="vitals-notes-input" className="block text-xs font-bold uppercase tracking-wider text-ink-soft">
            Patient Notes or Observations (Optional)
          </label>
          <textarea
            id="vitals-notes-input"
            rows={2}
            className="w-full px-3.5 py-2 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand focus:bg-surface transition-all"
            placeholder="e.g. Taken right after waking up, mild fatigue after morning walk..."
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* ── Advanced Clinical Context & Protocols (Collapsible) ─────── */}
        <div className="rounded-ritual border border-line bg-paper overflow-hidden">
          <button
            type="button"
            onClick={() => setShowClinicalContext(!showClinicalContext)}
            className="w-full p-3.5 text-left text-xs font-bold text-ink-soft hover:text-ink flex items-center justify-between transition-colors"
          >
            <span>Advanced Clinical Protocols (Oxygen Scale 2 & Adherence)</span>
            {showClinicalContext ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
          </button>

          {showClinicalContext && (
            <div className="p-4 pt-1 border-t border-line space-y-4 bg-surface text-xs">
              {/* SpO2 Scale Selector */}
              <div className="space-y-1.5">
                <label className="block font-semibold text-ink">
                  Oxygen Scale (NEWS2 Clinical Target):
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setSpo2Scale(1)}
                    className={`py-2 px-3 rounded-clinical border text-xs font-medium transition-colors ${
                      spo2Scale === 1
                        ? 'bg-brand text-white border-brand'
                        : 'bg-paper text-ink-soft border-line'
                    }`}
                  >
                    Scale 1 (General Population: 96–100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpo2Scale(2)}
                    className={`py-2 px-3 rounded-clinical border text-xs font-medium transition-colors ${
                      spo2Scale === 2
                        ? 'bg-brand text-white border-brand'
                        : 'bg-paper text-ink-soft border-line'
                    }`}
                  >
                    Scale 2 (COPD Hypercapnic Target: 88–92%)
                  </button>
                </div>
              </div>

              {/* Supplemental Oxygen Toggle */}
              {spo2Scale === 2 && (
                <label className="flex items-center gap-2 cursor-pointer font-medium text-ink">
                  <input
                    type="checkbox"
                    checked={onSupplementalOxygen}
                    onChange={(e) => setOnSupplementalOxygen(e.target.checked)}
                    className="rounded border-line text-brand focus:ring-brand"
                  />
                  <span>Patient is currently receiving supplemental oxygen</span>
                </label>
              )}

              {/* 7-Day Adherence Override */}
              <div className="space-y-1">
                <label htmlFor="adherence-input" className="block font-semibold text-ink">
                  7-Day Medication Adherence (%):
                </label>
                <input
                  type="number"
                  id="adherence-input"
                  min="0"
                  max="100"
                  step="5"
                  placeholder="e.g. 85 (leave blank to use automated pill logs)"
                  value={adherenceRate}
                  onChange={(e) => setAdherenceRate(e.target.value)}
                  className="w-full px-3 py-1.5 rounded-clinical border border-line bg-paper text-ink text-xs focus:outline-none focus:ring-2 focus:ring-brand font-mono"
                />
              </div>
            </div>
          )}
        </div>

        {/* ── Submit Action Button ────────────────────────────────────── */}
        <div className="pt-2">
          <button
            type="submit"
            disabled={isSubmitting || userRole === 'caregiver'}
            className="w-full py-3.5 px-6 rounded-full bg-brand hover:bg-brand-dark text-white font-semibold text-base shadow-sm hover:shadow-md transition-all transform active:scale-98 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {isSubmitting ? (
              <>
                <div className="w-5 h-5 border-2 border-white border-t-transparent rounded-full animate-spin" />
                <span>Recording & Evaluating Vitals...</span>
              </>
            ) : userRole === 'caregiver' ? (
              <span>Caregiver Read-Only Mode</span>
            ) : (
              <>
                <CheckCircle2 size={18} />
                <span>Save & Evaluate Health Telemetry</span>
              </>
            )}
          </button>

          {userRole === 'caregiver' && (
            <p className="mt-2 text-xs text-rose-700 text-center font-medium">
              Caregivers have read-only permissions and cannot submit clinical readings.
            </p>
          )}
        </div>
      </form>
    </div>
  );
}
