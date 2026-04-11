const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase（你給的正確版）
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT（關鍵：先關 polling）
const bot = new TelegramBot(process.env.TOKEN, {
  polling: false
});

// ===== Render 防 timeout
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// 👉 手動啟動 polling（避免 409）
bot.startPolling({
  interval: 300,
  params: {
    timeout: 10
  }
});

// =======================
// 👉 群組設定
// =======================

// 📌 存資料群
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

// 📌 查詢群
const queryGroups = [
  -1003874245157
];

// =======================
// 📥 主邏輯
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // =======================
    // 📥 存資料
    // =======================
    if (sourceGroups.includes(chatId)) {

      const { error } = await supabase
        .from("messages")
        .insert([
          {
            chat_id: chatId,
            message_id: msg.message_id,
            text: text
          }
        ]);

      if (error) {
        console.log("❌ 寫入失敗:", error);
      } else {
        console.log("✅ 已寫入:", text.slice(0, 20));
      }

      return;
    }

    // =======================
    // 🔍 查詢（只顯示按鈕）
    // =======================
    if (!queryGroups.includes(chatId)) return;

    const { data, error } = await supabase
      .from("messages")
      .select("chat_id, message_id, text")
      .ilike("text", `%${text}%`)
      .order("id", { ascending: false })
      .limit(30);

    if (error || !data || data.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // =======================
    // 🔥 過濾「已被刪除的訊息」
    // =======================
    const validData = [];

    for (let row of data) {
      try {
        // 用 copy 測試是否存在（不會真的發送）
        await bot.copyMessage(
          chatId,
          row.chat_id,
          row.message_id,
          { disable_notification: true }
        );

        validData.push(row);

      } catch (err) {
        // ❌ 被刪除就跳過
      }
    }

    if (validData.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // =======================
    // 🔘 只顯示按鈕（不洗版）
    // =======================
    const keyboard = validData.map((row, i) => [
      {
        text: `${i + 1}. ${getTitle(row.text)}`,
        callback_data: JSON.stringify({
          c: row.chat_id,
          m: row.message_id
        })
      }
    ]);

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
// 👉 點擊按鈕（顯示內容）
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
// 🧠 標題（第一行）
// =======================
function getTitle(text) {
  if (!text) return "資料";
  return text.split("\n")[0].slice(0, 25);
}

console.log("🔥 客服系統（最終完整版）已啟動");
