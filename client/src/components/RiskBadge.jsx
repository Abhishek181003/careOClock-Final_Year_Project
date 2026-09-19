import { CheckCircle2, AlertTriangle, AlertOctagon, PhoneCall, Clock } from 'lucide-react';

const TIERS = {
  stable: { label: 'Stable', color: 'bg-tier-stable', Icon: CheckCircle2 },
  low: { label: 'Stable', color: 'bg-tier-stable', Icon: CheckCircle2 },
  moderate: { label: 'Moderate', color: 'bg-tier-moderate', Icon: AlertTriangle },
  medium: { label: 'Moderate', color: 'bg-tier-moderate', Icon: AlertTriangle },
  high: { label: 'High', color: 'bg-tier-high', Icon: AlertOctagon },
  critical: { label: 'Critical', color: 'bg-tier-critical', Icon: PhoneCall },
  pending: { label: 'Pending Check-In', color: 'bg-slate-500', Icon: Clock },
};

// Severity is coded three ways at once (color + icon + word) on purpose —
// color alone is never the only signal (WCAG 1.4.1), and a hurried or
// color-blind reader still gets "Critical" from the icon and the word alone.
export default function RiskBadge({ tier = 'stable', size = 'md' }) {
  const normalizedKey = (tier || 'stable').toLowerCase();
  const config = TIERS[normalizedKey] ?? TIERS.stable;
  const { label, color, Icon } = config;
  const padding = size === 'lg' ? 'px-4 py-2 text-h3' : 'px-3 py-1.5 text-base';

  return (
    <span
      className={`inline-flex items-center gap-2 rounded-full text-white font-display font-semibold ${color} ${padding}`}
      role="status"
    >
      <Icon aria-hidden="true" size={size === 'lg' ? 22 : 18} />
      {label}
    </span>
  );
}
