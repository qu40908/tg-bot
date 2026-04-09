const sqlite3 = require('sqlite3').verbose();
const db = new sqlite3.Database('./messages.db');

db.run(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    chat_id INTEGER,
    message_id INTEGER,
    text TEXT,
    date INTEGER
  )
`);

module.exports = db;