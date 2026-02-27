const path = require('path');
const { getDb, initSchema } = require('../db');

const db = getDb();
initSchema(db);

// Clear visits and barbers; unlink barber users so admin can re-add barbers
db.exec('DELETE FROM visit_services');
db.exec('DELETE FROM visits');
db.prepare('UPDATE users SET barber_id = NULL WHERE role = ?').run('barber');
db.prepare('DELETE FROM users WHERE role = ?').run('barber');
db.exec('DELETE FROM barbers');

console.log('All barbers, barber users, and visits have been removed.');
db.close();
