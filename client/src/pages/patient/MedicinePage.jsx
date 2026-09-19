import { Pill, ShieldCheck } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import MedicineManager from '../../components/MedicineManager';

export default function MedicinePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
              <Pill size={18} />
            </div>
            <h1 className="text-h1 font-display text-ink">Medication Management</h1>
          </div>
          <p className="text-sm text-ink-soft mt-1 max-w-2xl">
            Maintain your prescribed medicine schedules, track inventory stock, and log daily routine adherence. Doses recorded here calibrate your overall clinical stability.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-teal-50 border border-teal-200 text-teal-800 text-xs font-semibold">
            <ShieldCheck size={14} className="text-teal-600" />
            <span>PDC Adherence Verified</span>
          </span>
        </div>
      </div>

      {/* ── Main Medication Manager Hub ──────────────────────────────── */}
      <MedicineManager userRole={user?.role || 'patient'} />
    </div>
  );
}
