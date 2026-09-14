import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
  faPaperPlane,
  faInbox,
  faImage,
  faUserGroup,
  faFire,
  faPhone,
  faCircleNotch,
  faTrophy,
  faClock,
} from '@fortawesome/free-solid-svg-icons'
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts'
import { api, type Stats } from '../api'
import { formatDay, formatDateMs, formatDuration, formatNumber, type TimeRange } from '../lib/time'
import Heatmap from './Heatmap'
import MonthSummary from './MonthSummary'
import ExtraStats from './ExtraStats'

function Card({
  title,
  children,
  className = '',
}: {
  title: string
  children: React.ReactNode
  className?: string
}) {
  return (
    <div className={`rounded-xl border border-zinc-800 bg-zinc-900/60 p-5 ${className}`}>
      <h3 className="mb-3 text-xs font-medium uppercase tracking-wider text-zinc-500">{title}</h3>
      {children}
    </div>
  )
}

function StatTile({
  icon,
  label,
  value,
  sub,
}: {
  icon: typeof faPaperPlane
  label: string
  value: string
  sub?: string
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/60 p-5">
      <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
        <FontAwesomeIcon icon={icon} className="text-indigo-400" />
        {label}
      </div>
      <div className="mt-2 text-2xl font-semibold text-zinc-100">{value}</div>
      {sub && <div className="mt-1 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

export default function Dashboard({ range }: { range: TimeRange }) {
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setError('')
    api
      .stats(range.start, range.end)
      .then((s) => !cancelled && setStats(s))
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
  if (!stats) return null

  const { totals, calls } = stats
  const totalMessages = (Number(totals.sent) || 0) + (Number(totals.received) || 0)

  return (
    <div className="space-y-4">
      {range.month && <MonthSummary month={range.month} />}

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <StatTile
          icon={faPaperPlane}
          label="Sent"
          value={formatNumber(totals.sent)}
          sub={`${formatNumber(totals.charsSent)} characters`}
        />
        <StatTile icon={faInbox} label="Received" value={formatNumber(totals.received)} />
        <StatTile
          icon={faUserGroup}
          label="Conversations"
          value={formatNumber(totals.conversations)}
          sub={`${formatNumber(totals.activeDays)} active days`}
        />
        <StatTile
          icon={faImage}
          label="With Media"
          value={formatNumber(totals.withMedia)}
          sub={`${formatNumber(totalMessages)} total messages`}
        />
      </div>

      <Card title="Messages Over Time">
        {stats.daily.length ? (
          <ResponsiveContainer width="100%" height={260}>
            <AreaChart data={stats.daily} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
              <defs>
                <linearGradient id="gSent" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#6366f1" stopOpacity={0.5} />
                  <stop offset="100%" stopColor="#6366f1" stopOpacity={0} />
                </linearGradient>
                <linearGradient id="gRecv" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stopColor="#22d3ee" stopOpacity={0.4} />
                  <stop offset="100%" stopColor="#22d3ee" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid stroke="#27272a" strokeDasharray="3 3" vertical={false} />
              <XAxis
                dataKey="date"
                tick={{ fill: '#71717a', fontSize: 11 }}
                tickFormatter={(d: string) => d.slice(0, 7)}
                minTickGap={48}
              />
              <YAxis tick={{ fill: '#71717a', fontSize: 11 }} />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#18181b',
                  border: '1px solid #3f3f46',
                  borderRadius: 8,
                  fontSize: 12,
                }}
                labelFormatter={(d) => formatDay(String(d))}
              />
              <Area
                type="monotone"
                dataKey="sent"
                stroke="#6366f1"
                fill="url(#gSent)"
                strokeWidth={1.5}
                name="Sent"
              />
              <Area
                type="monotone"
                dataKey="received"
                stroke="#22d3ee"
                fill="url(#gRecv)"
                strokeWidth={1.5}
                name="Received"
              />
            </AreaChart>
          </ResponsiveContainer>
        ) : (
          <p className="text-sm text-zinc-500">No messages in this period.</p>
        )}
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Most Texted">
          <ul className="space-y-2">
            {stats.topContacts.map((c, i) => (
              <li key={c.id} className="flex items-center gap-3 text-sm">
                <span className="w-5 text-right text-zinc-600">{i + 1}</span>
                <span className="flex-1 truncate text-zinc-200">
                  {c.name || 'Unknown'}
                  {c.isGroup ? (
                    <FontAwesomeIcon icon={faUserGroup} className="ml-2 text-xs text-zinc-500" />
                  ) : null}
                </span>
                <span className="text-zinc-500">
                  {formatNumber(c.sent)} out · {formatNumber(c.received)} in
                </span>
                <span className="w-16 text-right font-medium text-zinc-300">
                  {formatNumber(c.total)}
                </span>
              </li>
            ))}
            {!stats.topContacts.length && (
              <p className="text-sm text-zinc-500">No conversations in this period.</p>
            )}
          </ul>
        </Card>

        <div className="space-y-4">
          <Card title="Busiest Days">
            <ul className="space-y-2">
              {stats.busiestDays.map((d) => (
                <li key={d.date} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{formatDay(d.date)}</span>
                  <span className="font-medium text-zinc-200">
                    {formatNumber(d.total)} messages
                  </span>
                </li>
              ))}
              {!stats.busiestDays.length && (
                <p className="text-sm text-zinc-500">Nothing here.</p>
              )}
            </ul>
          </Card>

          <Card title="Longest Streaks">
            <ul className="space-y-2">
              {stats.streaks.map((s, i) => (
                <li key={i} className="flex items-center gap-3 text-sm">
                  <FontAwesomeIcon icon={faFire} className="text-orange-400" />
                  <span className="flex-1 truncate text-zinc-200">{s.name || 'Unknown'}</span>
                  <span className="text-zinc-500">
                    {formatDay(s.start)} – {formatDay(s.end)}
                  </span>
                  <span className="w-16 text-right font-medium text-zinc-300">
                    {s.length} days
                  </span>
                </li>
              ))}
              {!stats.streaks.length && <p className="text-sm text-zinc-500">No streaks yet.</p>}
            </ul>
          </Card>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card title="Longest Message Sent">
          <LongMessage msg={stats.longestSent} />
        </Card>
        <Card title="Longest Message Received">
          <LongMessage msg={stats.longestReceived} />
        </Card>
      </div>

      <Card title="Activity by Hour">
        <Heatmap cells={stats.heatmap} />
      </Card>

      <ExtraStats range={range} />

      <Card title="Calls">
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          <MiniStat icon={faPhone} label="Total Calls" value={formatNumber(calls.totals.total)} />
          <MiniStat
            icon={faClock}
            label="Talk Time"
            value={formatDuration(Number(calls.totals.totalSeconds) || 0)}
          />
          <MiniStat
            icon={faInbox}
            label="In / Out / Missed"
            value={`${formatNumber(calls.totals.incoming)} / ${formatNumber(
              calls.totals.outgoing,
            )} / ${formatNumber(calls.totals.missed)}`}
          />
          <MiniStat
            icon={faTrophy}
            label="Longest Call"
            value={calls.longest ? formatDuration(calls.longest.seconds) : '—'}
            sub={
              calls.longest
                ? `${calls.longest.name || calls.longest.number} · ${formatDateMs(
                    calls.longest.dateMs,
                  )}`
                : undefined
            }
          />
        </div>
        {calls.topCalled.length > 0 && (
          <div className="mt-5">
            <h4 className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500">
              Most Called
            </h4>
            <ul className="space-y-1.5">
              {calls.topCalled.map((c, i) => (
                <li key={i} className="flex items-center justify-between text-sm">
                  <span className="text-zinc-300">{c.name}</span>
                  <span className="text-zinc-500">
                    {formatNumber(c.total)} calls · {formatDuration(Number(c.totalSeconds) || 0)}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </Card>
    </div>
  )
}

function MiniStat({
  icon,
  label,
  value,
  sub,
}: {
  icon: typeof faPhone
  label: string
  value: string
  sub?: string
}) {
  return (
    <div>
      <div className="flex items-center gap-2 text-xs text-zinc-500">
        <FontAwesomeIcon icon={icon} className="text-indigo-400" />
        {label}
      </div>
      <div className="mt-1 text-lg font-semibold text-zinc-100">{value}</div>
      {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
    </div>
  )
}

function LongMessage({
  msg,
}: {
  msg: { body: string; chars: number; dateMs: number; name: string } | null
}) {
  if (!msg) return <p className="text-sm text-zinc-500">None in this period.</p>
  return (
    <div>
      <p className="max-h-40 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
        {msg.body}
      </p>
      <p className="mt-3 text-xs text-zinc-500">
        {msg.chars.toLocaleString()} characters · {msg.name || 'Unknown'} ·{' '}
        {formatDateMs(msg.dateMs)}
      </p>
    </div>
  )
}
