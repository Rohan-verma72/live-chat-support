# Live Chat Support System

Real-time customer support platform with agent portal, embeddable chat widget, and MongoDB persistence.

## Project Structure

```
live-chat-support/
├── backend/                    # Node.js + Express + Socket.IO
│   ├── index.js                # Server entry point
│   └── database/
│       ├── connection.js       # MongoDB connection
│       └── models/
│           ├── ChatSession.js  # Chat sessions & messages
│           └── SupportAgent.js # Agent profiles
├── src/                        # React frontend
│   ├── pages/
│   │   ├── AgentPortal/        # Support agent dashboard
│   │   └── HomePage/           # Customer demo page
│   ├── modules/
│   │   └── chat/
│   │       ├── SupportWidget/  # Floating chat widget
│   │       └── ChatMessage/    # Message component
│   ├── styles/
│   │   └── global.css          # Theme & base styles
│   ├── App.jsx                 # Route handler
│   └── main.jsx                # React entry
├── widget/
│   └── support-widget.js       # Embeddable script for any website
├── package.json
└── .env.example
```

## Setup

```bash
npm install
```

Create `.env` from `.env.example`:

```
MONGODB_URI=mongodb://127.0.0.1:27017/live-chat
PORT=3000
```

## Run

Start both the backend server and the frontend client concurrently:

```bash
npm run dev
```

If you prefer to run them in separate terminal sessions:

**Backend:**
```bash
npm run server
```

**Frontend:**
```bash
npm run client
```

| URL | Purpose |
|-----|---------|
| http://localhost:5173 | Customer page |
| http://localhost:5173/agent | Agent portal |
| http://localhost:3000/health | Server health check |

## Embed Widget

Add to any website:

```html
<script
  src="http://localhost:3000/widget/support-widget.js"
  data-title="Support"
  data-visitor-name="Customer Name"
  data-user-id="user-123"
  data-brand-color="#2563eb"
></script>
```

Legacy URL `/embed.js` also works.

## Production

```bash
npm run build
npm start
```
