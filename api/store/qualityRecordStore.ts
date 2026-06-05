import { db } from '../db.js'
import type { QualityRecord } from '../types.js'

export interface CreateQualityRecordParams {
  ticketId: number
  inspectorId: number
  inspectorName: string
  passed: boolean
  comment?: string
}

export function createQualityRecord(params: CreateQualityRecordParams): number {
  const stmt = db.prepare(`
    INSERT INTO quality_records (
      ticket_id, inspector_id, inspector_name, passed, comment
    ) VALUES (?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.ticketId,
    params.inspectorId,
    params.inspectorName,
    params.passed ? 1 : 0,
    params.comment || null
  )

  return Number(result.lastInsertRowid)
}

export function getQualityRecordsByTicketId(ticketId: number): QualityRecord[] {
  const stmt = db.prepare(`
    SELECT * FROM quality_records
    WHERE ticket_id = ?
    ORDER BY created_at DESC, id DESC
  `)
  return stmt.all(ticketId) as QualityRecord[]
}
