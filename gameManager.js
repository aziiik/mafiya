const { InlineKeyboard } = require("grammy");
const { Game, STATE, ROLE, ROLE_EMOJI } = require("./game");

class GameManager {
  constructor(bot, adminManager) {
    this.bot = bot;
    this.adminManager = adminManager;
    this.botUsername = "MafiaGameBot";
    this.games = new Map();
    this.playerGame = new Map();
  }

  generateGameId() {
    return Math.random().toString(36).substring(2, 8).toUpperCase();
  }

  getBotUsername() { return this.botUsername; }

  async sendToAll(game, text, extra = {}) {
    for (const player of game.players.values()) {
      try {
        await this.bot.api.sendMessage(player.chatId, text, extra);
      } catch (e) { console.error(`Send error ${player.name}:`, e.message); }
    }
  }

  async sendToAllAlive(game, text, extra = {}) {
    for (const player of game.alivePlayers()) {
      try {
        await this.bot.api.sendMessage(player.chatId, text, extra);
      } catch (e) { console.error(`Send error ${player.name}:`, e.message); }
    }
  }

  async sendToPlayer(player, text, extra = {}) {
    try {
      await this.bot.api.sendMessage(player.chatId, text, extra);
    } catch (e) { console.error(`Send error ${player.name}:`, e.message); }
  }

  async createGame(ctx) {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || "Noaniq";

    if (this.playerGame.has(userId)) {
      const oldGameId = this.playerGame.get(userId);
      const oldGame = this.games.get(oldGameId);
      if (oldGame) {
        for (const pid of oldGame.players.keys()) this.playerGame.delete(pid);
        this.games.delete(oldGameId);
      }
    }

    const gameId = this.generateGameId();
    const game = new Game(gameId, userId, userName, ctx.chat.id);
    game.addPlayer(userId, userName, ctx.chat.id);
    game.state = STATE.SETUP;

    this.games.set(gameId, game);
    this.playerGame.set(userId, gameId);

    await this.showSetupMenu(ctx, game);
  }

  async showSetupMenu(ctx, game, editMessageId = null) {
    const joinLink = `https://t.me/${this.getBotUsername()}?start=join_${game.gameId}`;

    const playerList = [...game.players.values()]
      .map((p, i) => `${i + 1}. ${p.name}`)
      .join("\n");

    const text =
      `🎭 MAFIYA OYINI\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🆔 Kod: ${game.gameId}\n\n` +
      `👥 Oyinchilar (${game.players.size}):\n` +
      playerList +
      `\n\n⚙️ Rollar:\n` +
      `🔴 Mafiya: ${game.mafiaCount}\n` +
      `💚 Doktor: ${game.doctorCount}${game.doctorCount === 0 ? " (yoq)" : ""}\n` +
      `🔵 Detektiv: ${game.detectiveCount}${game.detectiveCount === 0 ? " (yoq)" : ""}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🔗 Havola:\n${joinLink}`;

    const keyboard = new InlineKeyboard()
      .text("🔴 Mafiya: " + game.mafiaCount, `setup_mafia_${game.gameId}`)
      .text("💚 Doktor: " + game.doctorCount, `setup_doctor_${game.gameId}`)
      .row()
      .text("🔵 Detektiv: " + game.detectiveCount, `setup_detective_${game.gameId}`)
      .row()
      .text("🚀 OYINNI BOSHLASH", `start_game_${game.gameId}`);

    if (editMessageId) {
      try {
        await this.bot.api.editMessageText(
          ctx.chat?.id || game.chatId, editMessageId, text,
          { reply_markup: keyboard }
        );
      } catch (e) { console.error("Edit error:", e.message); }
    } else {
      const msg = await ctx.reply(text, { reply_markup: keyboard });
      game.setupMessageId = msg.message_id;
    }
  }

  async handleJoin(ctx, gameId) {
    const userId = ctx.from.id;
    const userName = ctx.from.first_name || ctx.from.username || "Noaniq";
    const game = this.games.get(gameId);

    if (!game) { await ctx.reply("❌ Bu oyin topilmadi."); return; }
    if (game.state !== STATE.SETUP && game.state !== STATE.WAITING) {
      await ctx.reply("❌ Bu oyin allaqachon boshlangan!"); return;
    }
    if (game.players.has(userId)) {
      await ctx.reply("✅ Siz allaqachon bu oyindasiz!"); return;
    }
    if (this.playerGame.has(userId)) {
      const otherGame = this.games.get(this.playerGame.get(userId));
      if (otherGame && otherGame.state !== STATE.FINISHED) {
        await ctx.reply("❌ Siz boshqa oyinda qatnashyapsiz!"); return;
      }
    }

    game.addPlayer(userId, userName, ctx.chat.id);
    this.playerGame.set(userId, gameId);

    await ctx.reply(
      `✅ QOSHILDINGIZ!\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🆔 Oyin: ${gameId}\n` +
      `👥 Oyinchilar: ${game.players.size}\n` +
      `━━━━━━━━━━━━━━━\n` +
      `⏳ Oyin boshlanishini kuting...`
    );

    for (const player of game.players.values()) {
      if (player.id !== userId) {
        try {
          await this.bot.api.sendMessage(
            player.chatId,
            `👋 ${userName} qoshildi!\n👥 Jami: ${game.players.size} oyinchi`
          );
        } catch (e) {}
      }
    }

    if (game.setupMessageId) {
      await this.showSetupMenu(ctx, game, game.setupMessageId);
    }
  }

  async handleCallback(ctx) {
    const data = ctx.callbackQuery.data;
    await ctx.answerCallbackQuery();

    if (data.startsWith("setcount_")) {
      await this.handleSetcount(ctx, data);
    } else if (data.startsWith("setup_mafia_")) {
      await this.handleSetupCallback(ctx, data, "mafia");
    } else if (data.startsWith("setup_doctor_")) {
      await this.handleSetupCallback(ctx, data, "doctor");
    } else if (data.startsWith("setup_detective_")) {
      await this.handleSetupCallback(ctx, data, "detective");
    } else if (data.startsWith("start_game_")) {
      await this.handleStartGame(ctx, data);
    } else if (data.startsWith("mafia_kill_")) {
      await this.handleMafiaKill(ctx, data);
    } else if (data.startsWith("doctor_heal_")) {
      await this.handleDoctorHeal(ctx, data);
    } else if (data.startsWith("detective_check_")) {
      await this.handleDetectiveCheck(ctx, data);
    } else if (data.startsWith("vote_")) {
      await this.handleDayVote(ctx, data);
    } else if (data.startsWith("tievote_")) {
      await this.handleTieVote(ctx, data);
    }
  }

  async handleSetupCallback(ctx, data, roleType) {
    const parts = data.split("_");
    const gameId = parts[parts.length - 1];
    const game = this.games.get(gameId);
    if (!game || ctx.from.id !== game.hostId) return;

    const keyboard = new InlineKeyboard();
    for (let i = 0; i <= 5; i++) {
      keyboard.text(i === 0 ? "0 (yoq)" : String(i), `setcount_${roleType}_${i}_${gameId}`);
    }
    const names = { mafia: "Mafiya", doctor: "Doktor", detective: "Detektiv" };
    await ctx.reply(`${names[roleType]} sonini tanlang:`, { reply_markup: keyboard });
  }

  async handleSetcount(ctx, data) {
    const parts = data.split("_");
    const roleType = parts[1];
    const count = parseInt(parts[2]);
    const gameId = parts[3];
    const game = this.games.get(gameId);
    if (!game || ctx.from.id !== game.hostId) return;

    if (roleType === "mafia") game.mafiaCount = count;
    else if (roleType === "doctor") game.doctorCount = count;
    else if (roleType === "detective") game.detectiveCount = count;

    await ctx.deleteMessage().catch(() => {});
    if (game.setupMessageId) {
      await this.showSetupMenu(ctx, game, game.setupMessageId);
    }
  }

  async handleStartGame(ctx, data) {
    const gameId = data.replace("start_game_", "");
    const game = this.games.get(gameId);
    if (!game || ctx.from.id !== game.hostId) return;

    const totalRoles = game.mafiaCount + game.doctorCount + game.detectiveCount;
    if (game.mafiaCount === 0) { await ctx.reply("❌ Kamida 1 ta mafiya kerak!"); return; }
    if (game.players.size < totalRoles + 1) {
      await ctx.reply(`❌ Kamida ${totalRoles + 1} ta oyinchi kerak! (Hozir: ${game.players.size})`);
      return;
    }

    game.assignRoles();
    game.state = STATE.NIGHT;
    game.day = 1;
    try { await ctx.deleteMessage(); } catch (e) {}

    for (const player of game.players.values()) {
      let msg = `🎭 OYIN BOSHLANDI!\n━━━━━━━━━━━━━━━\nSizning rolingiz:\n\n`;
      if (player.role === ROLE.MAFIA) {
        msg += `🔴 MAFIYA\n\n`;
        const others = game.aliveMafia().filter(p => p.id !== player.id);
        msg += others.length > 0
          ? `👥 Jamoadoshlar:\n${others.map(p => `• ${p.name}`).join("\n")}\n\n`
          : `⚠️ Siz yagona mafiasiz!\n\n`;
        msg += `📌 Tunda qurbon tanlaysiz.`;
      } else if (player.role === ROLE.DOCTOR) {
        msg += `💚 DOKTOR\n\n📌 Tunda bitta odamni davolaysiz.\nOzingizni ham davolay olasiz!`;
      } else if (player.role === ROLE.DETECTIVE) {
        msg += `🔵 DETEKTIV\n\n📌 Tunda bitta odamning rolini bilib olasiz.`;
      } else {
        msg += `⚪ XALQ\n\n📌 Kunduz ovoz berish orqali mafiyani toping!`;
      }
      await this.sendToPlayer(player, msg);
    }

    await this.startNight(game);
  }

  async startNight(game) {
    game.state = STATE.NIGHT;
    game.resetNightActions();

    const alive = game.alivePlayers();
    await this.sendToAllAlive(game,
      `🌙 KECHA BOSHLANDI\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🕯️ ${game.day}-kecha...\n\n` +
      `👥 Tirik oyinchilar:\n` +
      alive.map((p, i) => `${i + 1}. ${p.name}`).join("\n") +
      `\n━━━━━━━━━━━━━━━\n` +
      `😴 Hamma uxladi. Agentlar ish boshladi...`
    );
    setTimeout(() => this.startMafiaTurn(game), 1500);
  }

  async startMafiaTurn(game) {
    game.state = STATE.MAFIA_TURN;
    const mafias = game.aliveMafia();
    if (mafias.length === 0) { await this.startDoctorTurn(game); return; }

    const targets = game.alivePlayers().filter(p => p.role !== ROLE.MAFIA);
    const keyboard = new InlineKeyboard();
    targets.forEach((p, i) => {
      if (i % 2 === 0) keyboard.row();
      keyboard.text(p.name, `mafia_kill_${game.gameId}_${p.id}`);
    });

    for (const mafia of mafias) {
      await this.sendToPlayer(mafia,
        `🔴 MAFIYA NAVBATI\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Kimni olib tashlaysiz?`,
        { reply_markup: keyboard }
      );
    }
  }

  async handleMafiaKill(ctx, data) {
    const parts = data.split("_");
    const gameId = parts[2];
    const targetId = parseInt(parts[3]);
    const game = this.games.get(gameId);
    if (!game || game.state !== STATE.MAFIA_TURN) return;

    const voter = game.getPlayer(ctx.from.id);
    if (!voter || voter.role !== ROLE.MAFIA || !voter.alive) return;
    if (game.mafiaVoted.has(ctx.from.id)) {
      await ctx.answerCallbackQuery("Allaqachon tanladingiz!");
      return;
    }

    game.mafiaVoted.add(ctx.from.id);
    game.mafiaVotes.set(targetId, (game.mafiaVotes.get(targetId) || 0) + 1);
    const target = game.getPlayer(targetId);
    await ctx.answerCallbackQuery(`${target?.name} tanlandi`);

    for (const m of game.aliveMafia()) {
      if (m.id !== ctx.from.id) {
        await this.sendToPlayer(m, `🔴 ${voter.name} ➜ ${target?.name} ni tanladi`);
      }
    }

    if (game.mafiaVoted.size >= game.aliveMafia().length) {
      let maxVotes = 0, topTarget = null;
      for (const [tid, cnt] of game.mafiaVotes) {
        if (cnt > maxVotes) { maxVotes = cnt; topTarget = tid; }
      }
      game.mafiaTarget = topTarget;
      for (const m of game.aliveMafia()) {
        await this.sendToPlayer(m,
          `✅ QAROR\n━━━━━━━━━━━━━━━\n🎯 ${game.getPlayer(topTarget)?.name} olib tashlanadi`
        );
      }
      await this.startDoctorTurn(game);
    }
  }

  async startDoctorTurn(game) {
    game.state = STATE.DOCTOR_TURN;
    const doctors = game.aliveDoctors();
    if (doctors.length === 0) { await this.startDetectiveTurn(game); return; }

    const targets = game.alivePlayers();
    const keyboard = new InlineKeyboard();
    targets.forEach((p, i) => {
      if (i % 2 === 0) keyboard.row();
      keyboard.text(p.name, `doctor_heal_${game.gameId}_${p.id}`);
    });

    for (const doctor of doctors) {
      await this.sendToPlayer(doctor,
        `💚 DOKTOR NAVBATI\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Kimni davolaysiz?`,
        { reply_markup: keyboard }
      );
    }
  }

  async handleDoctorHeal(ctx, data) {
    const parts = data.split("_");
    const gameId = parts[2];
    const targetId = parseInt(parts[3]);
    const game = this.games.get(gameId);
    if (!game || game.state !== STATE.DOCTOR_TURN) return;

    const doctor = game.getPlayer(ctx.from.id);
    if (!doctor || doctor.role !== ROLE.DOCTOR || !doctor.alive) return;

    game.doctorTarget = targetId;
    const target = game.getPlayer(targetId);
    await ctx.answerCallbackQuery(`${target?.name} davolandi`);
    await this.sendToPlayer(doctor,
      `💚 DAVOLANDI\n━━━━━━━━━━━━━━━\n✅ ${target?.name} davolandi`
    );
    await this.startDetectiveTurn(game);
  }

  async startDetectiveTurn(game) {
    game.state = STATE.DETECTIVE_TURN;
    const detectives = game.aliveDetectives();
    if (detectives.length === 0) { await this.endNight(game); return; }

    const targets = game.alivePlayers().filter(p => p.role !== ROLE.DETECTIVE);
    const keyboard = new InlineKeyboard();
    targets.forEach((p, i) => {
      if (i % 2 === 0) keyboard.row();
      keyboard.text(p.name, `detective_check_${game.gameId}_${p.id}`);
    });

    for (const detective of detectives) {
      await this.sendToPlayer(detective,
        `🔵 DETEKTIV NAVBATI\n` +
        `━━━━━━━━━━━━━━━\n` +
        `Kimni tekshirasiz?`,
        { reply_markup: keyboard }
      );
    }
  }

  async handleDetectiveCheck(ctx, data) {
    const parts = data.split("_");
    const gameId = parts[2];
    const targetId = parseInt(parts[3]);
    const game = this.games.get(gameId);
    if (!game || game.state !== STATE.DETECTIVE_TURN) return;

    const detective = game.getPlayer(ctx.from.id);
    if (!detective || detective.role !== ROLE.DETECTIVE || !detective.alive) return;

    const target = game.getPlayer(targetId);
    game.detectiveTarget = targetId;
    await ctx.answerCallbackQuery("Tekshirildi");
    await this.sendToPlayer(detective,
      target?.role === ROLE.MAFIA
        ? `🔵 TEKSHIRUV NATIJASI\n━━━━━━━━━━━━━━━\n🔴 ${target?.name} — MAFIYA!`
        : `🔵 TEKSHIRUV NATIJASI\n━━━━━━━━━━━━━━━\n✅ ${target?.name} — mafiya emas\n(${ROLE_EMOJI[target?.role]})`
    );
    await this.endNight(game);
  }

  async endNight(game) {
    game.state = STATE.DAY;
    game.day++;

    const killed = game.mafiaTarget;
    const healed = game.doctorTarget;
    let msg = `☀️ TONG OTDI\n━━━━━━━━━━━━━━━\n${game.day - 1}-kecha tugadi\n\n`;

    if (killed !== null) {
      const victim = game.getPlayer(killed);
      if (killed === healed) {
        msg += `🏥 Mafiya hujum qildi!\nLekin doktor uni qutqardi!\n✅ Hech kim olmadi.\n\n`;
      } else {
        if (victim) victim.alive = false;
        msg += `💀 ${victim?.name} oldirildi!\n🎭 Roli: ${ROLE_EMOJI[victim?.role]}\n\n`;
      }
    } else {
      msg += `😴 Kecha tinch otdi.\n\n`;
    }

    const alive = game.alivePlayers();
    msg += `👥 Tirik qolganlar (${alive.length}):\n`;
    msg += alive.map((p, i) => `${i + 1}. ${p.name}`).join("\n");
    msg += `\n━━━━━━━━━━━━━━━`;

    const winner = game.checkWinCondition();
    if (winner) {
      await this.sendToAllAlive(game, msg);
      await this.endGame(game, winner);
      return;
    }

    await this.sendToAllAlive(game, msg);
    setTimeout(() => this.startDayVoting(game), 1500);
  }

  async startDayVoting(game) {
    game.state = STATE.VOTING;
    game.resetDayVoting();

    const alive = game.alivePlayers();
    const keyboard = new InlineKeyboard();
    alive.forEach((p, i) => {
      if (i % 2 === 0) keyboard.row();
      keyboard.text(p.name, `vote_${game.gameId}_${p.id}`);
    });

    await this.sendToAllAlive(game,
      `🗳️ OVOZ BERISH\n` +
      `━━━━━━━━━━━━━━━\n` +
      `Kimni oyindan chiqarasiz?\n` +
      `(Tugmalardan tanlang)`,
      { reply_markup: keyboard }
    );
  }

  async handleDayVote(ctx, data) {
    const parts = data.split("_");
    const gameId = parts[1];
    const targetId = parseInt(parts[2]);
    const game = this.games.get(gameId);
    if (!game || game.state !== STATE.VOTING) return;

    const voter = game.getPlayer(ctx.from.id);
    if (!voter || !voter.alive) { await ctx.answerCallbackQuery("Siz oyinda yoqsiz!"); return; }

    const alreadyVoted = game.dayVotes.has(ctx.from.id);
    game.dayVotes.set(ctx.from.id, targetId);
    const target = game.getPlayer(targetId);

    await ctx.answerCallbackQuery(alreadyVoted ? "Ovozingiz yangilandi!" : "Ovoz qabul qilindi!");
    await this.sendToAllAlive(game, `🗳️ ${voter.name} ➜ ${target?.name}`);

    if (game.dayVotes.size >= game.alivePlayers().length) {
      await this.processVotingResult(game);
    }
  }

  async processVotingResult(game) {
    const voteCounts = new Map();
    for (const targetId of game.dayVotes.values()) {
      voteCounts.set(targetId, (voteCounts.get(targetId) || 0) + 1);
    }
    const sorted = [...voteCounts.entries()].sort((a, b) => b[1] - a[1]);
    const maxVotes = sorted[0]?.[1] || 0;
    const topPlayers = sorted.filter(([, v]) => v === maxVotes).map(([id]) => id);

    if (topPlayers.length === 1) {
      await this.eliminatePlayer(game, topPlayers[0], maxVotes);
    } else {
      await this.startTieBreak(game, topPlayers, maxVotes);
    }
  }

  async eliminatePlayer(game, playerId, votes) {
    const player = game.getPlayer(playerId);
    if (!player) return;
    player.alive = false;

    const alive = game.alivePlayers();
    await this.sendToAllAlive(game,
      `⚖️ OVOZ BERISH YAKUNLANDI\n` +
      `━━━━━━━━━━━━━━━\n` +
      `❌ ${player.name} chiqarildi! (${votes} ovoz)\n` +
      `🎭 Roli: ${ROLE_EMOJI[player.role]}\n\n` +
      `👥 Tirik qolganlar (${alive.length}):\n` +
      alive.map((p, i) => `${i + 1}. ${p.name}`).join("\n") +
      `\n━━━━━━━━━━━━━━━`
    );
    await this.sendToPlayer(player,
      `😔 SIZ CHIQARILDINGIZ\n━━━━━━━━━━━━━━━\nOyinni tomosha qiling!`
    );

    const winner = game.checkWinCondition();
    if (winner) { await this.endGame(game, winner); return; }
    setTimeout(() => this.startNight(game), 2000);
  }

  async startTieBreak(game, tiedIds, votes) {
    game.tiedPlayers = tiedIds;
    game.tieVotes = new Map();
    game.tieVoters = new Set();

    const tiedNames = tiedIds.map(id => game.getPlayer(id)?.name).join(", ");
    const keyboard = new InlineKeyboard();
    for (const id of tiedIds) {
      keyboard.text(game.getPlayer(id)?.name || "?", `tievote_${game.gameId}_${id}`).row();
    }
    await this.sendToAllAlive(game,
      `⚖️ TENGLASHDI!\n━━━━━━━━━━━━━━━\n${tiedNames} — ${votes} ovozdan\n\nQayta ovoz bering:`,
      { reply_markup: keyboard }
    );
  }

  async handleTieVote(ctx, data) {
    const parts = data.split("_");
    const gameId = parts[1];
    const targetId = parseInt(parts[2]);
    const game = this.games.get(gameId);
    if (!game || game.state !== STATE.VOTING) return;

    const voter = game.getPlayer(ctx.from.id);
    if (!voter || !voter.alive) { await ctx.answerCallbackQuery("Siz oyinda yoqsiz!"); return; }
    if (game.tieVoters.has(ctx.from.id)) { await ctx.answerCallbackQuery("Allaqachon ovoz berdingiz!"); return; }

    game.tieVoters.add(ctx.from.id);
    game.tieVotes.set(targetId, (game.tieVotes.get(targetId) || 0) + 1);
    const target = game.getPlayer(targetId);
    await ctx.answerCallbackQuery(`${target?.name} tanlandi`);
    await this.sendToAllAlive(game, `🗳️ ${voter.name} ➜ ${target?.name}`);

    if (game.tieVoters.size >= game.alivePlayers().length) {
      const sorted = [...game.tieVotes.entries()].sort((a, b) => b[1] - a[1]);
      const maxVotes = sorted[0]?.[1] || 0;
      const tops = sorted.filter(([, v]) => v === maxVotes).map(([id]) => id);
      if (tops.length === 1) {
        await this.eliminatePlayer(game, tops[0], maxVotes);
      } else {
        const randId = tops[Math.floor(Math.random() * tops.length)];
        await this.sendToAllAlive(game, `🎲 Hali ham tenglashdi! Tasodifiy biri chiqariladi...`);
        await this.eliminatePlayer(game, randId, maxVotes);
      }
    }
  }

  async endGame(game, winner) {
    game.state = STATE.FINISHED;
    let msg = winner === "mafia"
      ? `🔴 MAFIYA YUTDI!\n━━━━━━━━━━━━━━━\nMafiya shaharni egalladi!\n\n`
      : `🎉 XALQ YUTDI!\n━━━━━━━━━━━━━━━\nBarcha mafiyalar yoq qilindi!\n\n`;

    msg += `📋 Yakuniy natija:\n`;
    for (const p of game.players.values()) {
      msg += `${p.alive ? "✅" : "💀"} ${p.name} — ${ROLE_EMOJI[p.role]}\n`;
    }
    msg += `━━━━━━━━━━━━━━━\nQayta oynash: /newgame`;

    await this.sendToAll(game, msg);
    for (const pid of game.players.keys()) this.playerGame.delete(pid);
    this.games.delete(game.gameId);
  }

  async showStatus(ctx) {
    const gameId = this.playerGame.get(ctx.from.id);
    const game = gameId ? this.games.get(gameId) : null;
    if (!game) { await ctx.reply("❌ Siz hozir oyinda yoqsiz.\n/newgame — yangi oyin"); return; }
    await ctx.reply(game.statusText());
  }
}

module.exports = GameManager;