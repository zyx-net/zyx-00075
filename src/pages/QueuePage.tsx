import { useState, useEffect, useCallback } from 'react'
import { RefreshCw, AlertTriangle } from 'lucide-react'
import Layout from '../components/Layout'
import StatusFilter from '../components/StatusFilter'
import TicketCard from '../components/TicketCard'
import { ticketApi } from '../lib/apiClient'
import type { Ticket, TicketStatus, StatusCount } from '../types'
import { ACTIVE_STATUSES, PRIORITY_ORDER } from '../constants'

export default function QueuePage() {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [counts, setCounts] = useState<Record<string, StatusCount>>({})
  const [selectedStatus, setSelectedStatus] = useState<TicketStatus | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError('')

    try {
      const [ticketsRes, countsRes] = await Promise.all([
        ticketApi.getList(selectedStatus ? { status: selectedStatus } : undefined),
        ticketApi.getCounts(),
      ])

      if (ticketsRes.success && ticketsRes.data) {
        let filtered = ticketsRes.data
        if (selectedStatus === null) {
          filtered = filtered.filter(t => ACTIVE_STATUSES.includes(t.status))
        }
        filtered.sort((a, b) => {
          const priorityDiff = PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority]
          if (priorityDiff !== 0) return priorityDiff
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime()
        })
        setTickets(filtered)
      } else {
        setError(ticketsRes.error || '获取工单列表失败')
      }

      if (countsRes.success && countsRes.data) {
        setCounts(countsRes.data)
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [selectedStatus])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">
              {selectedStatus ? '工单列表' : '维修队列'}
            </h1>
            <p className="text-gray-600 mt-1">
              {selectedStatus
                ? `筛选状态：${counts[selectedStatus]?.label || selectedStatus}`
                : '按优先级自动排序，紧急工单优先处理'}
            </p>
          </div>
          <button
            onClick={fetchData}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 disabled:opacity-50 transition-colors"
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </button>
        </div>

        <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
          <h3 className="text-sm font-medium text-gray-700 mb-3">按状态筛选</h3>
          <StatusFilter
            selected={selectedStatus}
            onChange={setSelectedStatus}
            counts={counts}
          />
        </div>

        {error && (
          <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertTriangle className="h-5 w-5 mr-3 flex-shrink-0" />
            <div>
              <p className="font-medium">加载失败</p>
              <p className="text-sm mt-1">{error}</p>
            </div>
          </div>
        )}

        {loading ? (
          <div className="text-center py-12">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
            <p className="mt-4 text-gray-600">加载中...</p>
          </div>
        ) : tickets.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-xl border border-gray-200">
            <p className="text-gray-500">暂无工单</p>
          </div>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {tickets.map((ticket) => (
              <TicketCard key={ticket.id} ticket={ticket} />
            ))}
          </div>
        )}
      </div>
    </Layout>
  )
}
