import Database from 'better-sqlite3'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

const dbPath = path.join(__dirname, '..', 'repair_shop.db')

export const db = new Database(dbPath)

db.pragma('journal_mode = WAL')
db.pragma('foreign_keys = ON')

function tableExists(name: string): boolean {
  const result = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name=?").get(name)
  return result !== undefined
}

export function initDatabase(): void {
  if (tableExists('tickets')) {
    const columns = db.prepare("PRAGMA table_info(tickets)").all() as { name: string }[]
    const columnNames = columns.map(c => c.name)
    if (!columnNames.includes('assignee_id')) {
      console.log('Old database schema detected, dropping and recreating tables...')
      db.exec(`
        DROP TABLE IF EXISTS quality_records;
        DROP TABLE IF EXISTS operation_logs;
        DROP TABLE IF EXISTS tickets;
        DROP TABLE IF EXISTS users;
      `)
    }
  }

  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      name TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('clerk', 'technician', 'quality_inspector')),
      password_hash TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS tickets (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_no TEXT UNIQUE NOT NULL,
      customer_name TEXT NOT NULL,
      customer_phone TEXT NOT NULL,
      device_type TEXT NOT NULL,
      device_model TEXT NOT NULL,
      fault_description TEXT NOT NULL,
      priority TEXT NOT NULL CHECK(priority IN ('low', 'medium', 'high', 'urgent')),
      status TEXT NOT NULL DEFAULT 'created',
      version INTEGER NOT NULL DEFAULT 1,
      assignee_id INTEGER,
      assignee_name TEXT,
      diagnosis_result TEXT,
      estimated_cost REAL,
      repair_details TEXT,
      actual_cost REAL,
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      operation TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      from_status TEXT,
      to_status TEXT,
      remark TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE TABLE IF NOT EXISTS quality_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER NOT NULL,
      inspector_id INTEGER NOT NULL,
      inspector_name TEXT NOT NULL,
      passed INTEGER NOT NULL CHECK(passed IN (0, 1)),
      comment TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id) ON DELETE CASCADE
    );

    CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
    CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
    CREATE INDEX IF NOT EXISTS idx_tickets_assignee ON tickets(assignee_id);
    CREATE INDEX IF NOT EXISTS idx_tickets_created_at ON tickets(created_at);
    CREATE INDEX IF NOT EXISTS idx_logs_ticket ON operation_logs(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_quality_ticket ON quality_records(ticket_id);
  `)

  console.log('Database initialized successfully')
}

export function generateTicketNo(): string {
  const date = new Date()
  const prefix = `WD${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  
  const result = db.prepare('SELECT MAX(ticket_no) as max_no FROM tickets WHERE ticket_no LIKE ?').get(`${prefix}%`) as { max_no: string | null }
  
  let seq = 1
  if (result.max_no) {
    seq = parseInt(result.max_no.slice(-4), 10) + 1
  }
  
  return `${prefix}${String(seq).padStart(4, '0')}`
}
