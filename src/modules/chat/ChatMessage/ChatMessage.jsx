import styles from './ChatMessage.module.css'

export default function ChatMessage({ message, isOwnMessage, onReply }) {
  const isVisitor = message.from === 'visitor'
  const isAgent   = message.from === 'agent'
  const isSystem  = message.from === 'system' || message.type === 'system'

  if (isSystem) {
    return (
      <div className={styles.systemWrap}>
        <div className={styles.systemLine} />
        <span className={styles.systemBubble}>{message.body}</span>
        <div className={styles.systemLine} />
      </div>
    )
  }

  const label = isAgent && message.agentName
    ? message.agentName
    : isVisitor ? 'Customer' : 'Support'

  const isSeen = message.from === 'visitor' ? message.seenByAgent : message.seenByVisitor

  const handleReplyClick = () => {
    if (!message.replyTo?.id) return
    const el = document.getElementById(`msg-${message.replyTo.id}`)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      const bubbleEl = el.querySelector(`.${styles.bubble}`)
      if (bubbleEl) {
        bubbleEl.classList.add(styles.flash)
        setTimeout(() => bubbleEl.classList.remove(styles.flash), 1500)
      }
    }
  }

  return (
    <div id={`msg-${message.id}`} className={`${styles.wrap} ${isOwnMessage ? styles.ownMessage : styles.otherMessage}`}>
      {!isOwnMessage && (
        <div className={`${styles.avatar} ${isAgent ? styles.avatarAgent : styles.avatarVisitor}`}>
          {label[0].toUpperCase()}
        </div>
      )}

      {isOwnMessage && onReply && (
        <button
          type="button"
          className={styles.replyBtn}
          onClick={() => onReply(message)}
          title="Reply"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 14L4 9l5-5"/>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
          </svg>
        </button>
      )}

      <div className={`${styles.bubble} ${isOwnMessage ? styles.ownBubble : styles.otherBubble}`}>
        {message.replyTo && message.replyTo.id && (
          <div className={styles.replyPreview} onClick={handleReplyClick}>
            <span className={styles.replyPreviewSender}>
              {message.replyTo.from === 'agent' ? 'Support' : 'Customer'}
            </span>
            <span className={styles.replyPreviewText}>
              {message.replyTo.type === 'screenshot' ? '📷 Image' : message.replyTo.body}
            </span>
          </div>
        )}

        {isAgent && message.agentName && !isOwnMessage && (
          <span className={styles.agentName}>{message.agentName}</span>
        )}

        {message.type === 'screenshot' ? (
          <img
            src={message.image}
            alt={message.filename || 'Attachment'}
            className={styles.screenshotImg}
          />
        ) : (
          <p className={styles.messageText}>{message.body}</p>
        )}

        <div className={styles.meta}>
          <span className={styles.time}>
            {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
          </span>
          {isOwnMessage && (
            <span className={`${styles.tick} ${isSeen ? styles.seen : styles.unseen}`}>
              {isSeen ? '✓✓' : '✓'}
            </span>
          )}
        </div>
      </div>

      {!isOwnMessage && onReply && (
        <button
          type="button"
          className={styles.replyBtn}
          onClick={() => onReply(message)}
          title="Reply"
        >
          <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
            <path d="M9 14L4 9l5-5"/>
            <path d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5v0a5.5 5.5 0 0 1-5.5 5.5H11"/>
          </svg>
        </button>
      )}

      {isOwnMessage && (
        <div className={`${styles.avatar} ${isAgent ? styles.avatarAgent : styles.avatarVisitor}`}>
          {label[0].toUpperCase()}
        </div>
      )}
    </div>
  )
}