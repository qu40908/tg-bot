const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase
const supabase = createClient(
  "https://nduirhpyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT
const bot = new TelegramBot(process.env.TOKEN, {
  polling: {
    autoStart: true,
    interval: 300,
  },
});

// ===== Render 防 timeout
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// ===== 群組設定
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

const queryGroups = [
  -1003874245157
];

// =======================
// 📥 存資料（Supabase）
// =======================
bot.on("message", async (msg) => {
  const chatId = msg.chat.id;
  const text = msg.text;

  if (!text) return;

  if (sourceGroups.includes(chatId)) {
    await supabase.from("messages").insert([
      {
        chat_id: chatId,
        message_id: msg.message_id,
        text: text
      }
    ]);
    return;
  }

  if (!queryGroups.includes(chatId)) return;

  // =======================
  // 🔍 查詢
  // =======================
  const { data, error } = await supabase
    .from("messages")
    .select("*")
    .ilike("text", `%${text}%`)
    .order("id", { ascending: false })
    .limit(20);

  if (error || !data || data.length === 0) {
    bot.sendMessage(chatId, "❌ 找不到相關資料");
    return;
  }

  // =======================
  // 🚫 去重（重點）
  // =======================
  const uniqueMap = {};
  const uniqueData = [];

  for (const row of data) {
    const title = getTitle(row.text);

    if (!uniqueMap[title]) {
      uniqueMap[title] = true;
      uniqueData.push(row);
    }
  }

  // =======================
  // 🔘 建按鈕（直接帶資料）
  // =======================
  const keyboard = uniqueData.map((row, i) => [{
    text: `${i + 1}. ${getTitle(row.text)}`,
    callback_data: JSON.stringify({
      c: row.chat_id,
      m: row.message_id
    })
  }]);

  bot.sendMessage(chatId, "👉 為您推薦相關：", {
    reply_markup: {
      inline_keyboard: keyboard
    }
  });
});

// =======================
// 👉 點擊按鈕（不會過期）
// =======================
bot.on("callback_query", async (query) => {
  try {
    const data = JSON.parse(query.data);

    await bot.copyMessage(
      query.message.chat.id,
      data.c,
      data.m
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

console.log("🔥 Supabase 客服系統（最終穩定版）已啟動");
