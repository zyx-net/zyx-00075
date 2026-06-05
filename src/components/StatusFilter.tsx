import { ALL_STATUSES, STATUS_LABELS } from '../constants'
import type { TicketStatus } from '../types'

interface StatusFilterProps {
  selected: TicketStatus | null
  onChange: (status: TicketStatus | null) => void
  counts?: Record<string, { count: number; label: string }>
}

export default function StatusFilter({ selected, onChange, counts }: StatusFilterProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors ${
          selected === null
            ? 'bg-blue-600 text-white border-blue-600'
            : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
        }`}
      >
        全部
      </button>
      {ALL_STATUSES.map((status) => {
        const count = counts?.[status]?.count || 0
        return (
          <button
            key={status}
            onClick={() => onChange(status)}
            className={`px-3 py-1.5 rounded-full text-sm font-medium border transition-colors flex items-center space-x-1 ${
              selected === status
                ? 'bg-blue-600 text-white border-blue-600'
                : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
            }`}
          >
            <span>{STATUS_LABELS[status]}</span>
            <span className={`text-xs ${selected === status ? 'text-blue-100' : 'text-gray-400'}`}>
              ({count})
            </span>
          </button>
        )
      })}
    </div>
  )
}
