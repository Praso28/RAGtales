import { useState } from 'react';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api';
import { Database, Loader } from 'lucide-react';

export default function AuthPage() {
  const { setAuth, setProjects, setActiveProject, addToast } = useAppStore();
  const [usernameInput, setUsernameInput] = useState('');
  const [passwordInput, setPasswordInput] = useState('');
  const [isRegisterMode, setIsRegisterMode] = useState(false);
  const [authError, setAuthError] = useState('');
  const [loading, setLoading] = useState(false);

  const handleAuthSubmit = async (e) => {
    e.preventDefault();
    setAuthError('');
    if (!usernameInput.trim() || !passwordInput.trim()) return;

    setLoading(true);
    try {
      if (isRegisterMode) {
        await apiClient.register(usernameInput, passwordInput);
        addToast("Registration successful! Please login.", "success");
        setIsRegisterMode(false);
        setPasswordInput('');
      } else {
        const data = await apiClient.login(usernameInput, passwordInput);
        setAuth(data.access_token, data.username, data.role);
        
        // Load user projects
        const projectList = await apiClient.getProjects();
        setProjects(projectList);
        if (projectList.length > 0) {
          setActiveProject(projectList[0]);
        }
      }
    } catch (err) {
      setAuthError(err.message || "Authentication failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      position: 'fixed',
      inset: 0,
      display: 'flex',
      justifyContent: 'center',
      alignItems: 'center',
      background: 'radial-gradient(circle at 20% 20%, rgba(59,130,246,0.15) 0%, transparent 50%), radial-gradient(circle at 80% 80%, rgba(99,102,241,0.12) 0%, transparent 50%), var(--bg-color)',
      zIndex: 1,
    }}>
      <div className="glass-panel-elevated" style={{ width: '400px', padding: '40px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ background: '#3b82f6', width: '48px', height: '48px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px auto', boxShadow: '0 0 15px rgba(59, 130, 246, 0.4)' }}>
            <Database size={24} color="#ffffff" />
          </div>
          <h2>Pensive</h2>
          <p style={{ color: 'var(--on-surface-variant)', fontSize: '0.9rem', marginTop: '8px', fontWeight: '500' }}>
            Your AI-powered writing companion
          </p>
          <p style={{ color: 'rgba(154,165,196,0.6)', fontSize: '0.75rem', marginTop: '4px' }}>
            From first idea to finished manuscript.
          </p>
        </div>

        {authError && (
          <div style={{ background: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.2)', color: '#fca5a5', padding: '12px', borderRadius: 'var(--radius-md)', fontSize: '0.85rem', textAlign: 'center' }}>
            {authError}
          </div>
        )}

        <form onSubmit={handleAuthSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div className="form-group">
            <label className="form-label">Username</label>
            <input 
              type="text" 
              className="form-input" 
              placeholder="e.g. author_jake" 
              value={usernameInput}
              onChange={(e) => setUsernameInput(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <div className="form-group">
            <label className="form-label">Password</label>
            <input 
              type="password" 
              className="form-input" 
              placeholder="••••••••" 
              value={passwordInput}
              onChange={(e) => setPasswordInput(e.target.value)}
              required
              disabled={loading}
            />
          </div>

          <button type="submit" className="btn btn-primary" style={{ width: '100%', padding: '12px', marginTop: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center' }} disabled={loading}>
            {loading ? <Loader size={16} className="animate-spin" /> : (isRegisterMode ? 'Sign Up' : 'Login')}
          </button>
        </form>

        <div style={{ textAlign: 'center', fontSize: '0.85rem', color: 'var(--on-surface-variant)' }}>
          {isRegisterMode ? (
            <>
              Already have an account?{' '}
              <span onClick={() => { setIsRegisterMode(false); setAuthError(''); }} style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: '500' }}>
                Login
              </span>
            </>
          ) : (
            <>
              Don't have an account?{' '}
              <span onClick={() => { setIsRegisterMode(true); setAuthError(''); }} style={{ color: '#3b82f6', cursor: 'pointer', fontWeight: '500' }}>
                Register
              </span>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
