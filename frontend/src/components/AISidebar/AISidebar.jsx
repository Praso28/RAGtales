import { useState, useEffect } from 'react';
import { useAppStore } from '../../store/useAppStore';
import { apiClient } from '../../services/api';
import { MessageSquare, Plus, Send, Loader, BookOpen } from 'lucide-react';

export default function AISidebar() {
  const { activeProject, chatSessions, activeChatSession, chatMessages, sendingChatMessage, setChatSessions, setActiveChatSession, setChatMessages, setSendingChatMessage, backendConnected, addToast, showInput } = useAppStore();
  const [chatInput, setChatInput] = useState('');

  useEffect(() => {
    async function loadSessions() {
      if (!activeProject || !backendConnected) {
        setChatSessions([]);
        setActiveChatSession(null);
        setChatMessages([]);
        return;
      }
      try {
        const sessions = await apiClient.getChatSessions(activeProject.id);
        setChatSessions(sessions);
        if (sessions.length > 0) {
          setActiveChatSession(sessions[0]);
        } else {
          setActiveChatSession(null);
          setChatMessages([]);
        }
      } catch (error) {
        console.error("Failed to load chat sessions:", error);
      }
    }
    loadSessions();
  }, [activeProject, backendConnected, setChatSessions, setActiveChatSession, setChatMessages]);

  useEffect(() => {
    async function loadMessages() {
      if (!activeProject || !activeChatSession || !backendConnected) {
        setChatMessages([]);
        return;
      }
      if (String(activeChatSession.id).startsWith('mock-')) {
        return;
      }
      try {
        const messages = await apiClient.getChatMessages(activeProject.id, activeChatSession.id);
        setChatMessages(messages);
      } catch (error) {
        console.error("Failed to load chat messages:", error);
      }
    }
    loadMessages();
  }, [activeProject, activeChatSession, backendConnected, setChatMessages]);

  const handleCreateSession = async () => {
    if (!activeProject) return;
    showInput({
      title: "New Chat Thread",
      message: "Enter a name for the new chat thread:",
      defaultValue: `Thread ${chatSessions.length + 1}`,
      placeholder: "e.g. Character Development",
      onConfirm: async (title) => {
        if (backendConnected) {
          try {
            const newSession = await apiClient.createChatSession(activeProject.id, title);
            setChatSessions([newSession, ...chatSessions]);
            setActiveChatSession(newSession);
          } catch (error) {
            addToast("Failed to create chat thread", "error");
          }
        } else {
          const mockSession = {
            id: `mock-session-${Date.now()}`,
            title,
            created_at: new Date().toISOString()
          };
          setChatSessions([mockSession, ...chatSessions]);
          setActiveChatSession(mockSession);
        }
      }
    });
  };

  const handleSendMessage = async (e) => {
    e.preventDefault();
    if (!activeProject || !activeChatSession || !chatInput.trim()) return;

    const text = chatInput;
    setChatInput('');
    setSendingChatMessage(true);

    const userMsg = {
      id: `temp-${Date.now()}`,
      sender: 'user',
      text,
      created_at: new Date().toISOString()
    };
    setChatMessages([...chatMessages, userMsg]);

    if (backendConnected) {
      try {
        const reply = await apiClient.sendChatMessage(activeProject.id, activeChatSession.id, text);
        setChatMessages(prev => prev.map(m => m.id === userMsg.id ? { ...userMsg, id: `user-msg-${Date.now()}` } : m).concat(reply));
      } catch (error) {
        addToast("Failed to send message", "error");
      } finally {
        setSendingChatMessage(false);
      }
    } else {
      setTimeout(() => {
        const reply = {
          id: `mock-${Date.now()}`,
          sender: 'assistant',
          text: `[Demo response to: "${text}"]. Connect the backend to trigger local similarity lookups across your uploaded documents.`,
          citations: [{ index: 1, text_snippet: `Mock citation matching: "${text.slice(0, 10)}"`, source: 'Reference Material' }],
          created_at: new Date().toISOString()
        };
        setChatMessages(prev => prev.concat(reply));
        setSendingChatMessage(false);
      }, 1000);
    }
  };

  if (!activeProject) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', background: 'rgba(255,255,255,0.01)', borderLeft: '1px solid var(--border-color)' }}>
      {/* Thread list dropdown */}
      <div style={{ padding: '16px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: '8px', alignItems: 'center', justifyContent: 'space-between' }}>
        <select 
          className="form-input" 
          style={{ flex: 1, fontSize: '0.8rem', padding: '6px' }}
          value={activeChatSession?.id || ''}
          onChange={(e) => {
            const found = chatSessions.find(s => s.id === e.target.value);
            if (found) setActiveChatSession(found);
          }}
        >
          {chatSessions.length === 0 && <option value="">No chat threads</option>}
          {chatSessions.map((s) => (
            <option key={s.id} value={s.id}>{s.title}</option>
          ))}
        </select>
        <button className="btn btn-secondary" style={{ padding: '6px' }} onClick={handleCreateSession} title="New Chat Thread">
          <Plus size={16} />
        </button>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '16px', display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {chatMessages.length === 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'var(--on-surface-variant)', gap: '8px', textAlign: 'center' }}>
            <MessageSquare size={32} color="var(--border-color)" />
            <span style={{ fontSize: '0.8rem' }}>Start a discussion about your book lore, plot, or character files.</span>
          </div>
        )}
        
        {chatMessages.map((msg) => (
          <div 
            key={msg.id} 
            style={{
              alignSelf: msg.sender === 'user' ? 'flex-end' : 'flex-start',
              background: msg.sender === 'user' ? 'rgba(59, 130, 246, 0.1)' : 'rgba(255, 255, 255, 0.03)',
              color: msg.sender === 'user' ? '#eff6ff' : 'var(--on-surface)',
              border: msg.sender === 'user' ? '1px solid rgba(59, 130, 246, 0.2)' : '1px solid var(--border-color)',
              padding: '10px 14px',
              borderRadius: msg.sender === 'user' ? '12px 12px 0 12px' : '12px 12px 12px 0',
              maxWidth: '85%',
              fontSize: '0.85rem',
              lineHeight: '1.4'
            }}
          >
            {msg.text}

            {/* Citations */}
            {msg.citations && msg.citations.length > 0 && (
              <div style={{ borderTop: '1px solid rgba(255,255,255,0.05)', marginTop: '8px', paddingTop: '6px', display: 'flex', flexDirection: 'column', gap: '4px' }}>
                <span style={{ fontSize: '0.65rem', fontWeight: 'bold', color: '#60a5fa', display: 'flex', alignItems: 'center', gap: '4px' }}>
                  <BookOpen size={10} />
                  CITATIONS
                </span>
                {msg.citations.map((cit, cIdx) => (
                  <span key={cIdx} style={{ fontSize: '0.7rem', color: 'var(--on-surface-variant)' }}>
                    [{cit.index}] {cit.source} - "{cit.text_snippet}"
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}

        {sendingChatMessage && (
          <div style={{ alignSelf: 'flex-start', background: 'rgba(255, 255, 255, 0.03)', padding: '10px 14px', borderRadius: '12px 12px 12px 0', display: 'flex', alignItems: 'center', gap: '8px' }}>
            <Loader size={12} className="animate-spin" />
            <span style={{ fontSize: '0.8rem', color: 'var(--on-surface-variant)' }}>Thinking...</span>
          </div>
        )}
      </div>

      {/* Input */}
      <form onSubmit={handleSendMessage} style={{ padding: '16px', borderTop: '1px solid var(--border-color)', display: 'flex', gap: '8px' }}>
        <input 
          type="text" 
          className="form-input" 
          style={{ fontSize: '0.8rem', padding: '8px' }}
          value={chatInput} 
          onChange={(e) => setChatInput(e.target.value)}
          placeholder="Ask about your lore bible..."
          disabled={sendingChatMessage || !activeChatSession}
        />
        <button type="submit" className="btn btn-primary" style={{ padding: '8px' }} disabled={sendingChatMessage || !chatInput.trim() || !activeChatSession}>
          <Send size={14} />
        </button>
      </form>
    </div>
  );
}
