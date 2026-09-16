import { Activity, Clock, ShieldCheck, Heart, Wind, Thermometer } from 'lucide-react';

/**
 * Live drawer/card listing recent vitals stored in the database.
 * Proves immediate persistence and zero-wearable manual operation.
 */
export default function RecentVitalsList({ vitals = [], isLoading = false, onRefresh }) {
  if (isLoading) {
    return (
      <div style={{ textAlign: 'center', padding: '1.5rem', color: '#94a3b8' }}>
        <div className="spinner" style={{ margin: '0 auto 0.75rem auto' }} />
        Loading recorded vitals history...
      </div>
    );
  }

  if (!vitals || vitals.length === 0) {
    return (
      <div
        style={{
          background: 'rgba(30, 41, 59, 0.3)',
          borderRadius: '14px',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          padding: '1.5rem',
          textAlign: 'center',
          color: '#94a3b8',
          fontSize: '0.88rem',
        }}
      >
        <Activity size={28} style={{ opacity: 0.5, marginBottom: '0.5rem' }} />
        <p>No vitals recorded yet. Submit your first reading above!</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: '0.25rem',
        }}
      >
        <span className="section-label" style={{ marginBottom: 0 }}>
          Recently Stored Readings ({vitals.length})
        </span>
        {onRefresh && (
          <button
            onClick={onRefresh}
            style={{
              background: 'none',
              border: 'none',
              color: '#06b6d4',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              fontFamily: 'inherit',
            }}
          >
            Refresh List
          </button>
        )}
      </div>

      {vitals.slice(0, 5).map((item, idx) => {
        const dateStr = item.recordedAt
          ? new Date(item.recordedAt).toLocaleTimeString([], {
              hour: '2-digit',
              minute: '2-digit',
              month: 'short',
              day: 'numeric',
            })
          : 'Just now';

        return (
          <div
            key={item._id || idx}
            style={{
              background: 'rgba(30, 41, 59, 0.5)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              borderRadius: '12px',
              padding: '0.85rem 1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.5rem',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                <span
                  style={{
                    fontSize: '0.72rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    color: item.slot === 'morning' ? '#f59e0b' : '#38bdf8',
                    background:
                      item.slot === 'morning'
                        ? 'rgba(245, 158, 11, 0.15)'
                        : 'rgba(56, 189, 248, 0.15)',
                    padding: '0.15rem 0.5rem',
                    borderRadius: '6px',
                  }}
                >
                  {item.slot}
                </span>
                <span
                  style={{
                    fontSize: '0.7rem',
                    color: '#10b981',
                    background: 'rgba(16, 185, 129, 0.1)',
                    padding: '0.15rem 0.4rem',
                    borderRadius: '6px',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: '0.2rem',
                  }}
                >
                  <ShieldCheck size={11} /> {item.source || 'manual'}
                </span>
              </div>
              <span
                style={{
                  fontSize: '0.75rem',
                  color: '#94a3b8',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '0.25rem',
                }}
              >
                <Clock size={12} /> {dateStr}
              </span>
            </div>

            {/* Metrics pills */}
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.75rem', fontSize: '0.82rem' }}>
              <div>
                <strong style={{ color: '#f8fafc' }}>
                  {item.systolicBp}/{item.diastolicBp}
                </strong>{' '}
                <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>mmHg</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <Heart size={13} style={{ color: '#f43f5e' }} />
                <strong style={{ color: '#f8fafc' }}>{item.heartRate}</strong>{' '}
                <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>bpm</span>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <Wind size={13} style={{ color: '#38bdf8' }} />
                <strong style={{ color: '#f8fafc' }}>{item.spo2}%</strong>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.2rem' }}>
                <Thermometer size={13} style={{ color: '#f59e0b' }} />
                <strong style={{ color: '#f8fafc' }}>{item.temperatureC}°C</strong>
              </div>
              {item.respirationRate && (
                <div>
                  <strong style={{ color: '#f8fafc' }}>{item.respirationRate}</strong>{' '}
                  <span style={{ color: '#94a3b8', fontSize: '0.72rem' }}>breaths/m</span>
                </div>
              )}
            </div>

            {item.symptomFlags && item.symptomFlags.length > 0 && (
              <div style={{ display: 'flex', gap: '0.35rem', flexWrap: 'wrap', marginTop: '0.15rem' }}>
                {item.symptomFlags.map((s) => (
                  <span
                    key={s}
                    style={{
                      fontSize: '0.68rem',
                      background: 'rgba(244, 63, 94, 0.15)',
                      color: '#fda4af',
                      padding: '0.1rem 0.4rem',
                      borderRadius: '4px',
                    }}
                  >
                    {s}
                  </span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
