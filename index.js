require("dotenv").config();
const TelegramBot = require("node-telegram-bot-api");
const sqlite3 = require("sqlite3").verbose();
const express = require("express");

// ====== TOKEN ======
const bot = new TelegramBot(process.env.TOKEN, { polling: true });

// ====== Web Server（Render用）======
const app = express();
app.get("/", (req, res) => res.send("BOT RUNNING"));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log("🌐 Web server running on " + PORT));

// ====== DB ======
const db = new sqlite3.Database("./data.db");

db.run(`
CREATE TABLE IF NOT EXISTS messages (
  chat_id TEXT,
  message_id TEXT,
  text TEXT,
  date INTEGER
)
`);

// ====== 群設定 ======
const sourceGroups = [
  -1003825428908,
  -1003877293059,
];

const queryGroups = [
  -1003874245157
];

// ====== 分類關鍵字 ======
const categories = {
  帳號: ["帳號", "登入", "密碼"],
  儲值: ["儲值", "入金", "充值"],
  提領: ["提款", "出金"],
  遊戲: ["遊戲", "注單", "輸贏"],
  代理: ["代理", "推廣"],
};

// ====== 存資料 ======
function saveMessage(msg) {
  const text = msg.text || msg.caption || "";
  if (!text) return;

  db.run(
    `INSERT INTO messages (chat_id, message_id, text, date) VALUES (?, ?, ?, ?)`,
    [msg.chat.id, msg.message_id, text, msg.date]
  );
}

// ====== 刪除資料 ======
function deleteMessage(chatId, messageId) {
  db.run(
    `DELETE FROM messages WHERE chat_id = ? AND message_id = ?`,
    [chatId, messageId]
  );
}

// ====== 抓分類 ======
function getCategory(text) {
  for (let key in categories) {
    if (categories[key].some(k => text.includes(k))) {
      return key;
    }
  }
  return null;
}

// ====== 查詢 ======
function search(keyword, category, callback) {
  db.all(`SELECT * FROM messages`, [], (err, rows) => {
    if (err) return callback([]);

    let filtered = rows.filter(r => {
      if (!r.text) return false;

      // 必須包含關鍵字
      if (!r.text.includes(keyword)) return false;

      // 如果有分類 → 必須符合分類
      if (category) {
        return categories[category].some(k => r.text.includes(k));
      }

      return true;
    });

    // 去重
    let unique = [];
    let seen = new Set();

    for (let r of filtered) {
      if (!seen.has(r.text)) {
        seen.add(r.text);
        unique.push(r.text);
      }
    }

    callback(unique.slice(0, 5));
  });
}

// ====== 收資料 ======
bot.on("message", (msg) => {
  const chatId = msg.chat.id;

  if (sourceGroups.includes(chatId)) {
    saveMessage(msg);
  }
});

// ====== 刪除同步 ======
bot.on("deleted_message", (msg) => {
  deleteMessage(msg.chat.id, msg.message_id);
});

// ====== 查詢入口 ======
bot.on("message", (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!queryGroups.includes(chatId)) return;
  if (!text) return;

  // 管理指令
  if (text === "/stats") {
    db.get(`SELECT COUNT(*) as count FROM messages`, (err, row) => {
      bot.sendMessage(chatId, `📊 目前資料數量：${row.count}`);
    });
    return;
  }

  if (text === "/clear") {
    db.run(`DELETE FROM messages`);
    bot.sendMessage(chatId, "🧹 已清空資料庫");
    return;
  }

  // 👉 先給分類選單
  let buttons = Object.keys(categories).map(c => ([{ text: c }]));

  bot.sendMessage(chatId, "🔍 請選擇查詢分類：", {
    reply_markup: {
      keyboard: buttons,
      one_time_keyboard: true,
      resize_keyboard: true
    }
  });

  // 等使用者選分類
  bot.once("message", (msg2) => {
    const category = msg2.text;

    if (!categories[category]) {
      bot.sendMessage(chatId, "❌ 分類錯誤");
      return;
    }

    search(text, category, (results) => {
      if (results.length === 0) {
        bot.sendMessage(chatId, "❌ 找不到資料");
        return;
      }

      let reply = "📌 查詢結果：\n\n";
      results.forEach((r, i) => {
        reply += `${i + 1}. ${r}\n\n`;
      });

      bot.sendMessage(chatId, reply);
    });
  });
});

console.log("✅ BOT 已啟動");
