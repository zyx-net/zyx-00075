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
  delivery_confirmer: string | null
  delivery_notes: string | null
  delivery_receipt_no: string | null
  delivery_phone_last4: string | null
  delivered_at: string | null
  delivered_by: number | null
  delivered_by_name: string | null
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
  isVersionConflict?: boolean
}

export interface StatusCount {
  count: number
  label: string
}

export type ImportBatchStatus = 'uploading' | 'prechecking' | 'prechecked' | 'submitting' | 'completed' | 'failed'

export type ImportRowStatus = 'pending' | 'prechecked' | 'warning' | 'error' | 'submitted' | 'ticket_created' | 'ticket_assigned' | 'failed'

export type ImportInitialStatus = 'created' | 'assigned'

export interface ImportBatch {
  id: number
  batch_no: string
  file_name: string
  total_rows: number
  success_count: number
  fail_count: number
  status: ImportBatchStatus
  created_by: number
  created_by_name: string
  created_at: string
  updated_at: string
}

export interface ImportRow {
  id: number
  batch_id: number
  row_index: number
  customer_name: string | null
  customer_phone: string | null
  device_type: string | null
  device_model: string | null
  fault_description: string | null
  priority: string | null
  initial_status: ImportInitialStatus
  assignee_id: number | null
  precheck_errors: string | null
  precheck_warnings: string | null
  status: ImportRowStatus
  ticket_id: number | null
  ticket_no: string | null
  error_message: string | null
  created_at: string
  updated_at: string
}

export interface PrecheckRowResult {
  rowIndex: number
  valid: boolean
  errors: string[]
  warnings: string[]
  data: {
    customerName: string
    customerPhone: string
    deviceType: string
    deviceModel: string
    faultDescription: string
    priority: TicketPriority
    initialStatus: ImportInitialStatus
    assigneeId: number | null
  } | null
}

export interface PrecheckResult {
  batchId: number
  totalRows: number
  validRows: number
  invalidRows: number
  warningRows: number
  rows: PrecheckRowResult[]
}

export interface BatchSubmitResult {
  batchId: number
  submittedRows: number
  successRows: number
  failedRows: number
  results: {
    rowId: number
    success: boolean
    ticketId?: number
    ticketNo?: string
    error?: string
  }[]
}

export type StandardField = 'customerName' | 'customerPhone' | 'deviceType' | 'deviceModel' | 'faultDescription' | 'priority' | 'initialStatus' | 'assigneeName'

export const STANDARD_FIELDS: StandardField[] = ['customerName', 'customerPhone', 'deviceType', 'deviceModel', 'faultDescription', 'priority', 'initialStatus', 'assigneeName']

export const STANDARD_FIELD_LABELS: Record<StandardField, string> = {
  customerName: '客户姓名',
  customerPhone: '客户电话',
  deviceType: '设备类型',
  deviceModel: '设备型号',
  faultDescription: '故障描述',
  priority: '优先级',
  initialStatus: '初始状态',
  assigneeName: '负责人',
}

export const STANDARD_FIELD_REQUIRED: Record<StandardField, boolean> = {
  customerName: true,
  customerPhone: true,
  deviceType: true,
  deviceModel: true,
  faultDescription: true,
  priority: true,
  initialStatus: true,
  assigneeName: false,
}

export type FieldMapping = Partial<Record<StandardField, string>>

export interface FieldMappingTemplate {
  id: number
  name: string
  description: string | null
  fieldMapping: FieldMapping
  created_by: number
  created_by_name: string
  updated_by: number
  updated_by_name: string
  created_at: string
  updated_at: string
}

export interface TemplateOperationLog {
  id: number
  template_id: number | null
  template_name: string
  operation: string
  operator_id: number
  operator_name: string
  operator_role: string
  detail: string | null
  created_at: string
}

export type TemplateImportConflictAction = 'overwrite' | 'skip' | 'rename'

export interface CsvHeaderInfo {
  headers: string[]
  detectedMappings: FieldMapping
  unmappedHeaders: string[]
  missingRequiredFields: StandardField[]
  fileName?: string
  fileContent?: string
}

export interface TemplateImportPreviewResult {
  name: string
  description?: string
  fieldMapping: FieldMapping
  conflict: boolean
  existingTemplate?: FieldMappingTemplate
}

export interface TemplateImportResultData {
  template: FieldMappingTemplate
  action: TemplateImportConflictAction
  conflict: boolean
  existingTemplate?: FieldMappingTemplate
}

export interface PrecheckResultWithMapping extends PrecheckResult {
  usedTemplateId?: number
  usedTemplateName?: string
  usedMapping?: FieldMapping
}
