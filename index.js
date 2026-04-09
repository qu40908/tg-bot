require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

// ===== BOT =====
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
  date INTEGER
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

// ===== 存資料（支援圖文）=====
function saveMessage(msg) {
  const text = msg.text || msg.caption || "";
  let file_id = null;
  let type = "text";

  if (msg.photo) {
    file_id = msg.photo[msg.photo.length - 1].file_id;
    type = "photo";
  }

  db.run(
    `INSERT INTO messages (chat_id, message_id, text, file_id, type, date)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [msg.chat.id, msg.message_id, text, file_id, type, msg.date]
  );
}

// ===== 刪除同步 =====
function deleteMessage(chatId, messageId) {
  db.run(
    `DELETE FROM messages WHERE chat_id = ? AND message_id = ?`,
    [chatId, messageId]
  );
}

// ===== 智慧模糊搜尋 =====
function smartSearch(keyword, callback) {
  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return callback([]);

    keyword = keyword.toLowerCase();

    let scored = rows.map(r => {
      if (!r.text) return null;

      let text = r.text.toLowerCase();

      let score = 0;

      // 🔥 關鍵字完整命中
      if (text.includes(keyword)) score += 5;

      // 🔥 拆字比對
      keyword.split("").forEach(k => {
        if (text.includes(k)) score += 1;
      });

      return { ...r, score };
    })
    .filter(r => r && r.score > 0)
    .sort((a, b) => b.score - a.score);

    // 去重（避免重複內容）
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
  const chatId = msg.chat.id;

  if (sourceGroups.includes(chatId)) {
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

  // 管理指令
  if (text === "/stats") {
    db.get(`SELECT COUNT(*) as count FROM messages`, (err, row) => {
      bot.sendMessage(chatId, `📊 資料數：${row.count}`);
    });
    return;
  }

  smartSearch(text, (results) => {
    if (results.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    results.forEach(r => {

      // 📷 有圖片
      if (r.type === "photo" && r.file_id) {
        bot.sendPhoto(chatId, r.file_id, {
          caption: r.text || ""
        });
      } 
      // 📝 純文字
      else {
        bot.sendMessage(chatId, r.text);
      }

    });

  });
});

console.log("✅ BOT 已啟動");
