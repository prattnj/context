import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faChartLine,
  faComments,
  faRightFromBracket,
  faCircleNotch,
} from '@fortawesome/free-solid-svg-icons'
import { api, type Conversation } from './api'
import { presets, type TimeRange } from './lib/time'
import Login from './components/Login'
import RangePicker from './components/RangePicker'
import Dashboard from './components/Dashboard'
import Conversations from './components/Conversations'
import Thread from './components/Thread'

type Tab = 'dashboard' | 'conversations'

export default function App() {
  const [authed, setAuthed] = useState<boolean | null>(null)
  const [tab, setTab] = useState<Tab>('dashboard')
  const [range, setRange] = useState<TimeRange>(() => presets()[0])
  const [openConversation, setOpenConversation] = useState<Conversation | null>(null)

  useEffect(() => {
    api
      .session()
      .then((s) => setAuthed(s.authenticated))
      .catch(() => setAuthed(false))
  }, [])

  if (authed === null) {
    return (
      <div className="flex min-h-screen items-center justify-center text-zinc-600">
        <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
      </div>
    )
  }

  if (!authed) return <Login onLogin={() => setAuthed(true)} />

  return (
    <div className="mx-auto max-w-6xl px-4 pb-12">
      <header className="flex flex-wrap items-center gap-4 py-5">
        <h1 className="text-xl font-semibold tracking-tight text-zinc-100">context</h1>
        <nav className="flex gap-1 rounded-lg border border-zinc-800 bg-zinc-900 p-1">
          <TabButton
            active={tab === 'dashboard'}
            onClick={() => {
              setTab('dashboard')
              setOpenConversation(null)
            }}
          >
            <FontAwesomeIcon icon={faChartLine} className="mr-1.5 text-xs" />
            Dashboard
          </TabButton>
          <TabButton
            active={tab === 'conversations'}
            onClick={() => {
              setTab('conversations')
              setOpenConversation(null)
            }}
          >
            <FontAwesomeIcon icon={faComments} className="mr-1.5 text-xs" />
            Conversations
          </TabButton>
        </nav>
        <div className="ml-auto">
          <button
            onClick={() => api.logout().then(() => setAuthed(false))}
            title="Sign out"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-500 transition hover:bg-zinc-800 hover:text-zinc-300"
          >
            <FontAwesomeIcon icon={faRightFromBracket} />
          </button>
        </div>
      </header>

      <div className="mb-5">
        <RangePicker
          range={range}
          onChange={(r) => {
            setRange(r)
          }}
        />
      </div>

      {tab === 'dashboard' && <Dashboard range={range} />}
      {tab === 'conversations' &&
        (openConversation ? (
          <Thread
            conversation={openConversation}
            range={range}
            onBack={() => setOpenConversation(null)}
          />
        ) : (
          <Conversations range={range} onOpen={setOpenConversation} />
        ))}
    </div>
  )
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean
  onClick: () => void
  children: React.ReactNode
}) {
  return (
    <button
      onClick={onClick}
      className={`rounded-md px-3 py-1.5 text-sm transition ${
        active ? 'bg-zinc-800 text-zinc-100' : 'text-zinc-500 hover:text-zinc-300'
      }`}
    >
      {children}
    </button>
  )
}
