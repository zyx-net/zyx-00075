import { useState, useRef, useEffect } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { batchApi, templateApi, authApi } from '../lib/apiClient'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { Upload, ArrowLeft, FileText, CheckCircle, XCircle, AlertTriangle, Info, Settings, Save, FileJson, Layers } from 'lucide-react'
import type { PrecheckResult, PrecheckRowResult, FieldMappingTemplate, FieldMapping, CsvHeaderInfo, PrecheckResultWithMapping } from '../types'
import { STANDARD_FIELD_LABELS, STANDARD_FIELD_REQUIRED } from '../types'
import FieldMappingEditor from '../components/FieldMappingEditor'

const PRIORITY_LABELS: Record<string, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

const STATUS_LABELS: Record<string, string> = {
  created: '待建',
  assigned: '待分派',
}

type ImportStep = 'select-file' | 'mapping' | 'precheck'

export default function BatchImportPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [step, setStep] = useState<ImportStep>('select-file')
  const [headerInfo, setHeaderInfo] = useState<CsvHeaderInfo | null>(null)
  const [fieldMapping, setFieldMapping] = useState<FieldMapping>({})
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null)
  const [templates, setTemplates] = useState<FieldMappingTemplate[]>([])
  const [precheckResult, setPrecheckResult] = useState<PrecheckResultWithMapping | null>(null)
  const [loading, setLoading] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [savingTemplate, setSavingTemplate] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [isClerk, setIsClerk] = useState(false)
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false)
  const [newTemplateName, setNewTemplateName] = useState('')
  const [newTemplateDesc, setNewTemplateDesc] = useState('')

  useEffect(() => {
    checkPermissions()
    loadTemplates()
  }, [])

  async function checkPermissions() {
    const res = await authApi.getMe()
    if (res.success && res.data) {
      setIsClerk(res.data.role === 'clerk')
    }
  }

  async function loadTemplates() {
    const res = await templateApi.getTemplates()
    if (res.success && res.data) {
      setTemplates(res.data)
    }
  }

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile)
        setPrecheckResult(null)
        setHeaderInfo(null)
        setFieldMapping({})
        setSelectedTemplateId(null)
        setError(null)
        setStep('select-file')
      } else {
        setError('请上传 CSV 格式的文件')
      }
    }
  }

  async function handleAnalyzeHeaders() {
    if (!file) return

    try {
      setAnalyzing(true)
      setError(null)

      const res = await batchApi.analyzeHeaders(file)
      if (res.success && res.data) {
        setHeaderInfo(res.data)
        setFieldMapping(res.data.detectedMappings)
        setStep('mapping')
      } else {
        setError(res.error || '分析表头失败')
      }
    } catch (err) {
      setError('分析表头失败，请稍后重试')
    } finally {
      setAnalyzing(false)
    }
  }

  function handleApplyTemplate(templateId: number) {
    const template = templates.find(t => t.id === templateId)
    if (template) {
      setSelectedTemplateId(templateId)
      setFieldMapping(template.fieldMapping)
    }
  }

  async function handleStartPrecheck() {
    if (!file || !headerInfo) return

    const requiredFields = ['customerName', 'customerPhone', 'deviceType', 'deviceModel', 'faultDescription', 'priority', 'initialStatus']
    const missing = requiredFields.filter(f => !fieldMapping[f as keyof FieldMapping])
    if (missing.length > 0) {
      setError(`请为以下字段配置映射：${missing.map(f => STANDARD_FIELD_LABELS[f as keyof typeof STANDARD_FIELD_LABELS]).join('、')}`)
      return
    }

    try {
      setLoading(true)
      setError(null)

      const options = selectedTemplateId
        ? { templateId: selectedTemplateId }
        : { fieldMapping }

      const res = await batchApi.upload(file, options)
      if (res.success && res.data) {
        setPrecheckResult(res.data)
        setStep('precheck')
      } else {
        setError(res.error || '预检失败')
      }
    } catch (err) {
      setError('预检失败，请稍后重试')
    } finally {
      setLoading(false)
    }
  }

  async function handleSaveAsTemplate() {
    if (!newTemplateName.trim()) {
      setError('请输入模板名称')
      return
    }

    try {
      setSavingTemplate(true)
      setError(null)

      const res = await templateApi.createTemplate({
        name: newTemplateName.trim(),
        description: newTemplateDesc.trim() || undefined,
        fieldMapping,
      })

      if (res.success && res.data) {
        setShowSaveTemplateModal(false)
        setNewTemplateName('')
        setNewTemplateDesc('')
        loadTemplates()
        setSelectedTemplateId(res.data.id)
      } else {
        setError(res.error || '保存模板失败')
      }
    } catch (err) {
      setError('保存模板失败，请稍后重试')
    } finally {
      setSavingTemplate(false)
    }
  }

  function handleSubmit() {
    if (!precheckResult) return
    navigate(`/batch/${precheckResult.batchId}`)
  }

  function downloadTemplate() {
    const headers = ['客户姓名', '客户电话', '设备类型', '设备型号', '故障描述', '优先级', '初始状态', '负责人']
    const sampleData = [
      ['张三', '13800138000', '手机', 'iPhone 15', '屏幕破碎', '高', '待建', ''],
      ['李四', '13900139000', '笔记本', 'MacBook Pro', '键盘失灵', '中', '待分派', '张技师'],
    ]

    const csvContent = [headers.join(','), ...sampleData.map(row => row.join(','))].join('\n')
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = '工单导入模板.csv'
    document.body.appendChild(a)
    a.click()
    URL.revokeObjectURL(url)
    document.body.removeChild(a)
  }

  function resetUpload() {
    setFile(null)
    setStep('select-file')
    setHeaderInfo(null)
    setFieldMapping({})
    setSelectedTemplateId(null)
    setPrecheckResult(null)
    setError(null)
  }

  const canSubmit = precheckResult && precheckResult.validRows > 0
  const hasValidMapping = headerInfo && Object.keys(fieldMapping).length >= 7

  return (
    <Layout>
      <div className="space-y-6">
        <div className="flex items-center space-x-4">
          <Link
            to="/batch"
            className="inline-flex items-center text-gray-600 hover:text-gray-900"
          >
            <ArrowLeft className="h-5 w-5 mr-1" />
            返回
          </Link>
          <h1 className="text-2xl font-bold text-gray-900">批量导入工单</h1>
        </div>

        <div className="flex items-center space-x-2">
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${step === 'select-file' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            <FileText className="h-4 w-4 mr-2" />
            1. 选择文件
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${step === 'mapping' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            <Settings className="h-4 w-4 mr-2" />
            2. 字段映射
          </div>
          <div className="w-8 h-0.5 bg-gray-200" />
          <div className={`flex items-center px-4 py-2 rounded-full text-sm font-medium ${step === 'precheck' ? 'bg-blue-100 text-blue-800' : 'bg-gray-100 text-gray-600'}`}>
            <CheckCircle className="h-4 w-4 mr-2" />
            3. 预检结果
          </div>
        </div>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        {step === 'select-file' && (
          <>
            <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
              <div className="flex items-start">
                <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
                <div>
                  <h3 className="text-sm font-medium text-blue-800">CSV 格式说明</h3>
                  <p className="mt-1 text-sm text-blue-700">
                    请确保 CSV 文件包含以下列：客户姓名、客户电话、设备类型、设备型号、故障描述、优先级（低/中/高/紧急）、初始状态（待建/待分派）、负责人（待分派状态时必填）。
                    如使用其他表头名称，可在下一步进行字段映射。
                  </p>
                  <button
                    onClick={downloadTemplate}
                    className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
                  >
                    下载标准模板文件
                  </button>
                </div>
              </div>
            </div>

            <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">上传文件</h2>
              
              <div className="flex items-center space-x-4">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".csv"
                  onChange={handleFileChange}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex items-center px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                >
                  <FileText className="h-4 w-4 mr-2" />
                  选择文件
                </button>
                {file && (
                  <span className="text-sm text-gray-600">{file.name} ({(file.size / 1024).toFixed(2)} KB)</span>
                )}
                {file && (
                  <button
                    onClick={handleAnalyzeHeaders}
                    disabled={analyzing}
                    className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                  >
                    {analyzing ? '分析中...' : '分析表头'}
                  </button>
                )}
              </div>

              {templates.length > 0 && (
                <div className="mt-6 pt-6 border-t border-gray-200">
                  <h3 className="text-sm font-medium text-gray-700 mb-3">已有映射模板</h3>
                  <div className="flex flex-wrap gap-2">
                    {templates.map(template => (
                      <button
                        key={template.id}
                        onClick={() => {
                          if (file) {
                            handleApplyTemplate(template.id)
                            handleStartPrecheck()
                          } else {
                            setError('请先选择 CSV 文件')
                          }
                        }}
                        className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm rounded-md text-gray-700 bg-white hover:bg-gray-50 transition-colors"
                      >
                        <Layers className="h-3.5 w-3.5 mr-1.5" />
                        {template.name}
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </>
        )}

        {step === 'mapping' && headerInfo && (
          <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold text-gray-900">字段映射配置</h2>
              <div className="flex items-center space-x-2">
                {isClerk && (
                  <button
                    onClick={() => setShowSaveTemplateModal(true)}
                    className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                  >
                    <Save className="h-4 w-4 mr-1.5" />
                    保存为模板
                  </button>
                )}
                <button
                  onClick={resetUpload}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  重新选择文件
                </button>
              </div>
            </div>

            {selectedTemplateId && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 mb-4">
                <div className="flex items-center">
                  <Layers className="h-5 w-5 text-green-600 mr-2" />
                  <span className="text-sm text-green-800">
                    已套用模板：
                    <span className="font-medium">{templates.find(t => t.id === selectedTemplateId)?.name}</span>
                  </span>
                </div>
              </div>
            )}

            {templates.length > 0 && (
              <div className="mb-4">
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  快速套用已有模板
                </label>
                <div className="flex flex-wrap gap-2">
                  {templates.map(template => (
                    <button
                      key={template.id}
                      onClick={() => handleApplyTemplate(template.id)}
                      className={`inline-flex items-center px-3 py-1.5 border text-sm rounded-md transition-colors ${
                        selectedTemplateId === template.id
                          ? 'bg-blue-100 border-blue-300 text-blue-800'
                          : 'border-gray-300 text-gray-700 bg-white hover:bg-gray-50'
                      }`}
                    >
                      <Layers className="h-3.5 w-3.5 mr-1.5" />
                      {template.name}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <div className="mb-4">
              <h3 className="text-sm font-medium text-gray-700 mb-2">
                CSV 文件：{headerInfo.fileName}
              </h3>
              {headerInfo.unmappedHeaders.length > 0 && (
                <p className="text-sm text-yellow-600 mb-2">
                  发现 {headerInfo.unmappedHeaders.length} 个未匹配的列：
                  {headerInfo.unmappedHeaders.join('、')}
                </p>
              )}
              {headerInfo.missingRequiredFields.length > 0 && (
                <p className="text-sm text-red-600">
                  缺少必填字段：
                  {headerInfo.missingRequiredFields.map(f => STANDARD_FIELD_LABELS[f]).join('、')}
                </p>
              )}
            </div>

            <FieldMappingEditor
              headers={headerInfo.headers}
              detectedMappings={headerInfo.detectedMappings}
              value={fieldMapping}
              onChange={mapping => {
                setFieldMapping(mapping)
                setSelectedTemplateId(null)
              }}
              disabled={!isClerk}
            />

            <div className="mt-6 flex justify-end">
              <button
                onClick={handleStartPrecheck}
                disabled={loading || !hasValidMapping}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                {loading ? '预检中...' : '开始预检'}
              </button>
            </div>
          </div>
        )}

        {step === 'precheck' && precheckResult && (
          <>
            <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold text-gray-900">预检结果</h2>
                <button
                  onClick={resetUpload}
                  className="inline-flex items-center px-3 py-1.5 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  重新导入
                </button>
              </div>

              {precheckResult.usedTemplateName && (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-4">
                  <div className="flex items-center">
                    <Layers className="h-5 w-5 text-blue-600 mr-2" />
                    <span className="text-sm text-blue-800">
                      使用模板：<span className="font-medium">{precheckResult.usedTemplateName}</span>
                    </span>
                  </div>
                </div>
              )}
              
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
                <div className="bg-gray-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">总行数</p>
                  <p className="text-2xl font-bold text-gray-900">{precheckResult.totalRows}</p>
                </div>
                <div className="bg-green-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">通过</p>
                  <p className="text-2xl font-bold text-green-600">{precheckResult.validRows}</p>
                </div>
                <div className="bg-yellow-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">有警告</p>
                  <p className="text-2xl font-bold text-yellow-600">{precheckResult.warningRows}</p>
                </div>
                <div className="bg-red-50 rounded-lg p-4">
                  <p className="text-sm text-gray-500">错误</p>
                  <p className="text-2xl font-bold text-red-600">{precheckResult.invalidRows}</p>
                </div>
              </div>

              {precheckResult.invalidRows > 0 && (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mb-6">
                  <div className="flex items-start">
                    <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 mr-3 flex-shrink-0" />
                    <div>
                      <p className="text-sm font-medium text-yellow-800">
                        发现 {precheckResult.invalidRows} 条错误数据，这些行将被跳过，不会提交
                      </p>
                    </div>
                  </div>
                </div>
              )}

              <div className="overflow-x-auto">
                <table className="min-w-full divide-y divide-gray-200">
                  <thead className="bg-gray-50">
                    <tr>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        行号
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        客户姓名
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        客户电话
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        设备
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        优先级
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        初始状态
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        负责人
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        状态
                      </th>
                      <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                        问题
                      </th>
                    </tr>
                  </thead>
                  <tbody className="bg-white divide-y divide-gray-200">
                    {precheckResult.rows.map((row: PrecheckRowResult) => (
                      <tr key={row.rowIndex} className="hover:bg-gray-50">
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {row.rowIndex + 1}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-900">
                          {row.data?.customerName || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.data?.customerPhone || '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.data ? `${row.data.deviceType} ${row.data.deviceModel}` : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.data?.priority ? PRIORITY_LABELS[row.data.priority] || row.data.priority : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.data?.initialStatus ? STATUS_LABELS[row.data.initialStatus] || row.data.initialStatus : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap text-sm text-gray-500">
                          {row.data?.assigneeId ? '已指定' : '-'}
                        </td>
                        <td className="px-4 py-3 whitespace-nowrap">
                          {row.valid ? (
                            row.warnings.length > 0 ? (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">
                                <AlertTriangle className="h-3 w-3 mr-1" />
                                有警告
                              </span>
                            ) : (
                              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                                <CheckCircle className="h-3 w-3 mr-1" />
                                通过
                              </span>
                            )
                          ) : (
                            <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                              <XCircle className="h-3 w-3 mr-1" />
                              错误
                            </span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-sm">
                          <div className="space-y-1">
                            {row.errors.map((err, i) => (
                              <div key={i} className="flex items-start text-red-600">
                                <XCircle className="h-4 w-4 mt-0.5 mr-1 flex-shrink-0" />
                                <span>{err}</span>
                              </div>
                            ))}
                            {row.warnings.map((warn, i) => (
                              <div key={i} className="flex items-start text-yellow-600">
                                <AlertTriangle className="h-4 w-4 mt-0.5 mr-1 flex-shrink-0" />
                                <span>{warn}</span>
                              </div>
                            ))}
                            {row.errors.length === 0 && row.warnings.length === 0 && (
                              <div className="flex items-center text-green-600">
                                <CheckCircle className="h-4 w-4 mr-1" />
                                <span>无问题</span>
                              </div>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="flex justify-end">
              <button
                onClick={handleSubmit}
                disabled={!canSubmit}
                className="inline-flex items-center px-6 py-3 border border-transparent text-base font-medium rounded-md text-white bg-green-600 hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                继续提交 ({precheckResult.validRows} 条)
              </button>
            </div>
          </>
        )}

        {showSaveTemplateModal && (
          <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
            <div className="bg-white rounded-lg shadow-xl max-w-md w-full">
              <div className="flex items-center justify-between p-4 border-b">
                <h3 className="text-lg font-semibold text-gray-900">保存为模板</h3>
                <button
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="text-gray-400 hover:text-gray-600"
                >
                  <XCircle className="h-5 w-5" />
                </button>
              </div>
              <div className="p-4 space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    模板名称 <span className="text-red-500">*</span>
                  </label>
                  <input
                    type="text"
                    value={newTemplateName}
                    onChange={e => setNewTemplateName(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="请输入模板名称"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    描述
                  </label>
                  <textarea
                    value={newTemplateDesc}
                    onChange={e => setNewTemplateDesc(e.target.value)}
                    className="w-full border border-gray-300 rounded-md px-3 py-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    rows={2}
                    placeholder="可选，描述模板用途"
                  />
                </div>
                <div className="text-sm text-gray-600">
                  <p className="font-medium mb-2">当前映射配置：</p>
                  <div className="grid grid-cols-2 gap-1">
                    {Object.entries(fieldMapping).map(([field, header]) => (
                      <div key={field} className="text-xs">
                        <span className="text-gray-500">
                          {STANDARD_FIELD_LABELS[field as keyof typeof STANDARD_FIELD_LABELS]}
                        </span>
                        {' → '}
                        <span className="font-medium text-gray-900">{header}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
              <div className="flex justify-end space-x-3 p-4 border-t bg-gray-50">
                <button
                  onClick={() => setShowSaveTemplateModal(false)}
                  className="px-4 py-2 border border-gray-300 text-sm font-medium rounded-md text-gray-700 bg-white hover:bg-gray-50"
                >
                  取消
                </button>
                <button
                  onClick={handleSaveAsTemplate}
                  disabled={savingTemplate}
                  className="px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50"
                >
                  {savingTemplate ? '保存中...' : '保存'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </Layout>
  )
}
