import bcrypt from 'bcryptjs'
import { db } from './db.js'
import type { UserRole } from './types.js'

interface SeedUser {
  username: string
  name: string
  role: UserRole
  password: string
}

const seedUsers: SeedUser[] = [
  {
    username: 'clerk1',
    name: '店员小王',
    role: 'clerk',
    password: '123456',
  },
  {
    username: 'tech1',
    name: '技师老李',
    role: 'technician',
    password: '123456',
  },
  {
    username: 'tech2',
    name: '技师小张',
    role: 'technician',
    password: '123456',
  },
  {
    username: 'inspector1',
    name: '质检员老赵',
    role: 'quality_inspector',
    password: '123456',
  },
]

export function seedDatabase(): void {
  const countStmt = db.prepare('SELECT COUNT(*) as count FROM users')
  const result = countStmt.get() as { count: number }

  if (result.count > 0) {
    console.log('Database already has users, skipping seed')
    return
  }

  const insertStmt = db.prepare(`
    INSERT INTO users (username, name, role, password_hash)
    VALUES (?, ?, ?, ?)
  `)

  const insertMany = db.transaction((users: SeedUser[]) => {
    for (const user of users) {
      const passwordHash = bcrypt.hashSync(user.password, 10)
      insertStmt.run(user.username, user.name, user.role, passwordHash)
      console.log(`Created user: ${user.username} (${user.name})`)
    }
  })

  insertMany(seedUsers)
  console.log('Database seeded successfully')
}
