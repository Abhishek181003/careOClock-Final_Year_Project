import { useState, useEffect, useMemo, useCallback } from 'react';
import {
  Activity,
  Heart,
  Wind,
  Thermometer,
  Plus,
  Info,
  Clock,
  ShieldCheck,
  Sparkles,
  X,
  Search,
  CheckCircle2,
  HelpCircle,
  RefreshCw,
  AlertTriangle,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import RiskBadge from '../../components/RiskBadge';
import VitalsEntryForm from '../../components/VitalsEntryForm';

// Clinical reference ranges for normal healthy bands (elderly home monitoring)
const METRIC_CONFIG = {
  bloodPressure: {
    label: 'Blood Pressure',
    unit: 'mmHg',
    icon: Activity,
    color: '#0D9488',
    secondaryColor: '#0284C7',
    normalMin: 90,
    normalMax: 120, // Systolic normal
    normalDiaMin: 60,
    normalDiaMax: 80, // Diastolic normal
    yMin: 50,
    yMax: 180,
    description: 'Systolic (target < 120) and Diastolic (target < 80) arterial pressure.',
  },
  heartRate: {
    label: 'Heart Rate',
    unit: 'bpm',
    icon: Heart,
    color: '#E11D48',
    normalMin: 60,
    normalMax: 100,
    yMin: 45,
    yMax: 130,
    description: 'Resting pulse. Expected healthy baseline: 60–100 bpm.',
  },
  spo2: {
    label: 'Blood Oxygen (SpO2)',
    unit: '%',
    icon: Wind,
    color: '#0284C7',
    normalMin: 95,
    normalMax: 100,
    yMin: 85,
    yMax: 100,
    description: 'Arterial blood oxygen saturation. Optimal: 95–100%. Alert floor: 92%.',
  },
  temperatureC: {
    label: 'Body Temperature',
    unit: '°C',
    icon: Thermometer,
    color: '#D97706',
    normalMin: 36.1,
    normalMax: 37.2,
    yMin: 35.0,
    yMax: 39.5,
    description: 'Core body temperature. Normal: 36.1–37.2°C. Low-grade fever: 37.3°C+.',
  },
  respirationRate: {
    label: 'Respiration Rate',
    unit: 'br/min',
    icon: Wind,
    color: '#7C3AED',
    normalMin: 12,
    normalMax: 20,
    yMin: 8,
    yMax: 30,
    description: 'Breathing frequency. Expected resting range: 12–20 breaths per minute.',
  },
};

export default function HealthPage() {
  const { user } = useAuth();
  const [vitals, setVitals] = useState([]);
  const [patientId, setPatientId] = useState('');
  const [latestAssessment, setLatestAssessment] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [selectedMetric, setSelectedMetric] = useState('bloodPressure');
  const [timeRange, setTimeRange] = useState(14); // 7, 14, 30 days
  const [isEntryModalOpen, setIsEntryModalOpen] = useState(false);
  const [isAiExplainerOpen, setIsAiExplainerOpen] = useState(false);
  const [slotFilter, setSlotFilter] = useState('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [hoveredPoint, setHoveredPoint] = useState(null);

  // Load real vitals telemetry and real AI assessment directly from MongoDB
  const loadHealthData = useCallback(async () => {
    setIsLoading(true);
    try {
      // 1. Fetch real vitals history
      const vitalsRes = await api.get('/clinical/vitals?limit=50');
      const rawVitals = vitalsRes.data?.vitals || [];
      const pid = vitalsRes.data?.patientId || '';
      if (pid) setPatientId(pid);

      setVitals(rawVitals);

      // 2. Fetch latest real AI assessment
      if (pid) {
        try {
          const assessRes = await api.get(`/clinical/assessments/${pid}?limit=1`);
          const assessments = assessRes.data?.assessments || [];
          if (assessments.length > 0) {
            setLatestAssessment(assessments[0]);
          } else {
            setLatestAssessment(null);
          }
        } catch {
          setLatestAssessment(null);
        }
      } else {
        setLatestAssessment(null);
      }
    } catch (err) {
      console.error('Failed to load health telemetry:', err);
      setVitals([]);
      setLatestAssessment(null);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealthData();
  }, [loadHealthData]);

  const handleVitalsSaved = () => {
    setIsEntryModalOpen(false);
    loadHealthData();
  };

  // Filter real vitals for the chart based on selected time range
  const chartData = useMemo(() => {
    const cutoffDate = new Date();
    cutoffDate.setDate(cutoffDate.getDate() - timeRange);

    const filtered = vitals.filter((v) => new Date(v.recordedAt) >= cutoffDate);
    // Sort chronological (oldest to newest) for SVG chart plotting
    return [...filtered].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
  }, [vitals, timeRange]);

  // Compute stats for the selected metric from real data
  const stats = useMemo(() => {
    if (chartData.length === 0) return null;

    if (selectedMetric === 'bloodPressure') {
      const sysValues = chartData.map((d) => d.systolicBp).filter((v) => typeof v === 'number');
      const diaValues = chartData.map((d) => d.diastolicBp).filter((v) => typeof v === 'number');
      if (sysValues.length === 0) return null;

      const latest = chartData[chartData.length - 1];
      const avgSys = Math.round(sysValues.reduce((a, b) => a + b, 0) / sysValues.length);
      const avgDia = Math.round(diaValues.reduce((a, b) => a + b, 0) / diaValues.length);

      return {
        latestStr: `${latest?.systolicBp} / ${latest?.diastolicBp} mmHg`,
        averageStr: `${avgSys} / ${avgDia} mmHg`,
        minStr: `${Math.min(...sysValues)} / ${Math.min(...diaValues)}`,
        maxStr: `${Math.max(...sysValues)} / ${Math.max(...diaValues)}`,
        status: avgSys <= 120 && avgDia <= 80 ? 'Optimal' : avgSys <= 130 ? 'Normal' : 'Elevated',
      };
    }

    const key = selectedMetric;
    const values = chartData.map((d) => d[key]).filter((v) => typeof v === 'number');
    if (values.length === 0) return null;

    const latestVal = values[values.length - 1];
    const isTemp = selectedMetric === 'temperatureC';
    const avgVal = (values.reduce((a, b) => a + b, 0) / values.length).toFixed(isTemp ? 1 : 0);
    const minVal = Math.min(...values).toFixed(isTemp ? 1 : 0);
    const maxVal = Math.max(...values).toFixed(isTemp ? 1 : 0);
    const cfg = METRIC_CONFIG[selectedMetric];

    const isOptimal = latestVal >= cfg.normalMin && latestVal <= cfg.normalMax;

    return {
      latestStr: `${latestVal} ${cfg.unit}`,
      averageStr: `${avgVal} ${cfg.unit}`,
      minStr: `${minVal} ${cfg.unit}`,
      maxStr: `${maxVal} ${cfg.unit}`,
      status: isOptimal ? 'Optimal' : 'Needs Review',
    };
  }, [chartData, selectedMetric]);

  // Filter written real logs for table view
  const filteredTableVitals = useMemo(() => {
    return vitals.filter((v) => {
      const matchesSlot = slotFilter === 'all' || v.slot === slotFilter;
      const matchesSearch =
        searchQuery === '' ||
        (v.notes && v.notes.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (v.symptomFlags && v.symptomFlags.some((s) => s.toLowerCase().includes(searchQuery.toLowerCase())));
      return matchesSlot && matchesSearch;
    });
  }, [vitals, slotFilter, searchQuery]);

  // SVG Chart Dimensions
  const svgWidth = 800;
  const svgHeight = 260;
  const padding = { top: 25, right: 30, bottom: 40, left: 55 };
  const graphWidth = svgWidth - padding.left - padding.right;
  const graphHeight = svgHeight - padding.top - padding.bottom;

  // Active metric config
  const metricCfg = METRIC_CONFIG[selectedMetric];

  // Helper coordinate mappers
  const getY = (val, min = metricCfg.yMin, max = metricCfg.yMax) => {
    const clamped = Math.min(Math.max(val ?? min, min), max);
    const ratio = (clamped - min) / (max - min);
    return padding.top + graphHeight - ratio * graphHeight;
  };

  const getX = (index, total) => {
    if (total <= 1) return padding.left + graphWidth / 2;
    return padding.left + (index / (total - 1)) * graphWidth;
  };

  // Build SVG Path strings
  const generatePath = (key) => {
    if (chartData.length < 2) return '';
    const points = chartData.map((d, i) => `${getX(i, chartData.length)},${getY(d[key])}`);
    return `M ${points.join(' L ')}`;
  };

  const generateAreaPath = (key) => {
    if (chartData.length < 2) return '';
    const firstX = getX(0, chartData.length);
    const lastX = getX(chartData.length - 1, chartData.length);
    const bottomY = padding.top + graphHeight;
    const points = chartData.map((d, i) => `${getX(i, chartData.length)},${getY(d[key])}`);
    return `M ${firstX},${bottomY} L ${points.join(' L ')} L ${lastX},${bottomY} Z`;
  };

  // Normal zone band coordinates
  const normalTopY = getY(metricCfg.normalMax);
  const normalBottomY = getY(metricCfg.normalMin);
  const normalBandHeight = Math.max(0, normalBottomY - normalTopY);

  // Derived real AI Assessment summary
  const hasRealAssessment = !!latestAssessment;
  const currentTier = latestAssessment?.overallTier?.toLowerCase() || (vitals.length > 0 ? 'stable' : 'pending');
  const currentScore = latestAssessment?.overallScore ?? (vitals.length > 0 ? 0 : 0);
  const currentExplanation =
    latestAssessment?.explanation ||
    latestAssessment?.plainLanguageSummary ||
    (vitals.length > 0
      ? 'Your vital signs are steady and within normal clinical boundaries. Standard twice-daily check-in monitoring is active.'
      : 'No check-ins recorded yet. Click "Record Health Data" to submit your first morning or evening vital reading and initialize your AI evaluation.');
  const baselineStatus = latestAssessment?.baselineStatus || 'building';

  return (
    <div className="space-y-8 text-ink pb-12">
      {/* ── Page Header & Primary Actions ────────────────────────────── */}
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <div>
          <div className="flex items-center gap-2">
            <Activity className="text-brand" size={28} />
            <h1 className="text-h1 font-display text-ink">Health Telemetry & Analytics</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Real-time physiological tracking, personal baseline recognition, and dual-layer AI evaluation.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => loadHealthData()}
            title="Refresh telemetry"
            className="p-2.5 rounded-full border border-line bg-surface hover:bg-paper text-ink-soft hover:text-ink transition-colors"
          >
            <RefreshCw size={18} className={isLoading ? 'animate-spin' : ''} />
          </button>

          <button
            onClick={() => setIsEntryModalOpen(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-brand text-white font-semibold text-base shadow-sm hover:bg-brand-dark transition-all transform active:scale-95"
          >
            <Plus size={20} />
            <span>Record Health Data</span>
          </button>
        </div>
      </div>

      {/* ── Top Prominent AI Engine Result Hero ──────────────────────── */}
      <div className="rounded-ritual bg-surface border border-line p-6 shadow-ritual relative overflow-hidden">
        {/* Subtle decorative background glow */}
        <div className="absolute top-0 right-0 w-80 h-80 bg-brand/5 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-bold uppercase tracking-wider text-brand px-3 py-1 rounded-full bg-brand-light/30 border border-brand/20 flex items-center gap-1.5">
                <Sparkles size={13} />
                Intelligent Health Assessment
              </span>
              <RiskBadge tier={currentTier} size="md" />
              <span className="text-xs text-ink-soft font-medium px-2.5 py-0.5 rounded-full bg-paper border border-line">
                {vitals.length === 0
                  ? 'No Telemetry Recorded'
                  : baselineStatus === 'building'
                  ? `Pattern Building (${vitals.length} check-in${vitals.length === 1 ? '' : 's'})`
                  : 'Personal Baseline Mature'}
              </span>
            </div>

            <p className="text-body font-medium text-ink leading-relaxed">
              {currentExplanation}
            </p>

            {/* Dual Layer Verification Chips */}
            <div className="flex items-center gap-2 flex-wrap pt-1 text-xs">
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-medium ${
                  !hasRealAssessment
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : currentTier === 'critical' || currentTier === 'high'
                    ? 'bg-rose-50 text-rose-800 border-rose-200'
                    : 'bg-emerald-500/10 text-emerald-800 border-emerald-500/20'
                }`}
              >
                <CheckCircle2
                  size={14}
                  className={
                    !hasRealAssessment
                      ? 'text-slate-500'
                      : currentTier === 'critical' || currentTier === 'high'
                      ? 'text-rose-600'
                      : 'text-emerald-600'
                  }
                />
                <span>
                  Layer 1: {hasRealAssessment ? `Home-NEWS2 (${latestAssessment?.layer1?.tier || currentTier.toUpperCase()})` : 'Home-NEWS2 (Awaiting Readings)'}
                </span>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border font-medium ${
                  !hasRealAssessment
                    ? 'bg-slate-100 text-slate-700 border-slate-300'
                    : 'bg-teal-500/10 text-teal-800 border-teal-500/20'
                }`}
              >
                <ShieldCheck size={14} className={!hasRealAssessment ? 'text-slate-500' : 'text-teal-600'} />
                <span>
                  Layer 2: {hasRealAssessment ? (baselineStatus === 'mature' ? 'Personal Baseline ML Active' : 'Baseline ML (Pattern Building)') : 'Personal Baseline ML (Initializing)'}
                </span>
              </div>
            </div>
          </div>

          {/* Right Side: Circular Gauge & Explainer Button */}
          <div className="flex flex-col items-center sm:items-end gap-3 self-stretch md:self-center justify-between border-t md:border-t-0 md:border-l border-line pt-4 md:pt-0 md:pl-6">
            <div className="flex items-center gap-4">
              <div className="relative w-20 h-20 flex items-center justify-center">
                <svg className="w-full h-full transform -rotate-90" viewBox="0 0 36 36">
                  {/* Background track */}
                  <path
                    className="text-line"
                    strokeWidth="3.5"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                  {/* Progress arc */}
                  <path
                    className={
                      currentTier === 'critical'
                        ? 'text-tier-critical'
                        : currentTier === 'high'
                        ? 'text-tier-high'
                        : currentTier === 'moderate'
                        ? 'text-tier-moderate'
                        : 'text-brand'
                    }
                    strokeDasharray={`${Math.min(currentScore, 100)}, 100`}
                    strokeLinecap="round"
                    strokeWidth="3.8"
                    stroke="currentColor"
                    fill="none"
                    d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                  />
                </svg>
                <div className="absolute flex flex-col items-center justify-center text-center">
                  <span className="text-h3 font-display font-extrabold text-ink">{currentScore}</span>
                  <span className="text-[9px] uppercase tracking-wider text-ink-soft font-bold">/ 100</span>
                </div>
              </div>

              <div className="text-left">
                <span className="text-xs text-ink-soft uppercase tracking-wide font-semibold block">
                  Composite Risk
                </span>
                <span className="text-sm font-display font-bold text-ink">
                  {vitals.length === 0
                    ? 'Awaiting Check-in'
                    : currentScore <= 20
                    ? 'Optimal Stable'
                    : currentScore <= 45
                    ? 'Mild Deviation'
                    : currentScore <= 70
                    ? 'Moderate Risk'
                    : 'Critical Attention'}
                </span>
                <p className="text-[11px] text-ink-soft">
                  {hasRealAssessment ? 'Evaluated in real-time' : 'Pending first check-in'}
                </p>
              </div>
            </div>

            <button
              onClick={() => setIsAiExplainerOpen(true)}
              className="inline-flex items-center gap-1.5 text-xs text-brand hover:text-brand-dark font-medium underline transition-colors"
            >
              <HelpCircle size={14} />
              <span>How CareOClock AI analyzes this</span>
            </button>
          </div>
        </div>
      </div>

      {/* ── Visual Telemetry Analytics Section ──────────────────────── */}
      <div className="space-y-4">
        {/* Metric Selector Tabs & Time Range Filter */}
        <div className="flex items-center justify-between gap-4 flex-wrap pb-1">
          <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full">
            {Object.entries(METRIC_CONFIG).map(([key, cfg]) => {
              const Icon = cfg.icon;
              const isSelected = selectedMetric === key;
              return (
                <button
                  key={key}
                  onClick={() => setSelectedMetric(key)}
                  className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold transition-all whitespace-nowrap ${
                    isSelected
                      ? 'bg-brand text-white shadow-sm'
                      : 'bg-surface border border-line text-ink-soft hover:text-ink hover:bg-paper'
                  }`}
                >
                  <Icon size={16} />
                  <span>{cfg.label}</span>
                </button>
              );
            })}
          </div>

          <div className="inline-flex items-center bg-surface border border-line rounded-full p-1 text-xs font-semibold">
            {[7, 14, 30].map((days) => (
              <button
                key={days}
                onClick={() => setTimeRange(days)}
                className={`px-3 py-1 rounded-full transition-colors ${
                  timeRange === days ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
                }`}
              >
                {days} Days
              </button>
            ))}
          </div>
        </div>

        {/* Visual Chart Card */}
        <div className="rounded-ritual bg-surface border border-line p-6 shadow-ritual space-y-6">
          {/* Metric Description & Stat Highlights */}
          <div className="flex items-center justify-between gap-4 flex-wrap border-b border-line pb-4">
            <div>
              <h2 className="text-h2 font-display text-ink flex items-center gap-2">
                <span>{metricCfg.label} Trajectory</span>
              </h2>
              <p className="text-xs text-ink-soft mt-0.5">{metricCfg.description}</p>
            </div>

            {stats ? (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 sm:gap-6 text-left">
                <div className="border-l-2 border-brand pl-3">
                  <span className="text-[11px] text-ink-soft uppercase font-bold block">Current</span>
                  <span className="text-base font-display font-extrabold text-ink">{stats.latestStr}</span>
                </div>
                <div className="border-l-2 border-line pl-3">
                  <span className="text-[11px] text-ink-soft uppercase font-bold block">Average</span>
                  <span className="text-base font-display font-semibold text-ink">{stats.averageStr}</span>
                </div>
                <div className="border-l-2 border-line pl-3">
                  <span className="text-[11px] text-ink-soft uppercase font-bold block">Range (Min–Max)</span>
                  <span className="text-sm font-display text-ink-soft">
                    {stats.minStr} – {stats.maxStr}
                  </span>
                </div>
                <div className="border-l-2 border-emerald-500 pl-3">
                  <span className="text-[11px] text-ink-soft uppercase font-bold block">Status</span>
                  <span className="text-sm font-bold text-emerald-700">{stats.status}</span>
                </div>
              </div>
            ) : (
              <div className="text-xs text-ink-soft italic">
                Awaiting vital data for {timeRange}-day statistical summary.
              </div>
            )}
          </div>

          {/* SVG Chart Canvas or Clean Zero-State */}
          {chartData.length === 0 ? (
            <div className="py-14 px-4 text-center space-y-3 bg-paper/50 rounded-ritual border border-dashed border-line">
              <Activity size={38} className="text-brand/50 mx-auto" />
              <h3 className="text-base font-display font-bold text-ink">
                No {metricCfg.label} Data Recorded in the Last {timeRange} Days
              </h3>
              <p className="text-xs text-ink-soft max-w-md mx-auto leading-relaxed">
                Your physiological trajectory and normal baseline bounds will render here automatically as soon as you
                log your daily morning or evening check-in.
              </p>
              <button
                onClick={() => setIsEntryModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-brand text-white text-xs font-semibold hover:bg-brand-dark transition-colors shadow-sm"
              >
                <Plus size={14} />
                <span>Record Health Check-In</span>
              </button>
            </div>
          ) : (
            <div className="relative w-full overflow-x-auto">
              <svg
                viewBox={`0 0 ${svgWidth} ${svgHeight}`}
                className="w-full h-64 select-none"
                style={{ minWidth: '600px' }}
              >
                <defs>
                  {/* Area Gradient for Selected Metric */}
                  <linearGradient id="metricGradient" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor={metricCfg.color} stopOpacity="0.25" />
                    <stop offset="100%" stopColor={metricCfg.color} stopOpacity="0.0" />
                  </linearGradient>

                  {selectedMetric === 'bloodPressure' && (
                    <linearGradient id="diaGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={metricCfg.secondaryColor} stopOpacity="0.18" />
                      <stop offset="100%" stopColor={metricCfg.secondaryColor} stopOpacity="0.0" />
                    </linearGradient>
                  )}
                </defs>

                {/* Shaded Clinical Normal Reference Band */}
                {metricCfg.normalMin !== undefined && metricCfg.normalMax !== undefined && (
                  <rect
                    x={padding.left}
                    y={normalTopY}
                    width={graphWidth}
                    height={normalBandHeight}
                    fill="#10B981"
                    fillOpacity="0.08"
                    rx="3"
                  />
                )}

                {/* Horizontal Gridlines & Y-Axis Scale */}
                {[0, 0.25, 0.5, 0.75, 1].map((ratio) => {
                  const val = Math.round(metricCfg.yMin + ratio * (metricCfg.yMax - metricCfg.yMin));
                  const yPos = padding.top + graphHeight - ratio * graphHeight;
                  return (
                    <g key={ratio}>
                      <line
                        x1={padding.left}
                        y1={yPos}
                        x2={padding.left + graphWidth}
                        y2={yPos}
                        stroke="#E2E8F0"
                        strokeDasharray="4 4"
                      />
                      <text
                        x={padding.left - 10}
                        y={yPos + 4}
                        textAnchor="end"
                        className="text-[10px] fill-ink-soft font-mono"
                      >
                        {val}
                      </text>
                    </g>
                  );
                })}

                {/* Normal Zone Indicator Label */}
                <text
                  x={padding.left + graphWidth - 8}
                  y={normalTopY + 14}
                  textAnchor="end"
                  className="text-[10px] font-semibold fill-emerald-700 select-none"
                >
                  Normal Range Band ({metricCfg.normalMin}–{metricCfg.normalMax} {metricCfg.unit})
                </text>

                {/* Area Fills (Rendered only when 2+ points exist) */}
                {chartData.length >= 2 &&
                  (selectedMetric === 'bloodPressure' ? (
                    <>
                      <path d={generateAreaPath('systolicBp')} fill="url(#metricGradient)" />
                      <path d={generateAreaPath('diastolicBp')} fill="url(#diaGradient)" />
                    </>
                  ) : (
                    <path d={generateAreaPath(selectedMetric)} fill="url(#metricGradient)" />
                  ))}

                {/* Line Paths (Rendered only when 2+ points exist) */}
                {chartData.length >= 2 &&
                  (selectedMetric === 'bloodPressure' ? (
                    <>
                      {/* Systolic Line */}
                      <path
                        d={generatePath('systolicBp')}
                        fill="none"
                        stroke={metricCfg.color}
                        strokeWidth="2.5"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                      {/* Diastolic Line */}
                      <path
                        d={generatePath('diastolicBp')}
                        fill="none"
                        stroke={metricCfg.secondaryColor}
                        strokeWidth="2"
                        strokeDasharray="5 4"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </>
                  ) : (
                    <path
                      d={generatePath(selectedMetric)}
                      fill="none"
                      stroke={metricCfg.color}
                      strokeWidth="2.5"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  ))}

                {/* Data Points with Hover Tooltip Integration */}
                {chartData.map((d, i) => {
                  const x = getX(i, chartData.length);
                  const isMorning = d.slot === 'morning';
                  const dotColor = isMorning ? '#E8A24D' : '#5B5A8C';

                  if (selectedMetric === 'bloodPressure') {
                    const ySys = getY(d.systolicBp);
                    const yDia = getY(d.diastolicBp);
                    return (
                      <g key={d._id || i}>
                        {/* Systolic Point */}
                        <circle
                          cx={x}
                          y={ySys}
                          r="4.5"
                          fill="#FFFFFF"
                          stroke={metricCfg.color}
                          strokeWidth="2.5"
                          className="cursor-pointer hover:r-6 transition-all"
                          onMouseEnter={() =>
                            setHoveredPoint({ x, y: ySys, reading: d, metricKey: 'bloodPressure' })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                        {/* Diastolic Point */}
                        <circle
                          cx={x}
                          y={yDia}
                          r="4"
                          fill="#FFFFFF"
                          stroke={metricCfg.secondaryColor}
                          strokeWidth="2.5"
                          className="cursor-pointer hover:r-5 transition-all"
                          onMouseEnter={() =>
                            setHoveredPoint({ x, y: yDia, reading: d, metricKey: 'bloodPressure' })
                          }
                          onMouseLeave={() => setHoveredPoint(null)}
                        />
                      </g>
                    );
                  }

                  const val = d[selectedMetric];
                  const y = getY(val);
                  return (
                    <circle
                      key={d._id || i}
                      cx={x}
                      cy={y}
                      r="5"
                      fill="#FFFFFF"
                      stroke={dotColor}
                      strokeWidth="3"
                      className="cursor-pointer hover:r-7 transition-all"
                      onMouseEnter={() => setHoveredPoint({ x, y, reading: d, metricKey: selectedMetric })}
                      onMouseLeave={() => setHoveredPoint(null)}
                    />
                  );
                })}

                {/* X-Axis Dates */}
                {chartData.map((d, i) => {
                  const step = chartData.length > 14 ? 3 : chartData.length > 7 ? 2 : 1;
                  if (i % step !== 0 && i !== chartData.length - 1) return null;
                  const x = getX(i, chartData.length);
                  const dateObj = new Date(d.recordedAt);
                  const dateLabel = dateObj.toLocaleDateString([], { month: 'short', day: 'numeric' });
                  return (
                    <text
                      key={i}
                      x={x}
                      y={padding.top + graphHeight + 20}
                      textAnchor="middle"
                      className="text-[10px] fill-ink-soft font-mono"
                    >
                      {dateLabel}
                    </text>
                  );
                })}
              </svg>

              {/* Hover Tooltip Overlay */}
              {hoveredPoint && (
                <div
                  className="absolute z-20 pointer-events-none p-3 rounded-ritual bg-ink text-white shadow-xl text-xs space-y-1 transform -translate-x-1/2 -translate-y-full mb-3"
                  style={{
                    left: `${(hoveredPoint.x / svgWidth) * 100}%`,
                    top: `${hoveredPoint.y}px`,
                  }}
                >
                  <div className="flex items-center gap-1.5 border-b border-white/20 pb-1 font-semibold">
                    <Clock size={12} />
                    <span>
                      {new Date(hoveredPoint.reading.recordedAt).toLocaleDateString([], {
                        month: 'short',
                        day: 'numeric',
                      })}{' '}
                      • {hoveredPoint.reading.slot === 'morning' ? '🌅 Morning' : '🌆 Evening'}
                    </span>
                  </div>
                  {hoveredPoint.metricKey === 'bloodPressure' ? (
                    <div>
                      <span className="text-white/70">Blood Pressure:</span>{' '}
                      <strong className="text-white font-mono">
                        {hoveredPoint.reading.systolicBp}/{hoveredPoint.reading.diastolicBp} mmHg
                      </strong>
                    </div>
                  ) : (
                    <div>
                      <span className="text-white/70">{METRIC_CONFIG[hoveredPoint.metricKey].label}:</span>{' '}
                      <strong className="text-white font-mono">
                        {hoveredPoint.reading[hoveredPoint.metricKey]} {METRIC_CONFIG[hoveredPoint.metricKey].unit}
                      </strong>
                    </div>
                  )}
                  <div className="text-[10px] text-white/60">
                    Pulse: {hoveredPoint.reading.heartRate} bpm • SpO2: {hoveredPoint.reading.spo2}%
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Chart Legend & Explanation */}
          <div className="flex items-center justify-between gap-4 flex-wrap text-xs text-ink-soft pt-2 border-t border-line">
            <div className="flex items-center gap-4 flex-wrap">
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-dawn" /> Morning Reading
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-full bg-dusk" /> Evening Reading
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-2 rounded-sm bg-emerald-500/20 border border-emerald-500/40" /> Clinically Safe Range
              </span>
            </div>
            <span className="text-[11px] text-ink-soft">
              Real-time physiological telemetry calibrated against personal baseline
            </span>
          </div>
        </div>
      </div>

      {/* ── Written Past Health Data (Real Log History) ───────────────── */}
      <div className="rounded-ritual bg-surface border border-line p-6 shadow-ritual space-y-4">
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div>
            <h2 className="text-h2 font-display text-ink">Recorded Health Log History</h2>
            <p className="text-xs text-ink-soft mt-0.5">
              Comprehensive chronological log of your submitted physiological observations ({vitals.length} total).
            </p>
          </div>

          {/* Filters & Search */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-soft" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes or symptoms..."
                className="pl-9 pr-3 py-1.5 text-xs rounded-full border border-line bg-paper text-ink focus:outline-none focus:border-brand w-56"
              />
            </div>

            <div className="inline-flex items-center bg-paper border border-line rounded-full p-0.5 text-xs font-semibold">
              {['all', 'morning', 'evening'].map((s) => (
                <button
                  key={s}
                  onClick={() => setSlotFilter(s)}
                  className={`px-3 py-1 rounded-full capitalize transition-colors ${
                    slotFilter === s ? 'bg-brand text-white' : 'text-ink-soft hover:text-ink'
                  }`}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Real Telemetry Table */}
        <div className="rounded-clinical border border-line overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="bg-paper text-ink-soft uppercase text-xs tracking-wider border-b border-line">
              <tr>
                <th className="py-3 px-4 font-semibold">Date & Time</th>
                <th className="py-3 px-4 font-semibold">Slot</th>
                <th className="py-3 px-4 font-semibold">Blood Pressure</th>
                <th className="py-3 px-4 font-semibold">Heart Rate</th>
                <th className="py-3 px-4 font-semibold">SpO2</th>
                <th className="py-3 px-4 font-semibold">Temperature</th>
                <th className="py-3 px-4 font-semibold">Symptoms & Notes</th>
                <th className="py-3 px-4 font-semibold text-right">Source</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {filteredTableVitals.length > 0 ? (
                filteredTableVitals.map((reading, idx) => {
                  const dateObj = new Date(reading.recordedAt);
                  const formattedDate = dateObj.toLocaleDateString([], {
                    month: 'short',
                    day: 'numeric',
                    year: 'numeric',
                  });
                  const formattedTime = dateObj.toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  const isMorning = reading.slot === 'morning';

                  return (
                    <tr key={reading._id || idx} className="hover:bg-paper/60 transition-colors">
                      <td className="py-3 px-4 font-medium text-ink whitespace-nowrap">
                        <div>{formattedDate}</div>
                        <div className="text-xs text-ink-soft">{formattedTime}</div>
                      </td>
                      <td className="py-3 px-4 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold capitalize ${
                            isMorning
                              ? 'bg-dawn/15 text-amber-900 border border-dawn/30'
                              : 'bg-dusk/15 text-indigo-900 border border-dusk/30'
                          }`}
                        >
                          {reading.slot}
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                        <span
                          className={
                            reading.systolicBp > 135 || reading.diastolicBp > 85
                              ? 'text-tier-moderate font-bold'
                              : 'text-ink'
                          }
                        >
                          {reading.systolicBp}/{reading.diastolicBp}
                        </span>{' '}
                        <span className="text-[11px] text-ink-soft font-normal">mmHg</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                        <span
                          className={
                            reading.heartRate > 100 || reading.heartRate < 55
                              ? 'text-tier-moderate font-bold'
                              : 'text-ink'
                          }
                        >
                          {reading.heartRate}
                        </span>{' '}
                        <span className="text-[11px] text-ink-soft font-normal">bpm</span>
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-ink whitespace-nowrap">
                        <span className={reading.spo2 < 93 ? 'text-tier-critical font-bold' : 'text-ink'}>
                          {reading.spo2}%
                        </span>
                      </td>
                      <td className="py-3 px-4 font-mono text-ink whitespace-nowrap">
                        <span className={reading.temperatureC >= 37.8 ? 'text-tier-high font-bold' : 'text-ink'}>
                          {reading.temperatureC ? `${reading.temperatureC}°C` : '—'}
                        </span>
                      </td>
                      <td className="py-3 px-4 max-w-xs truncate">
                        {reading.symptomFlags && reading.symptomFlags.length > 0 ? (
                          <div className="flex items-center gap-1 flex-wrap">
                            {reading.symptomFlags.map((symp) => (
                              <span
                                key={symp}
                                className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 border border-rose-200"
                              >
                                {symp}
                              </span>
                            ))}
                          </div>
                        ) : reading.notes ? (
                          <span className="text-xs text-ink-soft truncate block" title={reading.notes}>
                            {reading.notes}
                          </span>
                        ) : (
                          <span className="text-xs text-emerald-700 font-medium">None reported</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <span className="inline-flex items-center gap-1 text-xs text-ink-soft px-2 py-0.5 rounded bg-paper border border-line">
                          <ShieldCheck size={12} className="text-brand" />
                          <span className="capitalize">{reading.source || 'Manual'}</span>
                        </span>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={8} className="py-8 text-center text-ink-soft">
                    {vitals.length === 0
                      ? 'No health readings logged yet. Click "Record Health Data" to submit your first observation.'
                      : 'No readings match your search or slot filter.'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Modal: Record Health Data Form ───────────────────────────── */}
      {isEntryModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto bg-surface rounded-ritual shadow-ritual border border-line p-6 relative">
            <div className="flex items-center justify-between pb-3 border-b border-line mb-4">
              <div>
                <h3 className="text-h2 font-display text-ink">Record Health Telemetry</h3>
                <p className="text-xs text-ink-soft">
                  Input your twice-daily vital parameters. No wearable device required.
                </p>
              </div>
              <button
                onClick={() => setIsEntryModalOpen(false)}
                className="p-2 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <VitalsEntryForm
              hideHeader={true}
              patientId={patientId}
              userRole={user?.role || 'patient'}
              onVitalsSaved={handleVitalsSaved}
            />
          </div>
        </div>
      )}

      {/* ── Modal: Educational AI Engine Explainer ─────────────────────── */}
      {isAiExplainerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4 backdrop-blur-sm">
          <div className="w-full max-w-xl bg-surface rounded-ritual shadow-ritual border border-line p-6 relative space-y-4">
            <div className="flex items-center justify-between pb-3 border-b border-line">
              <div className="flex items-center gap-2">
                <Sparkles className="text-brand" size={22} />
                <h3 className="text-h3 font-display text-ink">How CareOClock AI Evaluates Your Health</h3>
              </div>
              <button
                onClick={() => setIsAiExplainerOpen(false)}
                className="p-2 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            <p className="text-sm text-ink leading-relaxed">
              CareOClock pairs clinical protocol rules with machine learning to provide safe, reassuring, and early
              detection of health changes:
            </p>

            <div className="space-y-3">
              <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-1">
                <span className="font-bold text-sm text-brand flex items-center gap-1.5">
                  <ShieldCheck size={16} />
                  Layer 1: Modified Home-NEWS Safety Check
                </span>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Based on standard clinical scoring (National Early Warning Score) tailored for elderly home
                  monitoring. It instantly checks whether individual readings (heart rate, blood pressure, oxygen) are
                  within safe physiological survival boundaries.
                </p>
              </div>

              <div className="p-3.5 rounded-ritual bg-paper border border-line space-y-1">
                <span className="font-bold text-sm text-teal-800 flex items-center gap-1.5">
                  <Activity size={16} />
                  Layer 2: Personal Baseline Pattern AI
                </span>
                <p className="text-xs text-ink-soft leading-relaxed">
                  Uses an Isolation Forest machine learning model that learns your personal &quot;normal&quot; over 7 to 14 days.
                  It detects subtle, multi-parameter shifts (e.g., heart rate slowly rising while SpO2 gradually dips)
                  before acute distress occurs.
                </p>
              </div>
            </div>

            <div className="p-3 rounded-ritual bg-blue-50 border border-blue-200 text-blue-950 text-xs leading-relaxed">
              <strong>Physician Continuity:</strong> Any high risk or anomaly automatically alerts your assigned doctor&apos;s
              triage queue so they can review your history and adjust medication if needed.
            </div>

            <div className="pt-2 text-right">
              <button
                onClick={() => setIsAiExplainerOpen(false)}
                className="px-5 py-2 rounded-full bg-brand text-white text-sm font-semibold hover:bg-brand-dark transition-colors"
              >
                Understood
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
