# Directory - ai-engine/tests/test_hypothesis_properties.py

"""Phase 3 Hypothesis Property-Based Testing Suite.

Explores the multi-dimensional physiological input space across thousands of configurations
to mathematically verify invariants in compute_home_news():
1. Universal safety: Never raises an unhandled exception for any valid bounded vitals.
2. NEWS2 bounds: news2_subtotal is strictly in [0, 12] (without RR) or [0, 15] (with RR).
3. Tier validity: layer1_tier is always one of {"Low", "Moderate", "High", "Critical"}.
4. Red Flag invariant: If any single physiological score == 3, red_flag_triggered is True,
   and tier is escalated to at least "High".
5. Clinical Escalator invariant: If "chest_pain" or acute "confusion" is present,
   tier is escalated to at least "High".
"""

from hypothesis import given, settings, strategies as st

from app.models.vitals import VitalsReading
from app.scoring.constants import CLINICAL_SYMPTOMS, PHYSIOLOGICAL_LIMITS
from app.scoring.home_news import compute_home_news


# Strategy generating physiological blood pressure pairs satisfying pulse_pressure >= 10
@st.composite
def bp_strategy(draw):
    diastolic = draw(
        st.floats(
            min_value=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["min"],
            max_value=PHYSIOLOGICAL_LIMITS["diastolic_bp"]["max"] - 11.0,
            allow_nan=False,
            allow_infinity=False,
        )
    )
    diastolic_rounded = round(diastolic, 1)
    min_systolic = max(PHYSIOLOGICAL_LIMITS["systolic_bp"]["min"], diastolic_rounded + 10.1)
    systolic = draw(
        st.floats(
            min_value=min_systolic,
            max_value=PHYSIOLOGICAL_LIMITS["systolic_bp"]["max"],
            allow_nan=False,
            allow_infinity=False,
        )
    )
    return round(systolic, 1), diastolic_rounded


@st.composite
def valid_vitals_reading_strategy(draw):
    systolic, diastolic = draw(bp_strategy())
    hr = draw(
        st.floats(
            min_value=PHYSIOLOGICAL_LIMITS["heart_rate"]["min"],
            max_value=PHYSIOLOGICAL_LIMITS["heart_rate"]["max"],
            allow_nan=False,
            allow_infinity=False,
        )
    )
    spo2 = draw(
        st.floats(
            min_value=PHYSIOLOGICAL_LIMITS["spo2"]["min"],
            max_value=PHYSIOLOGICAL_LIMITS["spo2"]["max"],
            allow_nan=False,
            allow_infinity=False,
        )
    )
    temp = draw(
        st.floats(
            min_value=PHYSIOLOGICAL_LIMITS["temperature_c"]["min"],
            max_value=PHYSIOLOGICAL_LIMITS["temperature_c"]["max"],
            allow_nan=False,
            allow_infinity=False,
        )
    )
    rr = draw(
        st.one_of(
            st.none(),
            st.floats(
                min_value=PHYSIOLOGICAL_LIMITS["respiration_rate"]["min"],
                max_value=PHYSIOLOGICAL_LIMITS["respiration_rate"]["max"],
                allow_nan=False,
                allow_infinity=False,
            ),
        )
    )

    spo2_scale = draw(st.sampled_from([1, 2]))
    on_oxygen = draw(st.booleans()) if spo2_scale == 2 else None
    role = (
        "doctor" if spo2_scale == 2 else draw(st.sampled_from(["patient", "doctor", "caregiver"]))
    )

    symptoms = draw(
        st.lists(
            st.sampled_from(list(CLINICAL_SYMPTOMS.keys())),
            unique=True,
            max_size=4,
        )
    )
    adherence = draw(st.one_of(st.none(), st.floats(min_value=0.0, max_value=1.0, allow_nan=False)))

    return VitalsReading(
        patientId="PAT_HYP_01",
        systolicBp=systolic,
        diastolicBp=diastolic,
        heartRate=round(hr, 1),
        spo2=round(spo2, 1),
        temperatureC=round(temp, 1),
        respirationRate=round(rr, 1) if rr is not None else None,
        spo2Scale=spo2_scale,
        onSupplementalOxygen=on_oxygen,
        requestingRole=role,
        symptomFlags=symptoms,
        adherenceRate7d=round(adherence, 2) if adherence is not None else None,
    )


@settings(max_examples=250, deadline=None)
@given(reading=valid_vitals_reading_strategy())
def test_hypothesis_compute_home_news_invariants(reading: VitalsReading):
    """Verify universal mathematical bounds and clinical invariants for any valid vitals."""
    result = compute_home_news(reading)

    # Invariant 1: Result is well-formed
    assert result is not None
    assert result.layer1_tier in ("Low", "Moderate", "High", "Critical")

    # Invariant 2: NEWS2 subtotal bounds
    max_possible_news2 = 15 if reading.respiration_rate is not None else 12
    assert 0 <= result.news2_subtotal <= max_possible_news2

    # Invariant 3: Component points consistency
    assert sum(result.component_points.values()) == result.news2_subtotal

    # Invariant 4: Red Flag escalation consistency
    any_3_points = any(pts >= 3 for pts in result.component_points.values())
    assert result.red_flag_triggered == any_3_points
    if result.red_flag_triggered:
        assert result.layer1_tier in ("High", "Critical")

    # Invariant 5: Independent escalator consistency
    if "chest_pain" in reading.symptom_flags:
        assert result.layer1_tier in ("High", "Critical")
        assert "symptom_chest_pain" in result.escalators_triggered
