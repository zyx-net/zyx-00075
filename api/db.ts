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
    } else if (!columnNames.includes('delivery_confirmer')) {
      console.log('Adding delivery columns to existing tickets table...')
      db.exec(`
        ALTER TABLE tickets ADD COLUMN delivery_confirmer TEXT;
        ALTER TABLE tickets ADD COLUMN delivery_notes TEXT;
        ALTER TABLE tickets ADD COLUMN delivery_receipt_no TEXT;
        ALTER TABLE tickets ADD COLUMN delivery_phone_last4 TEXT;
        ALTER TABLE tickets ADD COLUMN delivered_at DATETIME;
        ALTER TABLE tickets ADD COLUMN delivered_by INTEGER;
        ALTER TABLE tickets ADD COLUMN delivered_by_name TEXT;
      `)
      console.log('Delivery columns added successfully')
    }
  }

  if (tableExists('operation_logs')) {
    const logColumns = db.prepare("PRAGMA table_info(operation_logs)").all() as { name: string; notnull: number }[]
    const ticketIdColumn = logColumns.find(c => c.name === 'ticket_id')
    if (ticketIdColumn && ticketIdColumn.notnull === 1) {
      console.log('Migrating operation_logs table to allow NULL ticket_id...')
      db.exec(`
        DROP TABLE IF EXISTS operation_logs_new;
        CREATE TABLE operation_logs_new (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          ticket_id INTEGER,
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
        INSERT INTO operation_logs_new SELECT * FROM operation_logs;
        DROP TABLE operation_logs;
        ALTER TABLE operation_logs_new RENAME TO operation_logs;
        CREATE INDEX IF NOT EXISTS idx_logs_ticket ON operation_logs(ticket_id);
      `)
      console.log('operation_logs table migrated successfully')
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
      delivery_confirmer TEXT,
      delivery_notes TEXT,
      delivery_receipt_no TEXT,
      delivery_phone_last4 TEXT,
      delivered_at DATETIME,
      delivered_by INTEGER,
      delivered_by_name TEXT,
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (assignee_id) REFERENCES users(id),
      FOREIGN KEY (delivered_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      ticket_id INTEGER,
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

    CREATE TABLE IF NOT EXISTS import_batches (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_no TEXT UNIQUE NOT NULL,
      file_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL DEFAULT 0,
      success_count INTEGER NOT NULL DEFAULT 0,
      fail_count INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'uploading' CHECK(status IN ('uploading', 'prechecking', 'prechecked', 'submitting', 'completed', 'failed')),
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS import_rows (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      row_index INTEGER NOT NULL,
      customer_name TEXT,
      customer_phone TEXT,
      device_type TEXT,
      device_model TEXT,
      fault_description TEXT,
      priority TEXT,
      initial_status TEXT NOT NULL DEFAULT 'created' CHECK(initial_status IN ('created', 'assigned')),
      assignee_id INTEGER,
      precheck_errors TEXT,
      precheck_warnings TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'prechecked', 'warning', 'error', 'submitted', 'ticket_created', 'ticket_assigned', 'failed')),
      ticket_id INTEGER,
      ticket_no TEXT,
      error_message TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (ticket_id) REFERENCES tickets(id),
      FOREIGN KEY (assignee_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS export_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      batch_id INTEGER NOT NULL,
      export_type TEXT NOT NULL CHECK(export_type IN ('all', 'success', 'failed')),
      file_name TEXT NOT NULL,
      total_rows INTEGER NOT NULL,
      exported_by INTEGER NOT NULL,
      exported_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (batch_id) REFERENCES import_batches(id) ON DELETE CASCADE,
      FOREIGN KEY (exported_by) REFERENCES users(id)
    );

    CREATE INDEX IF NOT EXISTS idx_import_batches_status ON import_batches(status);
    CREATE INDEX IF NOT EXISTS idx_import_batches_created_by ON import_batches(created_by);
    CREATE INDEX IF NOT EXISTS idx_import_batches_created_at ON import_batches(created_at);
    CREATE INDEX IF NOT EXISTS idx_import_rows_batch ON import_rows(batch_id);
    CREATE INDEX IF NOT EXISTS idx_import_rows_status ON import_rows(status);
    CREATE INDEX IF NOT EXISTS idx_import_rows_ticket ON import_rows(ticket_id);
    CREATE INDEX IF NOT EXISTS idx_export_records_batch ON export_records(batch_id);

    CREATE TABLE IF NOT EXISTS field_mapping_templates (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT UNIQUE NOT NULL,
      description TEXT,
      field_mapping TEXT NOT NULL,
      created_by INTEGER NOT NULL,
      created_by_name TEXT NOT NULL,
      updated_by INTEGER NOT NULL,
      updated_by_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (created_by) REFERENCES users(id),
      FOREIGN KEY (updated_by) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS template_operation_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      template_id INTEGER,
      template_name TEXT NOT NULL,
      operation TEXT NOT NULL,
      operator_id INTEGER NOT NULL,
      operator_name TEXT NOT NULL,
      operator_role TEXT NOT NULL,
      detail TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (template_id) REFERENCES field_mapping_templates(id) ON DELETE SET NULL
    );

    CREATE INDEX IF NOT EXISTS idx_templates_name ON field_mapping_templates(name);
    CREATE INDEX IF NOT EXISTS idx_template_logs_template ON template_operation_logs(template_id);
    CREATE INDEX IF NOT EXISTS idx_template_logs_operation ON template_operation_logs(operation);
    CREATE INDEX IF NOT EXISTS idx_template_logs_operator ON template_operation_logs(operator_id);
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

export function generateBatchNo(): string {
  const date = new Date()
  const prefix = `PC${date.getFullYear()}${String(date.getMonth() + 1).padStart(2, '0')}${String(date.getDate()).padStart(2, '0')}`
  
  const result = db.prepare('SELECT MAX(batch_no) as max_no FROM import_batches WHERE batch_no LIKE ?').get(`${prefix}%`) as { max_no: string | null }
  
  let seq = 1
  if (result.max_no) {
    seq = parseInt(result.max_no.slice(-4), 10) + 1
  }
  
  return `${prefix}${String(seq).padStart(4, '0')}`
}
