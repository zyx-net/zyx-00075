import { useEffect, useState } from 'react'
import { useParams, Link } from 'react-router-dom'
import { batchApi } from '../lib/apiClient'
import Layout from '../components/Layout'
import { useAuthStore, hasPermission } from '../store/authStore'
import { ArrowLeft, Download, CheckCircle, XCircle, AlertTriangle, FileText, Send } from 'lucide-react'
import type { ImportBatch, ImportRow } from '../types'

const STATUS_LABELS: Record<string, string> = {
  pending: '待处理',
  prechecked: '预检通过',
  warning: '有警告',
  error: '有错误',
  submitted: '提交中',
  ticket_created: '工单已创建',
  ticket_assigned: '工单已分派',
  failed: '提交失败',
}

const ROW_STATUS_COLORS: Record<string, string> = {
  pending: 'bg-gray-100 text-gray-800',
  prechecked: 'bg-green-100 text-green-800',
  warning: 'bg-yellow-100 text-yellow-800',
  error: 'bg-red-100 text-red-800',
  submitted: 'bg-blue-100 text-blue-800',
  ticket_created: 'bg-green-100 text-green-800',
  ticket_assigned: 'bg-green-100 text-green-800',
  failed: 'bg-red-100 text-red-800',
}

const BATCH_STATUS_LABELS: Record<string, string> = {
  uploading: '上传中',
  prechecking: '预检中',
  prechecked: '待提交',
  submitting: '提交中',
  completed: '已完成',
  failed: '失败',
}

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export default function BatchDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { user } = useAuthStore()
  const [batch, setBatch] = useState<ImportBatch | null>(null)
  const [rows, setRows] = useState<ImportRow[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [message, setMessage] = useState<string | null>(null)

  useEffect(() => {
    if (id) {
      loadDetail(parseInt(id, 10))
    }
  }, [id])

  async function loadDetail(batchId: number) {
    try {
      setLoading(true)
      setError(null)
      const res = await batchApi.getBatchDetail(batchId)
      if (res.success && res.data) {
        setBatch(res.data.batch)
        setRows(res.data.rows)
      } else {
        setError(res.error || '加载失败')
      }
    } catch (err) {
      setError('加载失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSubmit() {
    if (!batch) return

    if (!confirm(`确认提交该批次的工单？将创建 ${rows.filter(r => r.status === 'prechecked' || r.status === 'warning').length} 条工单。`)) {
      return
    }

    try {
      setSubmitting(true)
      setError(null)
      setMessage(null)

      const res = await batchApi.submit(batch.id)
      if (res.success && res.data) {
        setMessage(`提交完成：成功 ${res.data.successRows} 条，失败 ${res.data.failedRows} 条`)
        await loadDetail(batch.id)
      } else {
        setError(res.error || '提交失败')
      }
    } catch (err) {
      setError('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleExport(type: 'all' | 'success' | 'failed') {
    if (!batch) return

    try {
      const response = await batchApi.export(batch.id, type)
      if (!response.ok) {
        throw new Error('导出失败')
      }

      const blob = await response.blob()
      const filename = response.headers.get('Content-Disposition')?.match(/filename="?([^"]+)"?/)?.[1] || `export_${batch.batch_no}.csv`
      
      const url = window.URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = decodeURIComponent(filename)
      document.body.appendChild(a)
      a.click()
      window.URL.revokeObjectURL(url)
      document.body.removeChild(a)
    } catch (err) {
      setError('导出失败，请稍后重试')
    }
  }

  function parseJsonArray(str: string | null): string[] {
    if (!str) return []
    try {
      const parsed = JSON.parse(str)
      return Array.isArray(parsed) ? parsed : []
    } catch {
      return []
    }
  }

  function formatDate(dateStr: string) {
    const date = new Date(dateStr)
    return date.toLocaleString('zh-CN')
  }

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      </Layout>
    )
  }

  if (!batch) {
    return (
      <Layout>
        <div className="text-center py-12">
          <p className="text-gray-500">批次不存在</p>
          <Link to="/batch" className="mt-4 text-blue-600 hover:text-blue-900 inline-block">
            返回列表
          </Link>
        </div>
      </Layout>
    )
  }

  const canSubmit = batch.status === 'prechecked' && hasPermission(user, 'batch:submit')
  const canExport = batch.status === 'completed' && hasPermission(user, 'batch:export')

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/batch"
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              返回
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">
              批次详情 - {batch.batch_no}
            </h1>
          </div>
          <div className="flex items-center space-x-2">
            {canSubmit && (
              <button
                onClick={handleSubmit}
                disabled={submitting}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Send className="h-4 w-4 mr-2" />
                {submitting ? '提交中...' : '提交工单'}
              </button>
            )}
            {canExport && (
              <>
                <button
                  onClick={() => handleExport('all')}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出全部
                </button>
                <button
                  onClick={() => handleExport('success')}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-green-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出成功
                </button>
                <button
                  onClick={() => handleExport('failed')}
                  className="inline-flex items-center px-3 py-2 border border-gray-300 text-sm font-medium rounded-md text-red-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <Download className="h-4 w-4 mr-2" />
                  导出失败
                </button>
              </>
            )}
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {message && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-md">
            {message}
          </div>
        )}

        <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900 mb-4">批次信息</h2>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <div>
              <p className="text-sm text-gray-500">文件名</p>
              <p className="text-sm font-medium text-gray-900">{batch.file_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">状态</p>
              <p className="text-sm font-medium text-gray-900">
                {BATCH_STATUS_LABELS[batch.status] || batch.status}
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">总行数</p>
              <p className="text-sm font-medium text-gray-900">{batch.total_rows}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">成功 / 失败</p>
              <p className="text-sm font-medium text-gray-900">
                <span className="text-green-600">{batch.success_count}</span>
                {' / '}
                <span className="text-red-600">{batch.fail_count}</span>
              </p>
            </div>
            <div>
              <p className="text-sm text-gray-500">创建人</p>
              <p className="text-sm font-medium text-gray-900">{batch.created_by_name}</p>
            </div>
            <div>
              <p className="text-sm text-gray-500">创建时间</p>
              <p className="text-sm font-medium text-gray-900">{formatDate(batch.created_at)}</p>
            </div>
          </div>
        </div>

        <div className="bg-white shadow-sm rounded-lg overflow-hidden border border-gray-200">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">导入数据 ({rows.length} 条)</h2>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    行号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    客户姓名
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    客户电话
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    设备
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    优先级
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    工单号
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    状态
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    问题
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {rows.map((row) => {
                  const errors = parseJsonArray(row.precheck_errors)
                  const warnings = parseJsonArray(row.precheck_warnings)

                  return (
                    <tr key={row.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.row_index + 1}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                        {row.customer_name || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {row.customer_phone || '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {row.device_type && row.device_model
                          ? `${row.device_type} ${row.device_model}`
                          : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                        {row.priority ? PRIORITY_LABELS[row.priority] || row.priority : '-'}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap text-sm">
                        {row.ticket_no ? (
                          <Link
                            to={`/tickets/${row.ticket_id}`}
                            className="text-blue-600 hover:text-blue-900 font-medium"
                          >
                            {row.ticket_no}
                          </Link>
                        ) : (
                          '-'
                        )}
                      </td>
                      <td className="px-4 py-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${ROW_STATUS_COLORS[row.status] || 'bg-gray-100 text-gray-800'}`}
                        >
                          {STATUS_LABELS[row.status] || row.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-sm">
                        <div className="space-y-1">
                          {errors.map((err, i) => (
                            <div key={i} className="flex items-start text-red-600">
                              <XCircle className="h-4 w-4 mt-0.5 mr-1 flex-shrink-0" />
                              <span>{err}</span>
                            </div>
                          ))}
                          {warnings.map((warn, i) => (
                            <div key={i} className="flex items-start text-yellow-600">
                              <AlertTriangle className="h-4 w-4 mt-0.5 mr-1 flex-shrink-0" />
                              <span>{warn}</span>
                            </div>
                          ))}
                          {row.error_message && (
                            <div className="flex items-start text-red-600">
                              <XCircle className="h-4 w-4 mt-0.5 mr-1 flex-shrink-0" />
                              <span>{row.error_message}</span>
                            </div>
                          )}
                          {errors.length === 0 && warnings.length === 0 && !row.error_message && (
                            <div className="flex items-center text-green-600">
                              <CheckCircle className="h-4 w-4 mr-1" />
                              <span>无问题</span>
                            </div>
                          )}
                        </div>
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>

        {canSubmit && (
          <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
            <div className="flex items-start">
              <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
              <div>
                <h3 className="text-sm font-medium text-yellow-800">提交说明</h3>
                <p className="mt-1 text-sm text-yellow-700">
                  提交后将为预检通过（包括有警告）的行创建工单。初始状态为「待分派」的工单将自动分派给指定技师。
                  提交过程中如果遇到版本冲突，将给出提示，不会静默覆盖。
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
