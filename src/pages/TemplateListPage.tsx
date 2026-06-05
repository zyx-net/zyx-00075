import { useState, useEffect, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { templateApi, authApi } from '../lib/apiClient'
import { useAuthStore } from '../store/authStore'
import Layout from '../components/Layout'
import { ArrowLeft, Plus, Edit2, Trash2, Download, Upload, Save, X, Eye, History, FileJson, AlertTriangle, CheckCircle2 } from 'lucide-react'
import type { FieldMappingTemplate, FieldMapping, TemplateOperationLog, TemplateImportConflictAction } from '../types'
import { STANDARD_FIELD_LABELS } from '../types'
import FieldMappingEditor from '../components/FieldMappingEditor'

const ROLE_LABELS: Record<string, string> = {
  clerk: '店员',
  technician: '技师',
  quality_inspector: '质检员',
}

export default function TemplateListPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const importFileInputRef = useRef<HTMLInputElement>(null)
  const [templates, setTemplates] = useState<FieldMappingTemplate[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [isClerk, setIsClerk] = useState(false)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTemplate, setEditingTemplate] = useState<FieldMappingTemplate | null>(null)
  const [viewingLogs, setViewingLogs] = useState<FieldMappingTemplate | null>(null)
  const [templateLogs, setTemplateLogs] = useState<TemplateOperationLog[]>([])
  const [showDeleteConfirm, setShowDeleteConfirm] = useState<number | null>(null)

  const [formName, setFormName] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formMapping, setFormMapping] = useState<FieldMapping>({})
  const [formError, setFormError] = useState<string | null>(null)

  const [importPreview, setImportPreview] = useState<{
    file: File
    name: string
    description?: string
    fieldMapping: FieldMapping
    conflict: boolean
    existingTemplate?: FieldMappingTemplate
  } | null>(null)
  const [importConflictAction, setImportConflictAction] = useState<TemplateImportConflictAction>('rename')
  const [importNewName, setImportNewName] = useState('')

  const demoHeaders = ['客户姓名', '联系电话', '设备种类', '品牌型号', '问题描述', '紧急程度', '起始状态', '指派人员']

  useEffect(() => {
    loadTemplates()
    checkPermissions()
  }, [])

  async function checkPermissions() {
    const res = await authApi.getMe()
    if (res.success && res.data) {
      setIsClerk(res.data.role === 'clerk')
    }
  }

  async function loadTemplates() {
    try {
      setLoading(true)
      setError(null)
      const res = await templateApi.getTemplates()
      if (res.success && res.data) {
        setTemplates(res.data)
      } else {
        setError(res.error || '加载模板失败')
      }
    } catch (err) {
      setError('加载模板失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  function openCreateModal() {
    setEditingTemplate(null)
    setFormName('')
    setFormDescription('')
    setFormMapping({})
    setFormError(null)
    setShowCreateModal(true)
  }

  function openEditModal(template: FieldMappingTemplate) {
    setEditingTemplate(template)
    setFormName(template.name)
    setFormDescription(template.description || '')
    setFormMapping(template.fieldMapping)
    setFormError(null)
    setShowCreateModal(true)
  }

  async function handleSaveTemplate() {
    if (!formName.trim()) {
      setFormError('请输入模板名称')
      return
    }

    const requiredFields = ['customerName', 'customerPhone', 'deviceType', 'deviceModel', 'faultDescription', 'priority', 'initialStatus']
    const missing = requiredFields.filter(f => !formMapping[f as keyof FieldMapping])
    if (missing.length > 0) {
      setFormError(`请为以下字段配置映射：${missing.map(f => STANDARD_FIELD_LABELS[f as keyof typeof STANDARD_FIELD_LABELS]).join('、')}`)
      return
    }

    try {
      setFormError(null)
      let res

      if (editingTemplate) {
        res = await templateApi.updateTemplate(editingTemplate.id, {
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          fieldMapping: formMapping,
        })
      } else {
        res = await templateApi.createTemplate({
          name: formName.trim(),
          description: formDescription.trim() || undefined,
          fieldMapping: formMapping,
        })
      }

      if (res.success) {
        setShowCreateModal(false)
        loadTemplates()
      } else {
        setFormError(res.error || '保存失败')
      }
    } catch (err) {
      setFormError('保存失败，请稍后重试')
    }
  }

  async function handleDeleteTemplate(id: number) {
    try {
      const res = await templateApi.deleteTemplate(id)
      if (res.success) {
        setShowDeleteConfirm(null)
        loadTemplates()
      } else {
        setError(res.error || '删除失败')
      }
    } catch (err) {
      setError('删除失败，请稍后重试')
    }
  }

  async function handleExportTemplate(template: FieldMappingTemplate) {
    try {
      const res = await templateApi.exportTemplate(template.id)
      if (res.ok) {
        const blob = await res.blob()
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `${template.name}.json`
        document.body.appendChild(a)
        a.click()
        URL.revokeObjectURL(url)
        document.body.removeChild(a)
      }
    } catch (err) {
      setError('导出失败，请稍后重试')
    }
  }

  async function handleImportPreview(file: File) {
    try {
      setError(null)
      const res = await templateApi.importPreview(file)
      if (res.success && res.data) {
        setImportPreview({
          file,
          name: res.data.name,
          description: res.data.description,
          fieldMapping: res.data.fieldMapping,
          conflict: res.data.conflict,
          existingTemplate: res.data.existingTemplate,
        })
        setImportNewName(`${res.data.name} (${new Date().getTime()})`)
      } else {
        setError(res.error || '预览失败')
      }
    } catch (err) {
      setError('预览失败，请稍后重试')
    }
  }

  async function handleImportTemplate() {
    if (!importPreview) return

    try {
      setError(null)
      const res = await templateApi.importTemplate(importPreview.file, {
        action: importPreview.conflict ? importConflictAction : undefined,
        newName: importConflictAction === 'rename' ? importNewName.trim() : undefined,
      })

      if (res.success) {
        setImportPreview(null)
        loadTemplates()
      } else {
        setError(res.error || '导入失败')
      }
    } catch (err) {
      setError('导入失败，请稍后重试')
    }
  }

  async function handleViewLogs(template: FieldMappingTemplate) {
    try {
      setViewingLogs(template)
      const res = await templateApi.getTemplateLogs(template.id)
      if (res.success && res.data) {
        setTemplateLogs(res.data)
      }
    } catch (err) {
      setError('加载日志失败')
    }
  }

  function formatDate(dateStr: string) {
    return new Date(dateStr).toLocaleString('zh-CN')
  }

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <Link
              to="/batch"
              className="inline-flex items-center text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft className="h-5 w-5 mr-1" />
              返回
            </Link>
            <h1 className="text-2xl font-bold text-gray-900">字段映射模板管理</h1>
          </div>
          {isClerk && (
            <div className="flex items-center space-x-2">
              <input
                ref={importFileInputRef}
                type="file"
                accept=".json"
                onChange={e => {
                  const file = e.target.files?.[0]
                  if (file) handleImportPreview(file)
                }}
                className="hidden"
              />
              <button
                onClick={() => importFileInputRef.current?.click()}
                className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                导入模板
              </button>
              <button
                onClick={openCreateModal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 transition-colors"
              >
                <Plus className="h-4 w-4 mr-2" />
                新建模板
              </button>
            </div>
          )}
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {loading ? (
          <div className="text-center py-12 text-gray-500">加载中...</div>
        ) : templates.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
            <FileJson className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <p className="text-gray-500 mb-4">暂无字段映射模板</p>
            {isClerk && (
              <button
                onClick={openCreateModal}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
              >
                <Plus className="h-4 w-4 mr-2" />
                创建第一个模板
              </button>
            )}
          </div>
        ) : (
          <div className="bg-white shadow-sm rounded-lg border border-gray-200 overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    模板名称
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    描述
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    创建人
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    更新时间
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                    操作
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {templates.map(template => (
                  <tr key={template.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm font-medium text-gray-900">{template.name}</div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="text-sm text-gray-500 max-w-xs truncate">
                        {template.description || '-'}
                      </div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="text-sm text-gray-900">{template.created_by_name}</div>
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                      {formatDate(template.updated_at)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                      <button
                        onClick={() => handleViewLogs(template)}
                        className="text-gray-600 hover:text-gray-900 mr-3"
                        title="操作日志"
                      >
                        <History className="h-4 w-4" />
                      </button>
                      <button
                        onClick={() => handleExportTemplate(template)}
                        className="text-green-600 hover:text-green-900 mr-3"
                        title="导出"
                      >
                        <Download className="h-4 w-4" />
                      </button>
                      {isClerk && (
                        <>
                          <button
                            onClick={() => openEditModal(template)}
                            className="text-blue-600 hover:text-blue-900 mr-3"
                            title="编辑"
                          >
                            <Edit2 className="h-4 w-4" />
                          </button>
                          <button
                            onClick={() => setShowDeleteConfirm(template.id)}
                            className="text-red-600 hover:text-red-900"
                            title="删除"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {showCreateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  {editingTemplate ? '编辑模板' : '新建模板'}
                </h3>
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                {formError && (
                  <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md text-sm">
                    {formError}
                  </div>
                )}
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    模板名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={formName}
                    onChange={e => setFormName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入模板名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    描述
                  </label>
                  <textarea
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="可选，描述模板用途"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    字段映射 <span className="text-red-500">*</span>
                  </label>
                  <p className="text-xs text-gray-500 mb-3">
                    使用下方演示列配置映射关系，或直接在导入 CSV 时根据实际表头进行配置
                  </p>
                  <FieldMappingEditor
                    headers={demoHeaders}
                    value={formMapping}
                    onChange={setFormMapping}
                    disabled={!isClerk}
                  />
                </div>
              </div>
              <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveTemplate}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <Save className="h-4 w-4 inline mr-1" />
                  保存
                </button>
              </div>
            </div>
          </div>
        )}

        {showDeleteConfirm !== null && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">确认删除</h3>
              </div>
              <div className="p-4">
                <div className="flex items-start">
                  <AlertTriangle className="h-6 w-6 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                  <div>
                    <p className="text-gray-700">确定要删除这个模板吗？</p>
                    <p className="text-sm text-gray-500 mt-1">删除后无法恢复，操作日志会保留。</p>
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowDeleteConfirm(null)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={() => handleDeleteTemplate(showDeleteConfirm)}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-red-600 hover:bg-red-700"
                >
                  删除
                </button>
              </div>
            </div>
          </div>
        )}

        {importPreview && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-3xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">导入模板预览</h3>
                <button
                  onClick={() => setImportPreview(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <div className="flex items-start">
                    <Eye className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="font-medium text-blue-800">{importPreview.name}</p>
                      {importPreview.description && (
                        <p className="text-sm text-blue-700 mt-1">{importPreview.description}</p>
                      )}
                      <p className="text-xs text-blue-600 mt-2">
                        包含 {Object.keys(importPreview.fieldMapping).length} 个字段映射
                      </p>
                    </div>
                  </div>
                </div>

                {importPreview.conflict && importPreview.existingTemplate && (
                  <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
                    <div className="flex items-start">
                      <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                      <div className="flex-1">
                        <p className="font-medium text-yellow-800">发现同名模板</p>
                        <p className="text-sm text-yellow-700 mt-1">
                          已存在名为「{importPreview.name}」的模板，请选择处理方式：
                        </p>
                        <div className="mt-3 space-y-2">
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="conflictAction"
                              value="overwrite"
                              checked={importConflictAction === 'overwrite'}
                              onChange={() => setImportConflictAction('overwrite')}
                              className="mr-2"
                            />
                            <span className="text-sm">覆盖 - 用导入的模板替换现有模板</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="conflictAction"
                              value="skip"
                              checked={importConflictAction === 'skip'}
                              onChange={() => setImportConflictAction('skip')}
                              className="mr-2"
                            />
                            <span className="text-sm">跳过 - 保留现有模板，不导入</span>
                          </label>
                          <label className="flex items-center">
                            <input
                              type="radio"
                              name="conflictAction"
                              value="rename"
                              checked={importConflictAction === 'rename'}
                              onChange={() => setImportConflictAction('rename')}
                              className="mr-2"
                            />
                            <span className="text-sm">另存为 - 使用新名称导入</span>
                          </label>
                          {importConflictAction === 'rename' && (
                            <input
                              type="text"
                              value={importNewName}
                              onChange={e => setImportNewName(e.target.value)}
                              className="ml-6 mt-1 w-full border border-gray-300 rounded px-2 py-1 text-sm"
                              placeholder="请输入新名称"
                            />
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                )}

                <div className="text-sm">
                  <p className="font-medium text-gray-700 mb-2">字段映射：</p>
                  <div className="grid grid-cols-2 gap-2">
                    {Object.entries(importPreview.fieldMapping).map(([field, header]) => (
                      <div key={field} className="flex items-center justify-between bg-gray-50 px-3 py-2 rounded text-sm">
                        <span className="text-gray-600">
                          {STANDARD_FIELD_LABELS[field as keyof typeof STANDARD_FIELD_LABELS]}
                        </span>
                        <span className="text-gray-900 font-medium">→ {header}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setImportPreview(null)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleImportTemplate}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700"
                >
                  <CheckCircle2 className="h-4 w-4 inline mr-1" />
                  确认导入
                </button>
              </div>
            </div>
          </div>
        )}

        {viewingLogs && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">
                  操作日志 - {viewingLogs.name}
                </h3>
                <button
                  onClick={() => setViewingLogs(null)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="divide-y divide-gray-200 max-h-96 overflow-y-auto">
                {templateLogs.length === 0 ? (
                  <div className="p-8 text-center text-gray-500">暂无操作日志</div>
                ) : (
                  templateLogs.map(log => (
                    <div key={log.id} className="p-4 hover:bg-gray-50">
                      <div className="flex items-center justify-between">
                        <span className="text-sm font-medium text-gray-900">{log.operation}</span>
                        <span className="text-xs text-gray-500">{formatDate(log.created_at)}</span>
                      </div>
                      <div className="mt-1 flex items-center text-sm text-gray-600">
                        <span>{log.operator_name}</span>
                        <span className="mx-2">·</span>
                        <span>{ROLE_LABELS[log.operator_role] || log.operator_role}</span>
                      </div>
                      {log.detail && (
                        <p className="mt-2 text-sm text-gray-700 bg-gray-50 p-2 rounded">{log.detail}</p>
                      )}
                    </div>
                  ))
                )}
              </div>
              <div className="flex justify-end p-4 border-t bg-gray-50">
                <button
                  onClick={() => setViewingLogs(null)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  关闭
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
