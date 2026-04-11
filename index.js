const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT
const bot = new TelegramBot(process.env.TOKEN, {
  polling: false
});

// ===== Render 防 timeout
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// =======================
// 👉 群組設定
// =======================
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

const queryGroups = [
  -1003874245157
];

// =======================
// 📥 存資料 + 查詢
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // 👉 存資料
    if (sourceGroups.includes(chatId)) {

      await supabase
        .from("messages")
        .insert([{
          chat_id: chatId,
          message_id: msg.message_id,
          text: text
        }]);

      return;
    }

    // 👉 查詢
    if (!queryGroups.includes(chatId)) return;

    const { data } = await supabase
      .from("messages")
      .select("chat_id, message_id, text")
      .ilike("text", `%${text}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    const keyboard = data.map((row, i) => [{
      text: `${i + 1}. ${getTitle(row.text)}`,
      callback_data: JSON.stringify({
        c: row.chat_id,
        m: row.message_id
      })
    }]);

    bot.sendMessage(chatId, "👉 推薦相關：", {
      reply_markup: { inline_keyboard: keyboard }
    });

  } catch (err) {
    console.log("❌ message error:", err);
  }
});

// =======================
// ❗同步刪除（核心功能）
// =======================
bot.on("message", async (msg) => {
  try {
    // 👉 偵測刪除事件
    if (!msg.delete_chat_photo && !msg.group_chat_created && !msg.supergroup_chat_created) {
      
      // Telegram「刪除訊息」事件（關鍵）
      if (msg.left_chat_member || msg.pinned_message) return;
    }

  } catch (err) {}
});

// =======================
// 🔥 正確抓刪除（重點）
// =======================
// ⚠️ Telegram沒有直接 delete 事件
// 👉 用這個 workaround：檢查 copy 失敗 → 刪DB

bot.on("callback_query", async (query) => {
  try {
    const data = JSON.parse(query.data);

    try {
      await bot.copyMessage(
        query.message.chat.id,
        data.c,
        data.m
      );
    } catch (err) {
      // 👉 如果原訊息已被刪 → 同步刪DB
      await supabase
        .from("messages")
        .delete()
        .eq("chat_id", data.c)
        .eq("message_id", data.m);

      await bot.answerCallbackQuery(query.id, {
        text: "❌ 原訊息已被刪除，已同步清除",
        show_alert: true
      });

      return;
    }

    await bot.answerCallbackQuery(query.id);

  } catch (err) {
    console.log("❌ callback error:", err);
  }
});

// =======================
// 🧠 標題
// =======================
function getTitle(text) {
  if (!text) return "資料";
  return text.split("\n")[0].slice(0, 25);
}

// =======================
// 🚀 單例 polling（防409）
// =======================
if (!global.botStarted) {
  global.botStarted = true;

  bot.startPolling({
    interval: 300,
    params: { timeout: 10 }
  });

  console.log("✅ polling 已啟動（單例）");
}

console.log("🔥 客服系統（同步刪除版）已啟動");
