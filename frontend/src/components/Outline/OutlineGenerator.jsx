import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/api';
import { Sparkles, Loader, AlertTriangle, CheckCircle, Save } from 'lucide-react';

export default function OutlineGenerator() {
  const { activeProject, outline, setOutline, backendConnected, setCurrentPhase, setChapters: setGlobalChapters, showConfirm } = useAppStore();
  const navigate = useNavigate();
  const { projectId } = useParams();
  
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [chapters, setChapters] = useState([]);

  useEffect(() => {
    async function loadOutline() {
      if (!activeProject || !backendConnected) return;
      try {
        const out = await apiClient.getOutline(activeProject.id);
        setOutline(out);
        setChapters(out.structure || []);
      } catch (e) {
        // Outline not generated yet
        setOutline(null);
        setChapters([]);
      }
    }
    loadOutline();
  }, [activeProject, setOutline]);

  const handleGenerate = async () => {
    if (!activeProject || !backendConnected) return;
    setGenerating(true);
    setError('');
    setSuccess('');
    try {
      const out = await apiClient.generateOutline(activeProject.id);
      setOutline(out);
      setChapters(out.structure || []);
      setSuccess('Outline generated successfully!');
    } catch (err) {
      setError(err.message || 'Outline generation failed');
    } finally {
      setGenerating(false);
    }
  };

  const handleSave = async () => {
    if (!activeProject || !backendConnected) return;
    setSaving(true);
    setError('');
    setSuccess('');
    try {
      const saved = await apiClient.saveOutline(activeProject.id, chapters, 'draft');
      setOutline(saved);
      setSuccess('Outline saved successfully!');
      setTimeout(() => setSuccess(''), 2000);
    } catch (err) {
      setError(err.message || 'Failed to save outline');
    } finally {
      setSaving(false);
    }
  };

  const handleAccept = async () => {
    if (!activeProject || !backendConnected) return;
    setSaving(true);
    try {
      // Save outline as accepted
      const saved = await apiClient.saveOutline(activeProject.id, chapters, 'accepted');
      setOutline(saved);
      
      // Auto-create chapters in the chapters table if they don't exist yet!
      // This is a great user convenience!
      try {
        const existingChapters = await apiClient.getChapters(activeProject.id);
        let list = existingChapters;
        if (existingChapters.length === 0) {
          list = [];
          for (let i = 0; i < chapters.length; i++) {
            const newCh = await apiClient.createChapter(activeProject.id, chapters[i].title, i + 1);
            list.push(newCh);
          }
        }
        setGlobalChapters(list);
      } catch (err) {
        console.error("Could not sync chapters table: ", err);
      }

      setSuccess('Outline accepted!');
      
      // Phase transition to manuscript
      setCurrentPhase('manuscript');
      document.documentElement.style.setProperty('--phase-color', '#e8e0d0');

      setTimeout(() => {
        if (projectId) {
          navigate(`/project/${projectId}/manuscript`);
        }
      }, 1000);
    } catch (err) {
      setError(err.message || 'Failed to accept outline');
    } finally {
      setSaving(false);
    }
  };

  const handleReject = () => {
    if (!activeProject || !backendConnected) return;
    showConfirm({
      message: 'Are you sure you want to reject and delete this outline draft? This cannot be undone.',
      danger: true,
      onConfirm: async () => {
        setSaving(true);
        setError('');
        setSuccess('');
        try {
          await apiClient.rejectOutline(activeProject.id);
          setOutline(null);
          setChapters([]);
          setSuccess('Outline draft successfully rejected and deleted.');
          setTimeout(() => setSuccess(''), 2500);
        } catch (err) {
          setError(err.message || 'Failed to reject outline');
        } finally {
          setSaving(false);
        }
      }
    });
  };

  const handleChapterFieldChange = (index, field, value) => {
    setChapters(prev => prev.map((ch, idx) => {
      if (idx === index) {
        return { ...ch, [field]: value };
      }
      return ch;
    }));
  };

  return (
    <div style={{ maxWidth: '1200px', margin: '0 auto', width: '100%', height: '100%' }}>
      <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px', height: '100%', overflowY: 'auto' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid var(--border-color)', paddingBottom: '12px' }}>
        <div>
          <h3 style={{ margin: 0 }}>Outline Architect</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>
            Generate a detailed book outline. The AI reads your Book Context and searches competitor reference documents to highlights gaps.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '12px' }}>
          {chapters.length > 0 && (
            <>
              <button 
                className="btn btn-danger" 
                onClick={handleReject} 
                disabled={saving || generating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Reject Outline
              </button>
              <button 
                className="btn btn-secondary" 
                onClick={handleSave} 
                disabled={saving || generating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                {saving ? <Loader size={14} className="animate-spin" /> : <Save size={14} />}
                Save Draft
              </button>
              <button 
                className="btn btn-primary" 
                onClick={handleAccept} 
                disabled={saving || generating}
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                Accept Outline
              </button>
            </>
          )}
          <button 
            className="btn btn-primary" 
            onClick={handleGenerate} 
            disabled={generating || saving}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)' }}
          >
            {generating ? <Loader size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {chapters.length > 0 ? 'Regenerate Outline' : 'Generate Outline'}
          </button>
        </div>
      </div>

      {error && (
        <div style={{ background: 'rgba(239, 68, 68, 0.1)', color: '#fca5a5', border: '1px solid rgba(239, 68, 68, 0.2)', padding: '12px', borderRadius: '6px', fontSize: '0.85rem' }}>
          {error}
        </div>
      )}

      {success && (
        <div style={{ background: 'rgba(16, 185, 129, 0.1)', color: '#a7f3d0', border: '1px solid rgba(16, 185, 129, 0.2)', padding: '12px', borderRadius: '6px', fontSize: '0.85rem', display: 'flex', alignItems: 'center', gap: '8px' }}>
          <CheckCircle size={16} />
          <span>{success}</span>
        </div>
      )}

      {chapters.length === 0 && !generating ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '16px', border: '2px dashed var(--border-color)', borderRadius: '12px', color: 'var(--on-surface-variant)' }}>
          <Sparkles size={48} color="var(--border-color)" />
          <div style={{ textAlign: 'center' }}>
            <h4>No Outline Generated</h4>
            <p style={{ fontSize: '0.85rem', marginTop: '4px' }}>Click the Generate Outline button to build outline from Book Context & Competitor data.</p>
          </div>
        </div>
      ) : generating ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '300px', gap: '16px' }}>
          <Loader size={36} className="animate-spin" color="#3b82f6" />
          <div style={{ textAlign: 'center' }}>
            <h4>Analyzing Reference Books & Creating Structure...</h4>
            <p style={{ fontSize: '0.85rem', color: 'var(--on-surface-variant)', marginTop: '4px' }}>This may take 10-15 seconds.</p>
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {chapters.map((ch, index) => (
            <div 
              key={index} 
              className="glass-panel" 
              style={{ 
                padding: '16px', 
                background: 'rgba(255, 255, 255, 0.02)', 
                display: 'flex', 
                flexDirection: 'column', 
                gap: '12px',
                animation: 'scribeFadeIn 0.4s ease-out both',
                animationDelay: `${index * 80}ms`
              }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                <input 
                  type="text" 
                  className="form-input" 
                  style={{ background: 'transparent', border: 'none', borderBottom: '1px solid transparent', fontSize: '1.05rem', fontWeight: '600', padding: '0 0 4px 0', width: '70%', borderRadius: 0 }}
                  value={ch.title}
                  onChange={(e) => handleChapterFieldChange(index, 'title', e.target.value)}
                />
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  {ch.gaps && ch.gaps.map((gap, gIdx) => (
                    <span key={gIdx} style={{ background: 'rgba(234, 179, 8, 0.1)', color: '#fef08a', border: '1px solid rgba(234, 179, 8, 0.2)', padding: '2px 8px', borderRadius: '999px', fontSize: '0.7rem', display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <AlertTriangle size={10} color="#eab308" />
                      {gap}
                    </span>
                  ))}
                </div>
              </div>

              <textarea 
                className="form-input" 
                style={{ background: 'transparent', border: 'none', fontSize: '0.85rem', color: 'var(--on-surface-variant)', padding: 0, height: '45px', resize: 'none' }}
                value={ch.description}
                onChange={(e) => handleChapterFieldChange(index, 'description', e.target.value)}
                placeholder="Chapter description..."
              />

              {ch.sections && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '10px' }}>
                  <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--on-surface-variant)' }}>SECTIONS</span>
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    {ch.sections.map((sec, sIdx) => (
                      <span key={sIdx} style={{ background: 'rgba(255,255,255,0.05)', padding: '4px 10px', borderRadius: '4px', fontSize: '0.8rem' }}>
                        {sec}
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
      </div>
    </div>
  );
}
