(function () {
  const currentScript = document.currentScript;
  const baseUrl = new URL(currentScript.src).origin;
  const dataset = currentScript?.dataset || {};
  const config = {
    title: dataset.title || "Support Desk",
    subtitle: dataset.subtitle || "Replies in minutes",
    visitorName: dataset.visitorName || "Customer",
    userId: dataset.userId || "",
    brandColor: normalizeBrandColor(dataset.brandColor || "#2563eb")
  };
  const titleText = escapeHtml(config.title);
  const subtitleText = escapeHtml(config.subtitle);

  let audioCtx = null;
  function playNotificationSound() {
    try {
      if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
      }
      if (audioCtx.state === 'suspended') {
        audioCtx.resume();
      }
      const osc = audioCtx.createOscillator();
      const gain = audioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(660, audioCtx.currentTime);
      osc.frequency.exponentialRampToValueAtTime(880, audioCtx.currentTime + 0.1);
      gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.2);
      osc.connect(gain);
      gain.connect(audioCtx.destination);
      osc.start();
      osc.stop(audioCtx.currentTime + 0.2);
    } catch (e) {
      console.warn('AudioContext sound failed:', e);
    }
  }

  const resumeAudio = () => {
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume();
    }
  };
  document.addEventListener('click', resumeAudio, { once: true });
  document.addEventListener('keydown', resumeAudio, { once: true });
  document.addEventListener('touchstart', resumeAudio, { once: true });

  if (!document.getElementById("lcw-font")) {
    const link = document.createElement("link");
    link.id = "lcw-font";
    link.rel = "stylesheet";
    link.href = "https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap";
    document.head.appendChild(link);
  }

  if (!document.getElementById("lcw-theme")) {
    const link = document.createElement("link");
    link.id = "lcw-theme";
    link.rel = "stylesheet";
    link.href = `${baseUrl}/widget/support-widget.css`;
    document.head.appendChild(link);
  }

  const root = document.createElement("div");
  root.style.setProperty('--lcw-brand-color', config.brandColor);
  root.innerHTML = `
    <button class="lcw-fab" type="button" aria-label="Open support chat">
      <svg viewBox="0 0 24 24"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>
    </button>
    <section class="lcw-window lcw-hidden" aria-label="Support chat">
      <header class="lcw-header">
        <div class="lcw-header-left">
          <button class="lcw-header-back-btn lcw-hidden" type="button" aria-label="Go back">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/></svg>
          </button>
          <div class="lcw-avatar">🎧</div>
          <div class="lcw-header-title-wrap">
            <strong>${titleText}</strong>
            <span>${subtitleText}</span>
          </div>
        </div>
        <div style="display: flex; align-items: center; gap: 8px;">
          <button class="lcw-btn-escalate lcw-hidden" type="button" title="Talk to a Human Agent" style="background: rgba(255,255,255,0.2); border: none; color: white; padding: 4px 8px; border-radius: 4px; font-size: 11px; font-weight: 600; cursor: pointer; display: flex; align-items: center; gap: 4px; transition: background 0.2s;">
            👤 Talk to Human
          </button>
          <button class="lcw-close" type="button" aria-label="Close support chat">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
          </button>
        </div>
      </header>
      
      <!-- Dashboard panel -->
      <div class="lcw-panel lcw-panel-dashboard">
        <div class="lcw-dashboard-list">
          <!-- Dynamically populated ticket items -->
        </div>
        <div class="lcw-dashboard-footer">
          <button class="lcw-btn-primary lcw-btn-go-create" type="button">➕ Start New Conversation</button>
        </div>
      </div>

      <!-- Create Ticket panel -->
      <div class="lcw-panel lcw-panel-create lcw-hidden lcw-create-loader-panel">
        <div class="lcw-spinner"></div>
        <div class="lcw-create-loader-title">Generating Support Ticket</div>
        <div class="lcw-create-loader-desc">We are setting up a secure real-time session for you. Just a moment...</div>
        
        <!-- Hidden elements to keep old query selectors working -->
        <form class="lcw-form-panel lcw-hidden-form">
          <input type="text" class="lcw-input lcw-input-name" value="${config.visitorName}">
          <input type="text" class="lcw-input lcw-input-subject">
          <button class="lcw-btn-outline lcw-btn-cancel-create" type="button"></button>
        </form>
      </div>

      <!-- Chat Feed panel -->
      <div class="lcw-panel lcw-panel-chat lcw-hidden">
        <div class="lcw-ticket-subject-banner lcw-subject-banner" style="position: relative; cursor: pointer; user-select: none; display: flex; justify-content: space-between; align-items: center; z-index: 1001;">
          <span class="lcw-banner-text">Ticket: General Support</span>
          <span class="lcw-banner-arrow" style="font-size: 10px; color: #64748b; margin-left: 6px;">▼</span>
          <div class="lcw-banner-dropdown lcw-hidden" style="position: absolute; top: 100%; left: 0; right: 0; background: #ffffff; border-bottom: 1px solid #e2e8f0; box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1); max-height: 200px; overflow-y: auto; z-index: 1002;">
          </div>
        </div>
        <div class="lcw-messages">
          <div class="lcw-empty">
            <div class="lcw-empty-title">How can we help you?</div>
            <div class="lcw-empty-desc">Send a message to start.</div>
          </div>
        </div>
        <div class="lcw-typing-indicator lcw-hidden">
          <div class="lcw-typing-bubble">
            <span></span><span></span><span></span>
          </div>
          <span class="lcw-typing-text">Agent is typing...</span>
        </div>
        <form class="lcw-composer">
          <div class="lcw-composer-row">
            <input type="text" class="lcw-input" autocomplete="off" placeholder="Type a message...">
          </div>
          <div class="lcw-composer-actions">
            <button class="lcw-btn-icon lcw-capture-btn" type="button" title="Capture Screen">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="12" cy="12" r="3"/></svg>
            </button>
            <label class="lcw-btn-icon" title="Attach Image">
              <input type="file" class="lcw-file-input" accept="image/*">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"/></svg>
            </label>
            <button type="submit" class="lcw-btn-send" disabled>Send</button>
          </div>
        </form>
      </div>
    </section>
  `;
  document.body.append(root);

  const fab = root.querySelector(".lcw-fab");
  const chatWindow = root.querySelector(".lcw-window");
  const closeButton = root.querySelector(".lcw-close");
  const escalateBtn = root.querySelector(".lcw-btn-escalate");
  const headerTitle = root.querySelector(".lcw-header strong");
  const headerSubtitle = root.querySelector(".lcw-header-left span");
  const headerAvatar = root.querySelector(".lcw-avatar");
  const headerBackBtn = root.querySelector(".lcw-header-back-btn");
  
  const dashboardPanel = root.querySelector(".lcw-panel-dashboard");
  const dashboardList = root.querySelector(".lcw-dashboard-list");
  const goCreateBtn = root.querySelector(".lcw-btn-go-create");

  const createPanel = root.querySelector(".lcw-panel-create");
  const createForm = createPanel.querySelector("form");
  const cancelCreateBtn = createPanel.querySelector(".lcw-btn-cancel-create");

  const chatPanel = root.querySelector(".lcw-panel-chat");
  const subjectBanner = chatPanel.querySelector(".lcw-ticket-subject-banner");
  const messagesEl = chatPanel.querySelector(".lcw-messages");
  const form = chatPanel.querySelector(".lcw-composer");
  const input = chatPanel.querySelector(".lcw-input");
  const fileInput = chatPanel.querySelector(".lcw-file-input");
  const captureButton = chatPanel.querySelector(".lcw-capture-btn");
  const sendBtn = chatPanel.querySelector(".lcw-btn-send");
  const typingIndicatorEl = chatPanel.querySelector(".lcw-typing-indicator");

  let view = "dashboard"; 
  let activeSessionId = null;
  let sessionsList = [];
  let sessionInfo = null;
  let agentsOnline = { online: 0, total: 0 };
  let closedBanner = null;
  let typingTimeout = null;
  let myTyping = false;
  let isCreating = false;
  let sessionsLoaded = false;
  let widgetReplyTo = null;

  loadSocketIo(baseUrl, startChat);

  function startChat() {
    const socket = window.io(baseUrl);
    const visitorIdKey = `supportVisitorId:${baseUrl}`;
    let visitorId = localStorage.getItem(visitorIdKey);
    if (!visitorId) {
      visitorId = config.userId || createVisitorId();
      localStorage.setItem(visitorIdKey, visitorId);
    }
    const actualVisitorId = config.userId || visitorId;

    socket.emit("visitor:list-sessions", { userId: actualVisitorId });

    function handleAutoFlow() {
      if (chatWindow.classList.contains("lcw-hidden")) return;
      if (!socket.connected || !sessionsLoaded) {
        switchView("create");
        return;
      }
      if (view === "chat" || isCreating) return;

      const active = sessionsList.find(s => s.status !== "closed");
      if (active) {
        joinSession(active.id);
      } else if (sessionsList.length > 0) {
        switchView("dashboard");
      } else {
        createNewTicketFlow();
      }
    }

    function createNewTicketFlow() {
      if (isCreating || !socket.connected) return;
      isCreating = true;
      setWidgetReplyTo(null);
      switchView("create");
      const name = config.visitorName || "Visitor";
      const subject = "Support Request";
      
      const existingClosed = chatPanel.querySelector(".lcw-composer-closed");
      if (existingClosed) existingClosed.remove();
      const existingComposer = chatPanel.querySelector(".lcw-composer");
      if (existingComposer) existingComposer.style.display = "";
      if (closedBanner) {
        closedBanner.remove();
        closedBanner = null;
      }
      
      socket.emit("visitor:create-session", {
        userId: actualVisitorId,
        name,
        subject,
        page: location.href
      });
    }

    function startNewChatFlow() {
      activeSessionId = null;
      sessionInfo = null;
      isCreating = false;
      
      const existingClosed = chatPanel.querySelector(".lcw-composer-closed");
      if (existingClosed) existingClosed.remove();
      const existingComposer = chatPanel.querySelector(".lcw-composer");
      if (existingComposer) existingComposer.style.display = "";
      if (closedBanner) {
        closedBanner.remove();
        closedBanner = null;
      }
      
      createNewTicketFlow();
    }

    fab.addEventListener("click", () => {
      chatWindow.classList.toggle("lcw-hidden");
      if (!chatWindow.classList.contains("lcw-hidden")) {
        if (view === "chat" && activeSessionId) {
          input.focus();
          scrollToBottom();
          socket.emit("session:seen", { sessionId: activeSessionId, role: "visitor" });
        } else {
          handleAutoFlow();
        }
      } else {
        if (myTyping && activeSessionId) {
          myTyping = false;
          if (typingTimeout) clearTimeout(typingTimeout);
          socket.emit("typing:status", { sessionId: activeSessionId, isTyping: false, from: "visitor" });
        }
      }
    });
    
    closeButton.addEventListener("click", () => {
      chatWindow.classList.add("lcw-hidden");
      if (myTyping && activeSessionId) {
        myTyping = false;
        if (typingTimeout) clearTimeout(typingTimeout);
        socket.emit("typing:status", { sessionId: activeSessionId, isTyping: false, from: "visitor" });
      }
    });

    escalateBtn.addEventListener("click", () => {
      if (!activeSessionId) return;
      socket.emit("visitor:request-human", { sessionId: activeSessionId });
    });

    headerBackBtn.addEventListener("click", () => {
      setWidgetReplyTo(null);
      switchView("dashboard");
      socket.emit("visitor:list-sessions", { userId: actualVisitorId });
    });

    subjectBanner.addEventListener("click", (e) => {
      const dropdown = subjectBanner.querySelector(".lcw-banner-dropdown");
      if (!dropdown) return;
      if (dropdown.contains(e.target)) return;
      
      const isHidden = dropdown.classList.contains("lcw-hidden");
      if (isHidden) {
        renderBannerDropdownList(dropdown);
        dropdown.classList.remove("lcw-hidden");
        const arrow = subjectBanner.querySelector(".lcw-banner-arrow");
        if (arrow) arrow.textContent = "▲";
      } else {
        dropdown.classList.add("lcw-hidden");
        const arrow = subjectBanner.querySelector(".lcw-banner-arrow");
        if (arrow) arrow.textContent = "▼";
      }
    });

    function renderBannerDropdownList(dropdown) {
      dropdown.innerHTML = "";
      if (sessionsList.length === 0) {
        dropdown.innerHTML = `<div style="padding: 12px; text-align: center; color: #94a3b8; font-size: 11px;">No tickets</div>`;
        return;
      }
      
      sessionsList.forEach(s => {
        const isCurrent = s.id === activeSessionId;
        const item = document.createElement("div");
        item.style.padding = "8px 12px";
        item.style.borderBottom = "1px solid #f1f5f9";
        item.style.background = isCurrent ? "#f1f5f9" : "#ffffff";
        item.style.cursor = "pointer";
        item.style.display = "flex";
        item.style.flexDirection = "column";
        item.style.gap = "2px";
        item.style.textAlign = "left";
        
        let lastMsg = "No messages yet";
        if (s.lastMessage) {
          lastMsg = s.lastMessage.type === "screenshot" ? "📷 Image" : s.lastMessage.body;
        }
        
        item.innerHTML = `
          <div style="display: flex; justify-content: space-between; align-items: center;">
            <span style="font-weight: 700; font-size: 12px; color: ${isCurrent ? "var(--lcw-brand-color)" : "#0f172a"};">${escapeHtml(s.ticketNumber)}</span>
            <span class="lcw-ticket-status lcw-status-${s.status}" style="font-size: 9px; padding: 2px 6px; border-radius: 99px; font-weight: 600; text-transform: uppercase;">${s.status}</span>
          </div>
          <div style="font-size: 11px; color: #475569; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(s.subject)}</div>
          <div style="font-size: 10px; color: #64748b; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${escapeHtml(lastMsg)}</div>
        `;
        
        item.addEventListener("click", (e) => {
          e.stopPropagation();
          joinSession(s.id);
          dropdown.classList.add("lcw-hidden");
          const arrow = subjectBanner.querySelector(".lcw-banner-arrow");
          if (arrow) arrow.textContent = "▼";
        });
        
        item.addEventListener("mouseenter", () => {
          item.style.background = "#f8fafc";
        });
        item.addEventListener("mouseleave", () => {
          item.style.background = isCurrent ? "#f1f5f9" : "#ffffff";
        });
        
        dropdown.append(item);
      });
    }
    
    goCreateBtn.addEventListener("click", () => {
      createNewTicketFlow();
    });
    
    cancelCreateBtn.addEventListener("click", () => {
      if (sessionsList.length > 0) {
        switchView("dashboard");
      }
    });
    createForm.addEventListener("submit", (e) => e.preventDefault());

    input.addEventListener("input", () => {
      sendBtn.disabled = !input.value.trim();
      if (!activeSessionId) return;

      if (!myTyping) {
        myTyping = true;
        socket.emit("typing:status", { sessionId: activeSessionId, isTyping: true, from: "visitor" });
      }

      if (typingTimeout) clearTimeout(typingTimeout);
      typingTimeout = setTimeout(() => {
        myTyping = false;
        socket.emit("typing:status", { sessionId: activeSessionId, isTyping: false, from: "visitor" });
      }, 2000);
    });

    form.addEventListener("submit", (event) => {
      event.preventDefault();
      const body = input.value.trim();
      if (!body || !activeSessionId) return;

      if (typingTimeout) clearTimeout(typingTimeout);
      myTyping = false;
      socket.emit("typing:status", { sessionId: activeSessionId, isTyping: false, from: "visitor" });

      const msgPayload = { from: "visitor", body };
      if (widgetReplyTo) {
        msgPayload.replyTo = {
          id: widgetReplyTo.id,
          body: widgetReplyTo.body,
          from: widgetReplyTo.from,
          type: widgetReplyTo.type
        };
      }

      socket.emit("message:send", { sessionId: activeSessionId, message: msgPayload });
      input.value = "";
      sendBtn.disabled = true;
      setWidgetReplyTo(null);
    });

    fileInput.addEventListener("change", async () => {
      const file = fileInput.files[0];
      if (!file || !activeSessionId) return;
      const image = await readFileAsDataUrl(file);
      const payload = {
        sessionId: activeSessionId,
        image,
        filename: file.name,
        from: "visitor"
      };
      if (widgetReplyTo) {
        payload.replyTo = {
          id: widgetReplyTo.id,
          body: widgetReplyTo.body,
          from: widgetReplyTo.from,
          type: widgetReplyTo.type
        };
      }
      socket.emit("screenshot:send", payload);
      fileInput.value = "";
      setWidgetReplyTo(null);
    });

    captureButton.addEventListener("click", async () => {
      if (!navigator.mediaDevices?.getDisplayMedia) {
        alert("Screen capture is not supported in this browser. Please attach an image instead.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getDisplayMedia({ video: true });
        const image = await captureFrame(stream);
        const payload = {
          sessionId: activeSessionId,
          image,
          filename: "screen-capture.png",
          from: "visitor"
        };
        if (widgetReplyTo) {
          payload.replyTo = {
            id: widgetReplyTo.id,
            body: widgetReplyTo.body,
            from: widgetReplyTo.from,
            type: widgetReplyTo.type
          };
        }
        socket.emit("screenshot:send", payload);
        setWidgetReplyTo(null);
      } catch (error) {
        if (error.name !== "NotAllowedError") {
          alert("Could not capture the screen. Please attach an image instead.");
        }
      }
    });

    socket.on("visitor:sessions-list", (list) => {
      sessionsList = list;
      sessionsLoaded = true;
      renderTicketsList();
      
      const totalUnread = list.reduce((acc, s) => acc + (s.unread || 0), 0);
      updateFabBadge(totalUnread);

      if (!chatWindow.classList.contains("lcw-hidden")) {
        handleAutoFlow();
      }
    });

    socket.on("visitor:session-created", (newSession) => {
      isCreating = false;
      joinSession(newSession.id);
    });

    socket.on("session:history", ({ sessionId, messages }) => {
      if (sessionId === activeSessionId) {
        renderMessages(messages);
      }
    });

    socket.on("session:update", (meta) => {
      if (meta.id === activeSessionId) {
        sessionInfo = meta;
        updateHeader();
      }
    });

    socket.on("agents:availability", (data) => {
      agentsOnline = data;
      updateHeaderStatus();
    });

    socket.on("message:new", ({ sessionId: incomingSessionId, message }) => {
      if (incomingSessionId === activeSessionId) {
        appendMessage(message);
        if (message.from === "agent") {
          playNotificationSound();
          if (!chatWindow.classList.contains("lcw-hidden")) {
            socket.emit("session:seen", { sessionId: activeSessionId, role: "visitor" });
          }
        }
      } else {
        if (message.from === "agent") {
          playNotificationSound();
        }
        socket.emit("visitor:list-sessions", { userId: actualVisitorId });
      }
    });

    socket.on("session:seen", ({ sessionId: incomingSessionId, role }) => {
      if (incomingSessionId === activeSessionId && role === "agent") {
        const ticks = messagesEl.querySelectorAll(".lcw-msg-tick");
        ticks.forEach(tick => {
          tick.textContent = "✓✓";
          tick.classList.add("seen");
        });
      }
    });

    socket.on("typing:status", ({ sessionId: incomingSessionId, isTyping, from }) => {
      if (incomingSessionId === activeSessionId && from === "agent") {
        if (isTyping) {
          typingIndicatorEl.classList.remove("lcw-hidden");
          scrollToBottom();
        } else {
          typingIndicatorEl.classList.add("lcw-hidden");
        }
      }
    });

    socket.on("disconnect", () => {
      typingIndicatorEl.classList.add("lcw-hidden");
      headerSubtitle.textContent = "Connecting...";
      headerSubtitle.className = "lcw-connecting";
    });

    function switchView(newView) {
      view = newView;
      dashboardPanel.classList.add("lcw-hidden");
      createPanel.classList.add("lcw-hidden");
      chatPanel.classList.add("lcw-hidden");
      headerBackBtn.classList.add("lcw-hidden");
      headerAvatar.classList.remove("lcw-hidden");

      if (newView === "dashboard") {
        dashboardPanel.classList.remove("lcw-hidden");
        headerTitle.textContent = config.title;
        headerAvatar.textContent = "🎧";
        activeSessionId = null;
        updateHeaderStatus();
      } else if (newView === "create") {
        createPanel.classList.remove("lcw-hidden");
        headerAvatar.classList.remove("lcw-hidden");
        headerTitle.textContent = config.title;
        headerSubtitle.textContent = "Connecting...";
        headerSubtitle.className = "lcw-connecting";
      } else if (newView === "chat") {
        chatPanel.classList.remove("lcw-hidden");
        if (sessionsList.length > 0) {
          headerBackBtn.classList.remove("lcw-hidden");
        }
        updateHeader();
        scrollToBottom();
      }
    }

    function setWidgetReplyTo(msg) {
      widgetReplyTo = msg;
      if (msg) {
        let replyBar = chatPanel.querySelector(".lcw-composer-reply-bar");
        if (!replyBar) {
          replyBar = document.createElement("div");
          replyBar.className = "lcw-composer-reply-bar";
          const composerRow = form.querySelector(".lcw-composer-row");
          form.insertBefore(replyBar, composerRow);
        }
        
        const sender = msg.from === 'visitor' ? 'You' : 'Support';
        const bodyText = msg.type === 'screenshot' ? '📷 Image' : msg.body;
        
        replyBar.innerHTML = `
          <div class="lcw-reply-bar-content">
            <span class="lcw-reply-bar-sender">Replying to ${sender}</span>
            <span class="lcw-reply-bar-text">${escapeHtml(bodyText)}</span>
          </div>
          <button type="button" class="lcw-reply-bar-close">&times;</button>
        `;
        
        replyBar.querySelector(".lcw-reply-bar-close").addEventListener("click", () => {
          setWidgetReplyTo(null);
        });
        
        input.focus();
      } else {
        const replyBar = chatPanel.querySelector(".lcw-composer-reply-bar");
        if (replyBar) replyBar.remove();
      }
    }

    function joinSession(sid) {
      activeSessionId = sid;
      sessionInfo = null;
      setWidgetReplyTo(null);
      messagesEl.innerHTML = `
        <div class="lcw-empty">
          <div class="lcw-empty-title">Loading history...</div>
        </div>
      `;
      
      const sessionObj = sessionsList.find(s => s.id === sid);
      const ticketNum = sessionObj?.ticketNumber || (sid ? `#TCK-${sid.slice(-5)}` : '');
      const bannerText = subjectBanner.querySelector(".lcw-banner-text");
      if (bannerText) {
        bannerText.textContent = `Ticket: ${ticketNum}  —  ${sessionObj ? sessionObj.subject : "Support Request"}`;
      } else {
        subjectBanner.textContent = `Ticket: ${ticketNum}  —  ${sessionObj ? sessionObj.subject : "Support Request"}`;
      }
      
      const dropdown = subjectBanner.querySelector(".lcw-banner-dropdown");
      if (dropdown) {
        dropdown.classList.add("lcw-hidden");
        const arrow = subjectBanner.querySelector(".lcw-banner-arrow");
        if (arrow) arrow.textContent = "▼";
      }

      socket.emit("visitor:join", {
        sessionId: sid,
        visitor: {
          name: config.visitorName || "Visitor",
          userId: actualVisitorId,
          page: location.href,
          userAgent: navigator.userAgent
        }
      });
      switchView("chat");
    }

    function renderTicketsList() {
      dashboardList.innerHTML = "";
      if (sessionsList.length === 0) {
        dashboardList.innerHTML = `
          <div class="lcw-empty" style="padding: 40px 10px;">
            <div class="lcw-empty-icon" style="font-size:32px;">🎫</div>
            <div class="lcw-empty-title">No support tickets</div>
            <div class="lcw-empty-desc">Create a support ticket to start chatting with us.</div>
          </div>
        `;
        return;
      }

      sessionsList.forEach(ticket => {
        const card = document.createElement("div");
        card.className = "lcw-ticket-card";
        
        let lastMsg = "No messages yet";
        if (ticket.lastMessage) {
          lastMsg = ticket.lastMessage.type === "screenshot" ? "Image attached" : ticket.lastMessage.body;
        }

        const dateStr = new Date(ticket.updatedAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        card.innerHTML = `
          <div class="lcw-ticket-top">
            <span class="lcw-ticket-subject">${escapeHtml(ticket.subject)}</span>
            <span class="lcw-ticket-status lcw-status-${ticket.status}">${ticket.status}</span>
          </div>
          <div class="lcw-ticket-bottom">
            <span class="lcw-ticket-preview">${escapeHtml(lastMsg)}</span>
            <span>${dateStr}</span>
          </div>
          ${ticket.unread > 0 ? `<div style="display:flex; justify-content:flex-end; margin-top:2px;"><span class="lcw-ticket-badge-unread">${ticket.unread} new</span></div>` : ''}
        `;

        card.addEventListener("click", () => {
          joinSession(ticket.id);
        });

        dashboardList.append(card);
      });
    }

    function updateFabBadge(count) {
      let badge = fab.querySelector(".lcw-fab-badge");
      if (count > 0) {
        if (!badge) {
          badge = document.createElement("span");
          badge.className = "lcw-fab-badge";
          fab.append(badge);
        }
        badge.textContent = count;
      } else if (badge) {
        badge.remove();
      }
    }

    function updateHeaderStatus() {
      headerSubtitle.classList.remove("lcw-online", "lcw-away", "lcw-busy", "lcw-offline", "lcw-connecting");
      if (!socket.connected) {
        headerSubtitle.textContent = "Connecting...";
        headerSubtitle.className = "lcw-connecting";
      } else if (agentsOnline.online > 0) {
        headerSubtitle.textContent = `${agentsOnline.online} Agent(s) Available`;
        headerSubtitle.className = "lcw-online";
      } else {
        headerSubtitle.textContent = "Replies in minutes";
        headerSubtitle.className = "lcw-offline";
      }
    }

    function updateHeader() {
      const assigned = sessionInfo?.assignedAgentName;
      const assignedStatus = sessionInfo?.assignedAgentStatus || "offline";
      const isClosed = sessionInfo?.status === "closed";
      const isAi = sessionInfo?.handlingMode === "ai";

      if (isAi && !isClosed) {
        headerTitle.textContent = "AI Support";
        headerAvatar.textContent = "🤖";
        headerSubtitle.textContent = "AI Assistant Online";
        headerSubtitle.className = "lcw-online";
        escalateBtn.classList.remove("lcw-hidden");
      } else {
        headerTitle.textContent = assigned || config.title;
        headerAvatar.textContent = assigned ? assigned[0].toUpperCase() : "🎧";
        escalateBtn.classList.add("lcw-hidden");

        headerSubtitle.classList.remove("lcw-online", "lcw-away", "lcw-busy", "lcw-offline", "lcw-connecting");

        if (!socket.connected) {
          headerSubtitle.textContent = "Connecting...";
          headerSubtitle.className = "lcw-connecting";
        } else if (isClosed) {
          headerSubtitle.textContent = "Chat ended";
          headerSubtitle.className = "lcw-offline";
        } else if (assigned) {
          const statusStr = assignedStatus.charAt(0).toUpperCase() + assignedStatus.slice(1);
          headerSubtitle.textContent = `Chatting with ${assigned} (${statusStr})`;
          headerSubtitle.className = `lcw-${assignedStatus}`;
        } else {
          updateHeaderStatus();
        }
      }

      if (isClosed) {
        if (!closedBanner) {
          closedBanner = document.createElement("div");
          closedBanner.className = "lcw-closed-banner";
          closedBanner.innerHTML = `🔒 Ticket ${sessionInfo?.ticketNumber || (activeSessionId ? `#TCK-${activeSessionId.slice(-5)}` : '')} has ended. <a href="#" class="lcw-start-new-link" style="color: ${config.brandColor}; font-weight: 700; text-decoration: underline; margin-left: 4px;">Start a new chat</a>`;
          chatPanel.insertBefore(closedBanner, messagesEl);

          closedBanner.querySelector(".lcw-start-new-link")?.addEventListener("click", (e) => {
            e.preventDefault();
            startNewChatFlow();
          });
        }
        const existingComposer = chatPanel.querySelector(".lcw-composer");
        const existingClosed = chatPanel.querySelector(".lcw-composer-closed");
        if (existingComposer && !existingClosed) {
          existingComposer.style.display = "none";
          const closedMsg = document.createElement("div");
          closedMsg.className = "lcw-composer-closed";
          closedMsg.innerHTML = `🔒 Chat ended &mdash; you cannot send messages`;
          chatPanel.appendChild(closedMsg);
        }
      } else {
        const existingClosed = chatPanel.querySelector(".lcw-composer-closed");
        if (existingClosed) existingClosed.remove();
        const existingComposer = chatPanel.querySelector(".lcw-composer");
        if (existingComposer) existingComposer.style.display = "";
        if (closedBanner) {
          closedBanner.remove();
          closedBanner = null;
        }
      }
    }
  }

  function loadSocketIo(origin, callback) {
    if (window.io) {
      callback();
      return;
    }
    const script = document.createElement("script");
    script.src = `${origin}/socket.io/socket.io.js`;
    script.onload = callback;
    document.head.append(script);
  }

  function readFileAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  function captureFrame(stream) {
    return new Promise((resolve) => {
      const video = document.createElement("video");
      video.srcObject = stream;
      video.onloadedmetadata = () => {
        video.play();
        const canvas = document.createElement("canvas");
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        canvas.getContext("2d").drawImage(video, 0, 0, canvas.width, canvas.height);
        stream.getTracks().forEach((track) => track.stop());
        resolve(canvas.toDataURL("image/png"));
      };
    });
  }

  function renderMessages(messages) {
    const emptyEl = messagesEl.querySelector(".lcw-empty");
    if (messages.length > 0 && emptyEl) {
      emptyEl.remove();
    }
    messagesEl.innerHTML = "";
    messages.forEach(appendMessage);
  }

  function appendMessage(message) {
    const emptyEl = messagesEl.querySelector(".lcw-empty");
    if (emptyEl) emptyEl.remove();

    if (message.from === "system" || message.type === "system") {
      const sys = document.createElement("div");
      sys.className = "lcw-system-msg";
      sys.textContent = message.body;
      messagesEl.append(sys);
      scrollToBottom();
      return;
    }

    const isVisitor = message.from === 'visitor';
    const isAgent = message.from === 'agent';

    const wrap = document.createElement("div");
    wrap.className = `lcw-msg-wrap ${isVisitor ? 'visitor' : ''}`;
    wrap.id = `lcw-msg-${message.id}`;

    const avatar = document.createElement("div");
    avatar.className = "lcw-msg-avatar";
    const label = isAgent && message.agentName ? message.agentName : isVisitor ? "C" : "S";
    avatar.textContent = label[0].toUpperCase();

    const bubble = document.createElement("div");
    bubble.className = `lcw-message ${isVisitor ? 'visitor' : 'agent'}`;

    if (message.replyTo && message.replyTo.id) {
      const replyPreview = document.createElement("div");
      replyPreview.className = "lcw-msg-reply-preview";
      replyPreview.innerHTML = `
        <div class="lcw-msg-reply-preview-sender">${message.replyTo.from === 'visitor' ? 'You' : 'Support'}</div>
        <div class="lcw-msg-reply-preview-text">${message.replyTo.type === 'screenshot' ? '📷 Image' : escapeHtml(message.replyTo.body)}</div>
      `;
      replyPreview.addEventListener("click", () => {
        const el = messagesEl.querySelector(`#lcw-msg-${message.replyTo.id}`);
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' });
          const targetBubble = el.querySelector(".lcw-message");
          if (targetBubble) {
            targetBubble.classList.add("lcw-msg-flash");
            setTimeout(() => targetBubble.classList.remove("lcw-msg-flash"), 1500);
          }
        }
      });
      bubble.append(replyPreview);
    }

    if (isAgent && message.agentName) {
      const nameEl = document.createElement("span");
      nameEl.className = "lcw-msg-agent-name";
      nameEl.textContent = message.agentName;
      bubble.append(nameEl);
    }

    if (message.type === "screenshot") {
      const image = document.createElement("img");
      image.src = message.image;
      image.alt = message.filename || "Screenshot";
      bubble.append(image);
    } else {
      const text = document.createElement("span");
      text.textContent = message.body;
      bubble.append(text);
    }

    const meta = document.createElement("div");
    meta.className = "lcw-msg-meta";

    const time = document.createElement("span");
    time.className = "lcw-msg-time";
    time.textContent = new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    meta.append(time);

    if (isVisitor) {
      const tick = document.createElement("span");
      tick.className = `lcw-msg-tick ${message.seenByAgent ? 'seen' : ''}`;
      tick.textContent = message.seenByAgent ? "✓✓" : "✓";
      meta.append(tick);
    }

    bubble.append(meta);
    wrap.append(avatar);

    const currentSession = sessionInfo || sessionsList.find(s => s.id === activeSessionId);
    const isClosed = currentSession?.status === "closed";
    
    if (!isClosed) {
      const replyBtn = document.createElement("button");
      replyBtn.type = "button";
      replyBtn.className = "lcw-msg-reply-btn";
      replyBtn.title = "Reply";
      replyBtn.innerHTML = `
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><path d="M9 14L4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/></svg>
      `;
      replyBtn.addEventListener("click", () => {
        setWidgetReplyTo(message);
      });

      if (isVisitor) {
        wrap.append(replyBtn);
        wrap.append(bubble);
      } else {
        wrap.append(bubble);
        wrap.append(replyBtn);
      }
    } else {
      wrap.append(bubble);
    }

    messagesEl.append(wrap);
    scrollToBottom();
  }

  function scrollToBottom() {
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function createVisitorId() {
    if (window.crypto?.randomUUID) return window.crypto.randomUUID();
    return `lcw-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function normalizeBrandColor(color) {
    return /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.test(color) ? color : "#06b6d4";
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#039;"
    })[char]);
  }
})();
