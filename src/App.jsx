import AgentPortal from './pages/AgentPortal/AgentPortal'
import HomePage from './pages/HomePage/HomePage'

const isAgentRoute = window.location.pathname.startsWith('/agent')

export default function App() {
  return isAgentRoute ? <AgentPortal /> : <HomePage />
}
