import { Info, Activity, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import RiskBadge from './RiskBadge';
import { CONFIG } from '../config';
import './dashboards/Dashboards.css';

/**
 * Renders a RiskAssessment record, shaped by role:
 *  - patient / caregiver: overall tier + overall score + single deterministic plain-language sentence.
 *  - doctor: the above, plus Layer 1 Home-NEWS breakdown and Layer 2 feature-deviation table.
 */
export default function AssessmentCard({ assessment, role, variant }) {
  const showDoctorDetail = (variant ?? role) === 'doctor';

  if (!assessment) {
    return (
      <div className="assess-card">
        <div className="assess-card__tier-bar assess-card__tier-bar--pending" />
        <div className="assess-card__body text-ink-soft">
          No assessment recorded yet — it will appear following your next scheduled check-in.
        </div>
      </div>
    );
  }

  const tier = (assessment.tier || assessment.overallTier || 'stable').toLowerCase();
  const overallScore = assessment.overallScore ?? assessment.score;
  const plainLanguageSummary =
    assessment.plainLanguageSummary ||
    assessment.explanation ||
    assessment.doctorExplanation?.summary ||
    'All vital signs remain within expected resting bounds.';
  const baselineStatus = assessment.baselineStatus;

  return (
    <div className={`assess-card assess-card--${tier}`}>
      {/* Top severity colored bar */}
      <div className={`assess-card__tier-bar assess-card__tier-bar--${tier}`} />

      <div className="assess-card__body">
        {/* Top Header */}
        <div className="assess-card__top">
          <RiskBadge tier={tier} size={showDoctorDetail ? 'md' : 'lg'} />
          {typeof overallScore === 'number' && (
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold text-ink-soft uppercase tracking-wider">Clinical Score</span>
              <span className="px-2.5 py-0.5 rounded-full text-xs font-bold font-mono bg-paper border border-line text-ink">
                {overallScore}/100
              </span>
            </div>
          )}
        </div>

        {/* Baseline building notice */}
        {baselineStatus === 'building' && (
          <div className="my-3 p-3 rounded-xl bg-brand/5 border border-brand/20 flex items-start gap-2.5 text-xs text-ink leading-relaxed">
            <Info size={16} className="text-brand shrink-0 mt-0.5" />
            <div>
              <strong>Personal Baseline Learning:</strong> Your individual health profile needs about 7 days of regular check-ins to establish personal resting ranges. Sudden-change alerts remain active in the meantime.
            </div>
          </div>
        )}

        {/* Plain language summary */}
        <p className="assess-card__summary">{plainLanguageSummary}</p>

        {/* Disclaimer for patient & caregiver */}
        {!showDoctorDetail && (
          <p className="assess-card__disclaimer">
            {CONFIG.NON_DIAGNOSTIC_DISCLAIMER}
          </p>
        )}

        {/* Doctor detail - Layer 1 Home-NEWS */}
        {showDoctorDetail && assessment.layer1 && (
          <div className="mt-5 pt-4 border-t border-line">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-ink flex items-center gap-1.5">
                <Activity size={14} className="text-brand" />
                Layer 1 — Modified Home-NEWS Breakdown
              </h3>
              <span className="text-xs font-bold text-ink px-2 py-0.5 rounded bg-paper border border-line">
                Subtotal: {assessment.layer1.subtotal ?? assessment.layer1.news2Subtotal ?? 0} pts
              </span>
            </div>
            {Array.isArray(assessment.layer1.points) && assessment.layer1.points.length > 0 ? (
              <div className="grid sm:grid-cols-2 gap-2 text-xs">
                {assessment.layer1.points.map((row, idx) => (
                  <div key={row.label || idx} className="flex justify-between items-center p-2 rounded-lg bg-paper/60 border border-line">
                    <span className="text-ink-soft font-medium truncate pr-2">{row.label}</span>
                    <span className={`font-mono font-bold px-1.5 py-0.5 rounded ${row.points > 0 ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'}`}>
                      {row.points > 0 ? `+${row.points}` : '0'} pt
                    </span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-ink-soft italic">No Home-NEWS points triggered.</p>
            )}
          </div>
        )}

        {/* Doctor detail - Layer 2 Personal Baseline Deviations */}
        {showDoctorDetail && assessment.layer2 && Array.isArray(assessment.layer2.deviations) && assessment.layer2.deviations.length > 0 && (
          <div className="mt-5 pt-4 border-t border-line">
            <h3 className="text-xs font-bold uppercase tracking-wider text-ink mb-2">
              Layer 2 — Personal Baseline Deviations
            </h3>
            <div className="overflow-x-auto rounded-lg border border-line">
              <table className="w-full text-xs text-left">
                <thead className="bg-paper text-ink-soft uppercase border-b border-line">
                  <tr>
                    <th className="py-2 px-3">Feature</th>
                    <th className="py-2 px-3">Current</th>
                    <th className="py-2 px-3">Baseline (&mu; &plusmn; &sigma;)</th>
                    <th className="py-2 px-3">Deviation (z)</th>
                    <th className="py-2 px-3">Trend</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-line bg-surface">
                  {[...assessment.layer2.deviations]
                    .sort((a, b) => Math.abs(b.zScore || 0) - Math.abs(a.zScore || 0))
                    .map((row) => {
                      const isHighDev = Math.abs(row.zScore || 0) >= 2.0;
                      return (
                        <tr key={row.feature} className={`hover:bg-paper/40 ${isHighDev ? 'bg-amber-500/5' : ''}`}>
                          <td className="py-2 px-3 font-medium text-ink">{row.feature}</td>
                          <td className="py-2 px-3 font-mono font-semibold text-ink">{row.current}</td>
                          <td className="py-2 px-3 text-ink-soft font-mono">
                            {row.baselineMean} &plusmn; {row.baselineSD}
                          </td>
                          <td className="py-2 px-3 font-mono">
                            <span className={`px-1.5 py-0.5 rounded font-bold ${
                              isHighDev ? 'bg-rose-100 text-rose-800' : 'bg-paper text-ink'
                            }`}>
                              {row.zScore ? (row.zScore > 0 ? `+${row.zScore.toFixed(1)}` : row.zScore.toFixed(1)) : '0.0'} SD
                            </span>
                          </td>
                          <td className="py-2 px-3 text-ink-soft">
                            {row.trend === 'increasing' || row.trend === 'up' ? (
                              <span className="inline-flex items-center text-rose-600 gap-0.5 font-medium">
                                <ArrowUpRight size={13} /> Elevated
                              </span>
                            ) : row.trend === 'decreasing' || row.trend === 'down' ? (
                              <span className="inline-flex items-center text-blue-600 gap-0.5 font-medium">
                                <ArrowDownRight size={13} /> Lower
                              </span>
                            ) : (
                              <span className="inline-flex items-center text-emerald-600 gap-0.5 font-medium">
                                <Minus size={13} /> Stable
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
