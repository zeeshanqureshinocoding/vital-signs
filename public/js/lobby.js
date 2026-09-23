'use strict';

(() => {
  const { socket, state, setSession, emit } = window.VitalSigns;
  const createButton = document.querySelector('#create-room');
  const joinForm = document.querySelector('#join-room-form');
  const roomCodeInput = document.querySelector('#room-code');
  const message = document.querySelector('#lobby-message');

  if (state.roomCode && state.role) window.VitalSigns.clearSession();
  roomCodeInput.addEventListener('input', () => { roomCodeInput.value = roomCodeInput.value.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 4); });

  const selectedRole = () => document.querySelector('input[name="role"]:checked').value;
  const showMessage = (text, isError = false) => { message.textContent = text; message.classList.toggle('is-error', isError); };
  const setBusy = (busy) => { createButton.disabled = busy; joinForm.querySelector('button').disabled = busy; };
  const enterRoom = (roomCode, role) => { setSession(roomCode, role); window.location.assign('/game.html'); };

  socket.on('roomCreated', ({ roomCode, role }) => enterRoom(roomCode, role));
  socket.on('roomJoined', ({ roomCode, role }) => { if (role) enterRoom(roomCode, role); });
  socket.on('roomError', ({ message: errorMessage }) => { setBusy(false); showMessage(errorMessage, true); });
  socket.on('connect_error', () => { setBusy(false); showMessage('Unable to reach the game server. Try again shortly.', true); });

  createButton.addEventListener('click', () => {
    setBusy(true);
    showMessage('Creating private room…');
    emit('createRoom', { role: selectedRole() }, (result) => { if (!result.ok) { setBusy(false); showMessage(result.message, true); } });
  });

  joinForm.addEventListener('submit', (event) => {
    event.preventDefault();
    const roomCode = roomCodeInput.value.trim().toUpperCase();
    if (roomCode.length !== 4) return showMessage('Enter the four-character room code.', true);
    setBusy(true);
    showMessage('Joining room…');
    emit('joinRoom', { roomCode, role: selectedRole() }, (result) => { if (!result.ok) { setBusy(false); showMessage(result.message, true); } });
  });
})();
