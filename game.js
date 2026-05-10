const STATE = {
  WAITING: "waiting",
  SETUP: "setup",
  NIGHT: "night",
  MAFIA_TURN: "mafia_turn",
  DOCTOR_TURN: "doctor_turn",
  DETECTIVE_TURN: "detective_turn",
  DAY: "day",
  VOTING: "voting",
  FINISHED: "finished",
};

const ROLE = {
  MAFIA: "mafia",
  DOCTOR: "doctor",
  DETECTIVE: "detective",
  CITIZEN: "citizen",
};

const ROLE_EMOJI = {
  mafia: "🔴 Mafiya",
  doctor: "💚 Doktor",
  detective: "🔵 Detektiv",
  citizen: "⚪ Xalq",
};

// Rol rasmlari - URL dan yuboriladi
const ROLE_IMAGES = {
  mafia: "https://i.imgur.com/8mGQmDw.jpeg",
  doctor: "https://i.imgur.com/4QwLBJz.jpeg",
  detective: "https://i.imgur.com/7KpXqZL.jpeg",
  citizen: "https://i.imgur.com/3nQwRmK.jpeg",
};

class Game {
  constructor(gameId, hostId, hostName, chatId) {
    this.gameId = gameId;
    this.hostId = hostId;
    this.hostName = hostName;
    this.chatId = chatId;
    this.state = STATE.WAITING;
    this.players = new Map();
    this.mafiaCount = 1;
    this.doctorCount = 1;
    this.detectiveCount = 1;
    this.mafiaTarget = null;
    this.doctorTarget = null;
    this.detectiveTarget = null;
    this.mafiaVoted = new Set();
    this.mafiaVotes = new Map();
    this.dayVotes = new Map();
    this.votedOut = null;
    this.day = 0;
    this.setupMessageId = null;
    this.tiedPlayers = [];
    this.tieVotes = new Map();
    this.tieVoters = new Set();
  }

  addPlayer(userId, name, chatId) {
    if (this.players.has(userId)) return false;
    this.players.set(userId, { id: userId, name, role: null, alive: true, chatId });
    return true;
  }

  getPlayer(userId) { return this.players.get(userId); }
  alivePlayers() { return [...this.players.values()].filter(p => p.alive); }
  aliveByRole(role) { return this.alivePlayers().filter(p => p.role === role); }
  aliveMafia() { return this.aliveByRole(ROLE.MAFIA); }
  aliveDoctors() { return this.aliveByRole(ROLE.DOCTOR); }
  aliveDetectives() { return this.aliveByRole(ROLE.DETECTIVE); }
  aliveCitizens() { return this.alivePlayers().filter(p => p.role !== ROLE.MAFIA); }
  totalAliveMafia() { return this.aliveMafia().length; }
  totalAliveNonMafia() { return this.aliveCitizens().length; }

  assignRoles() {
    const list = [...this.players.values()];
    // Fisher-Yates shuffle - 3 marta aralashtirish
    for (let round = 0; round < 3; round++) {
      for (let i = list.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [list[i], list[j]] = [list[j], list[i]];
      }
    }
    let idx = 0;
    for (let i = 0; i < this.mafiaCount; i++) list[idx++].role = ROLE.MAFIA;
    for (let i = 0; i < this.doctorCount; i++) list[idx++].role = ROLE.DOCTOR;
    for (let i = 0; i < this.detectiveCount; i++) list[idx++].role = ROLE.DETECTIVE;
    while (idx < list.length) list[idx++].role = ROLE.CITIZEN;
    for (const p of list) this.players.get(p.id).role = p.role;
  }

  checkWinCondition() {
    const mafiaAlive = this.totalAliveMafia();
    const nonMafiaAlive = this.totalAliveNonMafia();
    if (mafiaAlive === 0) return "citizens";
    if (mafiaAlive >= nonMafiaAlive) return "mafia";
    return null;
  }

  statusText() {
    const alive = this.alivePlayers();
    const mafiaAlive = this.aliveMafia().length;
    const doctorAlive = this.aliveDoctors().length;
    const detectiveAlive = this.aliveDetectives().length;
    const citizenAlive = alive.filter(p => p.role === ROLE.CITIZEN).length;
    return (
      `━━━━━━━━━━━━━━━\n` +
      `📊 OYIN HOLATI\n` +
      `━━━━━━━━━━━━━━━\n` +
      `🌙 ${this.day}-kun\n\n` +
      `👥 Tirik: ${alive.length} kishi\n` +
      `🔴 Mafiya: ${mafiaAlive}\n` +
      `💚 Doktor: ${doctorAlive}\n` +
      `🔵 Detektiv: ${detectiveAlive}\n` +
      `⚪ Xalq: ${citizenAlive}\n` +
      `━━━━━━━━━━━━━━━`
    );
  }

  resetNightActions() {
    this.mafiaTarget = null;
    this.doctorTarget = null;
    this.detectiveTarget = null;
    this.mafiaVoted = new Set();
    this.mafiaVotes = new Map();
  }

  resetDayVoting() {
    this.dayVotes = new Map();
    this.votedOut = null;
    this.tiedPlayers = [];
    this.tieVotes = new Map();
    this.tieVoters = new Set();
  }
}

module.exports = { Game, STATE, ROLE, ROLE_EMOJI, ROLE_IMAGES };