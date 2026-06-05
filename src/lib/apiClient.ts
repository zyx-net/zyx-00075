import type { ApiResponse, User, Ticket, OperationLog, QualityRecord, StatusCount, TicketStatus, TicketPriority, ImportBatch, ImportRow, PrecheckResult, PrecheckRowResult, BatchSubmitResult, FieldMappingTemplate, FieldMapping, CsvHeaderInfo, TemplateImportPreviewResult, TemplateImportResultData, TemplateImportConflictAction, TemplateOperationLog, PrecheckResultWithMapping } from '../types'

const API_BASE = '/api'

function getToken(): string | null {
  return localStorage.getItem('token')
}

function setToken(token: string): void {
  localStorage.setItem('token', token)
}

function clearToken(): void {
  localStorage.removeItem('token')
}

interface RequestOptions extends RequestInit {
  headers?: Record<string, string>
  body?: BodyInit | null
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    ...options.headers,
  }

  const isFormData = options.body instanceof FormData
  if (!isFormData) {
    headers['Content-Type'] = 'application/json'
  }

  if (token) {
    headers.Authorization = `Bearer ${token}`
  }

  try {
    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    })

    const data = (await response.json()) as ApiResponse<T>

    if (!response.ok) {
      if (response.status === 401) {
        clearToken()
      }

      if (response.status === 409 || data.error === 'VERSION_CONFLICT' || (data.error as string)?.includes('版本冲突')) {
        return {
          success: false,
          error: data.message || '版本已变化，工单已被他人修改，请刷新后重试',
          code: response.status,
          isVersionConflict: true,
        }
      }

      return {
        success: false,
        error: data.error || '请求失败',
        code: response.status,
      }
    }

    return data
  } catch (err) {
    console.error('Request error:', err)
    return {
      success: false,
      error: '网络错误，请稍后重试',
    }
  }
}

export interface LoginParams {
  username: string
  password: string
}

export interface LoginResult {
  token: string
  user: User
}

export const authApi = {
  login: (params: LoginParams) =>
    request<LoginResult>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  logout: () =>
    request<void>('/auth/logout', {
      method: 'POST',
    }),

  getMe: () => request<User>('/auth/me'),

  getUsers: () => request<User[]>('/auth/users'),
}

export const batchApi = {
  getBatches: () => request<ImportBatch[]>('/batch'),

  getBatchDetail: (id: number) =>
    request<{ batch: ImportBatch; rows: ImportRow[] }>(`/batch/${id}`),

  analyzeHeaders: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<CsvHeaderInfo>('/batch/analyze-headers', {
      method: 'POST',
      body: formData,
    })
  },

  upload: (file: File, options?: { templateId?: number; fieldMapping?: FieldMapping }) => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.templateId) {
      formData.append('templateId', String(options.templateId))
    }
    if (options?.fieldMapping) {
      formData.append('fieldMapping', JSON.stringify(options.fieldMapping))
    }
    return request<PrecheckResultWithMapping>('/batch/upload', {
      method: 'POST',
      body: formData,
    })
  },

  precheck: (id: number, rows: PrecheckRowResult[]) =>
    request<PrecheckResult>(`/batch/${id}/precheck`, {
      method: 'POST',
      body: JSON.stringify({ rows }),
    }),

  submit: (id: number, rowIds?: number[]) =>
    request<BatchSubmitResult>(`/batch/${id}/submit`, {
      method: 'POST',
      body: JSON.stringify({ rowIds }),
    }),

  export: (id: number, type: 'all' | 'success' | 'failed' = 'all') => {
    const token = getToken()
    return fetch(`${API_BASE}/batch/${id}/export?type=${type}`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    })
  },
}

export interface CreateTicketParams {
  customerName: string
  customerPhone: string
  deviceType: string
  deviceModel: string
  faultDescription: string
  priority: TicketPriority
}

export const templateApi = {
  getTemplates: () => request<FieldMappingTemplate[]>('/templates'),

  getTemplate: (id: number) =>
    request<FieldMappingTemplate>(`/templates/${id}`),

  createTemplate: (data: { name: string; description?: string; fieldMapping: FieldMapping }) =>
    request<FieldMappingTemplate>('/templates', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  updateTemplate: (id: number, data: { name?: string; description?: string; fieldMapping?: FieldMapping }) =>
    request<FieldMappingTemplate>(`/templates/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),

  deleteTemplate: (id: number) =>
    request<void>(`/templates/${id}`, {
      method: 'DELETE',
    }),

  analyzeCsv: (csvContent: string) =>
    request<CsvHeaderInfo>('/templates/analyze-csv', {
      method: 'POST',
      body: JSON.stringify({ csvContent }),
    }),

  exportTemplate: (id: number) => {
    const token = getToken()
    return fetch(`${API_BASE}/templates/${id}/export`, {
      headers: {
        Authorization: token ? `Bearer ${token}` : '',
      },
    })
  },

  importPreview: (file: File) => {
    const formData = new FormData()
    formData.append('file', file)
    return request<TemplateImportPreviewResult>('/templates/import-preview', {
      method: 'POST',
      body: formData,
    })
  },

  importTemplate: (file: File, options?: { action?: TemplateImportConflictAction; newName?: string }) => {
    const formData = new FormData()
    formData.append('file', file)
    if (options?.action) {
      formData.append('action', options.action)
    }
    if (options?.newName) {
      formData.append('newName', options.newName)
    }
    return request<TemplateImportResultData>('/templates/import', {
      method: 'POST',
      body: formData,
    })
  },

  getTemplateLogs: (id: number) =>
    request<TemplateOperationLog[]>(`/templates/${id}/logs`),

  getAllTemplateLogs: () =>
    request<TemplateOperationLog[]>('/templates/logs/all'),
}

export const ticketApi = {
  getCounts: () => request<Record<string, StatusCount>>('/tickets/counts'),

  getQueue: () => request<Ticket[]>('/tickets/queue'),

  getList: (params?: { status?: TicketStatus; priority?: TicketPriority; assigneeId?: number }) => {
    const query = new URLSearchParams()
    if (params?.status) query.append('status', params.status)
    if (params?.priority) query.append('priority', params.priority)
    if (params?.assigneeId) query.append('assigneeId', String(params.assigneeId))
    const queryStr = query.toString()
    return request<Ticket[]>(`/tickets${queryStr ? `?${queryStr}` : ''}`)
  },

  getDetail: (id: number) => request<Ticket>(`/tickets/${id}`),

  getLogs: (id: number) => request<OperationLog[]>(`/tickets/${id}/logs`),

  getQualityRecords: (id: number) => request<QualityRecord[]>(`/tickets/${id}/quality-records`),

  create: (params: CreateTicketParams) =>
    request<Ticket>('/tickets', {
      method: 'POST',
      body: JSON.stringify(params),
    }),

  assign: (id: number, assigneeId: number, version: number) =>
    request<Ticket>(`/tickets/${id}/assign`, {
      method: 'POST',
      body: JSON.stringify({ assigneeId, version }),
    }),

  accept: (id: number, version: number) =>
    request<Ticket>(`/tickets/${id}/accept`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  diagnose: (id: number, diagnosisResult: string, estimatedCost: number, version: number) =>
    request<Ticket>(`/tickets/${id}/diagnose`, {
      method: 'POST',
      body: JSON.stringify({ diagnosisResult, estimatedCost, version }),
    }),

  approveQuote: (id: number, version: number) =>
    request<Ticket>(`/tickets/${id}/approve-quote`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  repair: (id: number, version: number) =>
    request<Ticket>(`/tickets/${id}/repair`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  submitQuality: (id: number, repairDetails: string, actualCost: number, version: number) =>
    request<Ticket>(`/tickets/${id}/submit-quality`, {
      method: 'POST',
      body: JSON.stringify({ repairDetails, actualCost, version }),
    }),

  qualityCheck: (id: number, passed: boolean, comment: string | undefined, version: number) =>
    request<Ticket>(`/tickets/${id}/quality-check`, {
      method: 'POST',
      body: JSON.stringify({ passed, comment, version }),
    }),

  deliver: (id: number, version: number, params: { confirmer: string; notes: string; receiptNo?: string; phoneLast4?: string }) =>
    request<Ticket>(`/tickets/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ version, ...params }),
    }),

  cancel: (id: number, reason: string | undefined, version: number) =>
    request<Ticket>(`/tickets/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason, version }),
    }),
}

export { setToken, clearToken, getToken }
