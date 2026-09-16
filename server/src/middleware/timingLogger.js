/**
 * Performance Timing Logger (NFR2)
 * Logs and audits microservice round-trip latencies against the 800ms non-functional requirement.
 */

export function logAiPerformance(elapsedMs, context = {}) {
  const patientStr = context.patientId ? ` for patient ${context.patientId}` : '';

  if (elapsedMs > 800) {
    console.warn(
      `[AI-PERF-WARN] Round-trip latency (${elapsedMs}ms)${patientStr} EXCEEDED the 800ms NFR2 budget!`
    );
  } else {
    console.log(
      `[AI-PERF] AI Engine evaluation${patientStr} completed in ${elapsedMs}ms (NFR2 budget: 800ms) - STATUS: OK`
    );
  }
}
