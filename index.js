const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// =======================
// ✅ Supabase
// =======================
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// =======================
// ✅ BOT（防409）
// =======================
const bot = new TelegramBot(process.env.TOKEN, {
  polling: false
});

bot.startPolling({
  interval: 300,
  params: { timeout: 10 }
});

// =======================
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// =======================
const startTime = Date.now();

// =======================
// 👉 群組
// =======================
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

const queryGroups = [
  -1003874245157
];

// =======================
// 📥 存資料
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    if (sourceGroups.includes(chatId)) {

      if (msg.date * 1000 < startTime) return;

      const { data: exists } = await supabase
        .from("messages")
        .select("id")
        .eq("message_id", msg.message_id)
        .maybeSingle();

      if (exists) return;

      await supabase.from("messages").insert([
        {
          chat_id: chatId,
          message_id: msg.message_id,
          text: text
        }
      ]);

      console.log("✅ 已寫入:", text.slice(0, 20));
      return;
    }

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

    // =======================
    // 🔥 查詢時過濾壞資料
    // =======================
    const validResults = [];

    for (let row of data) {
      try {
        // 👉 嘗試「靜默驗證」
        await bot.copyMessage(chatId, row.chat_id, row.message_id, {
          disable_notification: true
        });

        validResults.push(row);

      } catch (err) {
        console.log("🗑 自動清理壞資料:", row.message_id);

        await supabase
          .from("messages")
          .delete()
          .eq("message_id", row.message_id);
      }

      if (validResults.length >= 10) break;
    }

    if (validResults.length === 0) {
      bot.sendMessage(chatId, "❌ 找不到相關資料");
      return;
    }

    // =======================
    // 🔘 建按鈕
    // =======================
    const keyboard = validResults.map((row, i) => [
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
// 👉 點擊
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
function getTitle(text) {
  if (!text) return "資料";
  return text.split("\n")[0].slice(0, 25);
}

console.log("🔥 客服系統（過濾同步版）已啟動");
