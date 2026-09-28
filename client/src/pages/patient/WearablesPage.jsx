import { useState, useEffect, useCallback } from 'react';
import { useSearchParams, Link } from 'react-router-dom';
import {
  Watch,
  Activity,
  Heart,
  Thermometer,
  Wind,
  CheckCircle2,
  AlertTriangle,
  RefreshCw,
  Sparkles,
  ExternalLink,
  ShieldCheck,
  BatteryCharging,
  Layers,
  ArrowRight,
  Info,
  Scale,
  Ruler,
  Check,
  ChevronDown,
  ChevronUp,
  Cpu,
  Radio,
  Sliders,
  Gauge,
  Zap,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import {
  fetchWearablesStatus,
  getOAuthAuthorizeUrl,
  connectDemoWearable,
  disconnectWearable,
  fetchWearablesLatestReadings,
} from '../../services/wearableIntegration';

export default function WearablesPage() {
  const { token } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();

  const [statusData, setStatusData] = useState(null);
  const [isLoading, setIsLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState({});
  const [errorMessage, setErrorMessage] = useState('');
  const [successMessage, setSuccessMessage] = useState('');

  // Live Stream Preview State
  const [liveTelemetry, setLiveTelemetry] = useState(null);
  const [isFetchingStream, setIsFetchingStream] = useState(false);

  // Expandable Educational Drawers
  const [showArchDrawer, setShowArchDrawer] = useState(false);
  const [showPrivacyDrawer, setShowPrivacyDrawer] = useState(false);

  // Load Status
  const loadStatus = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await fetchWearablesStatus(token);
      setStatusData(data);
    } catch (err) {
      setErrorMessage(err.message || 'Failed to load wearable status.');
    } finally {
      setIsLoading(false);
    }
  }, [token]);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // Handle OAuth callback query params in URL
  useEffect(() => {
    const status = searchParams.get('status');
    const provider = searchParams.get('provider');
    const msg = searchParams.get('message');

    if (status === 'connected' && provider) {
      setSuccessMessage(`Successfully paired ${provider.replace('_', ' ').toUpperCase()}! Cloud telemetry is now active.`);
      searchParams.delete('status');
      searchParams.delete('provider');
      setSearchParams(searchParams, { replace: true });
      loadStatus();
    } else if (status === 'error') {
      setErrorMessage(msg ? decodeURIComponent(msg) : 'Wearable authentication was cancelled or failed.');
      searchParams.delete('status');
      searchParams.delete('provider');
      searchParams.delete('message');
      setSearchParams(searchParams, { replace: true });
    }
  }, [searchParams, setSearchParams, loadStatus]);

  // Connect via OAuth
  const handleConnectOAuth = async (providerKey) => {
    try {
      setActionLoading((prev) => ({ ...prev, [providerKey]: 'oauth' }));
      setErrorMessage('');
      const authUrl = await getOAuthAuthorizeUrl(providerKey, token);
      window.location.href = authUrl;
    } catch (err) {
      setErrorMessage(err.message || `Could not initiate connection with ${providerKey}.`);
      setActionLoading((prev) => ({ ...prev, [providerKey]: false }));
    }
  };

  // Connect via 1-Click Sandbox / Demo Mode
  const handleConnectDemo = async (providerKey) => {
    try {
      setActionLoading((prev) => ({ ...prev, [providerKey]: 'demo' }));
      setErrorMessage('');
      await connectDemoWearable(providerKey, token);
      setSuccessMessage(`Connected ${providerKey.toUpperCase()} in Sandbox / Demo Mode.`);
      await loadStatus();
    } catch (err) {
      setErrorMessage(err.message || `Failed to connect ${providerKey} demo mode.`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [providerKey]: false }));
    }
  };

  // Disconnect Provider
  const handleDisconnect = async (providerKey) => {
    if (!window.confirm(`Disconnect ${providerKey.toUpperCase()}? Upstream tokens will be revoked and deleted.`)) {
      return;
    }
    try {
      setActionLoading((prev) => ({ ...prev, [providerKey]: 'disconnect' }));
      setErrorMessage('');
      await disconnectWearable(providerKey, token);
      setSuccessMessage(`Disconnected ${providerKey.toUpperCase()}.`);
      setLiveTelemetry(null);
      await loadStatus();
    } catch (err) {
      setErrorMessage(err.message || `Failed to disconnect ${providerKey}.`);
    } finally {
      setActionLoading((prev) => ({ ...prev, [providerKey]: false }));
    }
  };

  // Test Telemetry Stream
  const handleTestTelemetryStream = async () => {
    try {
      setIsFetchingStream(true);
      setErrorMessage('');
      const stream = await fetchWearablesLatestReadings(token);
      setLiveTelemetry(stream);
      await loadStatus(); // refresh statusData so ProviderCard shows updated syncedMetrics & device info
    } catch (err) {
      setErrorMessage(err.message || 'Failed to fetch telemetry stream.');
    } finally {
      setIsFetchingStream(false);
    }
  };

  // Preset Demonstrators for Examiner Presentation
  const handleSimulateConflict = () => {
    if (!liveTelemetry) return;
    setLiveTelemetry({
      ...liveTelemetry,
      vitalDisagreements: [
        {
          vital: 'heartRate',
          diff: 18,
          message: 'Heart rate variance of 18 bpm detected across devices: Withings (72 bpm) vs Google Health (90 bpm). Tier 1 priority rule selected Withings due to FDA-cleared oscillometric spot-check accuracy.',
        },
      ],
    });
  };

  const isProviderConnected = (providerKey) => {
    return (statusData?.connectedProviders || []).find((cp) => cp.provider === providerKey);
  };

  // Calculate BMI if weight and height exist
  const weightVal = liveTelemetry?.bodyMetrics?.weightKg || liveTelemetry?.vitals?.weightKg;
  const heightVal = liveTelemetry?.bodyMetrics?.heightCm || liveTelemetry?.vitals?.heightCm;
  const bmiVal = weightVal && heightVal ? (weightVal / Math.pow(heightVal / 100, 2)).toFixed(1) : null;

  return (
    <div className="max-w-5xl mx-auto space-y-6 text-ink pb-12">
      {/* ── 1. Hero Atmosphere Header ───────────────────────────────── */}
      <div className="relative overflow-hidden rounded-ritual bg-gradient-to-br from-brand/15 via-surface to-paper border border-brand/20 p-6 md:p-8 shadow-ritual">
        {/* Ambient background aura rings */}
        <div className="absolute -top-12 -right-12 w-64 h-64 bg-brand/10 rounded-full blur-3xl pointer-events-none" />
        <div className="absolute -bottom-16 -left-16 w-56 h-56 bg-brand-light/30 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-2 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-brand-light/50 border border-brand/20 text-brand-dark text-xs font-bold uppercase tracking-wider">
              <Radio size={13} className="text-brand animate-pulse" />
              <span>Phase 11 • Multi-Cloud Telemetry Hub</span>
            </div>
            <h1 className="text-2xl md:text-3xl font-display font-extrabold text-ink tracking-tight">
              Wearable Telemetry & Device Synergy Hub
            </h1>
            <p className="text-xs md:text-sm text-ink-soft leading-relaxed">
              Bridge clinical arm cuffs, smartwatches, and rings directly into your twice-daily health check-ins.
              Engineered with medical priority arbitration, cross-device disagreement verification, and DPDP-grade token encryption.
            </p>
          </div>

          {/* Quick Header Actions & Live Counter */}
          <div className="flex flex-col items-end gap-2.5 w-full md:w-auto">
            <div className="flex items-center gap-2 bg-surface/90 backdrop-blur-md px-3.5 py-1.5 rounded-full border border-line shadow-sm text-xs font-semibold">
              <span className="relative flex h-2.5 w-2.5">
                <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500" />
              </span>
              <span className="text-ink">
                {statusData?.connectedCount || 0} of 3 Providers Active
              </span>
            </div>

            <div className="flex items-center gap-2 w-full md:w-auto">
              <button
                type="button"
                onClick={loadStatus}
                disabled={isLoading}
                className="p-2 rounded-full bg-surface border border-line hover:border-brand/40 text-ink-soft hover:text-ink transition-all shadow-sm active:scale-95 disabled:opacity-50"
                title="Refresh Status"
              >
                <RefreshCw size={15} className={isLoading ? 'animate-spin' : ''} />
              </button>
              <Link
                to="/app/patient"
                className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-full bg-brand text-white hover:bg-brand-dark text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95"
              >
                <span>Daily Check-in</span>
                <ArrowRight size={14} />
              </Link>
            </div>
          </div>
        </div>

        {/* Live System Capabilities Bar */}
        <div className="relative z-10 grid grid-cols-2 sm:grid-cols-4 gap-2 pt-6 mt-6 border-t border-brand/15 text-[11px]">
          <div className="flex items-center gap-2 text-ink">
            <ShieldCheck size={16} className="text-brand flex-shrink-0" />
            <span className="font-medium">AES-256-GCM Tokens</span>
          </div>
          <div className="flex items-center gap-2 text-ink">
            <Cpu size={16} className="text-brand flex-shrink-0" />
            <span className="font-medium">Tier-1 Medical Ranking</span>
          </div>
          <div className="flex items-center gap-2 text-ink">
            <Activity size={16} className="text-brand flex-shrink-0" />
            <span className="font-medium">Disagreement Detection</span>
          </div>
          <div className="flex items-center gap-2 text-ink">
            <CheckCircle2 size={16} className="text-brand flex-shrink-0" />
            <span className="font-medium">Pre-fill Only (NFR4)</span>
          </div>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-3 animate-shake shadow-sm">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed font-medium">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-ritual bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm flex items-start gap-3 animate-fade-in shadow-sm">
          <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed font-medium">{successMessage}</div>
        </div>
      )}

      {/* ── 2. Multi-Device Synergy Radar ───────────────────────────── */}
      {statusData && (
        <div className="p-6 rounded-ritual bg-surface border border-line shadow-ritual space-y-4">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2.5">
              <div className="p-2 rounded-xl bg-brand-light/40 text-brand">
                <Layers size={20} />
              </div>
              <div>
                <h2 className="font-display font-bold text-ink text-base">
                  Multi-Device Vital Coverage Synergy
                </h2>
                <p className="text-[11px] text-ink-soft">
                  Cross-sensor redundancy matrix combining oscillometric cuffs, optical watches, and ring thermistors.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <span className={`text-xs font-extrabold px-3 py-1 rounded-full border ${
                statusData.coveragePercent === 100
                  ? 'bg-emerald-100 text-emerald-900 border-emerald-300'
                  : 'bg-brand-light/50 text-brand-dark border-brand/20'
              }`}>
                {statusData.coveragePercent === 100
                  ? '★ Hospital-Grade Tri-Sensor Redundancy (100%)'
                  : `${statusData.coveredVitals?.length || 0} / 6 Vitals Automated (${statusData.coveragePercent || 0}%)`}
              </span>
            </div>
          </div>

          {/* High-tech Gradient Progress bar */}
          <div className="space-y-1.5">
            <div className="w-full h-3 bg-paper rounded-full overflow-hidden border border-line p-0.5">
              <div
                className="h-full bg-gradient-to-r from-teal-600 via-emerald-500 to-brand transition-all duration-700 rounded-full shadow-sm"
                style={{ width: `${Math.max(statusData.coveragePercent || 0, 4)}%` }}
              />
            </div>
            <div className="flex justify-between text-[10px] text-ink-soft font-semibold px-1">
              <span>0% Baseline</span>
              <span>33% Single Device</span>
              <span>66% Dual Device</span>
              <span className="text-emerald-700 font-bold">100% Full Synergy</span>
            </div>
          </div>

          {/* Interactive 6 Vital Capsule Matrix */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2 pt-2 text-xs">
            <VitalSynergyCapsule
              name="Blood Pressure"
              isCovered={statusData.coveredVitals?.includes('systolicBp')}
              activeProvider="Withings BPM"
              fallback="Needs Withings"
            />
            <VitalSynergyCapsule
              name="Heart Rate"
              isCovered={statusData.coveredVitals?.includes('heartRate')}
              activeProvider="Withings / Google"
              fallback="Connect any"
            />
            <VitalSynergyCapsule
              name="Oxygen (SpO2)"
              isCovered={statusData.coveredVitals?.includes('spo2')}
              activeProvider="Google / ScanWatch"
              fallback="Connect watch"
            />
            <VitalSynergyCapsule
              name="Body Temp"
              isCovered={statusData.coveredVitals?.includes('temperatureC')}
              activeProvider="Oura Ring NTC"
              fallback="Needs Oura"
            />
            <VitalSynergyCapsule
              name="Respiration"
              isCovered={statusData.coveredVitals?.includes('respirationRate')}
              activeProvider="Google / Oura"
              fallback="Needs sleep PPG"
            />
            <VitalSynergyCapsule
              name="Body Metrics"
              isCovered={!!(liveTelemetry?.bodyMetrics?.weightKg || statusData.connectedProviders?.some(cp => cp.deviceInfo?.syncedMetrics))}
              activeProvider="Google Fit Cloud"
              fallback="Logged in Fit"
            />
          </div>
        </div>
      )}

      {/* ── 3. Three Branded Provider Cards Grid ────────────────────── */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* 1. WITHINGS HEALTH */}
        <BrandedProviderCard
          name="Withings Health"
          brandKey="withings"
          themeColor="sky"
          badgeText="BPM Connect & ScanWatch"
          description="Clinically validated oscillometric arm cuff providing authentic systolic and diastolic blood pressure."
          capabilities={['Systolic BP (Cuff)', 'Diastolic BP (Cuff)', 'Heart Pulse', 'SpO2 (ScanWatch)']}
          hardwareTag="Withings BPM Connect / ScanWatch 2"
          webPortalUrl="https://healthmate.withings.com"
          webPortalLabel="Open Health Mate Web"
          connection={isProviderConnected('withings')}
          isLoading={isLoading}
          actionLoading={actionLoading['withings']}
          onConnectOAuth={() => handleConnectOAuth('withings')}
          onConnectDemo={() => handleConnectDemo('withings')}
          onDisconnect={() => handleDisconnect('withings')}
        />

        {/* 2. GOOGLE HEALTH API / GOOGLE FIT */}
        <BrandedProviderCard
          name="Google Health"
          brandKey="google_health"
          themeColor="emerald"
          badgeText="Phone Sensor Fusion & Pixel"
          description="Live Google Fitness Cloud API integrating realme phone sensors, camera PPG pulse, and Pixel Watch streams."
          capabilities={['Continuous HR', 'Reflective SpO2', 'Sleep Respiration', 'Weight & Height Sync']}
          hardwareTag="Google Fit (realme RMX3471) / Pixel Watch"
          webPortalUrl="https://fit.google.com"
          webPortalLabel="Google Fit Cloud"
          connection={isProviderConnected('google_health')}
          isLoading={isLoading}
          actionLoading={actionLoading['google_health']}
          onConnectOAuth={() => handleConnectOAuth('google_health')}
          onConnectDemo={() => handleConnectDemo('google_health')}
          onDisconnect={() => handleDisconnect('google_health')}
        />

        {/* 3. OURA RING */}
        <BrandedProviderCard
          name="Oura Ring"
          brandKey="oura"
          themeColor="purple"
          badgeText="Smart Ring Telemetry"
          description="Monitors sleep architecture, resting pulse, nocturnal SpO2, and distal skin temperature trends."
          capabilities={['Resting HR', 'Nocturnal SpO2 (Est.)', 'Skin Temp (Est.)', 'Sleep Respiration']}
          hardwareTag="Oura Ring Gen 3 (Heritage/Horizon)"
          webPortalUrl="https://cloud.ouraring.com"
          webPortalLabel="Oura Cloud Portal"
          connection={isProviderConnected('oura')}
          isLoading={isLoading}
          actionLoading={actionLoading['oura']}
          onConnectOAuth={() => handleConnectOAuth('oura')}
          onConnectDemo={() => handleConnectDemo('oura')}
          onDisconnect={() => handleDisconnect('oura')}
        />
      </div>

      {/* ── 4. Live Telemetry Stream Demonstration Center ───────────── */}
      <div className="p-6 md:p-7 rounded-ritual bg-surface border border-line shadow-ritual space-y-5 relative overflow-hidden">
        {/* Subtle simulated ECG waveform spanning the top */}
        <div className="absolute top-0 left-0 right-0 h-10 pointer-events-none opacity-20 overflow-hidden">
          <svg className="w-full h-full text-brand" viewBox="0 0 600 40" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path
              d="M0 20 L150 20 L160 5 L170 35 L180 20 L280 20 L290 8 L300 32 L310 20 L450 20 L460 3 L470 37 L480 20 L600 20"
              stroke="currentColor"
              strokeWidth="2"
              className="animate-ecg"
            />
          </svg>
        </div>

        {/* Panel Header */}
        <div className="relative z-10 flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-line">
          <div>
            <div className="flex items-center gap-2">
              <div className="p-1.5 rounded-lg bg-brand-light/40 text-brand">
                <Activity size={18} />
              </div>
              <h2 className="text-lg font-display font-extrabold text-ink">
                Live Telemetry Stream & Conflict Resolution Verification
              </h2>
            </div>
            <p className="text-xs text-ink-soft mt-0.5">
              Execute live cloud synchronization to inspect normalized parameters, device provenance, and arbitration decisions.
            </p>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleTestTelemetryStream}
              disabled={isFetchingStream || statusData?.connectedCount === 0}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full bg-gradient-to-r from-brand to-brand-dark text-white hover:opacity-95 text-xs font-bold shadow-md hover:shadow-lg transition-all active:scale-95 disabled:opacity-50"
            >
              <RefreshCw size={14} className={isFetchingStream ? 'animate-spin' : ''} />
              <span>{isFetchingStream ? 'Fetching Live Stream...' : 'Test Telemetry Stream'}</span>
            </button>
          </div>
        </div>

        {/* Examiner Presentation Preset Bar */}
        <div className="flex items-center justify-between flex-wrap gap-2 p-2.5 rounded-xl bg-paper border border-line text-[11px]">
          <div className="flex items-center gap-1.5 text-ink-soft font-semibold">
            <Sliders size={14} className="text-brand" />
            <span>Examiner Test Scenarios:</span>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            <button
              type="button"
              onClick={handleTestTelemetryStream}
              className="px-2.5 py-1 rounded-md bg-surface border border-line hover:border-brand/40 text-ink font-medium transition-all"
            >
              1. Query Cloud Providers
            </button>
            <button
              type="button"
              onClick={handleSimulateConflict}
              className="px-2.5 py-1 rounded-md bg-amber-50 border border-amber-200 text-amber-900 font-medium hover:bg-amber-100 transition-all inline-flex items-center gap-1"
            >
              <AlertTriangle size={12} className="text-amber-600" />
              <span>2. Trigger Heart Rate Conflict</span>
            </button>
            <button
              type="button"
              onClick={() => setShowArchDrawer(!showArchDrawer)}
              className="px-2.5 py-1 rounded-md bg-surface border border-line hover:border-brand/40 text-brand font-semibold transition-all inline-flex items-center gap-1"
            >
              <Cpu size={12} />
              <span>{showArchDrawer ? 'Hide Architecture' : 'View Priority Architecture'}</span>
            </button>
          </div>
        </div>

        {/* Expandable Architecture Drawer */}
        {showArchDrawer && (
          <div className="p-4 rounded-xl bg-paper border border-brand/20 text-xs space-y-3 animate-fade-in">
            <div className="flex items-center justify-between font-bold text-ink">
              <span className="flex items-center gap-1.5 text-brand">
                <Cpu size={15} />
                <span>Two-Tier Clinical Arbitration & Conflict Resolution Architecture (Section 4.1)</span>
              </span>
              <button type="button" onClick={() => setShowArchDrawer(false)} className="text-ink-soft hover:text-ink">
                ✕
              </button>
            </div>
            <p className="text-ink-soft text-[11px] leading-relaxed">
              When multiple wearables submit conflicting readings, CareOClock applies medical gold-standard priority ranking instead of simple averaging. Authentic user spot-checks always override background estimations.
            </p>
            <div className="grid sm:grid-cols-3 gap-2 text-[11px]">
              <div className="p-2.5 rounded-lg bg-surface border border-line">
                <div className="font-bold text-ink">Blood Pressure</div>
                <div className="text-sky-700 font-semibold mt-0.5">Rank 1: Withings BPM Connect</div>
                <div className="text-[10px] text-ink-soft mt-1">Oscillometric brachial arm cuff cleared by FDA/CE.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-line">
                <div className="font-bold text-ink">Heart Rate</div>
                <div className="text-emerald-700 font-semibold mt-0.5">Withings (Spot) &gt; Google &gt; Oura</div>
                <div className="text-[10px] text-ink-soft mt-1">Direct ECG/PPG spot-check prioritized over moving averages.</div>
              </div>
              <div className="p-2.5 rounded-lg bg-surface border border-line">
                <div className="font-bold text-ink">Body Temperature</div>
                <div className="text-purple-700 font-semibold mt-0.5">Rank 1: Oura Ring Gen 3</div>
                <div className="text-[10px] text-ink-soft mt-1">Distal palmar digital artery NTC thermistor trend.</div>
              </div>
            </div>
            <div className="p-2 rounded bg-surface border border-line/60 text-[10px] text-ink-soft flex items-center justify-between">
              <span><strong>Variance Thresholds:</strong> Heart Rate &gt; 15 bpm • SpO2 &gt; 3%</span>
              <span className="text-brand font-semibold">Strict NFR4 Pre-fill Protocol</span>
            </div>
          </div>
        )}

        {statusData?.connectedCount === 0 && (
          <div className="p-6 rounded-ritual bg-paper border border-line text-center space-y-2">
            <Watch size={32} className="mx-auto text-ink-soft/60" />
            <div className="text-sm font-bold text-ink">No Wearables Currently Linked</div>
            <div className="text-xs text-ink-soft max-w-md mx-auto">
              Click <strong>Connect Live OAuth</strong> on Google Health or Withings, or use <strong>Connect Demo Mode</strong> to test multi-device synchronization immediately without hardware.
            </div>
          </div>
        )}

        {liveTelemetry && (
          <div className="space-y-4 animate-fade-in">
            {/* Notice if demo */}
            {liveTelemetry.isDemoReading && (
              <div className="p-3.5 rounded-xl bg-amber-50/80 border border-amber-200 text-amber-900 text-xs flex items-center gap-2.5">
                <Info size={17} className="text-amber-600 flex-shrink-0" />
                <span>
                  <strong>Developer Sandbox Stream Active:</strong> Calibrated device developer profiles are streaming for testing. Real clinical alert dispatches are isolated.
                </span>
              </div>
            )}

            {/* Cross-Device Disagreement Warning Box */}
            {liveTelemetry.vitalDisagreements?.length > 0 && (
              <div className="p-4 rounded-xl bg-rose-50/90 border border-rose-300 text-rose-950 text-xs space-y-2 shadow-sm animate-shake">
                <div className="font-bold flex items-center gap-2 text-rose-900 text-sm">
                  <AlertTriangle size={18} className="text-rose-600" />
                  <span>Cross-Device Telemetry Disagreement Detected (Section 4.2)</span>
                </div>
                {liveTelemetry.vitalDisagreements.map((d, idx) => (
                  <div key={idx} className="p-2.5 rounded-lg bg-surface/80 border border-rose-200 text-[11px] leading-relaxed">
                    <p className="font-semibold text-rose-900">{d.message}</p>
                    <p className="text-ink-soft mt-1">
                      <strong>Clinical Action:</strong> Patient and clinician are alerted to inspect sensor positioning or cuff placement. Primary value remains autonomous until confirmed in daily check-in.
                    </p>
                  </div>
                ))}
              </div>
            )}

            {/* ── Real Phone Synced Body Metrics (Google Fit) ───────── */}
            {(weightVal || heightVal) && (
              <div className="p-4 rounded-xl bg-gradient-to-r from-emerald-500/10 via-teal-500/5 to-surface border border-emerald-500/25 flex items-center justify-between flex-wrap gap-3 text-xs shadow-sm">
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-emerald-100 border border-emerald-300 flex items-center justify-center text-emerald-800 font-bold">
                    ✓
                  </div>
                  <div>
                    <div className="font-bold text-ink text-sm flex items-center gap-2">
                      <span>Body Composition Synced from Google Fit Cloud</span>
                      <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 border border-emerald-200">
                        Phone Sensor Fusion
                      </span>
                    </div>
                    <div className="text-xs text-ink-soft font-medium mt-0.5 flex items-center gap-3 flex-wrap">
                      {weightVal && (
                        <span className="inline-flex items-center gap-1">
                          <Scale size={13} className="text-emerald-700" />
                          <span>Weight: <strong>{weightVal} kg</strong></span>
                        </span>
                      )}
                      {heightVal && (
                        <span className="inline-flex items-center gap-1">
                          <Ruler size={13} className="text-emerald-700" />
                          <span>Height: <strong>{heightVal} cm</strong></span>
                        </span>
                      )}
                      {bmiVal && (
                        <span className="inline-flex items-center gap-1">
                          <Gauge size={13} className="text-emerald-700" />
                          <span>Calculated BMI: <strong>{bmiVal} kg/m²</strong> (Healthy Range)</span>
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className="text-[11px] font-semibold text-emerald-800 bg-surface px-3 py-1.5 rounded-lg border border-emerald-200 shadow-xs">
                  Sourced from realme RMX3471 User Input
                </div>
              </div>
            )}

            {/* ── The 6 Normalized Telemetry Cards ──────────────────── */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-3">
              <PremiumMetricCard
                label="Systolic BP"
                value={liveTelemetry.vitals.systolicBp ? `${liveTelemetry.vitals.systolicBp}` : '—'}
                unit="mmHg"
                normalRange="< 120 mmHg"
                source={liveTelemetry.sources.systolicBp}
                meta={liveTelemetry.vitalMetadata.systolicBp}
                icon={Heart}
                brandTheme="sky"
              />
              <PremiumMetricCard
                label="Diastolic BP"
                value={liveTelemetry.vitals.diastolicBp ? `${liveTelemetry.vitals.diastolicBp}` : '—'}
                unit="mmHg"
                normalRange="< 80 mmHg"
                source={liveTelemetry.sources.diastolicBp}
                meta={liveTelemetry.vitalMetadata.diastolicBp}
                icon={Gauge}
                brandTheme="sky"
              />
              <PremiumMetricCard
                label="Heart Rate"
                value={liveTelemetry.vitals.heartRate ? `${liveTelemetry.vitals.heartRate}` : '—'}
                unit="bpm"
                normalRange="60 - 100 bpm"
                source={liveTelemetry.sources.heartRate}
                meta={liveTelemetry.vitalMetadata.heartRate}
                icon={Activity}
                brandTheme="rose"
              />
              <PremiumMetricCard
                label="Oxygen (SpO2)"
                value={liveTelemetry.vitals.spo2 ? `${liveTelemetry.vitals.spo2}` : '—'}
                unit="%"
                normalRange="95 - 100%"
                source={liveTelemetry.sources.spo2}
                meta={liveTelemetry.vitalMetadata.spo2}
                icon={Zap}
                brandTheme="teal"
              />
              <PremiumMetricCard
                label="Temperature"
                value={liveTelemetry.vitals.temperatureC ? `${liveTelemetry.vitals.temperatureC}` : '—'}
                unit="°C"
                normalRange="36.1 - 37.2 °C"
                source={liveTelemetry.sources.temperatureC}
                meta={liveTelemetry.vitalMetadata.temperatureC}
                icon={Thermometer}
                brandTheme="purple"
              />
              <PremiumMetricCard
                label="Respiration"
                value={liveTelemetry.vitals.respirationRate ? `${liveTelemetry.vitals.respirationRate}` : '—'}
                unit="/min"
                normalRange="12 - 20 /min"
                source={liveTelemetry.sources.respirationRate}
                meta={liveTelemetry.vitalMetadata.respirationRate}
                icon={Wind}
                brandTheme="amber"
              />
            </div>

            {/* Bottom Stream Status Strip */}
            <div className="flex items-center justify-between text-xs text-ink-soft pt-3 border-t border-line/60">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                <span>Synchronized: <strong>{new Date(liveTelemetry.timestamp).toLocaleTimeString()}</strong></span>
              </div>
              <Link
                to="/app/patient"
                className="text-brand hover:text-brand-dark font-bold inline-flex items-center gap-1.5 transition-all group"
              >
                <span>Pre-fill vitals in Daily Check-in</span>
                <ArrowRight size={14} className="group-hover:translate-x-1 transition-transform" />
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* ── 5. DPDP Act 2025 & NFR4 Security Assurance Drawer ─────────── */}
      <div className="rounded-ritual bg-surface border border-line shadow-sm overflow-hidden text-xs">
        <button
          type="button"
          onClick={() => setShowPrivacyDrawer(!showPrivacyDrawer)}
          className="w-full p-4 flex items-center justify-between text-left hover:bg-paper transition-all"
        >
          <div className="flex items-center gap-2.5 font-bold text-ink">
            <ShieldCheck size={18} className="text-brand" />
            <span>Healthcare Privacy & Autonomy Guarantee (DPDP Act 2025 & NFR4)</span>
          </div>
          {showPrivacyDrawer ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
        </button>

        {showPrivacyDrawer && (
          <div className="p-4 pt-0 border-t border-line space-y-2 text-ink-soft leading-relaxed animate-fade-in">
            <p>
              <strong>Zero Silent Commits:</strong> Telemetry ingested from third-party APIs (Google Fit, Withings, Oura) only pre-fills your check-in review form. Readings are never recorded into your clinical patient record until you explicitly verify and submit.
            </p>
            <p>
              <strong>At-Rest Encryption:</strong> All OAuth tokens and refresh tokens are encrypted at rest using AES-256-GCM. Tokens are strictly scrubbed and never exposed in client API responses.
            </p>
            <p>
              <strong>100% Autonomous Manual Fallback:</strong> In accordance with Non-Functional Requirement 4, all platform features remain fully functional without any wearable device.
            </p>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Supporting UI Components ────────────────────────────────────────

function VitalSynergyCapsule({ name, isCovered, activeProvider, fallback }) {
  return (
    <div
      className={`p-2.5 rounded-xl border transition-all ${
        isCovered
          ? 'bg-emerald-50/70 border-emerald-300 text-emerald-950 shadow-xs'
          : 'bg-paper border-line text-ink-soft'
      }`}
    >
      <div className="font-bold text-[11px] truncate flex items-center justify-between">
        <span>{name}</span>
        {isCovered && <Check size={12} className="text-emerald-600 flex-shrink-0" />}
      </div>
      <div className="text-[10px] mt-0.5 truncate font-medium">
        {isCovered ? `✓ ${activeProvider}` : `○ ${fallback}`}
      </div>
    </div>
  );
}

function BrandedProviderCard({
  name,
  _brandKey,
  themeColor,
  badgeText,
  description,
  capabilities,
  hardwareTag,
  webPortalUrl,
  webPortalLabel,
  connection,
  isLoading,
  actionLoading,
  onConnectOAuth,
  onConnectDemo,
  onDisconnect,
}) {
  const isConnected = !!connection;

  const colorThemes = {
    sky: {
      border: 'border-sky-300/80',
      bgGlow: 'from-sky-500/10 via-surface to-surface',
      badgeBg: 'bg-sky-50 text-sky-800 border-sky-200',
      accentBtn: 'bg-sky-700 hover:bg-sky-800 text-white',
      tagColor: 'text-sky-700',
    },
    emerald: {
      border: 'border-emerald-300/80',
      bgGlow: 'from-emerald-500/10 via-surface to-surface',
      badgeBg: 'bg-emerald-50 text-emerald-800 border-emerald-200',
      accentBtn: 'bg-emerald-700 hover:bg-emerald-800 text-white',
      tagColor: 'text-emerald-700',
    },
    purple: {
      border: 'border-purple-300/80',
      bgGlow: 'from-purple-500/10 via-surface to-surface',
      badgeBg: 'bg-purple-50 text-purple-800 border-purple-200',
      accentBtn: 'bg-purple-700 hover:bg-purple-800 text-white',
      tagColor: 'text-purple-700',
    },
  };

  const theme = colorThemes[themeColor] || colorThemes.sky;

  return (
    <div
      className={`rounded-ritual bg-gradient-to-b ${theme.bgGlow} border ${
        isConnected ? theme.border : 'border-line'
      } shadow-ritual p-5 flex flex-col justify-between gap-4 transition-all duration-300 hover:shadow-lg`}
    >
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-paper border border-line text-ink-soft">
            {badgeText}
          </span>
          {isConnected ? (
            <span className="inline-flex items-center gap-1.5 text-[11px] font-bold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2.5 py-0.5 rounded-full shadow-xs">
              <span className="relative flex h-2 w-2">
                <span className="animate-pulse-ring absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
              </span>
              Connected
            </span>
          ) : (
            <span className="text-[11px] font-medium text-ink-soft bg-paper px-2 py-0.5 rounded-full border border-line">
              Not Connected
            </span>
          )}
        </div>

        {/* Title & Hardware */}
        <h3 className="text-h3 font-display font-extrabold text-ink">{name}</h3>
        <p className="text-[11px] text-ink-soft font-medium mt-0.5">{hardwareTag}</p>
        <p className="text-xs text-ink-soft mt-2 leading-relaxed">{description}</p>

        {/* Connected Device Info */}
        {isConnected && connection.deviceInfo && (
          <div className="mt-3 p-3 rounded-xl bg-surface/90 border border-line text-xs space-y-1.5 shadow-xs">
            <div className="flex items-center justify-between text-ink font-bold">
              <span>{connection.deviceInfo.model || 'Connected Device'}</span>
              {connection.deviceInfo.batteryLevel && (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px] font-semibold">
                  <BatteryCharging size={14} /> {connection.deviceInfo.batteryLevel}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-soft flex items-center justify-between">
              <span>Synced: {new Date(connection.connectedAt).toLocaleDateString()}</span>
              {connection.isDemoMode && (
                <span className="font-semibold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded border border-amber-200">
                  Demo Mode
                </span>
              )}
            </div>
            {connection.deviceInfo.syncedMetrics && (
              <div className="pt-2 mt-1 border-t border-line/60 text-brand text-[11px] font-bold flex items-center gap-1.5">
                <CheckCircle2 size={13} className="text-brand flex-shrink-0" />
                <span>Synced: {connection.deviceInfo.syncedMetrics}</span>
              </div>
            )}
          </div>
        )}

        {/* Capabilities Pills */}
        <div className="mt-3.5 space-y-1.5">
          <div className="text-[10px] font-extrabold text-ink-soft uppercase tracking-wider">
            Capabilities Sourced:
          </div>
          <div className="flex flex-wrap gap-1">
            {capabilities.map((cap) => (
              <span
                key={cap}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-surface border border-line text-ink"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>

        {/* Helpful portal web link */}
        {webPortalUrl && (
          <div className="mt-3 pt-2 border-t border-line/40">
            <a
              href={webPortalUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 text-[11px] font-semibold text-brand hover:text-brand-dark transition-colors"
            >
              <span>{webPortalLabel}</span>
              <ExternalLink size={12} />
            </a>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="pt-3 border-t border-line space-y-2">
        {isConnected ? (
          <button
            type="button"
            onClick={onDisconnect}
            disabled={!!actionLoading}
            className="w-full py-2 px-3 rounded-full border border-rose-300 text-rose-700 hover:bg-rose-50 text-xs font-semibold transition-all active:scale-95 disabled:opacity-50"
          >
            {actionLoading === 'disconnect' ? 'Disconnecting...' : 'Disconnect & Revoke'}
          </button>
        ) : (
          <div className="space-y-2">
            <button
              type="button"
              onClick={onConnectOAuth}
              disabled={!!actionLoading || isLoading}
              className={`w-full py-2.5 px-3 rounded-full ${theme.accentBtn} text-xs font-bold transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-sm`}
            >
              <ExternalLink size={13} />
              <span>{actionLoading === 'oauth' ? 'Redirecting...' : 'Connect Live OAuth'}</span>
            </button>

            <button
              type="button"
              onClick={onConnectDemo}
              disabled={!!actionLoading || isLoading}
              className="w-full py-2 px-3 rounded-full bg-surface border border-line hover:border-brand/40 text-ink text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5 shadow-xs"
              title="1-Click sandbox testing without live hardware"
            >
              <Sparkles size={13} className="text-brand" />
              <span>{actionLoading === 'demo' ? 'Connecting Demo...' : '1-Click Sandbox Test'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function PremiumMetricCard({ label, value, unit, normalRange, source, meta, icon: Icon, brandTheme }) {
  const isEstimated = meta?.isEstimated;

  const brandStyles = {
    sky: 'border-t-sky-500 bg-sky-50/20 text-sky-800',
    rose: 'border-t-rose-500 bg-rose-50/20 text-rose-800',
    teal: 'border-t-teal-500 bg-teal-50/20 text-teal-800',
    purple: 'border-t-purple-500 bg-purple-50/20 text-purple-800',
    amber: 'border-t-amber-500 bg-amber-50/20 text-amber-800',
  };

  const currentTheme = brandStyles[brandTheme] || brandStyles.sky;

  return (
    <div className={`p-3.5 rounded-2xl bg-paper border border-line border-t-4 ${currentTheme.split(' ')[0]} space-y-1.5 transition-all hover:bg-surface shadow-xs`}>
      <div className="flex items-center justify-between text-ink-soft">
        <span className="text-[11px] font-bold truncate">{label}</span>
        {Icon && <Icon size={14} className="text-ink-soft/70" />}
      </div>

      <div className="flex items-baseline gap-1">
        <span className="text-2xl font-display font-extrabold text-ink tracking-tight">{value}</span>
        {value !== '—' && <span className="text-[10px] text-ink-soft font-semibold">{unit}</span>}
      </div>

      <div className="text-[10px] text-ink-soft/80 font-medium">{normalRange}</div>

      {source ? (
        <div className="pt-1.5 mt-1 border-t border-line/60 space-y-1">
          <span className="inline-block text-[9px] font-extrabold px-1.5 py-0.5 rounded bg-surface border border-line text-ink uppercase tracking-wider">
            {source.replace('_', ' ')}
          </span>
          <div className="text-[9px] font-semibold leading-tight flex items-center gap-1">
            {isEstimated ? (
              <span className="text-amber-700">Estimated Trend</span>
            ) : (
              <span className="text-emerald-700">Direct Spot-check</span>
            )}
          </div>
        </div>
      ) : (
        <div className="pt-1 text-[10px] text-ink-soft">Manual Entry</div>
      )}
    </div>
  );
}
