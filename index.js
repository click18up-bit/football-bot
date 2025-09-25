require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cron = require("node-cron");

const app = express();
const PORT = process.env.PORT || 3000;

// ====== ENV / CONFIG ======
const BOT_TOKEN = process.env.BOT_TOKEN;
const FOOTBALL_API_KEY = process.env.FOOTBALL_API_KEY;
const MONGO_URI = process.env.MONGO_URI;
const THAI_CHANNEL_ID = process.env.THAI_CHANNEL_ID;
const LAO_GROUP_ID = process.env.LAO_GROUP_ID;

// ====== CONNECT DB ======
mongoose
  .connect(MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
  .then(() => console.log("✅ MongoDB Connected"))
  .catch((err) => console.error("❌ MongoDB Error:", err));

// ====== TELEGRAM BOT ======
const bot = new TelegramBot(BOT_TOKEN, { polling: true });

// ====== CONSTS ======
const BIG_LEAGUES = [
  "UEFA Champions League",
  "UEFA Europa League",
  "UEFA Europa Conference League",
  "Premier League",
  "La Liga",
  "Serie A",
  "Bundesliga",
  "Ligue 1",
];

const BIG_TEAMS = [
  "Manchester United","Manchester City","Arsenal","Chelsea","Liverpool","Tottenham",
  "Real Madrid","Barcelona","Atletico Madrid",
  "Bayern Munich","Borussia Dortmund",
  "Paris Saint Germain",
  "Juventus","Inter","AC Milan"
];

// ====== HELPERS ======
function toISODate(offsetDays = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().split("T")[0];
}
function leagueWeight(name) {
  const order = [
    "UEFA Champions League","UEFA Europa League","UEFA Europa Conference League",
    "Premier League","La Liga","Serie A","Bundesliga","Ligue 1"
  ];
  const i = order.indexOf(name);
  return i === -1 ? 999 : i;
}
function matchWeight(m) {
  const homeBig = BIG_TEAMS.includes(m.teams.home.name);
  const awayBig = BIG_TEAMS.includes(m.teams.away.name);
  if (homeBig && awayBig) return 0;
  if (homeBig || awayBig) return 1;
  return 2;
}

// ====== FETCH FROM API ======
async function fetchBigMatches(dateISO) {
  const res = await axios.get(
    `https://v3.football.api-sports.io/fixtures?date=${dateISO}`,
    { headers: { "x-apisports-key": FOOTBALL_API_KEY } }
  );

  const all = res.data?.response || [];
  const filtered = all.filter(m => BIG_LEAGUES.includes(m.league.name));

  const sorted = [...filtered].sort((a, b) => {
    const mw = matchWeight(a) - matchWeight(b);
    if (mw !== 0) return mw;
    const lw = leagueWeight(a.league.name) - leagueWeight(b.league.name);
    if (lw !== 0) return lw;
    return new Date(a.fixture.date) - new Date(b.fixture.date);
  });

  const top = sorted.slice(0, 5);

  return top.map(m => ({
    league: m.league.name,
    date: m.fixture.date,
    timeTH: new Date(m.fixture.date).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    timeLA: new Date(m.fixture.date).toLocaleTimeString("lo-LA", { hour: "2-digit", minute: "2-digit" }),
    home: m.teams.home.name,
    away: m.teams.away.name,
    score: m.score.fulltime.home != null ? `${m.score.fulltime.home} - ${m.score.fulltime.away}` : null,
  }));
}

// ====== TEXT GENERATOR (with Header + Footer) ======
async function drawCard({ matches, title, locale = "th-TH" }) {
  // 👉 Brand Header
  const brandHeader = locale === "th-TH" ? "✨ Mvphero777 ✨" : "✨ Winlaos168 ✨";

  let text = `${brandHeader}\n${title}\n\n`;

  for (const m of matches) {
    const time = locale === "lo-LA" ? m.timeLA : m.timeTH;
    const scoreText = m.score ? ` (${m.score})` : "";
    text += `⚽️ *${m.league}*\n`;
    text += `⏰ ${time}\n`;
    text += `${m.home} vs ${m.away}${scoreText}\n\n`;
  }

  // 👉 Footer Promo
  if (locale === "th-TH") {
    text += "🟢 Mvphero777 ค่าน้ำดีที่สุด มีครบ จบทุกลีก 🏧 ฝาก-ถอน รวดเร็วทันใจ";
  } else {
    text += "🟢 Winlaos168  ✔️ໂປຣລູກຄ້າໃໝ່ 🏧  ຮ້ານເຮົາມີຄົບທຸກຢ່າງທີ່ຕ້ອງການ 📲";
  }

  return text; 
}

// ====== SENDER ======
async function sendBigImageTo(chatId, type = "today") {
  try {
    const isLao = String(chatId) === String(LAO_GROUP_ID);
    const locale = isLao ? "lo-LA" : "th-TH";
    const dateISO = type === "today" ? toISODate(0) : toISODate(-1);

    const title =
      type === "today"
        ? (isLao ? "🔥 ໂປຣແກຣມ Big Match ມື້ນີ້ 🔥" : "🔥 โปรแกรม Big Match วันนี้ 🔥")
        : (isLao ? "✅ ຜົນ Big Match ມື້ວານ ✅" : "✅ ผลบอล Big Match เมื่อคืน ✅");

    const matches = await fetchBigMatches(dateISO);
    if (matches.length === 0) {
      return bot.sendMessage(chatId, isLao ? "❌ ມື້ນີ້ບໍ່ມີ Big Match" : "❌ วันนี้ไม่มี Big Match ครับ");
    }

    const message = await drawCard({ matches, title, locale });

    const thaiKeyboard = {
      inline_keyboard: [
        [
          { text: "🟢 สมัครเลย", url: "https://bit.ly/4h50mQV" },
          { text: "📞 ติดต่อแอดมิน", url: "https://bit.ly/40Wq98w" }
        ],
        [{ text: "📲 ทางเข้าเว็บ", url: "https://bit.ly/4fQ8Dac" }]
      ]
    };
    const laoKeyboard = {
      inline_keyboard: [
        [
          { text: "💬 Fb Messenger", url: "https://m.me/262413013632590" },
          { text: "💚 Line", url: "https://line.me/ti/p/@winlaos168" }
        ],
        [{ text: "📱 ສະໝັກ", url: "https://wa.me/8562076355496" }]
      ]
    };

    await bot.sendMessage(chatId, message, {
      parse_mode: "Markdown",
      reply_markup: isLao ? laoKeyboard : thaiKeyboard,
    });
  } catch (err) {
    console.error("❌ Send text error:", err.message);
    await bot.sendMessage(chatId, "❌ ไม่สามารถดึงข้อมูลได้");
  }
}

// ====== COMMANDS ======
bot.onText(/\/start/, (msg) => bot.sendMessage(msg.chat.id, "สวัสดีครับ! ⚽️ Football Bot พร้อมทำงานแล้ว"));

bot.onText(/\/bigmatch|\/today/i, async (msg) => {
  await Promise.all([
    sendBigImageTo(THAI_CHANNEL_ID, "today"),
    sendBigImageTo(LAO_GROUP_ID, "today"),
  ]);
  await bot.sendMessage(msg.chat.id, "✅ ส่งเข้า Channel (ไทย) และ Group (ลาว) แล้ว");
});

bot.onText(/\/(result|yesterday)(@\w+)?\b/i, async (msg) => {
  console.log("🔥 trigger result/yesterday:", msg.text);
  await Promise.all([
    sendBigImageTo(THAI_CHANNEL_ID, "yesterday"),
    sendBigImageTo(LAO_GROUP_ID, "yesterday")
  ]);

  await bot.sendMessage(msg.chat.id, "✅ ส่งผล Big Match เมื่อคืน เข้า Channel (ไทย) และ Group (ลาว) แล้วครับ");
});

// ====== CRON ======
cron.schedule("0 16 * * *", async () => {
  console.log("⏰ 16:00 Broadcast Big Match Today (Asia/Bangkok)");
  await sendBigImageTo(THAI_CHANNEL_ID, "today");
  await sendBigImageTo(LAO_GROUP_ID, "today");
}, { timezone: "Asia/Bangkok" });

cron.schedule("0 8 * * *", async () => {
  console.log("⏰ 08:00 Broadcast Big Match Results (Asia/Bangkok)");
  await sendBigImageTo(THAI_CHANNEL_ID, "yesterday");
  await sendBigImageTo(LAO_GROUP_ID, "yesterday");
}, { timezone: "Asia/Bangkok" });

// ====== EXPRESS KEEP ALIVE ======
app.get("/", (_, res) => res.send("Football Bot is running ✅"));
app.listen(PORT, () => console.log(`🚀 Server running on port ${PORT}`));
