const fs = require('fs');

const DB_FILE = './data.json';

if (!fs.existsSync(DB_FILE)) {
  fs.writeFileSync(DB_FILE, JSON.stringify([]));
}

function getAll() {
  return JSON.parse(fs.readFileSync(DB_FILE));
}

function save(chat_id, message_id, text, date) {
  let data = getAll();

  const exists = data.find(
    (m) => m.chat_id === chat_id && m.message_id === message_id
  );

  if (exists) return;

  data.push({ chat_id, message_id, text, date });

  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function remove(chat_id, message_id) {
  let data = getAll();

  data = data.filter(
    (m) => !(m.chat_id === chat_id && m.message_id === message_id)
  );

  fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}

function search(keyword, sourceGroups) {
  let data = getAll();

  return data.filter(
    (m) =>
      sourceGroups.includes(m.chat_id) &&
      m.text &&
      m.text.toLowerCase().includes(keyword.toLowerCase())
  );
}

module.exports = { save, remove, search };