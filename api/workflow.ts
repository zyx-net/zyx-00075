import type { Ticket, TicketStatus, AuthPayload } from './types.js'
import {
  createTicket as storeCreateTicket,
  updateTicket,
  findTicketById,
  type CreateTicketParams,
} from './store/ticketStore.js'
import {
  createOperationLog,
  createQualityRecord,
  type CreateQualityRecordParams,
} from './store/index.js'
import { findUserById } from './store/userStore.js'
import { getRoleLabel } from './auth.js'

export const STATE_TRANSITIONS: Record<TicketStatus, TicketStatus[]> = {
  created: ['assigned', 'cancelled'],
  assigned: ['diagnosing', 'cancelled'],
  diagnosing: ['quoting', 'cancelled'],
  quoting: ['quote_approved', 'cancelled'],
  quote_approved: ['repairing', 'cancelled'],
  repairing: ['quality_check', 'cancelled'],
  quality_check: ['quality_passed', 'quality_failed'],
  quality_passed: ['delivered', 'cancelled'],
  quality_failed: ['repairing', 'cancelled'],
  delivered: [],
  cancelled: [],
}

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '已创建',
  assigned: '已分派',
  diagnosing: '诊断中',
  quoting: '报价中',
  quote_approved: '报价已确认',
  repairing: '维修中',
  quality_check: '待质检',
  quality_passed: '质检通过',
  quality_failed: '质检不通过',
  delivered: '已交付',
  cancelled: '已取消',
}

export const OPERATION_LABELS: Record<string, string> = {
  create: '创建工单',
  assign: '分派工单',
  accept: '接单',
  diagnose: '提交诊断',
  approve_quote: '确认报价',
  start_repair: '开始维修',
  submit_quality: '提交质检',
  quality_pass: '质检通过',
  quality_fail: '质检不通过',
  deliver: '交付客户',
  cancel: '取消工单',
}

export function canTransition(from: TicketStatus, to: TicketStatus): boolean {
  return STATE_TRANSITIONS[from]?.includes(to) ?? false
}

export function isTerminalStatus(status: TicketStatus): boolean {
  return status === 'delivered' || status === 'cancelled'
}

export function checkVersion(current: Ticket, version: number): void {
  if (current.version !== version) {
    throw new Error('VERSION_CONFLICT')
  }
}

export interface TransitionResult {
  success: boolean
  ticket?: Ticket
  error?: string
}

export function createTicket(params: CreateTicketParams, operator: AuthPayload): Ticket {
  const ticket = storeCreateTicket(params)

  createOperationLog({
    ticketId: ticket.id,
    operation: OPERATION_LABELS.create,
    operatorId: operator.userId,
    operatorName: operator.name,
    operatorRole: operator.role,
    fromStatus: null,
    toStatus: ticket.status,
    remark: `创建工单，客户：${params.customerName}，设备：${params.deviceType} ${params.deviceModel}`,
  })

  return ticket
}

export function assignTicket(
  ticketId: number,
  assigneeId: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (!canTransition(ticket.status, 'assigned')) {
    return {
      success: false,
      error: `状态不允许分派：当前状态「${STATUS_LABELS[ticket.status]}」不能分派`,
    }
  }

  const assignee = findUserById(assigneeId)
  if (!assignee) {
    return { success: false, error: '指定的技师不存在' }
  }

  if (assignee.role !== 'technician') {
    return { success: false, error: '只能分派给技师角色' }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'assigned',
      assigneeId,
      assigneeName: assignee.name,
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.assign,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'assigned',
        remark: `分派给 ${getRoleLabel(assignee.role)} ${assignee.name}`,
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '分派失败' }
  }
}

export function acceptTicket(
  ticketId: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (ticket.assignee_id !== operator.userId) {
    return { success: false, error: '只能接受分派给自己的工单' }
  }

  if (!canTransition(ticket.status, 'diagnosing')) {
    return {
      success: false,
      error: `状态不允许接单：当前状态「${STATUS_LABELS[ticket.status]}」不能接单`,
    }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'diagnosing',
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.accept,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'diagnosing',
        remark: '已接单，开始诊断',
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '接单失败' }
  }
}

export function submitDiagnosis(
  ticketId: number,
  diagnosisResult: string,
  estimatedCost: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (ticket.assignee_id !== operator.userId) {
    return { success: false, error: '只能处理分派给自己的工单' }
  }

  if (!canTransition(ticket.status, 'quoting')) {
    return {
      success: false,
      error: `状态不允许提交诊断：当前状态「${STATUS_LABELS[ticket.status]}」不能提交诊断`,
    }
  }

  if (!diagnosisResult?.trim()) {
    return { success: false, error: '诊断结果不能为空' }
  }

  if (estimatedCost < 0) {
    return { success: false, error: '预估费用不能为负数' }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'quoting',
      diagnosisResult,
      estimatedCost,
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.diagnose,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'quoting',
        remark: `诊断结果：${diagnosisResult}，预估费用：¥${estimatedCost.toFixed(2)}`,
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '提交诊断失败' }
  }
}

export function approveQuote(
  ticketId: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (!canTransition(ticket.status, 'quote_approved')) {
    return {
      success: false,
      error: `状态不允许确认报价：当前状态「${STATUS_LABELS[ticket.status]}」不能确认报价`,
    }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'quote_approved',
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.approve_quote,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'quote_approved',
        remark: '报价已确认，可以开始维修',
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '确认报价失败' }
  }
}

export function startRepair(
  ticketId: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (ticket.assignee_id !== operator.userId) {
    return { success: false, error: '只能处理分派给自己的工单' }
  }

  if (!canTransition(ticket.status, 'repairing')) {
    return {
      success: false,
      error: `状态不允许开始维修：当前状态「${STATUS_LABELS[ticket.status]}」不能开始维修`,
    }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'repairing',
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.start_repair,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'repairing',
        remark: '开始维修',
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '开始维修失败' }
  }
}

export function submitQualityCheck(
  ticketId: number,
  repairDetails: string,
  actualCost: number,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (ticket.assignee_id !== operator.userId) {
    return { success: false, error: '只能处理分派给自己的工单' }
  }

  if (!canTransition(ticket.status, 'quality_check')) {
    return {
      success: false,
      error: `状态不允许提交质检：当前状态「${STATUS_LABELS[ticket.status]}」不能提交质检，请先完成维修流程`,
    }
  }

  if (!repairDetails?.trim()) {
    return { success: false, error: '维修详情不能为空' }
  }

  if (actualCost < 0) {
    return { success: false, error: '实际费用不能为负数' }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'quality_check',
      repairDetails,
      actualCost,
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.submit_quality,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'quality_check',
        remark: `维修完成，提交质检。维修详情：${repairDetails}，实际费用：¥${actualCost.toFixed(2)}`,
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '提交质检失败' }
  }
}

export function performQualityCheck(
  ticketId: number,
  passed: boolean,
  comment: string | undefined,
  currentVersion: number,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (ticket.status !== 'quality_check') {
    return {
      success: false,
      error: `状态不允许质检：当前状态「${STATUS_LABELS[ticket.status]}」不是待质检状态`,
    }
  }

  const toStatus = passed ? 'quality_passed' : 'quality_failed'

  if (!canTransition(ticket.status, toStatus)) {
    return {
      success: false,
      error: `状态不允许流转到「${STATUS_LABELS[toStatus]}」`,
    }
  }

  try {
    const qualityParams: CreateQualityRecordParams = {
      ticketId,
      inspectorId: operator.userId,
      inspectorName: operator.name,
      passed,
      comment,
    }
    createQualityRecord(qualityParams)

    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: toStatus,
    })

    if (updated) {
      const operation = passed ? OPERATION_LABELS.quality_pass : OPERATION_LABELS.quality_fail
      const remark = passed
        ? `质检通过${comment ? `，备注：${comment}` : ''}，等待店员交付`
        : `质检不通过${comment ? `，原因：${comment}` : ''}，请返修`

      createOperationLog({
        ticketId,
        operation,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus,
        remark,
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '质检失败' }
  }
}

export interface DeliverParams {
  confirmer: string
  notes: string
  receiptNo?: string
  phoneLast4?: string
}

export function deliverTicket(
  ticketId: number,
  currentVersion: number,
  deliverParams: DeliverParams,
  operator: AuthPayload
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (operator.role !== 'clerk') {
    return {
      success: false,
      error: `越权操作：只有店员可以执行交付操作，当前用户是${getRoleLabel(operator.role)} ${operator.name}`,
    }
  }

  if (ticket.status === 'quality_check') {
    return {
      success: false,
      error: `状态不允许交付：当前状态「${STATUS_LABELS[ticket.status]}」。必须先完成质检复核，质检员审核通过后才能交付。`,
    }
  }

  if (ticket.status === 'quality_failed') {
    return {
      success: false,
      error: `状态不允许交付：当前状态「${STATUS_LABELS[ticket.status]}」。质检未通过，请返修后重新提交质检。`,
    }
  }

  if (!canTransition(ticket.status, 'delivered')) {
    return {
      success: false,
      error: `状态不允许交付：当前状态「${STATUS_LABELS[ticket.status]}」不能直接交付，请先完成质检流程。`,
    }
  }

  if (!deliverParams.confirmer?.trim()) {
    return { success: false, error: '请填写客户确认人' }
  }

  if (!deliverParams.notes?.trim()) {
    return { success: false, error: '请填写交付备注' }
  }

  if (deliverParams.phoneLast4 && !/^\d{4}$/.test(deliverParams.phoneLast4)) {
    return { success: false, error: '联系电话后四位必须是4位数字' }
  }

  try {
    const now = new Date().toISOString()
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'delivered',
      deliveryConfirmer: deliverParams.confirmer.trim(),
      deliveryNotes: deliverParams.notes.trim(),
      deliveryReceiptNo: deliverParams.receiptNo?.trim() || null,
      deliveryPhoneLast4: deliverParams.phoneLast4?.trim() || null,
      deliveredAt: now,
      deliveredBy: operator.userId,
      deliveredByName: operator.name,
    })

    if (updated) {
      const remarkParts = [
        `已交付客户，确认人：${deliverParams.confirmer.trim()}`,
        `备注：${deliverParams.notes.trim()}`,
      ]
      if (deliverParams.receiptNo?.trim()) {
        remarkParts.push(`回执编号：${deliverParams.receiptNo.trim()}`)
      }
      if (deliverParams.phoneLast4?.trim()) {
        remarkParts.push(`联系电话后四位：${deliverParams.phoneLast4.trim()}`)
      }

      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.deliver,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'delivered',
        remark: remarkParts.join('，'),
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '交付失败' }
  }
}

export function cancelTicket(
  ticketId: number,
  currentVersion: number,
  operator: AuthPayload,
  reason?: string
): TransitionResult {
  const ticket = findTicketById(ticketId)
  if (!ticket) {
    return { success: false, error: '工单不存在' }
  }

  if (isTerminalStatus(ticket.status)) {
    return {
      success: false,
      error: `状态不允许取消：当前状态「${STATUS_LABELS[ticket.status]}」是终态，不能取消`,
    }
  }

  if (!canTransition(ticket.status, 'cancelled')) {
    return {
      success: false,
      error: `状态不允许取消：当前状态「${STATUS_LABELS[ticket.status]}」不能取消`,
    }
  }

  try {
    const updated = updateTicket({
      id: ticketId,
      currentVersion,
      status: 'cancelled',
    })

    if (updated) {
      createOperationLog({
        ticketId,
        operation: OPERATION_LABELS.cancel,
        operatorId: operator.userId,
        operatorName: operator.name,
        operatorRole: operator.role,
        fromStatus: ticket.status,
        toStatus: 'cancelled',
        remark: reason ? `取消原因：${reason}` : '取消工单',
      })
    }

    return { success: true, ticket: updated }
  } catch (err) {
    if (err instanceof Error && err.message === 'VERSION_CONFLICT') {
      return {
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      }
    }
    return { success: false, error: '取消失败' }
  }
}
