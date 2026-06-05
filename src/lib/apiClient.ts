import type { ApiResponse, User, Ticket, OperationLog, QualityRecord, StatusCount, TicketStatus, TicketPriority } from '../types'

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
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<ApiResponse<T>> {
  const token = getToken()
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...options.headers,
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

export interface CreateTicketParams {
  customerName: string
  customerPhone: string
  deviceType: string
  deviceModel: string
  faultDescription: string
  priority: TicketPriority
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

  deliver: (id: number, version: number) =>
    request<Ticket>(`/tickets/${id}/deliver`, {
      method: 'POST',
      body: JSON.stringify({ version }),
    }),

  cancel: (id: number, reason: string | undefined, version: number) =>
    request<Ticket>(`/tickets/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ reason, version }),
    }),
}

export { setToken, clearToken, getToken }
