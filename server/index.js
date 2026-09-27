'use strict';

const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { GameManager } = require('./gameManager');

const PORT = Number.parseInt(process.env.PORT, 10) || 3000;
const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  serveClient: true,
  cors: {
    origin: process.env.CORS_ORIGIN ? process.env.CORS_ORIGIN.split(',') : true,
    methods: ['GET', 'POST']
  }
});
const gameManager = new GameManager(io);

app.disable('x-powered-by');
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', (_request, response) => response.status(200).json({ status: 'ok' }));

io.on('connection', (socket) => {
  const respond = (handler) => (payload = {}, acknowledgement) => {
    try {
      const result = handler(payload);
      if (typeof acknowledgement === 'function') acknowledgement({ ok: true, roomCode: result?.roomCode });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unexpected game server error.';
      socket.emit('roomError', { message });
      if (typeof acknowledgement === 'function') acknowledgement({ ok: false, message });
    }
  };

  socket.on('createRoom', respond(({ role, playerId }) => gameManager.createRoom(socket, role, playerId)));
  socket.on('joinRoom', respond(({ roomCode, role, playerId }) => gameManager.joinRoom(socket, roomCode, role, playerId)));
  socket.on('startGame', respond(({ roomCode }) => gameManager.startGame(socket, roomCode)));
  socket.on('applyTreatment', respond(({ roomCode, treatmentId }) => gameManager.applyTreatment(socket, roomCode, treatmentId)));
  socket.on('requestRematch', respond(({ roomCode }) => gameManager.requestRematch(socket, roomCode)));
  socket.on('leaveRoom', respond(() => {
    gameManager.leaveCurrentRoom(socket);
    return null;
  }));
  socket.on('disconnect', () => gameManager.handleDisconnect(socket));
});

server.listen(PORT, () => {
  console.log(`Vital Signs server listening on http://localhost:${PORT}`);
});

function shutdown(signal) {
  console.log(`${signal} received; closing Vital Signs server.`);
  io.close(() => server.close(() => process.exit(0)));
}

process.once('SIGINT', () => shutdown('SIGINT'));
process.once('SIGTERM', () => shutdown('SIGTERM'));

module.exports = { app, server, io, gameManager };
