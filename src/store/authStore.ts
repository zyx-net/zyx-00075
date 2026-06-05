import { create } from 'zustand'
import type { User, UserRole } from '../types'
import { authApi, setToken, clearToken, type LoginParams } from '../lib/apiClient'

interface AuthState {
  user: User | null
  isLoading: boolean
  isAuthenticated: boolean
  login: (params: LoginParams) => Promise<{ success: boolean; error?: string }>
  logout: () => Promise<void>
  checkAuth: () => Promise<void>
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isLoading: true,
  isAuthenticated: false,

  login: async (params) => {
    const response = await authApi.login(params)
    if (!response.success || !response.data) {
      return { success: false, error: response.error }
    }

    const { token, user } = response.data
    setToken(token)
    set({ user, isAuthenticated: true })

    return { success: true }
  },

  logout: async () => {
    await authApi.logout()
    clearToken()
    set({ user: null, isAuthenticated: false })
  },

  checkAuth: async () => {
    set({ isLoading: true })
    try {
      const response = await authApi.getMe()
      if (response.success && response.data) {
        set({ user: response.data, isAuthenticated: true, isLoading: false })
      } else {
        clearToken()
        set({ user: null, isAuthenticated: false, isLoading: false })
      }
    } catch {
      clearToken()
      set({ user: null, isAuthenticated: false, isLoading: false })
    }
  },
}))

export function hasPermission(user: User | null, permission: string): boolean {
  if (!user) return false

  const PERMISSIONS: Record<UserRole, string[]> = {
    clerk: [
      'tickets:create',
      'tickets:assign',
      'tickets:approve-quote',
      'tickets:deliver',
      'tickets:cancel',
      'tickets:read',
      'users:read',
      'batch:read',
      'batch:import',
      'batch:submit',
      'batch:export',
    ],
    technician: [
      'tickets:accept',
      'tickets:diagnose',
      'tickets:repair',
      'tickets:submit-quality',
      'tickets:read',
      'users:read',
      'batch:read',
    ],
    quality_inspector: [
      'tickets:quality-check',
      'tickets:read',
      'users:read',
      'batch:read',
    ],
  }

  return PERMISSIONS[user.role]?.includes(permission) ?? false
}

export function hasRole(user: User | null, roles: UserRole[]): boolean {
  if (!user) return false
  return roles.includes(user.role)
}
