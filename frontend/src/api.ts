export interface Totals {
  sent: number | null
  received: number | null
  withMedia: number | null
  charsSent: number | null
  conversations: number
  activeDays: number
}

export interface TopContact {
  id: number
  name: string
  isGroup: number
  total: number
  sent: number
  received: number
}

export interface BusiestDay {
  date: string
  total: number
}

export interface LongestMessage {
  direction: 'sent' | 'received'
  body: string
  chars: number
  dateMs: number
  name: string
}

export interface DailyPoint {
  date: string
  sent: number
  received: number
}

export interface HeatCell {
  weekday: number
  hour: number
  total: number
}

export interface Streak {
  name: string
  length: number
  start: string
  end: string
}

export interface CallStats {
  totals: {
    total: number
    incoming: number | null
    outgoing: number | null
    missed: number | null
    totalSeconds: number | null
  }
  longest: { name: string; number: string; seconds: number; dateMs: number } | null
  topCalled: { name: string; total: number; totalSeconds: number }[]
}

export interface Stats {
  totals: Totals
  topContacts: TopContact[]
  busiestDays: BusiestDay[]
  longestSent: LongestMessage | null
  longestReceived: LongestMessage | null
  daily: DailyPoint[]
  heatmap: HeatCell[]
  streaks: Streak[]
  calls: CallStats
}

export interface Conversation {
  id: number
  name: string
  addressKey: string
  isGroup: number
  total: number
  sent: number
  received: number
  lastMessageMs: number
}

export interface MediaItem {
  id: number
  messageId: number
  contentType: string
  byteSize: number
}

export interface Message {
  id: number
  kind: 'sms' | 'mms'
  direction: 'sent' | 'received'
  senderAddress: string | null
  body: string | null
  dateMs: number
  hasMedia: number
  media: MediaItem[]
}

export interface ThreadPage {
  total: number
  offset: number
  messages: Message[]
}

export interface Summary {
  month: string
  model: string
  summary: string
  createdAt: string
}

export interface FreqItem {
  value: string
  count: number
}

export interface ReplySummary {
  count: number
  avgSeconds: number
  medianSeconds: number
}

export interface ExtraStats {
  words: { sent: FreqItem[]; received: FreqItem[] }
  emojis: { sent: FreqItem[]; received: FreqItem[] }
  responseTimes: {
    mine: ReplySummary | null
    theirs: ReplySummary | null
    fastestRepliers: { name: string; medianSeconds: number; replies: number }[]
  }
}

class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json' },
    ...init,
  })
  if (!res.ok) {
    let message = res.statusText
    try {
      const data = await res.json()
      message = data.error || message
    } catch {
      /* ignore */
    }
    throw new ApiError(res.status, message)
  }
  return res.json() as Promise<T>
}

export const api = {
  login: (password: string) =>
    request<{ ok: boolean }>('/api/login', { method: 'POST', body: JSON.stringify({ password }) }),
  logout: () => request<{ ok: boolean }>('/api/logout', { method: 'POST' }),
  session: () => request<{ authenticated: boolean }>('/api/session'),
  stats: (start: string, end: string) =>
    request<Stats>(`/api/stats?start=${start}&end=${end}`),
  extraStats: (start: string, end: string) =>
    request<ExtraStats>(`/api/stats/extra?start=${start}&end=${end}`),
  conversations: (start: string, end: string) =>
    request<Conversation[]>(`/api/conversations?start=${start}&end=${end}`),
  thread: (id: number, start: string, end: string, offset = 0, limit = 200) =>
    request<ThreadPage>(
      `/api/conversations/${id}/messages?start=${start}&end=${end}&offset=${offset}&limit=${limit}`,
    ),
  getSummary: (month: string) => request<Summary | null>(`/api/summaries/${month}`),
  generateSummary: (month: string, force = false) =>
    request<Summary>(`/api/summaries/${month}${force ? '?force=1' : ''}`, { method: 'POST' }),
}

export { ApiError }
