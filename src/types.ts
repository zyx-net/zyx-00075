export type UserRole = 'clerk' | 'technician' | 'quality_inspector'

export type TicketStatus =
  | 'created'
  | 'assigned'
  | 'diagnosing'
  | 'quoting'
  | 'quote_approved'
  | 'repairing'
  | 'quality_check'
  | 'quality_passed'
  | 'quality_failed'
  | 'delivered'
  | 'cancelled'

export type TicketPriority = 'low' | 'medium' | 'high' | 'urgent'

export interface User {
  id: number
  username: string
  name: string
  role: UserRole
  roleLabel: string
}

export interface Ticket {
  id: number
  ticket_no: string
  customer_name: string
  customer_phone: string
  device_type: string
  device_model: string
  fault_description: string
  priority: TicketPriority
  status: TicketStatus
  version: number
  assignee_id: number | null
  assignee_name: string | null
  diagnosis_result: string | null
  estimated_cost: number | null
  repair_details: string | null
  actual_cost: number | null
  created_by: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface OperationLog {
  id: number
  ticket_id: number
  operation: string
  operator_id: number
  operator_name: string
  operator_role: string
  from_status: string | null
  to_status: string | null
  remark: string | null
  created_at: string
}

export interface QualityRecord {
  id: number
  ticket_id: number
  inspector_id: number
  inspector_name: string
  passed: boolean
  comment: string | null
  created_at: string
}

export interface ApiResponse<T = unknown> {
  success: boolean
  data?: T
  error?: string
  message?: string
  code?: number
}

export interface StatusCount {
  count: number
  label: string
}
