const express = require('express');
const session = require('express-session');
const path = require('path');
const fs = require('fs');
const bcrypt = require('bcryptjs');
const { getDb, initSchema } = require('./db');

const app = express();
const PORT = process.env.PORT || 3000;

// Ensure data directory and DB exist
const dataDir = path.join(__dirname, 'data');
if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });
const db = getDb();
initSchema(db);

// Auto-seed default admin if database is empty
const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
if (userCount === 0) {
  const defaultAdminPassword = 'admin123';
  const hashed = bcrypt.hashSync(defaultAdminPassword, 10);
  db.prepare('INSERT INTO users (username, password_hash, role) VALUES (?, ?, ?)').run('admin', hashed, 'admin');
  console.log('Default admin user created. Username: admin, Password: admin123');
}

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(
  session({
    secret: process.env.SESSION_SECRET || 'barber-shop-secret-change-in-production',
    resave: false,
    saveUninitialized: false,
    cookie: { httpOnly: true, maxAge: 24 * 60 * 60 * 1000 },
  })
);
app.use(express.static(path.join(__dirname, 'public')));

function requireLogin(req, res, next) {
  if (!req.session?.userId) {
    return res.status(401).json({ error: 'Login required' });
  }
  next();
}

function requireAdmin(req, res, next) {
  if (!req.session?.userId) return res.status(401).json({ error: 'Login required' });
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin only' });
  }
  next();
}

// ----- Auth -----
app.post('/api/auth/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Username and password required' });
  }
  const user = db.prepare(
    'SELECT id, username, password_hash, role, barber_id, COALESCE(requires_password_change, 0) AS requires_password_change FROM users WHERE username = ?'
  ).get(username);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  req.session.userId = user.id;
  req.session.username = user.username;
  req.session.role = user.role;
  req.session.barberId = user.barber_id || null;
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    barberId: user.barber_id,
    requiresPasswordChange: !!user.requires_password_change,
  });
});

app.post('/api/auth/logout', (req, res) => {
  req.session.destroy();
  res.json({ ok: true });
});

app.get('/api/auth/me', (req, res) => {
  if (!req.session?.userId) return res.status(401).json({ error: 'Not logged in' });
  const user = db.prepare(
    'SELECT id, username, role, barber_id, COALESCE(requires_password_change, 0) AS requires_password_change FROM users WHERE id = ?'
  ).get(req.session.userId);
  if (!user) return res.status(401).json({ error: 'Not logged in' });
  res.json({
    id: user.id,
    username: user.username,
    role: user.role,
    barberId: user.barber_id,
    requiresPasswordChange: !!user.requires_password_change,
  });
});

app.post('/api/auth/change-password', requireLogin, (req, res) => {
  const { newPassword, confirmPassword } = req.body || {};
  const user = db.prepare('SELECT requires_password_change FROM users WHERE id = ?').get(req.session.userId);
  if (!user || !user.requires_password_change) {
    return res.status(400).json({ error: 'Password change not required' });
  }
  if (!newPassword || newPassword.length < 6) {
    return res.status(400).json({ error: 'New password must be at least 6 characters' });
  }
  if (newPassword !== confirmPassword) {
    return res.status(400).json({ error: 'Passwords do not match' });
  }
  const hash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 0 WHERE id = ?').run(hash, req.session.userId);
  res.json({ ok: true });
});

app.post('/api/auth/request-password-reset', requireLogin, (req, res) => {
  const user = db.prepare('SELECT role FROM users WHERE id = ?').get(req.session.userId);
  if (!user || user.role !== 'barber') return res.status(403).json({ error: 'Barbers only' });
  const existing = db.prepare('SELECT id FROM password_reset_requests WHERE user_id = ? AND status = ?').get(req.session.userId, 'pending');
  if (existing) return res.status(400).json({ error: 'You already have a pending request' });
  db.prepare('INSERT INTO password_reset_requests (user_id, status) VALUES (?, ?)').run(req.session.userId, 'pending');
  res.status(201).json({ ok: true });
});

// ----- Password reset requests (admin: list, approve, reject) -----
app.get('/api/password-requests', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT r.id, r.user_id, r.requested_at, r.status, u.username, b.name AS barber_name
       FROM password_reset_requests r
       JOIN users u ON u.id = r.user_id
       LEFT JOIN barbers b ON b.id = u.barber_id
       WHERE r.status = 'pending'
       ORDER BY r.requested_at ASC`
    )
    .all();
  res.json(rows);
});

const DEFAULT_BARBER_PASSWORD = 'password';

app.post('/api/password-requests/:id/approve', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id, user_id FROM password_reset_requests WHERE id = ? AND status = ?').get(id, 'pending');
  if (!row) return res.status(404).json({ error: 'Request not found or already handled' });
  const hash = bcrypt.hashSync(DEFAULT_BARBER_PASSWORD, 10);
  db.prepare('UPDATE password_reset_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?').run('approved', req.session.userId, id);
  db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 1 WHERE id = ?').run(hash, row.user_id);
  res.json({ ok: true });
});

app.post('/api/password-requests/:id/reject', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const row = db.prepare('SELECT id FROM password_reset_requests WHERE id = ? AND status = ?').get(id, 'pending');
  if (!row) return res.status(404).json({ error: 'Request not found or already handled' });
  db.prepare('UPDATE password_reset_requests SET status = ?, reviewed_at = CURRENT_TIMESTAMP, reviewed_by = ? WHERE id = ?').run('rejected', req.session.userId, id);
  res.json({ ok: true });
});

// ----- Barbers (admin: add/remove/list) -----
app.get('/api/barbers', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT id, name, created_at FROM barbers ORDER BY name').all();
  res.json(rows);
});

app.post('/api/barbers', requireAdmin, (req, res) => {
  const { name } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const r = db.prepare('INSERT INTO barbers (name) VALUES (?)').run(name.trim());
  res.status(201).json({ id: r.lastInsertRowid, name: name.trim() });
});

app.delete('/api/barbers/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  // Cascade: unlink user accounts, delete visit line items, visits, then the barber
  db.transaction(() => {
    db.prepare('DELETE FROM password_reset_requests WHERE user_id IN (SELECT id FROM users WHERE barber_id = ?)').run(id);
    db.prepare('DELETE FROM users WHERE barber_id = ?').run(id);
    db.prepare('DELETE FROM visit_services WHERE visit_id IN (SELECT id FROM visits WHERE barber_id = ?)').run(id);
    db.prepare('DELETE FROM visits WHERE barber_id = ?').run(id);
    db.prepare('DELETE FROM barbers WHERE id = ?').run(id);
  })();
  res.json({ ok: true });
});


// ----- Services (admin: add/remove/list) -----
app.get('/api/services', requireLogin, (req, res) => {
  const rows = db.prepare('SELECT id, name, price, created_at FROM services ORDER BY name').all();
  res.json(rows);
});

app.post('/api/services', requireAdmin, (req, res) => {
  const { name, price } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const p = parseFloat(price);
  if (isNaN(p) || p < 0) return res.status(400).json({ error: 'Valid price required' });
  const r = db.prepare('INSERT INTO services (name, price) VALUES (?, ?)').run(name.trim(), p);
  res.status(201).json({ id: r.lastInsertRowid, name: name.trim(), price: p });
});

app.delete('/api/services/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ error: 'Invalid id' });
  try {
    db.prepare('DELETE FROM services WHERE id = ?').run(id);
    res.json({ ok: true });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_FOREIGNKEY' || e.message?.includes('FOREIGN KEY')) {
      return res.status(409).json({ error: 'This service is used in existing visits. Remove those visits first.' });
    }
    throw e;
  }
});

// ----- Customers (list + create for recording visits) -----
app.get('/api/customers', requireLogin, (req, res) => {
  const q = (req.query.q || '').trim();
  let rows;
  if (q) {
    rows = db
      .prepare(
        'SELECT id, name, phone FROM customers WHERE name LIKE ? OR phone LIKE ? ORDER BY name LIMIT 50'
      )
      .all(`%${q}%`, `%${q}%`);
  } else {
    rows = db.prepare('SELECT id, name, phone FROM customers ORDER BY name LIMIT 100').all();
  }
  res.json(rows);
});

// ----- CSV Export (admin only) -----
app.get('/api/visits/export', requireAdmin, (req, res) => {
  const barberId = req.query.barber_id ? parseInt(req.query.barber_id, 10) : null;
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();

  let sql = `
    SELECT v.id, v.visit_date, v.total_amount, v.notes,
           COALESCE(v.payment_method, 'cash') AS payment_method,
           v.momo_reference,
           b.name AS barber_name, c.name AS customer_name
    FROM visits v
    JOIN barbers b ON b.id = v.barber_id
    JOIN customers c ON c.id = v.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (barberId) { sql += ' AND v.barber_id = ?'; params.push(barberId); }
  if (from) { sql += ' AND v.visit_date >= ?'; params.push(from); }
  if (to) { sql += ' AND v.visit_date <= ?'; params.push(to); }
  sql += ' ORDER BY v.visit_date DESC, v.created_at DESC';

  const rows = db.prepare(sql).all(...params);

  // Fetch services for all visits
  const visitIds = rows.map((r) => r.id);
  const servicesByVisit = {};
  if (visitIds.length) {
    const placeholders = visitIds.map(() => '?').join(',');
    db.prepare(
      `SELECT vs.visit_id, s.name AS service_name, vs.quantity
       FROM visit_services vs JOIN services s ON s.id = vs.service_id
       WHERE vs.visit_id IN (${placeholders})`
    ).all(...visitIds).forEach((s) => {
      if (!servicesByVisit[s.visit_id]) servicesByVisit[s.visit_id] = [];
      servicesByVisit[s.visit_id].push(s);
    });
  }

  function csvCell(v) {
    if (v == null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  const headers = ['Date', 'Barber', 'Customer', 'Services', 'Payment Method', 'MoMo Reference', 'Total (GHS)', 'Notes'];
  const lines = [headers.join(',')];
  rows.forEach((v) => {
    const svcs = (servicesByVisit[v.id] || [])
      .map((s) => s.service_name + (s.quantity > 1 ? ' x' + s.quantity : ''))
      .join('; ');
    lines.push([
      csvCell(v.visit_date),
      csvCell(v.barber_name),
      csvCell(v.customer_name),
      csvCell(svcs),
      csvCell(v.payment_method === 'momo' ? 'MoMo' : 'Cash'),
      csvCell(v.momo_reference || ''),
      csvCell(Number(v.total_amount).toFixed(2)),
      csvCell(v.notes || ''),
    ].join(','));
  });

  const filename = `visits_${from || 'all'}_to_${to || 'all'}.csv`;
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(lines.join('\r\n'));
});

app.post('/api/customers', requireLogin, (req, res) => {
  const { name, phone } = req.body || {};
  if (!name?.trim()) return res.status(400).json({ error: 'Name required' });
  const r = db
    .prepare('INSERT INTO customers (name, phone) VALUES (?, ?)')
    .run(name.trim(), (phone || '').trim());
  res.status(201).json({ id: r.lastInsertRowid, name: name.trim(), phone: (phone || '').trim() });
});

// ----- Visits (record sale: barber + customer + services) -----
app.get('/api/visits', requireLogin, (req, res) => {
  const barberId = req.query.barber_id ? parseInt(req.query.barber_id, 10) : null;
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  let sql = `
    SELECT v.id, v.barber_id, v.customer_id, v.visit_date, v.total_amount, v.notes, v.created_at,
           COALESCE(v.payment_method, 'cash') AS payment_method, v.momo_reference,
           b.name AS barber_name, c.name AS customer_name
    FROM visits v
    JOIN barbers b ON b.id = v.barber_id
    JOIN customers c ON c.id = v.customer_id
    WHERE 1=1
  `;
  const params = [];
  if (req.session.role === 'barber' && req.session.barberId) {
    sql += ' AND v.barber_id = ?';
    params.push(req.session.barberId);
  } else if (barberId) {
    sql += ' AND v.barber_id = ?';
    params.push(barberId);
  }
  if (from) {
    sql += ' AND v.visit_date >= ?';
    params.push(from);
  }
  if (to) {
    sql += ' AND v.visit_date <= ?';
    params.push(to);
  }
  sql += ' ORDER BY v.visit_date DESC, v.created_at DESC LIMIT 500';
  const rows = db.prepare(sql).all(...params);
  const visitIds = rows.map((r) => r.id);
  const servicesByVisit = {};
  if (visitIds.length) {
    const placeholders = visitIds.map(() => '?').join(',');
    const svc = db
      .prepare(
        `SELECT vs.visit_id, s.name AS service_name, vs.quantity, vs.unit_price
         FROM visit_services vs JOIN services s ON s.id = vs.service_id
         WHERE vs.visit_id IN (${placeholders})`
      )
      .all(...visitIds);
    svc.forEach((s) => {
      if (!servicesByVisit[s.visit_id]) servicesByVisit[s.visit_id] = [];
      servicesByVisit[s.visit_id].push(s);
    });
  }
  rows.forEach((r) => {
    r.services = servicesByVisit[r.id] || [];
  });
  res.json(rows);
});

app.post('/api/visits', requireLogin, (req, res) => {
  if (req.session.role === 'admin') {
    return res.status(403).json({ error: 'Only barbers can record visits' });
  }
  const { barber_id, customer_id, visit_date, services, notes, payment_method, momo_reference } = req.body || {};
  const barberId = req.session.role === 'barber' ? req.session.barberId : barber_id;
  if (!barberId) return res.status(400).json({ error: 'Barber required' });
  if (!customer_id) return res.status(400).json({ error: 'Customer required' });
  if (!visit_date) return res.status(400).json({ error: 'Visit date required' });
  const arr = Array.isArray(services) ? services : [];
  if (arr.length === 0) return res.status(400).json({ error: 'At least one service required' });
  const payMethod = (payment_method || 'cash').toLowerCase() === 'momo' ? 'momo' : 'cash';
  const momoRef = payMethod === 'momo' ? (momo_reference || '').trim() : null;
  if (payMethod === 'momo' && !momoRef) return res.status(400).json({ error: 'MoMo reference number required' });

  let total = 0;
  for (const s of arr) {
    const price = parseFloat(s.unit_price ?? s.price);
    const qty = parseInt(s.quantity, 10) || 1;
    if (isNaN(price) || price < 0) return res.status(400).json({ error: 'Invalid service price' });
    total += price * qty;
  }

  const insertVisit = db.prepare(
    'INSERT INTO visits (barber_id, customer_id, visit_date, total_amount, notes, payment_method, momo_reference) VALUES (?, ?, ?, ?, ?, ?, ?)'
  );
  const insertVs = db.prepare(
    'INSERT INTO visit_services (visit_id, service_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
  );
  const run = db.transaction(() => {
    const r = insertVisit.run(barberId, customer_id, visit_date, total, (notes || '').trim(), payMethod, momoRef);
    const visitId = r.lastInsertRowid;
    for (const s of arr) {
      const qty = parseInt(s.quantity, 10) || 1;
      const up = parseFloat(s.unit_price ?? s.price);
      insertVs.run(visitId, s.service_id, qty, up);
    }
    return visitId;
  });
  const visitId = run();
  res.status(201).json({ id: visitId, total });
});

// ----- Reports / progress (admin: all barbers; barber: own only) -----
app.get('/api/reports/summary', requireLogin, (req, res) => {
  const from = (req.query.from || '').trim();
  const to = (req.query.to || '').trim();
  const isBarber = req.session.role === 'barber' && req.session.barberId;
  let where = '1=1';
  const params = [];
  if (from) {
    where += ' AND visit_date >= ?';
    params.push(from);
  }
  if (to) {
    where += ' AND visit_date <= ?';
    params.push(to);
  }
  if (isBarber) {
    where += ' AND barber_id = ?';
    params.push(req.session.barberId);
  }

  const joinCondition = where === '1=1' ? '1=1' : where.replace('1=1 AND ', '');
  const byBarber = isBarber
    ? db
      .prepare(
        `SELECT b.id, b.name, COUNT(v.id) AS visit_count, COALESCE(SUM(v.total_amount), 0) AS total_sales
           FROM barbers b
           LEFT JOIN visits v ON v.barber_id = b.id AND ${joinCondition}
           WHERE b.id = ?
           GROUP BY b.id`
      )
      .all(...params, req.session.barberId)
    : db
      .prepare(
        `SELECT b.id, b.name, COUNT(v.id) AS visit_count, COALESCE(SUM(v.total_amount), 0) AS total_sales
           FROM barbers b
           LEFT JOIN visits v ON v.barber_id = b.id AND ${joinCondition}
           GROUP BY b.id ORDER BY total_sales DESC`
      )
      .all(...params);

  const overall = db
    .prepare(
      `SELECT COUNT(*) AS total_visits, COALESCE(SUM(total_amount), 0) AS total_revenue FROM visits WHERE ${where}`
    )
    .get(...params);

  let byService = [];
  if (!isBarber) {
    byService = db
      .prepare(
        `SELECT s.name, SUM(vs.quantity) AS times_rendered, SUM(vs.quantity * vs.unit_price) AS revenue
         FROM visit_services vs JOIN services s ON s.id = vs.service_id JOIN visits v ON v.id = vs.visit_id
         WHERE ${where}
         GROUP BY s.id ORDER BY revenue DESC`
      )
      .all(...params);
  }

  res.json({ byBarber, overall, byService });
});

// Create barber user (admin only)
app.post('/api/users/barber', requireAdmin, (req, res) => {
  const { username, password, barber_id } = req.body || {};
  if (!username?.trim() || !password) return res.status(400).json({ error: 'Username and password required' });
  const bid = barber_id ? parseInt(barber_id, 10) : null;
  const hash = bcrypt.hashSync(password, 10);
  try {
    const r = db
      .prepare(
        "INSERT INTO users (username, password_hash, role, barber_id, requires_password_change) VALUES (?, ?, 'barber', ?, 1)"
      )
      .run(username.trim(), hash, bid);
    res.status(201).json({ id: r.lastInsertRowid, username: username.trim(), barberId: bid });
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE') return res.status(400).json({ error: 'Username taken' });
    throw e;
  }
});

app.get('/api/users', requireAdmin, (req, res) => {
  const rows = db
    .prepare(
      `SELECT u.id, u.username, u.role, u.barber_id, b.name AS barber_name
       FROM users u LEFT JOIN barbers b ON b.id = u.barber_id ORDER BY u.id`
    )
    .all();
  res.json(rows);
});

app.post('/api/users/:id/reset-password', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  const hash = bcrypt.hashSync(DEFAULT_BARBER_PASSWORD, 10);
  db.prepare('UPDATE users SET password_hash = ?, requires_password_change = 1 WHERE id = ?').run(hash, id);
  res.json({ ok: true });
});

app.delete('/api/users/:id', requireAdmin, (req, res) => {
  const id = parseInt(req.params.id, 10);
  const user = db.prepare('SELECT id, role FROM users WHERE id = ?').get(id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  if (user.role === 'admin') return res.status(403).json({ error: 'Cannot delete the admin account' });
  db.prepare('DELETE FROM password_reset_requests WHERE user_id = ?').run(id);
  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ ok: true });
});


// SPA fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// Global error handler — returns JSON instead of HTML stack trace
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: err.message || 'Internal server error' });
});

app.listen(PORT, () => {
  console.log(`Barber Shop Sales app running at http://localhost:${PORT}`);
});
