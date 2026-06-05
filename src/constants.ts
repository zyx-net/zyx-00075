import type { TicketStatus, TicketPriority, UserRole } from './types'

export const STATUS_LABELS: Record<TicketStatus, string> = {
  created: '已创建',
  assigned: '已分派',
  diagnosing: '诊断中',
  quoting: '报价中',
  quote_approved: '报价已确认',
  repairing: '维修中',
  quality_check: '待质检',
  quality_passed: '质检通过',
  quality_failed: '质检不通过',
  delivered: '已交付',
  cancelled: '已取消',
}

export const STATUS_COLORS: Record<TicketStatus, string> = {
  created: 'bg-gray-100 text-gray-800 border-gray-300',
  assigned: 'bg-blue-100 text-blue-800 border-blue-300',
  diagnosing: 'bg-yellow-100 text-yellow-800 border-yellow-300',
  quoting: 'bg-orange-100 text-orange-800 border-orange-300',
  quote_approved: 'bg-indigo-100 text-indigo-800 border-indigo-300',
  repairing: 'bg-purple-100 text-purple-800 border-purple-300',
  quality_check: 'bg-pink-100 text-pink-800 border-pink-300',
  quality_passed: 'bg-teal-100 text-teal-800 border-teal-300',
  quality_failed: 'bg-red-100 text-red-800 border-red-300',
  delivered: 'bg-green-100 text-green-800 border-green-300',
  cancelled: 'bg-gray-200 text-gray-600 border-gray-400',
}

export const PRIORITY_LABELS: Record<TicketPriority, string> = {
  low: '低',
  medium: '中',
  high: '高',
  urgent: '紧急',
}

export const PRIORITY_COLORS: Record<TicketPriority, string> = {
  low: 'bg-gray-100 text-gray-700 border-gray-300',
  medium: 'bg-blue-100 text-blue-700 border-blue-300',
  high: 'bg-orange-100 text-orange-700 border-orange-300',
  urgent: 'bg-red-100 text-red-700 border-red-300',
}

export const PRIORITY_ORDER: Record<TicketPriority, number> = {
  urgent: 0,
  high: 1,
  medium: 2,
  low: 3,
}

export const ROLE_LABELS: Record<UserRole, string> = {
  clerk: '店员',
  technician: '技师',
  quality_inspector: '质检员',
}

export const ROLE_COLORS: Record<UserRole, string> = {
  clerk: 'bg-green-100 text-green-800',
  technician: 'bg-blue-100 text-blue-800',
  quality_inspector: 'bg-purple-100 text-purple-800',
}

export const ALL_STATUSES: TicketStatus[] = [
  'created',
  'assigned',
  'diagnosing',
  'quoting',
  'quote_approved',
  'repairing',
  'quality_check',
  'quality_passed',
  'quality_failed',
  'delivered',
  'cancelled',
]

export const ACTIVE_STATUSES: TicketStatus[] = [
  'created',
  'assigned',
  'diagnosing',
  'quoting',
  'quote_approved',
  'repairing',
  'quality_check',
  'quality_passed',
  'quality_failed',
]
