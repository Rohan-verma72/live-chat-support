/* eslint-disable react-hooks/set-state-in-effect */

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { io } from 'socket.io-client'
import ChatMessage from '../../modules/chat/ChatMessage/ChatMessage'
import styles from './AgentPortal.module.css'

const SERVER = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin
const AGENT_NAME_KEY = 'support_agent_name'

const CANNED_RESPONSES = [
  { shortcut: '/greet', text: 'Hello! How can I help you today?' },
  { shortcut: '/wait', text: 'Please give me a moment while I look up your details.' },
  { shortcut: '/close', text: 'Thanks for contacting us. I will close this ticket now. Let us know if you need anything else!' },
  { shortcut: '/transfer', text: 'I am transferring your chat to another specialist who can better assist you. Please stand by.' }
]

let audioCtx = null;
function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc1 = audioCtx.createOscillator()
    const osc2 = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc1.type = 'sine'
    osc1.frequency.setValueAtTime(587.33, audioCtx.currentTime)
    osc1.frequency.exponentialRampToValueAtTime(880.00, audioCtx.currentTime + 0.15)
    osc2.type = 'triangle'
    osc2.frequency.setValueAtTime(293.66, audioCtx.currentTime)
    osc2.frequency.exponentialRampToValueAtTime(440.00, audioCtx.currentTime + 0.15)
    gain.gain.setValueAtTime(0.15, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.3)
    osc1.connect(gain); osc2.connect(gain); gain.connect(audioCtx.destination)
    osc1.start(); osc2.start()
    osc1.stop(audioCtx.currentTime + 0.3); osc2.stop(audioCtx.currentTime + 0.3)
  } catch (e) { console.warn('AudioContext sound failed:', e) }
}

const resumeAudio = () => {
  if (audioCtx && audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
};
if (typeof window !== 'undefined') {
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });
}

const STATUS_OPTIONS = [
  { value: 'online', label: 'Online',  color: '#198754' },
  { value: 'away',   label: 'Away',    color: '#ffc107' },
  { value: 'busy',   label: 'Busy',    color: '#dc3545' },
  { value: 'offline',label: 'Offline', color: '#6c757d' }
]

const FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'mine',       label: 'Mine' },
  { id: 'unassigned', label: 'Unassigned' },
  { id: 'waiting',    label: 'Waiting' },
  { id: 'ai',         label: 'AI Handled' },
  { id: 'closed',     label: 'Closed' }
]

export default function AgentPortal() {
  const [agent, setAgent]               = useState(null)
  const [loginName, setLoginName]       = useState('')
  const [loginError, setLoginError]     = useState('')
  const [loggingIn, setLoggingIn]       = useState(false)
  const [sessions, setSessions]         = useState([])
  const [teamAgents, setTeamAgents]     = useState([])
  const [activeId, setActiveId]         = useState(null)
  const [messages, setMessages]         = useState([])
  const [sessionMeta, setSessionMeta]   = useState(null)
  const [input, setInput]               = useState('')
  const [connected, setConnected]       = useState(false)
  const [sidebarOpen, setSidebarOpen]   = useState(false)
  const [rightPanelOpen, setRightPanelOpen] = useState(false)
  const [filter, setFilter]             = useState('all')
  const [showAssign, setShowAssign]     = useState(false)
  const [showTransfer, setShowTransfer] = useState(false)
  const [transferNotice, setTransferNotice] = useState('')
  const [searchQuery, setSearchQuery]   = useState('')
  const [visitorTyping, setVisitorTyping] = useState(false)
  const [notesText, setNotesText]       = useState('')
  const [savingNotes, setSavingNotes]   = useState(false)
  const [selectedCannedIndex, setSelectedCannedIndex] = useState(0)
  const [replyTo, setReplyTo]           = useState(null)

  const socketRef      = useRef(null)
  const activeIdRef    = useRef(null)
  const sessionsRef    = useRef([])
  const agentRef       = useRef(null)
  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)
  const typingTimeoutRef = useRef(null)
  const myTypingRef      = useRef(false)
  const saveTimeoutRef   = useRef(null)

  useEffect(() => { activeIdRef.current = activeId }, [activeId])
  useEffect(() => { sessionsRef.current = sessions }, [sessions])
  useEffect(() => { agentRef.current = agent }, [agent])

  const activeSession = sessions.find(s => s.id === activeId)
  const meta = sessionMeta || activeSession

  const visitorHistory = useMemo(() => {
    if (!activeSession?.visitor?.userId) return []
    return sessions
      .filter(s => s.visitor?.userId === activeSession.visitor?.userId)
      .sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt))
  }, [sessions, activeSession])

  const uniqueCustomers = useMemo(() => {
    const groups = {}
    sessions.forEach(s => {
      const uid = s.visitor?.userId
      if (!uid) return
      if (!groups[uid]) {
        groups[uid] = []
      }
      groups[uid].push(s)
    })

    return Object.values(groups).map(userSessions => {
      const sorted = [...userSessions].sort((a, b) => {
        const aActive = a.status !== 'closed' ? 1 : 0
        const bActive = b.status !== 'closed' ? 1 : 0
        if (aActive !== bActive) return bActive - aActive
        return b.updatedAt - a.updatedAt
      })

      const mostRecent = sorted[0]
      const unreadCount = userSessions.reduce((acc, s) => acc + (s.unread || 0), 0)
      const hasOnline = userSessions.some(s => s.visitorOnline)

      return {
        userId: mostRecent.visitor?.userId,
        name: mostRecent.visitor?.name || 'Customer',
        mostRecentSession: mostRecent,
        allSessions: sorted,
        unread: unreadCount,
        visitorOnline: hasOnline,
        updatedAt: mostRecent.updatedAt,
      }
    }).sort((a, b) => b.updatedAt - a.updatedAt)
  }, [sessions])

  const filteredCustomers = useMemo(() => {
    let list = uniqueCustomers

    if (filter !== 'all') {
      list = list.filter(c => {
        if (filter === 'mine') {
          return c.allSessions.some(s => s.assignedAgentId === agent?.id)
        }
        if (filter === 'unassigned') {
          return c.allSessions.some(s => !s.assignedAgentId && s.status !== 'closed' && s.handlingMode !== 'ai')
        }
        if (filter === 'waiting') {
          return c.allSessions.some(s => s.status === 'waiting' && s.handlingMode !== 'ai')
        }
        if (filter === 'ai') {
          return c.allSessions.some(s => s.handlingMode === 'ai' && s.status !== 'closed')
        }
        if (filter === 'closed') {
          return c.allSessions.every(s => s.status === 'closed')
        }
        return true
      })
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim()
      list = list.filter(c => {
        const nameMatch = c.name.toLowerCase().includes(q)
        const msgMatch = c.allSessions.some(s => 
          s.subject?.toLowerCase().includes(q) || 
          s.messages?.some(m => m.body?.toLowerCase().includes(q))
        )
        return nameMatch || msgMatch
      })
    }

    return list
  }, [uniqueCustomers, filter, agent, searchQuery])

  const getSessionToOpen = useCallback((customer) => {
    if (filter === 'mine') {
      const match = customer.allSessions.find(s => s.assignedAgentId === agent?.id && s.status !== 'closed')
      if (match) return match
    }
    if (filter === 'unassigned') {
      const match = customer.allSessions.find(s => !s.assignedAgentId && s.status !== 'closed' && s.handlingMode !== 'ai')
      if (match) return match
    }
    if (filter === 'waiting') {
      const match = customer.allSessions.find(s => s.status === 'waiting' && s.handlingMode !== 'ai')
      if (match) return match
    }
    if (filter === 'ai') {
      const match = customer.allSessions.find(s => s.handlingMode === 'ai' && s.status !== 'closed')
      if (match) return match
    }
    return customer.mostRecentSession
  }, [filter, agent?.id])

  const joinAsAgent = useCallback((name) => {
    const trimmed = name.trim()
    if (!trimmed) return
    if (!socketRef.current?.connected) {
      setLoginError('Cannot connect to server. Make sure the server is running.')
      return
    }
    setLoggingIn(true)
    setLoginError('')
    localStorage.setItem(AGENT_NAME_KEY, trimmed)
    socketRef.current.emit('agent:join', { name: trimmed, status: 'online' })
  }, [])

  useEffect(() => {
    const socket = io(SERVER, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      const savedName = localStorage.getItem(AGENT_NAME_KEY)
      if (savedName) {
        const savedStatus = localStorage.getItem('support_agent_status') || 'online'
        socket.emit('agent:join', { name: savedName, status: savedStatus })
        if (activeIdRef.current) {
          socket.emit('agent:open-session', { sessionId: activeIdRef.current })
        }
      }
    })
    socket.on('disconnect', () => setConnected(false))
    socket.on('connect_error', () => {
      setConnected(false)
      setLoginError('Failed to connect to server. Please make sure "npm run dev" is running.')
    })

    socket.on('agent:registered', ({ agent: registered }) => {
      setLoggingIn(false)
      setLoginError('')
      setAgent(registered)
      localStorage.setItem('support_agent_status', registered.status)
    })

    socket.on('agent:join-error', ({ error }) => {
      setLoggingIn(false)
      setLoginError(error || 'Login failed')
    })

    socket.on('sessions:update', (list) => {
      const prevList = sessionsRef.current || []
      const newWaiting = list.some(s => s.status === 'waiting' && !prevList.some(ps => ps.id === s.id))
      if (newWaiting) playNotificationSound()
      setSessions(list)
      const current = list.find(s => s.id === activeIdRef.current)
      if (current) setSessionMeta(current)
    })
    socket.on('agents:update', (list) => {
      setTeamAgents(list)
      if (agentRef.current) {
        const myInfo = list.find(a => a.id === agentRef.current.id)
        if (myInfo && myInfo.status !== agentRef.current.status) {
          setAgent(prev => prev ? { ...prev, status: myInfo.status } : prev)
          localStorage.setItem('support_agent_status', myInfo.status)
        }
      }
    })

    socket.on('session:history', ({ sessionId, messages: hist }) => {
      if (sessionId === activeIdRef.current) setMessages(hist)
    })

    socket.on('session:update', (meta) => {
      if (meta.id === activeIdRef.current) setSessionMeta(meta)
    })

    socket.on('message:new', ({ sessionId, message }) => {
      if (sessionId === activeIdRef.current) {
        setMessages(prev => [...prev, message])
        if (message.from === 'visitor') {
          socket.emit('session:seen', { sessionId, role: 'agent' })
        }
      }
      if (message.from === 'visitor') playNotificationSound()
    })

    socket.on('typing:status', ({ sessionId: sid, isTyping, from }) => {
      if (sid === activeIdRef.current && from === 'visitor') setVisitorTyping(isTyping)
    })

    socket.on('session:seen', ({ sessionId: sid, role }) => {
      if (sid === activeIdRef.current && role === 'visitor') {
        setMessages(prev => prev.map(m => m.from === 'agent' ? { ...m, seenByVisitor: true } : m))
      }
    })

    socket.on('chat:transferred-to', ({ sessionId, fromAgentName, session, messages }) => {
      setTransferNotice(`Chat transferred to you from ${fromAgentName}`)
      setActiveId(sessionId); setSessionMeta(session); setMessages(messages || [])
      setShowAssign(false); setShowTransfer(false)
    })

    socket.on('chat:assigned-to', ({ sessionId, fromAgentName, session, messages }) => {
      setTransferNotice(`Chat assigned to you by ${fromAgentName}`)
      setActiveId(sessionId); setSessionMeta(session); setMessages(messages || [])
      setShowAssign(false); setShowTransfer(false)
    })

    socket.on('chat:transferred-away', ({ sessionId, newAgentName, session }) => {
      if (sessionId === activeIdRef.current) {
        setTransferNotice(`Chat transferred to ${newAgentName}`)
        setSessionMeta(session); setShowAssign(false); setShowTransfer(false)
      }
    })

    socket.on('transfer:error', ({ error }) => {
      setTransferNotice(error || 'Transfer failed')
      setShowAssign(false); setShowTransfer(false)
    })

    socket.on('message:error', ({ error }) => setTransferNotice(error || 'Message not sent'))

    return () => socket.disconnect()
  }, [])

  useEffect(() => {
    if (!activeId || !socketRef.current) return
    setMessages([]); setShowAssign(false); setShowTransfer(false)
    setTransferNotice(''); setVisitorTyping(false); myTypingRef.current = false
    setReplyTo(null); setRightPanelOpen(false)
    const cached = sessionsRef.current.find(s => s.id === activeId)
    setSessionMeta(cached || null)
    setNotesText(cached?.notes || '')
    socketRef.current.emit('agent:open-session', { sessionId: activeId })
    socketRef.current.emit('session:seen', { sessionId: activeId, role: 'agent' })
  }, [activeId])

  useEffect(() => {
    if (meta) {
      setNotesText(meta.notes || '')
    } else {
      setNotesText('')
    }
  }, [activeId, meta])

  const debouncedSaveNotes = (val) => {
    setSavingNotes(true)
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current)
    saveTimeoutRef.current = setTimeout(() => {
      socketRef.current?.emit('agent:save-notes', { sessionId: activeId, notes: val })
      setSavingNotes(false)
    }, 800)
  }

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, visitorTyping])

  const openSession  = useCallback((id) => { setActiveId(id); setSidebarOpen(false) }, [])
  const changeStatus = useCallback((status) => {
    socketRef.current?.emit('agent:status', { status })
    setAgent(prev => prev ? { ...prev, status } : prev)
    localStorage.setItem('support_agent_status', status)
  }, [])
  const handleLogout = useCallback(() => { localStorage.removeItem(AGENT_NAME_KEY); window.location.reload() }, [])
  const claimChat    = useCallback(() => { if (activeId) socketRef.current?.emit('agent:claim', { sessionId: activeId }) }, [activeId])
  const assignChat   = useCallback((targetAgentId) => {
    if (activeId) { socketRef.current?.emit('agent:assign', { sessionId: activeId, targetAgentId }); setShowAssign(false) }
  }, [activeId])
  const transferChat = useCallback((targetAgentId) => {
    if (activeId) { socketRef.current?.emit('agent:transfer', { sessionId: activeId, targetAgentId }); setShowTransfer(false) }
  }, [activeId])
  const closeChat  = useCallback(() => { if (activeId) socketRef.current?.emit('agent:close-session',  { sessionId: activeId }) }, [activeId])
  const reopenChat = useCallback(() => { if (activeId) socketRef.current?.emit('agent:reopen-session', { sessionId: activeId }) }, [activeId])

  const handleInputChange = (val) => {
    setInput(val); setSelectedCannedIndex(0)
    if (!socketRef.current || !activeId) return
    if (!myTypingRef.current) {
      myTypingRef.current = true
      socketRef.current.emit('typing:status', { sessionId: activeId, isTyping: true, from: 'agent' })
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      myTypingRef.current = false
      socketRef.current.emit('typing:status', { sessionId: activeId, isTyping: false, from: 'agent' })
    }, 2000)
  }

  const filteredCanned = useMemo(() => {
    if (!input.startsWith('/')) return []
    return CANNED_RESPONSES.filter(c => c.shortcut.toLowerCase().startsWith(input.toLowerCase()))
  }, [input])

  const sendReply = useCallback((e) => {
    e?.preventDefault()
    const body = input.trim()
    if (!body || !activeId || !socketRef.current) return
    const currentMeta = sessionsRef.current.find(s => s.id === activeId)
    if (currentMeta?.status === 'closed') return
    if (currentMeta?.assignedAgentId && currentMeta.assignedAgentId !== agentRef.current?.id) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    myTypingRef.current = false
    socketRef.current.emit('typing:status', { sessionId: activeId, isTyping: false, from: 'agent' })
    
    const msgPayload = { from: 'agent', body }
    if (replyTo) {
      msgPayload.replyTo = {
        id: replyTo.id,
        body: replyTo.body,
        from: replyTo.from,
        type: replyTo.type
      }
    }
    
    socketRef.current.emit('message:send', { sessionId: activeId, message: msgPayload })
    setInput('')
    setReplyTo(null)
  }, [input, activeId, replyTo])

  const handleKeyDown = (e) => {
    if (input.startsWith('/') && filteredCanned.length > 0) {
      if (e.key === 'ArrowDown')  { e.preventDefault(); setSelectedCannedIndex(prev => (prev + 1) % filteredCanned.length) }
      else if (e.key === 'ArrowUp')   { e.preventDefault(); setSelectedCannedIndex(prev => (prev - 1 + filteredCanned.length) % filteredCanned.length) }
      else if (e.key === 'Enter') { e.preventDefault(); setInput(filteredCanned[selectedCannedIndex].text) }
      else if (e.key === 'Escape') setInput('')
    } else if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply() }
  }

  const handleFileChange = () => {
    const file = fileInputRef.current?.files[0]
    if (!file || !activeId) return
    const currentMeta = sessionsRef.current.find(s => s.id === activeId)
    if (currentMeta?.status === 'closed') return
    if (currentMeta?.assignedAgentId && currentMeta.assignedAgentId !== agentRef.current?.id) return
    const reader = new FileReader()
    reader.onload = () => {
      const payload = { sessionId: activeId, image: reader.result, filename: file.name, from: 'agent' }
      if (replyTo) {
        payload.replyTo = {
          id: replyTo.id,
          body: replyTo.body,
          from: replyTo.from,
          type: replyTo.type
        }
      }
      socketRef.current.emit('screenshot:send', payload)
      setReplyTo(null)
    }
    reader.readAsDataURL(file)
    fileInputRef.current.value = ''
  }

  const formatTime = (ts) => {
    const d = new Date(ts), now = new Date()
    if (d.toDateString() === now.toDateString()) return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
    return d.toLocaleDateString([], { day: '2-digit', month: 'short' })
  }

  const statusLabel  = (s) => ({ waiting: 'Waiting', active: 'Active', closed: 'Closed' }[s] || s)
  const onlineCount  = teamAgents.filter(a => a.status === 'online').length
  const initials     = (name) => (name?.[0] || '?').toUpperCase()
  const statusColor  = (s) => STATUS_OPTIONS.find(o => o.value === s)?.color || '#6c757d'

  if (!agent) {
    return (
      <div className={styles.loginPage}>
        <form className={styles.loginCard}
          onSubmit={(e) => { e.preventDefault(); joinAsAgent(loginName) }}>
          <div className={styles.loginLogo}>LC</div>
          <h1 className="h4 fw-bold text-dark mb-1">Agent Portal</h1>
          <p className="text-secondary fs-7 mb-4">Sign in to start helping customers</p>

          <div className="text-start mb-3">
            <label className="form-label fw-semibold text-secondary fs-7">Your Name</label>
            <input
              className="form-control border-secondary-subtle py-2 shadow-none fs-7"
              value={loginName}
              onChange={e => { setLoginName(e.target.value); setLoginError('') }}
              placeholder="E.g. Agent Smith"
              autoFocus
              required
            />
          </div>

          {loginError && <div className="alert alert-danger py-2 fs-7 text-start">{loginError}</div>}

          <button type="submit" className="btn btn-primary w-100 py-2 fw-semibold shadow-sm fs-7 mt-2"
            disabled={!loginName.trim() || loggingIn || !connected}>
            {loggingIn ? 'Signing in...' : connected ? 'Enter Dashboard' : 'Connecting to server...'}
          </button>
        </form>
      </div>
    )
  }

  const isMine         = meta?.assignedAgentId === agent.id
  const isUnassigned   = meta && !meta.assignedAgentId
  const isClosed       = meta?.status === 'closed'
  const hasActiveChat  = Boolean(activeId && meta)
  const isTakenByOther = meta?.assignedAgentId && !isMine
  const canReply       = Boolean(activeId && !isClosed && (!meta?.assignedAgentId || isMine))
  const otherAgents    = teamAgents.filter(a => a.id !== agent.id)

  return (
    <div className={styles.layout}>
      
      <header className={styles.topbar}>
        <div className={styles.topbarBrand}>
          <button className="btn btn-link p-0 d-md-none text-white me-2"
                  onClick={() => setSidebarOpen(o => !o)} aria-label="Menu"
                  style={{ outline: 'none', border: 'none', boxShadow: 'none' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
              <line x1="3" y1="6" x2="21" y2="6"/><line x1="3" y1="12" x2="21" y2="12"/><line x1="3" y1="18" x2="21" y2="18"/>
            </svg>
          </button>
          <div className={styles.brandLogo}>LC</div>
          <span className={styles.brandName}>LiveChat Helpdesk</span>
        </div>

        <div className={styles.topbarRight}>
          <div className={styles.agentPill}>
            <div className={styles.agentAvatar}>{initials(agent.name)}</div>
            <span className={styles.agentName}>{agent.name}</span>
            <select className={styles.statusSelect}
                    value={agent.status} onChange={e => changeStatus(e.target.value)}>
              {STATUS_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <div className={styles.workspace}>
        
        <aside className={`${styles.sidebar} ${sidebarOpen ? styles.sidebarVisible : ''}`}>
          
          <div className={styles.sidebarHeader}>
            <div className={styles.teamRow}>
              <span className={styles.teamLabel}>Active Team ({onlineCount})</span>
              <span className={`status-dot online ${styles.systemDot}`} title="System online" />
            </div>
            
            <div className={styles.teamAgents}>
              {teamAgents.map(a => (
                <span key={a.id} className={styles.teamChip}>
                  <span className={`status-dot ${styles.teamStatusDot}`} style={{ background: statusColor(a.status) }} />
                  {a.name}{a.id === agent.id ? ' (you)' : ''}
                </span>
              ))}
            </div>

            <div className={styles.filterRow}>
              {FILTERS.map(f => (
                <button key={f.id}
                  className={`${styles.filterBtn} ${filter === f.id ? styles.filterBtnActive : ''}`}
                  onClick={() => setFilter(f.id)}>
                  {f.label}
                </button>
              ))}
            </div>

            <div className={styles.searchBox}>
              <svg className={styles.searchIcon} width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                <circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>
              </svg>
              <input
                className={styles.searchInput}
                type="text"
                placeholder="Search ticket, visitor name..."
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={styles.searchClear} onClick={() => setSearchQuery('')}>×</button>
              )}
            </div>
          </div>

          <div className="list-group list-group-flush overflow-auto flex-grow-1">
            {filteredCustomers.length === 0 ? (
              <div className="text-center py-5 text-muted">
                <div className="fs-1 mb-2">📬</div>
                <div className="fw-semibold">No customers found</div>
                <small>Waiting for customer connections</small>
              </div>
            ) : (
              filteredCustomers.map(customer => {
                const session = customer.mostRecentSession
                const isActive = customer.allSessions.some(s => s.id === activeId)
                const sessionToOpen = getSessionToOpen(customer)
                return (
                  <button key={customer.userId}
                    className={`list-group-item list-group-item-action border-0 border-bottom p-3 d-flex align-items-center gap-2.5 ${isActive ? 'bg-primary-subtle text-dark border-start border-primary border-3' : ''}`}
                    onClick={() => openSession(sessionToOpen.id)}>
                    
                    <div className="position-relative flex-shrink-0">
                      <div className={styles.customerAvatar}>
                        {initials(customer.name)}
                      </div>
                      {customer.visitorOnline && (
                        <span className={styles.customerOnlineBadge} title="Visitor online" />
                      )}
                    </div>

                    <div className="flex-grow-1 min-w-0">
                      <div className="d-flex justify-content-between align-items-baseline mb-1">
                        <span className={styles.customerName}>
                          {customer.name}
                          {session.handlingMode === 'ai' && (
                            <span className="badge bg-info-subtle text-info border border-info-subtle fs-9 px-1.5 py-0.5 ms-1.5" style={{ fontSize: '10px', verticalAlign: 'middle' }}>🤖 AI</span>
                          )}
                        </span>
                        <span className="text-muted fs-8 flex-shrink-0">
                          {formatTime(customer.updatedAt)}
                        </span>
                      </div>

                      <div className="d-flex justify-content-between align-items-center">
                        <span className={styles.customerMsgPreview}>
                          {session.lastMessage
                            ? (session.lastMessage.type === 'screenshot' ? '📷 Image attached' : session.lastMessage.body)
                            : 'No messages yet'}
                        </span>
                        {customer.unread > 0 && (
                          <span className="badge bg-danger rounded-pill fs-9 flex-shrink-0">{customer.unread}</span>
                        )}
                      </div>
                    </div>
                  </button>
                )
              })
            )}
          </div>
        </aside>

        <div className={styles.mainArea}>
          {activeSession ? (
            <div className={styles.chatColumn}>
              
              <header className={styles.chatHeader}>
                <div className={styles.chatHeaderLeft}>
                  <div className={styles.chatAvatar}>
                    {initials(activeSession.visitor?.name)}
                  </div>
                  <div className="lh-sm">
                    <div className={styles.chatTitle}>
                      <span className="text-primary fw-extrabold me-2">{meta?.ticketNumber || `#TCK-${activeSession.id.slice(-5)}`}</span>
                      <span className="text-muted mx-1.5">—</span>
                      <span className="fw-semibold text-dark ms-1">{activeSession.subject || 'General Support'}</span>
                    </div>
                    <div className="d-flex align-items-center gap-1.5 fs-8 text-secondary mt-0.5">
                      <span>Visitor: <strong className="text-dark">{activeSession.visitor?.name || 'Customer'}</strong></span>
                      <span className="text-muted">•</span>
                      <span className={`badge fs-9 py-0.5 px-1.5 ${
                        meta?.status === 'waiting' ? 'bg-warning text-dark' :
                        meta?.status === 'active' ? 'bg-success text-white' :
                        'bg-secondary text-white'
                      }`}>{statusLabel(meta?.status)}</span>
                      {activeSession.visitorOnline && (
                        <span className="text-success fw-semibold ms-1 d-flex align-items-center gap-1">
                          <span className="badge bg-success rounded-circle p-1" style={{ width: 5, height: 5 }} />
                          Online
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                <div className={`${styles.chatActions} d-flex gap-2`}>
                  {isUnassigned && !isClosed && (
                    <button className="btn btn-sm btn-success fw-semibold" onClick={claimChat}>Claim Ticket</button>
                  )}
                  {hasActiveChat && !isClosed && (
                    <button className="btn btn-sm btn-outline-primary fw-semibold"
                      onClick={() => { setShowAssign(t => !t); setShowTransfer(false) }}>Assign</button>
                  )}
                  {hasActiveChat && !isClosed && (
                    <button className="btn btn-sm btn-outline-primary fw-semibold"
                      onClick={() => { setShowTransfer(t => !t); setShowAssign(false) }}>Transfer</button>
                  )}
                  {!isClosed
                    ? <button className="btn btn-sm btn-danger fw-semibold" onClick={closeChat}>Close</button>
                    : <button className="btn btn-sm btn-success fw-semibold" onClick={reopenChat}>Reopen</button>
                  }
                  {activeSession && (
                    <button 
                      type="button"
                      className="btn btn-sm btn-outline-secondary fw-semibold d-flex align-items-center gap-1"
                      onClick={() => setRightPanelOpen(o => !o)}
                      title="View Customer Details & History"
                    >
                      ℹ️ Details
                    </button>
                  )}
                </div>
              </header>

              {transferNotice && (
                <div className="alert alert-info alert-dismissible fade show m-2 mb-0 py-2 px-3 fs-7" role="alert">
                  <strong>ℹ️</strong> {transferNotice}
                  <button type="button" className="btn-close py-2.5 px-3" onClick={() => setTransferNotice('')} aria-label="Close" />
                </div>
              )}

              {showAssign && (
                <div className="bg-light border-bottom p-2.5 d-flex align-items-center flex-wrap gap-2 flex-shrink-0">
                  <span className="fs-8 fw-bold text-secondary me-2">Assign to:</span>
                  {otherAgents.length > 0 ? (
                    otherAgents.map(a => (
                      <button key={a.id} className="btn btn-xs btn-outline-secondary py-1 px-2 fs-8 fw-semibold" onClick={() => assignChat(a.id)}>
                        {a.name} ({a.status})
                      </button>
                    ))
                  ) : (
                    <span className="text-muted fs-8">No other agents online</span>
                  )}
                </div>
              )}

              {showTransfer && (
                <div className="bg-light border-bottom p-2.5 d-flex align-items-center flex-wrap gap-2 flex-shrink-0">
                  <span className="fs-8 fw-bold text-secondary me-2">Transfer to:</span>
                  {otherAgents.length > 0 ? (
                    otherAgents.map(a => (
                      <button key={a.id} className="btn btn-xs btn-outline-secondary py-1 px-2 fs-8 fw-semibold" onClick={() => transferChat(a.id)}>
                        {a.name} ({a.status})
                      </button>
                    ))
                  ) : (
                    <span className="text-muted fs-8">No other agents online</span>
                  )}
                </div>
              )}

              {activeId && meta?.previousAgents?.length > 0 && (
                <div className="bg-light px-3 py-1.5 fs-8 text-secondary border-bottom">
                  ⏮️ Previous Handlers: <span className="fw-semibold text-dark">{meta.previousAgents.map(pa => pa.agentName).join(', ')}</span>
                </div>
              )}

              <div className={styles.messagesFeed}>
                {messages.length === 0 ? (
                  <div className="d-flex align-items-center justify-content-center h-100 text-muted fs-7">
                    No messages yet in this ticket
                  </div>
                ) : (
                  messages.map(m => (
                    <ChatMessage
                      key={m.id}
                      message={m}
                      isOwnMessage={m.from === 'agent'}
                      onReply={canReply ? setReplyTo : null}
                    />
                  ))
                )}
                <div ref={messagesEndRef} />
              </div>

              {visitorTyping && (
                <div className={styles.typingIndicator}>
                  <div className={styles.typingBubble}>
                    <span /><span /><span />
                  </div>
                  <span className={styles.typingText}>Customer is typing...</span>
                </div>
              )}

              {filteredCanned.length > 0 && (
                <div className={styles.cannedList}>
                  {filteredCanned.map((c, idx) => (
                    <button type="button" key={c.shortcut}
                      className={`${styles.cannedItem} ${idx === selectedCannedIndex ? styles.cannedItemActive : ''}`}
                      onClick={() => setInput(c.text)}>
                      <span className={styles.cannedShortcut}>{c.shortcut}</span>
                      <span>— {c.text}</span>
                    </button>
                  ))}
                </div>
              )}

              <form className={`p-3 bg-white border-top flex-shrink-0 ${!canReply ? 'bg-light text-muted' : ''}`}
                onSubmit={sendReply}>
                {replyTo && (
                  <div className={styles.replyPreviewBar}>
                    <div className={styles.replyPreviewBarContent}>
                      <span className={styles.replyPreviewBarSender}>
                        Replying to {replyTo.from === 'agent' ? (replyTo.agentName || 'Support') : 'Customer'}
                      </span>
                      <span className={styles.replyPreviewBarText}>
                        {replyTo.type === 'screenshot' ? '📷 Image' : replyTo.body}
                      </span>
                    </div>
                    <button
                      type="button"
                      className={styles.replyPreviewBarClose}
                      onClick={() => setReplyTo(null)}
                    >
                      ×
                    </button>
                  </div>
                )}
                <div className="input-group">
                  <input type="text" className="form-control border-secondary-subtle fs-7 shadow-none"
                    value={input}
                    onChange={e => handleInputChange(e.target.value)}
                    onKeyDown={handleKeyDown}
                    placeholder={
                      !activeId ? 'Select a ticket'
                        : isClosed ? 'Ticket closed'
                        : isTakenByOther ? `Assigned to ${meta.assignedAgentName}`
                        : isUnassigned ? 'Type reply to claim and reply...'
                        : 'Type reply... (press / for shortcuts)'
                    }
                    disabled={!canReply}
                    autoComplete="off"
                  />
                  <label className={`btn btn-outline-secondary border-secondary-subtle ${styles.attachLabel}`} title="Attach image">
                    <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden disabled={!canReply} />
                    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                    </svg>
                  </label>
                  <button type="submit" className="btn btn-primary fs-7 fw-semibold shadow-none px-4" disabled={!canReply || !input.trim()}>
                    Send
                  </button>
                </div>
              </form>
            </div>
          ) : (
            <div className={styles.welcomeState}>
              <div className="fs-1 mb-2">💬</div>
              <h4 className="fw-bold text-dark fs-6">Welcome to Agent Inbox</h4>
              <p className="text-secondary fs-7 max-w-280">Select a ticket from the sidebar to start supporting visitors</p>
            </div>
          )}

          {activeSession && (
            <aside className={`${styles.notesPanel} ${rightPanelOpen ? styles.notesPanelVisible : ''}`}>
              <div className="d-flex justify-content-end d-lg-none mb-2">
                <button 
                  type="button" 
                  className="btn-close" 
                  onClick={() => setRightPanelOpen(false)} 
                  aria-label="Close details" 
                />
              </div>
              
              <div className="text-center pb-3 border-bottom mb-4">
                <div className={styles.profileAvatar}>
                  {initials(activeSession.visitor?.name)}
                  {activeSession.visitorOnline && <span className={styles.profileAvatarOnline} />}
                </div>
                <h5 className="h6 fw-bold text-dark mb-1">{activeSession.visitor?.name || 'Customer'}</h5>
                <span className="text-muted fs-8 font-monospace d-block text-truncate" title={activeSession.visitor?.userId}>
                  ID: {activeSession.visitor?.userId ? activeSession.visitor.userId.slice(0, 14) + '...' : 'N/A'}
                </span>
              </div>

              {visitorHistory.length > 0 && (
                <div className="mb-4 d-flex flex-column flex-grow-1 min-h-0">
                  <h6 className={styles.notesPanelTitle}>
                    Customer Tickets ({visitorHistory.length})
                  </h6>
                  <div className={`${styles.historyList} flex-grow-1`}>
                    {visitorHistory.map(s => {
                      const isPastActive = s.id === activeId;
                      return (
                        <div 
                          key={s.id} 
                          className={`${styles.historyCard} ${isPastActive ? styles.historyCardActive : ''} p-2.5`} 
                          onClick={() => setActiveId(s.id)}
                          title="Click to view conversation"
                        >
                          <div className="d-flex justify-content-between align-items-center mb-1">
                            <span className={styles.historySubject} title={`[${s.ticketNumber || `#TCK-${s.id.slice(-5)}`}] ${s.subject}`}>
                              <span className="fw-extrabold text-primary me-1">{s.ticketNumber || `#TCK-${s.id.slice(-5)}`}</span>
                              {s.subject || 'General Support'}
                            </span>
                            <span className={`badge fs-9 py-0.5 px-1.5 ${
                              s.status === 'closed' ? 'bg-secondary text-white' : 
                              s.status === 'active' ? 'bg-success text-white' : 
                              'bg-warning text-dark'
                            }`}>
                              {statusLabel(s.status)}
                            </span>
                          </div>
                          <div className="d-flex justify-content-between align-items-center text-muted fs-8">
                            <span>{new Date(s.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
                          </div>
                          <div className="d-flex justify-content-between align-items-center text-muted fs-9 mt-1.5 pt-1 border-top border-light">
                            <span>
                              {s.assignedAgentId === agent.id ? (
                                <span className="text-success fw-semibold">● Assigned to you</span>
                              ) : s.assignedAgentName ? (
                                <span className="text-secondary">● {s.assignedAgentName}</span>
                              ) : (
                                <span className="text-warning fw-semibold">● Unassigned</span>
                              )}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              <div className="mt-auto border-top pt-3 flex-shrink-0">
                <div className="d-flex justify-content-between align-items-center mb-2">
                  <label className="fw-bold text-secondary fs-8 text-uppercase m-0">Internal Notes</label>
                  {savingNotes ? (
                    <span className="text-primary fs-9 fw-semibold">Saving...</span>
                  ) : (
                    <span className="text-success fs-9 fw-semibold">Saved</span>
                  )}
                </div>
                <textarea
                  className={`form-control border-secondary-subtle fs-8 shadow-none ${styles.notesTextarea}`}
                  placeholder="Type notes about this visitor/issue here..."
                  value={notesText}
                  onChange={e => {
                    setNotesText(e.target.value)
                    debouncedSaveNotes(e.target.value)
                  }}
                />
              </div>
            </aside>
          )}
        </div>
      </div>

      {(sidebarOpen || rightPanelOpen) && <div className={styles.overlay} onClick={() => { setSidebarOpen(false); setRightPanelOpen(false); }} />}
    </div>
  )
}
