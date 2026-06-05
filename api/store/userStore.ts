import { db } from '../db.js'
import type { User, UserRole } from '../types.js'

export function findUserByUsername(username: string): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE username = ?')
  return stmt.get(username) as User | undefined
}

export function findUserById(id: number): User | undefined {
  const stmt = db.prepare('SELECT * FROM users WHERE id = ?')
  return stmt.get(id) as User | undefined
}

export function getAllUsers(): User[] {
  const stmt = db.prepare('SELECT id, username, name, role, created_at FROM users ORDER BY role, name')
  return stmt.all() as User[]
}

export function getUsersByRole(role: UserRole): User[] {
  const stmt = db.prepare('SELECT id, username, name, role, created_at FROM users WHERE role = ? ORDER BY name')
  return stmt.all(role) as User[]
}

export function getAllTechnicians(): User[] {
  return getUsersByRole('technician')
}
