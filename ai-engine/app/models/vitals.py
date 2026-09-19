# Directory - ai-engine/app/models/vitals.py

"""CareOClock AI Engine — Pydantic Schemas for Vitals & Layer 1 Scoring.

Compliant with:
- India Digital Personal Data Protection (DPDP) Act, 2023 (Zero PII payload)
- Royal College of Physicians NEWS2 (2017)
- Canonical Specification §6.6 & §13
"""

from datetime import date, datetime
from typing import Any, Dict, List, Literal, Optional
from pydantic import BaseModel, ConfigDict, Field, model_validator
from app.scoring.constants import CLINICAL_DISCLAIMER, PHYSIOLOGICAL_LIMITS


class VitalsReading(BaseModel):
    """Input payload representing a single patient-initiated or clinical vitals reading.

    Operates in complete isolation with zero required historical data dependencies.
    """

    model_config = ConfigDict(populate_by_name=True)

    # Optional pseudonymized ID (Zero-PII compliant: No names, emails, phone, or DOB)
    patient_id: Optional[str] = Field(
        default=None,
        alias="patientId",
        description="Pseudonymized opaque patient identifier (e.g. MongoDB ObjectId)",
    )

    # Core Vital Signs with clinically grounded physiological limits
    systolic_bp: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["systolic_bp"]["min"],
        le=PHYSIOLOGICAL_LIMITS["systolic_bp"]["max"],
        alias="systolicBp",
        description="Systolic blood pressure in mmHg (50–260)",
    )
    diastolic_bp: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["min"],
        le=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["max"],
        alias="diastolicBp",
        description="Diastolic blood pressure in mmHg (30–160)",
    )
    heart_rate: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["heart_rate"]["min"],
        le=PHYSIOLOGICAL_LIMITS["heart_rate"]["max"],
        alias="heartRate",
        description="Resting heart rate in bpm (25–250)",
    )
    spo2: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["spo2"]["min"],
        le=PHYSIOLOGICAL_LIMITS["spo2"]["max"],
        alias="spo2",
        description="Peripheral capillary oxygen saturation percentage (50–100)",
    )
    temperature_c: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["temperature_c"]["min"],
        le=PHYSIOLOGICAL_LIMITS["temperature_c"]["max"],
        alias="temperatureC",
        description="Body temperature in degrees Celsius (30.0–44.0)",
    )
    respiration_rate: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["respiration_rate"]["min"],
        le=PHYSIOLOGICAL_LIMITS["respiration_rate"]["max"],
        alias="respirationRate",
        description="Respiration rate in breaths per minute (4–60)",
    )

    # Target SpO2 scale selector & oxygen status (Fix B)
    spo2_scale: Literal[1, 2] = Field(
        default=1,
        alias="spo2Scale",
        description="1 = General population (default), 2 = Hypercapnic respiratory failure / COPD target (88–92%)",
    )
    on_supplemental_oxygen: Optional[bool] = Field(
        default=None,
        alias="onSupplementalOxygen",
        description="Mandatory when spo2_scale is 2. Indicates whether patient is receiving supplemental oxygen.",
    )

    # Care Additions context
    symptom_flags: List[str] = Field(
        default_factory=list,
        alias="symptomFlags",
        description="List of selected symptoms from the closed 7-symptom vocabulary",
    )
    adherence_rate_7d: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        alias="adherenceRate7d",
        description="Proportion of Days Covered (0.0–1.0) over trailing 7 days, or None if new/unmonitored",
    )
    # Temporal anchoring & requester context (Findings 2 & 6)
    recorded_at: Optional[datetime] = Field(
        default=None,
        alias="recordedAt",
        description="Timestamp of the reading in UTC",
    )
    requesting_role: Optional[str] = Field(
        default=None,
        alias="requestingRole",
        description="Role of the user submitting the reading ('patient', 'doctor', 'caregiver')",
    )

    notes: Optional[str] = Field(
        default="",
        max_length=500,
        description="Optional patient-entered observations",
    )

    @model_validator(mode="after")
    def validate_reading(self) -> "VitalsReading":
        """Cross-field validations for clinical safety and physiological consistency."""
        # 1. At least one vital sign must be present (Fix C: includes diastolic_bp)
        vitals = [
            self.systolic_bp,
            self.diastolic_bp,
            self.heart_rate,
            self.spo2,
            self.temperature_c,
            self.respiration_rate,
        ]
        if all(v is None for v in vitals):
            raise ValueError("At least one valid vital sign parameter must be provided.")

        # 2. Pulse pressure check when both systolic and diastolic BP are present
        if self.systolic_bp is not None and self.diastolic_bp is not None:
            pulse_pressure = self.systolic_bp - self.diastolic_bp
            if pulse_pressure < PHYSIOLOGICAL_LIMITS["pulse_pressure_min"]:
                raise ValueError(
                    f"Systolic BP ({self.systolic_bp} mmHg) must exceed Diastolic BP "
                    f"({self.diastolic_bp} mmHg) by at least 10 mmHg pulse pressure."
                )

        # 3. Conditional validation for SpO2 Scale 2 (Fix B)
        if self.spo2_scale == 2 and self.on_supplemental_oxygen is None:
            raise ValueError(
                "on_supplemental_oxygen must be explicitly specified (True or False) when spo2_scale is 2."
            )

        # 4. Clinician-gated defense-in-depth for SpO2 Scale 2 (Finding 6 & Gap 1)
        if (
            self.spo2_scale == 2
            and self.requesting_role is not None
            and self.requesting_role != "doctor"
        ):
            raise ValueError(
                "SpO2 Scale 2 (hypercapnic respiratory failure / COPD target) is restricted to clinician (doctor) requests."
            )

        return self


class ModifiedHomeNEWSResult(BaseModel):
    """Output payload of the Layer 1 Modified Home-NEWS deterministic scoring engine."""

    layer1_tier: Literal["Low", "Moderate", "High", "Critical"]
    news2_subtotal: int = Field(
        description="Subtotal from core NEWS2 physiological parameters (Max 12 without RR, Max 15 with RR)"
    )
    care_additions_subtotal: int = Field(
        description="Subtotal from CareOClock additions (Hypertension staging, Symptoms, Adherence)"
    )
    red_flag_triggered: bool = Field(
        description="True if any single NEWS2 physiological parameter scored 3 points"
    )
    escalators_triggered: List[str] = Field(
        default_factory=list,
        description="List of all independent clinical escalators triggered in this reading",
    )
    spo2_scale_used: int = Field(description="SpO2 scale applied (1 or 2)")
    component_points: Dict[str, int] = Field(
        description="Breakdown of points awarded to each physiological vital sign"
    )
    care_component_points: Dict[str, int] = Field(
        description="Breakdown of points awarded to CareOClock additions"
    )
    parameters_used: List[str] = Field(
        description="List of physiological parameters present and scored in this reading"
    )
    data_completeness: Dict[str, Any] = Field(
        description="Data completeness metrics (parameters present vs expected)"
    )
    plain_language_reason: str = Field(
        description="Clinical rationale synthesized for patient, caregiver, and clinician transparency (NFR5)"
    )
    disclaimer: str = Field(
        default=CLINICAL_DISCLAIMER,
        description="Mandatory non-diagnostic regulatory disclaimer",
    )


# =====================================================================
# Phase 5 — Layer 2: Personalized Anomaly Detection Schemas (FR4)
# =====================================================================


class HistoricalVitalsReading(BaseModel):
    """A single historical vitals reading for rolling baseline calculation.

    Enforces strict physiological limits (A-7) identical to current readings.
    """

    model_config = ConfigDict(populate_by_name=True)

    patient_id: Optional[str] = Field(
        default=None,
        alias="patientId",
        description="Pseudonymized patient identifier (e.g. MongoDB ObjectId)",
    )
    recorded_at: Optional[datetime] = Field(
        default=None,
        alias="recordedAt",
        description="Timestamp of the historical reading in UTC",
    )
    slot: Optional[Literal["morning", "evening"]] = Field(
        default=None,
        description="Twice-daily assessment slot ('morning' or 'evening')",
    )

    # Core Vital Signs with clinically grounded physiological limits (A-7)
    systolic_bp: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["systolic_bp"]["min"],
        le=PHYSIOLOGICAL_LIMITS["systolic_bp"]["max"],
        alias="systolicBp",
    )
    diastolic_bp: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["min"],
        le=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["max"],
        alias="diastolicBp",
    )
    heart_rate: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["heart_rate"]["min"],
        le=PHYSIOLOGICAL_LIMITS["heart_rate"]["max"],
        alias="heartRate",
    )
    spo2: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["spo2"]["min"],
        le=PHYSIOLOGICAL_LIMITS["spo2"]["max"],
        alias="spo2",
    )
    temperature_c: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["temperature_c"]["min"],
        le=PHYSIOLOGICAL_LIMITS["temperature_c"]["max"],
        alias="temperatureC",
    )
    respiration_rate: Optional[float] = Field(
        default=None,
        ge=PHYSIOLOGICAL_LIMITS["respiration_rate"]["min"],
        le=PHYSIOLOGICAL_LIMITS["respiration_rate"]["max"],
        alias="respirationRate",
    )

    @model_validator(mode="after")
    def validate_reading(self) -> "HistoricalVitalsReading":
        """Independent physiological validation at the boundary (A-7)."""
        vitals = [
            self.systolic_bp,
            self.diastolic_bp,
            self.heart_rate,
            self.spo2,
            self.temperature_c,
            self.respiration_rate,
        ]
        if all(v is None for v in vitals):
            raise ValueError(
                "Historical reading must contain at least one valid vital sign parameter."
            )

        if self.systolic_bp is not None and self.diastolic_bp is not None:
            pulse_pressure = self.systolic_bp - self.diastolic_bp
            if pulse_pressure < PHYSIOLOGICAL_LIMITS["pulse_pressure_min"]:
                raise ValueError(
                    f"Systolic BP ({self.systolic_bp} mmHg) must exceed Diastolic BP "
                    f"({self.diastolic_bp} mmHg) by at least 10 mmHg pulse pressure."
                )

        return self


class Layer2ScoringRequest(BaseModel):
    """Input payload for Layer 2 Personalized Anomaly Detection.

    Requires pseudonymized patient identifier, historical readings (7-28 days),
    and the new incoming reading to be scored.
    """

    model_config = ConfigDict(populate_by_name=True, extra="forbid")

    patient_id: str = Field(
        ...,
        alias="patientId",
        description="Pseudonymized opaque patient identifier (e.g. MongoDB ObjectId)",
    )
    history: List[HistoricalVitalsReading] = Field(
        default_factory=list,
        description="Historical vitals readings for this patient (trailing 7-28 days)",
    )
    current_reading: VitalsReading = Field(
        ...,
        alias="currentReading",
        description="The incoming vitals reading to score against personal baseline",
    )
    current_date: Optional[date] = Field(
        default=None,
        alias="currentDate",
        description="Optional date anchor for current reading (defaults to UTC today or reading timestamp)",
    )

    @model_validator(mode="after")
    def validate_patient_integrity(self) -> "Layer2ScoringRequest":
        """Strict patient privacy check ensuring zero cross-patient data leakage (A-7)."""
        # Current reading patientId validation if specified
        if self.current_reading.patient_id and self.current_reading.patient_id != self.patient_id:
            raise ValueError(
                f"Cross-patient integrity violation: current_reading.patientId ('{self.current_reading.patient_id}') "
                f"does not match request patientId ('{self.patient_id}')."
            )

        # Ensure no historical readings belong to a different patient
        for i, item in enumerate(self.history):
            if item.patient_id and item.patient_id != self.patient_id:
                raise ValueError(
                    f"Cross-patient integrity violation: history[{i}].patientId ('{item.patient_id}') "
                    f"does not match request patientId ('{self.patient_id}')."
                )

        return self


class FeatureDeviation(BaseModel):
    """Per-feature deviation metrics ranked for clinical explainability (H-2, Spec §6.10)."""

    feature: str = Field(description="Vital sign parameter name")
    current_value: float = Field(description="Today's measured value")
    baseline_mean: float = Field(description="Patient's rolling baseline mean")
    baseline_std: float = Field(description="Patient's rolling baseline standard deviation")
    z_score: float = Field(description="Standardized deviation: (value - mean) / std")
    direction: Literal["higher", "lower", "normal"] = Field(
        description="Direction of deviation relative to normal"
    )


class EvaluationMetadata(BaseModel):
    """Algorithmic evaluation metrics preserved strictly for Phase 12 benchmarks (A-6).

    NOTE (A-6): These raw outputs exist for AUROC/AUPRC computation in the evaluation harness
    and must NEVER be displayed in the patient or caregiver UI next to the authoritative tier.
    """

    isolation_forest_decision_function: Optional[float] = Field(
        default=None,
        description="Raw continuous anomaly score from IsolationForest.decision_function() (negative = anomalous)",
    )
    isolation_forest_is_anomaly: Optional[bool] = Field(
        default=None,
        description="Raw binary flag from IsolationForest.predict(): True if outlier (-1), False if inlier (+1)",
    )
    lof_decision_function: Optional[float] = Field(
        default=None,
        description="Raw continuous anomaly score from LocalOutlierFactor(novelty=True).decision_function()",
    )
    lof_is_anomaly: Optional[bool] = Field(
        default=None,
        description="Raw binary flag from LocalOutlierFactor(novelty=True).predict()",
    )
    contamination_used: float = Field(
        default=0.05,
        description="Contamination hyperparameter applied during model fitting (A-15)",
    )
    n_estimators_used: int = Field(
        default=100,
        description="Number of IsolationForest trees fitted in this evaluation (Phase 2 & 4)",
    )


class PersonalizedAnomalyResult(BaseModel):
    """Output payload of the Layer 2 Personalized Anomaly Detection engine."""

    patient_id: str = Field(description="Pseudonymized opaque patient identifier")
    status: Literal["active", "not yet available"] = Field(
        description="Status of Layer 2 anomaly detection ('not yet available' during cold start < 7 days)"
    )
    message: str = Field(description="Human-readable status rationale or guidance")
    days_of_history: Dict[str, int] = Field(
        default_factory=dict,
        description="Per-vital count of calendar days recorded in patient's history (A-5)",
    )
    days_of_history_total: Optional[int] = Field(
        default=None,
        description="Total distinct historical calendar days recorded across all vitals",
    )
    active_features: List[str] = Field(
        default_factory=list,
        description="List of vital signs that have cleared the 7-day cold-start gate and are scored",
    )
    rolling_baseline: Optional[Dict[str, Dict[str, float]]] = Field(
        default=None,
        description="Patient's personal rolling baseline statistics {vital: {mean, std, count}}",
    )
    layer2_tier: Literal["Low", "Moderate", "High", "Critical", "not yet available"] = Field(
        description=(
            "Authoritative clinical risk tier derived from personal statistical baseline z-scores "
            "(statistical baseline arm). Isolation Forest model outputs are isolated in evaluation_metadata."
        )
    )
    max_z_score: Optional[float] = Field(
        default=None,
        description="Largest absolute z-score deviation among active vitals",
    )
    feature_deviations: Optional[Dict[str, float]] = Field(
        default=None,
        description="Map of vital sign to standardized z-score deviation",
    )
    detailed_deviations: Optional[List[FeatureDeviation]] = Field(
        default=None,
        description="Full clinical deviation breakdown sorted by absolute z-score descending",
    )
    smoothed_deviations: Optional[Dict[str, float]] = Field(
        default=None,
        description="Per-vital EWMA-smoothed trend z-score (v2: 14-day lookback, lambda=0.3)",
    )
    trend_z_score: Optional[float] = Field(
        default=None,
        description="Maximum absolute smoothed trend z-score across active vitals (drives layer2_tier in v2)",
    )
    confidence: Optional[float] = Field(
        default=None,
        ge=0.0,
        le=1.0,
        description="Baseline maturity confidence scaling from 7/28 (~0.25) to 28/28 (1.0)",
    )
    evaluation_metadata: Optional[EvaluationMetadata] = Field(
        default=None,
        description="Underlying scikit-learn model metrics for Phase 12 evaluation harness (A-6)",
    )
    disclaimer: str = Field(
        default=CLINICAL_DISCLAIMER,
        description="Mandatory non-diagnostic regulatory disclaimer",
    )
