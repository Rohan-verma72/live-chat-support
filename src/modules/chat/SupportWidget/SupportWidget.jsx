import { useEffect, useRef, useState, useCallback } from 'react'
import { io } from 'socket.io-client'
import ChatMessage from '../ChatMessage/ChatMessage'
import styles from './SupportWidget.module.css'

const SERVER = import.meta.env.DEV ? 'http://localhost:3000' : window.location.origin

let audioCtx = null;
function playNotificationSound() {
  try {
    if (!audioCtx) {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
    const osc  = audioCtx.createOscillator()
    const gain = audioCtx.createGain()
    osc.type = 'sine'
    osc.frequency.setValueAtTime(660, audioCtx.currentTime)
    osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1)
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2)
    osc.connect(gain); gain.connect(audioCtx.destination)
    osc.start(); osc.stop(audioCtx.currentTime + 0.2)
  } catch (e) { console.warn('AudioContext failed:', e) }
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

export default function SupportWidget({ 
  visitorName = 'Customer', 
  userId = '', 
  forceOpen = false,
  onClose
}) {
  const [open, setOpen]                 = useState(false)
  const [view, setView]                 = useState('create') // 'create' or 'chat' (dashboard removed)
  const [sessionsList, setSessionsList] = useState([])
  const [activeSessionId, setActiveSessionId] = useState(null)
  
  const [messages, setMessages]       = useState([])
  const [input, setInput]             = useState('')
  const [connected, setConnected]     = useState(false)
  const [unread, setUnread]           = useState(0)
  const [sessionInfo, setSessionInfo] = useState(null)
  const [agentsOnline, setAgentsOnline] = useState({ online: 0, total: 0 })
  const [agentTyping, setAgentTyping] = useState(false)

  const [sessionsLoaded, setSessionsLoaded] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [replyTo, setReplyTo] = useState(null)
  const [showDropdown, setShowDropdown] = useState(false)

  const socketRef      = useRef(null)
  const sessionRef     = useRef(null)
  const openRef        = useRef(false)
  const messagesEndRef = useRef(null)
  const fileInputRef   = useRef(null)
  const typingTimeoutRef = useRef(null)
  const myTypingRef      = useRef(false)

  const [visitorId] = useState(() => {
    const key = `support_visitor_id_${SERVER}`
    let id = localStorage.getItem(key)
    if (!id) {
      id = userId || crypto.randomUUID()
      localStorage.setItem(key, id)
    }
    return id
  })

  const viewRef = useRef(view)
  const joinSessionRef = useRef(null)

  useEffect(() => { viewRef.current = view }, [view])

  const joinSession = useCallback((sid) => {
     if (!socketRef.current) return
     sessionRef.current = sid
     setActiveSessionId(sid)
     setAgentTyping(false)
     setMessages([])
     setSessionInfo(null)
     setReplyTo(null)
     setShowDropdown(false)
     socketRef.current.emit('visitor:join', { 
       sessionId: sid, 
       visitor: { name: visitorName || 'Visitor', userId: visitorId, page: location.href } 
     })
     setView('chat')
   }, [visitorName, visitorId])

  useEffect(() => { joinSessionRef.current = joinSession }, [joinSession])

  useEffect(() => {
    if (forceOpen) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setOpen(true)
    }
  }, [forceOpen])

  useEffect(() => {
    const socket = io(SERVER, { transports: ['websocket', 'polling'] })
    socketRef.current = socket

    socket.on('connect', () => {
      setConnected(true)
      socket.emit('visitor:list-sessions', { userId: visitorId })
    })
    socket.on('disconnect', () => { setConnected(false); setAgentTyping(false) })

    socket.on('visitor:sessions-list', (list) => {
      setSessionsList(list)
      setUnread(list.reduce((acc, s) => acc + (s.unread || 0), 0))
      
      setSessionsLoaded(prevLoaded => {
        if (!prevLoaded) {
          const active = list.find(s => s.status !== 'closed')
          if (active) {
            joinSessionRef.current?.(active.id)
          } else if (list.length > 0) {
            setView('dashboard')
          } else {
            setView('create')
          }
        }
        return true
      })
    })

    socket.on('visitor:session-created', (newSession) => {
      setIsCreating(false)
      joinSessionRef.current?.(newSession.id)
    })

    socket.on('session:history', ({ sessionId, messages: hist }) => {
      if (sessionId === sessionRef.current) setMessages(hist)
    })

    socket.on('session:update', (meta) => {
      if (meta.id === sessionRef.current) setSessionInfo(meta)
    })

    socket.on('agents:availability', (data) => setAgentsOnline(data))

    socket.on('message:new', ({ sessionId: sid, message }) => {
      if (sid === sessionRef.current) {
        setMessages(prev => [...prev, message])
        if (message.from === 'agent') {
          playNotificationSound()
          if (!openRef.current || viewRef.current !== 'chat') {
            socket.emit('visitor:list-sessions', { userId: visitorId })
          } else {
            socket.emit('session:seen', { sessionId: sid, role: 'visitor' })
          }
        }
      } else {
        if (message.from === 'agent') playNotificationSound()
        socket.emit('visitor:list-sessions', { userId: visitorId })
      }
    })

    socket.on('typing:status', ({ sessionId: sid, isTyping, from }) => {
      if (sid === sessionRef.current && from === 'agent') setAgentTyping(isTyping)
    })

    socket.on('session:seen', ({ sessionId: sid, role }) => {
      if (sid === sessionRef.current && role === 'agent') {
        setMessages(prev => prev.map(m => m.from === 'visitor' ? { ...m, seenByAgent: true } : m))
      }
    })

    return () => socket.disconnect()
  }, [visitorId])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, agentTyping])

  useEffect(() => {
    openRef.current = open
    if (open && socketRef.current && activeSessionId && view === 'chat') {
      socketRef.current.emit('session:seen', { sessionId: activeSessionId, role: 'visitor' })
    }
  }, [open, connected, activeSessionId, view])

  const autoCreateTicket = useCallback(() => {
    if (!socketRef.current || isCreating) return
    setIsCreating(true)
    socketRef.current.emit('visitor:create-session', {
      userId: visitorId,
      name: visitorName || 'Visitor',
      subject: 'Support Request',
      page: location.href
    })
  }, [visitorId, visitorName, isCreating])

  useEffect(() => {
    if (open && connected && sessionsLoaded && view === 'create' && !isCreating) {
      const active = sessionsList.find(s => s.status !== 'closed')
      if (!active) {
        autoCreateTicket()
      }
    }
  }, [open, connected, sessionsLoaded, view, sessionsList, isCreating, autoCreateTicket])

  const handleStartNewChat = () => {
    setView('create')
    setActiveSessionId(null)
    sessionRef.current = null
    setMessages([])
    setSessionInfo(null)
    setAgentTyping(false)
    setIsCreating(true)
    setReplyTo(null)
    if (socketRef.current) {
      socketRef.current.emit('visitor:create-session', {
        userId: visitorId,
        name: visitorName || 'Visitor',
        subject: 'Support Request',
        page: location.href
      })
    }
  }

  const handleClose = () => {
    setOpen(false)
    if (onClose) onClose()
  }

  const assignedAgent = sessionInfo?.assignedAgentName
  const isClosed      = sessionInfo?.status === 'closed'

  const statusText = () => {
    if (!connected)  return 'Connecting...'
    if (isClosed)    return 'Chat ended'
    if (assignedAgent) return `Speaking with ${assignedAgent}`
    if (agentsOnline.online > 0) return `${agentsOnline.online} agent(s) online`
    return 'We will reply shortly'
  }

  const handleInputChange = (val) => {
    setInput(val)
    if (!socketRef.current || !activeSessionId) return
    if (!myTypingRef.current) {
      myTypingRef.current = true
      socketRef.current.emit('typing:status', { sessionId: activeSessionId, isTyping: true, from: 'visitor' })
    }
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    typingTimeoutRef.current = setTimeout(() => {
      myTypingRef.current = false
      socketRef.current.emit('typing:status', { sessionId: activeSessionId, isTyping: false, from: 'visitor' })
    }, 2000)
  }

  const sendText = useCallback((e) => {
    e?.preventDefault()
    const body = input.trim()
    if (!body || !socketRef.current || !activeSessionId || isClosed) return
    if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current)
    myTypingRef.current = false
    socketRef.current.emit('typing:status', { sessionId: activeSessionId, isTyping: false, from: 'visitor' })
    
    const msgPayload = { from: 'visitor', body }
    if (replyTo) {
      msgPayload.replyTo = {
        id: replyTo.id,
        body: replyTo.body,
        from: replyTo.from,
        type: replyTo.type
      }
    }
    
    socketRef.current.emit('message:send', { sessionId: activeSessionId, message: msgPayload })
    setInput('')
    setReplyTo(null)
  }, [input, activeSessionId, isClosed, replyTo])

  const handleKeyDown = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendText() }
  }

  const handleFileChange = () => {
    const file = fileInputRef.current?.files[0]
    if (!file || !activeSessionId) return
    const reader = new FileReader()
    reader.onload = () => {
      const payload = {
        sessionId: activeSessionId, image: reader.result, filename: file.name, from: 'visitor'
      }
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

  const initials = (name) => (name?.[0] || 'S').toUpperCase()

  return (
    <>

      {open && (
        <div className={styles.window}>


          {view === 'create' && (
            <div className="d-flex flex-column h-100 bg-light">
              {/* Header */}
              <div className="d-flex justify-content-between align-items-center text-white px-3 py-3 shadow-sm" style={{ background: 'var(--gradient-brand)' }}>
                <div>
                  <h5 className="m-0 fw-bold fs-6">🎧 Live Support</h5>
                  <div className="fs-7 text-white-50 mt-0.5">
                    Connecting...
                  </div>
                </div>
                <button className="btn btn-close btn-close-white shadow-none" onClick={handleClose} aria-label="Close" />
              </div>


              <div className="flex-grow-1 d-flex flex-column justify-content-center align-items-center p-4 text-center bg-white">
                <div className="spinner-border text-primary mb-3" role="status" style={{ width: '2.5rem', height: '2.5rem' }}>
                  <span className="visually-hidden">Loading...</span>
                </div>
                <h6 className="fw-bold text-dark mb-1">Generating Support Ticket</h6>
                <p className="text-secondary fs-8 px-4 mb-0">
                  We are setting up a secure real-time session for you. Just a moment...
                </p>
              </div>
            </div>
          )}


          {view === 'dashboard' && (
            <div className="d-flex flex-column h-100 bg-light animate-fade-in">
              {/* Header */}
              <div className="d-flex justify-content-between align-items-center text-white px-3 py-3 shadow-sm" style={{ background: 'var(--gradient-brand)' }}>
                <div>
                  <h5 className="m-0 fw-bold fs-6">🎧 Support Desk</h5>
                  <div className="fs-7 text-white-50 mt-0.5">
                    Select a ticket to start chatting
                  </div>
                </div>
                <button className="btn btn-close btn-close-white shadow-none" onClick={handleClose} aria-label="Close" />
              </div>

              {/* Tickets List */}
              <div className="flex-grow-1 overflow-auto p-3 d-flex flex-column gap-2.5" style={{ background: '#f8fafc' }}>
                {sessionsList.length === 0 ? (
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center text-muted">
                    <div className="fs-2 mb-2">🎫</div>
                    <div className="fw-bold fs-7">No support tickets</div>
                    <div className="fs-8">Create a ticket to start chatting with us.</div>
                  </div>
                ) : (
                  sessionsList.map(ticket => {
                    let lastMsg = "No messages yet"
                    if (ticket.lastMessage) {
                      lastMsg = ticket.lastMessage.type === 'screenshot' ? '📷 Image attached' : ticket.lastMessage.body
                    }
                    const timeStr = new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                    
                    return (
                      <div 
                        key={ticket.id}
                        onClick={() => joinSession(ticket.id)}
                        className={`card border-0 p-3 rounded-3 shadow-sm ${styles.ticketCard}`}
                        style={{ cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: '6px' }}
                      >
                        <div className="d-flex justify-content-between align-items-center">
                          <span className="fw-bold fs-7 text-dark text-truncate" style={{ maxWidth: '70%' }}>
                            {ticket.subject}
                          </span>
                          <span className={`badge px-2 py-0.5 fs-9 rounded-pill ${
                            ticket.status === 'closed' ? 'bg-secondary text-white' :
                            ticket.status === 'active' ? 'bg-success text-white' :
                            'bg-warning text-dark'
                          }`}>
                            {ticket.status}
                          </span>
                        </div>
                        
                        <div className="d-flex justify-content-between align-items-center fs-8 text-secondary">
                          <span className="text-truncate" style={{ maxWidth: '80%' }}>
                            {lastMsg}
                          </span>
                          <span>{timeStr}</span>
                        </div>
                        
                        {ticket.unread > 0 && (
                          <div className="d-flex justify-content-end">
                            <span className="badge bg-danger rounded-pill px-1.5 py-0.5 text-white" style={{ fontSize: '9px' }}>
                              {ticket.unread} new
                            </span>
                          </div>
                        )}
                      </div>
                    )
                  })
                )}
              </div>

              {/* Footer */}
              <div className="p-3 bg-white border-top flex-shrink-0 d-flex">
                <button 
                  onClick={handleStartNewChat}
                  className="btn btn-primary w-100 py-2 fw-semibold rounded-3 fs-7"
                >
                  ➕ Start New Conversation
                </button>
              </div>
            </div>
          )}

          {view === 'chat' && (
            <div className="d-flex flex-column h-100 bg-light">
              {/* Header */}
              <div className="d-flex justify-content-between align-items-center text-white px-3 py-3 shadow-sm" style={{ background: 'var(--gradient-brand)' }}>
                <div className="d-flex align-items-center gap-2" style={{ minWidth: 0 }}>
                  {sessionsList.length > 0 && (
                    <button 
                      type="button"
                      onClick={() => {
                        setReplyTo(null)
                        setView('dashboard')
                        socketRef.current?.emit('visitor:list-sessions', { userId: visitorId })
                      }}
                      className="btn p-0 border-0 text-white bg-transparent me-1.5 d-flex align-items-center"
                      title="Back to tickets list"
                      style={{ cursor: 'pointer', outline: 'none' }}
                    >
                      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                        <line x1="19" y1="12" x2="5" y2="12"/>
                        <polyline points="12 19 5 12 12 5"/>
                      </svg>
                    </button>
                  )}
                  <div className="rounded-circle bg-white text-primary d-flex align-items-center justify-content-center fw-bold fs-7 flex-shrink-0" style={{ width: 32, height: 32 }}>
                    {sessionInfo?.handlingMode === 'ai' ? '🤖' : (assignedAgent ? initials(assignedAgent) : '🎧')}
                  </div>
                  <div style={{ minWidth: 0 }}>
                    <span className="fw-bold d-block fs-6 lh-sm text-truncate" style={{ maxWidth: 140 }}>
                      {sessionInfo?.handlingMode === 'ai' ? 'AI Support' : (assignedAgent || 'Support')}
                    </span>
                    <div className="d-flex align-items-center gap-1 fs-8 text-white-50 mt-0.5">
                      <span className={`status-dot ${connected && !isClosed ? 'online' : 'offline'}`} style={{ width: 6, height: 6 }} />
                      {sessionInfo?.handlingMode === 'ai' ? 'AI Assistant Online' : statusText()}
                    </div>
                  </div>
                </div>
                <div className="d-flex align-items-center gap-2 flex-shrink-0">
                  {sessionInfo?.handlingMode === 'ai' && !isClosed && (
                    <button 
                      type="button" 
                      onClick={() => socketRef.current?.emit('visitor:request-human', { sessionId: activeSessionId })}
                      className="btn btn-sm btn-light fs-8 py-1 px-2 fw-semibold d-flex align-items-center gap-1 shadow-sm"
                      style={{ color: '#0d6efd', fontSize: '11px' }}
                    >
                      👤 Talk to Human
                    </button>
                  )}
                  <button className="btn btn-close btn-close-white shadow-none" onClick={handleClose} aria-label="Close" />
                </div>
              </div>


              <div className="bg-white border-bottom px-3 py-2 fs-7 text-secondary position-relative">
                <div 
                  className="d-flex align-items-center justify-content-between" 
                  onClick={() => setShowDropdown(prev => !prev)}
                  style={{ cursor: 'pointer', userSelect: 'none' }}
                >
                  <div className="text-truncate" style={{ maxWidth: '90%' }}>
                    Ticket: <span className="fw-bold text-primary me-2">{sessionInfo?.ticketNumber || (activeSessionId ? `#TCK-${activeSessionId.slice(-5)}` : '')}</span>
                    <span className="text-muted mx-1.5">—</span>
                    <span className="fw-semibold text-dark ms-1">{sessionInfo?.subject || 'General Support'}</span>
                  </div>
                  <span className="text-muted fs-8 ms-1">
                    {showDropdown ? '▲' : '▼'}
                  </span>
                </div>
                
                {showDropdown && (
                  <div 
                    className="position-absolute start-0 end-0 bg-white border-bottom shadow-lg overflow-auto"
                    style={{ 
                      zIndex: 1000, 
                      maxHeight: '200px', 
                      top: '100%', 
                      borderTop: '1px solid #e2e8f0'
                    }}
                  >
                    {sessionsList.map(s => {
                      const isCurrent = s.id === activeSessionId
                      let lastMsg = "No messages yet"
                      if (s.lastMessage) {
                        lastMsg = s.lastMessage.type === 'screenshot' ? '📷 Image' : s.lastMessage.body
                      }
                      return (
                        <div
                          key={s.id}
                          onClick={() => {
                            joinSession(s.id)
                          }}
                          className={`px-3 py-2 border-bottom d-flex flex-column gap-0.5`}
                          style={{ 
                            cursor: 'pointer',
                            background: isCurrent ? '#f1f5f9' : '#ffffff',
                            transition: 'background 0.2s'
                          }}
                          onMouseEnter={(e) => e.currentTarget.style.background = '#f8fafc'}
                          onMouseLeave={(e) => e.currentTarget.style.background = isCurrent ? '#f1f5f9' : '#ffffff'}
                        >
                          <div className="d-flex justify-content-between align-items-center">
                            <span className={`fw-bold fs-7 ${isCurrent ? 'text-primary' : 'text-dark'}`}>
                              {s.ticketNumber}
                            </span>
                            <span className={`badge px-1.5 py-0.5 fs-9 rounded-pill ${
                              s.status === 'closed' ? 'bg-secondary text-white' : 'bg-success text-white'
                            }`}>
                              {s.status}
                            </span>
                          </div>
                          <div className="text-muted fs-8 text-truncate">
                            {s.subject}
                          </div>
                          <div className="text-secondary fs-9 text-truncate">
                            {lastMsg}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </div>


              <div className={styles.messagesFeed}>
                {messages.length === 0 && (
                  <div className="d-flex flex-column align-items-center justify-content-center h-100 text-center py-4">
                    <div className="fs-6 fw-bold text-secondary mb-1">How can we help you?</div>
                    <div className="fs-7 text-tertiary">Send a message to start.</div>
                  </div>
                )}
                {messages.map(m => (
                  <ChatMessage
                    key={m.id}
                    message={m}
                    isOwnMessage={m.from === 'visitor'}
                    onReply={!isClosed ? setReplyTo : null}
                  />
                ))}
                

                {isClosed && (
                  <div className="alert alert-warning border-0 shadow-sm text-center py-2.5 px-3 mx-2 my-3 fs-7 rounded-3" role="alert">
                    🔒 Ticket {sessionInfo?.ticketNumber || (activeSessionId ? `#TCK-${activeSessionId.slice(-5)}` : '')} has ended.
                    <button type="button" className="btn btn-link btn-sm p-0 ms-1 fw-bold align-baseline" onClick={handleStartNewChat}>
                      Start a new chat
                    </button>
                  </div>
                )}
                
                <div ref={messagesEndRef} />
              </div>


              {agentTyping && (
                <div className={styles.typingIndicator}>
                  <div className={styles.typingBubble}>
                    <span /><span /><span />
                  </div>
                  <span className={styles.typingText}>Agent is typing...</span>
                </div>
              )}


              {!isClosed && (
                <form className="p-2 bg-white border-top" onSubmit={sendText}>
                  {replyTo && (
                    <div className={styles.replyPreviewBar}>
                      <div className={styles.replyPreviewBarContent}>
                        <span className={styles.replyPreviewBarSender}>
                          Replying to {replyTo.from === 'visitor' ? 'You' : (replyTo.agentName || 'Support')}
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
                    {/* Attachment Label */}
                    <label className="btn btn-outline-secondary border-secondary-subtle d-flex align-items-center justify-content-center px-2.5" style={{ cursor: 'pointer' }} title="Attach image">
                      <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileChange} hidden />
                      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/>
                      </svg>
                    </label>

                    <input type="text" className="form-control border-secondary-subtle fs-7 shadow-none"
                      value={input}
                      onChange={e => handleInputChange(e.target.value)}
                      onKeyDown={handleKeyDown}
                      placeholder="Type a message..."
                      autoComplete="off"
                    />

                    <button type="submit" className="btn btn-primary fs-7 fw-semibold shadow-none px-3" disabled={!input.trim()}>
                      Send
                    </button>
                  </div>
                </form>
              )}
            </div>
          )}
        </div>
      )}


      <button
        className={styles.fab}
        onClick={toggleOpen}
        aria-label="Open chat"
      >
        {open
          ? <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          : <svg width="22" height="22" viewBox="0 0 24 24" fill="currentColor"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
        }
        {!open && unread > 0 && (
          <span className={styles.fabBadge}>{unread}</span>
        )}
      </button>
    </>
  )

  function toggleOpen() {
    setOpen(o => {
      const next = !o
      if (!next && onClose) onClose()
      if (next) setUnread(0)
      return next
    })
  }
}
