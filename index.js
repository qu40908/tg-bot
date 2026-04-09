const TelegramBot = require('node-telegram-bot-api');
const db = require('./db');

const token = process.env.TOKEN;

if (!token) {
  console.error('❌ TOKEN 未設定');
  process.exit(1);
}

const bot = new TelegramBot(token, { polling: true });

console.log('✅ BOT 已啟動');

// 👉 群設定
const sourceGroups = [ 
  -1003825428908,
  -1003877293059,
];

const queryGroups = [-1003874245157];

// =======================
// 工具
// =======================
function normalize(text) {
  return text.toLowerCase().replace(/[^\u4e00-\u9fa5a-z0-9]/g, '');
}

// =======================
// 存資料（防重複🔥）
// =======================
function saveMessage(msg) {
  const text = msg.text || msg.caption || '';
  if (!text || text.length < 3) return;

  const norm = normalize(text).slice(0, 50);

  db.get(
    'SELECT 1 FROM messages WHERE text LIKE ? LIMIT 1',
    [`%${norm}%`],
    (err, row) => {
      if (!row) {
        db.run(
          'INSERT INTO messages (chat_id, message_id, text, date) VALUES (?, ?, ?, ?)',
          [msg.chat.id, msg.message_id, text, msg.date]
        );
      }
    }
  );
}

// =======================
// 搜尋
// =======================
function findCandidates(keyword, callback) {
  const clean = normalize(keyword);

  db.all(
    `SELECT * FROM messages ORDER BY date DESC LIMIT 500`,
    [],
    (err, rows) => {
      if (err) return callback([]);

      let results = [];

      rows.forEach(r => {
        if (!r.text || r.text.length < 5) return;

        const lines = r.text.split('\n');
        const title = lines[0] || '';
        const preview = lines.slice(0, 3).join(' ');

        const titleNorm = normalize(title);
        const textNorm = normalize(r.text);

        let score = 0;

        if (titleNorm.includes(clean)) score += 5;
        if (normalize(preview).includes(clean)) score += 3;
        if (textNorm.includes(clean)) score += 1;

        if (clean !== '優惠' && title.includes('優惠')) score -= 3;

        if (score > 0) {
          results.push({ ...r, score, title });
        }
      });

      results.sort((a, b) => b.score - a.score);

      const map = new Map();
      results.forEach(r => {
        const key = normalize(r.text).slice(0, 50);
        if (!map.has(key)) map.set(key, r);
      });

      callback(Array.from(map.values()).slice(0, 5));
    }
  );
}

let userChoices = {};

// =======================
// 主邏輯
// =======================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text || '';

  console.log('📩', chatId, text);

  if (sourceGroups.includes(chatId)) {
    saveMessage(msg);
  }

  if (!queryGroups.includes(chatId)) return;
  if (!text || text.length < 2) return;

  findCandidates(text, (results) => {
    if (!results.length) {
      bot.sendMessage(chatId, '❌ 找不到資料');
      return;
    }

    userChoices[chatId] = results;

    const buttons = results.map((r, i) => [{
      text: `${i + 1}. ${(r.title || '').slice(0, 15)}`,
      callback_data: String(i)
    }]);

    bot.sendMessage(chatId, '🔍 你是不是要找👇', {
      reply_markup: { inline_keyboard: buttons }
    });
  });
});

// =======================
// 點擊
// =======================
bot.on('callback_query', (query) => {
  const chatId = query.message.chat.id;
  const index = parseInt(query.data);

  const item = userChoices[chatId]?.[index];
  if (!item) return bot.sendMessage(chatId, '❌ 失效');

  bot.copyMessage(chatId, item.chat_id, item.message_id)
    .catch(() => {
      db.run(
        'DELETE FROM messages WHERE chat_id = ? AND message_id = ?',
        [item.chat_id, item.message_id]
      );
      bot.sendMessage(chatId, '⚠️ 已刪除資料（自動清理）');
    });

  bot.answerCallbackQuery(query.id);
});