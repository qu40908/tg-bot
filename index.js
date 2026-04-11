const TelegramBot = require("node-telegram-bot-api");
const express = require("express");
const { createClient } = require("@supabase/supabase-js");

// =======================
// 🔥 保證只啟動一次
// =======================
if (global.botStarted) {
  console.log("⚠️ 已啟動過，略過");
  process.exit(0);
}
global.botStarted = true;

// =======================
// Supabase（你的正確）
// =======================
const supabase = createClient(
  "https://nduirhpjyrjrhxnypppj.supabase.co",
  "sb_publishable_EJPFZMVmzllECy3TfQU2zQ_0nOl_5iq"
);

// =======================
// BOT（單一來源）
// =======================
const bot = new TelegramBot(process.env.TOKEN);

// 👉 只用這個（不混用）
bot.startPolling();

// =======================
// Render 防休眠
// =======================
const app = express();
app.get("/", (req, res) => res.send("Bot is alive"));
app.listen(process.env.PORT || 3000);

// =======================
// 群組
// =======================
const sourceGroups = [
  -1003825428908,
  -1003877293059
];

const queryGroups = [
  -1003874245157
];

// =======================
// 📥 主邏輯（唯一）
// =======================
bot.on("message", async (msg) => {
  try {
    const chatId = msg.chat.id;
    const text = msg.text;

    if (!text) return;

    console.log("📩 收到:", text);

    // =======================
    // 📥 存資料
    // =======================
    if (sourceGroups.includes(chatId)) {

      const { error } = await supabase.from("messages").insert([
        {
          chat_id: chatId,
          message_id: msg.message_id,
          text
        }
      ]);

      if (error) {
        console.log("❌ 寫入錯誤:", error);
      }

      return;
    }

    // =======================
    // 🔍 查詢（只出按鈕）
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
    // 🖤 黑金低調（無符號）
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

    // ❗❗❗唯一回覆（沒有第二段）
    bot.sendMessage(
      chatId,
      "【📚推薦相關🔎】\n請選擇項目：",
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
    console.log("❌ callback error:", err);
  }
});

// =======================
function getTitle(text) {
  return text ? text.split("\n")[0].slice(0, 25) : "資料";
}

console.log("🔥 單一BOT・黑金版啟動");
