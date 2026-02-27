const fs = require('fs');
const path = require('path');
const { getDb, initSchema } = require('../db');
const bcrypt = require('bcryptjs');

const dataDir = path.join(__dirname, '..', 'data');
if (!fs.existsSync(dataDir)) {
  fs.mkdirSync(dataDir, { recursive: true });
}

const db = getDb();
initSchema(db);

// Seed default admin if no users exist
const userCount = db.prepare('SELECT COUNT(*) as c FROM users').get();
if (userCount.c === 0) {
  const hash = bcrypt.hashSync('admin123', 10);
  db.prepare(
    "INSERT INTO users (username, password_hash, role) VALUES (?, ?, 'admin')"
  ).run('admin', hash);
  console.log('Created default admin: username=admin, password=admin123');
}

// Seed sample services only if empty (barbers are added by admin)
if (db.prepare('SELECT COUNT(*) as c FROM services').get().c === 0) {
  db.prepare(`
    INSERT INTO services (name, price) VALUES
    ('Haircut', 25),
    ('Beard Trim', 15),
    ('Hot Towel Shave', 30),
    ('Haircut + Beard', 35)
  `).run();
  console.log('Added sample services.');
}

db.close();
console.log('Database initialized at data/barber.db');
