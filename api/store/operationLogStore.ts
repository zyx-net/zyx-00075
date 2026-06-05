import { db } from '../db.js'
import type { OperationLog, UserRole } from '../types.js'

export interface CreateLogParams {
  ticketId: number | null
  operation: string
  operatorId: number
  operatorName: string
  operatorRole: UserRole
  fromStatus: string | null
  toStatus: string | null
  remark?: string
}

export function createOperationLog(params: CreateLogParams): number {
  const stmt = db.prepare(`
    INSERT INTO operation_logs (
      ticket_id, operation, operator_id, operator_name,
      operator_role, from_status, to_status, remark
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.ticketId,
    params.operation,
    params.operatorId,
    params.operatorName,
    params.operatorRole,
    params.fromStatus,
    params.toStatus,
    params.remark || null
  )

  return Number(result.lastInsertRowid)
}

export function getLogsByTicketId(ticketId: number): OperationLog[] {
  const stmt = db.prepare(`
    SELECT * FROM operation_logs
    WHERE ticket_id = ?
    ORDER BY created_at DESC, id DESC
  `)
  return stmt.all(ticketId) as OperationLog[]
}
