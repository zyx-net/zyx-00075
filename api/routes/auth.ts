import { Router, type Request, type Response } from 'express'
import bcrypt from 'bcryptjs'
import { findUserByUsername, getAllUsers } from '../store/userStore.js'
import { generateToken, authMiddleware, getRoleLabel } from '../auth.js'
import type { AuthPayload, ApiResponse } from '../types.js'

const router = Router()

interface LoginRequest {
  username: string
  password: string
}

router.post('/login', async (req: Request, res: Response): Promise<void> => {
  try {
    const { username, password } = req.body as LoginRequest

    if (!username || !password) {
      res.status(400).json({
        success: false,
        error: '用户名和密码不能为空',
      } satisfies ApiResponse)
      return
    }

    const user = findUserByUsername(username)
    if (!user) {
      res.status(401).json({
        success: false,
        error: '用户名或密码错误',
      } satisfies ApiResponse)
      return
    }

    const isValid = await bcrypt.compare(password, user.password_hash)
    if (!isValid) {
      res.status(401).json({
        success: false,
        error: '用户名或密码错误',
      } satisfies ApiResponse)
      return
    }

    const payload: AuthPayload = {
      userId: user.id,
      username: user.username,
      role: user.role,
      name: user.name,
    }

    const token = generateToken(payload)

    res.json({
      success: true,
      data: {
        token,
        user: {
          id: user.id,
          username: user.username,
          name: user.name,
          role: user.role,
          roleLabel: getRoleLabel(user.role),
        },
      },
      message: '登录成功',
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Login error:', err)
    res.status(500).json({
      success: false,
      error: '登录失败，请稍后重试',
    } satisfies ApiResponse)
  }
})

router.post('/logout', authMiddleware, (_req: Request, res: Response): void => {
  res.json({
    success: true,
    message: '退出成功',
  } satisfies ApiResponse)
})

router.get('/me', authMiddleware, (req: Request, res: Response): void => {
  if (!req.user) {
    res.status(401).json({
      success: false,
      error: '未登录',
    } satisfies ApiResponse)
    return
  }

  res.json({
    success: true,
    data: {
      id: req.user.userId,
      username: req.user.username,
      name: req.user.name,
      role: req.user.role,
      roleLabel: getRoleLabel(req.user.role),
    },
  } satisfies ApiResponse)
})

router.get('/users', authMiddleware, (_req: Request, res: Response): void => {
  try {
    const users = getAllUsers().map(u => ({
      id: u.id,
      username: u.username,
      name: u.name,
      role: u.role,
      roleLabel: getRoleLabel(u.role),
    }))

    res.json({
      success: true,
      data: users,
    } satisfies ApiResponse)
  } catch (err) {
    console.error('Get users error:', err)
    res.status(500).json({
      success: false,
      error: '获取用户列表失败',
    } satisfies ApiResponse)
  }
})

export default router
