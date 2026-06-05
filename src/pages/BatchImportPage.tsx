import { useState, useRef } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { batchApi } from '../lib/apiClient'
import Layout from '../components/Layout'
import { useAuthStore } from '../store/authStore'
import { Upload, ArrowLeft, FileText, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react'
import type { PrecheckResult, PrecheckRowResult } from '../types'

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

export default function BatchImportPage() {
  const navigate = useNavigate()
  const { user } = useAuthStore()
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [file, setFile] = useState<File | null>(null)
  const [precheckResult, setPrecheckResult] = useState<PrecheckResult | null>(null)
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const selectedFile = e.target.files?.[0]
    if (selectedFile) {
      if (selectedFile.name.endsWith('.csv')) {
        setFile(selectedFile)
        setPrecheckResult(null)
        setError(null)
      } else {
        setError('请上传 CSV 格式的文件')
      }
    }
  }

  async function handleUpload() {
    if (!file) return

    try {
      setUploading(true)
      setError(null)

      const res = await batchApi.upload(file)
      if (res.success && res.data) {
        setPrecheckResult(res.data)
      } else {
        setError(res.error || '上传失败')
      }
    } catch (err) {
      setError('上传失败，请稍后重试')
    } finally {
      setUploading(false)
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

  const canSubmit = precheckResult && precheckResult.validRows > 0

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

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-md">
            {error}
          </div>
        )}

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <div className="flex items-start">
            <Info className="h-5 w-5 text-blue-600 mt-0.5 mr-3 flex-shrink-0" />
            <div>
              <h3 className="text-sm font-medium text-blue-800">CSV 格式说明</h3>
              <p className="mt-1 text-sm text-blue-700">
                请确保 CSV 文件包含以下列：客户姓名、客户电话、设备类型、设备型号、故障描述、优先级（低/中/高/紧急）、初始状态（待建/待分派）、负责人（待分派状态时必填）。
              </p>
              <button
                onClick={downloadTemplate}
                className="mt-2 text-sm text-blue-600 hover:text-blue-800 font-medium"
              >
                下载模板文件
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
                onClick={handleUpload}
                disabled={uploading}
                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                <Upload className="h-4 w-4 mr-2" />
                {uploading ? '上传中...' : '开始预检'}
              </button>
            )}
          </div>
        </div>

        {precheckResult && (
          <>
            <div className="bg-white shadow-sm rounded-lg p-6 border border-gray-200">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">预检结果</h2>
              
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
      </div>
    </Layout>
  )
}
