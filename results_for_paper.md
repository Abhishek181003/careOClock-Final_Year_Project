# CareOClock Hybrid Risk-Classification Engine: Empirical Benchmark and Evaluation Results

This document compiles the empirical evaluation results, clinical specifications, experimental parameters, statistical hypothesis tests, parameter sweeps, and known limitations of the **CareOClock Hybrid Risk-Classification Engine**. All reported values are extracted directly from the actual benchmark output files, configuration manifests, and production source code in the repository. No values have been rounded, estimated, or invented beyond the exact representations in the underlying source files.

---

## 1. System Description

CareOClock is an AI-assisted Clinical Decision Support System (CDSS) designed for remote monitoring of community-dwelling older adults [`doc/CareOClock_AI_Technical_Specification.md#L9-L16`]. The risk-scoring engine operates as a two-layer hybrid architecture running inside a standalone Python/FastAPI microservice [`ai-engine/app/main.py#L1-L35`]:

```
                     ┌─────────────────────────────────────────┐
                     │          Incoming Daily Vitals          │
                     │ (SBP, DBP, HR, SpO2, Temp, RR, Symptoms)│
                     └────────────────────┬────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  ▼                                               ▼
     ┌─────────────────────────┐                     ┌─────────────────────────┐
     │         LAYER 1         │                     │         LAYER 2         │
     │  Deterministic NEWS2    │                     │  Personalized Anomaly   │
     │  Clinical Rule Engine   │                     │  Detection (Rolling 28d)│
     │  — Always Active        │                     │  — Active >= 7 Days     │
     └────────────┬────────────┘                     └────────────┬────────────┘
                  │                                               │
                  │  Layer 1 Risk Tier             Layer 2 Tier   │
                  │  (Low/Mod/High/Crit)           (max |z| tier) │
                  └───────────────────────┬───────────────────────┘
                                          ▼
                             ┌─────────────────────────┐
                             │       AGGREGATOR        │
                             │  maxSeverity(L1, L2)    │
                             │  Composite Score (0-100)│
                             └────────────┬────────────┘
                                          ▼
                             ┌─────────────────────────┐
                             │  Dual-View Explanations │
                             │  (Patient vs Clinician) │
                             └─────────────────────────┘
```

### 1.1 Layer 1: Deterministic Clinical Rule Engine (Modified Home-NEWS)
- **Clinical Derivation**: Derived from the UK Royal College of Physicians National Early Warning Score 2 (NEWS2, 2017) [`ai-engine/app/scoring/home_news.py#L3-L12`].
- **Operating Mode**: Evaluates a single vitals reading statelessly in complete isolation with zero historical database dependencies [`ai-engine/app/scoring/home_news.py#L5-L7`].
- **Bedside Adaptation**: Consciousness level (AVPU scale) is deliberately excluded because it requires bedside clinical assessment and cannot be reliably self-reported by elderly patients at home [`doc/CareOClock_AI_Technical_Specification.md#L83-L84`, `ai-engine/app/scoring/home_news.py#L7`].
- **Physiological Vitals Scored**:
  - **Systolic Blood Pressure (SBP)**: $\le 90.0\text{ mmHg} \to 3$ points (Red Flag: shock); $91.0\text{--}100.0\text{ mmHg} \to 2$ points; $101.0\text{--}110.0\text{ mmHg} \to 1$ point; $111.0\text{--}219.0\text{ mmHg} \to 0$ points; $\ge 220.0\text{ mmHg} \to 3$ points (Red Flag: crisis) [`ai-engine/app/scoring/home_news.py#L89-L100`].
  - **Heart Rate (HR)**: $\le 40.0\text{ bpm} \to 3$ points (Red Flag: severe bradycardia); $41.0\text{--}50.0\text{ bpm} \to 1$ point; $51.0\text{--}90.0\text{ bpm} \to 0$ points; $91.0\text{--}110.0\text{ bpm} \to 1$ point; $111.0\text{--}130.0\text{ bpm} \to 2$ points; $\ge 131.0\text{ bpm} \to 3$ points (Red Flag: severe tachycardia) [`ai-engine/app/scoring/home_news.py#L102-L115`].
  - **Respiratory Rate (RR)**: Optional field. Scored when present: $\le 8.0\text{ br/min} \to 3$ points (Red Flag); $9.0\text{--}11.0\text{ br/min} \to 1$ point; $12.0\text{--}20.0\text{ br/min} \to 0$ points; $21.0\text{--}24.0\text{ br/min} \to 2$ points; $\ge 25.0\text{ br/min} \to 3$ points (Red Flag) [`ai-engine/app/scoring/home_news.py#L32-L48`].
  - **Oxygen Saturation ($\text{SpO}_2$) Scale 1 (General)**: $\le 91.0\% \to 3$ points (Red Flag); $92.0\text{--}93.0\% \to 2$ points; $94.0\text{--}95.0\% \to 1$ point; $\ge 96.0\% \to 0$ points [`ai-engine/app/scoring/home_news.py#L50-L59`].
  - **Oxygen Saturation ($\text{SpO}_2$) Scale 2 (Hypercapnic Respiratory Failure / COPD Target 88–92%)**: $\le 83.0\% \to 3$ points (Red Flag); $84.0\text{--}85.0\% \to 2$ points; $86.0\text{--}87.0\% \to 1$ point; $88.0\text{--}92.0\% \to 0$ points. If $\ge 93.0\%$ on room air $\to 0$ points; if on supplemental oxygen: $93.0\text{--}94.0\% \to 1$ point; $95.0\text{--}96.0\% \to 2$ points; $\ge 97.0\% \to 3$ points (Red Flag) [`ai-engine/app/scoring/home_news.py#L61-L87`].
  - **Body Temperature**: $\le 35.0^\circ\text{C} \to 3$ points (Red Flag: hypothermia); $35.1\text{--}36.0^\circ\text{C} \to 1$ point; $36.1\text{--}38.0^\circ\text{C} \to 0$ points; $38.1\text{--}39.0^\circ\text{C} \to 1$ point; $\ge 39.1^\circ\text{C} \to 2$ points [`ai-engine/app/scoring/home_news.py#L117-L128`].
  - **Diastolic Blood Pressure (DBP)**: Scored in combination with SBP for hypertension staging and pulse pressure validation ($SBP - DBP \ge 10.0\text{ mmHg}$) [`ai-engine/app/scoring/constants.py#L17`, `ai-engine/app/scoring/home_news.py#L130-L163`].
- **CareOClock Additions (Isolated from NEWS2 Subtotal)**:
  - **AHA/ACC 2017 Hypertension Staging**: Stage 1 ($SBP \ge 130.0$ or $DBP \ge 80.0\text{ mmHg}$) $\to 1$ point; Stage 2 ($SBP \ge 140.0$ or $DBP \ge 90.0\text{ mmHg}$) $\to 2$ points; Hypertensive Urgency ($SBP \ge 180.0$ or $DBP \ge 120.0\text{ mmHg}$) $\to 3$ points + clinical escalator [`ai-engine/app/scoring/constants.py#L76-L81`, `ai-engine/app/scoring/home_news.py#L130-L163`].
  - **Closed 7-Symptom Vocabulary**: `dyspnea`, `chest_pain`, `dizziness`, `confusion`, `swelling`, `reduced_urine`, `cough_fever` [`ai-engine/app/scoring/constants.py#L32-L68`]. Each valid symptom contributes 1 point, capped at 4 (`SYMPTOM_CAP = 4`) [`ai-engine/app/scoring/constants.py#L70`]. Independent clinical escalators (`chest_pain`, `confusion`) automatically force the tier to at least High [`ai-engine/app/scoring/constants.py#L71`, `ai-engine/app/scoring/home_news.py#L238-L242`].
  - **Medication Adherence**: 7-day Proportion of Days Covered (PDC). PDC $\ge 0.80 \to 0$ points; $0.50 \le \text{PDC} < 0.80 \to 1$ point; $\text{PDC} < 0.50 \to 2$ points [`ai-engine/app/scoring/constants.py#L86-L87`, `ai-engine/app/scoring/home_news.py#L177-L190`].
- **Thresholds & Tier Classification**:
  - Proportional threshold scaling via `get_tier_thresholds(max_possible_news2)` [`ai-engine/app/scoring/home_news.py#L192-L213`]:
    - With RR ($\text{maximum possible score} = 15$): Moderate $\ge 1$, High $\ge 4$, Critical $\ge 6$ [`ai-engine/app/scoring/home_news.py#L202`].
    - Without RR ($\text{maximum possible score} = 12$): Moderate $\ge 1$, High $\ge 3$, Critical $\ge 5$ [`ai-engine/app/scoring/home_news.py#L203`].
  - Single-Parameter Red Flag: Any single physiological parameter scoring 3 points escalates the tier to at least High [`ai-engine/app/scoring/home_news.py#L238-L242`].
  - Care Additions Burden Scaling: Care subtotal $\ge 3$ points bumps tier by $+1$; care subtotal $\ge 6$ points bumps tier by $+2$ [`ai-engine/app/scoring/home_news.py#L244-L256`].

### 1.2 Layer 2: Personalized Anomaly Detection (Personal Baseline Engine)
- **Operating Principle**: Evaluates incoming readings against the patient's own historical rolling baseline over a trailing window of 7 to 28 distinct calendar days (`MATURE_WINDOW_DAYS = 28`, `MIN_DAYS_TO_ACTIVATE = 7`) [`ai-engine/app/scoring/constants.py#L106-L109`].
- **Cold-Start Guardrail**: If historical data has fewer than 7 distinct calendar days, Layer 2 returns status `"not yet available"` and `layer2_tier = "not yet available"` without guessing or imputing scores [`ai-engine/app/scoring/constants.py#L132`, `ai-engine/app/scoring/personalized_anomaly.py#L370-L398`].
- **Privacy Boundary**: Evaluates strictly within the individual patient's data with zero cross-patient data pooling or leakage [`ai-engine/app/scoring/personalized_anomaly.py#L17`, `ai-engine/app/models/vitals.py#L282-L293`].
- **Feature Matrix Structure**:
  - History readings strictly preceding today's UTC date are aggregated into calendar days [`ai-engine/app/scoring/personalized_anomaly.py#L127-L198`].
  - For each active vital sign ($D \le 6$), three features are constructed per day: `[day_mean, day_variability, missing_flag]`, forming an $N \times (3 \times D)$ matrix ($N \le 28$) [`ai-engine/app/scoring/personalized_anomaly.py#L235-L287`].
  - Temporal forward-fill imputation is applied for missing single-day readings, falling back to window mean for initial missing days [`ai-engine/app/scoring/personalized_anomaly.py#L269-L283`].
  - Normalized via per-patient `StandardScaler` [`ai-engine/app/scoring/personalized_anomaly.py#L406-L412`].
- **Algorithms**:
  - **Authoritative Clinical Arm (Statistical Baseline)**: Evaluates standardized $z$-score deviation per active vital:
    $$z = \frac{x_{\text{today}} - \mu_{\text{baseline}}}{\sigma_{\text{baseline}}}$$
    If $\sigma_{\text{baseline}} < 10^{-4}$, deviation is clamped to $\pm 3.5$ based on the sign of departure [`ai-engine/app/scoring/personalized_anomaly.py#L450-L458`]. The maximum absolute deviation $\max |z|$ determines `layer2_tier` via `classify_anomaly_tier`:
    - Low: $|z| < 1.8$ (within $\approx 96\text{th}$ percentile of normal variation) [`ai-engine/app/scoring/constants.py#L121`, `ai-engine/app/scoring/personalized_anomaly.py#L312-L328`]
    - Moderate: $1.8 \le |z| < 2.5$ (outside $96\text{th}$ percentile) [`ai-engine/app/scoring/constants.py#L122`, `ai-engine/app/scoring/personalized_anomaly.py#L312-L328`]
    - High: $2.5 \le |z| < 3.5$ (outside $98.8\text{th}$ percentile) [`ai-engine/app/scoring/constants.py#L123`, `ai-engine/app/scoring/personalized_anomaly.py#L312-L328`]
    - Critical: $|z| \ge 3.5$ (outside $99.95\text{th}$ percentile) [`ai-engine/app/scoring/constants.py#L124`, `ai-engine/app/scoring/personalized_anomaly.py#L312-L328`]
  - **Machine Learning Benchmark Arms (Recorded in `evaluation_metadata`)**:
    - `IsolationForest`: `n_estimators = 100` (`DEFAULT_N_ESTIMATORS = 100`), `contamination = 0.05` (`CONTAMINATION = 0.05`), `random_state = 42` (`RANDOM_SEED = 42`) [`ai-engine/app/scoring/constants.py#L103-L118`, `ai-engine/app/scoring/personalized_anomaly.py#L414-L423`].
    - `LocalOutlierFactor`: `novelty = True`, `contamination = 0.05`, `n_neighbors = min(20, max(1, n_samples - 1))` [`ai-engine/app/scoring/personalized_anomaly.py#L425-L435`].

### 1.3 Aggregation and Final Alert Decision
When Layer 1 and Layer 2 results are returned to the Node.js/Express backend, the aggregator engine combines them [`server/src/services/aggregatorService.js#L1-L170`]:
- **Decision Rule**:
  $$\text{overallTier} = \maxSeverity(\text{tier}_1, \text{tier}_2)$$
  where $\text{SEVERITY\_ORDER} = \{\text{Low}: 0, \text{Moderate}: 1, \text{High}: 2, \text{Critical}: 3\}$ [`server/src/services/aggregatorService.js#L4-L27`].
- **Alert Trigger**: An alert is raised if $\text{overallTier} \ge \text{Moderate}$ (rank $\ge 1$) [`server/src/services/aggregatorService.js#L4-L27`, `ai-engine/benchmarks/comparative_benchmark.py#L198-L199`].
- **Traffic Light Color Code**: Green for Low; Amber for Moderate; Red for High and Critical [`server/src/services/aggregatorService.js#L30-L43`].
- **Monotone Composite Score ($0\text{--}100$)**: Computed via `computeOverallScore` for queue triage sorting:
  $$\text{overallScore} = \min\left(100, \text{round}\left(\text{base} + \text{l1Norm} + \text{careNorm} + \text{l2Norm}\right)\right)$$
  where $\text{base} = \text{TIER\_RANK}[\text{overallTier}] \times 25$ ($0, 25, 50, 75$), $\text{l1Norm} \in [0, 10]$, $\text{careNorm} \in [0, 2.5]$, and $\text{l2Norm} \in [0, 12.5]$ scaled from $\min(|\maxAbsZ|/4.0, 1.0) \times 12.5$ [`server/src/services/aggregatorService.js#L49-L70`].

---

## 2. The 5 Compared Methods

The 5 compared algorithmic arms evaluated in the benchmark suite [`ai-engine/benchmarks/comparative_benchmark.py#L6-L12`]:

1. **Layer 1 only (Modified Home-NEWS)**: Deterministic, population-based clinical rule engine evaluating single-reading NEWS2 physiological parameters, AHA/ACC hypertension stages, and symptom escalators without historical baseline data [`ai-engine/benchmarks/comparative_benchmark.py#L7`].
2. **Layer 2 IF only (Isolation Forest)**: Machine learning unsupervised anomaly detection arm fitting a per-patient `IsolationForest` ($100$ trees, $0.05$ contamination) on the scaled $28$-day feature matrix, flagging anomalies via continuous decision function [`ai-engine/benchmarks/comparative_benchmark.py#L8`].
3. **Hybrid (Production CareOClock)**: Multi-layer clinical decision rule combining Layer 1 and Layer 2 via $\maxSeverity(\text{Layer 1}, \text{Layer 2})$ (evaluating alerts at tier $\ge \text{Moderate}$), paired with dual-layer physiological explanations [`ai-engine/benchmarks/comparative_benchmark.py#L9`].
4. **Naive z-score**: Continuous statistical baseline proxy using the maximum absolute standardized deviation ($\max |z|$) across active vitals against the patient's rolling $28$-day mean and standard deviation, triggering alerts at $|z| \ge 1.8$ [`ai-engine/benchmarks/comparative_benchmark.py#L10`].
5. **LOF baseline (Local Outlier Factor)**: Unsupervised density-based anomaly detection baseline fitting a novelty-detection `LocalOutlierFactor` ($k = \min(20, N-1)$ nearest neighbors, $0.05$ contamination) on the per-patient scaled feature matrix [`ai-engine/benchmarks/comparative_benchmark.py#L11`].

---

## 3. Experiment Setup

### 3.1 Cohort Architecture and Synthetic Personas
- **Number of Synthetic Personas**: $24$ evidence-based clinical personas ($P1$ through $P24$) [`ai-engine/benchmarks/cohort_config.py#L36-L277`]. A $5$-persona baseline subset ($P1$ through $P5$) was also evaluated for baseline comparison [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L45`].
- **Random Seeds**: $30$ independent random seeds ($s \in [101, 130]$) [`ai-engine/benchmarks/results/benchmark_manifest.json#L13-L45`].
- **Simulated Duration**: $75$ consecutive calendar days per persona trajectory [`ai-engine/benchmarks/results/benchmark_manifest.json#L46`].
- **Cold-Start Period**: Days 1 through 7 are reserved for baseline data accumulation [`ai-engine/benchmarks/results/benchmark_manifest.json#L50`].
- **Evaluated Duration**: $68$ days per persona per seed (Days 8 through 75) [`ai-engine/benchmarks/results/benchmark_manifest.json#L47`].
- **Total Longitudinal Evaluations**:
  - Expanded cohort: $24 \text{ personas} \times 68 \text{ days} \times 30 \text{ seeds} = 48,960 \text{ evaluations}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L48`].
  - 5-persona baseline: $5 \text{ personas} \times 68 \text{ days} \times 30 \text{ seeds} = 10,200 \text{ evaluations}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L47`].
- **Seed Invariance Guarantee**: Personas are generated using `np.random.default_rng(seed + persona_id * 1000)`, guaranteeing that Personas 1–5 produce bit-for-bit identical readings across runs regardless of whether Personas 6–24 are included [`ai-engine/benchmarks/cohort_config.py#L8-L13`, `ai-engine/benchmarks/cohort_config.py#L287-L290`].

### 3.2 Clinical Persona Specifications and Parameter Sources
Every persona baseline and trajectory is parameterized from peer-reviewed literature with verified PubMed IDs (PMID) and DOIs [`ai-engine/benchmarks/cohort_config.py#L36-L277`]:

| Persona ID | Clinical Archetype & Category | Baseline Hemodynamics (Mean ± SD) | Injected Deterioration Episode & Timing | Clinical Literature Citation & Identifiers |
| :--- | :--- | :--- | :--- | :--- |
| **P1** | Healthy Normotensive Elderly (Stable Inlier) | SBP $122.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $68.0 \pm 3.0$, $\text{SpO}_2$ $97.0 \pm 0.8$, Temp $36.6 \pm 0.15$, RR $16.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | O'Brien et al. (2003) *BMJ* 326(7384):291, PMID: 12574043; Kjeldsen et al. (1998) *J Hypertens* 16(12):1901–1910, PMID: 9886877 [`ai-engine/benchmarks/cohort_config.py#L37-L46`] |
| **P2** | Stable Chronic COPD (Stable Inlier) | SBP $124.0 \pm 4.0$, DBP $79.0 \pm 3.0$, HR $75.0 \pm 4.0$, $\text{SpO}_2$ Scale 2: $90.0 \pm 0.9$, RR $21.0 \pm 1.2$ | None (all 75 days inliers, $y=0$) | Royal College of Physicians (2017) *NEWS2 Guidelines*, ISBN: 978-1-86016-682-2; GOLD Report (2024) [`ai-engine/benchmarks/cohort_config.py#L47-L56`] |
| **P3** | Acute Hypertensive Crisis (Acute Crisis) | SBP $122.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $68.0 \pm 3.0$ (Days 1–50) | Day 51: SBP $215.0 \pm 2.0$, DBP $122.0 \pm 2.0$, HR $108.0 \pm 3.0$, symptom `chest_pain` ($y=1$) | Whelton et al. (2018) *Hypertension* 71(6):e13–e115, PMID: 29133356; Chobanian et al. (2003) *JAMA* 289(19):2560–2572, PMID: 12748199 [`ai-engine/benchmarks/cohort_config.py#L57-L66`] |
| **P4** | Acute Sepsis / Severe Infection (Acute Crisis) | Temp $36.6 \pm 0.15$, HR $68.0 \pm 3.0$, $\text{SpO}_2$ $97.0 \pm 0.8$, RR $16.0 \pm 1.0$ (Days 1–45) | Day 46: Temp $39.2 \pm 0.2^\circ\text{C}$, HR $125.0 \pm 3.0$, $\text{SpO}_2$ $88.0 \pm 1.0\%$, RR $28.0 \pm 1.5$, symptoms `confusion` + `dyspnea` ($y=1$) | Singer et al. (2016) *JAMA* 315(8):801–810, PMID: 26903338, DOI: 10.1001/jama.2016.0287; RCP NEWS2 (2017) [`ai-engine/benchmarks/cohort_config.py#L67-L76`] |
| **P5** | Insidious Cardiovascular Drift (Gradual Drift) | SBP $122.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $68.0 \pm 3.0$, RR $16.0 \pm 1.0$ (Days 1–40) | Days 41–55: Daily drift $+2.5\text{ SBP}$, $+1.0\text{ DBP}$, $+1.5\text{ HR}$, $+0.4\text{ RR/day}$, symptom `dyspnea` on Day $\ge 48$ ($y=1$). Day 56: Acute crash SBP $192.0$, DBP $112.0$, HR $115.0$, $\text{SpO}_2$ $91.0\%$, RR $26.0$, symptoms `dyspnea` + `chest_pain` ($y=1$) | Subbe et al. (2001) *QJM* 94(10):521–529, PMID: 11588210, DOI: 10.1093/qjmed/94.10.521; Franklin et al. (1999) *Circulation* 100(4):354–360, PMID: 10421594 [`ai-engine/benchmarks/cohort_config.py#L77-L86`] |
| **P6** | Well-Controlled Essential Hypertension (Stable Inlier) | SBP $132.0 \pm 3.8$, DBP $82.0 \pm 2.8$, HR $66.0 \pm 3.2$, $\text{SpO}_2$ $96.5 \pm 0.8$, Temp $36.5 \pm 0.15$, RR $15.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Whelton et al. (2018) *Hypertension* 71(6):e13–e115, PMID: 29133356; SPRINT Research Group (2015) *N Engl J Med* 373(22):2103–2116, PMID: 26551272 [`ai-engine/benchmarks/cohort_config.py#L87-L96`] |
| **P7** | Mild Baseline Tachycardia / Sedentary Senior (Stable Inlier) | SBP $126.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $86.0 \pm 4.2$, $\text{SpO}_2$ $96.0 \pm 0.9$, Temp $36.6 \pm 0.15$, RR $17.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Palatini et al. (2006) *J Hypertens* 24(4):603–610, PMID: 16531782, DOI: 10.1097/01.hjh.0000217841.48866.70 [`ai-engine/benchmarks/cohort_config.py#L97-L106`] |
| **P8** | Controlled Type 2 Diabetes Baseline (Stable Inlier) | SBP $128.0 \pm 4.0$, DBP $80.0 \pm 3.0$, HR $72.0 \pm 3.5$, $\text{SpO}_2$ $97.2 \pm 0.7$, Temp $36.7 \pm 0.15$, RR $16.0 \pm 1.1$ | None (all 75 days inliers, $y=0$) | American Diabetes Association (2024) *Diabetes Care* 47(Suppl 1):S179–S218, PMID: 38078592, DOI: 10.2337/dc24-S010 [`ai-engine/benchmarks/cohort_config.py#L107-L116`] |
| **P9** | Athletic Senior with Physiological Sinus Bradycardia (Stable Inlier) | SBP $116.0 \pm 3.0$, DBP $72.0 \pm 2.2$, HR $54.0 \pm 2.5$, $\text{SpO}_2$ $98.0 \pm 0.6$, Temp $36.4 \pm 0.12$, RR $14.0 \pm 0.8$ | None (all 75 days inliers, $y=0$) | D'Souza, Sharma & Boyett (2015) *J Physiol* 593(8):1749–1751, PMID: 25877864; Northcote et al. (1989) *Br Heart J* 61(2):155–160, PMID: 2923749 [`ai-engine/benchmarks/cohort_config.py#L117-L126`] |
| **P10** | Insidious Hypoxic Drift / Pleural Effusion (Gradual Drift) | SBP $126.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $72.0 \pm 3.0$, $\text{SpO}_2$ $96.5 \pm 0.8$, RR $16.5 \pm 1.0$ (Days 1–40) | Days 41–55: $\text{SpO}_2$ $-0.40\%/\text{day}$ (to $90.5\%$), RR $+0.50/\text{day}$ (to $24.0$), HR $+0.8/\text{day}$, symptom `dyspnea` on Day $\ge 49$ ($y=1$). Day 56: Crash $\text{SpO}_2$ $86.0\%$, RR $28.0$, HR $98.0$ ($y=1$) | Porcel & Light (2006) *Am Fam Physician* 73(7):1211–1220, PMID: 16623250; Light RW (2002) *N Engl J Med* 346(25):1971–1977, PMID: 12075060 [`ai-engine/benchmarks/cohort_config.py#L127-L136`] |
| **P11** | Insidious Low-Grade Pyrexia / Occult Bacteremia (Gradual Drift) | SBP $124.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $70.0 \pm 3.0$, Temp $36.6 \pm 0.15$ (Days 1–42) | Days 43–57: Temp $+0.09^\circ\text{C}/\text{day}$ (to $37.95^\circ\text{C}$), HR $+1.2/\text{day}$ (to $88$), symptom `fatigue` on Day $\ge 50$ ($y=1$). Day 58: Septic crash Temp $39.1^\circ\text{C}$, HR $118.0$, SBP $94.0$, DBP $58.0$, symptoms `fatigue` + `confusion` ($y=1$) | Norman DC (2000) *Clin Infect Dis* 31(1):148–151, PMID: 10913413; High et al. (2009) *Clin Infect Dis* 48(2):149–171, PMID: 19072714 [`ai-engine/benchmarks/cohort_config.py#L137-L146`] |
| **P12** | Insidious Isolated Systolic Hypertensive Creep (Gradual Drift) | SBP $130.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $68.0 \pm 3.0$ (Days 1–40) | Days 41–55: SBP $+2.8\text{ mmHg/day}$ (to $172\text{ mmHg}$), DBP flat $78\text{ mmHg}$ (pulse pressure $94\text{ mmHg}$), symptom `headache` on Day $\ge 49$ ($y=1$). Day 56: SBP $206.0$, DBP $88.0$, HR $82.0$, symptoms `headache` + `dizziness` ($y=1$) | Franklin et al. (1999) *Circulation* 100(4):354–360, PMID: 10421594; Franklin et al. (2001) *Circulation* 103(9):1245–1249, PMID: 11238268 [`ai-engine/benchmarks/cohort_config.py#L147-L156`] |
| **P13** | Isolated Acute Delirium Escalator Crisis (Acute Crisis) | SBP $128.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $70.0 \pm 3.0$, $\text{SpO}_2$ $96.0 \pm 0.8$, RR $16.0 \pm 1.0$ (Days 1–47) | Day 48: Acute delirium with SBP $146.0 \pm 3.0$, HR $92.0 \pm 3.0$, $\text{SpO}_2$ $94.0 \pm 0.8\%$, RR $20.0 \pm 1.0$, symptom `confusion` ($y=1$) | Inouye, Westendorp & Saczynski (2014) *Lancet* 383(9920):911–922, PMID: 23992774; RCP NEWS2 (2017) [`ai-engine/benchmarks/cohort_config.py#L157-L166`] |
| **P14** | Acute Exacerbation of COPD on Scale 2 (Acute Crisis) | $\text{SpO}_2$ Scale 2: $90.0 \pm 0.9$, RR $21.0 \pm 1.2$, HR $76.0 \pm 3.0$ (Days 1–51) | Day 52: $\text{SpO}_2$ collapse $81.0 \pm 1.0\%$, RR $32.0 \pm 1.5$, HR $118.0 \pm 3.0$, symptom `dyspnea` ($y=1$) | GOLD Report (2024); Wedzicha & Seemungal (2007) *Lancet* 370(9589):786–796, PMID: 17765527 [`ai-engine/benchmarks/cohort_config.py#L167-L176`] |
| **P15** | Acute Hypotensive Shock / Syncope (Acute Crisis) | SBP $125.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $70.0 \pm 3.0$ (Days 1–43) | Day 44: SBP $78.0 \pm 2.0$, DBP $48.0 \pm 2.0$, HR $122.0 \pm 3.0$, symptom `dizziness` ($y=1$) | Vincent & De Backer (2013) *N Engl J Med* 369(18):1726–1734, PMID: 24171518; RCP NEWS2 (2017) [`ai-engine/benchmarks/cohort_config.py#L177-L186`] |
| **P16** | Labile Blood Pressure / Autonomic Volatility (Hard Negative) | SBP $128.0 \pm 7.8$, DBP $76.0 \pm 5.5$, HR $70.0 \pm 3.5$, $\text{SpO}_2$ $96.5 \pm 0.8$, Temp $36.6 \pm 0.15$, RR $16.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Parati et al. (2013) *Nat Rev Cardiol* 10(3):143–155, PMID: 23399973; Parati et al. (2018) *J Hypertens* 36(8):1622–1633, PMID: 29847427 [`ai-engine/benchmarks/cohort_config.py#L187-L196`] |
| **P17** | High Respiratory Sinus Arrhythmia (Hard Negative) | SBP $120.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $72.0 \pm 8.2$ (range 56–88 bpm), $\text{SpO}_2$ $97.0 \pm 0.8$, Temp $36.5 \pm 0.15$, RR $15.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Task Force of ESC and NASPE (1996) *Circulation* 93(5):1043–1065, PMID: 8598068 [`ai-engine/benchmarks/cohort_config.py#L197-L206`] |
| **P18** | Chronic Borderline Tachypneic with Kyphoscoliosis (Hard Negative) | SBP $122.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $74.0 \pm 3.0$, $\text{SpO}_2$ $95.5 \pm 1.0$, RR $19.5 \pm 1.8$ (frequently touches $21\text{--}22$) | None (all 75 days inliers, $y=0$) | Bergofsky EH (1979) *Am Rev Respir Dis* 119(4):643–669, PMID: 377283 [`ai-engine/benchmarks/cohort_config.py#L207-L216`] |
| **P19** | Single-Day Exertional / Dehydration Blip (Transient Blip) | SBP $122.0 \pm 3.5$, DBP $78.0 \pm 2.5$, HR $68.0 \pm 3.0$, Temp $36.6 \pm 0.15$, RR $15.5 \pm 1.0$ (Days 1–38, 40–75) | Day 39: Transient SBP $108.0 \pm 3.0$, DBP $68.0 \pm 2.5$, HR $98.0 \pm 3.0$, Temp $37.3 \pm 0.15$, symptom `fatigue` ($y=0$). Returns Day 40. | Popowski et al. (2001) *Med Sci Sports Exerc* 33(5):747–753, PMID: 11323547 [`ai-engine/benchmarks/cohort_config.py#L217-L226`] |
| **P20** | Single-Day Post-Vaccine Reactogenicity Blip (Transient Blip) | SBP $120.0 \pm 3.5$, DBP $76.0 \pm 2.5$, HR $68.0 \pm 3.0$, Temp $36.6 \pm 0.15$, RR $15.0 \pm 1.0$ (Days 1–48, 50–75) | Day 49: Transient Temp $37.8 \pm 0.15^\circ\text{C}$, HR $84.0 \pm 3.0$, symptom `fatigue` ($y=0$). Returns Day 50. | Cunningham et al. (2016) *N Engl J Med* 375(11):1019–1032, PMID: 27626517; Hervé et al. (2019) *NPJ Vaccines* 4:39, PMID: 31583123 [`ai-engine/benchmarks/cohort_config.py#L227-L236`] |
| **P21** | Oldest-Old Normotensive Female (Stable Inlier) | Age 89; SBP $128.0 \pm 4.0$, DBP $74.0 \pm 3.0$, HR $72.0 \pm 3.5$, $\text{SpO}_2$ $95.8 \pm 0.8$, Temp $36.4 \pm 0.15$, RR $16.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Gomolin et al. (2005) *J Am Geriatr Soc* 53(12):2170–2172, PMID: 16398904; Beckett et al. (2008) *N Engl J Med* 358(18):1887–1898, PMID: 18378519 [`ai-engine/benchmarks/cohort_config.py#L237-L246`] |
| **P22** | Treated Stage 1 Hypertension with Diurnal Stability (Stable Inlier) | Age 66; SBP $136.0 \pm 3.8$, DBP $84.0 \pm 2.8$, HR $68.0 \pm 3.0$, $\text{SpO}_2$ $96.5 \pm 0.8$, Temp $36.5 \pm 0.15$, RR $15.0 \pm 1.0$ | None (all 75 days inliers, $y=0$) | Whelton et al. (2018) *Hypertension* 71(6):e13–e115, PMID: 29133356 [`ai-engine/benchmarks/cohort_config.py#L247-L256`] |
| **P23** | Creeping Pyrexic Drift with Urosepsis (Gradual Drift) | Age 84; Temp $36.5 \pm 0.15^\circ\text{C}$, HR $70.0 \pm 3.0$ (Days 1–44) | Days 45–53: Temp $+0.14^\circ\text{C}/\text{day}$ (to $37.76^\circ\text{C}$), HR $+1.5/\text{day}$ (to $83.5$), symptom `confusion` on Day $\ge 51$ ($y=1$). Day 54: Uroseptic crash Temp $39.0^\circ\text{C}$, SBP $88.0$, DBP $54.0$, HR $114.0$, RR $26.0$, symptom `confusion` ($y=1$) | High et al. (2009) *Clin Infect Dis* 48(2):149–171, PMID: 19072714; Juthani-Mehta et al. (2009) *J Am Geriatr Soc* 57(6):963–970, PMID: 19490243 [`ai-engine/benchmarks/cohort_config.py#L257-L266`] |
| **P24** | Combined Cardiopulmonary Congestive Drift (Gradual Drift) | Age 76; SBP $134.0 \pm 3.5$, $\text{SpO}_2$ $96.0 \pm 0.8$, HR $72.0 \pm 3.0$, RR $16.5 \pm 1.0$ (Days 1–38) | Days 39–53: $\text{SpO}_2$ $-0.35\%/\text{day}$ (to $90.75\%$), SBP $+2.0\text{ mmHg/day}$ (to $164$), HR $+1.2/\text{day}$, RR $+0.4/\text{day}$, symptom `dyspnea` on Day $\ge 47$ ($y=1$). Day 54: ADHF crash $\text{SpO}_2$ $87.0\%$, SBP $178.0$, DBP $102.0$, HR $110.0$, RR $28.0$, symptoms `chest_pain` + `dyspnea` ($y=1$) | McDonagh et al. (2021) *Eur Heart J* 42(36):3599–3726, PMID: 34447992 [`ai-engine/benchmarks/cohort_config.py#L267-L276`] |

### 3.3 Metric Definitions
All evaluation metrics are computed strictly according to the day-level longitudinal definitions in `comparative_benchmark.py` [`ai-engine/benchmarks/comparative_benchmark.py#L236-L259`]:
- **Ground Truth Label ($y_t \in \{0, 1\}$)**: For each evaluated calendar day $t \in [8, 75]$, $y_t = 1$ denotes a clinically active adverse event or deterioration day, while $y_t = 0$ denotes a stable inlier day [`ai-engine/benchmarks/comparative_benchmark.py#L138`, `ai-engine/benchmarks/cohort_config.py#L284-L286`].
- **Alert Decision ($a_t \in \{0, 1\}$)**:
  - **Layer 1**: $a_t = 1$ if `layer1_tier_rank >= 1` (Moderate, High, or Critical) [`ai-engine/benchmarks/comparative_benchmark.py#L167`].
  - **Layer 2 IF**: $a_t = 1$ if `isolation_forest_is_anomaly == True` (prediction $== -1$) [`ai-engine/benchmarks/comparative_benchmark.py#L186`].
  - **Hybrid**: $a_t = 1$ if $\max(\text{l1\_tier\_rank}, \text{l2\_tier\_rank}) \ge 1$ [`ai-engine/benchmarks/comparative_benchmark.py#L198-L199`].
  - **Naive z-score**: $a_t = 1$ if $\max |z| \ge 1.8$ [`ai-engine/benchmarks/comparative_benchmark.py#L190`].
  - **LOF**: $a_t = 1$ if `lof_is_anomaly == True` (prediction $== -1$) [`ai-engine/benchmarks/comparative_benchmark.py#L195`].
- **Detected Day / True Positive (TP)**: $a_t = 1 \land y_t = 1$ (`tp = np.sum((al == 1) & (y_true == 1))`) [`ai-engine/benchmarks/comparative_benchmark.py#L241`].
- **False Alarm / False Positive (FP)**: $a_t = 1 \land y_t = 0$ (`fp = np.sum((al == 1) & (y_true == 0))`) [`ai-engine/benchmarks/comparative_benchmark.py#L242`].
- **False Negative (FN)**: $a_t = 0 \land y_t = 1$ (`fn = np.sum((al == 0) & (y_true == 1))`) [`ai-engine/benchmarks/comparative_benchmark.py#L243`].
- **True Negative (TN)**: $a_t = 0 \land y_t = 0$ (`tn = np.sum((al == 0) & (y_true == 0))`) [`ai-engine/benchmarks/comparative_benchmark.py#L244`].
- **Sensitivity (Recall)**:
  $$\text{Sensitivity} = \frac{\text{TP}}{\text{TP} + \text{FN}}$$
  [`ai-engine/benchmarks/comparative_benchmark.py#L246`].
- **Specificity**:
  $$\text{Specificity} = \frac{\text{TN}}{\text{TN} + \text{FP}}$$
  [`ai-engine/benchmarks/comparative_benchmark.py#L247`].
- **False Positive Rate (FPR)**:
  $$\text{FPR} = 1.0 - \text{Specificity} = \frac{\text{FP}}{\text{FP} + \text{TN}}$$
  [`ai-engine/benchmarks/comparative_benchmark.py#L248`].
- **False Alerts Per Patient Per Week**:
  $$\text{Alerts/Patient/Week} = \left(\frac{\text{FP}}{\text{total\_inlier\_days}}\right) \times 7.0$$
  [`ai-engine/benchmarks/comparative_benchmark.py#L249`].
- **AUROC**: Area Under the Receiver Operating Characteristic curve computed via `roc_auc_score(y_true, scores)` [`ai-engine/benchmarks/comparative_benchmark.py#L239`]. Continuous score definitions:
  - Layer 1: $\text{news2\_subtotal} + (3.0 \text{ if red flag}) + (4.0 \text{ if chest pain})$ [`ai-engine/benchmarks/comparative_benchmark.py#L162-L166`].
  - Layer 2 IF: $-\text{decision\_function}$ (higher = more anomalous) [`ai-engine/benchmarks/comparative_benchmark.py#L184-L185`].
  - Hybrid: $\text{score}_{L1} + \max(0.0, z - 1.0) \times 2.0$ [`ai-engine/benchmarks/comparative_benchmark.py#L200`].
  - Naive z-score: $\max |z|$ [`ai-engine/benchmarks/comparative_benchmark.py#L189`].
  - LOF: $-\text{decision\_function}$ [`ai-engine/benchmarks/comparative_benchmark.py#L193-L194`].
- **AUPRC**: Area Under the Precision-Recall Curve computed via `average_precision_score(y_true, scores)` [`ai-engine/benchmarks/comparative_benchmark.py#L240`].
- **Precision**: NOT AVAILABLE as a separate scalar in `benchmark_results.csv` (AUPRC is computed and reported).
- **F1 Score**: NOT AVAILABLE in `benchmark_results.csv`.
- **Episode Detection Rate**: NOT AVAILABLE as a distinct episode-level metric; longitudinal evaluation operates at day-level sensitivity.
- **Early-Warning Lead Time**: In Persona 5 (insidious drift starting Day 41, acute crash at Day 56), lead time is defined as:
  $$\text{Lead Days} = 56 - \text{day}_{\text{first\_alert}}$$
  measuring days of advance warning before acute collapse [`ai-engine/benchmarks/comparative_benchmark.py#L203-L215`].
- **Detection Delay**: Lead time before Day 56 crash is measured. Delay from start of drift (Day 41) is $\text{day}_{\text{first\_alert}} - 41 = 15 - \text{Lead Days}$. Detection delay as a separate standalone output column is NOT AVAILABLE.

---

## 4. Benchmark Results

### 4.1 Primary Benchmark Table: 24-Persona Cohort (30 Random Seeds, N = 48,960)
All values are reported as **Mean ± 95% Confidence Interval** directly from `benchmark_results.csv` and `benchmark_manifest.json` [`ai-engine/benchmarks/results/benchmark_results.csv#L1-L6`, `ai-engine/benchmarks/results/benchmark_manifest.json#L54-L60`, `ai-engine/benchmarks/results/benchmark_manifest.json#L95-L206`].

| Algorithmic Arm | AUROC (Mean ± 95% CI) | AUPRC (Mean ± 95% CI) | Recall / Sensitivity (Mean ± 95% CI) | Specificity (Mean ± 95% CI) | False Alerts / Patient / Week (Mean ± 95% CI) | Persona 5 Early-Warning Lead Time (Mean ± 95% CI) | Precision | F1 Score | Episode Detection Rate | Specificity Status |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Layer 1 only** | $0.6624 \pm 0.0054$ [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] | $0.3063 \pm 0.0055$ [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] | $0.5172 \pm 0.0075$ [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] | $0.8282 \pm 0.0025$ [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] | $1.2026 \pm 0.0173$ [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] | $8.2 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L55`] | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | [OK] Moderate [`ai-engine/benchmarks/results/benchmark_results.csv#L2`] |
| **Layer 2 IF only** | $0.8659 \pm 0.0081$ [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] | $0.4518 \pm 0.0158$ [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] | $0.6126 \pm 0.0153$ [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] | $0.9195 \pm 0.0024$ [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] | $0.5638 \pm 0.0167$ [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] | $12.9 \pm 0.5\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L56`] | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | [OK] High [`ai-engine/benchmarks/results/benchmark_results.csv#L3`] |
| **Hybrid (Production)** | $0.8704 \pm 0.0055$ [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] | $0.4721 \pm 0.0085$ [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] | $0.9302 \pm 0.0088$ [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] | $0.5033 \pm 0.0040$ [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] | $3.4768 \pm 0.0277$ [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] | $14.4 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L57`] | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | [WARN] Low (< 60%) [`ai-engine/benchmarks/results/benchmark_results.csv#L4`] |
| **Naive z-score** | $0.8736 \pm 0.0050$ [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] | $0.3838 \pm 0.0067$ [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] | $0.9242 \pm 0.0082$ [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] | $0.5970 \pm 0.0035$ [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] | $2.8211 \pm 0.0247$ [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] | $14.4 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L58`] | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | [WARN] Low (< 60%) [`ai-engine/benchmarks/results/benchmark_results.csv#L5`] |
| **LOF baseline** | $0.8501 \pm 0.0102$ [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] | $0.5163 \pm 0.0118$ [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] | $0.7389 \pm 0.0186$ [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] | $0.8830 \pm 0.0025$ [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] | $0.8193 \pm 0.0177$ [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] | $13.5 \pm 0.4\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L59`] | NOT AVAILABLE | NOT AVAILABLE | NOT AVAILABLE | [OK] High [`ai-engine/benchmarks/results/benchmark_results.csv#L6`] |

*(Raw data saved to `paper_data/benchmark_results_24personas.csv`)*

### 4.2 Baseline Benchmark Table: 5-Persona Baseline Cohort (30 Random Seeds, N = 10,200)
For historical baseline comparison, the identical benchmark was run on the original 5-persona cohort [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L1-L6`, `ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L95-L200`]:

| Algorithmic Arm | AUROC (Mean ± 95% CI) | AUPRC (Mean ± 95% CI) | Recall / Sensitivity (Mean ± 95% CI) | Specificity (Mean ± 95% CI) | False Alerts / Patient / Week (Mean ± 95% CI) | Persona 5 Lead Time (Mean ± 95% CI) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| **Layer 1 only** | $0.6674 \pm 0.0137$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L2`] | $0.2801 \pm 0.0143$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L2`] | $0.6074 \pm 0.0121$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L2`] | $0.8069 \pm 0.0055$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L2`] | $1.3514 \pm 0.0387$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L2`] | $8.2 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L54`] |
| **Layer 2 IF only** | $0.9204 \pm 0.0124$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L3`] | $0.6207 \pm 0.0330$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L3`] | $0.7852 \pm 0.0330$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L3`] | $0.9137 \pm 0.0059$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L3`] | $0.6043 \pm 0.0414$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L3`] | $12.9 \pm 0.5\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L55`] |
| **Hybrid (Production)** | $0.9012 \pm 0.0089$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L4`] | $0.5334 \pm 0.0222$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L4`] | $0.9463 \pm 0.0159$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L4`] | $0.4977 \pm 0.0064$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L4`] | $3.5159 \pm 0.0448$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L4`] | $14.4 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L56`] |
| **Naive z-score** | $0.9127 \pm 0.0085$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L5`] | $0.5159 \pm 0.0197$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L5`] | $0.9463 \pm 0.0159$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L5`] | $0.6129 \pm 0.0077$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L5`] | $2.7094 \pm 0.0538$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L5`] | $14.4 \pm 0.3\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L57`] |
| **LOF baseline** | $0.9189 \pm 0.0140$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L6`] | $0.6941 \pm 0.0196$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L6`] | $0.8685 \pm 0.0258$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L6`] | $0.8837 \pm 0.0053$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L6`] | $0.8138 \pm 0.0374$ [`ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv#L6`] | $13.5 \pm 0.4\text{ days}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L58`] |

*(Raw data saved to `paper_data/benchmark_results_5personas.csv`)*

---

## 5. Statistical Hypothesis Testing

Statistical significance was evaluated across matched seeds ($N = 30$) using the **Paired Wilcoxon Signed-Rank Test** (`scipy.stats.wilcoxon`) with two-sided alternatives on AUROC, corrected for family-wise error rate across $m = 4$ comparisons using the **Holm-Bonferroni step-down procedure** [`ai-engine/benchmarks/comparative_benchmark.py#L381-L431`].

### 5.1 Primary 24-Persona Cohort Statistical Tests
Extracted directly from `benchmark_manifest.json` [`ai-engine/benchmarks/results/benchmark_manifest.json#L61-L94`]:

| Comparison | Wilcoxon $W$ Statistic | Raw $p$-value | Rank-Biserial Effect Size ($r$) | Holm-Bonferroni Adjusted $p$-value | Statistically Significant at $\alpha = 0.05$? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hybrid vs Layer 1** | $0.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L64`] | $1.862645149230957 \times 10^{-9}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L65`] | $1.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L66`] | $0.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L67`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest.json#L68`] |
| **Hybrid vs Layer 2 IF** | $168.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L72`] | $0.19092952087521553$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L73`] | $0.2$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L74`] | $0.19093$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L75`] | **False** [`ai-engine/benchmarks/results/benchmark_manifest.json#L76`] |
| **Hybrid vs Naive z-score** | $71.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L80`] | $0.0005054883658885956$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L81`] | $-0.533$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L82`] | $0.001011$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L83`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest.json#L84`] |
| **Hybrid vs LOF** | $34.0$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L88`] | $6.917864084243774 \times 10^{-6}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L89`] | $0.8$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L90`] | $2.1 \times 10^{-5}$ [`ai-engine/benchmarks/results/benchmark_manifest.json#L91`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest.json#L92`] |

### 5.2 Baseline 5-Persona Cohort Statistical Tests
Extracted directly from `benchmark_manifest_5personas_baseline.json` [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L60-L93`]:

| Comparison | Wilcoxon $W$ Statistic | Raw $p$-value | Rank-Biserial Effect Size ($r$) | Holm-Bonferroni Adjusted $p$-value | Statistically Significant at $\alpha = 0.05$? |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **Hybrid vs Layer 1** | $0.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L63`] | $1.862645149230957 \times 10^{-9}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L64`] | $1.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L65`] | $0.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L66`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L67`] |
| **Hybrid vs Layer 2 IF** | $84.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L71`] | $0.0015832837671041489$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L72`] | $-0.4$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L73`] | $0.003167$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L74`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L75`] |
| **Hybrid vs Naive z-score** | $21.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L79`] | $8.326023817062378 \times 10^{-7}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L80`] | $-0.733$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L81`] | $2.0 \times 10^{-6}$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L82`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L83`] |
| **Hybrid vs LOF** | $107.0$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L87`] | $0.008705463260412216$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L88`] | $-0.4$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L89`] | $0.008705$ [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L90`] | **True** [`ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json#L91`] |

*(Raw data saved to `paper_data/statistical_tests_wilcoxon_holm.csv`)*

---

## 6. Parameter Sweep Results

A systematic sensitivity grid sweep was executed across $24$ hyperparameter combinations:
- Contamination rates: $\text{contamination} \in \{0.01, 0.03, 0.05, 0.07, 0.10, 0.15\}$ ($6$ levels) [`ai-engine/benchmarks/results/sweep_results.csv#L1-L26`]
- Tree counts: $\text{n\_estimators} \in \{30, 50, 75, 100\}$ ($4$ levels) [`ai-engine/benchmarks/results/sweep_results.csv#L1-L26`]
- Evaluated over $8$ seeds (`seeds_evaluated = 8`) across the $24$-persona cohort [`ai-engine/benchmarks/results/sweep_results.csv#L2-L25`].

### 6.1 Complete 24-Grid Hyperparameter Sweep Table
Extracted directly from `sweep_results.csv` [`ai-engine/benchmarks/results/sweep_results.csv#L1-L25`]:

| Contamination | n_estimators | L2 IF AUROC | L2 IF AUPRC | L2 IF Sens | L2 IF Spec | L2 IF Alerts/Wk | Hybrid AUROC | Hybrid AUPRC | Hybrid Sens | Hybrid Spec | Hybrid Alerts/Wk | P5 Lead Time L2 (days) | P5 Lead Time Hybrid (days) | Fit Latency (ms) |
| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- |
| $0.01$ | $30$ | $0.8324$ | $0.2814$ | $0.3171$ | $0.9575$ | $0.2977$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $9.38$ | $14.62$ | $110.934$ |
| $0.01$ | $50$ | $0.8442$ | $0.3396$ | $0.3711$ | $0.9614$ | $0.2704$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $10.62$ | $14.62$ | $167.779$ |
| $0.01$ | $75$ | $0.8540$ | $0.3619$ | $0.3947$ | $0.9612$ | $0.2716$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $10.62$ | $14.62$ | $232.980$ |
| $0.01$ | $100$ | $0.8557$ | $0.3730$ | $0.4013$ | $0.9610$ | $0.2727$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $10.62$ | $14.62$ | $267.419$ |
| $0.03$ | $30$ | $0.8410$ | $0.3195$ | $0.4316$ | $0.9422$ | $0.4048$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $10.88$ | $14.62$ | $111.826$ |
| $0.03$ | $50$ | $0.8545$ | $0.3944$ | $0.5092$ | $0.9456$ | $0.3809$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $11.75$ | $14.62$ | $167.082$ |
| $0.03$ | $75$ | $0.8656$ | $0.4225$ | $0.5118$ | $0.9463$ | $0.3757$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $11.88$ | $14.62$ | $230.429$ |
| $0.03$ | $100$ | $0.8701$ | $0.4369$ | $0.5224$ | $0.9465$ | $0.3746$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $11.88$ | $14.62$ | $267.488$ |
| $0.05$ | $30$ | $0.8364$ | $0.3266$ | $0.5211$ | $0.9154$ | $0.5921$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $11.75$ | $14.62$ | $112.836$ |
| $0.05$ | $50$ | $0.8520$ | $0.4159$ | $0.5961$ | $0.9182$ | $0.5727$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.12$ | $14.62$ | $169.572$ |
| $0.05$ | $75$ | $0.8612$ | $0.4442$ | $0.6039$ | $0.9193$ | $0.5647$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.12$ | $14.62$ | $234.187$ |
| $0.05$ | $100$ | $0.8670$ | $0.4615$ | $0.6197$ | $0.9201$ | $0.5596$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.12$ | $14.62$ | $270.913$ |
| $0.07$ | $30$ | $0.8369$ | $0.3403$ | $0.5895$ | $0.8903$ | $0.7680$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.25$ | $14.62$ | $112.781$ |
| $0.07$ | $50$ | $0.8563$ | $0.4443$ | $0.6618$ | $0.8935$ | $0.7458$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.62$ | $14.62$ | $168.791$ |
| $0.07$ | $75$ | $0.8635$ | $0.4715$ | $0.6658$ | $0.8952$ | $0.7338$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.88$ | $14.62$ | $233.845$ |
| $0.07$ | $100$ | $0.8682$ | $0.4812$ | $0.6776$ | $0.8953$ | $0.7332$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.75$ | $14.62$ | $270.555$ |
| $0.10$ | $30$ | $0.8398$ | $0.3492$ | $0.6605$ | $0.8546$ | $1.0179$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $12.62$ | $14.62$ | $113.153$ |
| $0.10$ | $50$ | $0.8608$ | $0.4634$ | $0.7237$ | $0.8569$ | $1.0020$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.50$ | $14.62$ | $168.206$ |
| $0.10$ | $75$ | $0.8657$ | $0.4951$ | $0.7342$ | $0.8582$ | $0.9923$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.75$ | $14.62$ | $234.804$ |
| $0.10$ | $100$ | $0.8705$ | $0.5033$ | $0.7342$ | $0.8579$ | $0.9946$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.75$ | $14.62$ | $268.059$ |
| $0.15$ | $30$ | $0.8453$ | $0.3601$ | $0.7421$ | $0.7920$ | $1.4562$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.25$ | $14.62$ | $113.326$ |
| $0.15$ | $50$ | $0.8643$ | $0.4801$ | $0.7803$ | $0.7909$ | $1.4636$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.62$ | $14.62$ | $169.446$ |
| $0.15$ | $75$ | $0.8694$ | $0.5215$ | $0.7868$ | $0.7939$ | $1.4426$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.75$ | $14.62$ | $235.432$ |
| $0.15$ | $100$ | $0.8744$ | $0.5294$ | $0.7961$ | $0.7963$ | $1.4261$ | $0.8793$ | $0.4858$ | $0.9382$ | $0.5068$ | $3.4522$ | $13.75$ | $14.62$ | $272.220$ |

*(Raw data saved to `paper_data/parameter_sweep_results.csv`)*

### 6.2 Pareto Optimal Configurations & Production Selection
From `sweep_pareto_analysis.json` [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L1-L173`]:
- **Default Production Configuration**:
  - $\text{contamination} = 0.05$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L165`]
  - $\text{n\_estimators} = 100$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L166`]
  - L2 IF AUROC: $0.8670$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L167`]
  - L2 IF Specificity: $0.9201$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L168`]
  - L2 IF Sensitivity: $0.6197$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L169`]
  - Average fit time: $270.913\text{ ms}$ [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L170`]
- **Pareto Recommendation Rationale**: Configuration $(\text{contamination}=0.05, \text{n\_estimators}=100)$ resides on the empirical Pareto frontier, maintaining robust specificity ($0.9201$) and low false alarm burden ($0.5596\text{ alerts/wk}$) in Layer 2. Increasing contamination to $0.10$ or $0.15$ degrades specificity to $0.8579$ and $0.7963$ ($0.9946\text{--}1.4261\text{ alerts/wk}$) without improving the Hybrid arm's sensitivity ($0.9382$), which is already saturated by Layer 1's population rules [`ai-engine/benchmarks/results/sweep_pareto_analysis.json#L172`].
- **Timing Pilot Measurements**: From `sweep_pilot_receipt.json` on 16 hardware cores [`ai-engine/benchmarks/results/sweep_pilot_receipt.json#L3-L25`]:
  - Serial 1-worker execution: $232.527\text{ s}$ ($14.0\text{ fits/s}$) [`ai-engine/benchmarks/results/sweep_pilot_receipt.json#L18-L19`]
  - Parallel 4-worker execution: $180.984\text{ s}$ ($1.285\times\text{ speedup}$) [`ai-engine/benchmarks/results/sweep_pilot_receipt.json#L20-L21`]
  - Parallel 8-worker execution: $181.392\text{ s}$ ($1.282\times\text{ speedup}$, $18.0\text{ fits/s}$) [`ai-engine/benchmarks/results/sweep_pilot_receipt.json#L22-L24`]
  - Total fits across 24 combinations $\times 8$ seeds: $313,344\text{ fits}$ ($192\text{ batched tasks}$) [`ai-engine/benchmarks/results/sweep_pilot_receipt.json#L27-L28`].

---

## 7. Known Limitations and Negative Findings

### 7.1 Hybrid Operational Specificity Trade-Off
- **Finding**: In the 24-persona cohort, the Hybrid decision rule ($\max(\text{Layer 1}, \text{Layer 2})$) achieves a high sensitivity of $0.9302 \pm 0.0088$ ($93.0\%$) and $14.4 \pm 0.3\text{ days}$ early-warning lead time, but incurs an operational specificity of $0.5033 \pm 0.0040$ ($50.3\%$) with $3.4768 \pm 0.0277$ false alerts per patient per week (`[WARN] Low (< 60%)`) [`ai-engine/benchmarks/results/benchmark_results.csv#L4`].
- **Root Cause**: The OR-combination acts as a safety-first union. When high-variance benign inliers deviate from population norms—most notably Persona 18 (kyphoscoliosis with chronic compensatory tachypnea $19.5 \pm 1.8\text{ br/min}$ crossing the NEWS2 2-point threshold $\ge 21$) [`ai-engine/benchmarks/cohort_config.py#L207-L216`]—Layer 1 raises an alert. While Layer 2 correctly recognizes this as the patient's personal baseline ($|z| < 1.8$), the OR-combination allows Layer 1's false alerts to leak into the Hybrid tier [`ai-engine/benchmarks/results/benchmark_manifest.json#L207`].
- **Mitigation in CareOClock**: CareOClock pairs every alert with transparent, dual-layer physiological explanations so clinicians can immediately differentiate single-vital departures from multi-system instability [`server/src/services/aggregatorService.js#L1`, `ai-engine/benchmarks/results/benchmark_manifest.json#L207`].

### 7.2 Incompatibility with the Public TIHM Dementia Dataset
- **Finding**: The public TIHM (Technology Integrated Health Management; Palermo et al., *Sci Data* 2023, PMID: 37723171) dataset was formally evaluated for external benchmark validation but found structurally incompatible [`ai-engine/benchmarks/tihm_feasibility_assessment.md#L1-L23`].
- **Fatal Data Gaps**:
  1. **Absence of Respiratory Rate**: Respiration rate—the most sensitive early physiological indicator in NEWS2—is completely absent from TIHM sensor hardware [`ai-engine/benchmarks/tihm_feasibility_assessment.md#L55-L67`].
  2. **High Longitudinal Sparsity**: Peripheral check-in adherence in dementia participants yielded missingness exceeding $45\%$ (mean blood pressure adherence $\approx 52\%$, temperature $\approx 38\%$), with $<18\%$ of participants maintaining contiguous 28-day windows without $\ge 3$-day gaps [`ai-engine/benchmarks/tihm_feasibility_assessment.md#L78-L86`]. This repeatedly triggers CareOClock's 7-day cold-start gate, preventing sustained Layer 2 evaluation [`ai-engine/benchmarks/tihm_feasibility_assessment.md#L86`].

### 7.3 Concurrency and Process Scaling Bottlenecks (NFR2 SLA)
- **Finding**: Under concurrent burst traffic (e.g., 50–100 morning check-in arrivals), single-worker in-process execution failed the $<800\text{ ms}$ latency SLA (`nfr2_sla_met = False`) due to Python's Global Interpreter Lock (GIL) serializing CPU-bound scikit-learn model fitting [`ai-engine/benchmarks/results/worker_scaling_results.csv#L2-L3`]:
  - 50 concurrent requests: $p50 = 6196.8\text{ ms}$, $p95 = 7094.0\text{ ms}$, throughput $7.0\text{ req/s}$ [`ai-engine/benchmarks/results/worker_scaling_results.csv#L2`].
  - 100 concurrent requests: $p50 = 13325.0\text{ ms}$, $p95 = 14945.0\text{ ms}$, throughput $6.6\text{ req/s}$ [`ai-engine/benchmarks/results/worker_scaling_results.csv#L3`].
- **Process Pool Scaling**: Testing multi-worker Uvicorn process pools ($W \in \{2, 4, 8, 12\}$) increased peak throughput to $26.5\text{ req/s}$ ($W = 8$ workers, 100 concurrency) [`ai-engine/benchmarks/results/worker_scaling_results.csv#L9`], but burst $p95$ latency remained between $2745.7\text{ ms}$ ($W=4, C=50$) and $6841.6\text{ ms}$ ($W=12, C=50$) [`ai-engine/benchmarks/results/worker_scaling_results.csv#L6-L11`]. Consequently, NFR2 is met during steady-state arrivals ($<300\text{ ms}$ per fit) but requires horizontal node replication behind a load balancer during simultaneous morning burst check-ins [`Implementation_Plan/implementation_plan_AI_Model_Evaluation#L183-L186`].

### 7.4 Cold-Start Window Delay
- During days 1 through 6, Layer 2 cannot evaluate anomalies and returns `"not yet available"`, leaving patients solely protected by Layer 1 until day 7 [`ai-engine/app/scoring/constants.py#L106`, `ai-engine/app/scoring/personalized_anomaly.py#L370-L398`].

---

## 8. Plain-Language Explanation of Sections 1–5

### 8.1 How the Two Layers Work Together
Imagine two clinical observers monitoring an older adult living at home:
1. **Layer 1 (The Emergency Rulebook)**: Layer 1 is like an emergency medical protocol. It checks every reading against standard clinical thresholds used in hospitals (NEWS2). If a patient's blood pressure spikes to 215, or their oxygen drops to 88%, or they report acute chest pain, Layer 1 immediately flags an alert. It doesn't need to know the patient's past history to know that this is dangerous right now.
2. **Layer 2 (The Personal Family Doctor)**: Layer 2 acts like a doctor who has known the patient for years. It observes the patient's vitals over the past 4 weeks (28 days) to learn what is normal for *them*. A marathon runner in their 60s might naturally have a resting heart rate of 54 beats per minute; Layer 1 might think this is abnormally low, but Layer 2 knows it is their healthy baseline. Conversely, if a patient's temperature gradually creeps up from 36.6°C to 37.8°C over 10 days, Layer 1 might remain silent because 37.8°C is not yet a high fever. But Layer 2 notices the continuous upward drift away from their personal normal and sounds an early warning.
3. **The Hybrid Combination**: When both layers are combined, CareOClock takes whichever layer reports the higher risk level (`maxSeverity`). If either the Emergency Rulebook OR the Personal Doctor is concerned, an alert is raised.

### 8.2 Why 5 Methods Were Compared
To scientifically prove whether this two-layer design is genuinely better, we compared five different methods:
- **Layer 1 alone**: Tests what happens if we only use standard hospital rules without personalization.
- **Layer 2 alone (Isolation Forest)**: Tests what happens if we only use an unsupervised machine learning anomaly detector.
- **Hybrid**: CareOClock's full system combining both layers.
- **Naive z-score**: A simpler mathematical baseline that only asks how many standard deviations a vital sign is away from average.
- **LOF (Local Outlier Factor)**: A standard density-based machine learning algorithm used as a reference benchmark.

### 8.3 Why Synthetic Personas Were Tested Over 75 Days
In medical research, testing an AI system directly on vulnerable real-world seniors before verifying its safety is unethical. Furthermore, public datasets from hospitals do not represent home-dwelling seniors. We designed 24 clinical "personas"—detailed physiological profiles based on published medical studies—covering healthy seniors, patients with chronic conditions (COPD, hypertension, diabetes), subtle gradual declines (slow infections, fluid in the lungs), acute emergencies (septic collapse, hypertensive crisis), and harmless fluctuations (dehydration after exercise, vaccine side effects). Simulating 75 consecutive days across 30 random variations (48,960 total test days) allowed us to verify how well each method detects true emergencies while ignoring harmless blips.

### 8.4 What the Results Mean in Human Terms
- **Catching 93% of Adverse Events**: The Hybrid system detected **93.0%** of all deterioration days. In contrast, using standard hospital rules alone (Layer 1) caught only **51.7%** of deteriorations. Personalization almost halved the number of missed warnings.
- **Two Weeks of Advance Warning (Lead Time)**: In Persona 5—a senior experiencing gradual cardiovascular decline—hospital rules gave only **8.2 days** of warning before an acute collapse. The Hybrid system gave **14.4 days** of advance warning—giving family members and nurses over two full weeks to intervene before an emergency room visit was necessary.
- **The Trade-Off (False Alarms vs. Safety)**: Because the Hybrid system is biased toward safety ("never miss a deterioration"), it produces about **3.5 alerts per patient per week**, compared to only **0.56 alerts per week** for Layer 2 alone. To prevent doctors and caregivers from tuning out alerts (alarm fatigue), CareOClock displays clear, plain-language explanations showing exactly which vital signs changed and by how much, allowing a nurse to see within seconds whether an alert is an isolated blip or a serious multi-vital decline.

### 8.5 What the Statistical Tests Prove
We ran statistical significance tests (Paired Wilcoxon signed-rank tests with Holm-Bonferroni correction) to verify that these results were not just random luck:
- The improvement of Hybrid over Layer 1 is overwhelming ($p < 10^{-8}$, rank-biserial effect $+1.0$), proving that adding personal baseline anomaly detection decisively outperforms static population rules.
- The comparison between Hybrid and Layer 2 IF ($p \approx 0.191$) confirms that while Layer 2 achieves higher specificity, the Hybrid combination is required to maintain the high sensitivity ($93.0\%$ vs $61.3\%$) necessary for clinical patient safety.

---

## 9. Index of Exported Data Artifacts

All underlying tabular data have been exported to the `paper_data/` directory in the project root:

| File Name | Description | Key Source Files |
| :--- | :--- | :--- |
| [`paper_data/benchmark_results_24personas.csv`](file:///e:/CareoClock/paper_data/benchmark_results_24personas.csv) | Primary 24-persona benchmark comparative results with 95% CIs across 5 arms | `ai-engine/benchmarks/results/benchmark_results.csv`, `ai-engine/benchmarks/results/benchmark_manifest.json` |
| [`paper_data/benchmark_results_5personas.csv`](file:///e:/CareoClock/paper_data/benchmark_results_5personas.csv) | Baseline 5-persona benchmark comparative results with 95% CIs across 5 arms | `ai-engine/benchmarks/results/benchmark_results_5personas_baseline.csv`, `ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json` |
| [`paper_data/statistical_tests_wilcoxon_holm.csv`](file:///e:/CareoClock/paper_data/statistical_tests_wilcoxon_holm.csv) | Paired Wilcoxon signed-rank tests and Holm-Bonferroni corrected $p$-values | `ai-engine/benchmarks/results/benchmark_manifest.json`, `ai-engine/benchmarks/results/benchmark_manifest_5personas_baseline.json` |
| [`paper_data/parameter_sweep_results.csv`](file:///e:/CareoClock/paper_data/parameter_sweep_results.csv) | 24-grid parameter sweep results (contamination $\times$ n_estimators) | `ai-engine/benchmarks/results/sweep_results.csv`, `ai-engine/benchmarks/results/sweep_pareto_analysis.json` |
| [`paper_data/worker_scaling_results.csv`](file:///e:/CareoClock/paper_data/worker_scaling_results.csv) | Concurrency burst latency and multi-worker process scaling benchmark data | `ai-engine/benchmarks/results/worker_scaling_results.csv`, `ai-engine/benchmarks/results/worker_scaling_manifest.json` |
