import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../store/useAppStore';

export default function InlineInputModal() {
  const { inputDialog, hideInput } = useAppStore();
  const [inputValue, setInputValue] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    if (inputDialog) {
      // eslint-disable-next-line
      setInputValue(inputDialog.defaultValue || '');
      // Focus the input
      setTimeout(() => {
        if (inputRef.current) {
          inputRef.current.focus();
          inputRef.current.select();
        }
      }, 50);
    }
  }, [inputDialog]);

  useEffect(() => {
    if (!inputDialog) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        if (inputDialog.onCancel) inputDialog.onCancel();
        hideInput();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [inputDialog, hideInput]);

  if (!inputDialog) return null;

  const { title, message, placeholder, onConfirm, onCancel } = inputDialog;

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!inputValue.trim()) return;
    onConfirm(inputValue.trim());
    hideInput();
  };

  const handleCancel = () => {
    if (onCancel) onCancel();
    hideInput();
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
      <form onSubmit={handleSubmit} className="glass-panel-elevated" style={{
        width: '380px',
        padding: '24px',
        display: 'flex',
        flexDirection: 'column',
        gap: '20px',
        boxShadow: 'var(--shadow-lg)',
        border: '1px solid var(--border-specular-high)'
      }}>
        <h4 style={{ margin: 0, fontSize: '1.05rem', fontWeight: 600 }}>{title || 'Enter Input'}</h4>
        {message && (
          <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--on-surface-variant)', lineHeight: 1.4 }}>
            {message}
          </p>
        )}
        <input
          type="text"
          ref={inputRef}
          className="form-input"
          value={inputValue}
          onChange={(e) => setInputValue(e.target.value)}
          placeholder={placeholder || 'Type here...'}
          style={{ width: '100%' }}
        />
        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
          <button 
            type="button" 
            className="btn btn-secondary" 
            onClick={handleCancel}
          >
            Cancel
          </button>
          <button 
            type="submit" 
            className="btn btn-primary"
            disabled={!inputValue.trim()}
          >
            Submit
          </button>
        </div>
      </form>
    </div>
  );
}
