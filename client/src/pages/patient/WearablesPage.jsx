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
      setSuccessMessage(`Successfully connected ${provider.replace('_', ' ').toUpperCase()}! Your readings will now automatically pre-fill your daily check-in.`);
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
    if (!window.confirm(`Disconnect ${providerKey.toUpperCase()}? Upstream tokens will be revoked.`)) {
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
    } catch (err) {
      setErrorMessage(err.message || 'Failed to fetch telemetry stream.');
    } finally {
      setIsFetchingStream(false);
    }
  };

  const isProviderConnected = (providerKey) => {
    return (statusData?.connectedProviders || []).find((cp) => cp.provider === providerKey);
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-ink">
      {/* ── Page Header ────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-4 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <Watch className="text-brand" size={26} />
            <h1 className="text-h1 font-display text-ink">Wearable Telemetry Hub</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1">
            Pair your smartwatch, smart ring, or blood pressure monitor. Pre-fills your twice-daily vitals automatically while preserving full manual control.
          </p>
        </div>

        <Link
          to="/app/patient"
          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full bg-surface border border-line hover:border-brand/40 text-sm font-semibold text-ink shadow-sm transition-all"
        >
          <span>Daily Check-in</span>
          <ArrowRight size={16} />
        </Link>
      </div>

      {/* Reassurance & NFR4 Notice Banner */}
      <div className="p-4 rounded-ritual bg-brand-light/30 border border-brand/20 flex items-start gap-3">
        <ShieldCheck size={20} className="text-brand flex-shrink-0 mt-0.5" />
        <div className="text-xs text-ink space-y-1">
          <p className="font-bold text-brand-dark uppercase tracking-wider text-[11px]">
            Privacy & Autonomy Assurance (NFR4 & DPDP Act 2025)
          </p>
          <p className="text-ink-soft leading-relaxed">
            All wearable tokens are encrypted at rest with AES-256-GCM. Synchronized vitals only <strong>pre-fill</strong> your form for review — you always verify and submit yourself. Manual entry remains 100% autonomous with zero connected devices.
          </p>
        </div>
      </div>

      {/* Alerts */}
      {errorMessage && (
        <div className="p-4 rounded-ritual bg-rose-50 border border-rose-200 text-rose-900 text-sm flex items-start gap-3 animate-shake">
          <AlertTriangle size={18} className="text-rose-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">{errorMessage}</div>
        </div>
      )}

      {successMessage && (
        <div className="p-4 rounded-ritual bg-emerald-50 border border-emerald-300 text-emerald-900 text-sm flex items-start gap-3 animate-fade-in">
          <CheckCircle2 size={18} className="text-emerald-600 flex-shrink-0 mt-0.5" />
          <div className="text-xs leading-relaxed">{successMessage}</div>
        </div>
      )}

      {/* ── Multi-Device Synergy Meter ──────────────────────────────── */}
      {statusData && (
        <div className="p-5 rounded-ritual bg-surface border border-line shadow-ritual space-y-3">
          <div className="flex items-center justify-between gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <Layers className="text-brand" size={20} />
              <h3 className="font-display font-bold text-ink text-base">
                Multi-Device Vital Coverage Synergy
              </h3>
            </div>
            <span className="text-xs font-bold px-2.5 py-1 rounded-full bg-brand-light/50 text-brand-dark">
              {statusData.coveredVitals?.length || 0} / 6 Vitals Automated ({statusData.coveragePercent || 0}%)
            </span>
          </div>

          {/* Progress bar */}
          <div className="w-full h-2.5 bg-paper rounded-full overflow-hidden border border-line">
            <div
              className="h-full bg-brand transition-all duration-500 rounded-full"
              style={{ width: `${statusData.coveragePercent || 0}%` }}
            />
          </div>

          <div className="grid sm:grid-cols-3 gap-2 pt-1 text-xs">
            <div className={`p-2.5 rounded-lg border ${statusData.coveredVitals?.includes('systolicBp') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-paper border-line text-ink-soft'}`}>
              <div className="font-semibold">Blood Pressure</div>
              <div className="text-[11px]">{statusData.coveredVitals?.includes('systolicBp') ? '✓ Supplied by Withings' : '○ Needs Withings Cuff'}</div>
            </div>
            <div className={`p-2.5 rounded-lg border ${statusData.coveredVitals?.includes('temperatureC') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-paper border-line text-ink-soft'}`}>
              <div className="font-semibold">Body Temperature</div>
              <div className="text-[11px]">{statusData.coveredVitals?.includes('temperatureC') ? '✓ Supplied by Oura' : '○ Needs Oura Ring'}</div>
            </div>
            <div className={`p-2.5 rounded-lg border ${statusData.coveredVitals?.includes('heartRate') ? 'bg-emerald-50 border-emerald-200 text-emerald-900' : 'bg-paper border-line text-ink-soft'}`}>
              <div className="font-semibold">Heart Rate & SpO2</div>
              <div className="text-[11px]">{statusData.coveredVitals?.includes('heartRate') ? '✓ Sourced from Wearables' : '○ Connect any wearable'}</div>
            </div>
          </div>
        </div>
      )}

      {/* ── 3 Provider Cards Grid ───────────────────────────────────── */}
      <div className="grid md:grid-cols-3 gap-5">
        {/* 1. OURA RING */}
        <ProviderCard
          name="Oura Ring"
          brandKey="oura"
          badgeText="Smart Ring Telemetry"
          description="Monitors sleep architecture, resting pulse, nocturnal SpO2, and distal skin temperature trends."
          capabilities={['Resting HR', 'Nocturnal SpO2 (Est.)', 'Skin Temp (Est.)', 'Sleep Respiration']}
          connection={isProviderConnected('oura')}
          isLoading={isLoading}
          actionLoading={actionLoading['oura']}
          onConnectOAuth={() => handleConnectOAuth('oura')}
          onConnectDemo={() => handleConnectDemo('oura')}
          onDisconnect={() => handleDisconnect('oura')}
        />

        {/* 2. WITHINGS HEALTH */}
        <ProviderCard
          name="Withings Health"
          brandKey="withings"
          badgeText="BPM Connect & ScanWatch"
          description="Clinically validated oscillometric arm cuff providing authentic systolic and diastolic blood pressure."
          capabilities={['Systolic BP (Cuff)', 'Diastolic BP (Cuff)', 'Heart Pulse', 'SpO2 (ScanWatch)']}
          connection={isProviderConnected('withings')}
          isLoading={isLoading}
          actionLoading={actionLoading['withings']}
          onConnectOAuth={() => handleConnectOAuth('withings')}
          onConnectDemo={() => handleConnectDemo('withings')}
          onDisconnect={() => handleDisconnect('withings')}
        />

        {/* 3. GOOGLE HEALTH API */}
        <ProviderCard
          name="Google Health"
          brandKey="google_health"
          badgeText="Testing Mode (Pixel / Fitbit)"
          description="Modern Google Health Cloud API covering Google Pixel Watch and Fitbit-sourced activity and pulse."
          capabilities={['Continuous HR', 'Reflective SpO2', 'Sleep Respiration']}
          connection={isProviderConnected('google_health')}
          isLoading={isLoading}
          actionLoading={actionLoading['google_health']}
          onConnectOAuth={() => handleConnectOAuth('google_health')}
          onConnectDemo={() => handleConnectDemo('google_health')}
          onDisconnect={() => handleDisconnect('google_health')}
        />
      </div>

      {/* ── Live Telemetry Stream Test Panel ────────────────────────── */}
      <div className="p-6 rounded-ritual bg-surface border border-line shadow-ritual space-y-4">
        <div className="flex items-center justify-between gap-3 flex-wrap pb-3 border-b border-line">
          <div>
            <h3 className="text-h3 font-display text-ink flex items-center gap-2">
              <Activity className="text-brand" size={20} />
              <span>Live Telemetry Stream Verification</span>
            </h3>
            <p className="text-xs text-ink-soft mt-0.5">
              Query connected providers in real time to inspect normalized parameters, device provenance, and disagreement checks.
            </p>
          </div>

          <button
            type="button"
            onClick={handleTestTelemetryStream}
            disabled={isFetchingStream || statusData?.connectedCount === 0}
            className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-brand text-white hover:bg-brand-dark text-xs font-semibold shadow-sm transition-all disabled:opacity-50"
          >
            <RefreshCw size={14} className={isFetchingStream ? 'animate-spin' : ''} />
            <span>{isFetchingStream ? 'Fetching Stream...' : 'Test Telemetry Stream'}</span>
          </button>
        </div>

        {statusData?.connectedCount === 0 && (
          <div className="p-4 rounded-ritual bg-paper border border-line text-center text-xs text-ink-soft">
            Connect at least one wearable (or click <strong>Connect Demo Mode</strong> above) to test real-time telemetry merging.
          </div>
        )}

        {liveTelemetry && (
          <div className="space-y-4 animate-fade-in">
            {/* Notice if demo */}
            {liveTelemetry.isDemoReading && (
              <div className="p-3 rounded-lg bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-center gap-2">
                <Info size={16} className="text-amber-600 flex-shrink-0" />
                <span>
                  <strong>Sandbox / Demo Stream:</strong> Telemetry was generated via verified provider developer mocks. Clinical alerts are isolated and emergency dispatches are suppressed.
                </span>
              </div>
            )}

            {/* Disagreement Warning if any */}
            {liveTelemetry.vitalDisagreements?.length > 0 && (
              <div className="p-3.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-900 text-xs space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-rose-800">
                  <AlertTriangle size={15} />
                  <span>Cross-Device Telemetry Disagreement Detected</span>
                </div>
                {liveTelemetry.vitalDisagreements.map((d, idx) => (
                  <p key={idx} className="text-[11px] leading-relaxed">
                    {d.message}
                  </p>
                ))}
              </div>
            )}

            {/* Normalized Telemetry Grid */}
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-6 gap-2.5">
              <TelemetryMetricCard
                label="Systolic BP"
                value={liveTelemetry.vitals.systolicBp ? `${liveTelemetry.vitals.systolicBp} mmHg` : '—'}
                source={liveTelemetry.sources.systolicBp}
                meta={liveTelemetry.vitalMetadata.systolicBp}
              />
              <TelemetryMetricCard
                label="Diastolic BP"
                value={liveTelemetry.vitals.diastolicBp ? `${liveTelemetry.vitals.diastolicBp} mmHg` : '—'}
                source={liveTelemetry.sources.diastolicBp}
                meta={liveTelemetry.vitalMetadata.diastolicBp}
              />
              <TelemetryMetricCard
                label="Heart Rate"
                value={liveTelemetry.vitals.heartRate ? `${liveTelemetry.vitals.heartRate} bpm` : '—'}
                source={liveTelemetry.sources.heartRate}
                meta={liveTelemetry.vitalMetadata.heartRate}
              />
              <TelemetryMetricCard
                label="Oxygen (SpO2)"
                value={liveTelemetry.vitals.spo2 ? `${liveTelemetry.vitals.spo2}%` : '—'}
                source={liveTelemetry.sources.spo2}
                meta={liveTelemetry.vitalMetadata.spo2}
              />
              <TelemetryMetricCard
                label="Temperature"
                value={liveTelemetry.vitals.temperatureC ? `${liveTelemetry.vitals.temperatureC} °C` : '—'}
                source={liveTelemetry.sources.temperatureC}
                meta={liveTelemetry.vitalMetadata.temperatureC}
              />
              <TelemetryMetricCard
                label="Respiration"
                value={liveTelemetry.vitals.respirationRate ? `${liveTelemetry.vitals.respirationRate}/min` : '—'}
                source={liveTelemetry.sources.respirationRate}
                meta={liveTelemetry.vitalMetadata.respirationRate}
              />
            </div>

            <div className="flex items-center justify-between text-xs text-ink-soft pt-2">
              <span>Synchronized: {new Date(liveTelemetry.timestamp).toLocaleTimeString()}</span>
              <Link
                to="/app/patient"
                className="text-brand hover:text-brand-dark font-semibold inline-flex items-center gap-1"
              >
                <span>Record reading in daily check-in</span>
                <ArrowRight size={13} />
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function ProviderCard({
  name,
  brandKey,
  badgeText,
  description,
  capabilities,
  connection,
  isLoading,
  actionLoading,
  onConnectOAuth,
  onConnectDemo,
  onDisconnect,
}) {
  const isConnected = !!connection;

  return (
    <div className="rounded-ritual bg-surface border border-line shadow-ritual p-5 flex flex-col justify-between gap-4 relative">
      <div>
        {/* Top Badges */}
        <div className="flex items-center justify-between gap-2 mb-2">
          <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full bg-paper border border-line text-ink-soft">
            {badgeText}
          </span>
          {isConnected ? (
            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded-full">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              Connected
            </span>
          ) : (
            <span className="text-[11px] font-medium text-ink-soft bg-paper px-2 py-0.5 rounded-full border border-line">
              Not Connected
            </span>
          )}
        </div>

        {/* Title & Description */}
        <h3 className="text-h3 font-display text-ink">{name}</h3>
        <p className="text-xs text-ink-soft mt-1 leading-relaxed">{description}</p>

        {/* Connected Device Info */}
        {isConnected && connection.deviceInfo && (
          <div className="mt-3 p-2.5 rounded-lg bg-paper border border-line text-xs space-y-1">
            <div className="flex items-center justify-between text-ink font-semibold">
              <span>{connection.deviceInfo.model || 'Connected Device'}</span>
              {connection.deviceInfo.batteryLevel && (
                <span className="inline-flex items-center gap-1 text-emerald-700 text-[11px]">
                  <BatteryCharging size={13} /> {connection.deviceInfo.batteryLevel}%
                </span>
              )}
            </div>
            <div className="text-[11px] text-ink-soft">
              Synced: {new Date(connection.connectedAt).toLocaleDateString()}
              {connection.isDemoMode && ' (Demo Mode)'}
            </div>
          </div>
        )}

        {/* Capabilities Pills */}
        <div className="mt-3 space-y-1.5">
          <div className="text-[11px] font-bold text-ink-soft uppercase tracking-wider">Capabilities:</div>
          <div className="flex flex-wrap gap-1">
            {capabilities.map((cap) => (
              <span
                key={cap}
                className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-brand-light/40 text-brand-dark border border-brand/15"
              >
                {cap}
              </span>
            ))}
          </div>
        </div>
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
            {actionLoading === 'disconnect' ? 'Disconnecting...' : 'Disconnect'}
          </button>
        ) : (
          <div className="space-y-1.5">
            <button
              type="button"
              onClick={onConnectOAuth}
              disabled={!!actionLoading || isLoading}
              className="w-full py-2 px-3 rounded-full bg-brand text-white hover:bg-brand-dark text-xs font-semibold transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1.5"
            >
              <ExternalLink size={13} />
              <span>{actionLoading === 'oauth' ? 'Redirecting...' : 'Connect OAuth'}</span>
            </button>

            <button
              type="button"
              onClick={onConnectDemo}
              disabled={!!actionLoading || isLoading}
              className="w-full py-1.5 px-3 rounded-full bg-surface border border-line hover:border-brand/40 text-ink text-xs font-medium transition-all active:scale-95 disabled:opacity-50 inline-flex items-center justify-center gap-1"
              title="1-Click sandbox testing without live hardware"
            >
              <Sparkles size={13} className="text-brand" />
              <span>{actionLoading === 'demo' ? 'Connecting Demo...' : 'Connect Demo Mode'}</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

function TelemetryMetricCard({ label, value, source, meta }) {
  const isEstimated = meta?.isEstimated;

  return (
    <div className="p-3 rounded-xl bg-paper border border-line space-y-1">
      <div className="text-[11px] text-ink-soft font-medium truncate">{label}</div>
      <div className="text-base font-display font-bold text-ink">{value}</div>
      {source ? (
        <div className="space-y-0.5 pt-0.5">
          <span className="inline-block text-[9px] font-semibold px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 border border-emerald-200 uppercase">
            {source}
          </span>
          {isEstimated ? (
            <div className="text-[9px] text-amber-700 font-medium leading-tight">Estimated</div>
          ) : (
            <div className="text-[9px] text-emerald-700 font-medium leading-tight">Direct Spot-check</div>
          )}
        </div>
      ) : (
        <div className="text-[10px] text-ink-soft">Manual Entry</div>
      )}
    </div>
  );
}
