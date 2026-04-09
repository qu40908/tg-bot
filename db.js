const sqlite3 = require('sqlite3');
const { open } = require('sqlite');

let db;

async function initDB() {
  db = await open({
    filename: './data.sqlite',
    driver: sqlite3.Database
  });

  await db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_id INTEGER,
      message_id INTEGER,
      text TEXT,
      date INTEGER
    )
  `);
}

function getDB() {
  return db;
}

module.exports = { initDB, getDB };