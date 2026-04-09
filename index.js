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

const sourceGroups = [
  -1003825428908,
  -1003877293059,
];

const queryGroups = [
  -1003874245157
];

// =========================
// 📥 收資料（來源群）
// =========================
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

// =========================
// 🔍 查詢（客服群）
// =========================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const keyword = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!keyword) return;

  db.get(
    `SELECT * FROM messages WHERE text LIKE ? LIMIT 1`,
    [`%${keyword}%`],
    (err, row) => {
      if (err || !row) {
        bot.sendMessage(chatId, "❌ 找不到相關資料");
        return;
      }

      // 👉 抓清單（1. 2. 3.）
      const lines = row.text
        .split("\n")
        .filter(l => /^\d+\./.test(l));

      // 👉 建立按鈕（長得像清單）
      const keyboard = lines.map((line) => [{
        text: line,
        callback_data: JSON.stringify({
          chat_id: row.chat_id,
          message_id: row.message_id,
          keyword: line.replace(/^\d+\.\s*/, "")
        })
      }]);

      // 👉 先顯示原文（完整）
      bot.sendMessage(chatId, row.text);

      // 👉 再給可點選清單（像你畫面）
      bot.sendMessage(chatId, "👇 點選項目查看內容", {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    }
  );
});

// =========================
// 🎯 點擊 → 回傳該項內容
// =========================
bot.on("callback_query", (query) => {
  const data = JSON.parse(query.data);
  const chatId = query.message.chat.id;

  // 👉 找最符合該項的內容
  db.get(
    `SELECT * FROM messages WHERE text LIKE ? LIMIT 1`,
    [`%${data.keyword}%`],
    (err, row) => {
      if (row) {
        bot.forwardMessage(
          chatId,
          row.chat_id,
          row.message_id
        );
      } else {
        bot.sendMessage(chatId, "❌ 找不到該項內容");
      }
    }
  );

  bot.answerCallbackQuery(query.id);
});

console.log("🔥 客服系統（進階版）已啟動");
