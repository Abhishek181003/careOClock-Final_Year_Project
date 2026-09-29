import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { FileText, ShieldCheck, Users, Stethoscope, RefreshCw } from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { api } from '../../api/client';
import ReportManager from '../../components/ReportManager';

export default function ReportsPage() {
  const { user } = useAuth();
  const [searchParams, setSearchParams] = useSearchParams();
  const queryPatientId = searchParams.get('patientId') || '';

  const [patients, setPatients] = useState([]);
  const [selectedPatientId, setSelectedPatientId] = useState(queryPatientId);
  const [isLoadingPatients, setIsLoadingPatients] = useState(false);

  // Load patients if doctor or caregiver
  useEffect(() => {
    if (user?.role === 'doctor') {
      setIsLoadingPatients(true);
      api
        .get('/clinical/patients')
        .then((res) => {
          const list = res.data?.patients || [];
          setPatients(list);
          if (list.length > 0) {
            const initialId =
              queryPatientId && list.some((p) => p.id === queryPatientId)
                ? queryPatientId
                : list[0].id;
            setSelectedPatientId(initialId);
          }
        })
        .catch((err) => console.error('Failed to load doctor roster:', err))
        .finally(() => setIsLoadingPatients(false));
    } else if (user?.role === 'caregiver') {
      setIsLoadingPatients(true);
      api
        .get('/caregiver/links')
        .then((res) => {
          const activeLinks = (res.data?.links || []).filter((l) => l.status === 'active' && l.patientId);
          const list = activeLinks.map((l) => ({
            id: l.patientId._id,
            name: l.patientId.userId?.displayName || l.patientId.displayName || 'Loved One',
            age: l.patientId.age,
            sex: l.patientId.sex,
          }));
          setPatients(list);
          if (list.length > 0) {
            const initialId =
              queryPatientId && list.some((p) => p.id === queryPatientId)
                ? queryPatientId
                : list[0].id;
            setSelectedPatientId(initialId);
          }
        })
        .catch((err) => console.error('Failed to load caregiver links:', err))
        .finally(() => setIsLoadingPatients(false));
    }
  }, [user?.role, queryPatientId]);

  const activePatientObj = patients.find((p) => p.id === selectedPatientId) || patients[0];

  return (
    <div className="space-y-6">
      {/* ── Page Header ─────────────────────────────────────────────── */}
      <div className="flex items-start justify-between gap-4 flex-wrap pb-2 border-b border-line">
        <div>
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-full bg-brand-light flex items-center justify-center text-brand">
              <FileText size={18} />
            </div>
            <h1 className="text-h1 font-display text-ink">
              {user?.role === 'doctor'
                ? 'Clinical Records & Diagnostic Reports'
                : 'Medical Records & Reports'}
            </h1>
          </div>
          <p className="text-sm text-ink-soft mt-1 max-w-2xl">
            {user?.role === 'doctor'
              ? 'Review, verify, and upload diagnostic lab reports, imaging, and discharge summaries for your assigned patient cohort.'
              : 'Securely upload, view, and organize verified clinical prescriptions, lab panels, and diagnostic imaging.'}
          </p>
        </div>

        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold">
            <ShieldCheck size={14} className="text-emerald-600" />
            <span>256-Bit Encrypted Storage</span>
          </span>
        </div>
      </div>

      {/* ── Doctor / Caregiver Patient Selector Bar ─────────────────── */}
      {(user?.role === 'doctor' || user?.role === 'caregiver') && (
        <div className="bg-surface rounded-ritual border border-line p-3 shadow-sm space-y-2">
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <span className="text-xs font-bold uppercase tracking-wider text-ink-soft flex items-center gap-1.5">
              {user?.role === 'doctor' ? (
                <>
                  <Stethoscope size={14} className="text-brand" />
                  <span>Select Assigned Patient Roster ({patients.length}):</span>
                </>
              ) : (
                <>
                  <Users size={14} className="text-brand" />
                  <span>Select Loved One ({patients.length}):</span>
                </>
              )}
            </span>

            {isLoadingPatients && (
              <span className="text-xs text-ink-soft flex items-center gap-1">
                <RefreshCw size={12} className="animate-spin" /> Loading roster...
              </span>
            )}
          </div>

          {patients.length > 0 ? (
            <div className="flex items-center gap-2 overflow-x-auto pb-1">
              {patients.map((p) => {
                const isSelected = p.id === selectedPatientId;
                return (
                  <button
                    key={p.id}
                    onClick={() => {
                      setSelectedPatientId(p.id);
                      setSearchParams({ patientId: p.id });
                    }}
                    className={`flex items-center gap-2 px-4 py-2 rounded-full text-xs font-semibold transition-all shrink-0 ${
                      isSelected
                        ? 'bg-brand text-white shadow-ritual scale-[1.02]'
                        : 'bg-paper text-ink-soft hover:text-ink hover:bg-line/40'
                    }`}
                  >
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center text-[10px] font-bold ${
                        isSelected ? 'bg-white/20 text-white' : 'bg-brand/10 text-brand'
                      }`}
                    >
                      {p.name?.[0] || 'P'}
                    </div>
                    <span>{p.name}</span>
                    {p.age && <span className={isSelected ? 'text-white/80' : 'text-ink-soft'}>({p.age}y)</span>}
                  </button>
                );
              })}
            </div>
          ) : (
            <div className="p-4 text-center text-xs text-ink-soft bg-paper rounded-clinical border border-line">
              {user?.role === 'doctor'
                ? 'No patients are currently assigned to your roster. When patients register and select your practice, they will appear here.'
                : 'No patients are currently connected. Please link a family member using an invite code.'}
            </div>
          )}
        </div>
      )}

      {/* ── Main Report Manager Hub ──────────────────────────────────── */}
      {user?.role === 'patient' || selectedPatientId ? (
        <ReportManager
          patientId={user?.role === 'patient' ? undefined : selectedPatientId}
          userRole={user?.role || 'patient'}
        />
      ) : (
        <div className="p-8 text-center text-ink-soft bg-surface rounded-ritual border border-line">
          Please select a patient from your roster above to review their medical records.
        </div>
      )}
    </div>
  );
}
