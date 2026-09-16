import Vitals from '../models/Vitals.js';
import Prediction from '../models/Prediction.js';
import Patient from '../models/Patient.js';
import { evaluateVitals } from './aiEngineService.js';
import { aggregate } from './aggregatorService.js';
import { dispatchAlert } from './alertDispatchService.js';

/**
 * Re-evaluates vitals records whose risk assessments were marked 'Pending' or missing
 * due to temporary AI microservice outages or network partitions (Fail-Open Recovery M-3).
 */
export async function reEvaluatePendingVitals({ limit = 50 } = {}) {
  // Find predictions that are pending or unavailable
  const pendingPredictions = await Prediction.find({
    $or: [{ overallTier: 'Pending' }, { baselineStatus: 'unavailable' }],
  })
    .sort({ recordedAt: 1 })
    .limit(limit);

  const results = {
    processedCount: pendingPredictions.length,
    recoveredCount: 0,
    failedCount: 0,
    details: [],
  };

  for (const pred of pendingPredictions) {
    try {
      const vitals = await Vitals.findById(pred.vitalsId);
      if (!vitals) {
        results.failedCount++;
        results.details.push({ predictionId: pred._id, error: 'Linked vitals record not found' });
        continue;
      }

      const patient = await Patient.findById(pred.patientId);

      // 30-day trailing history window
      const thirtyDaysAgo = new Date(new Date(vitals.recordedAt).getTime() - 30 * 24 * 60 * 60 * 1000);
      const history = await Vitals.find({
        patientId: pred.patientId,
        recordedAt: { $gte: thirtyDaysAgo, $lt: vitals.recordedAt },
      }).sort({ recordedAt: 1 });

      const { layer1, layer2, layer2Failed, networkLatencyMs } = await evaluateVitals(
        pred.patientId,
        vitals,
        history
      );

      if (layer1 && !layer2Failed) {
        const updatedEntity = aggregate({
          patientId: pred.patientId,
          vitalsId: vitals._id,
          recordedAt: vitals.recordedAt,
          layer1Result: layer1,
          layer2Result: layer2,
          layer2Failed: false,
          networkLatencyMs,
        });

        // Update existing prediction
        Object.assign(pred, updatedEntity);
        await pred.save();

        // Check if recovered prediction triggers clinical alert
        if (pred.overallTier === 'Critical' || pred.overallTier === 'High') {
          if (patient) {
            await dispatchAlert({ prediction: pred, patient, vitals });
          }
        }

        results.recoveredCount++;
        results.details.push({
          predictionId: pred._id,
          vitalsId: vitals._id,
          newTier: pred.overallTier,
          newScore: pred.overallScore,
          status: 'recovered',
        });
      } else {
        results.failedCount++;
        results.details.push({
          predictionId: pred._id,
          error: 'AI service still unreachable or degraded for this reading',
        });
      }
    } catch (err) {
      results.failedCount++;
      results.details.push({ predictionId: pred._id, error: err.message });
    }
  }

  return results;
}
