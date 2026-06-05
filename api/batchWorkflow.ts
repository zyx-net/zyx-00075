import {
  createBatch,
  createRowsBatch,
  updateBatchStatus,
  updateRowPrecheck,
  updateRowResult,
  findBatchById,
  getRowsByBatchId,
  getRowsByBatchIdWithFilter,
  getDuplicatePhones,
  getDuplicateDevices,
  findRowById,
  getBatches as getBatchesFromStore,
  createExportRecord,
  findExportRecordById,
  getLogsByTicketId,
  findTicketByNo,
  findUserById,
  getAllTechnicians,
  createOperationLog,
  type CreateRowParams,
  type CreateTicketParams,
} from './store/index.js'
import {
  createTicket,
  assignTicket,
} from './workflow.js'
import type {
  AuthPayload,
  TicketPriority,
  ImportInitialStatus,
  PrecheckResult,
  PrecheckRowResult,
  BatchSubmitResult,
  ImportRowStatus,
  ImportBatch,
  ImportRow,
} from './types.js'
import { getRoleLabel } from './auth.js'

const PRIORITY_VALUES: TicketPriority[] = ['low', 'medium', 'high', 'urgent']
const INITIAL_STATUS_VALUES: ImportInitialStatus[] = ['created', 'assigned']

const PRIORITY_LABEL_MAP: Record<string, TicketPriority> = {
  '低': 'low',
  '中': 'medium',
  '高': 'high',
  '紧急': 'urgent',
  low: 'low',
  medium: 'medium',
  high: 'high',
  urgent: 'urgent',
}

const STATUS_LABEL_MAP: Record<string, ImportInitialStatus> = {
  '待建': 'created',
  '待分派': 'assigned',
  created: 'created',
  assigned: 'assigned',
}

export interface ParsedCsvRow {
  customerName: string | null
  customerPhone: string | null
  deviceType: string | null
  deviceModel: string | null
  faultDescription: string | null
  priority: string | null
  initialStatus: ImportInitialStatus
  assigneeName: string | null
}

export function parseCsv(content: string): ParsedCsvRow[] {
  const lines = content.split(/\r?\n/).filter(line => line.trim())
  
  if (lines.length === 0) {
    return []
  }

  const headers = parseCsvLine(lines[0])
  
  const headerMap: Record<string, number> = {}
  headers.forEach((h, i) => {
    const normalized = h.trim().toLowerCase()
    headerMap[normalized] = i
  })

  const rows: ParsedCsvRow[] = []

  for (let i = 1; i < lines.length; i++) {
    const values = parseCsvLine(lines[i])
    
    const getValue = (keys: string[]): string | null => {
      for (const key of keys) {
        const idx = headerMap[key.toLowerCase()]
        if (idx !== undefined && values[idx]?.trim()) {
          return values[idx].trim()
        }
      }
      return null
    }

    const priority = getValue(['优先级', 'priority', '紧急程度'])
    const initialStatusStr = getValue(['初始状态', '状态', 'initialstatus', 'status'])
    const initialStatus: ImportInitialStatus = STATUS_LABEL_MAP[initialStatusStr || 'created'] || 'created'

    rows.push({
      customerName: getValue(['客户姓名', '姓名', 'customername', 'name']),
      customerPhone: getValue(['客户电话', '电话', '手机号', 'customerphone', 'phone']),
      deviceType: getValue(['设备类型', '设备', 'devicetype', 'type']),
      deviceModel: getValue(['设备型号', '型号', 'devicemodel', 'model']),
      faultDescription: getValue(['故障描述', '故障', 'faultdescription', 'description', 'problem']),
      priority,
      initialStatus,
      assigneeName: getValue(['负责人', '技师', 'assignee', 'technician']),
    })
  }

  return rows
}

function parseCsvLine(line: string): string[] {
  const result: string[] = []
  let current = ''
  let inQuotes = false

  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"'
        i++
      } else {
        inQuotes = !inQuotes
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current)
      current = ''
    } else {
      current += char
    }
  }
  result.push(current)
  return result
}

export function validatePhone(phone: string): boolean {
  return /^1[3-9]\d{9}$/.test(phone)
}

export interface PrecheckOptions {
  batchId: number
  rows: ParsedCsvRow[]
  operator: AuthPayload
}

export async function precheckBatch(options: PrecheckOptions): Promise<PrecheckResult> {
  const { batchId, rows, operator } = options

  updateBatchStatus({ id: batchId, status: 'prechecking' })

  const createRowParams: CreateRowParams[] = rows.map((row, index) => ({
    batchId,
    rowIndex: index,
    customerName: row.customerName,
    customerPhone: row.customerPhone,
    deviceType: row.deviceType,
    deviceModel: row.deviceModel,
    faultDescription: row.faultDescription,
    priority: row.priority,
    initialStatus: row.initialStatus,
    assigneeId: null,
  }))

  createRowsBatch(createRowParams)

  const allRows = getRowsByBatchId(batchId)

  const technicians = getAllTechnicians()
  const techNameMap: Record<string, number> = {}
  technicians.forEach(t => {
    techNameMap[t.name] = t.id
  })

  const results: PrecheckRowResult[] = []
  const phonesToCheck: string[] = []
  const devicesToCheck: { deviceType: string; deviceModel: string; phone: string }[] = []
  const validRowsForDuplicateCheck: { row: ParsedCsvRow; index: number; priority: TicketPriority | null; assigneeId: number | null }[] = []

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]
    const dbRow = allRows[i]
    const errors: string[] = []
    const warnings: string[] = []
    let valid = true

    if (!row.customerName) {
      errors.push('缺少客户姓名')
      valid = false
    }

    if (!row.customerPhone) {
      errors.push('缺少客户电话')
      valid = false
    } else if (!validatePhone(row.customerPhone)) {
      errors.push('手机号格式不正确')
      valid = false
    }

    if (!row.deviceType) {
      errors.push('缺少设备类型')
      valid = false
    }

    if (!row.deviceModel) {
      errors.push('缺少设备型号')
      valid = false
    }

    if (!row.faultDescription) {
      errors.push('缺少故障描述')
      valid = false
    }

    let priority: TicketPriority | null = null
    if (!row.priority) {
      errors.push('缺少优先级')
      valid = false
    } else {
      priority = PRIORITY_LABEL_MAP[row.priority]
      if (!priority) {
        errors.push('优先级值不正确，有效值：低/中/高/紧急')
        valid = false
      }
    }

    if (!INITIAL_STATUS_VALUES.includes(row.initialStatus)) {
      errors.push('初始状态不正确')
      valid = false
    }

    let assigneeId: number | null = null
    if (row.initialStatus === 'assigned') {
      if (!row.assigneeName) {
        errors.push('待分派状态必须指定负责人')
        valid = false
      } else {
        assigneeId = techNameMap[row.assigneeName]
        if (!assigneeId) {
          errors.push(`未找到技师「${row.assigneeName}」`)
          valid = false
        }
      }
    }

    if (valid && row.customerPhone && priority) {
      validRowsForDuplicateCheck.push({ row, index: i, priority, assigneeId })
      if (row.customerPhone) {
        phonesToCheck.push(row.customerPhone)
      }
      if (row.deviceType && row.deviceModel && row.customerPhone) {
        devicesToCheck.push({
          deviceType: row.deviceType,
          deviceModel: row.deviceModel,
          phone: row.customerPhone,
        })
      }
    }

    results.push({
      rowIndex: i,
      valid,
      errors,
      warnings,
      data: valid && row.customerName && row.customerPhone && row.deviceType && row.deviceModel && row.faultDescription && priority
        ? {
            customerName: row.customerName,
            customerPhone: row.customerPhone,
            deviceType: row.deviceType,
            deviceModel: row.deviceModel,
            faultDescription: row.faultDescription,
            priority,
            initialStatus: row.initialStatus,
            assigneeId,
          }
        : null,
    })

    if (dbRow) {
      updateRowPrecheck({
        id: dbRow.id,
        precheckErrors: errors.length > 0 ? errors : null,
        precheckWarnings: null,
        status: valid ? 'prechecked' : 'error',
        priority: valid ? priority : null,
        assigneeId: valid ? assigneeId : null,
      })
    }
  }

  const duplicatePhones = getDuplicatePhones([...new Set(phonesToCheck)])
  const duplicateDevices = getDuplicateDevices(devicesToCheck)

  const duplicatePhoneSet = new Set(duplicatePhones)
  const duplicateDeviceSet = new Set(duplicateDevices)

  for (const item of validRowsForDuplicateCheck) {
    const result = results[item.index]
    const row = item.row

    if (row.customerPhone && duplicatePhoneSet.has(row.customerPhone)) {
      result.warnings.push('该手机号客户已存在，可能是重复客户')
    }

    if (row.deviceType && row.deviceModel && row.customerPhone) {
      const deviceKey = `${row.deviceType}|${row.deviceModel}|${row.customerPhone}`
      if (duplicateDeviceSet.has(deviceKey)) {
        result.warnings.push('该客户的该设备已有维修记录')
      }
    }

    if (result.warnings.length > 0 && result.valid) {
      result.valid = true
      const dbRow = allRows[item.index]
      if (dbRow) {
        updateRowPrecheck({
          id: dbRow.id,
          precheckErrors: result.errors.length > 0 ? result.errors : null,
          precheckWarnings: result.warnings,
          status: 'warning',
          priority: item.priority,
          assigneeId: item.assigneeId,
        })
      }
    }
  }

  const validRows = results.filter(r => r.valid).length
  const invalidRows = results.filter(r => !r.valid).length
  const warningRows = results.filter(r => r.valid && r.warnings.length > 0).length

  updateBatchStatus({
    id: batchId,
    status: 'prechecked',
    totalRows: results.length,
    successCount: 0,
    failCount: 0,
  })

  return {
    batchId,
    totalRows: results.length,
    validRows,
    invalidRows,
    warningRows,
    rows: results,
  }
}

export interface SubmitBatchOptions {
  batchId: number
  operator: AuthPayload
  rowIds?: number[]
}

export function submitBatch(options: SubmitBatchOptions): BatchSubmitResult {
  const { batchId, operator, rowIds } = options

  const batch = findBatchById(batchId)
  if (!batch) {
    throw new Error('批次不存在')
  }

  if (batch.status !== 'prechecked') {
    throw new Error('批次状态不正确，必须先通过预检')
  }

  updateBatchStatus({ id: batchId, status: 'submitting' })

  const rowsToSubmit = rowIds && rowIds.length > 0
    ? rowIds.map(id => findRowById(id)).filter(Boolean) as ImportRow[]
    : getRowsByBatchIdWithFilter(batchId, { status: 'prechecked' }).concat(
        getRowsByBatchIdWithFilter(batchId, { status: 'warning' })
      )

  const precheckedRows = getRowsByBatchIdWithFilter(batchId, { status: 'prechecked' })
  const warningRows = getRowsByBatchIdWithFilter(batchId, { status: 'warning' })
  const allEligibleRows = [...precheckedRows, ...warningRows]

  const submitResults: BatchSubmitResult['results'] = []
  let successCount = 0
  let failCount = 0

  for (const row of allEligibleRows) {
    try {
      updateRowResult({ id: row.id, status: 'submitted' })

      const priority = row.priority as TicketPriority
      const initialStatus = row.initial_status as ImportInitialStatus

      const createParams: CreateTicketParams = {
        customerName: row.customer_name!,
        customerPhone: row.customer_phone!,
        deviceType: row.device_type!,
        deviceModel: row.device_model!,
        faultDescription: row.fault_description!,
        priority,
        createdBy: operator.userId,
        createdByName: operator.name,
      }

      const ticket = createTicket(createParams, operator)

      updateRowResult({
        id: row.id,
        status: 'ticket_created',
        ticketId: ticket.id,
        ticketNo: ticket.ticket_no,
      })

      let finalStatus: ImportRowStatus = 'ticket_created'

      if (initialStatus === 'assigned' && row.assignee_id) {
        const assignResult = assignTicket(ticket.id, row.assignee_id, ticket.version, operator)
        
        if (!assignResult.success) {
          throw new Error(assignResult.error || '分派失败')
        }

        finalStatus = 'ticket_assigned'
        updateRowResult({
          id: row.id,
          status: 'ticket_assigned',
        })
      }

      successCount++
      submitResults.push({
        rowId: row.id,
        success: true,
        ticketId: ticket.id,
        ticketNo: ticket.ticket_no,
      })
    } catch (err) {
      failCount++
      const errorMsg = err instanceof Error ? err.message : '创建失败'
      
      updateRowResult({
        id: row.id,
        status: 'failed',
        errorMessage: errorMsg,
      })

      submitResults.push({
        rowId: row.id,
        success: false,
        error: errorMsg,
      })
    }
  }

  const errorRows = getRowsByBatchIdWithFilter(batchId, { status: 'error' })
  const precheckFailCount = errorRows.length
  const failCountFinal = failCount + precheckFailCount

  updateBatchStatus({
    id: batchId,
    status: 'completed',
    successCount,
    failCount: failCountFinal,
  })

  createOperationLog({
    ticketId: null,
    operation: '批量导入',
    operatorId: operator.userId,
    operatorName: operator.name,
    operatorRole: operator.role,
    fromStatus: null,
    toStatus: null,
    remark: `批量导入批次 ${batch.batch_no}，成功 ${successCount} 条，失败 ${failCountFinal} 条`,
  })

  return {
    batchId,
    submittedRows: submitResults.length,
    successRows: successCount,
    failedRows: failCountFinal,
    results: submitResults,
  }
}

export interface ExportRowData {
  rowIndex: number
  customerName: string | null
  customerPhone: string | null
  deviceType: string | null
  deviceModel: string | null
  faultDescription: string | null
  priority: string | null
  initialStatus: string
  assigneeName: string | null
  status: string
  ticketNo: string | null
  ticketStatus: string | null
  assignee: string | null
  version: number | null
  lastOperation: string | null
  errorMessage: string | null
}

export function getExportData(batchId: number, exportType: 'all' | 'success' | 'failed'): ExportRowData[] {
  const rows = getRowsByBatchId(batchId)
  
  let filteredRows = rows
  
  if (exportType === 'success') {
    filteredRows = rows.filter(r => r.status === 'ticket_created' || r.status === 'ticket_assigned')
  } else if (exportType === 'failed') {
    filteredRows = rows.filter(r => r.status === 'error' || r.status === 'failed')
  }

  const statusLabels: Record<string, string> = {
    pending: '待处理',
    prechecked: '预检通过',
    warning: '有警告',
    error: '有错误',
    submitted: '提交中',
    ticket_created: '工单已创建',
    ticket_assigned: '工单已分派',
    failed: '提交失败',
  }

  const priorityLabels: Record<string, string> = {
    low: '低',
    medium: '中',
    high: '高',
    urgent: '紧急',
  }

  const initialStatusLabels: Record<string, string> = {
    created: '待建',
    assigned: '待分派',
  }

  const result: ExportRowData[] = []

  for (const row of filteredRows) {
    let ticketStatus: string | null = null
    let assignee: string | null = null
    let version: number | null = null
    let lastOperation: string | null = null
    let assigneeName: string | null = null

    if (row.assignee_id) {
      const tech = findUserById(row.assignee_id)
      if (tech) {
        assigneeName = tech.name
      }
    }

    if (row.ticket_id) {
      const ticket = findTicketByNo(row.ticket_no!)
      if (ticket) {
        ticketStatus = ticket.status
        assignee = ticket.assignee_name || null
        version = ticket.version

        const logs = getLogsByTicketId(ticket.id)
        if (logs.length > 0) {
          const lastLog = logs[0]
          lastOperation = lastLog.operation
        }
      }
    }

    result.push({
      rowIndex: row.row_index,
      customerName: row.customer_name,
      customerPhone: row.customer_phone,
      deviceType: row.device_type,
      deviceModel: row.device_model,
      faultDescription: row.fault_description,
      priority: row.priority ? priorityLabels[row.priority] || row.priority : null,
      initialStatus: initialStatusLabels[row.initial_status] || row.initial_status,
      assigneeName,
      status: statusLabels[row.status] || row.status,
      ticketNo: row.ticket_no,
      ticketStatus,
      assignee,
      version,
      lastOperation,
      errorMessage: row.error_message,
    })
  }

  return result
}

export function generateExportCsv(data: ExportRowData[]): string {
  const headers = [
    '行号', '客户姓名', '客户电话', '设备类型', '设备型号',
    '故障描述', '优先级', '初始状态', '负责人', '行状态',
    '工单号', '工单状态', '当前负责人', '版本号', '最近操作摘要', '错误信息'
  ]

  const escapeCsv = (value: string | number | null): string => {
    if (value === null || value === undefined) return ''
    const str = String(value)
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`
    }
    return str
  }

  const lines = [headers.join(',')]

  for (const row of data) {
    const line = [
      row.rowIndex + 1,
      row.customerName,
      row.customerPhone,
      row.deviceType,
      row.deviceModel,
      row.faultDescription,
      row.priority,
      row.initialStatus,
      row.assigneeName,
      row.status,
      row.ticketNo,
      row.ticketStatus,
      row.assignee,
      row.version,
      row.lastOperation,
      row.errorMessage,
    ].map(escapeCsv)
    lines.push(line.join(','))
  }

  return lines.join('\n')
}

export function getBatches(operator: AuthPayload): ImportBatch[] {
  return getBatchesFromStore()
}

export { createBatch, createRowsBatch }

export function getBatchDetail(batchId: number, operator: AuthPayload): {
  batch: ImportBatch
  rows: ImportRow[]
} | null {
  const batch = findBatchById(batchId)
  if (!batch) return null

  const rows = getRowsByBatchId(batchId)

  if (operator.role !== 'clerk') {
    const filteredRows = rows.filter(row => {
      if (!row.ticket_id) return false
      if (operator.role === 'technician') {
        return row.assignee_id === operator.userId
      }
      return true
    })
    return { batch, rows: filteredRows }
  }

  return { batch, rows }
}

export function createExport(
  batchId: number,
  exportType: 'all' | 'success' | 'failed',
  operator: AuthPayload
): { fileName: string; content: string; recordId: number } {
  const exportData = getExportData(batchId, exportType)
  const content = generateExportCsv(exportData)

  const batch = findBatchById(batchId)
  if (!batch) {
    throw new Error('批次不存在')
  }

  const typeLabel = {
    all: '全部',
    success: '成功',
    failed: '失败',
  }

  const now = new Date()
  const dateStr = `${now.getFullYear()}${String(now.getMonth() + 1).padStart(2, '0')}${String(now.getDate()).padStart(2, '0')}`
  const fileName = `导入结果_${batch.batch_no}_${typeLabel[exportType]}_${dateStr}.csv`

  const record = createExportRecord({
    batchId,
    exportType,
    fileName,
    totalRows: exportData.length,
    exportedBy: operator.userId,
    exportedByName: operator.name,
  })

  return {
    fileName,
    content,
    recordId: record.id,
  }
}
