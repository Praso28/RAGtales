import { useState, useEffect, useRef } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/api';
import ScribeMessage from '../ScribeMessage';
import { Sparkles, Loader, Save, ShieldCheck, CheckCircle, AlertTriangle, FileText } from 'lucide-react';

export default function ChapterEditor() {
  const { activeProject, activeChapter, setActiveChapter, setChapters, backendConnected, addToast, bookContext, addActivity, showConfirm } = useAppStore();

  const [editorMode, setEditorMode] = useState('quick'); // 'quick' | 'guided'

  const [isStreaming, setIsStreaming] = useState(false);
  const [scribeMsg, setScribeMsg] = useState('');
  const [scribeMsgType, setScribeMsgType] = useState('speaking'); // 'thinking' | 'speaking' | 'done'

  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [tone, setTone] = useState('Informative');
  const [audience, setAudience] = useState('General Public');
  const [promptInput, setPromptInput] = useState('');

  const [guidedStep, setGuidedStep] = useState(1);
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [qaHistory, setQaHistory] = useState([]);
  const [guidedDone, setGuidedDone] = useState(false);

  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [statusMsg, setStatusMsg] = useState('');

  const [originalityScore, setOriginalityScore] = useState(null);
  const [originalityReport, setOriginalityReport] = useState(null);
  const [checkingOriginality, setCheckingOriginality] = useState(false);
  
  const [lastSavedTime, setLastSavedTime] = useState(null);
  const [originalityCollapsed, setOriginalityCollapsed] = useState(true);
  const streamBufferRef = useRef(''); // accumulates streamed tokens to avoid stale closure


  // Sync originality collapsed state when new report is loaded
  useEffect(() => {
    if (originalityReport?.flagged_items?.length > 0) {
      setOriginalityCollapsed(false);
    } else {
      setOriginalityCollapsed(true);
    }
  }, [originalityReport]);

  // Sync content when active chapter changes
  useEffect(() => {
    if (activeChapter) {
      setTitle(activeChapter.title || '');
      setContent(activeChapter.content || '');
      setOriginalityScore(null);
      setOriginalityReport(null);
      setGuidedStep(1);
      setCurrentQuestion('');
      setCurrentAnswer('');
      setQaHistory([]);
      setGuidedDone(false);
      setEditorMode('quick');
    }
  }, [activeChapter?.id]);

  // Auto-save every 30 seconds
  useEffect(() => {
    if (!activeChapter || !backendConnected) return;
    const interval = setInterval(() => { handleSave(true); }, 30000);
    return () => clearInterval(interval);
  }, [activeChapter, title, content]);

  // Handle global save & generate events from shortcuts
  useEffect(() => {
    const onSaveEvent = () => handleSave(false);
    const onGenerateEvent = () => {
      if (editorMode === 'quick') {
        handleQuickGenerate();
      } else if (editorMode === 'guided') {
        if (guidedDone) {
          handleFinishGuided();
        } else {
          handleAnswerSubmit();
        }
      }
    };

    document.addEventListener('save-chapter', onSaveEvent);
    document.addEventListener('generate-chapter', onGenerateEvent);

    return () => {
      document.removeEventListener('save-chapter', onSaveEvent);
      document.removeEventListener('generate-chapter', onGenerateEvent);
    };
  }, [editorMode, guidedDone, title, content, promptInput, tone, audience, activeChapter, activeProject, backendConnected]);

  const handleSave = async (silent = false) => {
    if (!activeProject || !activeChapter || !backendConnected) return;
    if (!silent) {
      setSaving(true);
      setSaveStatus('saving');
      setScribeMsgType('thinking');
      setScribeMsg('Saving your manuscript...');
    }
    try {
      const updated = await apiClient.updateChapter(activeProject.id, activeChapter.id, { title, content });
      setActiveChapter(updated);
      setLastSavedTime(new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }));
      
      addActivity({ 
        icon: '💾', 
        message: silent ? `Chapter "${title}" auto-saved` : `Chapter "${title}" saved` 
      });

      if (!silent) {
        setSaveStatus('saved');
        setScribeMsgType('done');
        setScribeMsg('Manuscript saved.');
        setTimeout(() => setSaveStatus(''), 2500);
      }
    } catch (e) {
      if (!silent) {
        setSaveStatus('error');
        setScribeMsgType('speaking');
        setScribeMsg('Failed to save manuscript.');
        setTimeout(() => setSaveStatus(''), 3000);
      }
    } finally {
      if (!silent) setSaving(false);
    }
  };

  const handleQuickGenerate = async () => {
    if (!activeProject || !activeChapter || !promptInput.trim() || !backendConnected) return;
    setLoading(true);
    setIsStreaming(true);
    setContent('');
    streamBufferRef.current = ''; // reset accumulator
    setScribeMsgType('thinking');
    setScribeMsg(`Reading your context${bookContext?.audience ? ` — writing for ${bookContext.audience}` : ''}. Drafting now...`);

    apiClient.generateChapterStream(
      activeProject.id,
      activeChapter.id,
      promptInput,
      tone,
      audience,
      (token) => {
        streamBufferRef.current += token;
        setContent(prev => prev + token);
      },
      (data) => {
        setIsStreaming(false);
        setLoading(false);
        setPromptInput('');
        setScribeMsgType('done');

        let origScoreText = '';
        if (data.originality) {
          const score = data.originality.overall_similarity;
          setOriginalityScore(score);
          setOriginalityReport(data.originality);
          origScoreText = ` · Originality ${100 - score}%`;
          addActivity({ icon: '🛡', message: `Originality checked: ${100 - score}% original` });
        }

        apiClient.getChapters(activeProject.id).then(list => {
          setChapters(list);
          const found = list.find(c => c.id === activeChapter.id);
          if (found) {
            setActiveChapter(found);
            setTitle(found.title);
            setContent(found.content);
          }
        });

        // Use the accumulated ref buffer for accurate word count
        const finalContent = streamBufferRef.current;
        const words = finalContent.split(/\s+/).filter(Boolean).length;
        setScribeMsg(`Your chapter is ready. ${words.toLocaleString()} words. This is yours.`);
        addActivity({ icon: '📖', message: `Chapter "${activeChapter.title}" drafted (${words} words)` });
      },
      (err) => {
        setIsStreaming(false);
        setLoading(false);
        setScribeMsgType('speaking');
        setScribeMsg('Generation failed: ' + (err.message || 'unknown'));
      }
    );
  };

  const handleStartGuided = async () => {
    if (!activeProject || !activeChapter || !backendConnected) return;
    setLoading(true);
    setGuidedDone(false);
    setQaHistory([]);
    try {
      const res = await apiClient.generateGuidedStart(activeProject.id, activeChapter.id);
      setGuidedStep(res.step);
      setCurrentQuestion(res.question);
    } catch (e) {
      addToast("Failed to start guided session", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleAnswerSubmit = async (e) => {
    e?.preventDefault();
    if (!activeProject || !activeChapter || !currentAnswer.trim() || !backendConnected) return;
    setLoading(true);

    const updatedHistory = [...qaHistory, { question: currentQuestion, answer: currentAnswer }];
    setQaHistory(updatedHistory);
    setCurrentAnswer('');

    try {
      const res = await apiClient.generateGuidedAnswer(activeProject.id, activeChapter.id, updatedHistory);
      setGuidedStep(res.step);
      if (res.done) {
        setGuidedDone(true);
        setCurrentQuestion('');
      } else {
        setCurrentQuestion(res.question);
      }
    } catch (err) {
      addToast("Failed to submit answer", "error");
    } finally {
      setLoading(false);
    }
  };

  const handleFinishGuided = async () => {
    if (!activeProject || !activeChapter || !backendConnected) return;
    setLoading(true);
    setScribeMsgType('thinking');
    setScribeMsg(`Compiling interview responses for "${activeChapter.title}"... Drafting now...`);
    try {
      const res = await apiClient.generateGuidedFinish(activeProject.id, activeChapter.id, qaHistory, tone, audience);
      const updatedChapter = res.chapter;
      setActiveChapter(updatedChapter);
      setTitle(updatedChapter.title);
      setContent(updatedChapter.content);

      const words = updatedChapter.content.split(/\s+/).filter(Boolean).length;
      let origScoreText = '';

      if (res.originality_report) {
        const score = res.originality_report.overall_similarity;
        setOriginalityScore(score);
        setOriginalityReport(res.originality_report);
        origScoreText = ` · Originality ${100 - score}%`;
        addActivity({ icon: '🛡', message: `Originality checked: ${100 - score}% original` });
      }

      setEditorMode('quick');
      setGuidedDone(false);
      setQaHistory([]);
      setScribeMsgType('done');
      setScribeMsg(`Your chapter is ready. ${words.toLocaleString()} words. This is yours.`);

      addActivity({ icon: '📖', message: `Chapter "${updatedChapter.title}" drafted (${words} words)` });
    } catch {
      setScribeMsgType('speaking');
      setScribeMsg('Guided generation failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleCheckOriginality = async () => {
    if (!activeProject || !activeChapter || !backendConnected) return;
    setCheckingOriginality(true);
    setScribeMsgType('thinking');
    setScribeMsg('Scanning manuscript against reference sources...');
    try {
      const res = await apiClient.checkOriginality(activeProject.id, activeChapter.id);
      const score = res.overall_similarity;
      setOriginalityScore(score);
      setOriginalityReport(res);

      const originalScore = 100 - score;
      if (score <= 25) {
        setScribeMsgType('done');
        setScribeMsg(`Good news — this passage is ${originalScore}% original. Your voice is clear.`);
      } else {
        setScribeMsgType('speaking');
        setScribeMsg(`One note — ${score}% of this passage echoes a source document. I've flagged the specific sections for your review.`);
      }

      addActivity({ icon: '🛡', message: `Originality checked: ${originalScore}% original` });
    } catch {
      addToast("Originality check failed", "error");
      setScribeMsgType('speaking');
      setScribeMsg('Originality check failed.');
    } finally {
      setCheckingOriginality(false);
    }
  };

  const handleReject = () => {
    if (!activeProject || !activeChapter || !backendConnected) return;
    showConfirm({
      message: 'Are you sure you want to reject this draft? This will clear the chapter content and delete its saved drafts. This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        setScribeMsgType('thinking');
        setScribeMsg('Rejecting draft...');
        try {
          await apiClient.rejectChapterDraft(activeProject.id, activeChapter.id);
          
          setContent('');
          setOriginalityScore(null);
          setOriginalityReport(null);
          
          const updatedChapter = { ...activeChapter, content: '', originality_score: null, status: 'draft' };
          setActiveChapter(updatedChapter);
          
          const list = await apiClient.getChapters(activeProject.id);
          setChapters(list);
          
          addToast("Draft rejected and cleared", "info");
          setScribeMsgType('done');
          setScribeMsg('Draft rejected. The manuscript is blank. You can write anew.');
          addActivity({ icon: '🗑', message: `Chapter "${title}" draft rejected` });
        } catch (err) {
          addToast(err.message || 'Failed to reject draft', "error");
          setScribeMsgType('speaking');
          setScribeMsg('Failed to reject draft.');
        } finally {
          setSaving(false);
        }
      }
    });
  };

  if (!activeChapter) {
    return (
      <div className="empty-state" style={{ height: '100%' }}>
        <FileText size={40} className="empty-state-icon" />
        <h4>No Chapter Selected</h4>
        <p style={{ fontSize: '0.82rem' }}>Select a chapter from the outline tree to start writing</p>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      {/* ─── Top Controls ─── */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        padding: '12px 20px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(6, 14, 32, 0.5)',
        flexShrink: 0,
        gap: '10px',
        flexWrap: 'wrap',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span style={{ fontSize: '0.85rem', fontWeight: '600', color: 'var(--on-surface)' }}>Chapter Editor</span>
          {/* Mode switcher */}
          <div className="tab-bar">
            <button
              className={`tab-btn ${editorMode === 'quick' ? 'active' : ''}`}
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              onClick={() => setEditorMode('quick')}
              disabled={loading}
            >
              Quick Mode
            </button>
            <button
              className={`tab-btn ${editorMode === 'guided' ? 'active' : ''}`}
              style={{ padding: '5px 12px', fontSize: '0.78rem' }}
              onClick={() => {
                setEditorMode('guided');
                if (!currentQuestion && !guidedDone) handleStartGuided();
              }}
              disabled={loading}
            >
              Guided Mode
            </button>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' }}>
          {/* Originality badge */}
          {originalityScore !== null && (
            <div className={originalityScore > 25 ? 'badge badge-error' : 'badge badge-success'}>
              {originalityScore > 25 ? <AlertTriangle size={10} /> : <CheckCircle size={10} />}
              Originality {100 - originalityScore}%
            </div>
          )}

          {/* Status message */}
          {statusMsg && (
            <span style={{ fontSize: '0.78rem', color: 'var(--on-surface-variant)' }}>{statusMsg}</span>
          )}

          {/* Save status chip */}
          {saveStatus === 'saving' && (
            <div className="status-chip saving">
              <Loader size={11} className="animate-spin" /> Saving…
            </div>
          )}
          {saveStatus === 'error' && (
            <div className="status-chip error">
              <AlertTriangle size={11} /> Save failed
            </div>
          )}
          {lastSavedTime && !saveStatus && (
            <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)', opacity: 0.6 }}>
              Last saved at {lastSavedTime}
            </span>
          )}

          {content && (
            <button
              className="btn btn-danger"
              style={{ fontSize: '0.8rem', padding: '7px 12px' }}
              onClick={handleReject}
              disabled={saving || loading}
            >
              Reject Draft
            </button>
          )}

          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '7px 12px' }}
            onClick={() => handleSave()}
            disabled={saving || loading}
          >
            {saving ? <Loader size={13} className="animate-spin" /> : <Save size={13} />}
            Save
          </button>

          <button
            className="btn btn-secondary"
            style={{ fontSize: '0.8rem', padding: '7px 12px' }}
            onClick={handleCheckOriginality}
            disabled={checkingOriginality || loading}
          >
            {checkingOriginality ? <Loader size={13} className="animate-spin" /> : <ShieldCheck size={13} />}
            Originality
          </button>
        </div>
      </div>

      {/* ─── Editor Content ─── */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {editorMode === 'quick' ? (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 260px', height: '100%', overflow: 'hidden' }}>
            {/* Main text editor */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '40px', background: 'rgba(11, 19, 38, 1)' }}>
              <div className="manuscript-paper" style={{ maxWidth: '720px', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '0' }}>
                <div className="manuscript-chapter-header">
                  Chapter {activeChapter?.order || ''} · {bookContext?.title || 'Untitled Book'}
                </div>
                <input
                  type="text"
                  className="manuscript-title-input"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Chapter Title…"
                />
                 <textarea
                  style={{
                    background: 'transparent',
                    border: 'none',
                    outline: 'none',
                    width: '100%',
                    resize: 'none',
                    minHeight: '500px',
                    font: 'inherit',
                    color: 'inherit',
                    lineHeight: 'inherit'
                  }}
                  value={isStreaming ? content + '▋' : content}
                  onChange={(e) => setContent(e.target.value)}
                  placeholder="Start writing the chapter content here, or use Quick / Guided generation on the right…"
                  disabled={loading || isStreaming}
                />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: '24px', paddingTop: '16px', borderTop: '1px solid rgba(26, 18, 8, 0.1)' }}>
                  <div className="word-count-chip">
                    {(() => {
                      const words = content.split(/\s+/).filter(Boolean).length;
                      const readTime = Math.max(1, Math.round(words / 200));
                      return `${words.toLocaleString()} words · ~${readTime} min read`;
                    })()}
                  </div>
                </div>
              </div>
            </div>

            {/* Quick generation panel */}
            <div style={{
              borderLeft: '1px solid var(--border-color)',
              padding: '16px',
              display: 'flex',
              flexDirection: 'column',
              gap: '14px',
              overflowY: 'auto',
              background: 'rgba(6, 14, 32, 0.4)',
            }}>
              {scribeMsg && <ScribeMessage message={scribeMsg} type={scribeMsgType} />}
              <h4>Quick Generator</h4>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Tone</label>
                <select className="form-input" style={{ padding: '8px 10px', fontSize: '0.82rem' }} value={tone} onChange={(e) => setTone(e.target.value)}>
                  <option value="Informative">Informative</option>
                  <option value="Narrative">Narrative</option>
                  <option value="Scholarly">Scholarly</option>
                  <option value="Conversational">Conversational</option>
                  <option value="Technical">Technical</option>
                </select>
              </div>

              <div className="form-group">
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Audience</label>
                <input
                  type="text"
                  className="form-input"
                  style={{ padding: '8px 10px', fontSize: '0.82rem' }}
                  value={audience}
                  onChange={(e) => setAudience(e.target.value)}
                  placeholder="e.g. General Public"
                />
              </div>

              <div className="form-group" style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>
                <label className="form-label" style={{ fontSize: '0.72rem' }}>Generation Directives</label>
                <textarea
                  className="form-input"
                  style={{ flex: 1, resize: 'none', fontSize: '0.82rem', minHeight: '100px' }}
                  value={promptInput}
                  onChange={(e) => setPromptInput(e.target.value)}
                  placeholder="Instruct the AI: e.g. Write about the discovery of ancient crystals…"
                />
              </div>

              <button
                className="btn btn-primary"
                onClick={handleQuickGenerate}
                disabled={loading || !promptInput.trim()}
                style={{ width: '100%', justifyContent: 'center' }}
              >
                {loading ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
                {loading ? 'Generating…' : 'Generate Draft'}
              </button>
            </div>
          </div>
        ) : (
          /* ─── Guided Mode ─── */
          <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
            {/* Header */}
            <div style={{ padding: '14px 20px', borderBottom: '1px solid var(--border-color)', flexShrink: 0 }}>
              {scribeMsg && <div style={{ marginBottom: '10px' }}><ScribeMessage message={scribeMsg} type={scribeMsgType} /></div>}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '4px' }}>
                <h4 style={{ margin: 0 }}>Guided Q&A Session</h4>
                <div style={{ display: 'flex', gap: '6px' }}>
                  {[1, 2, 3].map(i => (
                    <div 
                      key={i}
                      title={`Step ${i}`}
                      style={{ 
                        width: 10, 
                        height: 10, 
                        borderRadius: '50%',
                        background: guidedStep >= i ? 'var(--primary-color, #3b82f6)' : 'rgba(255, 255, 255, 0.1)',
                        transition: 'background 0.3s'
                      }} 
                    />
                  ))}
                </div>
              </div>
              <p style={{ margin: '3px 0 0', fontSize: '0.78rem' }}>
                Answer the AI's questions. Your responses shape the chapter content.
              </p>
            </div>

            {/* Q&A history */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '16px 20px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {loading && !currentQuestion && (
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', color: 'var(--on-surface-variant)', fontSize: '0.85rem' }}>
                  <Loader size={14} className="animate-spin" />
                  Starting guided session…
                </div>
              )}

              {qaHistory.map((qa, idx) => (
                <div key={idx} style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                  <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '10px 10px 10px 2px', alignSelf: 'flex-start', maxWidth: '80%', fontSize: '0.85rem' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#60a5fa', display: 'block', marginBottom: '3px' }}>AI QUESTION</span>
                    {qa.question}
                  </div>
                  <div style={{ background: 'rgba(59, 130, 246, 0.12)', padding: '10px 14px', borderRadius: '10px 10px 2px 10px', alignSelf: 'flex-end', maxWidth: '80%', color: '#eff6ff', fontSize: '0.85rem', border: '1px solid rgba(59, 130, 246, 0.2)' }}>
                    <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#93c5fd', display: 'block', marginBottom: '3px' }}>YOUR ANSWER</span>
                    {qa.answer}
                  </div>
                </div>
              ))}

              {currentQuestion && (
                <div style={{ background: 'rgba(255,255,255,0.04)', padding: '10px 14px', borderRadius: '10px 10px 10px 2px', alignSelf: 'flex-start', maxWidth: '80%', fontSize: '0.85rem', border: '1px solid rgba(59, 130, 246, 0.15)' }}>
                  <span style={{ fontSize: '0.68rem', fontWeight: '700', color: '#60a5fa', display: 'block', marginBottom: '3px' }}>CURRENT QUESTION</span>
                  {currentQuestion}
                </div>
              )}

              {guidedDone && (
                <div style={{
                  padding: '24px',
                  textAlign: 'center',
                  background: 'rgba(16, 185, 129, 0.05)',
                  border: '1px solid rgba(16, 185, 129, 0.15)',
                  borderRadius: 'var(--radius-lg)',
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: '12px',
                  maxWidth: '400px',
                  margin: '16px auto',
                }}>
                  <CheckCircle size={32} color="#10b981" />
                  <h4>Interview Complete!</h4>
                  <p style={{ fontSize: '0.82rem' }}>The AI is ready to combine all your answers and write the chapter.</p>
                  <div style={{ display: 'flex', gap: '10px' }}>
                    <button className="btn btn-secondary" onClick={() => setEditorMode('quick')}>Cancel</button>
                    <button className="btn btn-primary" onClick={handleFinishGuided} disabled={loading}>
                      {loading ? <Loader size={13} className="animate-spin" /> : <Sparkles size={13} />}
                      {loading ? 'Writing chapter…' : 'Generate My Chapter'}
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Answer input */}
            {!guidedDone && currentQuestion && (
              <form
                onSubmit={handleAnswerSubmit}
                style={{ padding: '14px 20px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '10px', flexShrink: 0, background: 'rgba(6, 14, 32, 0.4)' }}
              >
                <input
                  type="text"
                  className="form-input"
                  style={{ flex: 1 }}
                  value={currentAnswer}
                  onChange={(e) => setCurrentAnswer(e.target.value)}
                  placeholder="Type your response…"
                  required
                  disabled={loading}
                  autoFocus
                />
                <button type="submit" className="btn btn-primary" disabled={loading || !currentAnswer.trim()}>
                  {loading ? <Loader size={13} className="animate-spin" /> : 'Submit'}
                </button>
              </form>
            )}
          </div>
        )}
      </div>

      {/* ─── Originality Report ─── */}
      {originalityReport?.flagged_items?.length > 0 && (
        <div style={{
          borderTop: '1px solid var(--border-color)',
          background: 'rgba(239, 68, 68, 0.04)',
          flexShrink: 0,
        }}>
          {/* Header */}
          <div 
            onClick={() => setOriginalityCollapsed(!originalityCollapsed)}
            style={{ 
              display: 'flex', 
              justifyContent: 'space-between', 
              alignItems: 'center', 
              padding: '12px 20px', 
              cursor: 'pointer',
              borderBottom: originalityCollapsed ? 'none' : '1px solid var(--border-color)'
            }}
          >
            <h5 style={{ color: '#fca5a5', display: 'flex', alignItems: 'center', gap: '7px', margin: 0 }}>
              <AlertTriangle size={14} />
              Flagged Low-Originality Matches ({originalityReport.flagged_items.length})
            </h5>
            <span style={{ fontSize: '0.8rem', color: '#fca5a5' }}>
              {originalityCollapsed ? 'Expand' : 'Collapse'}
            </span>
          </div>

          {!originalityCollapsed && (
            <div style={{ 
              display: 'flex', 
              flexDirection: 'column', 
              gap: '6px', 
              padding: '14px 20px', 
              maxHeight: '180px', 
              overflowY: 'auto' 
            }}>
              {originalityReport.flagged_items.map((item, idx) => (
                <div key={idx} style={{ fontSize: '0.78rem', padding: '8px 10px', borderLeft: '3px solid #ef4444', background: 'rgba(255,255,255,0.02)', borderRadius: '0 4px 4px 0' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', color: '#fca5a5', fontWeight: '600', marginBottom: '4px' }}>
                    <span>Match: {item.similarity_score}%</span>
                    <span>Source: {item.source_document}</span>
                  </div>
                  <p style={{ margin: '2px 0', fontSize: '0.75rem' }}><strong>Your text:</strong> "{item.draft_sentence}"</p>
                  <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--on-surface-variant)' }}><strong>Source text:</strong> "{item.matched_text}"</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
