import React, { useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { CheckCircle, AlertTriangle, Info } from 'lucide-react';

function ToastItem({ toast }) {
  const removeToast = useAppStore(state => state.removeToast);
  
  useEffect(() => {
    const timer = setTimeout(() => {
      removeToast(toast.id);
    }, 3500);
    return () => clearTimeout(timer);
  }, [toast.id, removeToast]);

  return (
    <div className={`toast toast-${toast.type}`}>
      {toast.type === 'success' && <CheckCircle size={16} style={{ flexShrink: 0 }} />}
      {toast.type === 'error' && <AlertTriangle size={16} style={{ flexShrink: 0 }} />}
      {toast.type === 'info' && <Info size={16} style={{ flexShrink: 0 }} />}
      <span>{toast.msg}</span>
    </div>
  );
}

export default function ToastContainer() {
  const toasts = useAppStore(state => state.toasts);

  return (
    <div className="toast-container">
      {toasts.map(toast => (
        <ToastItem key={toast.id} toast={toast} />
      ))}
    </div>
  );
}
