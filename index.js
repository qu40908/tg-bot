const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Web server（Render必備）
const app = express();
app.get("/", (req, res) => res.send("OK"));
app.listen(process.env.PORT || 3000);

// ===== DB
const db = new sqlite3.Database("./data.db");

db.run(`
CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  chat_id TEXT,
  message_id TEXT,
  text TEXT
)
`);

// ===== 你的資料群（存資料）
const sourceGroups = [
  -1003825428908, // 資料群
  -1003877293059  // 資料群
];

// ===== 查詢群
const queryGroups = [
  -1003874245157
];

// =======================
// 📥 存資料
// =======================
bot.on("message", (msg) => {
  if (!sourceGroups.includes(msg.chat.id)) return;
  if (!msg.text) return;

  db.run(
    `INSERT INTO messages (chat_id, message_id, text) VALUES (?, ?, ?)`,
    [msg.chat.id, msg.message_id, msg.text]
  );
});

// =======================
// 🎯 查詢入口（顯示分類按鈕）
// =======================
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  // 👉 找到相關分類（模糊）
  db.all(
    `SELECT DISTINCT text FROM messages WHERE text LIKE ? LIMIT 5`,
    [`%${text}%`],
    (err, rows) => {
      if (!rows || rows.length === 0) {
        bot.sendMessage(chatId, "❌ 找不到相關資料");
        return;
      }

      // 👉 建按鈕（分類）
      const keyboard = rows.map((row, i) => [{
        text: `${i + 1}. ${getTitle(row.text)}`,
        callback_data: `pick_${i}`
      }]);

      // 👉 存暫存（讓 callback 用）
      userCache[chatId] = rows;

      bot.sendMessage(chatId, "👉 請選擇：", {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    }
  );
});

// =======================
// 🎯 點擊後回傳內容
// =======================
const userCache = {};

bot.on("callback_query", (query) => {
  const chatId = query.message.chat.id;
  const index = query.data.split("_")[1];

  const data = userCache[chatId];
  if (!data) return;

  const item = data[index];

  // ✅ 用 copyMessage（不顯示來源）
  bot.copyMessage(
    chatId,
    item.chat_id,
    item.message_id
  );

  bot.answerCallbackQuery(query.id);
});

// =======================
// 🧠 抓標題（第一行）
// =======================
function getTitle(text) {
  return text.split("\n")[0].slice(0, 20);
}

console.log("🔥 客服按鈕版啟動");
