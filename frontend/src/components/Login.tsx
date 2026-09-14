import { useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faLock, faArrowRight, faCircleNotch } from '@fortawesome/free-solid-svg-icons'
import { api } from '../api'

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)

  async function submit(e: React.FormEvent) {
    e.preventDefault()
    if (!password || busy) return
    setBusy(true)
    setError('')
    try {
      await api.login(password)
      onLogin()
    } catch {
      setError('Incorrect password')
      setPassword('')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4">
      <form onSubmit={submit} className="w-full max-w-sm">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-semibold tracking-tight text-zinc-100">context</h1>
          <p className="mt-2 text-sm text-zinc-500">Message history &amp; analytics</p>
        </div>
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-6">
          <label className="mb-2 block text-xs font-medium uppercase tracking-wider text-zinc-500">
            <FontAwesomeIcon icon={faLock} className="mr-1.5" />
            Password
          </label>
          <div className="flex gap-2">
            <input
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-zinc-700 bg-zinc-950 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={busy}
              className="rounded-lg bg-indigo-600 px-4 text-sm font-medium text-white transition hover:bg-indigo-500 disabled:opacity-50"
            >
              <FontAwesomeIcon icon={busy ? faCircleNotch : faArrowRight} spin={busy} />
            </button>
          </div>
          {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
        </div>
      </form>
    </div>
  )
}
