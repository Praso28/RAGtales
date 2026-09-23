import { useAppStore } from '../store/useAppStore';

const API_BASE_URL = 'http://127.0.0.1:8080';

const getHeaders = (isJson = true) => {
  const headers = {};
  if (isJson) {
    headers['Content-Type'] = 'application/json';
  }
  const token = localStorage.getItem('pensive_token');
  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }
  return headers;
};

export const apiClient = {
  // Auth APIs
  async login(username, password) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Login failed');
    }
    return await response.json();
  },

  async register(username, password) {
    const response = await fetch(`${API_BASE_URL}/api/v1/auth/register`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password }),
    });
    if (!response.ok) {
      const err = await response.json();
      throw new Error(err.detail || 'Registration failed');
    }
    return await response.json();
  },

  async checkHealth() {
    try {
      const response = await fetch(`${API_BASE_URL}/health`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.status === 'ok' || data.status === 'degraded';
    } catch (error) {
      console.error('Backend connection failed:', error);
      return false;
    }
  },

  async getProjects() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch projects');
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  async createProject(name, description) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ name, description }),
    });
    if (!response.ok) throw new Error('Failed to create project');
    return await response.json();
  },

  async getDocuments(projectId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/documents`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch documents');
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  async uploadDocument(projectId, file, documentType = 'AUTHOR_DOC') {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);

    const headers = getHeaders(false); // No Content-Type, browser will set boundary

    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/upload`, {
      method: 'POST',
      headers: headers,
      body: formData,
    });
    if (!response.ok) throw new Error('Failed to upload document');
    return await response.json();
  },

  async deleteDocument(projectId, documentId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/documents/${documentId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete document');
    return true;
  },

  // Chapter Generation and Drafts
  async generateChapter(projectId, prompt, tone = 'Informative', audience = 'General Public') {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/generate`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ prompt, tone, audience }),
    });
    if (!response.ok) throw new Error('Chapter generation failed');
    return await response.json();
  },

  async getDrafts(projectId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/drafts`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch drafts');
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  async saveDraft(projectId, draftId, title, content) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/drafts/${draftId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ title, content }),
    });
    if (!response.ok) throw new Error('Failed to update draft');
    return await response.json();
  },

  async deleteDraft(projectId, draftId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/drafts/${draftId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete draft');
    return true;
  },

  // Style Profile & Originality
  async getStyleProfile(projectId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/style-profile`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch style profile');
      return await response.json();
    } catch (error) {
      console.error(error);
      return null;
    }
  },

  async checkOriginality(projectId, chapterId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}/check-originality`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Originality check failed');
    return await response.json();
  },

  async refineChapter(projectId, chapterId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}/refine`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Refine chapter failed');
    return await response.json();
  },

  // Chat APIs
  async getChatSessions(projectId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chat/sessions`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch chat sessions');
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  async createChatSession(projectId, title) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chat/sessions`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title }),
    });
    if (!response.ok) throw new Error('Failed to create chat session');
    return await response.json();
  },

  async getChatMessages(projectId, sessionId) {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch chat messages');
      return await response.json();
    } catch (error) {
      console.error(error);
      return [];
    }
  },

  async sendChatMessage(projectId, sessionId, text) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chat/sessions/${sessionId}/messages`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ text }),
    });
    if (!response.ok) throw new Error('Failed to send chat message');
    return await response.json();
  },

  // Monitoring APIs
  async getMonitoringStats() {
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/monitoring/stats`, {
        headers: getHeaders(),
      });
      if (!response.ok) throw new Error('Failed to fetch monitoring stats');
      return await response.json();
    } catch (error) {
      console.error(error);
      return null;
    }
  },

  async triggerBackup() {
    const response = await fetch(`${API_BASE_URL}/api/v1/monitoring/backup`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Backup trigger failed');
    return await response.json();
  },

  async getBackups() {
    const response = await fetch(`${API_BASE_URL}/api/v1/monitoring/backups`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch backups');
    return await response.json();
  },

  // Book Context APIs
  async getBookContext(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/context`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch book context');
    return await response.json();
  },

  async updateBookContext(projectId, contextData) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/context`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify(contextData),
    });
    if (!response.ok) throw new Error('Failed to update book context');
    return await response.json();
  },

  async getBookContextFlags(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/context/flags`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch book context flags');
    return await response.json();
  },

  // Outline APIs
  async getOutline(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/outline`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch outline');
    return await response.json();
  },

  async generateOutline(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/outline/generate`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to generate outline');
    return await response.json();
  },

  async saveOutline(projectId, structure, status = 'draft') {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/outline`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ structure, status }),
    });
    if (!response.ok) throw new Error('Failed to save outline');
    return await response.json();
  },

  async rejectOutline(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/outline/reject`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to reject outline');
    return await response.json();
  },

  // Chapter APIs
  async getChapters(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch chapters');
    return await response.json();
  },

  async createChapter(projectId, title, order = 0) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ title, order }),
    });
    if (!response.ok) throw new Error('Failed to create chapter');
    return await response.json();
  },

  async updateChapter(projectId, chapterId, data) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify(data),
    });
    if (!response.ok) throw new Error('Failed to update chapter');
    return await response.json();
  },

  async deleteChapter(projectId, chapterId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}`, {
      method: 'DELETE',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to delete chapter');
    return await response.json();
  },

  async rejectChapterDraft(projectId, chapterId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}/reject`, {
      method: 'POST',
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to reject chapter draft');
    return await response.json();
  },

  async generateChapterQuick(projectId, chapterId, prompt, tone = 'Informative', audience = 'General Public') {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/generate/quick`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ chapter_id: chapterId, prompt, tone, audience }),
    });
    if (!response.ok) throw new Error('Quick chapter generation failed');
    return await response.json();
  },

  async generateChapterStream(projectId, chapterId, prompt, tone = 'Informative', audience = 'General Public', onToken, onDone, onError) {
    const token = localStorage.getItem('pensive_token') || '';
    try {
      const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/${chapterId}/generate-stream`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({ prompt, tone, audience }),
      });
      if (!response.ok) {
        throw new Error(`Streaming failed: ${response.statusText}`);
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        const { value, done } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        
        buffer = lines.pop();

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed) continue;
          if (trimmed.startsWith('data: ')) {
            try {
              const data = JSON.parse(trimmed.slice(6));
              if (data.token) {
                onToken(data.token);
              } else if (data.done) {
                onDone(data);
              } else if (data.error) {
                onError(new Error(data.error));
              }
            } catch (err) {
              console.error('Error parsing stream line:', err);
            }
          }
        }
      }
    } catch (error) {
      onError(error);
    }
  },

  async generateGuidedStart(projectId, chapterId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/generate/guided/start`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ chapter_id: chapterId }),
    });
    if (!response.ok) throw new Error('Failed to start guided session');
    return await response.json();
  },

  async generateGuidedAnswer(projectId, chapterId, answers) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/generate/guided/answer`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ chapter_id: chapterId, answers }),
    });
    if (!response.ok) throw new Error('Failed to submit answer');
    return await response.json();
  },

  async generateGuidedFinish(projectId, chapterId, answers, tone = 'Informative', audience = 'General Public') {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/chapters/generate/guided/finish`, {
      method: 'POST',
      headers: getHeaders(),
      body: JSON.stringify({ chapter_id: chapterId, answers, tone, audience }),
    });
    if (!response.ok) throw new Error('Failed to complete guided session');
    return await response.json();
  },

  // Document Upload with Bucket
  async uploadDocumentWithBucket(projectId, file, documentType = 'AUTHOR_DOC', bucket = null) {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('document_type', documentType);
    if (bucket) {
      formData.append('bucket', bucket);
    }
    const headers = getHeaders(false);
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/upload`, {
      method: 'POST',
      headers: headers,
      body: formData,
    });
    if (!response.ok) throw new Error('Upload failed');
    return await response.json();
  },

  // Admin APIs
  async getAdminAuditLogs(page = 1, perPage = 50) {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/audit-log?page=${page}&per_page=${perPage}`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch audit logs');
    return await response.json();
  },

  async getAdminLLMConfig() {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/llm-config`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch LLM config');
    return await response.json();
  },

  async updateAdminLLMConfig(provider) {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/llm-config`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ provider }),
    });
    if (!response.ok) throw new Error('Failed to update LLM config');
    return await response.json();
  },

  async getAdminUsers() {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch users list');
    return await response.json();
  },

  async getProjectStats(projectId) {
    const response = await fetch(`${API_BASE_URL}/api/v1/projects/${projectId}/stats`, {
      headers: getHeaders(),
    });
    if (!response.ok) throw new Error('Failed to fetch project stats');
    return await response.json();
  },

  async updateUserRole(userId, role) {
    const response = await fetch(`${API_BASE_URL}/api/v1/admin/users/${userId}/role`, {
      method: 'PUT',
      headers: getHeaders(),
      body: JSON.stringify({ role }),
    });
    if (!response.ok) throw new Error('Failed to update user role');
    return await response.json();
  }
};
