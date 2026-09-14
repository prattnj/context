import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faCircleNotch,
  faFont,
  faFaceSmile,
  faReply,
  faBolt,
} from '@fortawesome/free-solid-svg-icons'
import { api, type ExtraStats as ExtraStatsData, type FreqItem } from '../api'
import { formatDuration, formatNumber, type TimeRange } from '../lib/time'

export default function ExtraStats({ range }: { range: TimeRange }) {
  const [data, setData] = useState<ExtraStatsData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .extraStats(range.start, range.end)
      .then((d) => !cancelled && setData(d))
      .catch((e) => !cancelled && setError(e.message))
      .finally(() => !cancelled && setLoading(false))
    return () => {
      cancelled = true
    }
  }, [range.start, range.end])

  if (loading)
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 text-center text-zinc-500">
        <FontAwesomeIcon icon={faCircleNotch} spin className="mr-2" />
        <span className="text-sm">Analyzing message text…</span>
      </div>
    )
  if (error) return <p className="py-4 text-center text-sm text-red-400">{error}</p>
  if (!data) return null

  const { responseTimes: rt } = data

  return (
    <>
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <FontAwesomeIcon icon={faFont} className="mr-1.5 text-indigo-400" />
            Most Used Words
          </h3>
          <div className="grid grid-cols-2 gap-4">
            <WordColumn title="You" items={data.words.sent} />
            <WordColumn title="Them" items={data.words.received} />
          </div>
        </div>

        <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
          <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
            <FontAwesomeIcon icon={faFaceSmile} className="mr-1.5 text-indigo-400" />
            Top Emojis
          </h3>
          <div className="space-y-4">
            <EmojiRow title="You" items={data.emojis.sent} />
            <EmojiRow title="Them" items={data.emojis.received} />
          </div>
        </div>
      </div>

      <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
        <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">
          <FontAwesomeIcon icon={faReply} className="mr-1.5 text-indigo-400" />
          Response Times
        </h3>
        <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
          <ReplyStat label="Your replies" summary={rt.mine} />
          <ReplyStat label="Their replies" summary={rt.theirs} />
          <div>
            <div className="text-xs text-zinc-500">
              <FontAwesomeIcon icon={faBolt} className="mr-1 text-amber-400" />
              Fastest repliers
            </div>
            <ul className="mt-2 space-y-1.5">
              {rt.fastestRepliers.map((c, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="truncate text-zinc-300">{c.name}</span>
                  <span className="ml-3 shrink-0 text-zinc-500">
                    {formatDuration(c.medianSeconds)} median
                  </span>
                </li>
              ))}
              {!rt.fastestRepliers.length && (
                <li className="text-sm text-zinc-500">Not enough replies in this period.</li>
              )}
            </ul>
          </div>
        </div>
      </div>
    </>
  )
}

function WordColumn({ title, items }: { title: string; items: FreqItem[] }) {
  const max = items[0]?.count || 1
  return (
    <div>
      <div className="mb-2 text-xs text-zinc-500">{title}</div>
      <ul className="space-y-1">
        {items.slice(0, 12).map((w) => (
          <li key={w.value} className="flex items-center gap-2 text-sm">
            <span className="w-20 truncate text-zinc-300">{w.value}</span>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-zinc-800">
              <div
                className="h-full rounded-full bg-indigo-500/70"
                style={{ width: `${(w.count / max) * 100}%` }}
              />
            </div>
            <span className="w-12 text-right text-xs text-zinc-500">
              {formatNumber(w.count)}
            </span>
          </li>
        ))}
        {!items.length && <li className="text-sm text-zinc-500">No messages.</li>}
      </ul>
    </div>
  )
}

function EmojiRow({ title, items }: { title: string; items: FreqItem[] }) {
  return (
    <div>
      <div className="mb-2 text-xs text-zinc-500">{title}</div>
      {items.length ? (
        <div className="flex flex-wrap gap-2">
          {items.map((e) => (
            <span
              key={e.value}
              title={`${formatNumber(e.count)} times`}
              className="flex items-center gap-1.5 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1"
            >
              <span className="text-lg leading-none">{e.value}</span>
              <span className="text-xs text-zinc-500">{formatNumber(e.count)}</span>
            </span>
          ))}
        </div>
      ) : (
        <p className="text-sm text-zinc-500">No emojis.</p>
      )}
    </div>
  )
}

function ReplyStat({
  label,
  summary,
}: {
  label: string
  summary: { count: number; avgSeconds: number; medianSeconds: number } | null
}) {
  return (
    <div>
      <div className="text-xs text-zinc-500">{label}</div>
      {summary ? (
        <>
          <div className="mt-1 text-lg font-semibold text-zinc-100">
            {formatDuration(summary.medianSeconds)}
            <span className="ml-1.5 text-xs font-normal text-zinc-500">median</span>
          </div>
          <div className="mt-0.5 text-xs text-zinc-500">
            {formatDuration(summary.avgSeconds)} average · {formatNumber(summary.count)} replies
          </div>
        </>
      ) : (
        <div className="mt-1 text-sm text-zinc-500">No replies in this period.</div>
      )}
    </div>
  )
}
