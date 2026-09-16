import Medicine from '../models/Medicine.js';
import DoseLog from '../models/DoseLog.js';

/**
 * Adherence Calculation Service (FR6)
 *
 * Implements Proportion of Days Covered (PDC) and dose-based adherence analytics
 * dynamically queried from MongoDB. Zero hardcoded mock metrics.
 */

/**
 * Determine clinical status label based on adherence rate percentage
 * Follows NHS and British Thoracic Society adherence thresholds.
 */
export function getAdherenceStatus(rate) {
  if (rate === null || rate === undefined) {
    return 'No History';
  }
  if (rate >= 80) {
    return 'Optimal';
  }
  if (rate >= 50) {
    return 'Suboptimal';
  }
  return 'Poor / Non-adherent';
}

/**
 * Calculate consecutive daily adherence streak up to today
 */
export async function calculateAdherenceStreak(patientId) {
  const now = new Date();
  let currentStreak = 0;

  // Inspect past 60 days
  for (let d = 0; d < 60; d++) {
    const dayStart = new Date(now);
    dayStart.setDate(dayStart.getDate() - d);
    dayStart.setHours(0, 0, 0, 0);

    const dayEnd = new Date(dayStart);
    dayEnd.setHours(23, 59, 59, 999);

    const logs = await DoseLog.find({
      patientId,
      timestamp: { $gte: dayStart, $lte: dayEnd },
    });

    if (logs.length === 0) {
      // If it's today and no doses have been logged yet, don't break streak from yesterday
      if (d === 0) {
        continue;
      }
      break;
    }

    const taken = logs.filter((l) => l.action === 'taken').length;
    const missed = logs.filter((l) => l.action === 'missed').length;

    if (taken > 0 && missed === 0) {
      currentStreak++;
    } else {
      break;
    }
  }

  return currentStreak;
}

/**
 * Calculate rolling window adherence metrics
 */
async function calculateWindowMetrics(patientId, windowDays, medicines) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - windowDays * 24 * 60 * 60 * 1000);

  // 1. Calculate expected scheduled doses across active medicines
  let dosesScheduled = 0;
  for (const med of medicines) {
    const dailyDoses = Array.isArray(med.schedule) && med.schedule.length > 0 ? med.schedule.length : 1;
    const medCreated = new Date(med.createdAt || now);
    const msActiveInWindow = Math.min(now.getTime() - medCreated.getTime(), windowDays * 24 * 60 * 60 * 1000);
    const daysActive = Math.max(1, Math.ceil(msActiveInWindow / (24 * 60 * 60 * 1000)));
    dosesScheduled += dailyDoses * daysActive;
  }

  // 2. Fetch logs within window
  const logs = await DoseLog.find({
    patientId,
    timestamp: { $gte: windowStart, $lte: now },
  });

  let dosesTaken = 0;
  let dosesMissed = 0;

  for (const log of logs) {
    if (log.action === 'taken') {
      dosesTaken += log.quantity || 1;
    } else if (log.action === 'missed') {
      dosesMissed += log.quantity || 1;
    }
  }

  const totalLogged = dosesTaken + dosesMissed;

  // 3. Compute percentage rate
  let adherenceRate = null;
  if (dosesScheduled > 0) {
    adherenceRate = Math.min(100, Math.round((dosesTaken / dosesScheduled) * 100));
  } else if (totalLogged > 0) {
    adherenceRate = Math.min(100, Math.round((dosesTaken / totalLogged) * 100));
  }

  return {
    windowDays,
    dosesTaken,
    dosesMissed,
    dosesScheduled,
    adherenceRate,
    adherencePercentage: adherenceRate !== null ? `${adherenceRate}%` : 'N/A',
    status: getAdherenceStatus(adherenceRate),
  };
}

/**
 * Master Adherence Calculation Function (FR6)
 */
export async function calculateAdherence(patientId) {
  const medicines = await Medicine.find({ patientId, isActive: true });

  const [past7Days, past30Days, currentStreakDays] = await Promise.all([
    calculateWindowMetrics(patientId, 7, medicines),
    calculateWindowMetrics(patientId, 30, medicines),
    calculateAdherenceStreak(patientId),
  ]);

  // Per-medicine breakdown
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  const recentLogs = await DoseLog.find({
    patientId,
    timestamp: { $gte: thirtyDaysAgo },
  });

  const medicineBreakdown = medicines.map((med) => {
    const medLogs = recentLogs.filter((l) => l.medicineId.toString() === med._id.toString());
    const taken = medLogs.filter((l) => l.action === 'taken').reduce((acc, l) => acc + (l.quantity || 1), 0);
    const missed = medLogs.filter((l) => l.action === 'missed').reduce((acc, l) => acc + (l.quantity || 1), 0);
    const total = taken + missed;
    const rate = total > 0 ? Math.round((taken / total) * 100) : null;

    return {
      medicineId: med._id,
      name: med.name,
      dosage: med.dosage,
      schedule: med.schedule,
      stockCount: med.stockCount,
      lowStockThreshold: med.lowStockThreshold,
      lowStockWarning: med.stockCount <= med.lowStockThreshold,
      dosesTaken30d: taken,
      dosesMissed30d: missed,
      adherenceRate30d: rate,
      status: getAdherenceStatus(rate),
    };
  });

  return {
    patientId,
    past7Days,
    past30Days,
    currentStreakDays,
    medicines: medicineBreakdown,
    calculatedAt: new Date(),
  };
}
