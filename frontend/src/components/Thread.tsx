import { useEffect, useRef, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faArrowLeft, faCircleNotch, faUserGroup, faFile } from '@fortawesome/free-solid-svg-icons'
import { api, type Conversation, type Message } from '../api'
import { formatDateMs, type TimeRange } from '../lib/time'

const PAGE = 200

interface Props {
  conversation: Conversation
  range: TimeRange
  onBack: () => void
}

export default function Thread({ conversation, range, onBack }: Props) {
  const [messages, setMessages] = useState<Message[]>([])
  const [total, setTotal] = useState(0)
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [error, setError] = useState('')
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    setMessages([])
    // Load the most recent page first: compute offset from total.
    api
      .thread(conversation.id, range.start, range.end, 0, 1)
      .then((probe) => {
        const offset = Math.max(probe.total - PAGE, 0)
        return api
          .thread(conversation.id, range.start, range.end, offset, PAGE)
          .then((page) => {
            if (cancelled) return
            setTotal(page.total)
            setMessages(page.messages)
          })
      })
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => {
        if (!cancelled) {
          setLoading(false)
          requestAnimationFrame(() => bottomRef.current?.scrollIntoView())
        }
      })
    return () => {
      cancelled = true
    }
  }, [conversation.id, range.start, range.end])

  const loadedFrom = total - messages.length

  async function loadOlder() {
    if (loadingMore || loadedFrom <= 0) return
    setLoadingMore(true)
    try {
      const offset = Math.max(loadedFrom - PAGE, 0)
      const page = await api.thread(
        conversation.id,
        range.start,
        range.end,
        offset,
        loadedFrom - offset,
      )
      setMessages((prev) => [...page.messages, ...prev])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to load messages')
    } finally {
      setLoadingMore(false)
    }
  }

  return (
    <div className="flex h-[calc(100vh-8.5rem)] flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-900/60">
      <div className="flex items-center gap-3 border-b border-zinc-800 px-4 py-3">
        <button
          onClick={onBack}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-zinc-400 transition hover:bg-zinc-800 hover:text-zinc-200"
        >
          <FontAwesomeIcon icon={faArrowLeft} />
        </button>
        <div className="min-w-0 flex-1">
          <div className="truncate text-sm font-medium text-zinc-100">
            {conversation.name || conversation.addressKey}
            {conversation.isGroup ? (
              <FontAwesomeIcon icon={faUserGroup} className="ml-2 text-xs text-zinc-500" />
            ) : null}
          </div>
          <div className="text-xs text-zinc-500">
            {total.toLocaleString()} messages · {range.label}
          </div>
        </div>
      </div>

      <div className="thread-scroll flex-1 overflow-y-auto px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-24 text-zinc-500">
            <FontAwesomeIcon icon={faCircleNotch} spin size="2x" />
          </div>
        ) : error ? (
          <p className="py-12 text-center text-red-400">{error}</p>
        ) : (
          <>
            {loadedFrom > 0 && (
              <div className="mb-4 text-center">
                <button
                  onClick={loadOlder}
                  disabled={loadingMore}
                  className="rounded-lg border border-zinc-700 px-3 py-1.5 text-xs text-zinc-400 transition hover:border-zinc-500 hover:text-zinc-200 disabled:opacity-50"
                >
                  {loadingMore ? (
                    <FontAwesomeIcon icon={faCircleNotch} spin />
                  ) : (
                    `Load ${Math.min(loadedFrom, PAGE).toLocaleString()} older`
                  )}
                </button>
              </div>
            )}
            <MessageList messages={messages} isGroup={!!conversation.isGroup} />
            <div ref={bottomRef} />
          </>
        )}
      </div>
    </div>
  )
}

function MessageList({ messages, isGroup }: { messages: Message[]; isGroup: boolean }) {
  const out: React.ReactNode[] = []
  let lastDay = ''
  for (const m of messages) {
    const day = new Date(m.dateMs).toDateString()
    if (day !== lastDay) {
      lastDay = day
      out.push(
        <div key={`d-${m.id}`} className="my-4 text-center text-xs text-zinc-600">
          {new Date(m.dateMs).toLocaleDateString(undefined, {
            weekday: 'long',
            month: 'long',
            day: 'numeric',
            year: 'numeric',
          })}
        </div>,
      )
    }
    out.push(<Bubble key={m.id} message={m} isGroup={isGroup} />)
  }
  return <>{out}</>
}

function Bubble({ message: m, isGroup }: { message: Message; isGroup: boolean }) {
  const sent = m.direction === 'sent'
  return (
    <div className={`mb-1.5 flex ${sent ? 'justify-end' : 'justify-start'}`}>
      <div className="max-w-[75%] sm:max-w-[60%]">
        {isGroup && !sent && m.senderAddress && (
          <div className="mb-0.5 ml-1 text-[11px] text-zinc-500">{m.senderAddress}</div>
        )}
        <div
          title={formatDateMs(m.dateMs)}
          className={`rounded-2xl px-3.5 py-2 text-sm leading-relaxed ${
            sent
              ? 'rounded-br-md bg-indigo-600 text-white'
              : 'rounded-bl-md bg-zinc-800 text-zinc-100'
          }`}
        >
          {m.media.map((item) =>
            item.contentType.startsWith('image/') ? (
              <a
                key={item.id}
                href={`/api/media/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="block"
              >
                <img
                  src={`/api/media/${item.id}`}
                  loading="lazy"
                  className="my-1 max-h-72 rounded-lg"
                  alt="attachment"
                />
              </a>
            ) : item.contentType.startsWith('video/') ? (
              <video
                key={item.id}
                src={`/api/media/${item.id}`}
                controls
                preload="none"
                className="my-1 max-h-72 rounded-lg"
              />
            ) : (
              <a
                key={item.id}
                href={`/api/media/${item.id}`}
                target="_blank"
                rel="noreferrer"
                className="my-1 flex items-center gap-2 text-xs underline opacity-90"
              >
                <FontAwesomeIcon icon={faFile} />
                {item.contentType} ({Math.round(item.byteSize / 1024)} KB)
              </a>
            ),
          )}
          {m.body && <span className="whitespace-pre-wrap break-words">{m.body}</span>}
        </div>
      </div>
    </div>
  )
}
