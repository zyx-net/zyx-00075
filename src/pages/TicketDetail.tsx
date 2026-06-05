import { useState, useEffect, useCallback } from 'react'
import { useParams, useNavigate, Link } from 'react-router-dom'
import {
  ArrowLeft,
  RefreshCw,
  User as UserIcon,
  Phone,
  Calendar,
  Clock,
  AlertCircle,
  CheckCircle,
  XCircle,
  Wrench,
  Eye,
  Package,
  ClipboardCheck,
  FileText,
  Ban,
} from 'lucide-react'
import Layout from '../components/Layout'
import { StatusBadge, PriorityBadge, RoleBadge } from '../components/StatusBadge'
import OperationHistory from '../components/OperationHistory'
import { ticketApi, authApi } from '../lib/apiClient'
import { useAuthStore, hasPermission, hasRole } from '../store/authStore'
import { STATUS_LABELS } from '../constants'
import dayjs from 'dayjs'
import type { Ticket, OperationLog, QualityRecord, User } from '../types'

type ModalType =
  | 'assign'
  | 'diagnose'
  | 'repair'
  | 'submitQuality'
  | 'qualityCheck'
  | 'deliver'
  | 'cancel'
  | null

export default function TicketDetail() {
  const { id } = useParams<{ id: string }>()
  const navigate = useNavigate()
  const { user } = useAuthStore()

  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [logs, setLogs] = useState<OperationLog[]>([])
  const [qualityRecords, setQualityRecords] = useState<QualityRecord[]>([])
  const [technicians, setTechnicians] = useState<User[]>([])
  const [loading, setLoading] = useState(true)
  const [submitting, setSubmitting] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [activeModal, setActiveModal] = useState<ModalType>(null)

  const [formData, setFormData] = useState({
    assigneeId: 0,
    diagnosisResult: '',
    estimatedCost: '',
    repairDetails: '',
    actualCost: '',
    qualityPassed: true,
    qualityComment: '',
    deliveryConfirmer: '',
    deliveryNotes: '',
    deliveryReceiptNo: '',
    deliveryPhoneLast4: '',
    cancelReason: '',
  })

  const fetchData = useCallback(async () => {
    if (!id) return

    setLoading(true)
    setError('')

    try {
      const [ticketRes, logsRes, qualityRes, usersRes] = await Promise.all([
        ticketApi.getDetail(parseInt(id, 10)),
        ticketApi.getLogs(parseInt(id, 10)),
        ticketApi.getQualityRecords(parseInt(id, 10)),
        authApi.getUsers(),
      ])

      if (ticketRes.success && ticketRes.data) {
        setTicket(ticketRes.data)
      } else {
        setError(ticketRes.error || '获取工单详情失败')
      }

      if (logsRes.success && logsRes.data) {
        setLogs(logsRes.data)
      }

      if (qualityRes.success && qualityRes.data) {
        setQualityRecords(qualityRes.data)
      }

      if (usersRes.success && usersRes.data) {
        setTechnicians(usersRes.data.filter(u => u.role === 'technician'))
      }
    } catch (err) {
      setError('网络错误，请稍后重试')
    } finally {
      setLoading(false)
    }
  }, [id])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => setSuccess(''), 3000)
      return () => clearTimeout(timer)
    }
  }, [success])

  const showError = (msg: string) => {
    setError(msg)
    setTimeout(() => setError(''), 5000)
  }

  const showSuccess = (msg: string) => {
    setSuccess(msg)
    setActiveModal(null)
    fetchData()
  }

  const handleAction = async (action: () => Promise<any>, successMsg: string) => {
    if (!ticket) return

    setSubmitting(true)
    setError('')

    try {
      const result = await action()
      if (result.success) {
        showSuccess(successMsg)
      } else {
        showError(result.error || '操作失败')
      }
    } catch (err) {
      showError('操作失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  const handleAssign = () => {
    if (!ticket || !formData.assigneeId) {
      showError('请选择技师')
      return
    }
    handleAction(
      () => ticketApi.assign(ticket.id, formData.assigneeId, ticket.version),
      '分派成功'
    )
  }

  const handleAccept = () => {
    if (!ticket) return
    handleAction(
      () => ticketApi.accept(ticket.id, ticket.version),
      '接单成功'
    )
  }

  const handleDiagnose = () => {
    if (!ticket || !formData.diagnosisResult.trim() || !formData.estimatedCost) {
      showError('请填写诊断结果和预估费用')
      return
    }
    handleAction(
      () => ticketApi.diagnose(ticket.id, formData.diagnosisResult, parseFloat(formData.estimatedCost), ticket.version),
      '诊断提交成功'
    )
  }

  const handleApproveQuote = () => {
    if (!ticket) return
    handleAction(
      () => ticketApi.approveQuote(ticket.id, ticket.version),
      '报价确认成功'
    )
  }

  const handleRepair = () => {
    if (!ticket) return
    handleAction(
      () => ticketApi.repair(ticket.id, ticket.version),
      '开始维修'
    )
  }

  const handleSubmitQuality = () => {
    if (!ticket || !formData.repairDetails.trim() || formData.actualCost === '') {
      showError('请填写维修详情和实际费用')
      return
    }
    handleAction(
      () => ticketApi.submitQuality(ticket.id, formData.repairDetails, parseFloat(formData.actualCost), ticket.version),
      '提交质检成功'
    )
  }

  const handleQualityCheck = () => {
    if (!ticket) return
    handleAction(
      () => ticketApi.qualityCheck(ticket.id, formData.qualityPassed, formData.qualityComment || undefined, ticket.version),
      formData.qualityPassed ? '质检通过' : '质检不通过'
    )
  }

  const handleDeliver = () => {
    if (!ticket) return
    if (!formData.deliveryConfirmer.trim()) {
      showError('请填写客户确认人')
      return
    }
    if (!formData.deliveryNotes.trim()) {
      showError('请填写交付备注')
      return
    }
    if (formData.deliveryPhoneLast4 && !/^\d{4}$/.test(formData.deliveryPhoneLast4)) {
      showError('联系电话后四位必须是4位数字')
      return
    }
    handleAction(
      () => ticketApi.deliver(ticket.id, ticket.version, {
        confirmer: formData.deliveryConfirmer,
        notes: formData.deliveryNotes,
        receiptNo: formData.deliveryReceiptNo || undefined,
        phoneLast4: formData.deliveryPhoneLast4 || undefined,
      }),
      '交付成功'
    )
  }

  const handleCancel = () => {
    if (!ticket) return
    handleAction(
      () => ticketApi.cancel(ticket.id, formData.cancelReason || undefined, ticket.version),
      '取消成功'
    )
  }

  const canAccept = ticket &&
    hasPermission(user, 'tickets:accept') &&
    ticket.status === 'assigned' &&
    ticket.assignee_id === user?.id

  const canAssign = ticket &&
    hasPermission(user, 'tickets:assign') &&
    ticket.status === 'created'

  const canDiagnose = ticket &&
    hasPermission(user, 'tickets:diagnose') &&
    ticket.status === 'diagnosing' &&
    ticket.assignee_id === user?.id

  const canApproveQuote = ticket &&
    hasPermission(user, 'tickets:approve-quote') &&
    ticket.status === 'quoting'

  const canRepair = ticket &&
    hasPermission(user, 'tickets:repair') &&
    ticket.status === 'quote_approved' &&
    ticket.assignee_id === user?.id

  const canSubmitQuality = ticket &&
    hasPermission(user, 'tickets:submit-quality') &&
    ticket.status === 'repairing' &&
    ticket.assignee_id === user?.id

  const canQualityCheck = ticket &&
    hasPermission(user, 'tickets:quality-check') &&
    ticket.status === 'quality_check'

  const canDeliver = ticket &&
    hasRole(user, ['clerk']) &&
    ticket.status === 'quality_passed'

  const canCancel = ticket &&
    hasPermission(user, 'tickets:cancel') &&
    ticket.status !== 'delivered' &&
    ticket.status !== 'cancelled'

  const isTerminal = ticket && (ticket.status === 'delivered' || ticket.status === 'cancelled')

  if (loading) {
    return (
      <Layout>
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">加载中...</p>
        </div>
      </Layout>
    )
  }

  if (!ticket) {
    return (
      <Layout>
        <div className="text-center py-12">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto" />
          <p className="mt-4 text-gray-600">{error || '工单不存在'}</p>
          <Link to="/" className="mt-4 inline-block text-blue-600 hover:underline">
            返回队列
          </Link>
        </div>
      </Layout>
    )
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex justify-between items-center">
          <div>
            <button
              onClick={() => navigate(-1)}
              className="inline-flex items-center text-gray-600 hover:text-gray-900 mb-2"
            >
              <ArrowLeft className="h-4 w-4 mr-1" />
              返回
            </button>
            <h1 className="text-2xl font-bold text-gray-900">
              工单详情 - {ticket.ticket_no}
            </h1>
          </div>
          <button
            onClick={fetchData}
            className="inline-flex items-center px-4 py-2 border border-gray-300 rounded-lg text-sm font-medium text-gray-700 bg-white hover:bg-gray-50 transition-colors"
          >
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </button>
        </div>

        {error && (
          <div className="flex items-center p-4 bg-red-50 border border-red-200 rounded-xl text-red-700">
            <AlertCircle className="h-5 w-5 mr-3 flex-shrink-0" />
            <span>{error}</span>
          </div>
        )}

        {success && (
          <div className="flex items-center p-4 bg-green-50 border border-green-200 rounded-xl text-green-700">
            <CheckCircle className="h-5 w-5 mr-3 flex-shrink-0" />
            <span>{success}</span>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <div className="flex flex-wrap items-center gap-3 mb-6">
                <StatusBadge status={ticket.status} />
                <PriorityBadge priority={ticket.priority} />
                <span className="text-sm text-gray-500 flex items-center">
                  <Clock className="h-3 w-3 mr-1" />
                  版本 v{ticket.version}
                </span>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">客户信息</h3>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span className="font-medium">{ticket.customer_name}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Phone className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{ticket.customer_phone}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">设备信息</h3>
                  <div className="space-y-1">
                    <p className="text-sm font-medium">{ticket.device_type} {ticket.device_model}</p>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">创建信息</h3>
                  <div className="space-y-2">
                    <div className="flex items-center text-sm">
                      <UserIcon className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{ticket.created_by_name}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 mr-2 text-gray-400" />
                      <span>{dayjs(ticket.created_at).format('YYYY-MM-DD HH:mm')}</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-sm font-medium text-gray-500 mb-2">分派信息</h3>
                  {ticket.assignee_name ? (
                    <div className="space-y-2">
                      <div className="flex items-center text-sm">
                        <Wrench className="h-4 w-4 mr-2 text-blue-500" />
                        <span className="font-medium text-blue-600">{ticket.assignee_name}</span>
                      </div>
                    </div>
                  ) : (
                    <p className="text-sm text-gray-400">暂未分派</p>
                  )}
                </div>
              </div>

              <div className="mt-6 pt-6 border-t border-gray-100">
                <h3 className="text-sm font-medium text-gray-500 mb-2">故障描述</h3>
                <p className="text-sm text-gray-700 bg-gray-50 rounded-lg p-3">
                  {ticket.fault_description}
                </p>
              </div>

              {ticket.diagnosis_result && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">诊断结果</h3>
                  <p className="text-sm text-gray-700 bg-yellow-50 rounded-lg p-3">
                    {ticket.diagnosis_result}
                  </p>
                </div>
              )}

              {ticket.repair_details && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-500 mb-2">维修详情</h3>
                  <p className="text-sm text-gray-700 bg-purple-50 rounded-lg p-3">
                    {ticket.repair_details}
                  </p>
                </div>
              )}

              {ticket.delivery_confirmer && (
                <div className="mt-4 pt-4 border-t border-gray-100">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">交付信息</h3>
                  <div className="bg-green-50 rounded-lg p-4 space-y-3">
                    <div className="flex items-center text-sm">
                      <UserIcon className="h-4 w-4 mr-2 text-green-600" />
                      <span className="text-gray-600 w-24">客户确认人：</span>
                      <span className="font-medium text-gray-900">{ticket.delivery_confirmer}</span>
                    </div>
                    <div className="flex items-start text-sm">
                      <ClipboardCheck className="h-4 w-4 mr-2 text-green-600 mt-0.5" />
                      <span className="text-gray-600 w-24 flex-shrink-0">交付备注：</span>
                      <span className="text-gray-900">{ticket.delivery_notes}</span>
                    </div>
                    {ticket.delivery_receipt_no && (
                      <div className="flex items-center text-sm">
                        <FileText className="h-4 w-4 mr-2 text-green-600" />
                        <span className="text-gray-600 w-24">回执编号：</span>
                        <span className="font-medium text-gray-900">{ticket.delivery_receipt_no}</span>
                      </div>
                    )}
                    {ticket.delivery_phone_last4 && (
                      <div className="flex items-center text-sm">
                        <Phone className="h-4 w-4 mr-2 text-green-600" />
                        <span className="text-gray-600 w-24">联系电话后四位：</span>
                        <span className="font-medium text-gray-900">{ticket.delivery_phone_last4}</span>
                      </div>
                    )}
                    <div className="flex items-center text-sm">
                      <UserIcon className="h-4 w-4 mr-2 text-green-600" />
                      <span className="text-gray-600 w-24">交付人：</span>
                      <span className="font-medium text-gray-900">{ticket.delivered_by_name}</span>
                    </div>
                    <div className="flex items-center text-sm">
                      <Calendar className="h-4 w-4 mr-2 text-green-600" />
                      <span className="text-gray-600 w-24">交付时间：</span>
                      <span className="font-medium text-gray-900">
                        {ticket.delivered_at ? dayjs(ticket.delivered_at).format('YYYY-MM-DD HH:mm') : '-'}
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {(ticket.estimated_cost !== null || ticket.actual_cost !== null) && (
                <div className="mt-4 pt-4 border-t border-gray-100 grid grid-cols-2 gap-4">
                  {ticket.estimated_cost !== null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">预估费用</h3>
                      <p className="text-lg font-semibold text-gray-900">
                        ¥{ticket.estimated_cost.toFixed(2)}
                      </p>
                    </div>
                  )}
                  {ticket.actual_cost !== null && (
                    <div>
                      <h3 className="text-sm font-medium text-gray-500 mb-1">实际费用</h3>
                      <p className="text-lg font-semibold text-blue-600">
                        ¥{ticket.actual_cost.toFixed(2)}
                      </p>
                    </div>
                  )}
                </div>
              )}
            </div>

            {qualityRecords.length > 0 && (
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">质检记录</h2>
                <div className="space-y-3">
                  {qualityRecords.map((record) => (
                    <div
                      key={record.id}
                      className={`p-4 rounded-lg border ${
                        record.passed
                          ? 'bg-green-50 border-green-200'
                          : 'bg-red-50 border-red-200'
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="flex items-center">
                          {record.passed ? (
                            <CheckCircle className="h-5 w-5 text-green-600 mr-2" />
                          ) : (
                            <XCircle className="h-5 w-5 text-red-600 mr-2" />
                          )}
                          <span className={`font-medium ${record.passed ? 'text-green-800' : 'text-red-800'}`}>
                            {record.passed ? '质检通过' : '质检不通过'}
                          </span>
                        </div>
                        <span className="text-xs text-gray-500">
                          {dayjs(record.created_at).format('YYYY-MM-DD HH:mm')}
                        </span>
                      </div>
                      <div className="flex items-center text-sm text-gray-600 mb-1">
                        <span className="font-medium">{record.inspector_name}</span>
                        <RoleBadge role="quality_inspector" className="ml-2" />
                      </div>
                      {record.comment && (
                        <p className="text-sm text-gray-600 mt-2">{record.comment}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}

            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">操作历史</h2>
              <OperationHistory logs={logs} />
            </div>
          </div>

          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">可用操作</h2>

              {isTerminal ? (
                <div className="text-center py-6 text-gray-500">
                  {ticket.status === 'delivered' ? (
                    <div>
                      <CheckCircle className="h-12 w-12 text-green-500 mx-auto mb-2" />
                      <p>工单已交付，无法再操作</p>
                    </div>
                  ) : (
                    <div>
                      <XCircle className="h-12 w-12 text-gray-400 mx-auto mb-2" />
                      <p>工单已取消，无法再操作</p>
                    </div>
                  )}
                </div>
              ) : (
                <div className="space-y-3">
                  {canAssign && (
                    <button
                      onClick={() => setActiveModal('assign')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors"
                    >
                      <UserIcon className="h-4 w-4 mr-2" />
                      分派工单
                    </button>
                  )}

                  {canAccept && (
                    <button
                      onClick={handleAccept}
                      disabled={submitting}
                      className="w-full flex items-center justify-center px-4 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      接单
                    </button>
                  )}

                  {canDiagnose && (
                    <button
                      onClick={() => setActiveModal('diagnose')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-yellow-600 hover:bg-yellow-700 text-white rounded-lg transition-colors"
                    >
                      <Eye className="h-4 w-4 mr-2" />
                      提交诊断和报价
                    </button>
                  )}

                  {canApproveQuote && (
                    <button
                      onClick={handleApproveQuote}
                      disabled={submitting}
                      className="w-full flex items-center justify-center px-4 py-3 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <CheckCircle className="h-4 w-4 mr-2" />
                      确认报价
                    </button>
                  )}

                  {canRepair && (
                    <button
                      onClick={handleRepair}
                      disabled={submitting}
                      className="w-full flex items-center justify-center px-4 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg transition-colors disabled:opacity-50"
                    >
                      <Wrench className="h-4 w-4 mr-2" />
                      开始维修
                    </button>
                  )}

                  {canSubmitQuality && (
                    <button
                      onClick={() => setActiveModal('submitQuality')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      提交质检
                    </button>
                  )}

                  {canQualityCheck && (
                    <button
                      onClick={() => setActiveModal('qualityCheck')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-pink-600 hover:bg-pink-700 text-white rounded-lg transition-colors"
                    >
                      <ClipboardCheck className="h-4 w-4 mr-2" />
                      执行质检
                    </button>
                  )}

                  {canDeliver && (
                    <button
                      onClick={() => setActiveModal('deliver')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-green-600 hover:bg-green-700 text-white rounded-lg transition-colors"
                    >
                      <Package className="h-4 w-4 mr-2" />
                      交付客户
                    </button>
                  )}

                  {canCancel && (
                    <button
                      onClick={() => setActiveModal('cancel')}
                      className="w-full flex items-center justify-center px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg transition-colors"
                    >
                      <Ban className="h-4 w-4 mr-2" />
                      取消工单
                    </button>
                  )}

                  {!canAssign && !canAccept && !canDiagnose && !canApproveQuote &&
                   !canRepair && !canSubmitQuality && !canQualityCheck && !canDeliver && (
                    <div className="text-center py-4 text-gray-500">
                      <p className="text-sm">当前状态：{STATUS_LABELS[ticket.status]}</p>
                      <p className="text-xs mt-1">您暂时没有可执行的操作</p>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="bg-blue-50 rounded-xl border border-blue-200 p-4">
              <h3 className="text-sm font-medium text-blue-800 mb-2">流程说明</h3>
              <ul className="text-xs text-blue-700 space-y-1">
                <li>• 店员建单 → 分派给技师</li>
                <li>• 技师接单 → 诊断报价</li>
                <li>• 店员确认报价 → 技师维修</li>
                <li>• 维修完成 → 提交质检</li>
                <li>• 质检员审核 → 通过/不通过</li>
                <li>• 质检通过 → 店员交付</li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {activeModal === 'assign' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">分派工单</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">选择技师</label>
                <select
                  value={formData.assigneeId}
                  onChange={(e) => setFormData({ ...formData, assigneeId: parseInt(e.target.value, 10) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                >
                  <option value={0}>请选择</option>
                  {technicians.map((tech) => (
                    <option key={tech.id} value={tech.id}>
                      {tech.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleAssign}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确定分派'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'diagnose' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">提交诊断和报价</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">诊断结果</label>
                <textarea
                  value={formData.diagnosisResult}
                  onChange={(e) => setFormData({ ...formData, diagnosisResult: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="请输入诊断结果..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">预估费用 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.estimatedCost}
                  onChange={(e) => setFormData({ ...formData, estimatedCost: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDiagnose}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? '提交中...' : '提交'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'submitQuality' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">提交质检</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">维修详情</label>
                <textarea
                  value={formData.repairDetails}
                  onChange={(e) => setFormData({ ...formData, repairDetails: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="请输入维修详情..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">实际费用 (元)</label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={formData.actualCost}
                  onChange={(e) => setFormData({ ...formData, actualCost: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="0.00"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleSubmitQuality}
                disabled={submitting}
                className="px-4 py-2 bg-pink-600 hover:bg-pink-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? '提交中...' : '提交质检'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'qualityCheck' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">执行质检</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">质检结果</label>
                <div className="flex gap-4">
                  <label className="flex items-center px-4 py-2 border rounded-lg cursor-pointer flex-1 justify-center hover:bg-green-50">
                    <input
                      type="radio"
                      checked={formData.qualityPassed}
                      onChange={() => setFormData({ ...formData, qualityPassed: true })}
                      className="mr-2"
                    />
                    <CheckCircle className="h-4 w-4 text-green-600 mr-1" />
                    通过
                  </label>
                  <label className="flex items-center px-4 py-2 border rounded-lg cursor-pointer flex-1 justify-center hover:bg-red-50">
                    <input
                      type="radio"
                      checked={!formData.qualityPassed}
                      onChange={() => setFormData({ ...formData, qualityPassed: false })}
                      className="mr-2"
                    />
                    <XCircle className="h-4 w-4 text-red-600 mr-1" />
                    不通过
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">质检备注</label>
                <textarea
                  value={formData.qualityComment}
                  onChange={(e) => setFormData({ ...formData, qualityComment: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="请输入质检备注（选填）..."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleQualityCheck}
                disabled={submitting}
                className={`px-4 py-2 text-white rounded-lg disabled:opacity-50 ${
                  formData.qualityPassed
                    ? 'bg-green-600 hover:bg-green-700'
                    : 'bg-red-600 hover:bg-red-700'
                }`}
              >
                {submitting ? '提交中...' : '确认'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'cancel' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">取消工单</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">取消原因</label>
                <textarea
                  value={formData.cancelReason}
                  onChange={(e) => setFormData({ ...formData, cancelReason: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="请输入取消原因（选填）..."
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                返回
              </button>
              <button
                onClick={handleCancel}
                disabled={submitting}
                className="px-4 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确认取消'}
              </button>
            </div>
          </div>
        </div>
      )}

      {activeModal === 'deliver' && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-xl max-w-md w-full p-6">
            <h3 className="text-lg font-semibold mb-4">交付确认</h3>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  客户确认人 <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  value={formData.deliveryConfirmer}
                  onChange={(e) => setFormData({ ...formData, deliveryConfirmer: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="请输入客户确认人姓名"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  交付备注 <span className="text-red-500">*</span>
                </label>
                <textarea
                  value={formData.deliveryNotes}
                  onChange={(e) => setFormData({ ...formData, deliveryNotes: e.target.value })}
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg resize-none"
                  placeholder="请输入交付备注，如设备状态、注意事项等..."
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  回执编号 <span className="text-gray-400 text-xs">(选填)</span>
                </label>
                <input
                  type="text"
                  value={formData.deliveryReceiptNo}
                  onChange={(e) => setFormData({ ...formData, deliveryReceiptNo: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="请输入回执编号"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  联系电话后四位 <span className="text-gray-400 text-xs">(选填，4位数字)</span>
                </label>
                <input
                  type="text"
                  value={formData.deliveryPhoneLast4}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, '').slice(0, 4)
                    setFormData({ ...formData, deliveryPhoneLast4: val })
                  }}
                  maxLength={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg"
                  placeholder="请输入联系电话后四位"
                />
              </div>
            </div>
            <div className="flex justify-end space-x-3 mt-6">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 border border-gray-300 rounded-lg text-gray-700 hover:bg-gray-50"
              >
                取消
              </button>
              <button
                onClick={handleDeliver}
                disabled={submitting}
                className="px-4 py-2 bg-green-600 hover:bg-green-700 text-white rounded-lg disabled:opacity-50"
              >
                {submitting ? '提交中...' : '确认交付'}
              </button>
            </div>
          </div>
        </div>
      )}
    </Layout>
  )
}
