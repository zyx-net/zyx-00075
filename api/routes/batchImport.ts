import { Router, type Request, type Response } from 'express'
import type { ApiResponse, AuthPayload, FieldMapping } from '../types.js'
import { authMiddleware, requirePermission, requireRole } from '../auth.js'
import {
  createBatch,
  parseCsv,
  precheckBatch,
  submitBatch,
  getBatches,
  getBatchDetail,
  createExport,
  analyzeCsvHeaders,
  applyMappingToCsv,
  type ParsedCsvRow,
} from '../batchWorkflow.js'
import { findTemplateById, createTemplateLog } from '../store/templateStore.js'
import multer from 'multer'

const router = Router()
router.use(authMiddleware)

const storage = multer.memoryStorage()
const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (file.originalname.endsWith('.csv')) {
      cb(null, true)
    } else {
      cb(new Error('只允许上传 CSV 文件'))
    }
  },
})

router.get('/', requirePermission('batch:read'), (req: Request, res: Response): void => {
  try {
    const operator = req.user as AuthPayload
    const batches = getBatches(operator)

    res.json({
      success: true,
      data: batches,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get batches error:', err)
    res.status(500).json({
      success: false,
      error: '获取批次列表失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id', requirePermission('batch:read'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload

    const detail = getBatchDetail(id, operator)
    if (!detail) {
      res.status(404).json({
        success: false,
        error: '批次不存在',
      } satisfies ApiResponse)
      return
    }

    res.json({
      success: true,
      data: detail,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get batch detail error:', err)
    res.status(500).json({
      success: false,
      error: '获取批次详情失败',
    } satisfies ApiResponse)
  }
})

router.post('/analyze-headers', requirePermission('batch:import'), upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: '请上传 CSV 文件',
      } satisfies ApiResponse)
      return
    }

    const fileContent = req.file.buffer.toString('utf-8')
    const headerInfo = analyzeCsvHeaders(fileContent)

    res.json({
      success: true,
      data: {
        ...headerInfo,
        fileName: req.file.originalname,
        fileContent,
      },
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Analyze headers error:', err)
    if (err instanceof Error && err.message.includes('只允许上传 CSV 文件')) {
      res.status(400).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse)
      return
    }
    res.status(500).json({
      success: false,
      error: '分析表头失败',
    } satisfies ApiResponse)
  }
})

router.post('/upload', requirePermission('batch:import'), upload.single('file'), async (req: Request, res: Response): Promise<void> => {
  try {
    if (!req.file) {
      res.status(400).json({
        success: false,
        error: '请上传 CSV 文件',
      } satisfies ApiResponse)
      return
    }

    const operator = req.user as AuthPayload
    const fileContent = req.file.buffer.toString('utf-8')
    const fileName = req.file.originalname

    const templateId = req.body.templateId ? parseInt(req.body.templateId, 10) : undefined
    const fieldMappingStr = req.body.fieldMapping as string
    let fieldMapping: FieldMapping | undefined

    if (fieldMappingStr) {
      try {
        fieldMapping = JSON.parse(fieldMappingStr) as FieldMapping
      } catch {
        res.status(400).json({
          success: false,
          error: 'fieldMapping 格式不正确，应为 JSON',
        } satisfies ApiResponse)
        return
      }
    }

    let parsedRows: ParsedCsvRow[]
    let usedTemplateId: number | undefined
    let usedTemplateName: string | undefined

    if (templateId) {
      const template = findTemplateById(templateId)
      if (!template) {
        res.status(404).json({
          success: false,
          error: '指定的模板不存在',
        } satisfies ApiResponse)
        return
      }

      parsedRows = applyMappingToCsv(fileContent, template.fieldMapping)
      usedTemplateId = template.id
      usedTemplateName = template.name

      createTemplateLog({
        templateId: template.id,
        templateName: template.name,
        operation: '套用模板',
        operator,
        detail: `在批量导入时套用模板「${template.name}」，文件：${fileName}`,
      })
    } else if (fieldMapping) {
      parsedRows = applyMappingToCsv(fileContent, fieldMapping)
    } else {
      parsedRows = parseCsv(fileContent)
    }

    if (parsedRows.length === 0) {
      res.status(400).json({
        success: false,
        error: 'CSV 文件内容为空或格式不正确',
      } satisfies ApiResponse)
      return
    }

    const batch = createBatch({
      fileName,
      createdBy: operator.userId,
      createdByName: operator.name,
    })

    const precheckResult = await precheckBatch({
      batchId: batch.id,
      rows: parsedRows,
      operator,
    })

    res.json({
      success: true,
      data: {
        ...precheckResult,
        usedTemplateId,
        usedTemplateName,
        usedMapping: fieldMapping,
      },
      message: `已解析 ${parsedRows.length} 条数据，请检查预检结果`,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Upload batch error:', err)
    if (err instanceof Error && err.message.includes('只允许上传 CSV 文件')) {
      res.status(400).json({
        success: false,
        error: err.message,
      } satisfies ApiResponse)
      return
    }
    res.status(500).json({
      success: false,
      error: '文件上传失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/precheck', requirePermission('batch:import'), async (req: Request, res: Response): Promise<void> => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload
    const { rows } = req.body as { rows: ParsedCsvRow[] }

    if (!rows || rows.length === 0) {
      res.status(400).json({
        success: false,
        error: '缺少数据行',
      } satisfies ApiResponse)
      return
    }

    const precheckResult = await precheckBatch({
      batchId: id,
      rows,
      operator,
    })

    res.json({
      success: true,
      data: precheckResult,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Precheck batch error:', err)
    res.status(500).json({
      success: false,
      error: '预检失败',
    } satisfies ApiResponse)
  }
})

router.post('/:id/submit', requirePermission('batch:submit'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const operator = req.user as AuthPayload
    const { rowIds } = req.body as { rowIds?: number[] }

    const result = submitBatch({
      batchId: id,
      operator,
      rowIds,
    })

    res.json({
      success: true,
      data: result,
      message: `提交完成：成功 ${result.successRows} 条，失败 ${result.failedRows} 条`,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Submit batch error:', err)
    if (err instanceof Error && err.message.includes('版本冲突')) {
      res.status(409).json({
        success: false,
        error: '版本冲突：工单已被他人修改，请刷新后重试',
      } satisfies ApiResponse)
      return
    }
    res.status(500).json({
      success: false,
      error: err instanceof Error ? err.message : '提交失败',
    } satisfies ApiResponse)
  }
})

router.get('/:id/export', requirePermission('batch:export'), (req: Request, res: Response): void => {
  try {
    const id = parseInt(req.params.id, 10)
    const exportType = (req.query.type as 'all' | 'success' | 'failed') || 'all'
    const operator = req.user as AuthPayload

    if (!['all', 'success', 'failed'].includes(exportType)) {
      res.status(400).json({
        success: false,
        error: '导出类型不正确，有效值：all/success/failed',
      } satisfies ApiResponse)
      return
    }

    const result = createExport(id, exportType, operator)

    res.setHeader('Content-Type', 'text/csv; charset=utf-8')
    res.setHeader('Content-Disposition', `attachment; filename="${encodeURIComponent(result.fileName)}"`)
    res.setHeader('X-Record-Id', String(result.recordId))

    const bom = '\uFEFF'
    res.send(bom + result.content)
  } catch (err) {
    console.error('Export batch error:', err)
    res.status(500).json({
      success: false,
      error: '导出失败',
    } satisfies ApiResponse)
  }
})

export default router
