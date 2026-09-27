'use strict';

(() => {
  const STORAGE_KEY = 'vital-signs-session';
  let savedSession = {};
  try { savedSession = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); } catch { sessionStorage.removeItem(STORAGE_KEY); }

  const state = { 
    roomCode: savedSession.roomCode || null, 
    role: savedSession.role || null, 
    playerId: savedSession.playerId || null, 
    gameActive: false 
  };
  const socket = io({ transports: ['websocket', 'polling'] });

  function persist() {
    if (state.roomCode && state.role && state.playerId) {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ 
        roomCode: state.roomCode, 
        role: state.role, 
        playerId: state.playerId 
      }));
    }
  }

  window.VitalSigns = {
    socket,
    state,
    ensurePlayerId() {
      if (!state.playerId) {
        state.playerId = globalThis.crypto?.randomUUID?.() || `player-\({Date.now()}-\){Math.random().toString(36).slice(2)}`;
      }
      return state.playerId;
    },
    setSession(roomCode, role) {
      state.roomCode = roomCode;
      state.role = role;
      window.VitalSigns.ensurePlayerId(); // The fix is right here
      persist();
    },
    clearSession() {
      state.roomCode = null;
      state.role = null;
      state.playerId = null;
      state.gameActive = false;
      sessionStorage.removeItem(STORAGE_KEY);
    },
    emit(eventName, payload, callback) {
      socket.emit(eventName, payload, callback);
    }
  };
})();