require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== WEB =====
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

// ===== 查詢 =====
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return;

    let keyword = text.toLowerCase();

    let results = rows.filter(r =>
      r.text && r.text.toLowerCase().includes(keyword)
    );

    if (results.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到資料");
      return;
    }

    // 👉 組清單
    let list = "📌 查詢結果\n\n";

    let buttons = [];

    results.slice(0, 10).forEach((r, i) => {
      let title = r.text.split("\n")[0];

      list += `${i + 1}. ${title}\n`;

      buttons.push([{
        text: title,
        callback_data: `${r.chat_id}|${r.message_id}`
      }]);
    });

    bot.sendMessage(chatId, list, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });

  });
});

// ===== 點擊回原文 =====
bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const [sourceChatId, messageId] = query.data.split("|");

  bot.forwardMessage(
    chatId,
    sourceChatId,
    messageId
  );

  bot.answerCallbackQuery(query.id);
});

console.log("🔥 客服模式（點擊回原文）已啟動");
