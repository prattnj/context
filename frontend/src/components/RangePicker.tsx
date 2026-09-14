import { useMemo, useState } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faCalendarDays } from '@fortawesome/free-solid-svg-icons'
import { presets, monthOptions, type TimeRange } from '../lib/time'

interface Props {
  range: TimeRange
  onChange: (range: TimeRange) => void
}

export default function RangePicker({ range, onChange }: Props) {
  const presetList = useMemo(presets, [])
  const months = useMemo(() => monthOptions(2020), [])
  const [custom, setCustom] = useState(false)

  const isMonthSelected = months.some(
    (m) => m.start === range.start && m.end === range.end && range.month !== null,
  )

  return (
    <div className="flex flex-wrap items-center gap-2">
      {presetList.map((p) => {
        const active = !custom && p.start === range.start && p.end === range.end
        return (
          <button
            key={p.label}
            onClick={() => {
              setCustom(false)
              onChange(p)
            }}
            className={`rounded-lg px-3 py-1.5 text-sm transition ${
              active
                ? 'bg-indigo-600 text-white'
                : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
            }`}
          >
            {p.label}
          </button>
        )
      })}

      <div className="relative">
        <select
          value={isMonthSelected ? range.month ?? '' : ''}
          onChange={(e) => {
            const m = months.find((x) => x.month === e.target.value)
            if (m) {
              setCustom(false)
              onChange(m)
            }
          }}
          className={`appearance-none rounded-lg border py-1.5 pl-8 pr-3 text-sm outline-none transition ${
            isMonthSelected && !custom
              ? 'border-indigo-500 bg-indigo-600 text-white'
              : 'border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600'
          }`}
        >
          <option value="" disabled>
            Month…
          </option>
          {months.map((m) => (
            <option key={m.month} value={m.month!} className="bg-zinc-900 text-zinc-200">
              {m.label}
            </option>
          ))}
        </select>
        <FontAwesomeIcon
          icon={faCalendarDays}
          className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-xs opacity-70"
        />
      </div>

      <button
        onClick={() => setCustom(!custom)}
        className={`rounded-lg px-3 py-1.5 text-sm transition ${
          custom
            ? 'bg-indigo-600 text-white'
            : 'border border-zinc-800 bg-zinc-900 text-zinc-400 hover:border-zinc-600 hover:text-zinc-200'
        }`}
      >
        Custom
      </button>

      {custom && (
        <div className="flex items-center gap-2 text-sm">
          <input
            type="date"
            value={range.start}
            onChange={(e) =>
              e.target.value &&
              onChange({ label: 'Custom', start: e.target.value, end: range.end, month: null })
            }
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300 outline-none focus:border-indigo-500"
          />
          <span className="text-zinc-600">to</span>
          <input
            type="date"
            value={range.end}
            onChange={(e) =>
              e.target.value &&
              onChange({ label: 'Custom', start: range.start, end: e.target.value, month: null })
            }
            className="rounded-lg border border-zinc-800 bg-zinc-900 px-2 py-1.5 text-zinc-300 outline-none focus:border-indigo-500"
          />
        </div>
      )}
    </div>
  )
}
