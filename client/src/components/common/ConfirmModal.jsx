import { useEffect } from 'react';
import { AlertTriangle, X } from 'lucide-react';

/**
 * ConfirmModal — Accessible dialog for high-stakes / irreversible actions
 * (e.g. deleting medical records, removing active medications, unlinking caregivers).
 * Adheres to elderly accessibility: large tap targets, clear plain language, deliberate friction.
 */
export default function ConfirmModal({
  isOpen,
  title = 'Confirm Irreversible Action',
  message = 'Are you sure you want to proceed? This change cannot be undone.',
  confirmLabel = 'Confirm Removal',
  cancelLabel = 'Keep / Cancel',
  isDestructive = true,
  isLoading = false,
  onConfirm,
  onCancel,
}) {
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e) => {
      if (e.key === 'Escape' && !isLoading) {
        onCancel();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isLoading, onCancel]);

  if (!isOpen) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm animate-fade-in"
    >
      <div className="w-full max-w-md bg-surface rounded-ritual shadow-2xl border border-line p-6 relative space-y-4 animate-scale-up">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-2.5 text-tier-critical font-display font-bold text-base">
            <div className="w-9 h-9 rounded-full bg-rose-100 flex items-center justify-center text-rose-700 shrink-0">
              <AlertTriangle size={20} />
            </div>
            <h3 id="confirm-modal-title" className="text-ink">
              {title}
            </h3>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="p-1.5 rounded-full hover:bg-paper text-ink-soft hover:text-ink transition-colors"
            aria-label="Close dialog"
          >
            <X size={18} />
          </button>
        </div>

        <p className="text-sm text-ink-soft leading-relaxed">
          {message}
        </p>

        <div className="p-3 rounded-ritual bg-amber-500/10 border border-amber-500/20 text-amber-900 text-xs">
          <strong>Clinical Safety Notice:</strong> Once confirmed, this data will be immediately removed from active synchronization with your assigned clinician.
        </div>

        <div className="flex items-center justify-end gap-3 pt-3 border-t border-line">
          <button
            type="button"
            onClick={onCancel}
            disabled={isLoading}
            className="px-4 py-2.5 rounded-full border border-line text-sm font-semibold text-ink hover:bg-paper transition-colors"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isLoading}
            className={`px-5 py-2.5 rounded-full text-sm font-bold text-white shadow-sm transition-all flex items-center gap-2 ${
              isDestructive
                ? 'bg-rose-600 hover:bg-rose-700 active:scale-95'
                : 'bg-brand hover:bg-brand-dark active:scale-95'
            } ${isLoading ? 'opacity-60 cursor-not-allowed' : ''}`}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
