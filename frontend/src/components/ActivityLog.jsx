import React, { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { ChevronDown, ChevronUp, History } from 'lucide-react';

export default function ActivityLog() {
  const { activityLog } = useAppStore();
  const [collapsed, setCollapsed] = useState(false);

  const entries = activityLog.slice(0, 10);

  return (
    <div style={{
      border: '1px solid var(--border-color)',
      borderRadius: 'var(--radius-md)',
      background: 'rgba(255, 255, 255, 0.02)',
      overflow: 'hidden',
      marginTop: 'auto',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div 
        onClick={() => setCollapsed(!collapsed)}
        style={{
          padding: '8px 12px',
          background: 'rgba(255, 255, 255, 0.03)',
          cursor: 'pointer',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          borderBottom: collapsed ? 'none' : '1px solid var(--border-color)',
        }}
      >
        <span style={{ 
          fontWeight: '700', 
          fontSize: '0.68rem', 
          color: 'var(--on-surface-variant)', 
          textTransform: 'uppercase', 
          letterSpacing: '0.06em',
          display: 'flex',
          alignItems: 'center',
          gap: '6px'
        }}>
          <History size={12} />
          The Scribe's Chronicle
        </span>
        {collapsed ? <ChevronDown size={12} /> : <ChevronUp size={12} />}
      </div>

      {/* Content */}
      {!collapsed && (
        <div style={{
          padding: '10px 12px',
          maxHeight: '220px',
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
        }}>
          {entries.length === 0 ? (
            <div style={{
              fontSize: '0.75rem',
              color: 'var(--on-surface-variant)',
              fontStyle: 'italic',
              textAlign: 'center',
              padding: '16px 0'
            }}>
              The Scribe hasn't started yet.
            </div>
          ) : (
            entries.map((entry) => (
              <div key={entry.id} className="activity-log-item">
                <span className="activity-log-icon">{entry.icon}</span>
                <span className="activity-log-time">{entry.timestamp}</span>
                <span style={{ fontSize: '0.78rem' }}>{entry.message}</span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
