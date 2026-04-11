const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// ===== Supabase
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// ===== BOT
const bot = new TelegramBot(process.env.TOKEN);
bot.startPolling();

// ===== Render
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// ===== 群組
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

const queryGroups = [
  -1003874245157
];

// =======================
// 📥 主邏輯
// =======================
bot.on("message", async (msg) => {
  try {
    // ❗防止兩段式
    if (msg.from.is_bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    console.log("📩 收到:", text);

    // ===== 存資料
    if (sourceGroups.includes(chatId)) {
      await supabase.from("messages").insert([
        {
          chat_id: chatId,
          message_id: msg.message_id,
          text
        }
      ]);
      return;
    }

    // ===== 查詢
    if (!queryGroups.includes(chatId)) return;

    const { data } = await supabase
      .from("messages")
      .select("id, chat_id, message_id, text")
      .ilike("text", `%${text}%`)
      .order("id", { ascending: false })
      .limit(20);

    if (!data || data.length === 0) {
      bot.sendMessage(chatId, "❌ 查無資料");
      return;
    }

    // =======================
    // 🔥 查詢時驗證（完全同步）
    // =======================
    const valid = [];

    for (const row of data) {
      try {
        const sent = await bot.copyMessage(
          chatId,
          row.chat_id,
          row.message_id,
          { disable_notification: true }
        );

        // 👉 刪掉剛剛測試的訊息（避免出現）
        await bot.deleteMessage(chatId, sent.message_id);

        valid.push(row);

      } catch (err) {
        console.log("🧹 刪除無效資料:", row.id);

        await supabase
          .from("messages")
          .delete()
          .eq("id", row.id);
      }
    }

    if (valid.length === 0) {
      bot.sendMessage(chatId, "❌ 查無有效資料");
      return;
    }

    // =======================
    // 🔘 按鈕
    // =======================
    const keyboard = valid.map((row, i) => [
      {
        text: `${i + 1}. ${getTitle(row.text)}`,
        callback_data: JSON.stringify({
          c: row.chat_id,
          m: row.message_id
        })
      }
    ]);

    bot.sendMessage(
      chatId,
      "【📚推薦相關🔎】",
      {
        reply_markup: {
          inline_keyboard: keyboard
        }
      }
    );

  } catch (err) {
    console.log("❌ message error:", err);
  }
});

// =======================
// 👉 點擊顯示
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
    console.log("❌ 點擊失敗 → 清DB");

    const data = JSON.parse(query.data);

    await supabase
      .from("messages")
      .delete()
      .eq("chat_id", data.c)
      .eq("message_id", data.m);

    await bot.answerCallbackQuery(query.id, {
      text: "❌ 此資料已不存在",
      show_alert: true
    });
  }
});

// ===== 標題
function getTitle(text) {
  return text ? text.split("\n")[0].slice(0, 25) : "資料";
}

console.log("🔥 完全同步（查詢乾淨版）啟動");
