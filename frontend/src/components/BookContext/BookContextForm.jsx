import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/api';
import { AlertTriangle, Loader, CheckCircle, Sparkles, ArrowRight, Trash2 } from 'lucide-react';

export default function BookContextForm() {
  const {
    activeProject,
    bookContext,
    setBookContext,
    contextFlags,
    setContextFlags,
    backendConnected,
    currentPhase,
    setCurrentPhase
  } = useAppStore();

  const navigate = useNavigate();
  const { projectId } = useParams();

  const [formData, setFormData] = useState({
    title: '',
    subtitle: '',
    audience: '',
    objective: '',
    reader_before: '',
    reader_after: '',
    tone: 'Informative',
    genre: 'Fiction',
    factual_weight: 0.5,
    pov: 'Third-person limited',
    characters: [],
    settings: '',
    high_level_storyline: '',
    custom_rules: ''
  });

  // Track which fields are "dirty" (changed but not yet saved)
  const dirtyRef = useRef({});
  const [saveStatus, setSaveStatus] = useState(''); // '' | 'saving' | 'saved' | 'error'
  const [generatingOutline, setGeneratingOutline] = useState(false);
  const [outlineMsg, setOutlineMsg] = useState('');
  const [isTitleFocused, setIsTitleFocused] = useState(false);

  // Set phase to 'spark' when BookContext tab is rendered
  useEffect(() => {
    setCurrentPhase('spark');
    document.documentElement.style.setProperty('--phase-color', '#f59e0b');
  }, [activeProject, setCurrentPhase]);

  // ── Sync form with store (only when bookContext changes from outside) ──
  useEffect(() => {
    if (bookContext && Object.keys(bookContext).length > 0) {
      setFormData(prev => ({
        title: bookContext.title ?? prev.title,
        subtitle: bookContext.subtitle ?? prev.subtitle,
        audience: bookContext.audience ?? prev.audience,
        objective: bookContext.objective ?? prev.objective,
        reader_before: bookContext.reader_before ?? prev.reader_before,
        reader_after: bookContext.reader_after ?? prev.reader_after,
        tone: bookContext.tone ?? prev.tone,
        genre: bookContext.genre ?? prev.genre,
        factual_weight: bookContext.factual_weight ?? prev.factual_weight,
        pov: bookContext.pov ?? prev.pov,
        characters: bookContext.characters ?? prev.characters,
        settings: bookContext.settings ?? prev.settings,
        high_level_storyline: bookContext.high_level_storyline ?? prev.high_level_storyline,
        custom_rules: bookContext.custom_rules ?? prev.custom_rules
      }));
    }
  }, [bookContext]);

  // ── Load initial context from backend ──
  useEffect(() => {
    if (!activeProject || !backendConnected) return;
    (async () => {
      try {
        const ctx = await apiClient.getBookContext(activeProject.id);
        if (ctx) {
          setBookContext(ctx);
        }
      } catch {
        // Not yet set — that's fine
      }
    })();
    refreshFlags();
  }, [activeProject]);

  const refreshFlags = async () => {
    if (!activeProject || !backendConnected) return;
    try {
      const flags = await apiClient.getBookContextFlags(activeProject.id);
      setContextFlags(flags);
    } catch (e) {
      console.error(e);
    }
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    dirtyRef.current[name] = true;
    setFormData(prev => ({ ...prev, [name]: value }));
  };

  // Save ALL dirty fields at once (called on blur or explicit save)
  const saveContext = useCallback(async (overrideData = null) => {
    if (!activeProject || !backendConnected) return;
    const data = overrideData ?? formData;
    const dirty = dirtyRef.current;
    const dirtyKeys = Object.keys(dirty).filter(k => dirty[k]);
    if (dirtyKeys.length === 0) return;

    const payload = {};
    dirtyKeys.forEach(k => { payload[k] = data[k]; });

    setSaveStatus('saving');
    try {
      const updated = await apiClient.updateBookContext(activeProject.id, payload);
      setBookContext(updated);
      dirtyRef.current = {};
      setSaveStatus('saved');
      setTimeout(() => setSaveStatus(''), 2500);
      await refreshFlags();
    } catch {
      setSaveStatus('error');
      setTimeout(() => setSaveStatus(''), 3000);
    }
  }, [activeProject, backendConnected, formData]);

  const handleBlur = () => {
    saveContext();
  };

  const handleSelectChange = (e) => {
    handleChange(e);
    // Save immediately on select change (no blur event needed)
    const { name, value } = e.target;
    const data = { ...formData, [name]: value };
    dirtyRef.current[name] = true;
    setTimeout(() => saveContext(data), 100);
  };

  const handleAddCharacter = () => {
    const newChar = { name: '', description: '', role: 'Supporting' };
    const updatedChars = [...(formData.characters || []), newChar];
    setFormData(prev => ({ ...prev, characters: updatedChars }));
    dirtyRef.current['characters'] = true;
    saveContext({ ...formData, characters: updatedChars });
  };

  const handleCharacterChange = (idx, field, val) => {
    const updatedChars = (formData.characters || []).map((c, i) => 
      i === idx ? { ...c, [field]: val } : c
    );
    setFormData(prev => ({ ...prev, characters: updatedChars }));
    dirtyRef.current['characters'] = true;
  };

  const handleCharacterBlur = () => {
    saveContext();
  };

  const handleDeleteCharacter = (idx) => {
    const updatedChars = (formData.characters || []).filter((_, i) => i !== idx);
    setFormData(prev => ({ ...prev, characters: updatedChars }));
    dirtyRef.current['characters'] = true;
    saveContext({ ...formData, characters: updatedChars });
  };

  // Generate Outline inline from Book Context tab
  const handleGenerateOutline = async () => {
    if (!activeProject || !backendConnected) return;
    // Save any unsaved changes first
    await saveContext();
    setGeneratingOutline(true);
    setOutlineMsg('Generating...');
    try {
      await apiClient.generateOutline(activeProject.id);
      setOutlineMsg('Outline generated!');
      setCurrentPhase('blueprint');
      document.documentElement.style.setProperty('--phase-color', '#6366f1');
      setTimeout(() => {
        setOutlineMsg('');
        if (projectId) {
          navigate(`/project/${projectId}/blueprint`);
        }
      }, 800);
    } catch (err) {
      setOutlineMsg('Generation failed: ' + (err.message || 'unknown error'));
      setTimeout(() => setOutlineMsg(''), 4000);
    } finally {
      setGeneratingOutline(false);
    }
  };

  const renderFieldLabel = (name, label) => {
    const flag = contextFlags && contextFlags[name];
    return (
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
        <span className="form-label">{label}</span>
        {flag && flag.flag && (
          <div className="tooltip-container" style={{ display: 'inline-flex', cursor: 'help' }}>
            <AlertTriangle size={13} color="#eab308" />
            <span className="tooltip-text" style={{
              fontSize: '0.75rem',
              background: '#2a2118',
              color: '#fef08a',
              padding: '6px 10px',
              borderRadius: '6px',
              border: '1px solid rgba(234, 179, 8, 0.3)',
              boxShadow: '0 4px 12px rgba(0,0,0,0.4)',
            }}>
              {flag.warning}
            </span>
          </div>
        )}
      </div>
    );
  };

  const totalFlags = contextFlags ? Object.values(contextFlags).filter(f => f?.flag).length : 0;
  const filledCount = Object.values(formData).filter(v => typeof v === 'string' && v.trim().length > 10).length;

  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      height: '100%',
      overflowY: 'auto',
      maxWidth: '1200px',
      margin: '0 auto',
      width: '100%'
    }}>
      {/* Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'flex-start',
        padding: '20px 24px 16px',
        borderBottom: '1px solid var(--border-color)',
        background: 'rgba(6, 14, 32, 0.5)',
        flexShrink: 0,
        flexWrap: 'wrap',
        gap: '12px',
      }}>
        <div>
          <h3 style={{ margin: 0 }}>Book Context Builder</h3>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', flexWrap: 'wrap' }}>
            <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--on-surface-variant)' }}>
              Define the target persona, scope, and objectives. Fields auto-save on change.
            </p>
            <span style={{ 
              fontSize: '0.75rem', 
              color: filledCount < 7 ? 'var(--phase-spark)' : '#10b981',
              fontWeight: 500
            }}>
              · Your idea is taking shape... ({filledCount} of 7 fields complete)
            </span>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          {/* Save status chip */}
          {saveStatus && (
            <div className={`status-chip ${saveStatus}`}>
              {saveStatus === 'saving' && <Loader size={11} className="animate-spin" />}
              {saveStatus === 'saved' && <CheckCircle size={11} />}
              {saveStatus === 'error' && <AlertTriangle size={11} />}
              {saveStatus === 'saving' ? 'Saving…' : saveStatus === 'saved' ? 'Saved' : 'Save failed'}
            </div>
          )}

          {totalFlags > 0 && (
            <div style={{
              display: 'inline-flex',
              alignItems: 'center',
              gap: '5px',
              padding: '3px 9px',
              background: 'rgba(234, 179, 8, 0.1)',
              color: '#fbbf24',
              border: '1px solid rgba(234, 179, 8, 0.25)',
              borderRadius: 'var(--radius-full)',
              fontSize: '0.72rem',
              fontWeight: '700',
            }}>
              <AlertTriangle size={11} />
              {totalFlags} field{totalFlags > 1 ? 's' : ''} need attention
            </div>
          )}

          {/* Generate Outline button — right here on the Book Context tab */}
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.82rem', gap: '6px' }}
            onClick={handleGenerateOutline}
            disabled={generatingOutline || !backendConnected}
            title="Save context and generate AI outline"
          >
            {generatingOutline
              ? <Loader size={13} className="animate-spin" />
              : <Sparkles size={13} />
            }
            {generatingOutline ? 'Generating…' : 'Generate Outline'}
            {!generatingOutline && <ArrowRight size={13} />}
          </button>
        </div>
      </div>

      {/* Outline generation status message */}
      {outlineMsg && (
        <div style={{
          padding: '10px 24px',
          background: outlineMsg.includes('failed') ? 'rgba(239, 68, 68, 0.08)' : 'rgba(16, 185, 129, 0.08)',
          color: outlineMsg.includes('failed') ? '#fca5a5' : '#a7f3d0',
          borderBottom: '1px solid var(--border-color)',
          fontSize: '0.82rem',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
        }}>
          {!outlineMsg.includes('failed') && <CheckCircle size={13} />}
          {outlineMsg}
        </div>
      )}

      {/* Form Fields */}
      <div style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '18px' }}>

        {/* Hero Book Title Field */}
        <div className="form-group" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', marginBottom: '24px', width: '100%' }}>
          {renderFieldLabel('title', 'Book Title')}
          <input
            type="text"
            name="title"
            value={formData.title}
            onChange={handleChange}
            onFocus={() => setIsTitleFocused(true)}
            onBlur={(e) => {
              setIsTitleFocused(false);
              handleBlur(e);
            }}
            placeholder="e.g. Chronicles of Eldoria"
            style={{ 
              fontSize: '1.3rem', 
              textAlign: 'center', 
              background: 'transparent', 
              border: 'none', 
              borderBottom: '2px solid transparent', 
              borderBottomColor: isTitleFocused ? 'var(--phase-spark)' : 'rgba(255,255,255,0.08)',
              boxShadow: isTitleFocused ? '0 4px 12px color-mix(in srgb, var(--phase-spark) 15%, transparent)' : 'none',
              transition: 'all 0.2s',
              outline: 'none',
              width: '80%',
              maxWidth: '500px',
              padding: '8px 0',
              color: 'var(--on-surface)'
            }}
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            {renderFieldLabel('tone', 'Writing Tone / Style')}
            <select
              name="tone"
              className="form-input"
              value={formData.tone}
              onChange={handleSelectChange}
            >
              <option value="Informative">Informative</option>
              <option value="Narrative">Narrative</option>
              <option value="Scholarly">Scholarly</option>
              <option value="Conversational">Conversational</option>
              <option value="Humorous">Humorous</option>
              <option value="Technical">Technical</option>
            </select>
          </div>
        </div>

        <div className="form-group">
          {renderFieldLabel('subtitle', 'Book Subtitle')}
          <input
            type="text"
            name="subtitle"
            className="form-input"
            value={formData.subtitle}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="e.g. An Awakening of Ancient Magic"
          />
        </div>

        <div className="form-group">
          {renderFieldLabel('audience', 'Target Audience')}
          <input
            type="text"
            name="audience"
            className="form-input"
            value={formData.audience}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="e.g. Young Adult fantasy lovers, 14-25 year olds"
          />
        </div>

        <div className="form-group">
          {renderFieldLabel('objective', 'Core Book Objective')}
          <textarea
            name="objective"
            className="form-input"
            style={{ height: '80px', resize: 'vertical' }}
            value={formData.objective}
            onChange={handleChange}
            onBlur={handleBlur}
            placeholder="What is the key takeaway or goal of this book?"
          />
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
          <div className="form-group">
            {renderFieldLabel('reader_before', 'Reader Mindset Before')}
            <textarea
              name="reader_before"
              className="form-input"
              style={{ height: '90px', resize: 'vertical' }}
              value={formData.reader_before}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="What does the reader believe or feel before reading?"
            />
          </div>

          <div className="form-group">
            {renderFieldLabel('reader_after', 'Reader Mindset After')}
            <textarea
              name="reader_after"
              className="form-input"
              style={{ height: '90px', resize: 'vertical' }}
              value={formData.reader_after}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="What new belief, knowledge, or feeling will they gain?"
            />
          </div>
        </div>

        {/* ─── Creative Foundation / Book Blueprint Section ─── */}
        <div style={{
          marginTop: '20px',
          padding: '20px',
          background: 'rgba(255, 255, 255, 0.02)',
          border: '1px solid var(--border-color)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          flexDirection: 'column',
          gap: '16px'
        }}>
          <h4 style={{ margin: '0 0 4px 0', fontSize: '1rem', color: '#f59e0b', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Sparkles size={16} /> Creative Blueprint & Controls
          </h4>
          <p style={{ margin: 0, fontSize: '0.78rem', color: 'var(--on-surface-variant)', marginBottom: '8px' }}>
            Tune the factual vs creative spectrum and guide how the AI structures narrative elements.
          </p>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              {renderFieldLabel('genre', 'Book Genre')}
              <select
                name="genre"
                className="form-input"
                value={formData.genre || 'Fiction'}
                onChange={handleSelectChange}
              >
                <option value="Fiction">Fiction</option>
                <option value="Non-fiction">Non-fiction</option>
                <option value="Science Fiction">Science Fiction</option>
                <option value="Fantasy">Fantasy</option>
                <option value="Biography">Biography</option>
                <option value="Self-help">Self-help</option>
                <option value="Technical">Technical</option>
              </select>
            </div>

            <div className="form-group">
              {renderFieldLabel('pov', 'Point of View (POV)')}
              <input
                type="text"
                name="pov"
                className="form-input"
                value={formData.pov || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. Third-person limited (Elena) or First-person 'I'"
              />
            </div>
          </div>

          <div className="form-group">
            {renderFieldLabel('factual_weight', `Factual Spectrum: ${formData.factual_weight ?? 0.5}`)}
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)' }}>Creative/Fiction</span>
              <input
                type="range"
                name="factual_weight"
                min="0.0"
                max="1.0"
                step="0.1"
                style={{ flex: 1, accentColor: '#f59e0b' }}
                value={formData.factual_weight ?? 0.5}
                onChange={(e) => {
                  const val = parseFloat(e.target.value);
                  setFormData(prev => ({ ...prev, factual_weight: val }));
                  dirtyRef.current['factual_weight'] = true;
                  setTimeout(() => saveContext({ ...formData, factual_weight: val }), 100);
                }}
              />
              <span style={{ fontSize: '0.72rem', color: 'var(--on-surface-variant)' }}>Highly Factual</span>
            </div>
            <p style={{ margin: '4px 0 0 0', fontSize: '0.68rem', color: 'var(--on-surface-variant)' }}>
              Controls the AI's creativity level: low weight allows high narrative embellishment, high weight enforces strict factual context lookup.
            </p>
          </div>

          <div className="form-group">
            {renderFieldLabel('high_level_storyline', 'High-Level Plot Storyline / Narrative Arc')}
            <textarea
              name="high_level_storyline"
              className="form-input"
              style={{ height: '80px', resize: 'vertical' }}
              value={formData.high_level_storyline || ''}
              onChange={handleChange}
              onBlur={handleBlur}
              placeholder="Outline the core story arc or flow of arguments..."
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
            <div className="form-group">
              {renderFieldLabel('settings', 'Settings / World-Building Context')}
              <textarea
                name="settings"
                className="form-input"
                style={{ height: '80px', resize: 'vertical' }}
                value={formData.settings || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="Describe the setting, environment, time, or spatial context..."
              />
            </div>

            <div className="form-group">
              {renderFieldLabel('custom_rules', 'Custom Writing Constraints / Rules')}
              <textarea
                name="custom_rules"
                className="form-input"
                style={{ height: '80px', resize: 'vertical' }}
                value={formData.custom_rules || ''}
                onChange={handleChange}
                onBlur={handleBlur}
                placeholder="e.g. 'Never write End of Chapter' or 'Tone must resemble Hemingway'..."
              />
            </div>
          </div>

          {/* Interactive Character List Editor */}
          <div className="form-group">
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
              <span className="form-label" style={{ fontWeight: 600 }}>Key Characters / Core Figures</span>
              <button
                type="button"
                className="btn btn-secondary"
                style={{ padding: '2px 8px', fontSize: '0.72rem' }}
                onClick={handleAddCharacter}
              >
                + Add Character
              </button>
            </div>
            
            <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
              {(!formData.characters || formData.characters.length === 0) ? (
                <p style={{ margin: 0, fontSize: '0.75rem', color: 'var(--on-surface-variant)', fontStyle: 'italic' }}>
                  No characters defined yet. Add key figures to ensure continuity.
                </p>
              ) : (
                formData.characters.map((char, idx) => (
                  <div key={idx} style={{
                    display: 'flex',
                    flexWrap: 'wrap',
                    gap: '8px',
                    alignItems: 'center',
                    padding: '8px',
                    background: 'rgba(255,255,255,0.01)',
                    border: '1px solid var(--border-color)',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: '1 1 120px', padding: '4px 8px', fontSize: '0.78rem' }}
                      value={char.name || ''}
                      onChange={(e) => handleCharacterChange(idx, 'name', e.target.value)}
                      onBlur={handleCharacterBlur}
                      placeholder="Name"
                    />
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: '1 1 100px', padding: '4px 8px', fontSize: '0.78rem' }}
                      value={char.role || ''}
                      onChange={(e) => handleCharacterChange(idx, 'role', e.target.value)}
                      onBlur={handleCharacterBlur}
                      placeholder="Role (e.g. Protagonist)"
                    />
                    <input
                      type="text"
                      className="form-input"
                      style={{ flex: '2 1 150px', padding: '4px 8px', fontSize: '0.78rem' }}
                      value={char.description || ''}
                      onChange={(e) => handleCharacterChange(idx, 'description', e.target.value)}
                      onBlur={handleCharacterBlur}
                      placeholder="Brief Description"
                    />
                    <button
                      type="button"
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#ef4444', display: 'flex', justifyContent: 'center' }}
                      onClick={() => handleDeleteCharacter(idx)}
                      title="Remove character"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

        {/* CTA at bottom */}
        <div style={{
          marginTop: '8px',
          padding: '16px',
          background: 'rgba(59, 130, 246, 0.05)',
          border: '1px solid rgba(59, 130, 246, 0.12)',
          borderRadius: 'var(--radius-md)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '16px',
          flexWrap: 'wrap',
        }}>
          <div>
            <p style={{ margin: 0, fontSize: '0.82rem', color: 'var(--on-surface)' }}>
              Ready to structure your book?
            </p>
            <p style={{ margin: '2px 0 0', fontSize: '0.75rem' }}>
              Click <strong>Generate Outline</strong> to let the AI architect your book from this context.
            </p>
          </div>
          <button
            className="btn btn-primary"
            style={{ fontSize: '0.85rem' }}
            onClick={handleGenerateOutline}
            disabled={generatingOutline || !backendConnected}
          >
            {generatingOutline
              ? <><Loader size={14} className="animate-spin" /> Generating…</>
              : <><Sparkles size={14} /> Generate Outline</>
            }
          </button>
        </div>
      </div>
    </div>
  );
}
