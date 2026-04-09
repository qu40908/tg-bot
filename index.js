require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Render Web =====
const app = express();
app.get("/", (req, res) => res.send("BOT RUNNING"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Web server running"));

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
const sourceGroups = [
  -1003825428908,
  -1003877293059,
];

const queryGroups = [
  -1003874245157
];

// ===== 存資料（含連結）=====
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
  db.run(
    `DELETE FROM messages WHERE chat_id = ? AND message_id = ?`,
    [chatId, messageId]
  );
}

// ===== 還原連結（核心🔥）=====
function rebuildTextWithLinks(text, entitiesStr) {
  if (!entitiesStr) return text;

  try {
    const entities = JSON.parse(entitiesStr);
    let result = "";
    let lastIndex = 0;

    entities.forEach(e => {
      const start = e.offset;
      const end = e.offset + e.length;

      result += text.substring(lastIndex, start);
      const part = text.substring(start, end);

      if (e.type === "text_link") {
        result += `<a href="${e.url}">${part}</a>`;
      } else if (e.type === "url") {
        result += `<a href="${part}">${part}</a>`;
      } else {
        result += part;
      }

      lastIndex = end;
    });

    result += text.substring(lastIndex);
    return result;
  } catch {
    return text;
  }
}

// ===== 智慧搜尋 =====
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

    let unique = [];
    let seen = new Set();

    for (let r of scored) {
      let key = r.text + (r.file_id || "");
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(r);
      }
    }

    callback(unique.slice(0, 5));
  });
}

// ===== 收資料 =====
bot.on("message", (msg) => {
  if (sourceGroups.includes(msg.chat.id)) {
    saveMessage(msg);
  }
});

// ===== 刪除同步 =====
bot.on("deleted_message", (msg) => {
  deleteMessage(msg.chat.id, msg.message_id);
});

// ===== 查詢 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  if (text === "/stats") {
    db.get(`SELECT COUNT(*) as count FROM messages`, (err, row) => {
      bot.sendMessage(chatId, `📊 資料數：${row.count}`);
    });
    return;
  }

  if (text === "/clear") {
    db.run(`DELETE FROM messages`);
    bot.sendMessage(chatId, "🧹 已清空資料");
    return;
  }

  smartSearch(text, (results) => {
    if (results.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    let reply = "🔍 找到相關內容：\n\n";

    results.forEach((r, i) => {
      const formatted = rebuildTextWithLinks(r.text, r.entities);
      reply += `${i + 1}. ${formatted}\n\n`;
    });

    bot.sendMessage(chatId, reply, {
      parse_mode: "HTML",
      disable_web_page_preview: true
    });
  });
});

console.log("🔥 商用級 BOT 已啟動");
