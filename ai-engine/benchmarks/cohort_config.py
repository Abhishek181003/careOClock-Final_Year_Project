# Directory - ai-engine/benchmarks/cohort_config.py

"""Auditable 24-Persona Cohort Configuration for CareOClock AI Engine Benchmarking.

Each persona encapsulates an evidence-based clinical archetype grounded in peer-reviewed
geriatric and physiological literature with verified PubMed IDs (PMID) and DOIs.

Seed Invariance Guarantee:
- Personas 1 through 5 preserve the bit-for-bit generation sequence of the Phase 4 benchmark
  under np.random.default_rng(seed + persona_id * 1000).
- Personas 6 through 24 expand coverage across chronic disease inliers, subtle physiological
  drifts, acute non-hypertensive crises, hard negative volatility, and transient blips.
"""

from dataclasses import dataclass
from datetime import date, datetime, timedelta, timezone
from typing import Dict, List, Optional, Tuple
import numpy as np

from app.models.vitals import VitalsReading


@dataclass(frozen=True)
class PersonaMetadata:
    """Clinical and bibliographical documentation for an evaluation persona."""
    id: int
    name: str
    age: int
    sex: str
    category: str  # "Stable Inlier", "Gradual Drift", "Acute Crisis", "Hard Negative", "Transient Blip"
    primary_citation: str
    citation_identifiers: str
    clinical_findings: str


COHORT_METADATA: Dict[int, PersonaMetadata] = {
    1: PersonaMetadata(
        id=1,
        name="Healthy Normotensive Elderly",
        age=68,
        sex="Female",
        category="Stable Inlier",
        primary_citation="O'Brien et al. (2003) BMJ 326(7384):291; Kjeldsen et al. (1998) J Hypertens 16(12):1901-1910",
        citation_identifiers="PMID: 12574043; PMID: 9886877",
        clinical_findings="Normative ambulatory vitals in healthy older adults (SBP 122/78, HR 68, SpO2 97%, RR 16).",
    ),
    2: PersonaMetadata(
        id=2,
        name="Stable Chronic COPD",
        age=74,
        sex="Male",
        category="Stable Inlier",
        primary_citation="Royal College of Physicians (2017) NEWS2 Guidelines; GOLD Report (2024)",
        citation_identifiers="RCP NEWS2 ISBN 978-1-86016-682-2",
        clinical_findings="NEWS2 SpO2 Scale 2 baseline: target 88-92%, baseline RR 21 br/min in chronic hypercapnia.",
    ),
    3: PersonaMetadata(
        id=3,
        name="Acute Hypertensive Crisis",
        age=71,
        sex="Male",
        category="Acute Crisis",
        primary_citation="Whelton et al. (2018) Hypertension 71(6):e13-e115; Chobanian et al. (2003) JAMA 289(19):2560-2572",
        citation_identifiers="PMID: 29133356, DOI: 10.1161/HYP.0000000000000065; PMID: 12748199",
        clinical_findings="Hypertensive emergency defined by acute SBP > 180 or DBP > 120 with target organ ischemia (angina).",
    ),
    4: PersonaMetadata(
        id=4,
        name="Acute Sepsis / Severe Infection",
        age=82,
        sex="Female",
        category="Acute Crisis",
        primary_citation="Singer et al. (2016) JAMA 315(8):801-810 (Sepsis-3); RCP NEWS2 (2017)",
        citation_identifiers="PMID: 26903338, DOI: 10.1001/jama.2016.0287",
        clinical_findings="Acute dysregulated host response: Temp >= 39.2C, HR 125, RR 28, acute delirium/dyspnea.",
    ),
    5: PersonaMetadata(
        id=5,
        name="Insidious Cardiovascular Drift",
        age=69,
        sex="Male",
        category="Gradual Drift",
        primary_citation="Subbe et al. (2001) QJM 94(10):521-529; Franklin et al. (1999) Circulation 100(4):354-360",
        citation_identifiers="PMID: 11588210, DOI: 10.1093/qjmed/94.10.521; PMID: 10421594",
        clinical_findings="Subacute physiological instability: subtle multi-parameter daily drift over 14 days preceding acute collapse.",
    ),
    6: PersonaMetadata(
        id=6,
        name="Well-Controlled Essential Hypertension",
        age=72,
        sex="Male",
        category="Stable Inlier",
        primary_citation="Whelton et al. (2018) Hypertension 71(6):e13-e115; SPRINT Research Group (2015) N Engl J Med 373(22):2103-2116",
        citation_identifiers="PMID: 29133356, DOI: 10.1161/HYP.0000000000000065; PMID: 26551272",
        clinical_findings="Target treated SBP 130-139 mmHg, DBP 80-84 mmHg in community-dwelling elderly.",
    ),
    7: PersonaMetadata(
        id=7,
        name="Mild Baseline Tachycardia / Sedentary Senior",
        age=78,
        sex="Female",
        category="Stable Inlier",
        primary_citation="Palatini et al. (2006) J Hypertens 24(4):603-610 (ESH Consensus Statement)",
        citation_identifiers="PMID: 16531782, DOI: 10.1097/01.hjh.0000217841.48866.70",
        clinical_findings="Non-pathological elevated resting heart rate (80-90 bpm) reflecting physical deconditioning and high sympathetic tone.",
    ),
    8: PersonaMetadata(
        id=8,
        name="Controlled Type 2 Diabetes Baseline",
        age=67,
        sex="Female",
        category="Stable Inlier",
        primary_citation="American Diabetes Association (2024) Diabetes Care 47(Suppl 1):S179-S218",
        citation_identifiers="PMID: 38078592, DOI: 10.2337/dc24-S010",
        clinical_findings="Medically treated T2D maintains stable resting vitals within standard targets (BP < 130/80 mmHg).",
    ),
    9: PersonaMetadata(
        id=9,
        name="Athletic Senior with Physiological Sinus Bradycardia",
        age=65,
        sex="Male",
        category="Stable Inlier",
        primary_citation="D'Souza, Sharma & Boyett (2015) J Physiol 593(8):1749-1751; Northcote et al. (1989) Br Heart J 61(2):155-160",
        citation_identifiers="PMID: 25877864, DOI: 10.1113/jphysiol.2014.284356; PMID: 2923749",
        clinical_findings="Resting HR 30-70 bpm across 142 endurance athletes from intrinsic SA node pacemaker channel downregulation; asymptomatic HR < 55 bpm in veteran runners.",
    ),
    10: PersonaMetadata(
        id=10,
        name="Insidious Hypoxic Drift / Subacute Pleural Effusion",
        age=76,
        sex="Female",
        category="Gradual Drift",
        primary_citation="Porcel & Light (2006) Am Fam Physician 73(7):1211-1220; Light RW (2002) N Engl J Med 346(25):1971-1977",
        citation_identifiers="PMID: 16623250; PMID: 12075060, DOI: 10.1056/NEJMcp010731",
        clinical_findings="Subacute pleural fluid accumulation causes progressive exertional dyspnea, insidious SpO2 decline, and shallow tachypnea.",
    ),
    11: PersonaMetadata(
        id=11,
        name="Insidious Low-Grade Pyrexia / Occult Bacteremia",
        age=80,
        sex="Male",
        category="Gradual Drift",
        primary_citation="Norman DC (2000) Clin Infect Dis 31(1):148-151; High et al. (2009) Clin Infect Dis 48(2):149-171",
        citation_identifiers="PMID: 10913413, DOI: 10.1086/313896; PMID: 19072714",
        clinical_findings="Blunted pyrexic response in older adults: delta > 1.1C over baseline or temp >= 37.8C signifies occult bacteremia prior to septic collapse.",
    ),
    12: PersonaMetadata(
        id=12,
        name="Insidious Isolated Systolic Hypertensive Creep",
        age=83,
        sex="Female",
        category="Gradual Drift",
        primary_citation="Franklin et al. (1999) Circulation 100(4):354-360; Franklin et al. (2001) Circulation 103(9):1245-1249",
        citation_identifiers="PMID: 10421594, DOI: 10.1161/01.cir.100.4.354; PMID: 11238268",
        clinical_findings="Central arterial stiffening causes isolated SBP creep (+2.8 mmHg/day) with stable DBP, creating wide pulse pressure (>90 mmHg).",
    ),
    13: PersonaMetadata(
        id=13,
        name="Isolated Acute Delirium / Confusion Escalator Crisis",
        age=85,
        sex="Male",
        category="Acute Crisis",
        primary_citation="Inouye, Westendorp & Saczynski (2014) Lancet 383(9920):911-922; RCP NEWS2 (2017)",
        citation_identifiers="PMID: 23992774, DOI: 10.1016/S0140-6736(13)60688-1",
        clinical_findings="Acute delirium is frequently the sole presenting sign of acute decompensation; NEWS2 mandates maximum 3-point Red Flag escalation.",
    ),
    14: PersonaMetadata(
        id=14,
        name="Acute Exacerbation of COPD on Scale 2 (AECOPD)",
        age=73,
        sex="Male",
        category="Acute Crisis",
        primary_citation="GOLD Report (2024); Wedzicha & Seemungal (2007) Lancet 370(9589):786-796",
        citation_identifiers="GOLD 2024; PMID: 17765527, DOI: 10.1016/S0140-6736(07)61379-8",
        clinical_findings="Severe acute respiratory failure: sudden SpO2 collapse (<88% on Scale 2) and extreme tachypnea (RR 32 br/min).",
    ),
    15: PersonaMetadata(
        id=15,
        name="Acute Hypotensive Shock / Syncope",
        age=79,
        sex="Female",
        category="Acute Crisis",
        primary_citation="Vincent & De Backer (2013) N Engl J Med 369(18):1726-1734; RCP NEWS2 (2017)",
        citation_identifiers="PMID: 24171518, DOI: 10.1056/NEJMra1208943",
        clinical_findings="Circulatory shock: critical hypoperfusion (SBP <= 90 mmHg, 3 NEWS2 points) with reflex compensatory sinus tachycardia.",
    ),
    16: PersonaMetadata(
        id=16,
        name="Labile Blood Pressure / Autonomic Volatility Inlier",
        age=75,
        sex="Male",
        category="Hard Negative",
        primary_citation="Parati et al. (2013) Nat Rev Cardiol 10(3):143-155; Parati et al. (2018) J Hypertens 36(8):1622-1633",
        citation_identifiers="PMID: 23399973, DOI: 10.1038/nrcardio.2013.1; PMID: 29847427",
        clinical_findings="Autonomic baroreflex dysfunction and vascular stiffness cause high day-to-day blood pressure SD (+/- 7.8 mmHg) without acute events.",
    ),
    17: PersonaMetadata(
        id=17,
        name="High Respiratory Sinus Arrhythmia Inlier",
        age=69,
        sex="Female",
        category="Hard Negative",
        primary_citation="Task Force of ESC and NASPE (1996) Circulation 93(5):1043-1065",
        citation_identifiers="PMID: 8598068, DOI: 10.1161/01.cir.93.5.1043",
        clinical_findings="Robust vagal modulation produces wide benign physiological heart rate variability (72 +/- 8.2 bpm; range 56-88 bpm).",
    ),
    18: PersonaMetadata(
        id=18,
        name="Chronic Borderline Tachypneic Inlier with Kyphoscoliosis",
        age=81,
        sex="Female",
        category="Hard Negative",
        primary_citation="Bergofsky EH (1979) Am Rev Respir Dis 119(4):643-669",
        citation_identifiers="PMID: 377283, DOI: 10.1164/arrd.1979.119.4.643",
        clinical_findings="Severe thoracic deformity reduces compliance, forcing chronic rapid shallow breathing (19.5 +/- 1.8 br/min) to sustain ventilation.",
    ),
    19: PersonaMetadata(
        id=19,
        name="Single-Day Exertional / Dehydration Blip",
        age=77,
        sex="Male",
        category="Transient Blip",
        primary_citation="Popowski et al. (2001) Med Sci Sports Exerc 33(5):747-753",
        citation_identifiers="PMID: 11323547, DOI: 10.1097/00005768-200105000-00018",
        clinical_findings="Mild acute volume contraction causes transient orthostatic BP drop and mild tachycardia, self-reversing within 24h.",
    ),
    20: PersonaMetadata(
        id=20,
        name="Single-Day Post-Vaccine Reactogenicity Blip",
        age=70,
        sex="Female",
        category="Transient Blip",
        primary_citation="Cunningham et al. (2016) N Engl J Med 375(11):1019-1032; Herve et al. (2019) NPJ Vaccines 4:39",
        citation_identifiers="PMID: 27626517, DOI: 10.1056/NEJMoa1603800; PMID: 31583123",
        clinical_findings="Systemic vaccine reactogenicity (low-grade temp 37.8C, fatigue, mild tachycardia) self-resolves completely within 24-48h.",
    ),
    21: PersonaMetadata(
        id=21,
        name="Oldest-Old Normotensive Female",
        age=89,
        sex="Female",
        category="Stable Inlier",
        primary_citation="Gomolin et al. (2005) J Am Geriatr Soc 53(12):2170-2172; Beckett et al. (2008) N Engl J Med 358(18):1887-1898",
        citation_identifiers="PMID: 16398904, DOI: 10.1111/j.1532-5415.2005.00508.x; PMID: 18378519",
        clinical_findings="Resting basal temperature in oldest-old (>=85) averages lower (36.2-36.5C) with blunted diurnal amplitude; sitting BP targets 140-150/75-80 mmHg.",
    ),
    22: PersonaMetadata(
        id=22,
        name="Treated Stage 1 Hypertension with Diurnal Stability",
        age=66,
        sex="Male",
        category="Stable Inlier",
        primary_citation="Whelton et al. (2018) Hypertension 71(6):e13-e115",
        citation_identifiers="PMID: 29133356, DOI: 10.1161/HYP.0000000000000065",
        clinical_findings="Stage 1 hypertension (SBP 130-139 / DBP 80-89 mmHg); monotherapy-treated stable hemodynamics represent controlled inlier state.",
    ),
    23: PersonaMetadata(
        id=23,
        name="Creeping Pyrexic Drift with Urosepsis Decompensation",
        age=84,
        sex="Female",
        category="Gradual Drift",
        primary_citation="High et al. (2009) Clin Infect Dis 48(2):149-171; Juthani-Mehta et al. (2009) J Am Geriatr Soc 57(6):963-970",
        citation_identifiers="PMID: 19072714; PMID: 19490243",
        clinical_findings="Insidious temperature creep (+0.14C/day to 37.8C) and new confusion precede fulminant urosepsis in frail elderly.",
    ),
    24: PersonaMetadata(
        id=24,
        name="Combined Cardiopulmonary Congestive Drift",
        age=76,
        sex="Male",
        category="Gradual Drift",
        primary_citation="McDonagh et al. (2021) Eur Heart J 42(36):3599-3726 (2021 ESC Heart Failure Guidelines)",
        citation_identifiers="PMID: 34447992, DOI: 10.1093/eurheartj/ehab368",
        clinical_findings="Insidious cardiopulmonary decompensation: simultaneous SpO2 decline (-0.35%/day) and SBP afterload rise (+2.0 mmHg/day) preceding ADHF acute pulmonary edema.",
    ),
}


def generate_longitudinal_persona(
    persona_id: int,
    seed: int,
    total_days: int = 75,
) -> Tuple[List[VitalsReading], List[int]]:
    """Generates 75 consecutive daily readings and binary ground-truth labels (0 = inlier, 1 = adverse event).

    Independent Sub-Stream:
    Uses rng = np.random.default_rng(seed + persona_id * 1000) ensuring that Personas 1-5
    produce bit-for-bit identical readings regardless of whether personas 6-24 exist.
    """
    rng = np.random.default_rng(seed + persona_id * 1000)
    readings: List[VitalsReading] = []
    labels: List[int] = []

    start_date = date(2026, 1, 1)

    for day in range(1, total_days + 1):
        curr_date = start_date + timedelta(days=day - 1)
        dt = datetime.combine(curr_date, datetime.min.time(), tzinfo=timezone.utc)
        patient_id = f"PAT_P{persona_id}_S{seed}"

        # -------------------------------------------------------------
        # Default baseline distributions
        # -------------------------------------------------------------
        sbp = rng.normal(122.0, 3.5)
        dbp = rng.normal(78.0, 2.5)
        hr = rng.normal(68.0, 3.0)
        spo2 = rng.normal(97.0, 0.8)
        temp = rng.normal(36.6, 0.15)
        rr = rng.normal(16.0, 1.0)
        symptoms: List[str] = []
        is_event = 0
        spo2_scale = 1
        on_o2: Optional[bool] = None
        role = "patient"

        # -------------------------------------------------------------
        # Personas 1-5 (Original Cohort: Bit-for-Bit Invariance)
        # -------------------------------------------------------------
        if persona_id == 1:
            # P1: Stable normotensive elderly (all 75 days inliers)
            pass

        elif persona_id == 2:
            # P2: Stable chronic COPD (SpO2 Scale 2 baseline: 88-92%, elevated RR)
            sbp = rng.normal(124.0, 4.0)
            dbp = rng.normal(79.0, 3.0)
            hr = rng.normal(75.0, 4.0)
            spo2 = rng.normal(90.0, 0.9)
            rr = rng.normal(21.0, 1.2)
            spo2_scale = 2
            on_o2 = False
            role = "doctor"

        elif persona_id == 3:
            # P3: Acute Hypertensive Crisis at Day 51
            if day == 51:
                sbp = rng.normal(215.0, 2.0)
                dbp = rng.normal(122.0, 2.0)
                hr = rng.normal(108.0, 3.0)
                symptoms = ["chest_pain"]
                is_event = 1
            elif day > 51:
                sbp = rng.normal(138.0, 4.0)
                dbp = rng.normal(86.0, 3.0)

        elif persona_id == 4:
            # P4: Acute Sepsis / Respiratory Deterioration at Day 46
            if day == 46:
                temp = rng.normal(39.2, 0.2)
                hr = rng.normal(125.0, 3.0)
                spo2 = rng.normal(88.0, 1.0)
                rr = rng.normal(28.0, 1.5)
                symptoms = ["confusion", "dyspnea"]
                is_event = 1
            elif day > 46:
                temp = rng.normal(37.4, 0.3)
                hr = rng.normal(88.0, 3.0)

        elif persona_id == 5:
            # P5: Insidious Drift (Smoke Detector Persona)
            if 41 <= day <= 55:
                drift_step = day - 40  # 1 to 15
                sbp += drift_step * 2.5
                dbp += drift_step * 1.0
                hr += drift_step * 1.5
                rr += drift_step * 0.4
                is_event = 1
                if day >= 48:
                    symptoms = ["dyspnea"]
            elif day == 56:
                sbp = 192.0
                dbp = 112.0
                hr = 115.0
                spo2 = 91.0
                rr = 26.0
                symptoms = ["dyspnea", "chest_pain"]
                is_event = 1
            elif day > 56:
                sbp = rng.normal(142.0, 4.0)
                dbp = rng.normal(88.0, 3.0)

        # -------------------------------------------------------------
        # Personas 6-9 (Additional Stable Inliers)
        # -------------------------------------------------------------
        elif persona_id == 6:
            # P6: Well-Controlled Essential Hypertension
            sbp = rng.normal(132.0, 3.8)
            dbp = rng.normal(82.0, 2.8)
            hr = rng.normal(66.0, 3.2)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(15.0, 1.0)

        elif persona_id == 7:
            # P7: Mild Baseline Tachycardia / Sedentary Senior
            sbp = rng.normal(126.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(86.0, 4.2)
            spo2 = rng.normal(96.0, 0.9)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(17.0, 1.0)

        elif persona_id == 8:
            # P8: Controlled Type 2 Diabetes Baseline
            sbp = rng.normal(128.0, 4.0)
            dbp = rng.normal(80.0, 3.0)
            hr = rng.normal(72.0, 3.5)
            spo2 = rng.normal(97.2, 0.7)
            temp = rng.normal(36.7, 0.15)
            rr = rng.normal(16.0, 1.1)

        elif persona_id == 9:
            # P9: Athletic Senior with Physiological Sinus Bradycardia
            sbp = rng.normal(116.0, 3.0)
            dbp = rng.normal(72.0, 2.2)
            hr = rng.normal(54.0, 2.5)
            spo2 = rng.normal(98.0, 0.6)
            temp = rng.normal(36.4, 0.12)
            rr = rng.normal(14.0, 0.8)

        # -------------------------------------------------------------
        # Personas 10-12 (Gradual Physiological Drift Variants)
        # -------------------------------------------------------------
        elif persona_id == 10:
            # P10: Insidious Hypoxic Drift / Subacute Pleural Effusion
            sbp = rng.normal(126.0, 3.5)
            dbp = rng.normal(78.0, 2.5)
            hr = rng.normal(72.0, 3.0)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(16.5, 1.0)
            if 41 <= day <= 55:
                drift_step = day - 40
                spo2 -= drift_step * 0.40  # 96.5 -> 90.5
                rr += drift_step * 0.50    # 16.5 -> 24.0
                hr += drift_step * 0.8     # 72 -> 84
                is_event = 1
                if day >= 49:
                    symptoms = ["dyspnea"]
            elif day == 56:
                spo2 = 86.0
                rr = 28.0
                hr = 98.0
                symptoms = ["dyspnea"]
                is_event = 1
            elif day > 56:
                spo2 = rng.normal(95.0, 1.0)
                rr = rng.normal(18.0, 1.0)

        elif persona_id == 11:
            # P11: Insidious Low-Grade Pyrexia / Occult Bacteremia
            sbp = rng.normal(124.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(70.0, 3.0)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(16.0, 1.0)
            if 43 <= day <= 57:
                drift_step = day - 42
                temp += drift_step * 0.09  # 36.6 -> 37.95
                hr += drift_step * 1.2     # 70 -> 88
                is_event = 1
                if day >= 50:
                    symptoms = ["fatigue"]
            elif day == 58:
                temp = 39.1
                hr = 118.0
                sbp = 94.0
                dbp = 58.0
                symptoms = ["fatigue", "confusion"]
                is_event = 1
            elif day > 58:
                temp = rng.normal(36.8, 0.2)
                hr = rng.normal(74.0, 3.0)
                sbp = rng.normal(118.0, 4.0)

        elif persona_id == 12:
            # P12: Insidious Isolated Systolic Hypertensive Creep
            sbp = rng.normal(130.0, 3.5)
            dbp = rng.normal(78.0, 2.5)
            hr = rng.normal(68.0, 3.0)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(16.0, 1.0)
            if 41 <= day <= 55:
                drift_step = day - 40
                sbp += drift_step * 2.8   # 130 -> 172
                is_event = 1
                if day >= 49:
                    symptoms = ["headache"]
            elif day == 56:
                sbp = 206.0
                dbp = 88.0
                hr = 82.0
                symptoms = ["headache", "dizziness"]
                is_event = 1
            elif day > 56:
                sbp = rng.normal(138.0, 4.0)
                dbp = rng.normal(78.0, 2.5)

        # -------------------------------------------------------------
        # Personas 13-15 (Acute Crisis Variants)
        # -------------------------------------------------------------
        elif persona_id == 13:
            # P13: Isolated Acute Delirium / Confusion Escalator Crisis
            sbp = rng.normal(128.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(70.0, 3.0)
            spo2 = rng.normal(96.0, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(16.0, 1.0)
            if day == 48:
                sbp = rng.normal(146.0, 3.0)
                hr = rng.normal(92.0, 3.0)
                spo2 = rng.normal(94.0, 0.8)
                rr = rng.normal(20.0, 1.0)
                symptoms = ["confusion"]
                is_event = 1
            elif day > 48:
                sbp = rng.normal(130.0, 3.5)
                hr = rng.normal(72.0, 3.0)

        elif persona_id == 14:
            # P14: Acute Exacerbation of COPD on Scale 2 (AECOPD)
            sbp = rng.normal(126.0, 3.5)
            dbp = rng.normal(78.0, 2.5)
            hr = rng.normal(76.0, 3.0)
            spo2 = rng.normal(90.0, 0.9)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(21.0, 1.2)
            spo2_scale = 2
            on_o2 = False
            role = "doctor"
            if day == 52:
                spo2 = rng.normal(81.0, 1.0)
                rr = rng.normal(32.0, 1.5)
                hr = rng.normal(118.0, 3.0)
                symptoms = ["dyspnea"]
                is_event = 1
            elif day > 52:
                spo2 = rng.normal(89.0, 1.0)
                rr = rng.normal(22.0, 1.2)

        elif persona_id == 15:
            # P15: Acute Hypotensive Shock / Syncope
            sbp = rng.normal(125.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(70.0, 3.0)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(16.0, 1.0)
            if day == 44:
                sbp = rng.normal(78.0, 2.0)
                dbp = rng.normal(48.0, 2.0)
                hr = rng.normal(122.0, 3.0)
                symptoms = ["dizziness"]
                is_event = 1
            elif day > 44:
                sbp = rng.normal(118.0, 3.5)
                dbp = rng.normal(72.0, 2.5)
                hr = rng.normal(74.0, 3.0)

        # -------------------------------------------------------------
        # Personas 16-18 (Hard Negatives / High Variance Inliers)
        # -------------------------------------------------------------
        elif persona_id == 16:
            # P16: Labile Blood Pressure / Autonomic Volatility Inlier
            sbp = rng.normal(128.0, 7.8)
            dbp = rng.normal(76.0, 5.5)
            hr = rng.normal(70.0, 3.5)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(16.0, 1.0)

        elif persona_id == 17:
            # P17: High Respiratory Sinus Arrhythmia Inlier
            sbp = rng.normal(120.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(72.0, 8.2)
            spo2 = rng.normal(97.0, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(15.0, 1.0)

        elif persona_id == 18:
            # P18: Chronic Borderline Tachypneic Inlier with Kyphoscoliosis
            sbp = rng.normal(122.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(74.0, 3.0)
            spo2 = rng.normal(95.5, 1.0)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(19.5, 1.8)

        # -------------------------------------------------------------
        # Personas 19-20 (Self-Resolving Benign Blips)
        # -------------------------------------------------------------
        elif persona_id == 19:
            # P19: Single-Day Exertional / Dehydration Blip
            sbp = rng.normal(122.0, 3.5)
            dbp = rng.normal(78.0, 2.5)
            hr = rng.normal(68.0, 3.0)
            spo2 = rng.normal(96.8, 0.8)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(15.5, 1.0)
            if day == 39:
                sbp = rng.normal(108.0, 3.0)
                dbp = rng.normal(68.0, 2.5)
                hr = rng.normal(98.0, 3.0)
                temp = rng.normal(37.3, 0.15)
                symptoms = ["fatigue"]
                is_event = 0  # Benign blip

        elif persona_id == 20:
            # P20: Single-Day Post-Vaccine Reactogenicity Blip
            sbp = rng.normal(120.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(68.0, 3.0)
            spo2 = rng.normal(97.2, 0.7)
            temp = rng.normal(36.6, 0.15)
            rr = rng.normal(15.0, 1.0)
            if day == 49:
                temp = rng.normal(37.8, 0.15)
                hr = rng.normal(84.0, 3.0)
                symptoms = ["fatigue"]
                is_event = 0  # Benign blip

        # -------------------------------------------------------------
        # Personas 21-24 (Additional Demographics & Variations)
        # -------------------------------------------------------------
        elif persona_id == 21:
            # P21: Oldest-Old Normotensive Female (Age 89)
            sbp = rng.normal(128.0, 4.0)
            dbp = rng.normal(74.0, 3.0)
            hr = rng.normal(72.0, 3.5)
            spo2 = rng.normal(95.8, 0.8)
            temp = rng.normal(36.4, 0.15)
            rr = rng.normal(16.0, 1.0)

        elif persona_id == 22:
            # P22: Treated Stage 1 Hypertension with Diurnal Stability (Age 66)
            sbp = rng.normal(136.0, 3.8)
            dbp = rng.normal(84.0, 2.8)
            hr = rng.normal(68.0, 3.0)
            spo2 = rng.normal(96.5, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(15.0, 1.0)

        elif persona_id == 23:
            # P23: Creeping Pyrexic Drift with Urosepsis Decompensation (Age 84)
            sbp = rng.normal(124.0, 3.5)
            dbp = rng.normal(76.0, 2.5)
            hr = rng.normal(70.0, 3.0)
            spo2 = rng.normal(96.0, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(16.0, 1.0)
            if 45 <= day <= 53:
                drift_step = day - 44  # 1 to 9
                temp += drift_step * 0.14  # 36.5 -> 37.76
                hr += drift_step * 1.5     # 70 -> 83.5
                is_event = 1
                if day >= 51:
                    symptoms = ["confusion"]
            elif day == 54:
                temp = 39.0
                sbp = 88.0
                dbp = 54.0
                hr = 114.0
                rr = 26.0
                symptoms = ["confusion"]
                is_event = 1
            elif day > 54:
                temp = rng.normal(36.8, 0.2)
                sbp = rng.normal(116.0, 4.0)
                hr = rng.normal(76.0, 3.0)

        elif persona_id == 24:
            # P24: Combined Cardiopulmonary Congestive Drift (Age 76)
            sbp = rng.normal(134.0, 3.5)
            dbp = rng.normal(82.0, 2.5)
            hr = rng.normal(72.0, 3.0)
            spo2 = rng.normal(96.0, 0.8)
            temp = rng.normal(36.5, 0.15)
            rr = rng.normal(16.5, 1.0)
            if 39 <= day <= 53:
                drift_step = day - 38  # 1 to 15
                spo2 -= drift_step * 0.35  # 96.0 -> 90.75
                sbp += drift_step * 2.0    # 134 -> 164
                hr += drift_step * 1.2     # 72 -> 90
                rr += drift_step * 0.4     # 16.5 -> 22.5
                is_event = 1
                if day >= 47:
                    symptoms = ["dyspnea"]
            elif day == 54:
                spo2 = 87.0
                sbp = 178.0
                dbp = 102.0
                hr = 110.0
                rr = 28.0
                symptoms = ["chest_pain", "dyspnea"]
                is_event = 1
            elif day > 54:
                sbp = rng.normal(132.0, 4.0)
                spo2 = rng.normal(94.5, 0.9)
                hr = rng.normal(76.0, 3.0)

        # -------------------------------------------------------------
        # Physical / physiological bounding safeguards
        # -------------------------------------------------------------
        sbp = max(sbp, dbp + 12.0)
        spo2 = min(100.0, max(75.0, spo2))
        temp = min(42.0, max(34.0, temp))

        reading = VitalsReading(
            patientId=patient_id,
            recordedAt=dt,
            systolicBp=round(float(sbp), 1),
            diastolicBp=round(float(dbp), 1),
            heartRate=round(float(hr), 1),
            spo2=round(float(spo2), 1),
            temperatureC=round(float(temp), 1),
            respirationRate=round(float(rr), 1),
            spo2Scale=spo2_scale,
            onSupplementalOxygen=on_o2,
            requestingRole=role,
            symptomFlags=symptoms,
        )
        readings.append(reading)
        labels.append(is_event)

    return readings, labels
