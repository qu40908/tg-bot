const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

// ===== BOT
const bot = new TelegramBot(process.env.TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
  },
});

// ===== Render 必備（防 timeout）
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

// =======================
// 👉 你的群組（已幫你放好）
// =======================

// 📌 資料群（存資料）
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

// 📌 查詢群（使用者查詢）
const queryGroups = [
  -1003874245157
];

// 暫存（按鈕用）
const userCache = {};

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
// 🔍 查詢 → 顯示按鈕
// =======================
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

      // 👉 存暫存
      userCache[chatId] = rows;

      // 👉 建按鈕
      const keyboard = rows.map((row, i) => [{
        text: `${i + 1}. ${getTitle(row.text)}`,
        callback_data: `pick_${i}`
      }]);

      bot.sendMessage(chatId, "👉 請選擇：", {
        reply_markup: {
          inline_keyboard: keyboard
        }
      });
    }
  );
});

// =======================
// 👉 點擊按鈕（關鍵）
// =======================
bot.on("callback_query", async (query) => {
  try {
    console.log("🔥 點擊:", query.data);

    const chatId = query.message.chat.id;
    const index = parseInt(query.data.split("_")[1]);

    const data = userCache[chatId];

    if (!data || !data[index]) {
      await bot.answerCallbackQuery(query.id, {
        text: "❌ 資料過期，請重新查詢",
        show_alert: true
      });
      return;
    }

    const item = data[index];

    // ✅ 不顯示來源
    await bot.copyMessage(
      chatId,
      item.chat_id,
      item.message_id
    );

    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.log("❌ callback error:", err);
  }
});

// =======================
// 🧠 標題處理
// =======================
function getTitle(text) {
  if (!text) return "資料";
  return text.split("\n")[0].slice(0, 25);
}

console.log("🔥 客服系統已啟動");
