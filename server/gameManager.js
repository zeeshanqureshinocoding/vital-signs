'use strict';

const crypto = require('crypto');
const {
  GAME_DURATION_MS,
  TICK_INTERVAL_MS,
  ROOM_CODE_LENGTH,
  ROOM_CODE_ALPHABET,
  ROOM_TTL_MS,
  RECONNECT_GRACE_MS,
  MAX_TREATMENTS_PER_SECOND,
  INCORRECT_TREATMENT_TIME_PENALTY_MS,
  INCORRECT_TREATMENT_SEVERITY_PENALTY,
  ROLES,
  GAME_STATUS,
  TREATMENT_IDS
} = require('./constants');
const { getLabManual, pickScenario, getScenarioById } = require('./scenarios');

class GameManager {
  constructor(io, { now = () => Date.now(), random = Math.random } = {}) {
    this.io = io;
    this.now = now;
    this.random = random;
    this.rooms = new Map();
    this.socketMemberships = new Map();
    this.cleanupInterval = setInterval(() => this.cleanupExpiredRooms(), 60_000);
    this.cleanupInterval.unref?.();
  }

  createRoom(socket, requestedRole, requestedPlayerId) {
    const role = this.validateRole(requestedRole);
    const playerId = this.validatePlayerId(requestedPlayerId);
    this.leaveCurrentRoom(socket, { notify: false });

    let roomCode;
    do roomCode = this.generateRoomCode(); while (this.rooms.has(roomCode));

    const room = this.newRoom(roomCode);
    this.rooms.set(roomCode, room);
    this.assignPlayer(room, role, socket, playerId);
    socket.join(roomCode);
    this.socketMemberships.set(socket.id, { roomCode, role });

    socket.emit('roomCreated', { roomCode, role });
    this.emitRoomJoined(room);
    return room;
  }

  joinRoom(socket, requestedRoomCode, requestedRole, requestedPlayerId) {
    const roomCode = this.normalizeRoomCode(requestedRoomCode);
    const role = this.validateRole(requestedRole);
    const playerId = this.validatePlayerId(requestedPlayerId);
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('Room not found. Check the room code and try again.');

    this.leaveCurrentRoom(socket, { notify: false });
    const slot = room.players[role];
    const isSessionTransfer = Boolean(slot.socketId && slot.socketId !== socket.id && slot.playerId === playerId);
    if (slot.socketId && slot.socketId !== socket.id && !isSessionTransfer) {
      throw new Error(`The ${role} role is already occupied.`);
    }
    if (isSessionTransfer) this.releasePreviousSocket(room, role);

    if (room.status === GAME_STATUS.ACTIVE) {
      const reconnectWindowOpen = slot.playerId === playerId && slot.disconnectedAt && this.now() - slot.disconnectedAt <= RECONNECT_GRACE_MS;
      if (!isSessionTransfer && !reconnectWindowOpen) throw new Error('This game is already in progress.');
      this.assignPlayer(room, role, socket, playerId);
      socket.join(roomCode);
      this.socketMemberships.set(socket.id, { roomCode, role });
      room.lastActivityAt = this.now();
      socket.emit('roomJoined', { roomCode, role, players: this.publicPlayers(room) });
      socket.emit('gameStarted', { roomCode, startedBy: 'reconnection', durationMs: GAME_DURATION_MS });
      this.emitLabManual(room);
      this.emitMedicVitals(room);
      this.emitTimer(room);
      this.emitRoomJoined(room);
      return room;
    }

    this.assignPlayer(room, role, socket, playerId);
    socket.join(roomCode);
    this.socketMemberships.set(socket.id, { roomCode, role });
    room.lastActivityAt = this.now();

    socket.emit('roomJoined', { roomCode, role, players: this.publicPlayers(room) });
    this.emitRoomJoined(room);
    return room;
  }

  startGame(socket, requestedRoomCode) {
    const { room, role } = this.getRoomForSocket(socket, requestedRoomCode);
    if (room.status === GAME_STATUS.ACTIVE) throw new Error('The game is already running.');
    if (!this.isRoomReady(room)) throw new Error('Both a Medic and Lab player are required to start.');

    this.clearRoomTimers(room);
    room.status = GAME_STATUS.ACTIVE;
    room.scenarioId = pickScenario(this.random).id;
    room.startedAt = this.now();
    room.endsAt = room.startedAt + GAME_DURATION_MS;
    room.severityPenalty = 0;
    room.treatmentProgress = [];
    room.treatmentHistory = [];
    room.lastTreatmentAt = 0;
    room.lastActivityAt = room.startedAt;

    const scenario = this.getScenario(room);
    this.io.to(room.roomCode).emit('gameStarted', { roomCode: room.roomCode, startedBy: role, durationMs: GAME_DURATION_MS });
    this.emitLabManual(room);
    this.emitMedicVitals(room);
    this.emitTimer(room);
    room.tickHandle = setInterval(() => this.tickRoom(room.roomCode), TICK_INTERVAL_MS);
    room.tickHandle.unref?.();
    return room;
  }

  applyTreatment(socket, requestedRoomCode, treatmentId) {
    const { room, role } = this.getRoomForSocket(socket, requestedRoomCode);
    if (role !== ROLES.MEDIC) throw new Error('Only the Medic can apply treatments.');
    if (room.status !== GAME_STATUS.ACTIVE) throw new Error('There is no active game in this room.');
    if (!TREATMENT_IDS.has(treatmentId)) throw new Error('Unknown treatment.');

    const currentTime = this.now();
    if (currentTime - room.lastTreatmentAt < 1_000 / MAX_TREATMENTS_PER_SECOND) {
      throw new Error('Treatments are being submitted too quickly.');
    }
    room.lastTreatmentAt = currentTime;

    const scenario = this.getScenario(room);
    const expectedTreatment = scenario.labReference.requiredTreatments[room.treatmentProgress.length];
    const correct = treatmentId === expectedTreatment;
    const entry = { treatmentId, correct, at: currentTime };
    room.treatmentHistory.push(entry);
    room.lastActivityAt = currentTime;

    if (correct) {
      room.treatmentProgress.push(treatmentId);
      const complete = room.treatmentProgress.length === scenario.labReference.requiredTreatments.length;
      this.emitTreatmentResult(room, {
        treatmentId,
        correct: true,
        progress: room.treatmentProgress.length,
        total: scenario.labReference.requiredTreatments.length,
        message: complete ? 'Treatment protocol complete.' : 'Treatment accepted. Continue the protocol.'
      });
      if (complete) this.endGame(room, 'won', 'Protocol completed before patient collapse.');
    } else {
      room.endsAt -= INCORRECT_TREATMENT_TIME_PENALTY_MS;
      room.severityPenalty += INCORRECT_TREATMENT_SEVERITY_PENALTY;
      this.emitTreatmentResult(room, {
        treatmentId,
        correct: false,
        progress: room.treatmentProgress.length,
        total: scenario.labReference.requiredTreatments.length,
        message: 'Incorrect treatment. Five seconds lost and patient instability increased.',
        penaltyMs: INCORRECT_TREATMENT_TIME_PENALTY_MS
      });
      this.tickRoom(room.roomCode);
    }
  }

  requestRematch(socket, requestedRoomCode) {
    const { room } = this.getRoomForSocket(socket, requestedRoomCode);
    if (room.status === GAME_STATUS.ACTIVE) throw new Error('Finish the current game before requesting a rematch.');
    if (!this.isRoomReady(room)) throw new Error('Both players must be connected for a rematch.');
    this.startGame(socket, room.roomCode);
  }

  handleDisconnect(socket) {
    const membership = this.socketMemberships.get(socket.id);
    if (!membership) return;
    const room = this.rooms.get(membership.roomCode);
    this.socketMemberships.delete(socket.id);
    if (!room) return;

    const slot = room.players[membership.role];
    if (slot.socketId !== socket.id) return;
    slot.socketId = null;
    slot.disconnectedAt = this.now();
    room.lastActivityAt = this.now();
    this.io.to(room.roomCode).emit('playerDisconnected', { role: membership.role, reconnectGraceMs: RECONNECT_GRACE_MS });
    if (room.status === GAME_STATUS.ACTIVE) {
      slot.reconnectHandle = setTimeout(() => {
        if (!slot.socketId && room.status === GAME_STATUS.ACTIVE) {
          this.endGame(room, 'lost', `${membership.role === ROLES.MEDIC ? 'Medic' : 'Lab'} did not reconnect.`);
        }
      }, RECONNECT_GRACE_MS);
      slot.reconnectHandle.unref?.();
    }
    this.emitRoomJoined(room);
  }

  leaveCurrentRoom(socket, { notify = true } = {}) {
    const membership = this.socketMemberships.get(socket.id);
    if (!membership) return;
    const room = this.rooms.get(membership.roomCode);
    this.socketMemberships.delete(socket.id);
    socket.leave(membership.roomCode);
    if (!room) return;

    const slot = room.players[membership.role];
    if (slot.socketId === socket.id) {
      slot.socketId = null;
      slot.disconnectedAt = this.now();
    }
    if (room.status === GAME_STATUS.ACTIVE) this.endGame(room, 'lost', `${membership.role} left the room.`);
    if (notify) this.io.to(room.roomCode).emit('playerDisconnected', { role: membership.role });
    this.emitRoomJoined(room);
  }

  tickRoom(roomCode) {
    const room = this.rooms.get(roomCode);
    if (!room || room.status !== GAME_STATUS.ACTIVE) return;
    const remainingMs = Math.max(0, room.endsAt - this.now());
    if (remainingMs === 0) {
      this.endGame(room, 'lost', 'Time expired before the protocol was completed.');
      return;
    }
    this.emitTimer(room, remainingMs);
    this.emitMedicVitals(room);
  }

  endGame(room, result, reason) {
    if (room.status !== GAME_STATUS.ACTIVE) return;
    this.clearRoomTimers(room);
    this.clearReconnectTimers(room);
    room.status = result === 'won' ? GAME_STATUS.WON : GAME_STATUS.LOST;
    room.lastActivityAt = this.now();
    const scenario = this.getScenario(room);
    this.io.to(room.roomCode).emit('gameOver', {
      result,
      reason,
      scenario: { id: scenario.id, name: scenario.name },
      requiredTreatments: scenario.labReference.requiredTreatments,
      treatmentHistory: room.treatmentHistory,
      durationMs: Math.max(0, this.now() - room.startedAt)
    });
  }

  emitMedicVitals(room) {
    const medicSocketId = room.players[ROLES.MEDIC].socketId;
    if (!medicSocketId) return;
    const scenario = this.getScenario(room);
    const elapsedSeconds = Math.max(0, (this.now() - room.startedAt) / 1_000);
    const vitals = this.calculateVitals(scenario, elapsedSeconds, room.severityPenalty);
    const visibleSymptoms = scenario.symptomTimeline
      .filter((symptom) => elapsedSeconds >= symptom.atSecond)
      .map(({ id, label, severity }) => ({ id, label, severity }));
    this.io.to(medicSocketId).emit('updateVitals', {
      vitals,
      visibleSymptoms,
      treatmentProgress: room.treatmentProgress.length
    });
  }

  emitLabManual(room) {
    const labSocketId = room.players[ROLES.LAB].socketId;
    if (labSocketId) this.io.to(labSocketId).emit('labManual', { entries: getLabManual() });
  }

  emitTimer(room, remainingMs = Math.max(0, room.endsAt - this.now())) {
    this.io.to(room.roomCode).emit('timerUpdate', { secondsRemaining: Math.ceil(remainingMs / 1_000) });
  }

  emitTreatmentResult(room, payload) {
    this.io.to(room.roomCode).emit('treatmentResult', payload);
  }

  calculateVitals(scenario, elapsedSeconds, penalty) {
    const starting = scenario.initialVitals;
    const trend = scenario.progression;
    const noise = (amplitude, offset) => Math.sin(elapsedSeconds * 1.87 + offset) * amplitude;
    return {
      heartRate: Math.round(starting.heartRate + trend.heartRatePerSecond * elapsedSeconds + penalty * 0.7 + noise(2, 0)),
      bloodPressure: {
        systolic: Math.max(45, Math.round(starting.systolic + trend.systolicPerSecond * elapsedSeconds - penalty * 0.45 + noise(2, 1))),
        diastolic: Math.max(25, Math.round(starting.diastolic + trend.diastolicPerSecond * elapsedSeconds - penalty * 0.25 + noise(1, 2)))
      },
      oxygen: Math.max(55, Math.min(100, Math.round((starting.oxygen + trend.oxygenPerSecond * elapsedSeconds - penalty * 0.22 + noise(1, 3)) * 10) / 10)),
      temperature: Math.round((starting.temperature + trend.temperaturePerSecond * elapsedSeconds + penalty * 0.015 + noise(0.08, 4)) * 10) / 10
    };
  }

  getRoomForSocket(socket, requestedRoomCode) {
    const membership = this.socketMemberships.get(socket.id);
    if (!membership) throw new Error('Join a room first.');
    const roomCode = this.normalizeRoomCode(requestedRoomCode);
    if (membership.roomCode !== roomCode) throw new Error('You are not a member of that room.');
    const room = this.rooms.get(roomCode);
    if (!room) throw new Error('This room is no longer available.');
    return { room, role: membership.role };
  }

  getScenario(room) {
    const scenario = getScenarioById(room.scenarioId);
    if (!scenario) throw new Error('Room has no valid scenario.');
    return scenario;
  }

  newRoom(roomCode) {
    return {
      roomCode,
      status: GAME_STATUS.WAITING,
      players: {
        [ROLES.MEDIC]: { socketId: null, playerId: null, disconnectedAt: null, reconnectHandle: null },
        [ROLES.LAB]: { socketId: null, playerId: null, disconnectedAt: null, reconnectHandle: null }
      },
      scenarioId: null,
      startedAt: null,
      endsAt: null,
      severityPenalty: 0,
      treatmentProgress: [],
      treatmentHistory: [],
      lastTreatmentAt: 0,
      tickHandle: null,
      createdAt: this.now(),
      lastActivityAt: this.now()
    };
  }

  assignPlayer(room, role, socket, playerId) {
    const previousSlot = room.players[role];
    if (previousSlot.reconnectHandle) clearTimeout(previousSlot.reconnectHandle);
    room.players[role] = { socketId: socket.id, playerId, disconnectedAt: null, reconnectHandle: null };
  }

  releasePreviousSocket(room, role) {
    const previousSocketId = room.players[role].socketId;
    if (!previousSocketId) return;
    this.socketMemberships.delete(previousSocketId);
    const previousSocket = this.io.sockets?.sockets?.get(previousSocketId);
    previousSocket?.leave(room.roomCode);
  }

  isRoomReady(room) {
    return Boolean(room.players[ROLES.MEDIC].socketId && room.players[ROLES.LAB].socketId);
  }

  publicPlayers(room) {
    return {
      medicConnected: Boolean(room.players[ROLES.MEDIC].socketId),
      labConnected: Boolean(room.players[ROLES.LAB].socketId)
    };
  }

  emitRoomJoined(room) {
    this.io.to(room.roomCode).emit('roomJoined', {
      roomCode: room.roomCode,
      players: this.publicPlayers(room),
      ready: this.isRoomReady(room)
    });
  }

  clearRoomTimers(room) {
    if (room.tickHandle) clearInterval(room.tickHandle);
    room.tickHandle = null;
  }

  clearReconnectTimers(room) {
    for (const player of Object.values(room.players)) {
      if (player.reconnectHandle) clearTimeout(player.reconnectHandle);
      player.reconnectHandle = null;
    }
  }

  cleanupExpiredRooms() {
    const currentTime = this.now();
    for (const [roomCode, room] of this.rooms) {
      const hasPlayers = Object.values(room.players).some((player) => player.socketId);
      if (!hasPlayers && currentTime - room.lastActivityAt > ROOM_TTL_MS) {
        this.clearRoomTimers(room);
        this.rooms.delete(roomCode);
      }
    }
  }

  generateRoomCode() {
    let code = '';
    for (let index = 0; index < ROOM_CODE_LENGTH; index += 1) {
      code += ROOM_CODE_ALPHABET[crypto.randomInt(ROOM_CODE_ALPHABET.length)];
    }
    return code;
  }

  normalizeRoomCode(roomCode) {
    if (typeof roomCode !== 'string') throw new Error('A room code is required.');
    const normalized = roomCode.trim().toUpperCase();
    if (!new RegExp(`^[${ROOM_CODE_ALPHABET}]{${ROOM_CODE_LENGTH}}$`).test(normalized)) {
      throw new Error('Room codes must be four valid characters.');
    }
    return normalized;
  }

  validateRole(role) {
    if (role !== ROLES.MEDIC && role !== ROLES.LAB) throw new Error('Role must be medic or lab.');
    return role;
  }

  validatePlayerId(playerId) {
    if (typeof playerId !== 'string' || !/^[a-zA-Z0-9-]{16,80}$/.test(playerId)) {
      throw new Error('Invalid player session. Return to the lobby and try again.');
    }
    return playerId;
  }
}

module.exports = { GameManager };
