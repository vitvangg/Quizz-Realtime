const io = require('socket.io-client');
const axios = require('axios');

async function run() {
  console.log("Connecting to backend...");
  // Assume backend is on port 5000
  const socket = io('http://localhost:5000', {
    transports: ['websocket']
  });

  socket.on('connect', () => {
    console.log("Connected with id", socket.id);
    // Let's try to join a dummy game
    socket.emit('join_game', { sessionId: 'dummy', playerId: 'dummy', nickname: 'dummy' }, (res) => {
      console.log('join_game res:', res);
      process.exit(0);
    });
  });

  socket.on('connect_error', (err) => {
    console.error("Connection error:", err.message);
    process.exit(1);
  });
}

run();
