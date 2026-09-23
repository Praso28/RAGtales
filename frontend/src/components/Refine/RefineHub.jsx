import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/api';
import { ShieldCheck, Sparkles, FileText, CheckCircle, ArrowRight, RefreshCw, AlertCircle, Award } from 'lucide-react';

export default function RefineHub() {
  const navigate = useNavigate();
  const { activeProject, chapters, setChapters, backendConnected, addToast, setCeremonyOpen } = useAppStore();
  const [selectedChapter, setSelectedChapter] = useState(null);
  const [checkingOriginality, setCheckingOriginality] = useState(false);
  const [refining, setRefining] = useState(false);
  const [stats, setStats] = useState({
    avgOriginality: 100,
    totalWords: 0,
    chaptersCount: 0,
    readyCount: 0
  });

  // Load stats and chapters
  useEffect(() => {
    async function loadStats() {
      if (!activeProject || !backendConnected) return;
      try {
        const data = await apiClient.getProjectStats(activeProject.id);
        const chs = await apiClient.getChapters(activeProject.id);
        setChapters(chs);
        
        const ready = chs.filter(c => c.originality_score && c.originality_score.overall_similarity < 25).length;
        
        setStats({
          avgOriginality: data.avg_originality,
          totalWords: data.total_words,
          chaptersCount: chs.length,
          readyCount: ready
        });

        if (chs.length > 0 && !selectedChapter) {
          setSelectedChapter(chs[0]);
        }
      } catch (err) {
        console.error("Failed to load project details:", err);
      }
    }
    loadStats();
  }, [activeProject, backendConnected, selectedChapter]);

  const handleCheckOriginality = async () => {
    if (!activeProject || !selectedChapter || !backendConnected) return;
    setCheckingOriginality(true);
    try {
      const report = await apiClient.checkOriginality(activeProject.id, selectedChapter.id);
      addToast(`Originality checked! Similarity score: ${report.overall_similarity}%`, "success");
      // Update local chapters list with updated originality
      const updated = chapters.map(c => c.id === selectedChapter.id ? { ...c, originality_score: report } : c);
      setChapters(updated);
      setSelectedChapter({ ...selectedChapter, originality_score: report });
    } catch (err) {
      addToast("Originality check failed", "error");
    } finally {
      setCheckingOriginality(false);
    }
  };

  const handleRefine = async () => {
    if (!activeProject || !selectedChapter || !backendConnected) return;
    setRefining(true);
    try {
      const res = await apiClient.refineChapter(activeProject.id, selectedChapter.id);
      addToast("Chapter humanized and polished successfully!", "success");
      const updated = chapters.map(c => c.id === selectedChapter.id ? res.chapter : c);
      setChapters(updated);
      setSelectedChapter(res.chapter);
    } catch (err) {
      addToast("Failed to refine chapter", "error");
    } finally {
      setRefining(false);
    }
  };

  if (!activeProject) return null;

  const totalChapters = chapters.length;
  const averageOriginality = stats.avgOriginality;
  const isReadyForExport = totalChapters > 0 && chapters.every(c => c.content && c.content.trim().length > 0);

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', padding: '24px', display: 'flex', flexDirection: 'column', gap: '24px' }}>
      
      {/* Premium Header Banner */}
      <div style={{
        background: 'linear-gradient(135deg, rgba(16, 185, 129, 0.15) 0%, rgba(99, 102, 241, 0.05) 100%)',
        border: '1px solid rgba(16, 185, 129, 0.2)',
        borderRadius: '12px',
        padding: '24px',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        gap: '20px',
        flexWrap: 'wrap'
      }}>
        <div>
          <h2 style={{ margin: 0, fontSize: '1.5rem', display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--primary-color)' }}>
            <ShieldCheck color="#10b981" />
            Refine & Polish Hub
          </h2>
          <p style={{ margin: '6px 0 0 0', fontSize: '0.88rem', color: 'var(--on-surface-variant)', maxWidth: '600px' }}>
            Review originality, execute natural language polishing, and prepare your final manuscript for the publication ceremony.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '12px' }}>
          <button 
            className="btn btn-primary"
            style={{ background: 'linear-gradient(135deg, #10b981, #059669)', border: 'none', display: 'flex', alignItems: 'center', gap: '8px' }}
            onClick={() => {
              setCeremonyOpen(true);
            }}
          >
            <Award size={16} />
            Ceremony Room
          </button>
        </div>
      </div>

      {/* Grid: 3 Panels */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px', minHeight: '500px' }}>
        
        {/* Panel 1: Chapter Checklist */}
        <div className="glass-panel" style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <h4 style={{ margin: 0, borderBottom: '1px solid var(--border-color)', paddingBottom: '10px', fontSize: '0.9rem', color: 'var(--on-surface-variant)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
            Manuscript Status
          </h4>
          
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', flex: 1 }}>
            {chapters.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 0' }}>
                <FileText className="empty-state-icon" size={32} />
                <span style={{ fontSize: '0.85rem' }}>No chapters drafted yet.</span>
              </div>
            ) : (
              chapters.map((ch, idx) => {
                const isSelected = selectedChapter?.id === ch.id;
                const similarity = ch.originality_score?.overall_similarity;
                const wordCount = ch.content ? ch.content.split(/\s+/).filter(Boolean).length : 0;
                
                let scoreColor = '#4b5563'; // Gray (unchecked)
                if (similarity !== undefined) {
                  scoreColor = similarity < 15 ? '#10b981' : similarity < 35 ? '#f59e0b' : '#ef4444';
                }

                return (
                  <div
                    key={ch.id}
                    className={`nav-item ${isSelected ? 'active' : ''}`}
                    onClick={() => setSelectedChapter(ch)}
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      padding: '10px 12px',
                      cursor: 'pointer',
                      borderRadius: '8px',
                      border: isSelected ? '1px solid rgba(16, 185, 129, 0.3)' : '1px solid transparent',
                      background: isSelected ? 'rgba(16, 185, 129, 0.05)' : ''
                    }}
                  >
                    <div style={{ overflow: 'hidden', marginRight: '8px' }}>
                      <div style={{ fontWeight: '500', fontSize: '0.85rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {ch.title}
                      </div>
                      <div style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)' }}>
                        {wordCount} words
                      </div>
                    </div>

                    {/* Originality score badge */}
                    <div style={{
                      padding: '3px 8px',
                      borderRadius: '12px',
                      fontSize: '0.7rem',
                      fontWeight: '700',
                      background: `${scoreColor}1c`,
                      color: scoreColor,
                      border: `1px solid ${scoreColor}40`,
                      whiteSpace: 'nowrap'
                    }}>
                      {similarity !== undefined ? `${100 - similarity}% orig` : 'unchecked'}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Panel 2 & 3: Selected Chapter original report and refinement */}
        <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
          {selectedChapter ? (
            <>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem' }}>{selectedChapter.title}</h3>
                  <p style={{ margin: '4px 0 0 0', fontSize: '0.78rem', color: 'var(--on-surface-variant)' }}>
                    Originality & Natural Language Polish controls
                  </p>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => navigate(`/project/${activeProject.id}/manuscript`)}
                    style={{ fontSize: '0.8rem', padding: '6px 12px' }}
                  >
                    Open in Editor
                  </button>
                </div>
              </div>

              {/* Stats overview of current chapter */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.01)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>Word Count</span>
                  <div style={{ fontSize: '1.25rem', fontWeight: '700', marginTop: '4px' }}>
                    {(selectedChapter.content || '').split(/\s+/).filter(Boolean).length.toLocaleString()}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.01)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>AI Content Match</span>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '700', 
                    marginTop: '4px',
                    color: selectedChapter.originality_score?.overall_similarity > 35 ? '#ef4444' : '#10b981'
                  }}>
                    {selectedChapter.originality_score ? `${selectedChapter.originality_score.overall_similarity}%` : 'N/A'}
                  </div>
                </div>

                <div className="glass-panel" style={{ padding: '14px', background: 'rgba(255, 255, 255, 0.01)', textAlign: 'center' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>Originality Score</span>
                  <div style={{ 
                    fontSize: '1.25rem', 
                    fontWeight: '700', 
                    marginTop: '4px',
                    color: selectedChapter.originality_score?.overall_similarity < 25 ? '#10b981' : '#f59e0b'
                  }}>
                    {selectedChapter.originality_score ? `${100 - selectedChapter.originality_score.overall_similarity}%` : 'N/A'}
                  </div>
                </div>
              </div>

              {/* Action Buttons Panel */}
              <div style={{ display: 'flex', gap: '12px' }}>
                <button
                  className="btn btn-secondary"
                  onClick={handleCheckOriginality}
                  disabled={checkingOriginality || refining}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}
                >
                  {checkingOriginality ? <RefreshCw className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
                  Check Originality Score
                </button>

                <button
                  className="btn btn-primary"
                  onClick={handleRefine}
                  disabled={refining || checkingOriginality}
                  style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px', background: 'linear-gradient(135deg, #10b981, #6366f1)' }}
                >
                  {refining ? <RefreshCw className="animate-spin" size={14} /> : <Sparkles size={14} />}
                  Refine & Humanize
                </button>
              </div>

              {/* Originality details / flagged segments */}
              {selectedChapter.originality_score?.flagged_segments && selectedChapter.originality_score.flagged_segments.length > 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--on-surface-variant)', textTransform: 'uppercase' }}>
                    Flagged Passages ({selectedChapter.originality_score.flagged_segments.length})
                  </span>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '200px', overflowY: 'auto' }}>
                    {selectedChapter.originality_score.flagged_segments.map((seg, sIdx) => (
                      <div key={sIdx} style={{
                        padding: '10px 12px',
                        background: 'rgba(239, 68, 68, 0.05)',
                        border: '1px solid rgba(239, 68, 68, 0.1)',
                        borderRadius: '6px',
                        fontSize: '0.8rem',
                        color: 'var(--on-surface)'
                      }}>
                        <div style={{ fontWeight: '600', color: '#fca5a5', marginBottom: '4px' }}>
                          Match Probability: {seg.similarity}% (Source: {seg.matched_source || 'AI Generator pattern'})
                        </div>
                        "{seg.text}"
                      </div>
                    ))}
                  </div>
                </div>
              ) : selectedChapter.originality_score ? (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.12)',
                  padding: '14px',
                  borderRadius: '8px',
                  color: '#a7f3d0',
                  fontSize: '0.85rem'
                }}>
                  <CheckCircle size={16} color="#10b981" />
                  <span>No highly matching AI patterns detected in this chapter. Highly original!</span>
                </div>
              ) : (
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '10px',
                  background: 'rgba(255, 255, 255, 0.01)',
                  border: '1px dashed var(--border-color)',
                  padding: '14px',
                  borderRadius: '8px',
                  color: 'var(--on-surface-variant)',
                  fontSize: '0.85rem'
                }}>
                  <AlertCircle size={16} />
                  <span>Click "Check Originality Score" to verify this chapter against RAG and style databases.</span>
                </div>
              )}
            </>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flex: 1, gap: '12px' }}>
              <Sparkles size={32} style={{ opacity: 0.3 }} />
              <span style={{ color: 'var(--on-surface-variant)', fontSize: '0.85rem' }}>Select a chapter to begin refinement.</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
