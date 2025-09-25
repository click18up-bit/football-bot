require("dotenv").config();
const express = require("express");
const mongoose = require("mongoose");
const TelegramBot = require("node-telegram-bot-api");
const axios = require("axios");
const cron = require("node-cron");
const { createCanvas, registerFont, loadImage } = require("canvas");

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

// ====== REGISTER FONT ======
try {
  registerFont("./fonts/Arial.ttf", { family: "Arial" });
} catch (e) {
  console.warn("⚠️ ใช้ default font แทน Arial");
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
    leagueLogo: m.league.logo,
    date: m.fixture.date,
    timeTH: new Date(m.fixture.date).toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" }),
    timeLA: new Date(m.fixture.date).toLocaleTimeString("lo-LA", { hour: "2-digit", minute: "2-digit" }),
    home: m.teams.home.name,
    away: m.teams.away.name,
    score: m.score.fulltime.home != null ? `${m.score.fulltime.home} - ${m.score.fulltime.away}` : null,
  }));
}

// ====== IMAGE GENERATOR (แดง-ดำ-ทอง + โลโก้ลีกกรอบทอง + เนื้อหากลาง + กรอบทองรอบรูป) ======
async function drawCard({ matches, title, locale = "th-TH" }) {
  const leagues = {};
  matches.forEach(m => {
    if (!leagues[m.league]) leagues[m.league] = [];
    leagues[m.league].push(m);
  });

  const leagueCount = Object.keys(leagues).length;
  const rows = matches.length + leagueCount;
  const WIDTH = 1000;
  const HEIGHT = Math.max(600, 240 + rows * 80);

  const canvas = createCanvas(WIDTH, HEIGHT);
  const ctx = canvas.getContext("2d");

  // Background: แดง-ดำ-ทอง
  const grad = ctx.createLinearGradient(0, 0, WIDTH, HEIGHT);
  grad.addColorStop(0, "#000000");
  grad.addColorStop(0.5, "#8B0000");
  grad.addColorStop(1, "#FFD700");
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);

  // Header
  ctx.fillStyle = "rgba(0,0,0,0.6)";
  ctx.fillRect(0, 0, WIDTH, 120);

  ctx.textAlign = "center";
  ctx.font = "bold 56px Arial";
  ctx.fillStyle = "#FFD700";
  ctx.shadowColor = "black";
  ctx.shadowBlur = 6;
  ctx.fillText(title, WIDTH / 2, 75);
  ctx.shadowBlur = 0;

  const dateLabel = new Date().toLocaleDateString(locale, { day: "2-digit", month: "short", year: "numeric" });
  ctx.textAlign = "right";
  ctx.font = "26px Arial";
  ctx.fillStyle = "#FFF8DC";
  ctx.fillText(dateLabel, WIDTH - 30, 38);

  ctx.textAlign = "center";

  // ✅ คำนวณ Y ให้อยู่กลางเป๊ะ
  const contentHeight = rows * 80;
  let y = (HEIGHT - contentHeight) / 2 + 120;

  for (const league of Object.keys(leagues)) {
    const anyMatch = leagues[league][0];
    try {
      if (anyMatch.leagueLogo) {
        const logo = await loadImage(anyMatch.leagueLogo);
        const x = WIDTH/2 - 260;
        const size = 50;

        // วงกลมทองรอบโลโก้ลีก
        ctx.beginPath();
        ctx.arc(x + size/2, y - 20, size/2 + 6, 0, Math.PI * 2);
        ctx.fillStyle = "#FFD700";
        ctx.fill();

        ctx.save();
        ctx.beginPath();
        ctx.arc(x + size/2, y - 20, size/2, 0, Math.PI * 2);
        ctx.clip();
        ctx.drawImage(logo, x, y - 20 - size/2, size, size);
        ctx.restore();
      }
    } catch (e) {
      console.warn("⚠️ โหลดโลโก้ลีกไม่ได้:", league);
    }

    ctx.font = "bold 36px Arial";
    ctx.fillStyle = "#FFD700";
    ctx.fillText(league, WIDTH / 2 + 50, y);
    y += 60;

    for (const m of leagues[league]) {
      ctx.font = "bold 34px Arial";
      ctx.strokeStyle = "#8B0000";
      ctx.lineWidth = 3;
      const time = locale === "lo-LA" ? m.timeLA : m.timeTH;
      const scoreText = m.score ? ` (${m.score})` : "";

      const text = `${time}   ${m.home}   vs   ${m.away}${scoreText}`;
      ctx.strokeText(text, WIDTH / 2, y);
      ctx.fillStyle = "#FFFFFF";
      ctx.fillText(text, WIDTH / 2, y);

      ctx.strokeStyle = "rgba(200,0,0,0.3)";
      ctx.beginPath(); ctx.moveTo(120, y + 14); ctx.lineTo(WIDTH - 120, y + 14); ctx.stroke();

      y += 70;
    }
  }

  // ✅ เส้นขอบทองรอบกรอบภาพ
  ctx.lineWidth = 12;
  ctx.strokeStyle = "#FFD700";
  ctx.strokeRect(6, 6, WIDTH - 12, HEIGHT - 12);

  return canvas.toBuffer("image/png");
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

    const buffer = await drawCard({ matches, title, locale });

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

    await bot.sendPhoto(chatId, buffer, {
      caption: title,
      reply_markup: isLao ? laoKeyboard : thaiKeyboard,
    });
  } catch (err) {
    console.error("❌ Send image error:", err.response?.data || err.message || err);
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

bot.onText(/\/result|\/yesterday/i, async (msg) => {
  await Promise.all([
    sendBigImageTo(THAI_CHANNEL_ID, "yesterday"),
    sendBigImageTo(LAO_GROUP_ID, "yesterday"),
  ]);
  await bot.sendMessage(msg.chat.id, "✅ ส่งผลเข้า Channel (ไทย) และ Group (ลาว) แล้ว");
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
