import { useState, useEffect } from 'react';
import { Routes, Route, Navigate, useParams, useLocation, useNavigate } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';
import { apiClient } from '../services/api';
import BookContextForm from '../components/BookContext/BookContextForm';
import OutlineGenerator from '../components/Outline/OutlineGenerator';
import ChapterEditor from '../components/Chapter/ChapterEditor';
import AISidebar from '../components/AISidebar/AISidebar';
import JourneyThread from '../components/JourneyThread';
import ActivityLog from '../components/ActivityLog';
import ExportCeremony from '../components/ExportCeremony';
import RefineHub from '../components/Refine/RefineHub';
import { BookOpen, FolderTree, FileText, Download, Plus, Trash2, ArrowLeft, ChevronDown, Loader } from 'lucide-react';

export default function BookWorkspace() {
  const { projectId } = useParams();
  const location = useLocation();
  const navigate = useNavigate();

  const { 
    activeProject, 
    setActiveProject, 
    projects,
    setProjects,
    chapters, 
    setChapters,
    activeChapter,
    setActiveChapter,
    backendConnected,
    leftPanelCollapsed,
    setLeftPanelCollapsed,
    rightPanelCollapsed,
    setRightPanelCollapsed,
    zenMode,
    setZenMode,
    addToast,
    showConfirm,
    showInput,
    currentUser,
    currentPhase,
    ceremonyOpen,
    setCeremonyOpen
  } = useAppStore();

  const [addingChapter, setAddingChapter] = useState(false);
  const [exportingFormat, setExportingFormat] = useState(null); // null | 'book-docx' | 'book-pdf'
  const [draggedIndex, setDraggedIndex] = useState(null);

  const handleDragStart = (e, index) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  const handleDrop = async (e, targetIndex) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === targetIndex) return;

    const reordered = [...chapters];
    const [draggedItem] = reordered.splice(draggedIndex, 1);
    reordered.splice(targetIndex, 0, draggedItem);

    const updated = reordered.map((ch, idx) => ({ ...ch, order: idx + 1 }));
    setChapters(updated);
    setDraggedIndex(null);

    try {
      if (backendConnected && activeProject) {
        await Promise.all(
          updated.map(ch => 
            apiClient.updateChapter(activeProject.id, ch.id, { order: ch.order })
          )
        );
        addToast("Chapter order updated!", "success");
      }
    } catch (err) {
      addToast("Failed to sync chapter order", "error");
    }
  };

  // Ensure project is loaded if directly hitting URL
  useEffect(() => {
    async function initProject() {
      if (!backendConnected) return;
      if (!activeProject || activeProject.id !== projectId) {
        // Find in existing list
        let proj = projects.find(p => p.id === projectId);
        if (!proj) {
          // Fallback fetch all projects if not loaded
          try {
            const list = await apiClient.getProjects();
            setProjects(list);
            proj = list.find(p => p.id === projectId);
          } catch (e) {
            console.error(e);
          }
        }
        if (proj) {
          setActiveProject(proj);
        } else {
          // Not found, redirect back
          navigate('/dashboard');
        }
      }
    }
    initProject();
  }, [projectId, backendConnected, activeProject, projects, navigate, setActiveProject, setProjects]);

  // Load chapters for this project
  const loadChapters = async () => {
    if (!activeProject || !backendConnected) return;
    try {
      const list = await apiClient.getChapters(activeProject.id);
      setChapters(list);
      if (list.length > 0 && !activeChapter) {
        setActiveChapter(list[0]);
      }
    } catch (e) {
      console.error(e);
    }
  };

  useEffect(() => {
    loadChapters();
  }, [activeProject]);



  const handleAddChapter = async () => {
    if (!activeProject || !backendConnected) return;
    showInput({
      title: "Add New Chapter",
      message: "Enter the title for your new chapter:",
      defaultValue: `Chapter ${chapters.length + 1}`,
      placeholder: "e.g. Introduction",
      onConfirm: async (title) => {
        setAddingChapter(true);
        try {
          const newChap = await apiClient.createChapter(activeProject.id, title, chapters.length + 1);
          setChapters([...chapters, newChap]);
          setActiveChapter(newChap);
          navigate(`/project/${activeProject.id}/manuscript`);
          addToast(`Chapter "${title}" created!`, "success");
        } catch (err) {
          addToast("Failed to create chapter", "error");
        } finally {
          setAddingChapter(false);
        }
      }
    });
  };

  const handleDeleteChapter = async (e, chapId) => {
    e.stopPropagation();
    if (!activeProject || !backendConnected) return;
    showConfirm({
      message: "Are you sure you want to delete this chapter?",
      danger: true,
      onConfirm: async () => {
        try {
          await apiClient.deleteChapter(activeProject.id, chapId);
          const remaining = chapters.filter(c => c.id !== chapId);
          setChapters(remaining);
          if (activeChapter?.id === chapId) {
            setActiveChapter(remaining.length > 0 ? remaining[0] : null);
          }
        } catch (err) {
          addToast("Failed to delete chapter", "error");
        }
      }
    });
  };

  // Authenticated file download via fetch — avoids token-in-URL approach
  const handleExport = async (format, type = 'chapter') => {
    if (!activeProject) return;
    setCeremonyOpen(false);

    if (type === 'chapter' && !activeChapter) {
      addToast("Please select a chapter first!", "info");
      return;
    }

    const exportKey = `${type}-${format}`;
    setExportingFormat(exportKey);

    const token = localStorage.getItem('pensive_token') || '';
    let url = '';
    if (type === 'chapter') {
      url = `http://127.0.0.1:8080/api/v1/projects/${activeProject.id}/export/chapter/${activeChapter.id}/${format}`;
    } else {
      url = `http://127.0.0.1:8080/api/v1/projects/${activeProject.id}/export/book/${format}`;
    }

    try {
      const response = await fetch(url, {
        headers: { 'Authorization': `Bearer ${token}` }
      });
      if (!response.ok) {
        addToast(`Export failed: ${response.statusText}`, "error");
        return;
      }
      const blob = await response.blob();
      const objectUrl = URL.createObjectURL(blob);
      const a = document.createElement('a');
      const filename = type === 'chapter'
        ? `${activeChapter.title || 'chapter'}.${format}`
        : `${activeProject.name || 'manuscript'}.${format}`;
      a.href = objectUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(objectUrl);
    } catch (err) {
      addToast("Export failed: " + err.message, "error");
    } finally {
      setExportingFormat(null);
    }
  };

  const exportLoading = exportingFormat !== null;

  const isLeftCollapsed = leftPanelCollapsed || zenMode;
  const isRightCollapsed = rightPanelCollapsed || zenMode;

  // When collapsed, width 0 means center takes full space;
  // floating expand buttons are rendered over the center edges
  const leftWidth = isLeftCollapsed ? '0px' : 'var(--panel-left-width)';
  const rightWidth = isRightCollapsed ? '0px' : 'var(--panel-right-width)';

  return (
    <div style={{
      display: 'grid',
      gridTemplateRows: zenMode ? '40px 1fr' : '56px 1fr',
      height: '100vh',
      width: '100vw',
      background: 'var(--bg-color)',
      overflow: 'hidden'
    }}>
      {/* ─── Top Header Bar ─── */}
      <header style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '0 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(11, 19, 38, 0.85)',
        backdropFilter: 'blur(12px)',
        gap: '12px',
        flexShrink: 0,
        height: zenMode ? '40px' : '56px',
        overflow: 'hidden',
      }}>
        {/* Left: back + project name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', minWidth: 0, flexShrink: 1 }}>
          <button
            className="btn btn-secondary"
            style={{ padding: '6px 8px', flexShrink: 0 }}
            onClick={() => {
              setActiveProject(null);
              navigate('/dashboard');
            }}
            title="Back to Dashboard"
          >
            <ArrowLeft size={15} />
          </button>
          {!zenMode && (
            <div style={{ minWidth: 0 }}>
              <h3 style={{ margin: 0, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {activeProject?.name}
              </h3>
              <p style={{ margin: 0, fontSize: '0.7rem', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                Author workspace
                <span title={backendConnected ? 'Backend connected' : 'Backend offline'} style={{
                  width: 8, height: 8, borderRadius: '50%',
                  background: backendConnected ? '#10b981' : '#ef4444',
                  boxShadow: backendConnected ? '0 0 6px #10b981' : '0 0 6px #ef4444',
                  display: 'inline-block'
                }} />
              </p>
            </div>
          )}
        </div>

        {/* Center: Journey progress thread */}
        <div style={{ flexShrink: 0 }}>
          <JourneyThread />
        </div>

        {/* Right: Export Ceremony button */}
        <div style={{ flexShrink: 0 }}>
          <button
            className="btn btn-secondary"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: zenMode ? '4px 8px' : '6px 12px' }}
            onClick={() => setCeremonyOpen(true)}
            disabled={exportLoading}
          >
            <Download size={14} />
            {!zenMode && 'Export My Book'}
          </button>
        </div>
      </header>

      {/* ─── Main 3-panel Flex Layout ─── */}
      <div style={{
        display: 'flex',
        height: zenMode ? 'calc(100vh - 40px)' : 'calc(100vh - 56px)',
        overflow: 'hidden',
        minWidth: 0,
        position: 'relative'
      }}>

        {/* Panel 1: Chapter outline tree (HIDDEN UNLESS IN MANUSCRIPT PHASE) */}
        {location.pathname.includes('/manuscript') && (
          <div style={{
            width: leftWidth,
            minWidth: leftWidth,
            transition: 'var(--panel-transition)',
            borderRight: isLeftCollapsed ? 'none' : '1px solid var(--border-color)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(6, 14, 32, 0.4)',
            flexShrink: 0,
            position: 'relative',
            overflow: 'visible',  /* must be visible so collapse btn isn't clipped */
          }}>
            {/* Scrollable inner container - separate from outer overflow:visible */}
            <div style={{
              flex: 1,
              display: 'flex',
              flexDirection: 'column',
              gap: '12px',
              overflowY: isLeftCollapsed ? 'hidden' : 'auto',
              overflowX: 'hidden',
              padding: '16px',
              width: '100%',
              height: '100%',
              opacity: isLeftCollapsed ? 0 : 1,
              transition: 'opacity 0.2s',
              pointerEvents: isLeftCollapsed ? 'none' : 'auto',
            }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexShrink: 0 }}>
                <span style={{ fontWeight: '700', fontSize: '0.72rem', color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  MANUSCRIPT
                </span>
                <button
                  className="btn btn-secondary"
                  style={{ padding: '3px 8px', fontSize: '0.72rem', gap: '4px' }}
                  onClick={handleAddChapter}
                  disabled={addingChapter}
                  title="Add chapter"
                >
                  {addingChapter ? <Loader size={10} className="animate-spin" /> : <Plus size={10} />}
                  Add
                </button>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                {chapters.length === 0 ? (
                  <div className="empty-state" style={{ padding: '24px 8px', gap: '6px' }}>
                    <FileText size={24} className="empty-state-icon" />
                    <span style={{ fontSize: '0.78rem' }}>No chapters yet</span>
                  </div>
                ) : (
                  chapters.map((ch, idx) => {
                    const wordCount = ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0;
                    return (
                      <div
                        key={ch.id}
                        draggable
                        onDragStart={(e) => handleDragStart(e, idx)}
                        onDragOver={handleDragOver}
                        onDrop={(e) => handleDrop(e, idx)}
                        className={`nav-item ${activeChapter?.id === ch.id ? 'active' : ''}`}
                        onClick={() => {
                          setActiveChapter(ch);
                          navigate(`/project/${activeProject.id}/manuscript`);
                        }}
                        style={{
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                          padding: '8px 10px',
                          fontSize: '0.82rem',
                          gap: '6px',
                          cursor: 'grab'
                        }}
                      >
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', overflow: 'hidden', flex: 1 }}>
                          <span style={{ 
                            fontSize: '0.65rem', 
                            fontWeight: 700, 
                            color: 'var(--on-surface-variant)',
                            minWidth: '20px', 
                            opacity: 0.6
                          }}>
                            {String(ch.order || idx + 1).padStart(2, '0')}
                          </span>
                          <div style={{ overflow: 'hidden', flex: 1 }}>
                            <div style={{ textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', fontSize: '0.82rem' }}>
                              {ch.title}
                            </div>
                            <div className="word-count-chip">
                              {wordCount > 0 ? `${wordCount.toLocaleString()} words` : 'empty'}
                            </div>
                          </div>
                        </div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexShrink: 0 }}>
                          <div style={{ 
                            width: 6, 
                            height: 6, 
                            borderRadius: '50%', 
                            flexShrink: 0,
                            background: wordCount === 0 ? '#4b5563' : 
                              wordCount > 500 ? '#10b981' : '#f59e0b'
                          }} />
                          <button
                            style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', padding: '2px', borderRadius: '4px', transition: 'color 0.15s' }}
                            onClick={(e) => handleDeleteChapter(e, ch.id)}
                            title="Delete chapter"
                            onMouseEnter={e => e.currentTarget.style.color = '#ef4444'}
                            onMouseLeave={e => e.currentTarget.style.color = ''}
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
              <ActivityLog />
            </div>

            {/* Left panel collapse button — always rendered on right edge of left panel */}
            <button 
              className="panel-collapse-btn" 
              style={{ right: '-10px', borderRadius: '0 6px 6px 0' }}
              onClick={() => setLeftPanelCollapsed(!leftPanelCollapsed)}
              title={isLeftCollapsed ? "Expand chapters sidebar" : "Collapse chapters sidebar"}
            >
              {isLeftCollapsed ? '›' : '‹'}
            </button>
          </div>
        )}

        {/* Panel 2: Main content area (using React Router) */}
        <div style={{ flex: 1, overflowY: 'auto', minWidth: 0, position: 'relative' }}>
          <Routes>
            <Route path="spark" element={<BookContextForm />} />
            <Route path="blueprint" element={<OutlineGenerator />} />
            <Route path="manuscript" element={<ChapterEditor />} />
            <Route path="refine" element={<RefineHub />} />
            <Route path="*" element={<Navigate to={currentPhase || "spark"} replace />} />
          </Routes>
        </div>

        {/* Panel 3: AI Sidebar */}
        <div style={{
          width: rightWidth,
          minWidth: rightWidth,
          transition: 'var(--panel-transition)',
          borderLeft: isRightCollapsed ? 'none' : '1px solid var(--border-color)',
          flexShrink: 0,
          position: 'relative',
          background: 'rgba(6, 14, 32, 0.4)',
          overflow: 'visible', /* must be visible so collapse btn isn't clipped */
        }}>
          {/* Inner scrollable container — overflow:hidden here is fine since btn is on outer */}
          <div style={{ width: '100%', height: '100%', overflow: 'hidden',
            opacity: isRightCollapsed ? 0 : 1,
            transition: 'opacity 0.2s',
            pointerEvents: isRightCollapsed ? 'none' : 'auto',
          }}>
            <AISidebar />
          </div>

          {/* Right panel collapse button — always visible on left edge of right panel */}
          <button 
            className="panel-collapse-btn" 
            style={{ left: '-10px', borderRadius: '6px 0 0 6px' }}
            onClick={() => setRightPanelCollapsed(!rightPanelCollapsed)}
            title={isRightCollapsed ? "Expand AI Chat sidebar" : "Collapse AI Chat sidebar"}
          >
            {isRightCollapsed ? '‹' : '›'}
          </button>
        </div>

      </div>

      {ceremonyOpen && (
        <ExportCeremony
          projectId={activeProject.id}
          bookTitle={activeProject.name}
          authorName={currentUser || 'Author'}
          onClose={() => setCeremonyOpen(false)}
          onExport={(format) => handleExport(format, 'book')}
        />
      )}
    </div>
  );
}
