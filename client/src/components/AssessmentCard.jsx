import RiskBadge from './RiskBadge';
import { CONFIG } from '../config';

/**
 * Renders a RiskAssessment record, shaped by role:
 *  - patient / caregiver: overall tier + overall score + single deterministic plain-language sentence.
 *  - doctor: the above, plus Layer 1 Home-NEWS breakdown and Layer 2 feature-deviation table.
 */
export default function AssessmentCard({ assessment, role, variant }) {
  const showDoctorDetail = (variant ?? role) === 'doctor';

  if (!assessment) {
    return (
      <div className="rounded-ritual bg-surface border border-line p-6 text-ink-soft">
        No assessment recorded yet — it will appear following your next scheduled check-in.
      </div>
    );
  }

  const tier = assessment.tier || assessment.overallTier || 'stable';
  const overallScore = assessment.overallScore ?? assessment.score;
  const plainLanguageSummary =
    assessment.plainLanguageSummary ||
    assessment.explanation ||
    assessment.doctorExplanation?.summary ||
    'All vital signs remain within expected resting bounds.';
  const baselineStatus = assessment.baselineStatus;

  return (
    <div
      className={
        showDoctorDetail
          ? 'rounded-clinical border border-line bg-surface p-5'
          : 'rounded-ritual bg-surface shadow-ritual p-6'
      }
    >
      <div className="flex items-center justify-between gap-4 flex-wrap">
        <RiskBadge tier={tier} size={showDoctorDetail ? 'md' : 'lg'} />
        {typeof overallScore === 'number' && (
          <span className="text-ink-soft text-base">Score {overallScore}</span>
        )}
      </div>

      {baselineStatus === 'building' && (
        <p className="mt-3 text-base text-ink-soft">
          Your personal pattern is still building (needs about a week of check-ins).
          Sudden-change alerts are already active in the meantime.
        </p>
      )}

      <p className="mt-3 text-body">{plainLanguageSummary}</p>

      {!showDoctorDetail && (
        <p className="mt-4 text-sm text-ink-soft border-t border-line pt-3">
          {CONFIG.NON_DIAGNOSTIC_DISCLAIMER}
        </p>
      )}

      {showDoctorDetail && assessment.layer1 && (
        <div className="mt-5">
          <h3 className="text-h3 mb-2">Layer 1 — Modified Home-NEWS</h3>
          <p className="text-sm text-ink-soft mb-2">
            {assessment.layer1.subtotal ?? assessment.layer1.news2Subtotal ?? 0} points
          </p>
          {Array.isArray(assessment.layer1.points) && assessment.layer1.points.length > 0 && (
            <ul className="text-sm divide-y divide-line">
              {assessment.layer1.points.map((row) => (
                <li key={row.label} className="flex justify-between py-1.5">
                  <span>{row.label}</span>
                  <span className="font-medium">{row.points} pt</span>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

      {showDoctorDetail && assessment.layer2 && Array.isArray(assessment.layer2.deviations) && assessment.layer2.deviations.length > 0 && (
        <div className="mt-5">
          <h3 className="text-h3 mb-2">Layer 2 — Personal-baseline deviations</h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-ink-soft border-b border-line">
                  <th className="py-1.5 pr-3">Feature</th>
                  <th className="py-1.5 pr-3">Current</th>
                  <th className="py-1.5 pr-3">Baseline (mean ± SD)</th>
                  <th className="py-1.5 pr-3">Deviation</th>
                  <th className="py-1.5">Trend</th>
                </tr>
              </thead>
              <tbody>
                {[...assessment.layer2.deviations]
                  .sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))
                  .map((row) => (
                    <tr key={row.feature} className="border-b border-line last:border-0">
                      <td className="py-1.5 pr-3">{row.feature}</td>
                      <td className="py-1.5 pr-3">{row.current}</td>
                      <td className="py-1.5 pr-3">
                        {row.baselineMean} ± {row.baselineSD}
                      </td>
                      <td className="py-1.5 pr-3">{row.zScore ? row.zScore.toFixed(1) : 0} SD</td>
                      <td className="py-1.5">{row.trend || '—'}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
