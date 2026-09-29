import { useState, useEffect, useRef, useCallback } from 'react';
import { Outlet, useNavigate, Link } from 'react-router-dom';
import {
  WifiOff,
  Wifi,
  AlertTriangle,
  Clock,
  ShieldCheck,
  X,
  RefreshCw,
  Pill,
  Bell,
  Phone,
  AlertCircle,
  Stethoscope,
  CheckCircle2,
  Volume2,
} from 'lucide-react';
import Navbar from './Navbar';
import { useAuth } from '../../context/AuthContext';
import { CONFIG } from '../../config';
import { api } from '../../api/client';

const INACTIVITY_TIMEOUT_MS = 13 * 60 * 1000; // 13 minutes idle -> warning dialog
const COUNTDOWN_TOTAL_SECONDS = 120; // 2 minutes countdown before logout

// Synthesized Web Audio API Chime (Zero external audio asset dependency)
function playNotificationSound(type = 'reminder') {
  try {
    const AudioCtx = window.AudioContext || window.webkitAudioContext;
    if (!AudioCtx) return;
    const ctx = new AudioCtx();
    if (ctx.state === 'suspended') {
      ctx.resume().catch(() => {});
    }

    if (type === 'critical') {
      // Urgent attention dual-pulse tone
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.type = 'sine';
      osc.frequency.setValueAtTime(880, now);
      osc.frequency.setValueAtTime(440, now + 0.15);
      osc.frequency.setValueAtTime(880, now + 0.3);
      gain.gain.setValueAtTime(0.3, now);
      gain.gain.exponentialRampToValueAtTime(0.01, now + 0.55);
      osc.start(now);
      osc.stop(now + 0.55);
    } else {
      // Gentle pleasant ascending triad chord (C5 - E5 - G5)
      const now = ctx.currentTime;
      [523.25, 659.25, 783.99].forEach((freq, idx) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, now + idx * 0.12);
        gain.gain.setValueAtTime(0.22, now + idx * 0.12);
        gain.gain.exponentialRampToValueAtTime(0.005, now + idx * 0.12 + 0.5);
        osc.start(now + idx * 0.12);
        osc.stop(now + idx * 0.12 + 0.5);
      });
    }
  } catch {
    // Audio context initialization silently ignored if user has not interacted with DOM yet
  }
}

// Compute current daily slot based on real system clock
function getCurrentDailySlot() {
  const hour = new Date().getHours();
  if (hour >= 6 && hour < 12) return 'morning';
  if (hour >= 12 && hour < 17) return 'afternoon';
  if (hour >= 17 && hour < 21) return 'evening';
  return 'night';
}

export default function AppShell() {
  const { user, refreshUser, logout } = useAuth();
  const navigate = useNavigate();

  // ── Network Connectivity Alerts ───────────────────────────────────────
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [showBackOnlineToast, setShowBackOnlineToast] = useState(false);

  useEffect(() => {
    const handleOffline = () => {
      setIsOffline(true);
      setShowBackOnlineToast(false);
    };

    const handleOnline = () => {
      setIsOffline(false);
      setShowBackOnlineToast(true);
      const timer = setTimeout(() => setShowBackOnlineToast(false), 4000);
      return () => clearTimeout(timer);
    };

    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);

    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, []);

  // ── System Health & Degradation Monitor ────────────────────────────────
  const [isServiceDegraded, setIsServiceDegraded] = useState(false);
  const [isDismissedDegraded, setIsDismissedDegraded] = useState(false);

  const checkHealth = useCallback(async () => {
    if (!navigator.onLine) return;
    try {
      const res = await fetch('/health', { method: 'GET', cache: 'no-store' });
      if (!res.ok) {
        setIsServiceDegraded(true);
      } else {
        setIsServiceDegraded(false);
      }
    } catch {
      setIsServiceDegraded(true);
    }
  }, []);

  useEffect(() => {
    checkHealth();
    const interval = setInterval(checkHealth, 60000); // Check every 60s
    return () => clearInterval(interval);
  }, [checkHealth]);

  // ── Session Idle Inactivity Countdown Modal ───────────────────────────
  const [showIdleModal, setShowIdleModal] = useState(false);
  const [countdown, setCountdown] = useState(COUNTDOWN_TOTAL_SECONDS);
  const idleTimerRef = useRef(null);
  const countdownIntervalRef = useRef(null);

  const resetIdleTimer = useCallback(() => {
    if (showIdleModal) return;

    if (idleTimerRef.current) clearTimeout(idleTimerRef.current);

    idleTimerRef.current = setTimeout(() => {
      setShowIdleModal(true);
      setCountdown(COUNTDOWN_TOTAL_SECONDS);
    }, INACTIVITY_TIMEOUT_MS);
  }, [showIdleModal]);

  useEffect(() => {
    if (!showIdleModal) {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
      return;
    }

    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(countdownIntervalRef.current);
          setShowIdleModal(false);
          logout();
          navigate('/login?reason=session_expired', { replace: true });
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => {
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [showIdleModal, logout, navigate]);

  useEffect(() => {
    const activityEvents = ['mousemove', 'keydown', 'touchstart', 'scroll', 'click'];
    const onUserActivity = () => resetIdleTimer();

    activityEvents.forEach((evt) => window.addEventListener(evt, onUserActivity, { passive: true }));
    resetIdleTimer();

    return () => {
      activityEvents.forEach((evt) => window.removeEventListener(evt, onUserActivity));
      if (idleTimerRef.current) clearTimeout(idleTimerRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [resetIdleTimer]);

  const handleStaySignedIn = async () => {
    try {
      await refreshUser();
    } catch {
      // Ignore background refresh failure
    }
    setShowIdleModal(false);
    resetIdleTimer();
  };

  const handleSignOutNow = () => {
    setShowIdleModal(false);
    logout();
    navigate('/login', { replace: true });
  };

  // ── Realtime Alerts & Medication Reminders System ─────────────────────
  const [activeClinicalAlert, setActiveClinicalAlert] = useState(null);
  const [medicationReminder, setMedicationReminder] = useState(null);
  const [stockOutAlerts, setStockOutAlerts] = useState([]);
  const [caregiverMissedAlert, setCaregiverMissedAlert] = useState(null);

  // Helper to read/write persistent session sets for alert dismissal and chime deduplication
  const getSessionAlertSet = (key) => {
    try {
      return new Set(JSON.parse(sessionStorage.getItem(key) || '[]'));
    } catch {
      return new Set();
    }
  };

  const saveSessionAlertSet = (key, set) => {
    try {
      sessionStorage.setItem(key, JSON.stringify(Array.from(set)));
    } catch {
      // Ignore storage write issues
    }
  };

  const dismissedAlertIdsRef = useRef(getSessionAlertSet('careoclock_dismissed_alerts'));
  const chimedAlertIdsRef = useRef(getSessionAlertSet('careoclock_chimed_alerts'));
  const chimedSlotRef = useRef('');

  const checkRealtimeTelemetryAndAlerts = useCallback(async () => {
    // Skip polling if offline or if this browser tab is currently hidden/in the background
    if (!user || !navigator.onLine || (typeof document !== 'undefined' && document.hidden)) return;

    try {
      // 1. Check for Active Clinical Alerts across all roles
      try {
        const alertRes = await api.get('/clinical/alerts?status=active');
        const alertList = alertRes.data?.alerts || [];
        const criticalAlert = alertList.find(
          (a) =>
            (a.tier === 'Critical' || a.tier === 'High') &&
            !dismissedAlertIdsRef.current.has(a._id)
        );

        if (criticalAlert) {
          setActiveClinicalAlert(criticalAlert);
          if (!chimedAlertIdsRef.current.has(criticalAlert._id)) {
            chimedAlertIdsRef.current.add(criticalAlert._id);
            saveSessionAlertSet('careoclock_chimed_alerts', chimedAlertIdsRef.current);
            playNotificationSound('critical');
          }
        } else {
          setActiveClinicalAlert(null);
        }
      } catch {
        // Alerts service silent fallback
      }

      // 2. Patient Specific Checks (Medication time sound reminder & stock out)
      if (user.role === 'patient') {
        try {
          const medRes = await api.get('/medicines');
          const medicines = medRes.data?.medicines || [];

          // Out of stock & low stock detection
          const depleted = medicines.filter((m) => m.stockCount === 0);
          setStockOutAlerts(depleted);

          // Scheduled dose time reminder with sound
          const currentSlot = getCurrentDailySlot();
          const scheduledForCurrentSlot = medicines.filter((m) => m.schedule?.includes(currentSlot));

          if (scheduledForCurrentSlot.length > 0) {
            const slotKey = `${new Date().toDateString()}_${currentSlot}`;
            if (chimedSlotRef.current !== slotKey) {
              chimedSlotRef.current = slotKey;
              playNotificationSound('reminder');
              setMedicationReminder({
                slot: currentSlot,
                medicines: scheduledForCurrentSlot,
              });
            }
          }
        } catch {
          // Medicines silent fallback
        }
      }

      // 3. Caregiver Specific Checks (Missed medication for loved ones)
      if (user.role === 'caregiver') {
        const currentHour = new Date().getHours();
        if (currentHour >= 12) {
          try {
            const linksRes = await api.get('/caregiver/links');
            const activeLinks = (linksRes.data?.links || []).filter((l) => l.status === 'active');

            for (const link of activeLinks) {
              const pid = link.patientId?._id;
              if (!pid) continue;

              const medRes = await api.get(`/medicines?patientId=${pid}`);
              const meds = medRes.data?.medicines || [];
              const morningMeds = meds.filter((m) => m.schedule?.includes('morning'));

              if (morningMeds.length > 0) {
                // Check if patient logged vitals/check-in today
                const vitalsRes = await api.get(`/clinical/vitals?patientId=${pid}&limit=1`);
                const latest = vitalsRes.data?.vitals?.[0];
                const todayStr = new Date().toISOString().slice(0, 10);
                const latestStr = latest?.recordedAt ? new Date(latest.recordedAt).toISOString().slice(0, 10) : '';

                if (latestStr !== todayStr) {
                  const pName = link.patientId?.userId?.displayName || 'Your loved one';
                  setCaregiverMissedAlert({
                    patientName: pName,
                    phone: link.patientId?.phone || '',
                    medNames: morningMeds.map((m) => m.name).join(', '),
                  });
                  break;
                }
              }
            }
          } catch {
            // Caregiver silent fallback
          }
        }
      }
    } catch {
      // General telemetry error catch
    }
  }, [user]);

  // Periodic polling for realtime notifications
  useEffect(() => {
    checkRealtimeTelemetryAndAlerts();
    const interval = setInterval(checkRealtimeTelemetryAndAlerts, 25000); // 25s live check

    // Listen to custom local application event bus for instant auto-refresh
    const onLocalRefresh = () => checkRealtimeTelemetryAndAlerts();
    window.addEventListener('careoclock:refresh', onLocalRefresh);

    // When user switches back to this tab, check immediately
    const onVisibilityChange = () => {
      if (!document.hidden) {
        checkRealtimeTelemetryAndAlerts();
      }
    };
    document.addEventListener('visibilitychange', onVisibilityChange);

    return () => {
      clearInterval(interval);
      window.removeEventListener('careoclock:refresh', onLocalRefresh);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [checkRealtimeTelemetryAndAlerts]);

  // Resolve exact telemetry URL based on role and alerted patient ID
  const getAlertTelemetryUrl = (alert) => {
    if (!alert) return '/app/health';
    const pid =
      typeof alert.patientId === 'object' && alert.patientId !== null
        ? alert.patientId._id
        : alert.patientId;

    if (user?.role === 'doctor') {
      return pid ? `/app/doctor?patientId=${pid}` : '/app/doctor';
    }
    if (user?.role === 'caregiver') {
      return pid ? `/app/health?patientId=${pid}` : '/app/caregiver';
    }
    return '/app/health';
  };

  // Explicitly acknowledge alert in backend & hide banner
  const handleAcknowledgeAlert = async (alertId) => {
    if (!alertId) return;
    try {
      dismissedAlertIdsRef.current.add(alertId);
      saveSessionAlertSet('careoclock_dismissed_alerts', dismissedAlertIdsRef.current);
      setActiveClinicalAlert(null);

      await api.patch(`/clinical/alerts/${alertId}/acknowledge`, {
        resolutionNotes: `Checked and acknowledged by ${user?.role || 'user'}`,
      });

      window.dispatchEvent(new CustomEvent('careoclock:refresh'));
    } catch (err) {
      console.error('Failed to acknowledge clinical alert:', err);
    }
  };

  // Dismiss alert notification for this session/user without resolving globally
  const handleDismissAlert = async (alertId) => {
    if (!alertId) return;
    try {
      dismissedAlertIdsRef.current.add(alertId);
      saveSessionAlertSet('careoclock_dismissed_alerts', dismissedAlertIdsRef.current);
      setActiveClinicalAlert(null);

      await api.patch(`/clinical/alerts/${alertId}/dismiss`).catch(() => {});
    } catch (err) {
      console.error('Failed to dismiss alert:', err);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-paper text-ink relative">
      <a href="#main-content" className="skip-link">
        Skip to content
      </a>

      {/* ── 1. Critical Alert: Connection Lost While Working (Sticky Banner) ── */}
      {isOffline && (
        <div
          role="alert"
          aria-live="assertive"
          className="sticky top-0 z-50 bg-rose-600 text-white px-4 py-3 shadow-md flex items-center justify-between gap-3 text-sm font-semibold"
        >
          <div className="flex items-center gap-2.5 max-w-4xl mx-auto flex-1">
            <WifiOff size={18} className="shrink-0 animate-pulse" />
            <span>
              You are currently offline. Any new readings or entries are preserved locally and will sync as soon as your connection is restored.
            </span>
          </div>
          <span className="text-xs bg-rose-700/80 px-2 py-1 rounded font-mono">
            Offline Mode
          </span>
        </div>
      )}

      {/* ── 2. Informational Alert: Back Online / Reconnected Toast ──────── */}
      {showBackOnlineToast && (
        <div
          role="status"
          aria-live="polite"
          className="fixed bottom-6 right-6 z-50 bg-emerald-600 text-white px-4 py-3 rounded-ritual shadow-xl border border-emerald-500/40 flex items-center gap-3 animate-slide-up text-sm font-semibold"
        >
          <Wifi size={18} className="shrink-0" />
          <span>Back online! Connection to CareOClock servers restored.</span>
          <button
            type="button"
            onClick={() => setShowBackOnlineToast(false)}
            className="text-white/80 hover:text-white ml-1"
          >
            <X size={15} />
          </button>
        </div>
      )}

      {/* ── 3. Emergency / Critical Clinical Alert Banner (All Roles) ────── */}
      {activeClinicalAlert && (
        <div
          role="alert"
          className="bg-rose-700 text-white px-4 py-3 shadow-lg flex items-center justify-between gap-4 text-xs sm:text-sm font-semibold sticky top-0 z-40 animate-fade-in"
        >
          <div className="flex items-center gap-3 max-w-4xl mx-auto flex-1">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0 animate-pulse">
              <AlertCircle size={20} className="text-white" />
            </div>
            <div>
              <span className="uppercase tracking-wider text-[10px] bg-white/20 px-2 py-0.5 rounded font-mono font-bold mr-2">
                {activeClinicalAlert.tier} Risk Telemetry
              </span>
              <span>
                {activeClinicalAlert.title || 'Abnormal vital signs detected'}: {activeClinicalAlert.message}
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to={getAlertTelemetryUrl(activeClinicalAlert)}
              className="px-3.5 py-1.5 rounded-full bg-white text-rose-800 text-xs font-bold hover:bg-rose-50 transition-all shrink-0 shadow-sm"
            >
              View Telemetry
            </Link>

            <button
              onClick={() => handleAcknowledgeAlert(activeClinicalAlert._id)}
              className="px-3 py-1.5 rounded-full bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold transition-all shrink-0 flex items-center gap-1 shadow-sm"
              title="Acknowledge and mark alert as checked"
            >
              <CheckCircle2 size={13} />
              <span>Mark as Checked</span>
            </button>

            <button
              onClick={() => handleDismissAlert(activeClinicalAlert._id)}
              className="text-white/80 hover:text-white p-1 rounded"
              title="Dismiss notification"
              aria-label="Dismiss alert"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── 4. Scheduled Medication Time Reminder with Sound (Patient) ──── */}
      {medicationReminder && user?.role === 'patient' && (
        <div
          role="status"
          className="bg-brand text-white px-4 py-3 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-fade-in"
        >
          <div className="flex items-center gap-3 max-w-4xl mx-auto flex-1">
            <div className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center shrink-0">
              <Pill size={18} className="text-white" />
            </div>
            <div>
              <span className="font-bold block sm:inline mr-2">
                ⏰ Time for your {medicationReminder.slot} medicine!
              </span>
              <span className="text-white/90">
                Scheduled: {medicationReminder.medicines.map((m) => m.name).join(', ')}.
              </span>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              to="/app/medicine"
              onClick={() => setMedicationReminder(null)}
              className="px-3.5 py-1 rounded-full bg-white text-brand font-bold text-xs hover:bg-brand-light transition-all shadow-sm"
            >
              Take Now
            </Link>
            <button
              onClick={() => setMedicationReminder(null)}
              className="text-white/80 hover:text-white p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── 5. Prescription Out of Stock Alert Banner (Patient) ─────────── */}
      {stockOutAlerts.length > 0 && user?.role === 'patient' && (
        <div
          role="alert"
          className="bg-rose-600 text-white px-4 py-2.5 shadow-sm flex items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-fade-in"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
            <AlertTriangle size={18} className="shrink-0 text-rose-200" />
            <span>
              <strong>Out of Stock:</strong> You have run out of{' '}
              {stockOutAlerts.map((m) => m.name).join(', ')} ({stockOutAlerts.length} prescription
              {stockOutAlerts.length > 1 ? 's' : ''}). Please refill your inventory.
            </span>
          </div>

          <Link
            to="/app/medicine"
            className="px-3 py-1 rounded-full bg-white text-rose-700 text-xs font-bold shrink-0 hover:bg-rose-50"
          >
            Refill Stock
          </Link>
        </div>
      )}

      {/* ── 6. Caregiver Missed Medication Notification Banner ──────────── */}
      {caregiverMissedAlert && user?.role === 'caregiver' && (
        <div
          role="alert"
          className="bg-amber-600 text-white px-4 py-3 shadow-md flex items-center justify-between gap-3 text-xs sm:text-sm font-medium animate-fade-in"
        >
          <div className="flex items-center gap-2.5 max-w-4xl mx-auto flex-1">
            <Pill size={18} className="shrink-0 text-amber-200" />
            <span>
              <strong>Medication Check:</strong> {caregiverMissedAlert.patientName} has not logged their morning doses yet ({caregiverMissedAlert.medNames}). Call to ensure they are on track.
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {caregiverMissedAlert.phone && (
              <a
                href={`tel:${caregiverMissedAlert.phone}`}
                className="px-3.5 py-1 rounded-full bg-white text-amber-800 text-xs font-bold flex items-center gap-1 shadow-sm hover:bg-amber-50"
              >
                <Phone size={12} /> Call Loved One
              </a>
            )}
            <button
              onClick={() => setCaregiverMissedAlert(null)}
              className="text-white/80 hover:text-white p-1"
            >
              <X size={16} />
            </button>
          </div>
        </div>
      )}

      {/* ── 7. System Health Degradation Notice ─────────────────────────── */}
      {isServiceDegraded && !isDismissedDegraded && !isOffline && (
        <div
          role="alert"
          className="bg-amber-600 text-white px-4 py-2.5 shadow-sm flex items-center justify-between gap-3 text-xs sm:text-sm font-medium"
        >
          <div className="flex items-center gap-2 max-w-4xl mx-auto flex-1">
            <AlertTriangle size={18} className="shrink-0 text-amber-200" />
            <span>
              System Notice: Central health telemetry service is operating in reduced redundancy mode. Immediate medical emergency? Please contact your primary clinic or emergency services directly.
            </span>
          </div>
          <button
            type="button"
            onClick={() => setIsDismissedDegraded(true)}
            className="text-white/80 hover:text-white p-1 rounded"
            aria-label="Dismiss notice"
          >
            <X size={16} />
          </button>
        </div>
      )}

      <Navbar />

      <main id="main-content" className="flex-1 max-w-5xl w-full mx-auto px-4 py-8">
        <Outlet />
      </main>

      {/* Persistent Non-Diagnostic Clinical Safety Disclaimer */}
      <footer className="border-t border-line bg-surface mt-auto">
        <p className="max-w-5xl mx-auto px-4 py-3 text-sm text-ink-soft">
          {CONFIG.NON_DIAGNOSTIC_DISCLAIMER}
        </p>
      </footer>

      {/* ── 8. Session Idle Inactivity Countdown Modal ─────────────────── */}
      {showIdleModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="idle-warning-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
        >
          <div className="w-full max-w-md bg-surface rounded-ritual shadow-2xl border border-line p-6 space-y-4 animate-scale-up text-ink">
            <div className="flex items-center gap-3 text-amber-600">
              <div className="w-10 h-10 rounded-full bg-amber-100 flex items-center justify-center shrink-0">
                <Clock size={22} className="text-amber-700" />
              </div>
              <div>
                <h3 id="idle-warning-title" className="font-display font-bold text-lg text-ink">
                  Still with us, {user?.displayName?.split(' ')[0] || 'there'}?
                </h3>
                <span className="text-xs text-ink-soft">Automatic Session Security Lock</span>
              </div>
            </div>

            <p className="text-sm text-ink-soft leading-relaxed">
              To protect your sensitive clinical health telemetry and private medical records, your session will automatically expire in{' '}
              <strong className="text-amber-700 font-mono text-base font-bold">
                {Math.floor(countdown / 60)}:{String(countdown % 60).padStart(2, '0')}
              </strong>.
            </p>

            <div className="p-3 rounded-ritual bg-brand-light/20 border border-brand/20 flex items-center gap-2 text-xs text-brand-dark">
              <ShieldCheck size={16} className="text-brand shrink-0" />
              <span>Tapping &quot;Stay Signed In&quot; will refresh your encrypted session token.</span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
              <button
                type="button"
                onClick={handleSignOutNow}
                className="px-4 py-2.5 rounded-full border border-line text-xs font-semibold text-ink-soft hover:bg-paper"
              >
                Sign Out Now
              </button>
              <button
                type="button"
                onClick={handleStaySignedIn}
                className="px-5 py-2.5 rounded-full bg-brand hover:bg-brand-dark text-white text-xs font-bold shadow-sm transition-all flex items-center gap-1.5"
              >
                <RefreshCw size={14} />
                <span>Stay Signed In</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
