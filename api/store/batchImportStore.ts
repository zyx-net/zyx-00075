import { db } from '../db.js'
import { generateBatchNo } from '../db.js'
import type {
  ImportBatch,
  ImportRow,
  ImportBatchStatus,
  ImportRowStatus,
  ImportInitialStatus,
  ExportRecord,
} from '../types.js'

export interface CreateBatchParams {
  fileName: string
  createdBy: number
  createdByName: string
}

export interface CreateRowParams {
  batchId: number
  rowIndex: number
  customerName: string | null
  customerPhone: string | null
  deviceType: string | null
  deviceModel: string | null
  faultDescription: string | null
  priority: string | null
  initialStatus: ImportInitialStatus
  assigneeId: number | null
}

export interface UpdateRowPrecheckParams {
  id: number
  precheckErrors: string[] | null
  precheckWarnings: string[] | null
  status: ImportRowStatus
  priority?: string | null
  assigneeId?: number | null
}

export interface UpdateRowResultParams {
  id: number
  status: ImportRowStatus
  ticketId?: number | null
  ticketNo?: string | null
  errorMessage?: string | null
}

export interface UpdateBatchStatusParams {
  id: number
  status: ImportBatchStatus
  totalRows?: number
  successCount?: number
  failCount?: number
}

export interface CreateExportRecordParams {
  batchId: number
  exportType: 'all' | 'success' | 'failed'
  fileName: string
  totalRows: number
  exportedBy: number
  exportedByName: string
}

export function createBatch(params: CreateBatchParams): ImportBatch {
  const batchNo = generateBatchNo()

  const stmt = db.prepare(`
    INSERT INTO import_batches (
      batch_no, file_name, created_by, created_by_name
    ) VALUES (?, ?, ?, ?)
  `)

  const result = stmt.run(
    batchNo,
    params.fileName,
    params.createdBy,
    params.createdByName
  )

  const batch = findBatchById(Number(result.lastInsertRowid))
  if (!batch) throw new Error('Failed to create batch')
  return batch
}

export function findBatchById(id: number): ImportBatch | undefined {
  const stmt = db.prepare('SELECT * FROM import_batches WHERE id = ?')
  return stmt.get(id) as ImportBatch | undefined
}

export function findBatchByNo(batchNo: string): ImportBatch | undefined {
  const stmt = db.prepare('SELECT * FROM import_batches WHERE batch_no = ?')
  return stmt.get(batchNo) as ImportBatch | undefined
}

export function getBatches(params?: { createdBy?: number; status?: ImportBatchStatus }): ImportBatch[] {
  let sql = 'SELECT * FROM import_batches WHERE 1=1'
  const values: unknown[] = []

  if (params?.createdBy) {
    sql += ' AND created_by = ?'
    values.push(params.createdBy)
  }

  if (params?.status) {
    sql += ' AND status = ?'
    values.push(params.status)
  }

  sql += ' ORDER BY created_at DESC'

  const stmt = db.prepare(sql)
  return stmt.all(...values) as ImportBatch[]
}

export function updateBatchStatus(params: UpdateBatchStatusParams): ImportBatch | undefined {
  let sql = 'UPDATE import_batches SET status = ?, updated_at = CURRENT_TIMESTAMP'
  const values: unknown[] = [params.status]

  if (params.totalRows !== undefined) {
    sql += ', total_rows = ?'
    values.push(params.totalRows)
  }

  if (params.successCount !== undefined) {
    sql += ', success_count = ?'
    values.push(params.successCount)
  }

  if (params.failCount !== undefined) {
    sql += ', fail_count = ?'
    values.push(params.failCount)
  }

  sql += ' WHERE id = ?'
  values.push(params.id)

  const stmt = db.prepare(sql)
  stmt.run(...values)

  return findBatchById(params.id)
}

export function createRow(params: CreateRowParams): ImportRow {
  const stmt = db.prepare(`
    INSERT INTO import_rows (
      batch_id, row_index, customer_name, customer_phone,
      device_type, device_model, fault_description, priority,
      initial_status, assignee_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.batchId,
    params.rowIndex,
    params.customerName,
    params.customerPhone,
    params.deviceType,
    params.deviceModel,
    params.faultDescription,
    params.priority,
    params.initialStatus,
    params.assigneeId
  )

  const row = findRowById(Number(result.lastInsertRowid))
  if (!row) throw new Error('Failed to create row')
  return row
}

export function createRowsBatch(rows: CreateRowParams[]): void {
  const stmt = db.prepare(`
    INSERT INTO import_rows (
      batch_id, row_index, customer_name, customer_phone,
      device_type, device_model, fault_description, priority,
      initial_status, assignee_id
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const tx = db.transaction((rowsData: CreateRowParams[]) => {
    for (const row of rowsData) {
      stmt.run(
        row.batchId,
        row.rowIndex,
        row.customerName,
        row.customerPhone,
        row.deviceType,
        row.deviceModel,
        row.faultDescription,
        row.priority,
        row.initialStatus,
        row.assigneeId
      )
    }
  })

  tx(rows)
}

export function findRowById(id: number): ImportRow | undefined {
  const stmt = db.prepare('SELECT * FROM import_rows WHERE id = ?')
  return stmt.get(id) as ImportRow | undefined
}

export function getRowsByBatchId(batchId: number): ImportRow[] {
  const stmt = db.prepare(`
    SELECT * FROM import_rows
    WHERE batch_id = ?
    ORDER BY row_index ASC
  `)
  return stmt.all(batchId) as ImportRow[]
}

export function getRowsByBatchIdWithFilter(
  batchId: number,
  filter?: { status?: ImportRowStatus; hasTicket?: boolean }
): ImportRow[] {
  let sql = 'SELECT * FROM import_rows WHERE batch_id = ?'
  const values: unknown[] = [batchId]

  if (filter?.status) {
    sql += ' AND status = ?'
    values.push(filter.status)
  }

  if (filter?.hasTicket === true) {
    sql += ' AND ticket_id IS NOT NULL'
  } else if (filter?.hasTicket === false) {
    sql += ' AND ticket_id IS NULL'
  }

  sql += ' ORDER BY row_index ASC'

  const stmt = db.prepare(sql)
  return stmt.all(...values) as ImportRow[]
}

export function updateRowPrecheck(params: UpdateRowPrecheckParams): ImportRow | undefined {
  let sql = 'UPDATE import_rows SET precheck_errors = ?, precheck_warnings = ?, status = ?, updated_at = CURRENT_TIMESTAMP'
  const values: unknown[] = [
    params.precheckErrors ? JSON.stringify(params.precheckErrors) : null,
    params.precheckWarnings ? JSON.stringify(params.precheckWarnings) : null,
    params.status,
  ]

  if (params.priority !== undefined) {
    sql += ', priority = ?'
    values.push(params.priority)
  }
  if (params.assigneeId !== undefined) {
    sql += ', assignee_id = ?'
    values.push(params.assigneeId)
  }

  sql += ' WHERE id = ?'
  values.push(params.id)

  const stmt = db.prepare(sql)
  stmt.run(...values)

  return findRowById(params.id)
}

export function updateRowResult(params: UpdateRowResultParams): ImportRow | undefined {
  let sql = 'UPDATE import_rows SET status = ?, updated_at = CURRENT_TIMESTAMP'
  const values: unknown[] = [params.status]

  if (params.ticketId !== undefined) {
    sql += ', ticket_id = ?'
    values.push(params.ticketId)
  }

  if (params.ticketNo !== undefined) {
    sql += ', ticket_no = ?'
    values.push(params.ticketNo)
  }

  if (params.errorMessage !== undefined) {
    sql += ', error_message = ?'
    values.push(params.errorMessage)
  }

  sql += ' WHERE id = ?'
  values.push(params.id)

  const stmt = db.prepare(sql)
  stmt.run(...values)

  return findRowById(params.id)
}

export function createExportRecord(params: CreateExportRecordParams): ExportRecord {
  const stmt = db.prepare(`
    INSERT INTO export_records (
      batch_id, export_type, file_name, total_rows,
      exported_by, exported_by_name
    ) VALUES (?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.batchId,
    params.exportType,
    params.fileName,
    params.totalRows,
    params.exportedBy,
    params.exportedByName
  )

  const record = findExportRecordById(Number(result.lastInsertRowid))
  if (!record) throw new Error('Failed to create export record')
  return record
}

export function findExportRecordById(id: number): ExportRecord | undefined {
  const stmt = db.prepare('SELECT * FROM export_records WHERE id = ?')
  return stmt.get(id) as ExportRecord | undefined
}

export function getExportRecordsByBatchId(batchId: number): ExportRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM export_records
    WHERE batch_id = ?
    ORDER BY created_at DESC
  `)
  return stmt.all(batchId) as ExportRecord[]
}

export function getDuplicatePhones(phones: string[]): string[] {
  if (phones.length === 0) return []

  const placeholders = phones.map(() => '?').join(',')
  const sql = `
    SELECT DISTINCT customer_phone
    FROM tickets
    WHERE customer_phone IN (${placeholders})
  `

  const stmt = db.prepare(sql)
  const rows = stmt.all(...phones) as { customer_phone: string }[]
  return rows.map(r => r.customer_phone)
}

export function getDuplicateDevices(devices: { deviceType: string; deviceModel: string; phone: string }[]): string[] {
  if (devices.length === 0) return []

  const conditions: string[] = []
  const values: string[] = []

  for (const d of devices) {
    conditions.push('(device_type = ? AND device_model = ? AND customer_phone = ?)')
    values.push(d.deviceType, d.deviceModel, d.phone)
  }

  const sql = `
    SELECT DISTINCT device_type || '|' || device_model || '|' || customer_phone as key
    FROM tickets
    WHERE ${conditions.join(' OR ')}
  `

  const stmt = db.prepare(sql)
  const rows = stmt.all(...values) as { key: string }[]
  return rows.map(r => r.key)
}
