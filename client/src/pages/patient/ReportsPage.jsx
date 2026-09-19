import { FileText, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import ReportManager from '../../components/ReportManager';

export default function ReportsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
              <FileText size={18} />
            </div>
            <h1 className="text-h1 font-display text-ink">Medical Records & Reports</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1 max-w-2xl">
            Securely upload, view, and organize verified clinical prescriptions, lab panels, and diagnostic imaging. Your designated healthcare circle can view these documents for coordinated clinical care.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>256-Bit Encrypted Storage</span>
          </span>
        </div>
      </div>

      {/* ── Main Report Manager Hub ──────────────────────────────────── */}
      <ReportManager userRole={user?.role || 'patient'} />
    </div>
  );
}
