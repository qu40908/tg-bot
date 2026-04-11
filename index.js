const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT（避免409）
const bot = new TelegramBot(process.env.TOKEN, {
  polling: false
});

// 手動啟動
bot.startPolling({
  interval: 300,
  params: { timeout: 10 }
});

// ===== Render
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// ===== 群組
const sourceGroups = [-1003825428908, -1003877293059];
const queryGroups = [-1003874245157];

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
      await supabase.from("messages").insert([{
        chat_id: chatId,
        message_id: msg.message_id,
        text
      }]);
      return;
    }

    // =======================
    // 🔍 查詢
    // =======================
    if (!queryGroups.includes(chatId)) return;

    const { data } = await supabase
      .from("messages")
      .select("chat_id, message_id, text")
      .ilike("text", `%${text}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      bot.sendMessage(chatId, "❌ 查無資料");
      return;
    }

    // =======================
    // 🔥 過濾已刪訊息
    // =======================
    const valid = [];

    for (let row of data) {
      try {
        await bot.copyMessage(chatId, row.chat_id, row.message_id, {
          disable_notification: true
        });
        valid.push(row);
      } catch {}
    }

    if (valid.length === 0) {
      bot.sendMessage(chatId, "❌ 查無有效資料");
      return;
    }

    // =======================
    // 🖤 黑金風（低調版）
    // =======================
    const keyboard = valid.map((row, i) => [
      {
        text: `✨ ${i + 1}. ${getTitle(row.text)}`,
        callback_data: JSON.stringify({
          c: row.chat_id,
          m: row.message_id
        })
      }
    ]);

    // ❗❗重點：只發按鈕，不發內容
    bot.sendMessage(
      chatId,
      "🖤【Golden Secret】\n✨ 請選擇項目：",
      {
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );

  } catch (err) {
    console.log(err);
  }
});

// =======================
// 👉 點擊才顯示內容
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
    console.log(err);
  }
});

// =======================
function getTitle(text) {
  return text ? text.split("\n")[0].slice(0, 25) : "資料";
}

console.log("🔥 黑金客服系統啟動");
