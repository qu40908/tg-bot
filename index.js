require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Web =====
const app = express();
app.get("/", (req, res) => res.send("OK"));
const PORT = process.env.PORT || 3000;
app.listen(PORT);

// ===== DB =====
const db = new sqlite3.Database("./data.db");

db.run(`
CREATE TABLE IF NOT EXISTS messages (
  chat_id TEXT,
  message_id TEXT,
  text TEXT,
  file_id TEXT,
  type TEXT,
  date INTEGER,
  entities TEXT
)
`);

// ===== 群 =====
const sourceGroups = [-1003825428908, -1003877293059];
const queryGroups = [-1003874245157];

// ===== 存資料 =====
function saveMessage(msg) {
  const text = msg.text || msg.caption || "";
  if (!text && !msg.photo) return;

  let file_id = null;
  let type = "text";

  if (msg.photo) {
    file_id = msg.photo[msg.photo.length - 1].file_id;
    type = "photo";
  }

  const entities = JSON.stringify(msg.entities || msg.caption_entities || []);

  db.run(
    `INSERT INTO messages (chat_id, message_id, text, file_id, type, date, entities)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [msg.chat.id, msg.message_id, text, file_id, type, msg.date, entities]
  );
}

// ===== 刪除同步 =====
function deleteMessage(chatId, messageId) {
  db.run(`DELETE FROM messages WHERE chat_id=? AND message_id=?`, [chatId, messageId]);
}

// ===== 抽出連結 =====
function extractUrl(text, entities) {
  try {
    const parsed = JSON.parse(entities || "[]");
    for (let e of parsed) {
      if (e.type === "text_link") return e.url;
      if (e.type === "url") return text.substring(e.offset, e.offset + e.length);
    }
  } catch {}
  return null;
}

// ===== 搜尋 =====
function smartSearch(keyword, callback) {
  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return callback([]);

    keyword = keyword.toLowerCase();

    let scored = rows.map(r => {
      if (!r.text) return null;

      let text = r.text.toLowerCase();
      let score = 0;

      if (text.includes(keyword)) score += 10;

      keyword.split("").forEach(k => {
        if (text.includes(k)) score += 1;
      });

      return { ...r, score };
    })
    .filter(r => r && r.score > 0)
    .sort((a, b) => b.score - a.score);

    callback(scored.slice(0, 5));
  });
}

// ===== 收資料 =====
bot.on("message", (msg) => {
  if (sourceGroups.includes(msg.chat.id)) {
    saveMessage(msg);
  }
});

// ===== 刪除 =====
bot.on("deleted_message", (msg) => {
  deleteMessage(msg.chat.id, msg.message_id);
});

// ===== 查詢 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  if (text === "/clear") {
    db.run(`DELETE FROM messages`);
    bot.sendMessage(chatId, "🧹 清空完成");
    return;
  }

  smartSearch(text, (results) => {
    if (results.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到");
      return;
    }

    let buttons = [];
    let reply = "🔍 找到相關內容：\n\n";

    results.forEach((r, i) => {
      const url = extractUrl(r.text, r.entities);

      reply += `${i + 1}. ${r.text}\n\n`;

      if (url) {
        buttons.push([{ text: `🔗 查看 ${i + 1}`, url }]);
      }
    });

    bot.sendMessage(chatId, reply, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  });
});

console.log("🔥 客服級 BOT 啟動");
