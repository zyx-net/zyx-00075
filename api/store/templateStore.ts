import { db } from '../db.js'
import type {
  FieldMappingTemplate,
  FieldMappingTemplateWithData,
  FieldMapping,
  TemplateOperationLog,
  AuthPayload,
} from '../types.js'

export interface CreateTemplateParams {
  name: string
  description?: string
  fieldMapping: FieldMapping
  operator: AuthPayload
}

export interface UpdateTemplateParams {
  id: number
  name?: string
  description?: string
  fieldMapping?: FieldMapping
  operator: AuthPayload
}

export interface CreateTemplateLogParams {
  templateId: number | null
  templateName: string
  operation: string
  operator: AuthPayload
  detail?: string
}

function deserializeMapping(template: FieldMappingTemplate): FieldMappingTemplateWithData {
  return {
    ...template,
    fieldMapping: JSON.parse(template.field_mapping) as FieldMapping,
  }
}

export function createTemplate(params: CreateTemplateParams): FieldMappingTemplateWithData {
  const stmt = db.prepare(`
    INSERT INTO field_mapping_templates (
      name, description, field_mapping,
      created_by, created_by_name,
      updated_by, updated_by_name
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.name,
    params.description || null,
    JSON.stringify(params.fieldMapping),
    params.operator.userId,
    params.operator.name,
    params.operator.userId,
    params.operator.name,
  )

  const template = findTemplateById(Number(result.lastInsertRowid))
  if (!template) throw new Error('创建模板失败')
  return template
}

export function findTemplateById(id: number): FieldMappingTemplateWithData | undefined {
  const stmt = db.prepare('SELECT * FROM field_mapping_templates WHERE id = ?')
  const template = stmt.get(id) as FieldMappingTemplate | undefined
  return template ? deserializeMapping(template) : undefined
}

export function findTemplateByName(name: string): FieldMappingTemplateWithData | undefined {
  const stmt = db.prepare('SELECT * FROM field_mapping_templates WHERE name = ?')
  const template = stmt.get(name) as FieldMappingTemplate | undefined
  return template ? deserializeMapping(template) : undefined
}

export function getAllTemplates(): FieldMappingTemplateWithData[] {
  const stmt = db.prepare('SELECT * FROM field_mapping_templates ORDER BY updated_at DESC')
  const templates = stmt.all() as FieldMappingTemplate[]
  return templates.map(deserializeMapping)
}

export function updateTemplate(params: UpdateTemplateParams): FieldMappingTemplateWithData | undefined {
  const existing = findTemplateById(params.id)
  if (!existing) return undefined

  const updates: string[] = []
  const values: unknown[] = []

  if (params.name !== undefined) {
    updates.push('name = ?')
    values.push(params.name)
  }
  if (params.description !== undefined) {
    updates.push('description = ?')
    values.push(params.description || null)
  }
  if (params.fieldMapping !== undefined) {
    updates.push('field_mapping = ?')
    values.push(JSON.stringify(params.fieldMapping))
  }

  updates.push('updated_by = ?')
  values.push(params.operator.userId)
  updates.push('updated_by_name = ?')
  values.push(params.operator.name)
  updates.push('updated_at = CURRENT_TIMESTAMP')

  values.push(params.id)

  const sql = `UPDATE field_mapping_templates SET ${updates.join(', ')} WHERE id = ?`
  db.prepare(sql).run(...values)

  return findTemplateById(params.id)
}

export function deleteTemplate(id: number): boolean {
  const stmt = db.prepare('DELETE FROM field_mapping_templates WHERE id = ?')
  const result = stmt.run(id)
  return result.changes > 0
}

export function createTemplateLog(params: CreateTemplateLogParams): number {
  const stmt = db.prepare(`
    INSERT INTO template_operation_logs (
      template_id, template_name, operation,
      operator_id, operator_name, operator_role, detail
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `)

  const result = stmt.run(
    params.templateId,
    params.templateName,
    params.operation,
    params.operator.userId,
    params.operator.name,
    params.operator.role,
    params.detail || null,
  )

  return Number(result.lastInsertRowid)
}

export function getTemplateLogs(templateId?: number): TemplateOperationLog[] {
  let sql = 'SELECT * FROM template_operation_logs'
  const values: unknown[] = []

  if (templateId !== undefined) {
    sql += ' WHERE template_id = ?'
    values.push(templateId)
  }

  sql += ' ORDER BY created_at DESC, id DESC'

  const stmt = db.prepare(sql)
  return stmt.all(...values) as TemplateOperationLog[]
}

export function getTemplateExportData(template: FieldMappingTemplateWithData): unknown {
  return {
    name: template.name,
    description: template.description,
    fieldMapping: template.fieldMapping,
    version: 1,
    exportedAt: new Date().toISOString(),
  }
}

export function validateTemplateImportData(data: unknown): { valid: boolean; error?: string; name?: string; fieldMapping?: FieldMapping; description?: string } {
  if (!data || typeof data !== 'object') {
    return { valid: false, error: '无效的模板数据格式' }
  }

  const obj = data as Record<string, unknown>

  if (typeof obj.name !== 'string' || !obj.name.trim()) {
    return { valid: false, error: '模板名称不能为空' }
  }

  if (!obj.fieldMapping || typeof obj.fieldMapping !== 'object') {
    return { valid: false, error: '缺少字段映射配置' }
  }

  const fieldMapping = obj.fieldMapping as Record<string, unknown>
  const validFields = ['customerName', 'customerPhone', 'deviceType', 'deviceModel', 'faultDescription', 'priority', 'initialStatus', 'assigneeName']

  for (const key of Object.keys(fieldMapping)) {
    if (!validFields.includes(key)) {
      return { valid: false, error: `无效的标准字段: ${key}` }
    }
    if (fieldMapping[key] !== null && typeof fieldMapping[key] !== 'string') {
      return { valid: false, error: `字段 ${key} 的映射值必须是字符串或 null` }
    }
  }

  return {
    valid: true,
    name: obj.name.trim(),
    description: typeof obj.description === 'string' ? obj.description : undefined,
    fieldMapping: fieldMapping as FieldMapping,
  }
}
