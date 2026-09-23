import { useState, useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAppStore } from './store/useAppStore';
import { apiClient } from './services/api';
import AuthPage from './pages/AuthPage';
import Dashboard from './pages/Dashboard';
import BookWorkspace from './pages/BookWorkspace';
import AdminPanel from './pages/AdminPanel';
import ToastContainer from './components/ToastContainer';
import ConfirmDialog from './components/ConfirmDialog';
import InlineInputModal from './components/InlineInputModal';

function App() {
  const { 
    token, 
    backendConnected, 
    setBackendConnected,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    rightPanelCollapsed,
    setRightPanelCollapsed,
    userRole
  } = useAppStore();

  // Health-check on mount and every 30s
  useEffect(() => {
    const checkHealth = async () => {
      const ok = await apiClient.checkHealth();
      setBackendConnected(ok);
    };
    checkHealth();
    const interval = setInterval(checkHealth, 30000);
    return () => clearInterval(interval);
  }, []);

  // Global Keyboard Shortcuts
  useEffect(() => {
    const handleGlobalShortcuts = (e) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('save-chapter'));
      }
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        document.dispatchEvent(new CustomEvent('generate-chapter'));
      }
      if (e.ctrlKey && e.key === '\\') {
        e.preventDefault();
        setLeftPanelCollapsed(!leftPanelCollapsed);
      }
      if (e.ctrlKey && e.shiftKey && (e.key === '\\' || e.key === '|')) {
        e.preventDefault();
        setRightPanelCollapsed(!rightPanelCollapsed);
      }
    };
    document.addEventListener('keydown', handleGlobalShortcuts);
    return () => document.removeEventListener('keydown', handleGlobalShortcuts);
  }, [leftPanelCollapsed, rightPanelCollapsed, setLeftPanelCollapsed, setRightPanelCollapsed]);

  return (
    <>
      <ToastContainer />
      <ConfirmDialog />
      <InlineInputModal />
      
      {!token ? (
        <Routes>
          <Route path="/login" element={<AuthPage />} />
          <Route path="*" element={<Navigate to="/login" replace />} />
        </Routes>
      ) : (
        <Routes>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/project/:projectId/*" element={<BookWorkspace />} />
          
          {userRole === 'admin' && (
            <Route path="/system-admin" element={<AdminPanel />} />
          )}
          
          <Route 
            path="*" 
            element={<Navigate to={userRole === 'admin' ? "/system-admin" : "/dashboard"} replace />} 
          />
        </Routes>
      )}
    </>
  );
}

export default App;
