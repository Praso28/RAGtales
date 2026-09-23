import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function ConfirmDialog() {
  const { confirmDialog, hideConfirm } = useAppStore();

  useEffect(() => {
    if (!confirmDialog) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (confirmDialog.onCancel) confirmDialog.onCancel();
        hideConfirm();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [confirmDialog, hideConfirm]);

  if (!confirmDialog) return null;

  const { message, onConfirm, onCancel, danger } = confirmDialog;

  const handleCancelClick = () => {
    if (onCancel) onCancel();
    hideConfirm();
  };

  const handleConfirmClick = () => {
    onConfirm();
    hideConfirm();
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      background: 'rgba(6, 12, 26, 0.7)',
      backdropFilter: 'blur(8px)',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      zIndex: 10000,
    }}>
      <div className="glass-panel-elevated" style={{
        width: '380px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-specular-high)'
      }}>
        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>Confirm Action</h4>
        <p style={{ margin: 0, fontSize: '0.85rem', color: 'var(--on-surface-variant)', lineHeight: 1.5 }}>
          {message}
        </p>
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleCancelClick}
          >
            Cancel
          </button>
          <button 
            type="button" 
            className={`btn ${danger ? 'btn-danger' : 'btn-primary'}`}
            onClick={handleConfirmClick}
            autoFocus
          >
            Confirm
          </button>
        </div>
      </div>
    </div>
  );
}
