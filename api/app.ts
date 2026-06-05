import express, {
  type Request,
  type Response,
  type NextFunction,
} from 'express'
import type { ApiResponse } from './types.js'
import cors from 'cors'
import path from 'path'
import dotenv from 'dotenv'
import { fileURLToPath } from 'url'
import authRoutes from './routes/auth.js'
import ticketRoutes from './routes/tickets.js'
import { initDatabase } from './db.js'
import { seedDatabase } from './seed.js'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

dotenv.config()

initDatabase()
seedDatabase()

const app: express.Application = express()

app.use(cors())
app.use(express.json({ limit: '10mb' }))
app.use(express.urlencoded({ extended: true, limit: '10mb' }))

app.use('/api/auth', authRoutes)
app.use('/api/tickets', ticketRoutes)

app.use(
  '/api/health',
  (req: Request, res: Response, next: NextFunction): void => {
    res.status(200).json({
      success: true,
      message: 'ok',
    })
  },
)

app.use((error: Error, req: Request, res: Response, next: NextFunction) => {
  if (error.message === 'VERSION_CONFLICT') {
    res.status(409).json({
      success: false,
      error: 'VERSION_CONFLICT',
      message: '版本已变化，工单已被他人修改，请刷新后重试',
    } satisfies ApiResponse)
    return
  }

  console.error('Server error:', error)
  res.status(500).json({
    success: false,
    error: 'Server internal error',
  })
})

app.use((req: Request, res: Response) => {
  res.status(404).json({
    success: false,
    error: 'API not found',
  })
})

export default app
