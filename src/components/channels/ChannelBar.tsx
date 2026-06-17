// src/components/channels/ChannelBar.tsx
interface Props {
  label: string
  db: number
  spend: number
  maxDB: number
  color: string
}

function fmtKRW(n: number) {
  if (n >= 100_000_000) return `${(n/100_000_000).toFixed(1)}억`
  if (n >= 10_000) return `${Math.round(n/10_000)}만`
  return n.toLocaleString()
}

export default function ChannelBar({ label, db, spend, maxDB, color }: Props) {
  const pct = maxDB > 0 ? Math.round((db / maxDB) * 100) : 0

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-xs font-medium text-slate-700">{label}</span>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-500">{fmtKRW(spend)}원</span>
          <span className="text-xs font-semibold text-slate-800 w-10 text-right">{db}건</span>
        </div>
      </div>
      <div className="w-full bg-slate-100 rounded-full h-1.5">
        <div
          className="h-1.5 rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, backgroundColor: color + 'cc' }}
        />
      </div>
    </div>
  )
}
