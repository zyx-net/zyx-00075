import dayjs from 'dayjs'
import { User, Clock, ArrowRight } from 'lucide-react'
import { STATUS_LABELS } from '../constants'
import type { OperationLog } from '../types'
import { RoleBadge } from './StatusBadge'

interface OperationHistoryProps {
  logs: OperationLog[]
}

export default function OperationHistory({ logs }: OperationHistoryProps) {
  if (logs.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        暂无操作记录
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {logs.map((log, index) => (
        <div key={log.id} className="relative pl-8 pb-4">
          {index < logs.length - 1 && (
            <div className="absolute left-3 top-6 bottom-0 w-0.5 bg-gray-200"></div>
          )}
          <div className="absolute left-0 top-1 w-6 h-6 rounded-full bg-blue-100 border-2 border-blue-500 flex items-center justify-center">
            <div className="w-2 h-2 rounded-full bg-blue-500"></div>
          </div>

          <div className="bg-white rounded-lg border border-gray-200 p-4">
            <div className="flex flex-wrap items-center gap-2 mb-2">
              <span className="font-medium text-gray-900">{log.operation}</span>
              {log.from_status && log.to_status && log.from_status !== log.to_status && (
                <span className="flex items-center text-sm text-gray-500">
                  <span className="px-2 py-0.5 bg-gray-100 rounded text-xs">
                    {STATUS_LABELS[log.from_status as keyof typeof STATUS_LABELS] || log.from_status}
                  </span>
                  <ArrowRight className="h-3 w-3 mx-1" />
                  <span className="px-2 py-0.5 bg-blue-100 text-blue-800 rounded text-xs">
                    {STATUS_LABELS[log.to_status as keyof typeof STATUS_LABELS] || log.to_status}
                  </span>
                </span>
              )}
            </div>

            {log.remark && (
              <p className="text-sm text-gray-600 mb-2">{log.remark}</p>
            )}

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-gray-500">
              <div className="flex items-center">
                <User className="h-3 w-3 mr-1" />
                <span>{log.operator_name}</span>
                <RoleBadge role={log.operator_role as any} className="ml-2" />
              </div>
              <div className="flex items-center">
                <Clock className="h-3 w-3 mr-1" />
                <span>{dayjs(log.created_at).format('YYYY-MM-DD HH:mm:ss')}</span>
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )
}
