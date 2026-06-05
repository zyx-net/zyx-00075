import { useState, useEffect } from 'react'
import { STANDARD_FIELDS, STANDARD_FIELD_LABELS, STANDARD_FIELD_REQUIRED, type FieldMapping, type StandardField, type CsvHeaderInfo } from '../types'
import { ArrowRight, AlertCircle, CheckCircle2 } from 'lucide-react'

interface FieldMappingEditorProps {
  headers: string[]
  detectedMappings?: FieldMapping
  value: FieldMapping
  onChange: (mapping: FieldMapping) => void
  disabled?: boolean
}

export default function FieldMappingEditor({
  headers,
  detectedMappings = {},
  value,
  onChange,
  disabled = false,
}: FieldMappingEditorProps) {
  const [localMapping, setLocalMapping] = useState<FieldMapping>(value)

  useEffect(() => {
    setLocalMapping(value)
  }, [value])

  function handleMappingChange(standardField: StandardField, csvHeader: string | '') {
    const newMapping = { ...localMapping }
    if (csvHeader) {
      newMapping[standardField] = csvHeader
    } else {
      delete newMapping[standardField]
    }
    setLocalMapping(newMapping)
    onChange(newMapping)
  }

  function isMapped(header: string): boolean {
    return Object.values(localMapping).includes(header)
  }

  function getMappedField(header: string): StandardField | undefined {
    return Object.entries(localMapping).find(([_, h]) => h === header)?.[0] as StandardField | undefined
  }

  const missingRequired = STANDARD_FIELDS.filter(
    field => STANDARD_FIELD_REQUIRED[field] && !localMapping[field]
  )

  return (
    <div className="space-y-4">
      {missingRequired.length > 0 && (
        <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-3">
          <div className="flex items-start">
            <AlertCircle className="h-5 w-5 text-yellow-600 mt-0.5 mr-2 flex-shrink-0" />
            <div>
              <p className="text-sm font-medium text-yellow-800">缺少必填字段映射</p>
              <p className="text-sm text-yellow-700 mt-1">
                请为以下字段配置映射：
                {missingRequired.map(f => STANDARD_FIELD_LABELS[f]).join('、')}
              </p>
            </div>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">标准字段</h4>
          <div className="space-y-2">
            {STANDARD_FIELDS.map(field => (
              <div key={field} className="flex items-center justify-between p-2 bg-gray-50 rounded">
                <div className="flex items-center">
                  {STANDARD_FIELD_REQUIRED[field] && (
                    <span className="text-red-500 mr-1">*</span>
                  )}
                  <span className="text-sm font-medium text-gray-900">
                    {STANDARD_FIELD_LABELS[field]}
                  </span>
                </div>
                <select
                  value={localMapping[field] || ''}
                  onChange={e => handleMappingChange(field, e.target.value as string)}
                  disabled={disabled}
                  className="text-sm border border-gray-300 rounded px-2 py-1 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  <option value="">-- 选择列 --</option>
                  {headers.map(header => (
                    <option
                      key={header}
                      value={header}
                      disabled={isMapped(header) && localMapping[field] !== header}
                    >
                      {header}
                      {isMapped(header) && localMapping[field] !== header && ' (已映射)'}
                      {detectedMappings[field] === header && ' (自动匹配)'}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="space-y-2">
          <h4 className="text-sm font-medium text-gray-700">CSV 列映射状态</h4>
          <div className="space-y-2 max-h-80 overflow-y-auto">
            {headers.map(header => {
              const mappedField = getMappedField(header)
              const autoMatched = Object.entries(detectedMappings).find(
                ([_, h]) => h === header
              )?.[0] as StandardField | undefined
              return (
                <div
                  key={header}
                  className={`flex items-center justify-between p-2 rounded ${
                    mappedField ? 'bg-green-50 border border-green-200' : 'bg-gray-50'
                  }`}
                >
                  <span className="text-sm text-gray-700">{header}</span>
                  <div className="flex items-center">
                    {mappedField ? (
                      <div className="flex items-center text-green-700">
                        <ArrowRight className="h-4 w-4 mx-2" />
                        <span className="text-sm font-medium">
                          {STANDARD_FIELD_LABELS[mappedField]}
                        </span>
                        <CheckCircle2 className="h-4 w-4 ml-2 text-green-500" />
                      </div>
                    ) : autoMatched ? (
                      <div className="flex items-center text-blue-600">
                        <span className="text-xs">可匹配: {STANDARD_FIELD_LABELS[autoMatched]}</span>
                      </div>
                    ) : (
                      <span className="text-xs text-gray-500">未映射</span>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      </div>
    </div>
  )
}
