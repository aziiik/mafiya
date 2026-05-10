const { Bot, InlineKeyboard, GrammyError, HttpError } = require("grammy");
const GameManager = require("./gameManager");
const AdminManager = require("./adminManager");

const BOT_TOKEN = "8724276114:AAEEk6WlEtY91WJ-aaRaJlAGCFr8pAMrDEM";
const OWNER_ID = 8378615092;

const bot = new Bot(BOT_TOKEN);
const adminManager = new AdminManager(OWNER_ID);
const gameManager = new GameManager(bot, adminManager);

async function sendWelcome(ctx) {
  await ctx.reply(
    `Mafia Oyiniga Xush Kelibsiz!\n\n` +
    `Yangi oyin yaratish: /newgame\n\n` +
    `Qoidalar:\n` +
    `Mafiya - tunda odamlarni oldiradi\n` +
    `Doktor - tunda bitta odamni davolaydi\n` +
    `Detektiv - tunda bitta odamning rolini biladi\n` +
    `Xalq - kunduz ovoz beradi\n\n` +
    `Mafiya xalqdan kop bolsa - mafiya yutadi!\n` +
    `Barcha mafiyalar chiqarilsa - xalq yutadi!`
  );
}

bot.command("start", async (ctx) => {
  const args = ctx.match;
  if (args && args.startsWith("join_")) {
    const gameId = args.replace("join_", "");
    await gameManager.handleJoin(ctx, gameId);
    return;
  }

  const check = await adminManager.checkSubscription(bot, ctx.from.id);
  if (!check.ok) {
    const keyboard = new InlineKeyboard();
    for (const ch of check.channels) {
      keyboard.url(`➡️ @${ch.username} ga obuna boing`, `https://t.me/${ch.username}`).row();
    }
    keyboard.text("✅ Obuna boldim, tekshiring!", "check_subscription");
    await ctx.reply(
      `Botdan foydalanish uchun quyidagi kanallarga obuna boing:\n\nObuna bolgach tugmani bosing.`,
      { reply_markup: keyboard }
    );
    return;
  }

  await sendWelcome(ctx);
});

bot.command("newgame", async (ctx) => {
  const check = await adminManager.checkSubscription(bot, ctx.from.id);
  if (!check.ok) { await ctx.reply("Avval kanallarga obuna boling! /start"); return; }
  await gameManager.createGame(ctx);
});

bot.command("status", async (ctx) => {
  await gameManager.showStatus(ctx);
});

bot.command("help", async (ctx) => {
  await ctx.reply(`Mafia Bot\n\n/newgame - Yangi oyin\n/status - Oyin holati`);
});

bot.command("admin", async (ctx) => {
  if (!adminManager.isAdmin(ctx.from.id)) {
    await ctx.reply("Sizda ruxsat yoq!");
    return;
  }
  await adminManager.showAdminPanel(ctx);
});

bot.on("callback_query", async (ctx) => {
  const data = ctx.callbackQuery.data;

  if (data === "check_subscription") {
    const check = await adminManager.checkSubscription(bot, ctx.from.id);
    if (check.ok) {
      await ctx.answerCallbackQuery("Tasdiqlandi!");
      try { await ctx.deleteMessage(); } catch (e) {}
      await sendWelcome(ctx);
    } else {
      await ctx.answerCallbackQuery("Hali obuna bolmadingiz!", { show_alert: true });
    }
    return;
  }

  if (data.startsWith("admin_")) {
    await adminManager.handleCallback(ctx, bot);
    return;
  }

  await gameManager.handleCallback(ctx);
});

bot.on("message", async (ctx) => {
  const text = ctx.message?.text;

  if (text === "👥 Adminlar royxati") {
    await adminManager.handleKeyboard(ctx, "admin_list_admins");
  } else if (text === "➕ Admin qoshish") {
    await adminManager.handleKeyboard(ctx, "admin_add_admin");
  } else if (text === "➕ Support qoshish") {
    await adminManager.handleKeyboard(ctx, "admin_add_support");
  } else if (text === "➖ Support ochirish") {
    await adminManager.handleKeyboard(ctx, "admin_remove_support");
  } else if (text === "📋 Kanallar royxati") {
    await adminManager.handleKeyboard(ctx, "admin_list_channels");
  } else if (text === "➕ Kanal qoshish") {
    await adminManager.handleKeyboard(ctx, "admin_add_channel");
  } else if (text === "➖ Kanal ochirish") {
    await adminManager.handleKeyboard(ctx, "admin_remove_channel");
  } else {
    await adminManager.handleMessage(ctx);
  }
});

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Xato ${ctx.update.update_id}:`);
  const e = err.error;
  if (e instanceof GrammyError) console.error("Grammy xato:", e.description);
  else if (e instanceof HttpError) console.error("HTTP xato:", e);
  else console.error("Noaniq xato:", e);
});

bot.start({
  onStart: (botInfo) => {
    gameManager.botUsername = botInfo.username;
    console.log(`Mafia Bot @${botInfo.username} ishga tushdi!`);
  },
});