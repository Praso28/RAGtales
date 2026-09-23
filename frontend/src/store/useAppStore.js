import { create } from 'zustand';

export const useAppStore = create((set, get) => ({
  // Navigation
  activeTab: 'dashboard', // 'dashboard' | 'upload' | 'generator'
  setActiveTab: (tab) => set({ activeTab: tab }),

  // Projects
  projects: [],
  activeProject: null,
  loadingProjects: false,
  setProjects: (projects) => set({ projects }),
  setActiveProject: (project) => {
    set({ activeProject: project });
    if (project) {
      set({
        activeChapter: null,
        chapters: [],
        chatSessions: [],
        activeChatSession: null,
        chatMessages: [],
        outline: null,
        bookContext: {},
        contextFlags: {}
      });
    }
  },
  resetProjectScopedState: () => set({
    activeChapter: null,
    chapters: [],
    chatSessions: [],
    activeChatSession: null,
    chatMessages: [],
    outline: null,
    bookContext: {},
    contextFlags: {}
  }),
  setLoadingProjects: (loading) => set({ loadingProjects: loading }),

  // Documents/Uploads
  recentUploads: [],
  setRecentUploads: (uploads) => set({ recentUploads: uploads }),
  addUpload: (upload) => set((state) => ({ 
    recentUploads: [upload, ...state.recentUploads] 
  })),
  updateUploadStatus: (id, status) => set((state) => ({
    recentUploads: state.recentUploads.map((u) => 
      u.id === id ? { ...u, status } : u
    )
  })),

  // Drafts & Generation
  drafts: [],
  activeDraft: null,
  generatingChapter: false,
  generationLogs: '',
  setDrafts: (drafts) => set({ drafts }),
  setActiveDraft: (activeDraft) => set({ activeDraft }),
  setGeneratingChapter: (generating) => set({ generatingChapter: generating }),
  setGenerationLogs: (logs) => set({ generationLogs: logs }),
  addDraft: (draft) => set((state) => ({
    drafts: [draft, ...state.drafts]
  })),

  // Sprint 8 - Book Context Slice
  bookContext: {},
  setBookContext: (bookContext) => set({ bookContext }),
  contextFlags: {},
  setContextFlags: (contextFlags) => set({ contextFlags }),

  // Sprint 8 - Outline Slice
  outline: null,
  setOutline: (outline) => set({ outline }),

  // Sprint 8 - Chapters Slice
  chapters: [],
  activeChapter: null,
  setChapters: (chapters) => set({ chapters }),
  setActiveChapter: (activeChapter) => set({ activeChapter }),
  
  // Sprint 8 - Guided Session
  guidedSession: null, // { step: 1, question: '...', answers: [] }
  setGuidedSession: (guidedSession) => set({ guidedSession }),

  // Sprint 8 - Workspace Tabs
  activeWorkspaceTab: 'context', // 'context' | 'outline' | 'workspace'
  setActiveWorkspaceTab: (tab) => set({ activeWorkspaceTab: tab }),

  // API Backend Health
  backendConnected: false,
  setBackendConnected: (connected) => set({ backendConnected: connected }),

  // Chat State
  chatSessions: [],
  activeChatSession: null,
  chatMessages: [],
  sendingChatMessage: false,
  setChatSessions: (sessions) => set({ chatSessions: sessions }),
  setActiveChatSession: (session) => set({ activeChatSession: session }),
  setChatMessages: (messages) => set({ chatMessages: messages }),
  setSendingChatMessage: (sending) => set({ sendingChatMessage: sending }),

  // Auth State
  token: localStorage.getItem('pensive_token') || null,
  currentUser: localStorage.getItem('pensive_user') || null,
  userRole: localStorage.getItem('pensive_role') || null,
  setAuth: (token, username, role) => {
    if (token) {
      localStorage.setItem('pensive_token', token);
      localStorage.setItem('pensive_user', username);
      localStorage.setItem('pensive_role', role || 'author');
      set({ token, currentUser: username, userRole: role || 'author' });
    } else {
      localStorage.removeItem('pensive_token');
      localStorage.removeItem('pensive_user');
      localStorage.removeItem('pensive_role');
      set({ token: null, currentUser: null, userRole: null, activeProject: null });
    }
  },

  // Panel collapse state
  leftPanelCollapsed: false,
  setLeftPanelCollapsed: (v) => set({ leftPanelCollapsed: v }),
  rightPanelCollapsed: false,
  setRightPanelCollapsed: (v) => set({ rightPanelCollapsed: v }),
  zenMode: false,
  setZenMode: (v) => set({ zenMode: v }),
  ceremonyOpen: false,
  setCeremonyOpen: (v) => set({ ceremonyOpen: v }),

  // Journey phase: 'spark' | 'blueprint' | 'manuscript' | 'refine'
  currentPhase: 'spark',
  setCurrentPhase: (phase) => set({ currentPhase: phase }),

  // Toast system
  toasts: [],
  addToast: (msg, type = 'info') => set((state) => ({
    toasts: [...state.toasts, { id: Date.now(), msg, type }]
  })),
  removeToast: (id) => set((state) => ({
    toasts: state.toasts.filter(t => t.id !== id)
  })),

  // Activity log (The Scribe's chronicle)
  activityLog: [],
  addActivity: (entry) => set((state) => ({
    activityLog: [
      { id: Date.now(), timestamp: new Date().toLocaleTimeString('en-US', {hour:'2-digit',minute:'2-digit'}), ...entry },
      ...state.activityLog
    ].slice(0, 50) // keep last 50
  })),

  // Confirm dialog state
  confirmDialog: null, // null | { message, onConfirm, onCancel, danger }
  showConfirm: (config) => set({ confirmDialog: config }),
  hideConfirm: () => set({ confirmDialog: null }),

  // Input dialog state
  inputDialog: null, // null | { title, message, defaultValue, placeholder, onConfirm, onCancel }
  showInput: (config) => set({ inputDialog: config }),
  hideInput: () => set({ inputDialog: null })
}));

