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
  polling: true
});

// ===== Render 保活
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

// ===== 暫存
const userCache = {};

// =======================
// 主邏輯
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // ===================
    // 📥 存資料（避免重複）
    // ===================
    if (sourceGroups.includes(chatId)) {
      const { data: exist } = await supabase
        .from("messages")
        .select("id")
        .eq("text", text)
        .limit(1);

      if (!exist || exist.length === 0) {
        await supabase.from("messages").insert([
          {
            chat_id: chatId,
            message_id: msg.message_id,
            text: text
          }
        ]);
      }
      return;
    }

    // ===================
    // 🔍 查詢
    // ===================
    if (!queryGroups.includes(chatId)) return;

    const keyword = text;

    const { data, error } = await supabase
      .from("messages")
      .select("chat_id, message_id, text")
      .ilike("text", `%${keyword}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (error || !data || data.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // ===================
    // 🔥 去重複（關鍵）
    // ===================
    const unique = [];
    const map = new Set();

    data.forEach(item => {
      if (!map.has(item.text)) {
        map.add(item.text);
        unique.push(item);
      }
    });

    // 存暫存
    userCache[chatId] = unique;

    // 建按鈕
    const keyboard = unique.map((row, i) => [{
      text: `${i + 1}. ${getTitle(row.text)}`,
      callback_data: `pick_${i}`
    }]);

    bot.sendMessage(chatId, "👉 請選擇：", {
      reply_markup: {
        inline_keyboard: keyboard
      }
    });

  } catch (err) {
    console.log("❌ message error:", err);
  }
});

// =======================
// 點擊按鈕
// =======================
bot.on("callback_query", async (query) => {
  try {
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

    // 👉 回原文（含超連結）
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
// 標題
// =======================
function getTitle(text) {
  if (!text) return "資料";
  return text.split("\n")[0].slice(0, 25);
}

console.log("🔥 Supabase 客服系統（最終版）已啟動");
