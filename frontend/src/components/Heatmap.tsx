import { useMemo } from 'react'
import type { HeatCell } from '../api'

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export default function Heatmap({ cells }: { cells: HeatCell[] }) {
  const { grid, max } = useMemo(() => {
    const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
    let max = 0
    for (const c of cells) {
      grid[c.weekday][c.hour] = c.total
      if (c.total > max) max = c.total
    }
    return { grid, max }
  }, [cells])

  return (
    <div className="overflow-x-auto">
      <table className="border-separate" style={{ borderSpacing: 2 }}>
        <tbody>
          {grid.map((row, day) => (
            <tr key={day}>
              <td className="pr-2 text-right text-[10px] text-zinc-500">{DAYS[day]}</td>
              {row.map((v, hour) => (
                <td key={hour}>
                  <div
                    title={`${DAYS[day]} ${hour}:00 — ${v.toLocaleString()} messages`}
                    className="h-4 w-4 rounded-[3px]"
                    style={{
                      backgroundColor:
                        v === 0
                          ? 'rgb(39 39 42)'
                          : `rgba(99, 102, 241, ${0.15 + 0.85 * (v / max)})`,
                    }}
                  />
                </td>
              ))}
            </tr>
          ))}
          <tr>
            <td />
            {Array.from({ length: 24 }, (_, h) => (
              <td key={h} className="pt-1 text-center text-[9px] text-zinc-600">
                {h % 4 === 0 ? h : ''}
              </td>
            ))}
          </tr>
        </tbody>
      </table>
    </div>
  )
}
