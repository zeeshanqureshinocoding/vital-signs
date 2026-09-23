'use strict';

(() => {
  const { socket, state, setSession, clearSession, emit } = window.VitalSigns;
  const waiting = document.querySelector('#waiting-screen');
  const startButton = document.querySelector('#start-game');
  const message = document.querySelector('#game-message');
  const modal = document.querySelector('#game-over-modal');
  const timer = document.querySelector('#timer');
  const showMessage = (text, isError = false) => { message.textContent = text; message.classList.toggle('is-error', isError); };
  const formatTime = (seconds) => `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

  function renderIdentity() {
    document.querySelector('#room-code-display').textContent = state.roomCode || '----';
    document.querySelector('#waiting-room-code').textContent = state.roomCode || '----';
    document.querySelector('#role-badge').textContent = state.role ? state.role[0].toUpperCase() + state.role.slice(1) : 'No role';
  }
  function renderRoster(players, ready) {
    document.querySelector('#medic-presence strong').textContent = players.medicConnected ? 'Connected' : 'Waiting';
    document.querySelector('#lab-presence strong').textContent = players.labConnected ? 'Connected' : 'Waiting';
    document.querySelector('#waiting-title').textContent = ready ? 'Both stations are online' : 'Waiting for your partner';
    document.querySelector('#waiting-detail').textContent = ready ? 'When both players are ready, begin the emergency protocol.' : 'Share this room code with the other player, then wait for them to select the opposite role.';
    startButton.hidden = !ready;
  }
  function showRoleBoard() {
    waiting.hidden = true;
    if (state.role === 'medic') window.MedicUI.show(); else window.LabUI.show();
  }
  function reconnectToRoom() {
    if (!state.roomCode || !state.role) { window.location.replace('/index.html'); return; }
    emit('joinRoom', { roomCode: state.roomCode, role: state.role }, (result) => { if (!result.ok) { showMessage(result.message, true); } });
  }

  renderIdentity();
  socket.on('connect', () => { document.querySelector('#connection-status').textContent = 'Connected'; reconnectToRoom(); });
  socket.on('disconnect', () => { document.querySelector('#connection-status').textContent = 'Reconnecting…'; });
  socket.on('connect_error', () => { document.querySelector('#connection-status').textContent = 'Offline'; });
  socket.on('roomJoined', ({ roomCode, role, players, ready }) => {
    if (role) setSession(roomCode, role);
    renderIdentity();
    if (players) renderRoster(players, ready);
  });
  socket.on('gameStarted', () => { state.gameActive = true; modal.hidden = true; if (state.role === 'medic') window.MedicUI.beginRound(); showRoleBoard(); showMessage(''); });
  socket.on('timerUpdate', ({ secondsRemaining }) => { timer.textContent = formatTime(secondsRemaining); timer.classList.toggle('urgent', secondsRemaining <= 10); });
  socket.on('updateVitals', (payload) => { if (state.role === 'medic') window.MedicUI.updateVitals(payload); });
  socket.on('labManual', ({ entries }) => { if (state.role === 'lab') window.LabUI.renderManual(entries); });
  socket.on('treatmentResult', (result) => { if (state.role === 'medic') window.MedicUI.treatmentResult(result); });
  socket.on('playerDisconnected', ({ role, reconnectGraceMs }) => { showMessage(`${role[0].toUpperCase() + role.slice(1)} disconnected.${reconnectGraceMs ? ' Waiting briefly for reconnection.' : ''}`, true); });
  socket.on('roomError', ({ message: errorMessage }) => showMessage(errorMessage, true));
  socket.on('gameOver', (result) => {
    state.gameActive = false; if (state.role === 'medic') window.MedicUI.disableTreatments();
    document.querySelector('#game-over-kicker').textContent = result.result === 'won' ? 'Patient stabilized' : 'Emergency outcome';
    document.querySelector('#game-over-title').textContent = result.result === 'won' ? 'Protocol complete' : 'Patient lost';
    document.querySelector('#game-over-reason').textContent = result.reason;
    const details = document.querySelector('#game-over-details'); details.replaceChildren();
    const diagnosis = document.createElement('p'); diagnosis.textContent = `Diagnosis: ${result.scenario.name}`;
    const protocol = document.createElement('p'); protocol.textContent = `Correct sequence: ${result.requiredTreatments.map((id) => id.split('-').map((part) => part[0].toUpperCase() + part.slice(1)).join(' ')).join(' → ')}`;
    details.append(diagnosis, protocol); modal.hidden = false;
  });

  window.VitalSigns.applyTreatment = (treatmentId) => emit('applyTreatment', { roomCode: state.roomCode, treatmentId }, (result) => { if (!result.ok) window.MedicUI.treatmentResult({ treatmentId, correct: false, message: result.message }); });
  startButton.addEventListener('click', () => emit('startGame', { roomCode: state.roomCode }));
  document.querySelector('#rematch').addEventListener('click', () => { modal.hidden = true; emit('requestRematch', { roomCode: state.roomCode }); });
  document.querySelector('#leave-room').addEventListener('click', () => { emit('leaveRoom', {}, () => { clearSession(); window.location.assign('/index.html'); }); });
  document.querySelector('#return-lobby').addEventListener('click', () => { emit('leaveRoom', {}, () => { clearSession(); window.location.assign('/index.html'); }); });
})();
