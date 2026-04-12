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

// ===== 群組設定
// 👉 原本資料群（只留一個）
const sourceGroups = [
  -1003877293059
];

// 👉 公告頻道（新加）
const announceChannel = -1003875238311;

// 👉 查詢群
const queryGroups = [
  -1003874245157
];

// =======================
// 📢 公告頻道（Channel）存資料
// =======================
bot.on("channel_post", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;
    if (chatId !== announceChannel) return;

    console.log("📢 公告來源:", chatId, text);

    await supabase.from("messages").insert([
      {
        chat_id: chatId,
        message_id: msg.message_id,
        text
      }
    ]);

  } catch (err) {
    console.log("❌ channel error:", err);
  }
});

// =======================
// 📥 一般群組
// =======================
bot.on("message", async (msg) => {
  try {
    if (msg.from.is_bot) return;

    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    console.log("📩 來源群:", chatId, text);

    // ===== 存資料（一般資料群）
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
    // 🔥 查詢同步驗證（核心）
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

        // 👉 立刻刪掉測試訊息（不顯示內容）
        await bot.deleteMessage(chatId, sent.message_id);

        valid.push(row);

      } catch (err) {
        console.log("🧹 清除失效資料:", row.id);

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
    // 🔘 單一回覆（不兩段式）
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

    await bot.sendMessage(
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
// 👉 點擊顯示內容
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
    console.log("❌ 點擊失敗 → 自動清DB");

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

console.log("🔥 公告頻道 + 完全同步 查詢系統 啟動");
