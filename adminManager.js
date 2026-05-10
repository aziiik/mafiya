const { InlineKeyboard, Keyboard } = require("grammy");

class AdminManager {
  constructor(ownerId) {
    this.ownerId = ownerId;
    this.admins = new Set([ownerId]);
    this.supports = new Set();
    this.channels = [];
    this.waitingInput = new Map();
  }

  isOwner(userId) { return userId === this.ownerId; }
  isAdmin(userId) { return this.admins.has(userId) || this.supports.has(userId); }
  isSupport(userId) { return this.supports.has(userId); }

  async showAdminPanel(ctx) {
    const keyboard = new Keyboard()
      .text("👥 Adminlar royxati").text("➕ Admin qoshish").row()
      .text("➕ Support qoshish").text("➖ Support ochirish").row()
      .text("📋 Kanallar royxati").row()
      .text("➕ Kanal qoshish").text("➖ Kanal ochirish").row()
      .resized();
    await ctx.reply(`⚙️ Admin panel:`, { reply_markup: keyboard });
  }

  async handleKeyboard(ctx, action) {
    if (!this.isAdmin(ctx.from.id)) {
      await ctx.reply("Ruxsat yoq!");
      return;
    }
    const userId = ctx.from.id;

    if (action === "admin_list_admins") {
      let msg = `👥 Adminlar:\n`;
      for (const id of this.admins) {
        msg += `- ID: ${id}${id === this.ownerId ? " (Egasi)" : ""}\n`;
      }
      msg += `\nSupportlar:\n`;
      if (this.supports.size === 0) msg += `- Yoq\n`;
      for (const id of this.supports) msg += `- ID: ${id}\n`;
      await ctx.reply(msg);

    } else if (action === "admin_add_admin") {
      this.waitingInput.set(userId, "add_admin");
      await ctx.reply(`Admin ID sini yuboring:\n(IDni bilish uchun @userinfobot ga yozing)`);

    } else if (action === "admin_add_support") {
      if (!this.isOwner(userId)) { await ctx.reply("Faqat egasi support qosha oladi!"); return; }
      this.waitingInput.set(userId, "add_support");
      await ctx.reply(`Support ID sini yuboring:`);

    } else if (action === "admin_remove_support") {
      if (!this.isOwner(userId)) { await ctx.reply("Faqat egasi support ochira oladi!"); return; }
      if (this.supports.size === 0) { await ctx.reply("Supportlar yoq."); return; }
      const keyboard = new InlineKeyboard();
      for (const id of this.supports) keyboard.text(`ID: ${id}`, `admin_del_support_${id}`).row();
      await ctx.reply("Qaysi supportni ochirish?", { reply_markup: keyboard });

    } else if (action === "admin_list_channels") {
      if (this.channels.length === 0) { await ctx.reply("Majburiy kanallar yoq."); return; }
      let msg = `📋 Kanallar:\n`;
      this.channels.forEach((ch, i) => { msg += `${i + 1}. @${ch.username}\n`; });
      await ctx.reply(msg);

    } else if (action === "admin_add_channel") {
      this.waitingInput.set(userId, "add_channel");
      await ctx.reply(`Kanal username ini yuboring:\n(masalan: @mykanalim)`);

    } else if (action === "admin_remove_channel") {
      if (this.channels.length === 0) { await ctx.reply("Kanallar yoq."); return; }
      const keyboard = new InlineKeyboard();
      this.channels.forEach((ch, i) => keyboard.text(`@${ch.username}`, `admin_del_channel_${i}`).row());
      await ctx.reply("Qaysi kanalni ochirish?", { reply_markup: keyboard });
    }
  }

  async handleCallback(ctx, bot) {
    const data = ctx.callbackQuery.data;
    const userId = ctx.from.id;

    if (!this.isAdmin(userId)) {
      await ctx.answerCallbackQuery("Ruxsat yoq!");
      return;
    }
    await ctx.answerCallbackQuery();

    if (data.startsWith("admin_del_support_") && this.isOwner(userId)) {
      const id = parseInt(data.replace("admin_del_support_", ""));
      this.supports.delete(id);
      await ctx.reply(`Support ${id} ochirildi.`);

    } else if (data.startsWith("admin_del_channel_")) {
      const index = parseInt(data.replace("admin_del_channel_", ""));
      const removed = this.channels.splice(index, 1);
      await ctx.reply(`@${removed[0]?.username} kanali ochirildi.`);
    }
  }

  async handleMessage(ctx) {
    const userId = ctx.from.id;
    if (!this.waitingInput.has(userId)) return;

    const action = this.waitingInput.get(userId);
    const text = ctx.message?.text?.trim();
    if (!text) return;

    this.waitingInput.delete(userId);

    if (action === "add_admin") {
      const id = parseInt(text);
      if (isNaN(id)) { await ctx.reply("Notogri ID!"); return; }
      this.admins.add(id);
      await ctx.reply(`✅ ${id} admin qilindi!`);

    } else if (action === "add_support") {
      const id = parseInt(text);
      if (isNaN(id)) { await ctx.reply("Notogri ID!"); return; }
      this.supports.add(id);
      await ctx.reply(`✅ ${id} support qilindi!`);

    } else if (action === "add_channel") {
      const username = text.replace("@", "").trim();
      if (!username) { await ctx.reply("Notogri username!"); return; }
      this.channels.push({ username, title: username });
      await ctx.reply(`✅ @${username} kanali qoshildi!\n\nEslatma: Bot kanalda admin bolishi kerak!`);
    }
  }

  async checkSubscription(bot, userId) {
    if (this.channels.length === 0) return { ok: true };
    const notSubscribed = [];
    for (const ch of this.channels) {
      try {
        const member = await bot.api.getChatMember(`@${ch.username}`, userId);
        const ok = ["member", "administrator", "creator"].includes(member.status);
        if (!ok) notSubscribed.push(ch);
      } catch (e) {
        notSubscribed.push(ch);
      }
    }
    return { ok: notSubscribed.length === 0, channels: notSubscribed };
  }
}

module.exports = AdminManager;