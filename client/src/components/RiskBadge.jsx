import { CheckCircle2, AlertTriangle, AlertOctagon, PhoneCall, Clock } from 'lucide-react';
import './dashboards/Dashboards.css';

const TIERS = {
  stable: { label: 'Stable', classModifier: 'stable', Icon: CheckCircle2 },
  low: { label: 'Stable', classModifier: 'stable', Icon: CheckCircle2 },
  moderate: { label: 'Moderate', classModifier: 'moderate', Icon: AlertTriangle },
  medium: { label: 'Moderate', classModifier: 'moderate', Icon: AlertTriangle },
  high: { label: 'High Risk', classModifier: 'high', Icon: AlertOctagon },
  critical: { label: 'Critical', classModifier: 'critical', Icon: PhoneCall },
  pending: { label: 'Pending Check-In', classModifier: 'pending', Icon: Clock },
};

/**
 * Severity is coded three ways at once (color + icon + word) on purpose (WCAG 1.4.1).
 * Sizes: 'sm', 'md', 'lg'.
 */
export default function RiskBadge({ tier = 'stable', size = 'md' }) {
  const normalizedKey = (tier || 'stable').toLowerCase();
  const config = TIERS[normalizedKey] ?? TIERS.stable;
  const { label, classModifier, Icon } = config;
  const iconSize = size === 'lg' ? 20 : size === 'sm' ? 13 : 16;

  return (
    <span
      className={`risk-badge risk-badge--${size} risk-badge--${classModifier}`}
      role="status"
    >
      <Icon aria-hidden="true" size={iconSize} />
      <span>{label}</span>
    </span>
  );
}
