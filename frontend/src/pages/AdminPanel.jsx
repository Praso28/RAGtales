import { useState, useEffect } from 'react';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api';
import { 
  ShieldAlert, Loader, RefreshCw, 
  Settings, Users, History, Database, Download, LogOut
} from 'lucide-react';

export default function AdminPanel() {
  const { backendConnected, addToast, setAuth } = useAppStore();
  
  // Navigation tabs
  const [adminTab, setAdminTab] = useState('llm'); // 'llm' | 'users' | 'logs' | 'backups'
  
  // LLM Config state
  const [llmProvider, setLlmProvider] = useState('phi4');
  const [llmConfigLoading, setLlmConfigLoading] = useState(false);
  const [llmConfigMsg, setLlmConfigMsg] = useState('');
  
  // Users state
  const [users, setUsers] = useState([]);
  const [usersLoading, setUsersLoading] = useState(false);
  
  // Audit logs state
  const [logs, setLogs] = useState([]);
  const [logsCount, setLogsCount] = useState(0);
  const [page, setPage] = useState(1);
  const [logsLoading, setLogsLoading] = useState(false);
  
  // Backups state
  const [backups, setBackups] = useState([]);
  const [backingUp, setBackingUp] = useState(false);

  // Load LLM Config on mount
  const loadLLMConfig = async () => {
    if (!backendConnected) return;
    setLlmConfigLoading(true);
    try {
      const cfg = await apiClient.getAdminLLMConfig();
      setLlmProvider(cfg.provider || 'phi4');
    } catch (e) {
      console.error(e);
    } finally {
      setLlmConfigLoading(false);
    }
  };

  const handleUpdateLLMConfig = async () => {
    if (!backendConnected) return;
    setLlmConfigLoading(true);
    setLlmConfigMsg('');
    try {
      await apiClient.updateAdminLLMConfig(llmProvider);
      setLlmConfigMsg('LLM configuration saved successfully!');
      setTimeout(() => setLlmConfigMsg(''), 2000);
    } catch (e) {
      setLlmConfigMsg('Failed to update config');
    } finally {
      setLlmConfigLoading(false);
    }
  };

  const loadUsersList = async () => {
    if (!backendConnected) return;
    setUsersLoading(true);
    try {
      const list = await apiClient.getAdminUsers();
      setUsers(list);
    } catch (e) {
      console.error(e);
    } finally {
      setUsersLoading(false);
    }
  };

  const handleRoleChange = async (userId, newRole) => {
    if (!backendConnected) return;
    try {
      await apiClient.updateUserRole(userId, newRole);
      setUsers(prev => prev.map(u => u.id === userId ? { ...u, role: newRole } : u));
    } catch (e) {
      addToast("Failed to update user role", "error");
    }
  };

  const loadAuditLogs = async () => {
    if (!backendConnected) return;
    setLogsLoading(true);
    try {
      const res = await apiClient.getAdminAuditLogs(page, 30);
      setLogs(res.logs || []);
      setLogsCount(res.total_count || 0);
    } catch (e) {
      console.error(e);
    } finally {
      setLogsLoading(false);
    }
  };

  const loadBackups = async () => {
    if (!backendConnected) return;
    try {
      const bList = await apiClient.getBackups();
      setBackups(bList);
    } catch (e) {
      console.error(e);
    }
  };

  const handleTriggerBackup = async () => {
    setBackingUp(true);
    try {
      await apiClient.triggerBackup();
      addToast("Database backup completed successfully!", "success");
      loadBackups();
    } catch (error) {
      addToast("Backup failed: " + error.message, "error");
    } finally {
      setBackingUp(false);
    }
  };

  const handleDownloadBackup = (filename) => {
    const token = localStorage.getItem('pensive_token') || '';
    window.open(`http://127.0.0.1:8080/api/v1/monitoring/backups/${filename}?token=${token}`, '_blank');
  };

  // Switch tabs
  useEffect(() => {
    // eslint-disable-next-line
    if (adminTab === 'llm') loadLLMConfig();
    // eslint-disable-next-line
    if (adminTab === 'users') loadUsersList();
    // eslint-disable-next-line
    if (adminTab === 'logs') loadAuditLogs();
    // eslint-disable-next-line
    if (adminTab === 'backups') loadBackups();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminTab, page]);

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'grid', gridTemplateRows: '56px 1fr', background: 'var(--bg-color)', overflow: 'hidden' }}>
      {/* Header */}
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 24px', borderBottom: '1px solid var(--border-specular)', background: 'rgba(11, 19, 38, 0.85)', backdropFilter: 'blur(12px)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <ShieldAlert size={20} color="#f43f5e" />
          <h3 style={{ margin: 0 }}>System Administration Console</h3>
        </div>
        <button 
          className="btn btn-secondary" 
          style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem' }}
          onClick={() => setAuth(null)}
        >
          <LogOut size={14} />
          Logout
        </button>
      </header>

      {/* Main Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '220px 1fr', height: 'calc(100vh - 56px)', overflow: 'hidden' }}>
        {/* Navigation Sidebar */}
        <div style={{ borderRight: '1px solid var(--border-specular)', padding: '20px', display: 'flex', flexDirection: 'column', gap: '8px', background: 'rgba(6, 14, 32, 0.4)' }}>
          <button 
            className={`btn ${adminTab === 'llm' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', background: adminTab === 'llm' ? '' : 'transparent' }}
            onClick={() => setAdminTab('llm')}
          >
            <Settings size={15} />
            LLM Provider config
          </button>
          <button 
            className={`btn ${adminTab === 'users' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', background: adminTab === 'users' ? '' : 'transparent' }}
            onClick={() => setAdminTab('users')}
          >
            <Users size={15} />
            User Roles Manager
          </button>
          <button 
            className={`btn ${adminTab === 'logs' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', background: adminTab === 'logs' ? '' : 'transparent' }}
            onClick={() => { setAdminTab('logs'); setPage(1); }}
          >
            <History size={15} />
            AI Audit Logs
          </button>
          <button 
            className={`btn ${adminTab === 'backups' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ width: '100%', justifyContent: 'flex-start', display: 'flex', alignItems: 'center', gap: '8px', background: adminTab === 'backups' ? '' : 'transparent' }}
            onClick={() => setAdminTab('backups')}
          >
            <Database size={15} />
            System Backups
          </button>
        </div>

        {/* Content panel */}
        <div style={{ padding: '32px', overflowY: 'auto' }}>
          {adminTab === 'llm' && (
            <div className="glass-panel" style={{ padding: '24px', maxWidth: '500px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div>
                <h4>LLM Configuration</h4>
                <p style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', marginTop: '4px' }}>
                  Dynamically adjust the LLM provider utilized by the author generation pipelines.
                </p>
              </div>

              {llmConfigMsg && (
                <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '10px', borderRadius: '4px', fontSize: '0.8rem' }}>
                  {llmConfigMsg}
                </div>
              )}

              <div className="form-group">
                <label className="form-label">Active Provider</label>
                {llmConfigLoading ? <Loader size={16} className="animate-spin" /> : (
                  <select 
                    className="form-input" 
                    value={llmProvider}
                    onChange={(e) => setLlmProvider(e.target.value)}
                  >
                    <option value="phi4">Azure Phi-4 (Testing Default)</option>
                    <option value="gemini">Google Gemini 1.5</option>
                    <option value="openai">OpenAI GPT-4o</option>
                    <option value="ollama">Ollama Local</option>
                  </select>
                )}
              </div>

              <button className="btn btn-primary" onClick={handleUpdateLLMConfig} disabled={llmConfigLoading}>
                Save Configuration
              </button>
            </div>
          )}

          {adminTab === 'users' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <h4>Registered User Accounts</h4>
              {usersLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="animate-spin" /></div> : (
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.9rem' }}>
                  <thead>
                    <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--on-surface-variant)' }}>
                      <th style={{ padding: '12px' }}>Username</th>
                      <th style={{ padding: '12px' }}>Role</th>
                      <th style={{ padding: '12px' }}>Created At</th>
                    </tr>
                  </thead>
                  <tbody>
                    {users.map(u => (
                      <tr key={u.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.03)' }}>
                        <td style={{ padding: '12px', fontWeight: '500' }}>{u.username}</td>
                        <td style={{ padding: '12px' }}>
                          <select 
                            className="form-input" 
                            style={{ padding: '4px', fontSize: '0.8rem' }}
                            value={u.role}
                            onChange={(e) => handleRoleChange(u.id, e.target.value)}
                          >
                            <option value="author">Author</option>
                            <option value="admin">Administrator</option>
                          </select>
                        </td>
                        <td style={{ padding: '12px', color: 'var(--on-surface-variant)' }}>{new Date(u.created_at).toLocaleDateString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          )}

          {adminTab === 'logs' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>AI Generation Audit Logs</h4>
                <button className="btn btn-secondary" style={{ padding: '4px 8px' }} onClick={loadAuditLogs}>
                  <RefreshCw size={12} /> Refresh
                </button>
              </div>

              {logsLoading ? <div style={{ display: 'flex', justifyContent: 'center', padding: '40px' }}><Loader className="animate-spin" /></div> : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                  {logs.map(log => (
                    <div key={log.id} style={{ border: '1px solid var(--border-color)', borderRadius: '6px', padding: '16px', background: 'rgba(255,255,255,0.01)' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px', fontSize: '0.85rem' }}>
                        <span style={{ background: '#3b82f6', color: '#fff', padding: '2px 8px', borderRadius: '4px' }}>{log.action.toUpperCase()}</span>
                        <span style={{ color: 'var(--on-surface-variant)' }}>{new Date(log.created_at).toLocaleString()}</span>
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px', fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
                        <div>
                          <strong>Prompt:</strong>
                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', marginTop: '4px', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {log.prompt}
                          </div>
                        </div>
                        <div>
                          <strong>Response:</strong>
                          <div style={{ background: 'rgba(0,0,0,0.2)', padding: '8px', borderRadius: '4px', marginTop: '4px', maxHeight: '100px', overflowY: 'auto', whiteSpace: 'pre-wrap' }}>
                            {log.response}
                          </div>
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '16px', marginTop: '8px', fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                        <span>Provider: <strong>{log.provider}</strong></span>
                        <span>Model: <strong>{log.model}</strong></span>
                        {log.tokens_used && <span>Tokens Used: <strong>{log.tokens_used}</strong></span>}
                      </div>
                    </div>
                  ))}
                  
                  {/* Pagination */}
                  {logsCount > 30 && (
                    <div style={{ display: 'flex', justifyContent: 'center', gap: '12px', marginTop: '16px' }}>
                      <button className="btn btn-secondary" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1}>Previous</button>
                      <span style={{ display: 'flex', alignItems: 'center', fontSize: '0.85rem' }}>Page {page} of {Math.ceil(logsCount / 30)}</span>
                      <button className="btn btn-secondary" onClick={() => setPage(p => p + 1)} disabled={page * 30 >= logsCount}>Next</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {adminTab === 'backups' && (
            <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <h4>Database Backups</h4>
                <button className="btn btn-primary" onClick={handleTriggerBackup} disabled={backingUp}>
                  {backingUp ? <Loader size={14} className="animate-spin" /> : 'Create Backup'}
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
                {backups.length === 0 ? (
                  <span style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', textAlign: 'center', padding: '20px' }}>No backups found.</span>
                ) : (
                  backups.map((b, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px', background: 'rgba(255,255,255,0.02)', border: '1px solid var(--border-color)', borderRadius: '6px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '2px' }}>
                        <span style={{ fontSize: '0.85rem', fontWeight: 'bold' }}>{b.filename}</span>
                        <span style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>Size: {b.size_kb} KB • Created: {new Date(b.created_at).toLocaleString()}</span>
                      </div>
                      <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={() => handleDownloadBackup(b.filename)}>
                        <Download size={14} />
                      </button>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
