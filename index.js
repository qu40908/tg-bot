const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT（關閉自動 polling）
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

    // ===================
    // 📥 存資料（防重複）
    // ===================
    if (sourceGroups.includes(chatId)) {

      const { data: exists } = await supabase
        .from("messages")
        .select("id")
        .eq("chat_id", chatId)
        .eq("message_id", msg.message_id)
        .limit(1);

      if (exists && exists.length > 0) {
        console.log("⚠️ 已存在，跳過");
        return;
      }

      await supabase
        .from("messages")
        .insert([{
          chat_id: chatId,
          message_id: msg.message_id,
          text: text
        }]);

      console.log("✅ 已寫入:", text.slice(0, 20));
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
    // 🔥 過濾已被刪除訊息（同步清DB）
    // ===================
    const validData = [];

    for (const row of data) {
      try {
        // 嘗試複製訊息（存在才成功）
        await bot.copyMessage(chatId, row.chat_id, row.message_id);
        validData.push(row);
      } catch (err) {
        // ❌ 已刪 → 從DB移除
        await supabase
          .from("messages")
          .delete()
          .eq("chat_id", row.chat_id)
          .eq("message_id", row.message_id);

        console.log("🗑️ 已清除不存在資料");
      }
    }

    if (validData.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // ===================
    // 🔘 建按鈕
    // ===================
    const keyboard = validData.map((row, i) => [{
      text: `${i + 1}. ${getTitle(row.text)}`,
      callback_data: JSON.stringify({
        c: row.chat_id,
        m: row.message_id
      })
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
// 👉 點擊按鈕
// =======================
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
      // ❌ 已刪 → DB同步刪
      await supabase
        .from("messages")
        .delete()
        .eq("chat_id", data.c)
        .eq("message_id", data.m);

      await bot.answerCallbackQuery(query.id, {
        text: "❌ 原訊息已刪除，已同步清除",
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
// 🧠 標題處理
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

console.log("🔥 最終完整版（防重複 + 同步清理）已啟動");
