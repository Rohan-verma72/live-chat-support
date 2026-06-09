import { useState } from 'react'
import SupportWidget from '../../modules/chat/SupportWidget/SupportWidget'

export default function HomePage() {
  const [visitorId] = useState(() => {
    const key = 'lc_demo_visitor_id'
    let id = localStorage.getItem(key)
    if (!id) {
      id = `visitor-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`
      localStorage.setItem(key, id)
    }
    return id
  })

  const [widgetOpen, setWidgetOpen] = useState(false)

  return (
    <div className="min-vh-100 d-flex flex-column" style={{
      background: 'radial-gradient(at 0% 0%, #f1f5f9 0px, transparent 50%), radial-gradient(at 100% 100%, #e0f2fe 0px, transparent 50%), #f8fafc'
    }}>
      <nav className="navbar navbar-expand-lg navbar-light bg-white border-bottom shadow-sm py-3 flex-shrink-0">
        <div className="container">
          <a href="/" className="navbar-brand d-flex align-items-center fw-bold text-primary">
            <span className="badge bg-primary me-2 fs-5" style={{ background: 'var(--gradient-brand) !important' }}>LC</span>
            <span>LiveChat</span>
          </a>
          <a href="/agent" className="btn btn-outline-primary fw-medium px-3 py-1.5 fs-7">
            Agent Portal &rarr;
          </a>
        </div>
      </nav>

      <main className="container flex-grow-1 d-flex align-items-center justify-content-center py-5">
        <div className="row w-100 justify-content-center">
          <div className="col-11 col-sm-9 col-md-6 col-lg-5">
            <div className="card border-0 text-center p-4 p-md-5 bg-white rounded-4 shadow-sm" style={{
              background: 'rgba(255, 255, 255, 0.8)',
              backdropFilter: 'blur(16px)',
              border: '1px solid rgba(255, 255, 255, 0.65)'
            }}>
              <div className="card-body">
                <div className="display-5 text-primary mb-3">🎧</div>
                <h1 className="h3 fw-bold text-dark mb-2">Live Chat Support</h1>
                <p className="text-secondary fs-7 mb-4 leading-relaxed">
                  Need assistance? Our support agents are online. Click the button below 
                  or use the chat bubble in the bottom right corner to start a conversation.
                </p>
                <button 
                  onClick={() => setWidgetOpen(true)} 
                  className="btn btn-primary btn-lg px-4 py-2 fw-semibold shadow-sm w-100 rounded-3 fs-7"
                >
                  💬 Open Live Chat
                </button>
              </div>
            </div>
          </div>
        </div>
      </main>

      {/* Clean, minimal footer */}
      <footer className="py-3 bg-white border-top text-center text-secondary fs-8 flex-shrink-0">
        <div className="container">
          &copy; {new Date().getFullYear()} LiveChat Support System. All rights reserved.
        </div>
      </footer>

      <SupportWidget 
        visitorName="Customer" 
        userId={visitorId} 
        brandColor="#0d6efd" 
        forceOpen={widgetOpen}
        onClose={() => setWidgetOpen(false)}
      />
    </div>
  )
}
