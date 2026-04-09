const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();

const token = process.env.TOKEN;
const bot = new TelegramBot(token, { polling: true });

// ✅ DB
const db = new sqlite3.Database("./data.db");

// ✅ 建表
db.run(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  message_id TEXT,
  text TEXT
)
`);

// ✅ 你要抓資料的群（自己填）
const sourceGroups = [
  -1003825428908, // 資料群
  -1003877293059  // 資料群
];

// ✅ 允許查詢的群
const queryGroups = [
  -1003874245157, // ← 查詢群
];

// =========================
// 📌 儲存資料（含文字）
// =========================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (!sourceGroups.includes(chatId)) return;
  if (!msg.text) return;

  db.run(
    `INSERT INTO messages (chat_id, message_id, text) VALUES (?, ?, ?)`,
    [msg.chat.id, msg.message_id, msg.text]
  );
});

// =========================
// 🔍 查詢（核心）
// =========================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const keyword = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!keyword) return;

  db.all(
    `
    SELECT * FROM messages 
    WHERE text LIKE ? 
    ORDER BY message_id DESC 
    LIMIT 10
    `,
    [`%${keyword}%`],
    (err, rows) => {
      if (err || !rows || rows.length === 0) {
        bot.sendMessage(chatId, "❌ 找不到相關資料");
        return;
      }

      // ✅ 逐筆原封不動轉發（保留超連結）
      rows.forEach((row) => {
        bot.forwardMessage(
          chatId,
          row.chat_id,
          row.message_id
        );
      });
    }
  );
});

console.log("🔥 客服級機器人已啟動");

const express = require("express");
const app = express();

app.get("/", (req, res) => {
  res.send("Bot is running ✅");
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("🌐 Web server running on port " + PORT);
});
