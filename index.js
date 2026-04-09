require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ===== Web（Render）=====
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

// ===== 群組 =====
const sourceGroups = [
  -1003825428908,
  -1003877293059,
];

const queryGroups = [
  -1003874245157
];

// ===== 記錄「最近查詢結果」=====
const userState = {}; 
// userState[chatId] = [ {keyword, chat_id, message_id} ]

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
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  // ===== 如果是選項（1 / 2 / 關鍵字）=====
  if (userState[chatId]) {
    const list = userState[chatId];

    let target = null;

    // 👉 打「1」
    if (/^\d+$/.test(text)) {
      target = list[Number(text) - 1];
    } else {
      // 👉 模糊比對
      target = list.find(item => item.keyword.includes(text));
    }

    if (target) {
      bot.forwardMessage(
        chatId,
        target.chat_id,
        target.message_id
      );
      return;
    }
  }

  // ===== 一般查詢 =====
  db.get(
    `SELECT * FROM messages WHERE text LIKE ? LIMIT 1`,
    [`%${text}%`],
    (err, row) => {
      if (err || !row) {
        bot.sendMessage(chatId, "❌ 找不到相關資料");
        return;
      }

      // ✅ 先丟原文（完整保留超連結）
      bot.forwardMessage(chatId, row.chat_id, row.message_id);

      // ===== 拆出 1. 2. 3. =====
      const lines = row.text
        .split("\n")
        .filter(l => /^\d+\./.test(l));

      const list = [];

      // ===== 建立「子項索引」=====
      lines.forEach(line => {
        const keyword = line.replace(/^\d+\.\s*/, "");

        list.push({
          keyword,
          chat_id: row.chat_id,
          message_id: row.message_id
        });
      });

      // 👉 存起來（給下一步用）
      userState[chatId] = list;

      // 👉 提示（不用按鈕）
      bot.sendMessage(chatId,
        "👉 請輸入編號或關鍵字查詢（例：1 / VISA / 台灣）"
      );
    }
  );
});

console.log("🔥 最終客服系統已啟動");
