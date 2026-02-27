const Database = require('better-sqlite3');
const path = require('path');

const dbPath = path.join(__dirname, 'data', 'barber.db');

function getDb() {
  return new Database(dbPath);
}

function initSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('admin', 'barber')),
      barber_id INTEGER REFERENCES barbers(id),
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS barbers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      price REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS customers (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      phone TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visits (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      barber_id INTEGER NOT NULL REFERENCES barbers(id),
      customer_id INTEGER NOT NULL REFERENCES customers(id),
      visit_date DATE NOT NULL,
      total_amount REAL NOT NULL,
      notes TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS visit_services (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      visit_id INTEGER NOT NULL REFERENCES visits(id) ON DELETE CASCADE,
      service_id INTEGER NOT NULL REFERENCES services(id),
      quantity INTEGER DEFAULT 1,
      unit_price REAL NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_visits_barber ON visits(barber_id);
    CREATE INDEX IF NOT EXISTS idx_visits_date ON visits(visit_date);
    CREATE INDEX IF NOT EXISTS idx_visits_customer ON visits(customer_id);

    CREATE TABLE IF NOT EXISTS password_reset_requests (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      requested_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending', 'approved', 'rejected')),
      reviewed_at DATETIME,
      reviewed_by INTEGER REFERENCES users(id)
    );
    CREATE INDEX IF NOT EXISTS idx_reset_requests_status ON password_reset_requests(status);
  `);
  try {
    db.exec('ALTER TABLE users ADD COLUMN requires_password_change INTEGER DEFAULT 0');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  try {
    db.exec('ALTER TABLE visits ADD COLUMN payment_method TEXT DEFAULT \'cash\'');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
  try {
    db.exec('ALTER TABLE visits ADD COLUMN momo_reference TEXT');
  } catch (e) {
    if (!e.message.includes('duplicate column')) throw e;
  }
}

module.exports = { getDb, initSchema };
