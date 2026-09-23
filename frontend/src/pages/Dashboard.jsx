import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api';
import { 
  FolderOpen, Plus, UploadCloud, Trash2, Database, 
  ShieldCheck, LogOut, Loader, CheckCircle, AlertTriangle
} from 'lucide-react';

export default function Dashboard() {
  const { 
    projects, setProjects, activeProject, setActiveProject, 
    recentUploads, setRecentUploads, addUpload, updateUploadStatus,
    currentUser, userRole, setAuth, backendConnected, addToast, showConfirm 
  } = useAppStore();

  const navigate = useNavigate();

  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const [newProjectDesc, setNewProjectDesc] = useState('');
  const [activeUploadBucket, setActiveUploadBucket] = useState('author_material'); // 'author_material' | 'market_research'
  const [projectSearch, setProjectSearch] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const fileInputRef = useRef(null);
  const modalRef = useRef(null);

  // Close on Escape + Focus trap inside Create Project Modal
  useEffect(() => {
    if (!showCreateModal) return;

    const handleKeyDown = (e) => {
      if (e.key === 'Escape') {
        setShowCreateModal(false);
        return;
      }

      if (e.key === 'Tab') {
        if (!modalRef.current) return;
        const focusable = modalRef.current.querySelectorAll(
          'input, textarea, button, [tabindex="0"]'
        );
        if (focusable.length === 0) return;
        const first = focusable[0];
        const last = focusable[focusable.length - 1];

        if (e.shiftKey) {
          if (document.activeElement === first) {
            last.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === last) {
            first.focus();
            e.preventDefault();
          }
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [showCreateModal]);

  // Load projects list
  useEffect(() => {
    async function loadProjects() {
      if (!backendConnected) return;
      try {
        const list = await apiClient.getProjects();
        setProjects(list);
        if (list.length > 0 && !activeProject) {
          setActiveProject(list[0]);
        }
      } catch (e) {
        console.error(e);
      }
    }
    loadProjects();
  }, [backendConnected, activeProject, setActiveProject, setProjects]);

  // Load documents for active project
  useEffect(() => {
    if (!activeProject) return;
    async function loadDocs() {
      if (!backendConnected) return;
      try {
        const docs = await apiClient.getDocuments(activeProject.id);
        setRecentUploads(docs);
      } catch (e) {
        console.error(e);
      }
    }
    loadDocs();
  }, [activeProject, backendConnected, setRecentUploads]);

  const handleCreateProject = async (e) => {
    e.preventDefault();
    if (!newProjectName.trim()) return;

    if (backendConnected) {
      try {
        const newProj = await apiClient.createProject(newProjectName, newProjectDesc);
        setProjects([newProj, ...projects]);
        setActiveProject(newProj);
      } catch (e) {
        addToast("Failed to create project", "error");
      }
    } else {
      const newProj = {
        id: `mock-${Date.now()}`,
        name: newProjectName,
        description: newProjectDesc,
        created_at: new Date().toISOString()
      };
      setProjects([newProj, ...projects]);
      setActiveProject(newProj);
    }
    
    setNewProjectName('');
    setNewProjectDesc('');
    setShowCreateModal(false);
  };

  const processFiles = async (files, bucket) => {
    if (!activeProject) {
      addToast("Please select or create a project first!", "info");
      return;
    }
    
    const docType = bucket === 'author_material' ? 'AUTHOR_DOC' : 'REFERENCE';

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const tempId = `temp-${Date.now()}-${i}`;
      const tempUpload = {
        id: tempId,
        filename: file.name,
        document_type: docType,
        bucket: bucket,
        status: 'PROCESSING',
        created_at: new Date().toISOString(),
        project_id: activeProject.id
      };
      addUpload(tempUpload);

      if (backendConnected) {
        try {
          const doc = await apiClient.uploadDocumentWithBucket(activeProject.id, file, docType, bucket);
          setRecentUploads(
            recentUploads.map(u => u.id === tempId ? doc : u)
          );
        } catch (e) {
          updateUploadStatus(tempId, 'FAILED');
        }
      } else {
        setTimeout(() => {
          const finalDoc = {
            ...tempUpload,
            id: `doc-${Date.now()}`,
            status: 'READY'
          };
          setRecentUploads(
            useAppStore.getState().recentUploads.map(u => u.id === tempId ? finalDoc : u)
          );
        }, 2000);
      }
    }
  };

  const handleFileChange = (e) => {
    if (e.target.files) {
      processFiles(e.target.files, activeUploadBucket);
    }
  };

  const handleDeleteDoc = async (docId) => {
    if (!activeProject) return;
    showConfirm({
      message: "Are you sure you want to delete this document?",
      danger: true,
      onConfirm: async () => {
        if (backendConnected) {
          try {
            await apiClient.deleteDocument(activeProject.id, docId);
            setRecentUploads(recentUploads.filter(d => d.id !== docId));
          } catch (e) {
            addToast("Failed to delete document", "error");
          }
        } else {
          setRecentUploads(recentUploads.filter(d => d.id !== docId));
        }
      }
    });
  };

  const filteredProjects = projects.filter(p => 
    p.name.toLowerCase().includes(projectSearch.toLowerCase())
  );

  return (
    <div style={{ position: 'fixed', inset: 0, display: 'flex', background: 'var(--bg-color)', overflow: 'hidden' }}>
      {/* Sidebar Panel */}
      <aside style={{ 
        width: sidebarCollapsed ? '0px' : '260px',
        minWidth: sidebarCollapsed ? '0px' : '260px',
        transition: 'var(--panel-transition)',
        borderRight: sidebarCollapsed ? 'none' : '1px solid var(--border-specular)', 
        background: 'rgba(11, 19, 38, 0.7)', 
        backdropFilter: 'blur(12px)',
        flexShrink: 0,
        position: 'relative',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'visible',  /* must be visible so collapse handle isn't clipped */
      }}>
        {/* Scrollable inner container to prevent collapse handle clipping */}
        <div style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          gap: '16px',
          overflowY: sidebarCollapsed ? 'hidden' : 'auto',
          overflowX: 'hidden',
          padding: '20px',
          width: '100%',
          height: '100%',
          opacity: sidebarCollapsed ? 0 : 1,
          transition: 'opacity 0.2s',
          pointerEvents: sidebarCollapsed ? 'none' : 'auto',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', justifyContent: sidebarCollapsed ? 'center' : 'flex-start', flexShrink: 0 }}>
            <Database size={22} color="#3b82f6" style={{ flexShrink: 0 }} />
            {!sidebarCollapsed && <h3 style={{ margin: 0 }}>RAGtales</h3>}
          </div>
          
          {/* Project Selector List */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto' }}>
            {sidebarCollapsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
                {userRole !== 'admin' && (
                  <>
                    <button 
                      className="btn btn-secondary" 
                      style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} 
                      onClick={() => setShowCreateModal(true)}
                      title="New Project"
                    >
                      <Plus size={12} />
                    </button>
                    <div style={{ width: '100%', height: '1px', background: 'var(--border-color)', margin: '4px 0' }} />
                  </>
                )}
                {filteredProjects.map(p => (
                  <button
                    key={p.id}
                    className={`btn ${activeProject?.id === p.id ? 'btn-primary' : 'btn-secondary'}`}
                    style={{ 
                      width: '28px', 
                      height: '28px', 
                      borderRadius: '50%', 
                      padding: 0, 
                      display: 'flex', 
                      alignItems: 'center', 
                      justifyContent: 'center', 
                      fontSize: '0.72rem' 
                    }}
                    onClick={() => setActiveProject(p)}
                    title={p.name}
                  >
                    {p.name[0].toUpperCase()}
                  </button>
                ))}
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: 'bold', color: 'var(--on-surface-variant)' }}>PROJECTS</span>
                  {userRole !== 'admin' && (
                    <button className="btn btn-secondary" style={{ padding: '4px 8px', fontSize: '0.75rem' }} onClick={() => setShowCreateModal(true)}>
                      <Plus size={12} /> New
                    </button>
                  )}
                </div>

                {/* Project search input */}
                <input 
                  type="text" 
                  className="form-input" 
                  placeholder="Search projects..." 
                  style={{ fontSize: '0.8rem', padding: '7px 10px', flexShrink: 0 }}
                  value={projectSearch}
                  onChange={e => setProjectSearch(e.target.value)}
                />

                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {filteredProjects.map(p => (
                    <div 
                      key={p.id}
                      onClick={() => setActiveProject(p)}
                      className={`nav-item ${activeProject?.id === p.id ? 'active' : ''}`}
                      style={{ 
                        padding: '10px 12px', 
                        borderRadius: '6px', 
                        cursor: 'pointer', 
                        display: 'flex',
                        flexDirection: 'column',
                        gap: '2px',
                        overflow: 'hidden'
                      }}
                    >
                      <div style={{ fontWeight: 600, fontSize: '0.85rem', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>{p.name}</div>
                      <div style={{ fontSize: '0.68rem', color: 'var(--on-surface-variant)', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden' }}>
                        {p.description ? p.description.slice(0, 40) + '...' : 'No description'}
                      </div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* User profile controls */}
          <div style={{ borderTop: '1px solid var(--border-specular)', paddingTop: '14px', display: 'flex', flexDirection: 'column', gap: '10px', marginTop: 'auto', flexShrink: 0 }}>
            {sidebarCollapsed ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
                <div 
                  style={{ background: '#3b82f6', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}
                  title={`${currentUser} (${userRole})`}
                >
                  {currentUser ? currentUser[0].toUpperCase() : 'U'}
                </div>
                {userRole === 'admin' && (
                  <button className="btn btn-secondary" onClick={() => navigate('/system-admin')} style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Admin Controls">
                    <ShieldCheck size={14} />
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setAuth(null)} style={{ width: '28px', height: '28px', borderRadius: '50%', padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }} title="Logout">
                  <LogOut size={14} />
                </button>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <div style={{ background: '#3b82f6', width: '28px', height: '28px', borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontSize: '0.8rem', fontWeight: 'bold' }}>
                    {currentUser ? currentUser[0].toUpperCase() : 'U'}
                  </div>
                  <div style={{ overflow: 'hidden' }}>
                    <div style={{ fontSize: '0.85rem', fontWeight: 'bold', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{currentUser}</div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>{userRole === 'admin' ? 'Administrator' : 'Author'}</div>
                  </div>
                </div>
                {userRole === 'admin' && (
                  <button className="btn btn-secondary" onClick={() => navigate('/system-admin')} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', width: '100%' }}>
                    <ShieldCheck size={14} />
                    Admin Controls
                  </button>
                )}
                <button className="btn btn-secondary" onClick={() => setAuth(null)} style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', width: '100%' }}>
                  <LogOut size={14} />
                  Logout
                </button>
              </>
            )}
          </div>
        </div>

        {/* Sidebar collapse button */}
        <button 
          className="panel-collapse-btn" 
          style={{ right: '-10px' }}
          onClick={() => setSidebarCollapsed(!sidebarCollapsed)}
          title={sidebarCollapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {sidebarCollapsed ? '›' : '‹'}
        </button>
      </aside>

      {/* Main Content Area */}
      <main style={{ flex: 1, padding: '28px 32px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '24px' }}>
        {userRole === 'admin' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--on-surface-variant)' }}>
            <ShieldCheck size={64} color="#3b82f6" style={{ marginBottom: '16px', opacity: 0.8 }} />
            <h2>Administrator Dashboard</h2>
            <p style={{ marginTop: '8px', maxWidth: '400px', textAlign: 'center' }}>
              Welcome to the workspace. As an administrator, your primary role is to manage backend configuration, analytics, and user roles. 
            </p>
            <button 
              className="btn btn-primary" 
              style={{ marginTop: '24px', padding: '10px 24px' }}
              onClick={() => navigate('/system-admin')}
            >
              <ShieldCheck size={16} /> Open System Admin Panel
            </button>
          </div>
        ) : (
          <>
            <div>
              <h2>Author Console</h2>
              <p style={{ color: 'var(--on-surface-variant)', margin: '4px 0 0 0' }}>Manage project documents and pipelines.</p>
            </div>

            {activeProject ? (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 350px', gap: '32px' }}>
                {/* Project Overview Card */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                  <div className="glass-panel" style={{ padding: '24px', position: 'relative' }}>
                    <h3>{activeProject.name}</h3>
                    <p style={{ marginTop: '8px', color: 'var(--on-surface-variant)' }}>{activeProject.description || 'No description provided.'}</p>
                    <div style={{ marginTop: '16px' }}>
                      <button 
                        className="btn btn-primary" 
                        onClick={() => navigate(`/project/${activeProject.id}/spark`)}
                      >
                        <FolderOpen size={16} />
                        Open Writing Workspace
                      </button>
                    </div>
                  </div>

                  {/* Two-Bucket Upload visual zones (B11) */}
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
                    {/* Bucket 1: Author Material */}
                    <div 
                      className="glass-panel" 
                      style={{ padding: '20px', border: '1px solid rgba(59, 130, 246, 0.15)', display: 'flex', flexDirection: 'column', gap: '12px' }}
                    >
                      <h4 style={{ color: '#60a5fa', margin: 0 }}>Dropzone A: Author Writing</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                        Upload your own writing drafts, chapters, and stylistic reference documents to construct your style persona.
                      </p>
                      <button 
                        className="btn btn-secondary"
                        style={{ border: '1px dashed rgba(59, 130, 246, 0.4)', background: 'rgba(59, 130, 246, 0.02)' }}
                        onClick={() => {
                          setActiveUploadBucket('author_material');
                          fileInputRef.current.click();
                        }}
                      >
                        <UploadCloud size={16} style={{ marginRight: '6px' }} />
                        Upload Author Docs
                      </button>
                    </div>

                    {/* Bucket 2: Market Research */}
                    <div 
                      className="glass-panel" 
                      style={{ padding: '20px', border: '1px solid rgba(139, 92, 246, 0.15)', display: 'flex', flexDirection: 'column', gap: '12px' }}
                    >
                      <h4 style={{ color: '#a78bfa', margin: 0 }}>Dropzone B: Market Research</h4>
                      <p style={{ fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}>
                        Upload competitor books, reference logs, gap outlines, or external topic guides to feed context research.
                      </p>
                      <button 
                        className="btn btn-secondary"
                        style={{ border: '1px dashed rgba(139, 92, 246, 0.4)', background: 'rgba(139, 92, 246, 0.02)' }}
                        onClick={() => {
                          setActiveUploadBucket('market_research');
                          fileInputRef.current.click();
                        }}
                      >
                        <UploadCloud size={16} style={{ marginRight: '6px' }} />
                        Upload Research Docs
                      </button>
                    </div>
                  </div>
                </div>

                {/* Uploaded Documents List */}
                <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
                  <h4>Project Knowledge Base</h4>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', overflowY: 'auto', maxHeight: '400px' }}>
                    {recentUploads.length === 0 ? (
                      <span style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)', textAlign: 'center', padding: '20px' }}>
                        No source documents uploaded yet.
                      </span>
                    ) : (
                      recentUploads.map(doc => (
                        <div 
                          key={doc.id} 
                          style={{ 
                            display: 'flex', 
                            justifyContent: 'space-between', 
                            alignItems: 'center', 
                            padding: '10px', 
                            background: 'rgba(255,255,255,0.02)', 
                            border: '1px solid var(--border-color)', 
                            borderRadius: '6px' 
                          }}
                        >
                          <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', overflow: 'hidden' }}>
                            <span style={{ fontSize: '0.8rem', fontWeight: 'bold', textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap' }}>{doc.filename}</span>
                            <span style={{ fontSize: '0.65rem', color: doc.bucket === 'market_research' ? '#a78bfa' : '#60a5fa' }}>
                              {doc.bucket === 'market_research' ? 'Market Research' : 'Author Material'}
                            </span>
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                            {doc.status === 'PROCESSING' && <Loader size={12} className="animate-spin" />}
                            {doc.status === 'FAILED' && <AlertTriangle size={12} color="#ef4444" />}
                            {doc.status === 'READY' && <CheckCircle size={12} color="#10b981" />}
                            <button style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)' }} onClick={() => handleDeleteDoc(doc.id)}>
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              </div>
            ) : (
              <div style={{ border: '1px dashed var(--border-color)', borderRadius: '12px', padding: '40px', textAlign: 'center', color: 'var(--on-surface-variant)' }}>
                <h4>No Active Project Selected</h4>
                <p style={{ marginTop: '6px', fontSize: '0.85rem' }}>Select a project from the sidebar list or click New to create one.</p>
              </div>
            )}
          </>
        )}
      </main>

      {/* Hidden File Input */}
      <input 
        type="file" 
        ref={fileInputRef} 
        style={{ display: 'none' }} 
        onChange={handleFileChange} 
        multiple 
      />

      {/* Create Project Modal */}
      {showCreateModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 100 }}>
          <form ref={modalRef} onSubmit={handleCreateProject} className="glass-panel-elevated" style={{ width: '400px', padding: '32px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
            <h4>Create New Writing Project</h4>
            <div className="form-group">
              <label className="form-label">Project Name</label>
              <input type="text" className="form-input" value={newProjectName} onChange={e => setNewProjectName(e.target.value)} required placeholder="e.g. Science Fiction Novel" />
            </div>
            <div className="form-group">
              <label className="form-label">Description</label>
              <textarea className="form-input" style={{ height: '80px', resize: 'none' }} value={newProjectDesc} onChange={e => setNewProjectDesc(e.target.value)} placeholder="Summary of the book target, plot, or timeline..." />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)}>Cancel</button>
              <button type="submit" className="btn btn-primary">Create Project</button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
