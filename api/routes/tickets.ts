import { Router, type Request, type Response } from 'express'
import {
  findTicketById,
  getTickets,
  getQueue,
  getStatusCounts,
  type TicketQueryParams,
} from '../store/ticketStore.js'
import { getLogsByTicketId, getQualityRecordsByTicketId } from '../store/index.js'
import { authMiddleware, requirePermission, requireRole } from '../auth.js'
import type { TicketPriority, TicketStatus, ApiResponse } from '../types.js'
import {
  createTicket,
  assignTicket,
  acceptTicket,
  submitDiagnosis,
  approveQuote,
  startRepair,
  submitQualityCheck,
  performQualityCheck,
  deliverTicket,
  cancelTicket,
  STATUS_LABELS,
} from '../workflow.js'
import type { AuthPayload } from '../types.js'

const router = Router()

router.use(authMiddleware)

router.get('/counts', (_req: Request, res: Response): void => {
  try {
    const counts = getStatusCounts()
    const result: Record<string, { count: number; label: string }> = {}

    for (const [status, count] of Object.entries(counts)) {
      result[status] = {
        count,
        label: STATUS_LABELS[status as TicketStatus] || status,
      }
    }

    res.json({
      success: true,
      data: result,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get status counts error:', err)
    res.status(500).json({
      success: false,
      error: '获取统计失败',
    } satisfies ApiResponse)
  }
})

router.get('/queue', (_req: Request, res: Response): void => {
  try {
    const tickets = getQueue()
    res.json({
      success: true,
      data: tickets,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get queue error:', err)
    res.status(500).json({
      success: false,
      error: '获取队列失败',
    } satisfies ApiResponse)
  }
})

router.get('/', (req: Request, res: Response): void => {
  try {
    const { status, priority, assigneeId } = req.query

    const params: TicketQueryParams = {}
    if (status) params.status = status as TicketStatus
    if (priority) params.priority = priority as TicketPriority
    if (assigneeId) params.assigneeId = parseInt(assigneeId as string, 10)

    const tickets = getTickets(params)
    res.json({
      success: true,
      data: tickets,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get tickets error:', err)
    res.status(500).json({
      success: false,
      error: '获取工单列表失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id', (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const ticket = findTicketById(id)

    if (!ticket) {
      res.status(404).json({
        success: false,
        error: '工单不存在',
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: ticket,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get ticket error:', err)
    res.status(500).json({
      success: false,
      error: '获取工单详情失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id/logs', (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)

    if (!findTicketById(id)) {
      res.status(404).json({
        success: false,
        error: '工单不存在',
      } satisfies ApiResponse)
      return
    }

    const logs = getLogsByTicketId(id)
    res.json({
      success: true,
      data: logs,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get ticket logs error:', err)
    res.status(500).json({
      success: false,
      error: '获取操作日志失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id/quality-records', (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)

    if (!findTicketById(id)) {
      res.status(404).json({
        success: false,
        error: '工单不存在',
      } satisfies ApiResponse)
      return
    }

    const records = getQualityRecordsByTicketId(id)
    res.json({
      success: true,
      data: records,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get quality records error:', err)
    res.status(500).json({
      success: false,
      error: '获取质检记录失败',
    } satisfies ApiResponse)
  }
})

router.post('/', requirePermission('tickets:create'), (req: Request, res: Response): void => {
  try {
    const { customerName, customerPhone, deviceType, deviceModel, faultDescription, priority } = req.body
    const operator = req.user as AuthPayload

    if (!customerName || !customerPhone || !deviceType || !deviceModel || !faultDescription || !priority) {
      res.status(400).json({
        success: false,
        error: '缺少必填字段',
      } satisfies ApiResponse)
      return
    }

    const ticket = createTicket(
      {
        customerName,
        customerPhone,
        deviceType,
        deviceModel,
        faultDescription,
        priority,
        createdBy: operator.userId,
        createdByName: operator.name,
      },
      operator
    )

    res.status(201).json({
      success: true,
      data: ticket,
      message: '工单创建成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Create ticket error:', err)
    res.status(500).json({
      success: false,
      error: '创建工单失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/assign', requirePermission('tickets:assign'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { assigneeId, version } = req.body
    const operator = req.user as AuthPayload

    if (!assigneeId || !version) {
      res.status(400).json({
        success: false,
        error: '缺少必填字段',
      } satisfies ApiResponse)
      return
    }

    const result = assignTicket(id, assigneeId, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '分派成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Assign ticket error:', err)
    res.status(500).json({
      success: false,
      error: '分派失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/accept', requirePermission('tickets:accept'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { version } = req.body
    const operator = req.user as AuthPayload

    if (!version) {
      res.status(400).json({
        success: false,
        error: '缺少版本号',
      } satisfies ApiResponse)
      return
    }

    const result = acceptTicket(id, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '接单成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Accept ticket error:', err)
    res.status(500).json({
      success: false,
      error: '接单失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/diagnose', requirePermission('tickets:diagnose'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { diagnosisResult, estimatedCost, version } = req.body
    const operator = req.user as AuthPayload

    if (!diagnosisResult || estimatedCost === undefined || !version) {
      res.status(400).json({
        success: false,
        error: '缺少必填字段',
      } satisfies ApiResponse)
      return
    }

    const result = submitDiagnosis(id, diagnosisResult, parseFloat(estimatedCost), version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '诊断提交成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Diagnose ticket error:', err)
    res.status(500).json({
      success: false,
      error: '提交诊断失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/approve-quote', requirePermission('tickets:approve-quote'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { version } = req.body
    const operator = req.user as AuthPayload

    if (!version) {
      res.status(400).json({
        success: false,
        error: '缺少版本号',
      } satisfies ApiResponse)
      return
    }

    const result = approveQuote(id, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '报价确认成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Approve quote error:', err)
    res.status(500).json({
      success: false,
      error: '确认报价失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/repair', requirePermission('tickets:repair'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { version } = req.body
    const operator = req.user as AuthPayload

    if (!version) {
      res.status(400).json({
        success: false,
        error: '缺少版本号',
      } satisfies ApiResponse)
      return
    }

    const result = startRepair(id, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '开始维修',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Start repair error:', err)
    res.status(500).json({
      success: false,
      error: '开始维修失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/submit-quality', requirePermission('tickets:submit-quality'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { repairDetails, actualCost, version } = req.body
    const operator = req.user as AuthPayload

    if (!repairDetails || actualCost === undefined || !version) {
      res.status(400).json({
        success: false,
        error: '缺少必填字段',
      } satisfies ApiResponse)
      return
    }

    const result = submitQualityCheck(id, repairDetails, parseFloat(actualCost), version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '提交质检成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Submit quality error:', err)
    res.status(500).json({
      success: false,
      error: '提交质检失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/quality-check', requirePermission('tickets:quality-check'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { passed, comment, version } = req.body
    const operator = req.user as AuthPayload

    if (passed === undefined || !version) {
      res.status(400).json({
        success: false,
        error: '缺少必填字段',
      } satisfies ApiResponse)
      return
    }

    const result = performQualityCheck(id, passed, comment, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: passed ? '质检通过' : '质检不通过',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Quality check error:', err)
    res.status(500).json({
      success: false,
      error: '质检失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/deliver', requireRole(['clerk']), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { version } = req.body
    const operator = req.user as AuthPayload

    if (!version) {
      res.status(400).json({
        success: false,
        error: '缺少版本号',
      } satisfies ApiResponse)
      return
    }

    const result = deliverTicket(id, version, operator)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '交付成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Deliver ticket error:', err)
    res.status(500).json({
      success: false,
      error: '交付失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/cancel', requirePermission('tickets:cancel'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const { reason, version } = req.body
    const operator = req.user as AuthPayload

    if (!version) {
      res.status(400).json({
        success: false,
        error: '缺少版本号',
      } satisfies ApiResponse)
      return
    }

    const result = cancelTicket(id, version, operator, reason)

    if (!result.success) {
      res.status(400).json({
        success: false,
        error: result.error,
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: result.ticket,
      message: '取消成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Cancel ticket error:', err)
    res.status(500).json({
      success: false,
      error: '取消失败',
    } satisfies ApiResponse)
  }
})

export default router
