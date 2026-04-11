const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// =======================
// ✅ Supabase（你的正確URL）
// =======================
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// =======================
// ✅ BOT（防409衝突）
// =======================
const bot = new TelegramBot(process.env.TOKEN, {
  polling: false
});

// 👉 手動啟動 polling（只會一個實例）
bot.startPolling({
  interval: 300,
  params: {
    timeout: 10
  }
});

// =======================
// ✅ Render 防 timeout
// =======================
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// =======================
// ✅ 啟動時間（防舊訊息復活）
// =======================
const startTime = Date.now();

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
// 📥 存資料
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    // ===================
    // 📥 存資料群
    // ===================
    if (sourceGroups.includes(chatId)) {

      // ❗防舊訊息復活
      if (msg.date * 1000 < startTime) return;

      // ❗防重複
      const { data: exists } = await supabase
        .from("messages")
        .select("id")
        .eq("message_id", msg.message_id)
        .maybeSingle();

      if (exists) return;

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

    // ===================
    // 🔍 查詢群
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
    // 🔘 建按鈕
    // ===================
    const keyboard = data.map((row, i) => [
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
// 🔥 同步核心（自動清掉被刪訊息）
// =======================
bot.on("callback_query", async (query) => {
  try {
    const data = JSON.parse(query.data);
    const chatId = query.message.chat.id;

    try {
      // 👉 嘗試轉發
      await bot.copyMessage(chatId, data.c, data.m);

    } catch (err) {

      console.log("❌ 訊息不存在 → 刪除DB:", data.m);

      // 👉 自動刪掉資料庫紀錄
      await supabase
        .from("messages")
        .delete()
        .eq("message_id", data.m);

      await bot.answerCallbackQuery(query.id, {
        text: "❌ 此資料已被刪除",
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

console.log("🔥 客服系統（完全同步版）已啟動");
