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

// ===== 群設定 =====
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
  const keyword = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!keyword) return;

  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return;

    let matches = [];

    rows.forEach(r => {
      if (!r.text) return;

      // 👉 每一行拆開
      let lines = r.text.split("\n");

      lines.forEach(line => {
        if (line.toLowerCase().includes(keyword.toLowerCase())) {
          matches.push({
            title: line.trim(),
            chat_id: r.chat_id,
            message_id: r.message_id
          });
        }
      });
    });

    if (matches.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // 去重（避免重複）
    let unique = [];
    let map = new Set();

    matches.forEach(m => {
      if (!map.has(m.title)) {
        map.add(m.title);
        unique.push(m);
      }
    });

    // 👉 顯示清單
    let text = "📌 查詢結果：\n\n";
    let buttons = [];

    unique.slice(0, 10).forEach((m, i) => {
      text += `${i + 1}. ${m.title}\n`;

      buttons.push([{
        text: m.title,
        callback_data: `${m.chat_id}|${m.message_id}`
      }]);
    });

    bot.sendMessage(chatId, text, {
      reply_markup: {
        inline_keyboard: buttons
      }
    });
  });
});

// ===== 點擊 → 回原文 =====
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

console.log("🔥 最終客服系統 已啟動");
