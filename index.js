const TelegramBot = require('node-telegram-bot-api');
const fs = require('fs');

// 🔑 Token（Render 用環境變數）
const token = process.env.TOKEN;

// 👉 初始化 Bot
const bot = new TelegramBot(token, { polling: true });

console.log('✅ BOT 已啟動');

// 👉 資料群（你指定的）
const sourceGroups = [
  -1003825428908, // 資料群
  -1003877293059  // 資料群
];

// 👉 查詢群
const queryGroups = [
  -1003874245157
];

// 👉 JSON 檔
const DATA_FILE = './data.json';

// 👉 讀資料
function loadData() {
  if (!fs.existsSync(DATA_FILE)) return [];
  return JSON.parse(fs.readFileSync(DATA_FILE));
}

// 👉 存資料
function saveData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// =========================
// 📥 存資料（只存資料群）
// =========================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (!sourceGroups.includes(chatId)) return;

  const text = msg.text || msg.caption || '';
  if (!text) return;

  let data = loadData();

  // ❌ 過濾已刪除
  if (text.includes('已刪除') || text.includes('刪除')) return;

  // ❌ 避免重複
  if (data.some(d => d.message_id === msg.message_id)) return;

  data.push({
    chat_id: msg.chat.id,
    message_id: msg.message_id,
    text: text,
    date: msg.date
  });

  saveData(data);
});

// =========================
// 🔍 查詢
// =========================
bot.on('message', (msg) => {
  const chatId = msg.chat.id;

  if (!queryGroups.includes(chatId)) return;

  const keyword = (msg.text || '').trim();
  if (!keyword) return;

  let data = loadData();

  // 🔍 模糊搜尋
  let results = data.filter(d =>
    d.text.toLowerCase().includes(keyword.toLowerCase())
  );

  // ❌ 過濾已刪除
  results = results.filter(d =>
    !d.text.includes('已刪除') &&
    !d.text.includes('刪除')
  );

  // ❌ 過濾優惠（你剛剛問題🔥）
  if (!keyword.includes('優惠')) {
    results = results.filter(d =>
      !d.text.includes('優惠')
    );
  }

  // ❌ 去重複（關鍵🔥）
  const unique = [];
  const seen = new Set();

  for (let item of results) {
    if (!seen.has(item.text)) {
      seen.add(item.text);
      unique.push(item);
    }
  }

  // 👉 沒資料
  if (unique.length === 0) {
    bot.sendMessage(chatId, '❌ 查無相關資料');
    return;
  }

  // 👉 限制數量
  const top = unique.slice(0, 5);

  let reply = `🔍 找到 ${top.length} 筆相關：\n\n`;

  top.forEach((item, i) => {
    reply += `${i + 1}. ${item.text}\n\n`;
  });

  bot.sendMessage(chatId, reply);
});

const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send('Bot is running');
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log('🌐 Web server running');
});