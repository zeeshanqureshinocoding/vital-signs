'use strict';

(() => {
  const STORAGE_KEY = 'vital-signs-session';
  let savedSession = {};
  try { savedSession = JSON.parse(sessionStorage.getItem(STORAGE_KEY) || '{}'); } catch { sessionStorage.removeItem(STORAGE_KEY); }

  const state = { roomCode: savedSession.roomCode || null, role: savedSession.role || null, gameActive: false };
  const socket = io({ transports: ['websocket', 'polling'] });

  function persist() {
    if (state.roomCode && state.role) sessionStorage.setItem(STORAGE_KEY, JSON.stringify({ roomCode: state.roomCode, role: state.role }));
  }

  window.VitalSigns = {
    socket,
    state,
    setSession(roomCode, role) {
      state.roomCode = roomCode;
      state.role = role;
      persist();
    },
    clearSession() {
      state.roomCode = null;
      state.role = null;
      state.gameActive = false;
      sessionStorage.removeItem(STORAGE_KEY);
    },
    emit(eventName, payload, callback) {
      socket.emit(eventName, payload, callback);
    }
  };
})();
