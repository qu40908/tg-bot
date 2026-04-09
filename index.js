require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Web =====
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

// 👉 暫存查詢結果（讓數字可以對應）
let lastQueryMap = {};

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

// ===== 查詢 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  // 👉 如果輸入是數字（點擊）
  if (/^\d+$/.test(text)) {
    let index = parseInt(text) - 1;
    let data = lastQueryMap[chatId];

    if (data && data[index]) {
      let item = data[index];

      bot.forwardMessage(
        chatId,
        item.chat_id,
        item.message_id
      );
    }
    return;
  }

  // 👉 查分類（只抓第一筆）
  db.get(
    `SELECT * FROM messages WHERE text LIKE ? LIMIT 1`,
    [`%${text}%`],
    (err, row) => {
      if (err || !row) {
        bot.sendMessage(chatId, "❌ 找不到資料");
        return;
      }

      // 👉 顯示整段（圖一效果）
      bot.sendMessage(chatId, row.text);

      // 👉 建立編號對應（圖2用）
      let lines = row.text.split("\n").filter(l => /^\d+\./.test(l));

      lastQueryMap[chatId] = lines.map(() => ({
        chat_id: row.chat_id,
        message_id: row.message_id
      }));
    }
  );
});

console.log("🔥 最終版（數字選擇）已啟動");
