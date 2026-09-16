import { useState, useEffect } from 'react';
import {
  Heart,
  Activity,
  Wind,
  Thermometer,
  Shield,
  Sunrise,
  Sunset,
  Sparkles,
  AlertTriangle,
  CheckCircle2,
  Watch,
} from 'lucide-react';
import {
  PHYSIOLOGICAL_BOUNDS,
  CLINICAL_SYMPTOMS,
  getDefaultSlot,
  classifyVital,
} from '../constants/vitalsConfig.js';
import { submitVitals } from '../services/vitalsApi.js';
import { simulateWearableSyncPlaceholder } from '../services/wearableIntegration.js';
import './VitalsEntryForm.css';

/**
 * Mobile-First Twice-Daily Vitals Entry Form (Phase 3: FR2, NFR4)
 * Designed for zero-training usage by elderly patients and clinical staff.
 */
export default function VitalsEntryForm({ token, patientId, userRole = 'patient', onVitalsSaved }) {
  // Form State
  const [slot, setSlot] = useState(getDefaultSlot);
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

  // UI / Status State
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [isSimulatingWearable, setIsSimulatingWearable] = useState(false);
  const [errorMessage, setErrorMessage] = useState('');
  const [successData, setSuccessData] = useState(null);
  const [wearableNotice, setWearableNotice] = useState('');

  // Auto-clear success message after 6 seconds
  useEffect(() => {
    if (successData) {
      const timer = setTimeout(() => setSuccessData(null), 6000);
      return () => clearTimeout(timer);
    }
  }, [successData]);

  // Pulse pressure calculation
  const sbpNum = parseFloat(systolicBp);
  const dbpNum = parseFloat(diastolicBp);
  const pulsePressure = !isNaN(sbpNum) && !isNaN(dbpNum) ? sbpNum - dbpNum : null;

  // Toggle symptom chip
  const toggleSymptom = (symptomId) => {
    if (symptomFlags.includes(symptomId)) {
      setSymptomFlags(symptomFlags.filter((id) => id !== symptomId));
    } else {
      if (symptomFlags.length >= 4) {
        setErrorMessage('Maximum 4 clinical symptoms can be selected per reading (H-7 cap).');
        return;
      }
      setErrorMessage('');
      setSymptomFlags([...symptomFlags, symptomId]);
    }
  };

  // Phase 11 Wearable Placeholder Auto-Fill Hook
  const handleSimulateWearable = async () => {
    try {
      setIsSimulatingWearable(true);
      setErrorMessage('');
      const data = await simulateWearableSyncPlaceholder('oura');

      setSlot(data.slot);
      setSystolicBp(String(data.vitals.systolicBp));
      setDiastolicBp(String(data.vitals.diastolicBp));
      setHeartRate(String(data.vitals.heartRate));
      setSpo2(String(data.vitals.spo2));
      setTemperatureC(String(data.vitals.temperatureC));
      setRespirationRate(String(data.vitals.respirationRate));
      setNotes(data.vitals.notes);
      setWearableNotice(
        'Phase 11 Hook: Loaded biometric data from Oura sandbox preview. You may review and edit any value.'
      );
    } catch {
      setErrorMessage('Failed to simulate wearable auto-fill.');
    } finally {
      setIsSimulatingWearable(false);
    }
  };

  // Submit Handler
  const handleSubmit = async (e) => {
    e.preventDefault();
    setErrorMessage('');
    setSuccessData(null);

    // Client-side Pulse Pressure Validation
    if (pulsePressure !== null && pulsePressure < PHYSIOLOGICAL_BOUNDS.pulsePressure.minDiff) {
      setErrorMessage(
        `Systolic BP (${systolicBp} mmHg) must strictly exceed Diastolic (${diastolicBp} mmHg) by at least ${PHYSIOLOGICAL_BOUNDS.pulsePressure.minDiff} mmHg.`
      );
      return;
    }

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
      source: 'manual',
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
      setWearableNotice('');

      if (onVitalsSaved) {
        onVitalsSaved(result.vitals);
      }
    } catch (err) {
      setErrorMessage(err.message || 'Error submitting vitals reading.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const getStatusBadge = (field, value) => {
    const classification = classifyVital(field, value);
    if (classification === 'empty') return null;

    if (classification === 'invalid') {
      return <span className="vital-status-badge status-invalid">Invalid / Out of bounds</span>;
    }
    if (classification === 'alert') {
      return <span className="vital-status-badge status-alert">Emergency Alert</span>;
    }
    if (classification === 'elevated') {
      return <span className="vital-status-badge status-elevated">Elevated</span>;
    }
    return <span className="vital-status-badge status-normal">Normal</span>;
  };

  return (
    <div className="vitals-form-container">
      {/* Header */}
      <header className="vitals-header">
        <div className="header-badge-row">
          <span className="phase-badge">Phase 3: Vitals Entry (FR2)</span>
          <span className="nfr4-badge">
            <Shield size={12} /> NFR4: Zero-Wearable Dependency
          </span>
        </div>
        <h2 className="vitals-title">Twice-Daily Health Check</h2>
        <p className="vitals-subtitle">
          Log your vital readings with zero external device requirements. Designed for clear, zero-training manual entry.
        </p>
      </header>

      {/* Error Banner */}
      {errorMessage && (
        <div className="alert-box error" role="alert">
          <AlertTriangle size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{errorMessage}</div>
        </div>
      )}

      {/* Success Banner */}
      {successData && (
        <div
          className="alert-box success"
          role="status"
          style={{ flexDirection: 'column', alignItems: 'stretch', gap: '0.65rem' }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <CheckCircle2 size={18} style={{ flexShrink: 0 }} />
            <div>
              <strong>Reading Stored Securely!</strong> Recorded {successData.vitals?.slot} vitals.
            </div>
          </div>

          {successData.assessment && (
            <div
              style={{
                marginTop: '0.25rem',
                padding: '0.75rem',
                borderRadius: '10px',
                background: 'rgba(0, 0, 0, 0.25)',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                display: 'flex',
                flexDirection: 'column',
                gap: '0.4rem',
              }}
            >
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: '0.5rem',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Risk Assessment:</span>
                  <span
                    style={{
                      fontSize: '0.75rem',
                      fontWeight: 700,
                      padding: '0.15rem 0.6rem',
                      borderRadius: '9999px',
                      textTransform: 'uppercase',
                      color:
                        successData.assessment.colorCode === 'Red'
                          ? '#f87171'
                          : successData.assessment.colorCode === 'Amber'
                            ? '#fbbf24'
                            : '#34d399',
                      background:
                        successData.assessment.colorCode === 'Red'
                          ? 'rgba(239, 68, 68, 0.2)'
                          : successData.assessment.colorCode === 'Amber'
                            ? 'rgba(245, 158, 11, 0.2)'
                            : 'rgba(16, 185, 129, 0.2)',
                    }}
                  >
                    {successData.assessment.overallTier} Risk ({successData.assessment.colorCode})
                  </span>
                </div>
                {successData.assessment.overallScore != null && (
                  <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>
                    Triage Score: <strong>{successData.assessment.overallScore}/100</strong>
                  </span>
                )}
              </div>
              <p style={{ margin: 0, fontSize: '0.85rem', color: '#f1f5f9', lineHeight: 1.4 }}>
                {typeof successData.assessment.explanation === 'object'
                  ? successData.assessment.explanation.summary
                  : successData.assessment.explanation}
              </p>

              {/* Doctor View: Medication Adherence Reference Factor (FR6) */}
              {typeof successData.assessment.explanation === 'object' &&
                successData.assessment.explanation?.adherence && (
                  <div
                    style={{
                      marginTop: '0.4rem',
                      padding: '0.5rem 0.75rem',
                      borderRadius: '8px',
                      background: 'rgba(255, 255, 255, 0.04)',
                      border: '1px solid rgba(255, 255, 255, 0.08)',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '0.3rem',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <span style={{ fontSize: '0.72rem', fontWeight: 600, color: '#38bdf8' }}>
                        Medication Adherence (FR6 Reference Factor)
                      </span>
                      <span
                        style={{
                          fontSize: '0.68rem',
                          fontWeight: 700,
                          padding: '0.1rem 0.45rem',
                          borderRadius: '9999px',
                          background:
                            successData.assessment.explanation.adherence.status === 'Optimal'
                              ? 'rgba(16, 185, 129, 0.2)'
                              : 'rgba(245, 158, 11, 0.2)',
                          color:
                            successData.assessment.explanation.adherence.status === 'Optimal'
                              ? '#34d399'
                              : '#fbbf24',
                        }}
                      >
                        {successData.assessment.explanation.adherence.status}
                      </span>
                    </div>

                    <div style={{ display: 'flex', gap: '1rem', fontSize: '0.75rem', color: '#cbd5e1' }}>
                      <span>
                        7-Day PDC:{' '}
                        <strong>
                          {successData.assessment.explanation.adherence.rate7d != null
                            ? `${successData.assessment.explanation.adherence.rate7d}%`
                            : 'N/A'}
                        </strong>
                      </span>
                      <span>
                        30-Day Rate:{' '}
                        <strong>
                          {successData.assessment.explanation.adherence.rate30d != null
                            ? `${successData.assessment.explanation.adherence.rate30d}%`
                            : 'N/A'}
                        </strong>
                      </span>
                      {successData.assessment.explanation.adherence.streakDays > 0 && (
                        <span style={{ color: '#fbbf24' }}>
                          🔥 {successData.assessment.explanation.adherence.streakDays}d Streak
                        </span>
                      )}
                    </div>
                  </div>
                )}

              <div style={{ fontSize: '0.7rem', color: '#94a3b8' }}>
                Baseline Status: <em>{successData.assessment.baselineStatus || 'active'}</em>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Wearable Info Banner */}
      {wearableNotice && (
        <div className="alert-box info" role="status">
          <Watch size={18} style={{ flexShrink: 0, marginTop: 1 }} />
          <div>{wearableNotice}</div>
        </div>
      )}

      <form onSubmit={handleSubmit} noValidate>
        {/* Slot Selection (FR2: Morning vs Evening) */}
        <div className="slot-selection-card">
          <span className="section-label">Assessment Slot (FR2 Twice-Daily)</span>
          <div className="slot-toggle-group" role="radiogroup" aria-label="Assessment Slot">
            <button
              type="button"
              className={`slot-btn ${slot === 'morning' ? 'active' : ''}`}
              onClick={() => setSlot('morning')}
              aria-checked={slot === 'morning'}
              role="radio"
              id="slot-morning-btn"
            >
              <Sunrise size={20} />
              <span className="slot-btn-title">Morning Reading</span>
              <span className="slot-btn-desc">Pre-food & meds baseline</span>
            </button>

            <button
              type="button"
              className={`slot-btn ${slot === 'evening' ? 'active' : ''}`}
              onClick={() => setSlot('evening')}
              aria-checked={slot === 'evening'}
              role="radio"
              id="slot-evening-btn"
            >
              <Sunset size={20} />
              <span className="slot-btn-title">Evening Reading</span>
              <span className="slot-btn-desc">End-of-day response</span>
            </button>
          </div>
        </div>

        {/* Vital Signs Grid */}
        <div className="vitals-grid">
          {/* Blood Pressure Card */}
          <div className="vital-card">
            <div className="vital-card-header">
              <div className="vital-label-wrap">
                <Activity className="vital-icon" />
                <label className="vital-name" htmlFor="systolic-input">
                  Blood Pressure
                </label>
              </div>
              <span className="vital-unit-badge">{PHYSIOLOGICAL_BOUNDS.systolicBp.unit}</span>
            </div>

            <div className="vital-inputs-row">
              <div className="vital-input-single">
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Systolic Blood Pressure (Upper Number)"
                  />
                </div>
                <div className="vital-hint">Systolic (Upper)</div>
                {getStatusBadge('systolicBp', systolicBp)}
              </div>

              <div className="vital-input-single">
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Diastolic Blood Pressure (Lower Number)"
                  />
                </div>
                <div className="vital-hint">Diastolic (Lower)</div>
                {getStatusBadge('diastolicBp', diastolicBp)}
              </div>
            </div>

            {pulsePressure !== null && (
              <div
                style={{
                  marginTop: '0.5rem',
                  fontSize: '0.75rem',
                  color: pulsePressure < 10 ? '#fb7185' : '#94a3b8',
                }}
              >
                Pulse Pressure: <strong>{pulsePressure} mmHg</strong>{' '}
                {pulsePressure < 10 && '⚠️ (Too narrow: SBP must exceed DBP by >= 10)'}
              </div>
            )}
          </div>

          {/* Heart Rate & SpO2 */}
          <div className="vital-card">
            <div className="vital-inputs-row">
              {/* Heart Rate */}
              <div className="vital-input-single">
                <div className="vital-card-header" style={{ marginBottom: '0.4rem' }}>
                  <div className="vital-label-wrap">
                    <Heart className="vital-icon" style={{ color: '#f43f5e' }} />
                    <label className="vital-name" htmlFor="hr-input">
                      Heart Rate
                    </label>
                  </div>
                  <span className="vital-unit-badge">{PHYSIOLOGICAL_BOUNDS.heartRate.unit}</span>
                </div>
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Heart Rate in beats per minute"
                  />
                </div>
                <div className="vital-hint">Resting pulse (60–100)</div>
                {getStatusBadge('heartRate', heartRate)}
              </div>

              {/* SpO2 */}
              <div className="vital-input-single">
                <div className="vital-card-header" style={{ marginBottom: '0.4rem' }}>
                  <div className="vital-label-wrap">
                    <Wind className="vital-icon" style={{ color: '#38bdf8' }} />
                    <label className="vital-name" htmlFor="spo2-input">
                      SpO2 Oxygen
                    </label>
                  </div>
                  <span className="vital-unit-badge">{PHYSIOLOGICAL_BOUNDS.spo2.unit}</span>
                </div>
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Blood Oxygen Saturation Percentage"
                  />
                </div>
                <div className="vital-hint">Blood saturation (95–100%)</div>
                {getStatusBadge('spo2', spo2)}
              </div>
            </div>
          </div>

          {/* Temperature & Respiration Rate */}
          <div className="vital-card">
            <div className="vital-inputs-row">
              {/* Temperature */}
              <div className="vital-input-single">
                <div className="vital-card-header" style={{ marginBottom: '0.4rem' }}>
                  <div className="vital-label-wrap">
                    <Thermometer className="vital-icon" style={{ color: '#f59e0b' }} />
                    <label className="vital-name" htmlFor="temp-input">
                      Temperature
                    </label>
                  </div>
                  <span className="vital-unit-badge">{PHYSIOLOGICAL_BOUNDS.temperatureC.unit}</span>
                </div>
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Body Temperature in degrees Celsius"
                  />
                </div>
                <div className="vital-hint">Normal: 36.1–37.5 °C</div>
                {getStatusBadge('temperatureC', temperatureC)}
              </div>

              {/* Respiration Rate */}
              <div className="vital-input-single">
                <div className="vital-card-header" style={{ marginBottom: '0.4rem' }}>
                  <div className="vital-label-wrap">
                    <Activity className="vital-icon" style={{ color: '#a855f7' }} />
                    <label className="vital-name" htmlFor="rr-input">
                      Respiration
                    </label>
                  </div>
                  <span className="vital-unit-badge">breaths/min</span>
                </div>
                <div className="input-field-wrap">
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
                    className="vital-input"
                    aria-label="Respiration rate in breaths per minute"
                  />
                </div>
                <div className="vital-hint">Normal: 12–20 breaths/min</div>
                {getStatusBadge('respirationRate', respirationRate)}
              </div>
            </div>
          </div>
        </div>

        {/* Symptoms Checklist (H-7) */}
        <div className="symptoms-section">
          <div className="symptoms-header-row">
            <span className="section-label" style={{ marginBottom: 0 }}>
              Current Symptoms (Optional, Max 4)
            </span>
            <span className="symptom-count-badge">{symptomFlags.length} / 4 selected</span>
          </div>

          <div className="symptoms-grid">
            {CLINICAL_SYMPTOMS.map((sym) => {
              const isSelected = symptomFlags.includes(sym.id);
              return (
                <button
                  type="button"
                  key={sym.id}
                  className={`symptom-chip ${isSelected ? 'selected' : ''} ${
                    sym.isEscalator ? 'escalator' : ''
                  }`}
                  onClick={() => toggleSymptom(sym.id)}
                  aria-pressed={isSelected}
                  id={`symptom-btn-${sym.id}`}
                >
                  <div className="symptom-text-wrap">
                    <span className="symptom-label">
                      {sym.label} {sym.isEscalator && '🚨'}
                    </span>
                    <span className="symptom-subtext">{sym.subtext}</span>
                  </div>
                  <span className="symptom-chip-icon">{isSelected ? '✓' : '+'}</span>
                </button>
              );
            })}
          </div>
        </div>

        {/* Clinical Context & Conditions (NEWS2 Scale 2 & Adherence) */}
        <div
          style={{
            background: 'rgba(30, 41, 59, 0.5)',
            borderRadius: '12px',
            border: '1px solid rgba(255, 255, 255, 0.08)',
            padding: '0.85rem',
            marginBottom: '1rem',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              cursor: 'pointer',
            }}
            onClick={() => setShowClinicalContext(!showClinicalContext)}
          >
            <span style={{ fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8' }}>
              ⚙️ Clinical Settings & Context (NEWS2 Scale 2 / Medication Adherence)
            </span>
            <span style={{ fontSize: '0.75rem', color: '#06b6d4' }}>
              {showClinicalContext ? 'Hide ▲' : 'Expand ▼'}
            </span>
          </div>

          {showClinicalContext && (
            <div style={{ marginTop: '0.85rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {/* SpO2 Scale Selector */}
              <div>
                <label style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}>
                  Oxygen Scale (NEWS2 Protocol):
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button
                    type="button"
                    onClick={() => setSpo2Scale(1)}
                    style={{
                      flex: 1,
                      padding: '0.4rem',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: spo2Scale === 1 ? '#06b6d4' : 'rgba(255,255,255,0.05)',
                      color: spo2Scale === 1 ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Scale 1 (General: 96–100%)
                  </button>
                  <button
                    type="button"
                    onClick={() => setSpo2Scale(2)}
                    style={{
                      flex: 1,
                      padding: '0.4rem',
                      fontSize: '0.75rem',
                      borderRadius: '6px',
                      border: '1px solid rgba(255,255,255,0.1)',
                      background: spo2Scale === 2 ? '#06b6d4' : 'rgba(255,255,255,0.05)',
                      color: spo2Scale === 2 ? '#ffffff' : '#94a3b8',
                      cursor: 'pointer',
                    }}
                  >
                    Scale 2 (COPD Target: 88–92%)
                  </button>
                </div>
              </div>

              {/* Supplemental Oxygen Checkbox (if Scale 2) */}
              {spo2Scale === 2 && (
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.5rem',
                    fontSize: '0.8rem',
                    color: '#f8fafc',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={onSupplementalOxygen}
                    onChange={(e) => setOnSupplementalOxygen(e.target.checked)}
                  />
                  Patient is receiving supplemental oxygen
                </label>
              )}

              {/* 7-Day Medication Adherence Input */}
              <div>
                <label
                  style={{ fontSize: '0.8rem', color: '#cbd5e1', display: 'block', marginBottom: '0.3rem' }}
                  htmlFor="adherence-input"
                >
                  7-Day Medication Adherence Rate (%):
                </label>
                <input
                  type="number"
                  id="adherence-input"
                  min="0"
                  max="100"
                  step="5"
                  placeholder="e.g. 85 (leave blank if not tracking)"
                  value={adherenceRate}
                  onChange={(e) => setAdherenceRate(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '0.45rem',
                    borderRadius: '6px',
                    border: '1px solid rgba(255,255,255,0.15)',
                    background: 'rgba(15,23,42,0.6)',
                    color: '#f8fafc',
                    fontSize: '0.82rem',
                  }}
                />
              </div>
            </div>
          )}
        </div>

        {/* Notes (Optional) */}
        <div className="notes-section">
          <label className="section-label" htmlFor="vitals-notes-input">
            Patient Notes or Observations (Optional)
          </label>
          <textarea
            id="vitals-notes-input"
            className="notes-textarea"
            placeholder="e.g. Taken right after waking up, felt slight fatigue..."
            maxLength={500}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </div>

        {/* Phase 11 Wearable Preview Hook (Strict NFR4 Separation) */}
        <div className="wearable-preview-card">
          <div className="wearable-preview-header">
            <span className="wearable-preview-title">
              <Watch size={16} /> Wearable Sync (Phase 11 Extension Preview)
            </span>
            <span className="nfr4-badge" style={{ fontSize: '0.65rem' }}>
              NFR4 Compliant
            </span>
          </div>
          <p className="wearable-preview-desc">
            Manual entry is 100% self-sufficient. In Phase 11, Oura Sandbox OAuth sync will automatically
            populate these fields for patient review. You can test the auto-fill hook below:
          </p>
          <button
            type="button"
            className="wearable-btn"
            onClick={handleSimulateWearable}
            disabled={isSimulatingWearable || isSubmitting}
            id="simulate-wearable-btn"
          >
            {isSimulatingWearable ? (
              <>
                <div className="spinner" style={{ width: 14, height: 14 }} /> Connecting to Oura Sandbox Hook...
              </>
            ) : (
              <>
                <Sparkles size={14} /> Test Phase 11 Auto-Fill Hook
              </>
            )}
          </button>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          className="submit-btn"
          disabled={isSubmitting || userRole === 'caregiver'}
          id="submit-vitals-btn"
        >
          {isSubmitting ? (
            <>
              <div className="spinner" /> Recording Vitals Securely...
            </>
          ) : userRole === 'caregiver' ? (
            'Caregiver Read-Only Mode (NFR1 Guard)'
          ) : (
            'Submit Vitals Reading'
          )}
        </button>

        {userRole === 'caregiver' && (
          <p style={{ marginTop: '0.5rem', fontSize: '0.75rem', color: '#fb7185', textAlign: 'center' }}>
            Caregivers have read-only access per NFR1 and cannot submit clinical readings.
          </p>
        )}
      </form>
    </div>
  );
}
