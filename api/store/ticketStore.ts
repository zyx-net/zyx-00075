import { db } from '../db.js'
import type { Ticket, TicketStatus, TicketPriority } from '../types.js'
import { generateTicketNo } from '../db.js'

export interface CreateTicketParams {
  customerName: string
  customerPhone: string
  deviceType: string
  deviceModel: string
  faultDescription: string
  priority: TicketPriority
  createdBy: number
  createdByName: string
}

export interface UpdateTicketParams {
  id: number
  currentVersion: number
  status?: TicketStatus
  assigneeId?: number | null
  assigneeName?: string | null
  diagnosisResult?: string | null
  estimatedCost?: number | null
  repairDetails?: string | null
  actualCost?: number | null
  deliveryConfirmer?: string | null
  deliveryNotes?: string | null
  deliveryReceiptNo?: string | null
  deliveryPhoneLast4?: string | null
  deliveredAt?: string | null
  deliveredBy?: number | null
  deliveredByName?: string | null
}

export function createTicket(params: CreateTicketParams): Ticket {
  const ticketNo = generateTicketNo()
  
  const stmt = db.prepare(`
    INSERT INTO tickets (
      ticket_no, customer_name, customer_phone, device_type,
      device_model, fault_description, priority,
      created_by, created_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    ticketNo,
    params.customerName,
    params.customerPhone,
    params.deviceType,
    params.deviceModel,
    params.faultDescription,
    params.priority,
    params.createdBy,
    params.createdByName
  )

  const ticket = findTicketById(Number(result.lastInsertRowid))
  if (!ticket) throw new Error('Failed to create ticket')
  return ticket
}

export function findTicketById(id: number): Ticket | undefined {
  const stmt = db.prepare('SELECT * FROM tickets WHERE id = ?')
  return stmt.get(id) as Ticket | undefined
}

export function findTicketByNo(ticketNo: string): Ticket | undefined {
  const stmt = db.prepare('SELECT * FROM tickets WHERE ticket_no = ?')
  return stmt.get(ticketNo) as Ticket | undefined
}

const priorityOrder: Record<TicketPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export interface TicketQueryParams {
  status?: TicketStatus
  priority?: TicketPriority
  assigneeId?: number
}

export function getTickets(params?: TicketQueryParams): Ticket[] {
  let sql = 'SELECT * FROM tickets WHERE 1=1'
  const values: unknown[] = []

  if (params?.status) {
    sql += ' AND status = ?'
    values.push(params.status)
  }

  if (params?.priority) {
    sql += ' AND priority = ?'
    values.push(params.priority)
  }

  if (params?.assigneeId) {
    sql += ' AND assignee_id = ?'
    values.push(params.assigneeId)
  }

  sql += ' ORDER BY CASE priority'
  for (const [p, order] of Object.entries(priorityOrder)) {
    sql += ` WHEN '${p}' THEN ${order}`
  }
  sql += ' END, created_at ASC'

  const stmt = db.prepare(sql)
  return stmt.all(...values) as Ticket[]
}

export function getQueue(): Ticket[] {
  const sql = `
    SELECT * FROM tickets
    WHERE status NOT IN ('delivered', 'cancelled')
    ORDER BY CASE priority
      WHEN 'urgent' THEN 0
      WHEN 'high' THEN 1
      WHEN 'medium' THEN 2
      WHEN 'low' THEN 3
    END, created_at ASC
  `
  const stmt = db.prepare(sql)
  return stmt.all() as Ticket[]
}

export function getStatusCounts(): Record<TicketStatus, number> {
  const stmt = db.prepare(`
    SELECT status, COUNT(*) as count
    FROM tickets
    GROUP BY status
  `)
  const rows = stmt.all() as { status: string; count: number }[]

  const counts: Partial<Record<TicketStatus, number>> = {}
  for (const row of rows) {
    counts[row.status as TicketStatus] = row.count
  }

  return counts as Record<TicketStatus, number>
}

export function updateTicket(params: UpdateTicketParams): Ticket | undefined {
  const currentTicket = findTicketById(params.id)
  if (!currentTicket) return undefined

  if (currentTicket.version !== params.currentVersion) {
    throw new Error('VERSION_CONFLICT')
  }

  const newVersion = params.currentVersion + 1

  let sql = 'UPDATE tickets SET version = ?, updated_at = CURRENT_TIMESTAMP'
  const values: unknown[] = [newVersion]

  if (params.status !== undefined) {
    sql += ', status = ?'
    values.push(params.status)
  }

  if (params.assigneeId !== undefined) {
    sql += ', assignee_id = ?'
    values.push(params.assigneeId)
  }

  if (params.assigneeName !== undefined) {
    sql += ', assignee_name = ?'
    values.push(params.assigneeName)
  }

  if (params.diagnosisResult !== undefined) {
    sql += ', diagnosis_result = ?'
    values.push(params.diagnosisResult)
  }

  if (params.estimatedCost !== undefined) {
    sql += ', estimated_cost = ?'
    values.push(params.estimatedCost)
  }

  if (params.repairDetails !== undefined) {
    sql += ', repair_details = ?'
    values.push(params.repairDetails)
  }

  if (params.actualCost !== undefined) {
    sql += ', actual_cost = ?'
    values.push(params.actualCost)
  }

  if (params.deliveryConfirmer !== undefined) {
    sql += ', delivery_confirmer = ?'
    values.push(params.deliveryConfirmer)
  }

  if (params.deliveryNotes !== undefined) {
    sql += ', delivery_notes = ?'
    values.push(params.deliveryNotes)
  }

  if (params.deliveryReceiptNo !== undefined) {
    sql += ', delivery_receipt_no = ?'
    values.push(params.deliveryReceiptNo)
  }

  if (params.deliveryPhoneLast4 !== undefined) {
    sql += ', delivery_phone_last4 = ?'
    values.push(params.deliveryPhoneLast4)
  }

  if (params.deliveredAt !== undefined) {
    sql += ', delivered_at = ?'
    values.push(params.deliveredAt)
  }

  if (params.deliveredBy !== undefined) {
    sql += ', delivered_by = ?'
    values.push(params.deliveredBy)
  }

  if (params.deliveredByName !== undefined) {
    sql += ', delivered_by_name = ?'
    values.push(params.deliveredByName)
  }

  sql += ' WHERE id = ? AND version = ?'
  values.push(params.id, params.currentVersion)

  const stmt = db.prepare(sql)
  const result = stmt.run(...values)

  if (result.changes === 0) {
    throw new Error('VERSION_CONFLICT')
  }

  return findTicketById(params.id)
}
