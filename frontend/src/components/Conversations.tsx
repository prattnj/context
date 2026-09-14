import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faUserGroup,
  faChevronRight,
  faCircleNotch,
  faMagnifyingGlass,
} from '@fortawesome/free-solid-svg-icons'
import { api, type Conversation } from '../api'
import { formatNumber, type TimeRange } from '../lib/time'

interface Props {
  range: TimeRange
  onOpen: (conversation: Conversation) => void
}

export default function Conversations({ range, onOpen }: Props) {
  const [conversations, setConversations] = useState<Conversation[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [filter, setFilter] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .conversations(range.start, range.end)
      .then((c) => !cancelled && setConversations(c))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range.start, range.end])

  if (loading)
    return (
      <div className="flex justify-center py-24 text-zinc-500">
        <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
      </div>
    )
  if (error) return <p className="py-12 text-center text-red-400">{error}</p>

  const filtered = conversations.filter((c) =>
    (c.name || c.addressKey).toLowerCase().includes(filter.toLowerCase()),
  )

  return (
    <div className="space-y-4">
      <div className="relative max-w-sm">
        <FontAwesomeIcon
          icon={faMagnifyingGlass}
          className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-xs text-zinc-500"
        />
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Search conversations"
          className="w-full rounded-lg border border-zinc-800 bg-zinc-900 py-2 pl-9 pr-3 text-sm text-zinc-200 outline-none focus:border-indigo-500"
        />
      </div>

      <ul className="divide-y divide-zinc-800/70 overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
        {filtered.map((c) => (
          <li key={c.id}>
            <button
              onClick={() => onOpen(c)}
              className="flex w-full items-center gap-4 px-5 py-3.5 text-left transition hover:bg-zinc-800/50"
            >
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-zinc-800 text-sm font-medium text-zinc-300">
                {c.isGroup ? (
                  <FontAwesomeIcon icon={faUserGroup} className="text-xs" />
                ) : (
                  (c.name || '#').charAt(0).toUpperCase()
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="truncate text-sm font-medium text-zinc-200">
                  {c.name || c.addressKey}
                </div>
                <div className="text-xs text-zinc-500">
                  {formatNumber(c.sent)} sent · {formatNumber(c.received)} received
                </div>
              </div>
              <div className="text-sm font-medium text-zinc-400">{formatNumber(c.total)}</div>
              <FontAwesomeIcon icon={faChevronRight} className="text-xs text-zinc-600" />
            </button>
          </li>
        ))}
        {!filtered.length && (
          <li className="px-5 py-8 text-center text-sm text-zinc-500">
            No conversations in this period.
          </li>
        )}
      </ul>
    </div>
  )
}
