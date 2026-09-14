import { useEffect, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faWandMagicSparkles, faCircleNotch, faRotateRight } from '@fortawesome/free-solid-svg-icons'
import { api, type Summary } from '../api'

export default function MonthSummary({ month }: { month: string }) {
  const [summary, setSummary] = useState<Summary | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    setSummary(null)
    setError('')
    api
      .getSummary(month)
      .then((s) => !cancelled && setSummary(s))
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [month])

  async function generate(force = false) {
    setBusy(true)
    setError('')
    try {
      setSummary(await api.generateSummary(month, force))
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to generate summary')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="rounded-xl border border-indigo-900/60 bg-indigo-950/20 p-5">
      <div className="flex items-center justify-between gap-4">
        <h3 className="text-xs font-medium uppercase tracking-wider text-indigo-300">
          <FontAwesomeIcon icon={faWandMagicSparkles} className="mr-1.5" />
          Month in Review
        </h3>
        {summary ? (
          <button
            onClick={() => generate(true)}
            disabled={busy}
            title="Regenerate"
            className="text-xs text-zinc-500 transition hover:text-zinc-300 disabled:opacity-50"
          >
            <FontAwesomeIcon icon={busy ? faCircleNotch : faRotateRight} spin={busy} />
            <span className="ml-1.5">Regenerate</span>
          </button>
        ) : (
          <button
            onClick={() => generate()}
            disabled={busy}
            className="rounded-lg bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white transition hover:bg-indigo-500 disabled:opacity-60"
          >
            {busy ? (
              <>
                <FontAwesomeIcon icon={faCircleNotch} spin className="mr-1.5" />
                Summarizing…
              </>
            ) : (
              'Generate AI Summary'
            )}
          </button>
        )}
      </div>
      {error && <p className="mt-3 text-sm text-red-400">{error}</p>}
      {summary && (
        <div className="mt-3">
          <p className="whitespace-pre-wrap text-sm leading-relaxed text-zinc-300">
            {summary.summary}
          </p>
          <p className="mt-3 text-xs text-zinc-600">
            Generated {new Date(summary.createdAt).toLocaleDateString()} · {summary.model}
          </p>
        </div>
      )}
    </div>
  )
}
