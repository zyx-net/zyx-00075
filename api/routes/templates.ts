import { Router, type Request, type Response } from 'express'
import type { ApiResponse, AuthPayload, FieldMapping, TemplateImportConflictAction, FieldMappingTemplateWithData } from '../types.js'
import { authMiddleware, requirePermission, requireRole } from '../auth.js'
import {
  createTemplate,
  findTemplateById,
  findTemplateByName,
  getAllTemplates,
  updateTemplate,
  deleteTemplate,
  createTemplateLog,
  getTemplateLogs,
  getTemplateExportData,
  validateTemplateImportData,
} from '../store/templateStore.js'
import { analyzeCsvHeaders } from '../batchWorkflow.js'
import multer from 'multer'

const router = Router()
router.use(authMiddleware)

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 1 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.json')) {
      cb(null, true)
    } else {
      cb(new Error('只允许上传 JSON 文件'))
    }
  },
})

router.get('/', requirePermission('templates:read'), (req: Request, res: Response): void => {
  try {
    const templates = getAllTemplates()
    res.json({
      success: true,
      data: templates,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get templates error:', err)
    res.status(500).json({
      success: false,
      error: '获取模板列表失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id', requirePermission('templates:read'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const template = findTemplateById(id)

    if (!template) {
      res.status(404).json({
        success: false,
        error: '模板不存在',
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: template,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get template error:', err)
    res.status(500).json({
      success: false,
      error: '获取模板详情失败',
    } satisfies ApiResponse)
  }
})

router.post('/', requirePermission('templates:create'), (req: Request, res: Response): void => {
  try {
    const operator = req.user as AuthPayload
    const { name, description, fieldMapping } = req.body as {
      name: string
      description?: string
      fieldMapping: FieldMapping
    }

    if (!name?.trim()) {
      res.status(400).json({
        success: false,
        error: '模板名称不能为空',
      } satisfies ApiResponse)
      return
    }

    if (!fieldMapping || typeof fieldMapping !== 'object') {
      res.status(400).json({
        success: false,
        error: '缺少字段映射配置',
      } satisfies ApiResponse)
      return
    }

    const existing = findTemplateByName(name.trim())
    if (existing) {
      res.status(409).json({
        success: false,
        error: '模板名称已存在',
      } satisfies ApiResponse)
      return
    }

    const template = createTemplate({
      name: name.trim(),
      description,
      fieldMapping,
      operator,
    })

    createTemplateLog({
      templateId: template.id,
      templateName: template.name,
      operation: '创建模板',
      operator,
      detail: `创建字段映射模板「${template.name}」`,
    })

    res.json({
      success: true,
      data: template,
      message: '模板创建成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Create template error:', err)
    res.status(500).json({
      success: false,
      error: '创建模板失败',
    } satisfies ApiResponse)
  }
})

router.put('/:id', requirePermission('templates:update'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload
    const { name, description, fieldMapping } = req.body as {
      name?: string
      description?: string
      fieldMapping?: FieldMapping
    }

    const existing = findTemplateById(id)
    if (!existing) {
      res.status(404).json({
        success: false,
        error: '模板不存在',
      } satisfies ApiResponse)
      return
    }

    if (name?.trim() && name.trim() !== existing.name) {
      const duplicate = findTemplateByName(name.trim())
      if (duplicate) {
        res.status(409).json({
          success: false,
          error: '模板名称已存在',
        } satisfies ApiResponse)
        return
      }
    }

    const template = updateTemplate({
      id,
      name: name?.trim(),
      description,
      fieldMapping,
      operator,
    })

    if (template) {
      const changes: string[] = []
      if (name && name.trim() !== existing.name) {
        changes.push(`名称从「${existing.name}」改为「${name.trim()}」`)
      }
      if (description !== undefined && description !== existing.description) {
        changes.push('更新了描述')
      }
      if (fieldMapping) {
        changes.push('更新了字段映射')
      }

      createTemplateLog({
        templateId: template.id,
        templateName: template.name,
        operation: '修改模板',
        operator,
        detail: changes.join('；') || '修改了模板',
      })
    }

    res.json({
      success: true,
      data: template,
      message: '模板更新成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Update template error:', err)
    res.status(500).json({
      success: false,
      error: '更新模板失败',
    } satisfies ApiResponse)
  }
})

router.delete('/:id', requirePermission('templates:delete'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload

    const template = findTemplateById(id)
    if (!template) {
      res.status(404).json({
        success: false,
        error: '模板不存在',
      } satisfies ApiResponse)
      return
    }

    const deleted = deleteTemplate(id)

    if (deleted) {
      createTemplateLog({
        templateId: null,
        templateName: template.name,
        operation: '删除模板',
        operator,
        detail: `删除字段映射模板「${template.name}」`,
      })
    }

    res.json({
      success: true,
      message: '模板删除成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Delete template error:', err)
    res.status(500).json({
      success: false,
      error: '删除模板失败',
    } satisfies ApiResponse)
  }
})

router.post('/analyze-csv', requirePermission('batch:import'), (req: Request, res: Response): void => {
  try {
    const { csvContent } = req.body as { csvContent: string }

    if (!csvContent) {
      res.status(400).json({
        success: false,
        error: '缺少 CSV 内容',
      } satisfies ApiResponse)
      return
    }

    const headerInfo = analyzeCsvHeaders(csvContent)

    res.json({
      success: true,
      data: headerInfo,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Analyze CSV error:', err)
    res.status(500).json({
      success: false,
      error: '分析 CSV 表头失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id/export', requirePermission('templates:export'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload

    const template = findTemplateById(id)
    if (!template) {
      res.status(404).json({
        success: false,
        error: '模板不存在',
      } satisfies ApiResponse)
      return
    }

    const exportData = getTemplateExportData(template)
    const fileName = `${template.name}_${Date.now()}.json`

    createTemplateLog({
      templateId: template.id,
      templateName: template.name,
      operation: '导出模板',
      operator,
      detail: `导出字段映射模板「${template.name}」`,
    })

    res.setHeader('Content-Type', 'application/json; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(fileName)}"`)
    res.send(JSON.stringify(exportData, null, 2))
  } catch (err) {
    console.error('Export template error:', err)
    res.status(500).json({
      success: false,
      error: '导出模板失败',
    } satisfies ApiResponse)
  }
})

router.post('/import-preview', requirePermission('templates:import'), upload.single('file'), (req: Request, res: Response): void => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: '请上传 JSON 文件',
      } satisfies ApiResponse)
      return
    }

    const content = req.file.buffer.toString('utf-8')
    let data: unknown

    try {
      data = JSON.parse(content)
    } catch {
      res.status(400).json({
        success: false,
        error: 'JSON 文件格式不正确',
      } satisfies ApiResponse)
      return
    }

    const validation = validateTemplateImportData(data)
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      } satisfies ApiResponse)
      return
    }

    const existing = validation.name ? findTemplateByName(validation.name) : undefined
    const conflict = !!existing

    res.json({
      success: true,
      data: {
        name: validation.name,
        description: validation.description,
        fieldMapping: validation.fieldMapping,
        conflict,
        existingTemplate: existing || undefined,
      },
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Import preview error:', err)
    if (err instanceof Error && err.message.includes('只允许上传 JSON 文件')) {
      res.status(400).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse)
      return
    }
    res.status(500).json({
      success: false,
      error: '预览导入模板失败',
    } satisfies ApiResponse)
  }
})

router.post('/import', requirePermission('templates:import'), upload.single('file'), (req: Request, res: Response): void => {
  try {
    const operator = req.user as AuthPayload
    const action = req.body.action as TemplateImportConflictAction
    const newName = req.body.newName as string

    if (!req.file) {
      res.status(400).json({
        success: false,
        error: '请上传 JSON 文件',
      } satisfies ApiResponse)
      return
    }

    const content = req.file.buffer.toString('utf-8')
    let data: unknown

    try {
      data = JSON.parse(content)
    } catch {
      res.status(400).json({
        success: false,
        error: 'JSON 文件格式不正确',
      } satisfies ApiResponse)
      return
    }

    const validation = validateTemplateImportData(data)
    if (!validation.valid) {
      res.status(400).json({
        success: false,
        error: validation.error,
      } satisfies ApiResponse)
      return
    }

    const templateName = validation.name!
    const fieldMapping = validation.fieldMapping!
    const description = validation.description

    const existing = findTemplateByName(templateName)
    const conflict = !!existing

    let resultTemplate: FieldMappingTemplateWithData | undefined
    let actualAction: TemplateImportConflictAction = action

    if (conflict) {
      if (!action || !['overwrite', 'skip', 'rename'].includes(action)) {
        res.status(409).json({
          success: false,
          error: '模板名称已存在，请指定冲突处理方式（overwrite/skip/rename）',
          data: {
            conflict: true,
            existingTemplate: existing,
          },
        } satisfies ApiResponse)
        return
      }

      if (action === 'skip') {
        createTemplateLog({
          templateId: existing.id,
          templateName: existing.name,
          operation: '导入模板（跳过）',
          operator,
          detail: `导入模板时发现同名模板「${templateName}」，选择跳过`,
        })

        res.json({
          success: true,
          data: {
            template: existing,
            action: 'skip',
            conflict: true,
          },
          message: '已跳过同名模板',
        } satisfies ApiResponse)
        return
      }

      if (action === 'overwrite') {
        resultTemplate = updateTemplate({
          id: existing.id,
          fieldMapping,
          description,
          operator,
        })

        createTemplateLog({
          templateId: existing.id,
          templateName: existing.name,
          operation: '导入模板（覆盖）',
          operator,
          detail: `导入模板时覆盖了已存在的模板「${templateName}」`,
        })
      }

      if (action === 'rename') {
        const finalName = newName?.trim() || `${templateName} (${Date.now()})`
        const nameExists = findTemplateByName(finalName)
        if (nameExists) {
          res.status(409).json({
            success: false,
            error: '新名称也已存在，请选择其他名称',
          } satisfies ApiResponse)
          return
        }

        resultTemplate = createTemplate({
          name: finalName,
          description,
          fieldMapping,
          operator,
        })

        createTemplateLog({
          templateId: resultTemplate.id,
          templateName: resultTemplate.name,
          operation: '导入模板（重命名）',
          operator,
          detail: `导入模板「${templateName}」时发现同名，重命名为「${finalName}」`,
        })
      }
    } else {
      actualAction = 'rename'
      resultTemplate = createTemplate({
        name: templateName,
        description,
        fieldMapping,
        operator,
      })

      createTemplateLog({
        templateId: resultTemplate.id,
        templateName: resultTemplate.name,
        operation: '导入模板',
        operator,
        detail: `导入新字段映射模板「${templateName}」`,
      })
    }

    res.json({
      success: true,
      data: {
        template: resultTemplate,
        action: actualAction,
        conflict,
      },
      message: '模板导入成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Import template error:', err)
    if (err instanceof Error && err.message.includes('只允许上传 JSON 文件')) {
      res.status(400).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse)
      return
    }
    res.status(500).json({
      success: false,
      error: '导入模板失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id/logs', requirePermission('templates:read'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const logs = getTemplateLogs(id)

    res.json({
      success: true,
      data: logs,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get template logs error:', err)
    res.status(500).json({
      success: false,
      error: '获取模板操作日志失败',
    } satisfies ApiResponse)
  }
})

router.get('/logs/all', requireRole(['clerk']), (req: Request, res: Response): void => {
  try {
    const logs = getTemplateLogs()

    res.json({
      success: true,
      data: logs,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get all template logs error:', err)
    res.status(500).json({
      success: false,
      error: '获取全部模板操作日志失败',
    } satisfies ApiResponse)
  }
})

export default router
