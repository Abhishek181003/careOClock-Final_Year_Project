import { useAuth } from '../../context/AuthContext';
import ReportManager from '../../components/ReportManager';

export default function ReportsPage() {
  const { user } = useAuth();

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-h1 font-display text-ink">Medical Records & Reports</h1>
        <p className="text-sm text-ink-soft mt-1">
          Securely upload, view, and organize verified clinical prescriptions, lab results, and discharge notes.
        </p>
      </div>

      <div className="rounded-ritual bg-surface border border-line shadow-ritual p-6">
        <ReportManager userRole={user?.role || 'patient'} />
      </div>
    </div>
  );
}
