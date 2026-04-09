require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Web (Render用) =====
const app = express();
app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

// ===== DB =====
const db = new sqlite3.Database("./data.db");

db.run(`
CREATE TABLE IF NOT EXISTS messages (
  chat_id TEXT,
  message_id TEXT,
  text TEXT
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

// ===== 存資料 =====
bot.on("message", (msg) => {
  if (!sourceGroups.includes(msg.chat.id)) return;

  const text = msg.text || msg.caption || "";
  if (!text) return;

  db.run(
    `INSERT INTO messages (chat_id, message_id, text)
     VALUES (?, ?, ?)`,
    [msg.chat.id, msg.message_id, text]
  );
});

// ===== 查詢 + 顯示整段 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const keyword = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!keyword) return;

  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return;

    let found = rows.find(r =>
      r.text && r.text.toLowerCase().includes(keyword.toLowerCase())
    );

    if (!found) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // 👉 直接顯示整段（像你圖二）
    bot.sendMessage(chatId, found.text);
  });
});

// ===== 回覆某一行 → 回原文 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return;

    let match = null;

    rows.forEach(r => {
      if (!r.text) return;

      let lines = r.text.split("\n");

      lines.forEach(line => {
        if (line.includes(text)) {
          match = r;
        }
      });
    });

    if (match) {
      bot.forwardMessage(
        chatId,
        match.chat_id,
        match.message_id
      );
    }
  });
});

console.log("🔥 最終版（回覆觸發）已啟動");
