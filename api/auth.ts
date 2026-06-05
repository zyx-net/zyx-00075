import type { Request, Response, NextFunction } from 'express'
import jwt from 'jsonwebtoken'
import type { UserRole, AuthPayload } from './types.js'
import { findUserById } from './store/userStore.js'

const JWT_SECRET = process.env.JWT_SECRET || 'repair-shop-secret-key-2024'

export const PERMISSIONS: Record<UserRole, string[]> = {
  clerk: [
    'tickets:create',
    'tickets:assign',
    'tickets:approve-quote',
    'tickets:deliver',
    'tickets:cancel',
    'tickets:read',
    'users:read',
    'batch:import',
    'batch:submit',
    'batch:export',
    'batch:read',
    'templates:read',
    'templates:create',
    'templates:update',
    'templates:delete',
    'templates:import',
    'templates:export',
  ],
  technician: [
    'tickets:accept',
    'tickets:diagnose',
    'tickets:repair',
    'tickets:submit-quality',
    'tickets:read',
    'users:read',
    'batch:read',
    'templates:read',
  ],
  quality_inspector: [
    'tickets:quality-check',
    'tickets:read',
    'users:read',
    'batch:read',
    'templates:read',
  ],
}

export function generateToken(payload: AuthPayload): string {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '24h' })
}

export function verifyToken(token: string): AuthPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as AuthPayload
  } catch {
    return null
  }
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthPayload
    }
  }
}

export function authMiddleware(req: Request, res: Response, next: NextFunction): void {
  const authHeader = req.headers.authorization

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    res.status(401).json({
      success: false,
      error: '未提供认证令牌',
    })
    return
  }

  const token = authHeader.slice(7)
  const payload = verifyToken(token)

  if (!payload) {
    res.status(401).json({
      success: false,
      error: '认证令牌无效或已过期',
    })
    return
  }

  const user = findUserById(payload.userId)
  if (!user) {
    res.status(401).json({
      success: false,
      error: '用户不存在',
    })
    return
  }

  req.user = payload
  next()
}

export function requirePermission(permission: string) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: '未登录',
      })
      return
    }

    const userPermissions = PERMISSIONS[req.user.role]
    if (!userPermissions.includes(permission)) {
      res.status(403).json({
        success: false,
        error: `权限不足：当前用户（${req.user.name}，${getRoleLabel(req.user.role)}）没有 ${permission} 权限`,
      })
      return
    }

    next()
  }
}

export function requireRole(roles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user) {
      res.status(401).json({
        success: false,
        error: '未登录',
      })
      return
    }

    if (!roles.includes(req.user.role)) {
      res.status(403).json({
        success: false,
        error: `权限不足：需要 ${roles.map(getRoleLabel).join('/')} 角色，当前用户是 ${getRoleLabel(req.user.role)}`,
      })
      return
    }

    next()
  }
}

export function getRoleLabel(role: UserRole): string {
  const labels: Record<UserRole, string> = {
    clerk: '店员',
    technician: '技师',
    quality_inspector: '质检员',
  }
  return labels[role]
}
