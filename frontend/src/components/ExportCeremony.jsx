import React, { useState, useEffect } from 'react';
import { apiClient } from '../services/api';
import { Loader, X, Download, Award, FileText } from 'lucide-react';
import ScribeMessage from './ScribeMessage';

export default function ExportCeremony({ projectId, bookTitle, authorName, onClose, onExport }) {
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await apiClient.getProjectStats(projectId);
        setStats(res);
      } catch (err) {
        console.error("Failed to load project stats:", err);
      } finally {
        setLoading(false);
      }
    };
    fetchStats();
  }, [projectId]);

  return (
    <div className="export-ceremony-overlay">
      {/* Close button */}
      <button 
        onClick={onClose}
        style={{
          position: 'absolute',
          top: '24px',
          right: '24px',
          background: 'rgba(255, 255, 255, 0.05)',
          border: '1px solid rgba(255, 255, 255, 0.1)',
          borderRadius: '50%',
          width: '40px',
          height: '40px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          cursor: 'pointer',
          color: '#fff',
          transition: 'all 0.2s',
        }}
        onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.15)'}
        onMouseLeave={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.05)'}
      >
        <X size={20} />
      </button>

      {loading ? (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '12px', color: 'var(--on-surface-variant)' }}>
          <Loader size={36} className="animate-spin" />
          <span style={{ fontSize: '0.9rem' }}>Compiling manuscript statistics...</span>
        </div>
      ) : (
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          maxWidth: '560px',
          width: '90%',
          textAlign: 'center',
          gap: '24px',
        }}>
          {/* Animated Book Cover Mockup */}
          <div className="book-cover-mockup">
            <div className="book-cover-divider" />
            <h1 className="book-cover-title">{bookTitle || "Untitled Book"}</h1>
            <div className="book-cover-divider" style={{ width: '20px' }} />
            <p className="book-cover-author">by {authorName || "Author"}</p>
          </div>

          {/* Stats Section */}
          {stats && (
            <div style={{
              display: 'flex',
              gap: '20px',
              justifyContent: 'center',
              background: 'rgba(255, 255, 255, 0.02)',
              border: '1px solid var(--border-color)',
              padding: '12px 24px',
              borderRadius: 'var(--radius-md)',
              fontSize: '0.85rem',
            }}>
              <div>
                <strong style={{ color: 'var(--phase-spark)' }}>{stats.chapter_count}</strong> chapters
              </div>
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '20px' }}>
                <strong style={{ color: 'var(--phase-blueprint)' }}>{stats.total_words.toLocaleString()}</strong> words
              </div>
              <div style={{ borderLeft: '1px solid var(--border-color)', paddingLeft: '20px' }}>
                <strong style={{ color: 'var(--phase-refine)' }}>{stats.avg_originality}%</strong> originality
              </div>
            </div>
          )}

          {/* Scribe's chronicle summary message */}
          <div style={{ width: '100%', textAlign: 'left' }}>
            <ScribeMessage 
              type="done" 
              message="It has been an honor to help you write this. From first outline to final chapter, your journey is complete. This book is yours." 
            />
          </div>

          {/* Export Action Buttons */}
          <div style={{ display: 'flex', gap: '12px', width: '100%' }}>
            <button 
              className="btn btn-primary" 
              style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
              onClick={() => onExport('docx')}
            >
              <Download size={16} />
              Download Word (.docx)
            </button>
            <button 
              className="btn btn-secondary" 
              style={{ flex: 1, justifyContent: 'center', padding: '12px', fontSize: '0.9rem' }}
              onClick={() => onExport('pdf')}
            >
              <FileText size={16} />
              Download PDF (.pdf)
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
