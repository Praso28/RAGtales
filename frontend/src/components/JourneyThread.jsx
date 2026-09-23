import React, { useEffect, useState } from 'react';
import { Check } from 'lucide-react';
import { useLocation, useNavigate, useParams } from 'react-router-dom';
import { useAppStore } from '../store/useAppStore';

const PHASES = [
  { id: 'spark', label: 'Spark', color: '#f59e0b' },
  { id: 'blueprint', label: 'Blueprint', color: '#6366f1' },
  { id: 'manuscript', label: 'Manuscript', color: '#e8e0d0' },
  { id: 'refine', label: 'Refine', color: '#10b981' }
];

export default function JourneyThread() {
  const { currentPhase, setCurrentPhase, bookContext, outline, chapters, addToast } = useAppStore();
  const location = useLocation();
  const navigate = useNavigate();
  const { projectId } = useParams();

  // Sync phase color CSS variable whenever currentPhase changes
  useEffect(() => {
    const activePhaseObj = PHASES.find(p => p.id === currentPhase);
    if (activePhaseObj) {
      document.documentElement.style.setProperty('--phase-color', activePhaseObj.color);
    }
  }, [currentPhase]);

  // Keep phase in sync with URL
  useEffect(() => {
    const path = location.pathname;
    const matchedPhase = PHASES.find(p => path.includes(`/${p.id}`));
    if (matchedPhase && matchedPhase.id !== currentPhase) {
      setCurrentPhase(matchedPhase.id);
    }
  }, [location.pathname, currentPhase, setCurrentPhase]);

  const getPhaseIndex = (phaseId) => PHASES.findIndex(p => p.id === phaseId);

  const isSparkComplete = () => {
    if (!bookContext) return false;
    const required = ['title', 'subtitle', 'audience', 'objective', 'reader_before', 'reader_after', 'tone'];
    return required.every(field => bookContext[field] && String(bookContext[field]).trim().length > 0);
  };

  const isBlueprintComplete = () => {
    return outline?.status === 'accepted';
  };

  const isManuscriptComplete = () => {
    if (!chapters || chapters.length === 0) return false;
    // Check if at least one chapter has more than 100 words
    return chapters.some(ch => ch.content && ch.content.split(/\s+/).filter(Boolean).length >= 100);
  };

  const isRefineComplete = () => {
    if (!chapters || chapters.length === 0) return false;
    return chapters.every(ch => ch.originality_score !== null && ch.originality_score !== undefined);
  };

  const getPhaseStatus = (phaseId) => {
    if (phaseId === 'spark') return isSparkComplete();
    if (phaseId === 'blueprint') return isBlueprintComplete();
    if (phaseId === 'manuscript') return isManuscriptComplete();
    if (phaseId === 'refine') return isRefineComplete();
    return false;
  };

  const canNavigateTo = (phaseId) => {
    const idx = getPhaseIndex(phaseId);
    if (idx === 0) return true;
    if (idx === 1) return isSparkComplete();
    if (idx === 2) return isSparkComplete() && isBlueprintComplete();
    if (idx === 3) return isSparkComplete() && isBlueprintComplete() && isManuscriptComplete();
    return false;
  };

  const handleNodeClick = (phase) => {
    if (!canNavigateTo(phase.id)) {
      addToast(`Please complete the previous phase first.`, 'info');
      return;
    }
    if (projectId) {
      navigate(`/project/${projectId}/${phase.id}`);
    }
  };

  return (
    <div className="journey-thread">
      {PHASES.map((phase, idx) => {
        const isCurrent = phase.id === currentPhase;
        const isDone = getPhaseStatus(phase.id);
        const locked = !canNavigateTo(phase.id);
        
        let nodeClass = '';
        if (isCurrent) nodeClass = 'active';
        else if (isDone) nodeClass = 'done';
        
        if (locked) nodeClass += ' locked';

        return (
          <React.Fragment key={phase.id}>
            <div 
              className={`journey-node ${nodeClass}`}
              onClick={() => handleNodeClick(phase)}
              title={locked ? `${phase.label} (Locked)` : `Go to ${phase.label}`}
            >
              <div className="journey-node-dot">
                {isDone ? <Check size={14} /> : (idx + 1)}
              </div>
              <span className="journey-node-label">
                {phase.label} {locked && '🔒'}
              </span>
            </div>
            
            {idx < PHASES.length - 1 && (
              <div 
                className={`journey-connector ${
                  getPhaseStatus(PHASES[idx].id) ? 'done' : ''
                }`} 
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
}
