import { useAuth } from '../../context/AuthContext';
import MedicineManager from '../../components/MedicineManager';

export default function MedicinePage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-display text-ink">Medication Management</h1>
        <p className="text-sm text-ink-soft mt-1">
          Maintain your prescribed medicine schedules, track inventory stock, and monitor daily routine adherence.
        </p>
      </div>

      <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6">
        <MedicineManager userRole={user?.role || 'patient'} />
      </div>
    </div>
  );
}
