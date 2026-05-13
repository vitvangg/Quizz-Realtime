import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '30s', target: 50 },  // Ramp up to 50 users
    { duration: '1m', target: 50 },   // Stay at 50 users
    { duration: '30s', target: 0 },   // Ramp down to 0
  ],
  thresholds: {
    'ws_connecting': ['p(95)<2000'], // 95% of connections should be under 2s
  },
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';

export default function () {
  const url = BASE_URL;
  const params = { tags: { my_tag: 'socket_spam' } };

  const res = ws.connect(url, params, function (socket) {
    socket.on('open', function open() {
      // Socket.io handshake
      // 1. Connection established, wait for message "0" (open)
      // 2. Receive "0{"sid":"...", ...}"
      // 3. Send "40" (connect to namespace /) or "40/game," (connect to /game)
    });

    socket.on('message', function (data) {
      if (data === '2') {
        // Ping from server
        socket.send('3'); // Pong
      }

      if (data.startsWith('0')) {
        // Initial open message, now connect to /game namespace
        socket.send('40/game,');
      }

      if (data.startsWith('40/game,')) {
        // Successfully connected to namespace, start spamming join_game
        // Format: 42/game,[<id>],"join_game",{"sessionId":"...","playerId":"...","nickname":"..."}
        
        const payload = JSON.stringify([
          "join_game",
          {
            sessionId: "test-session-id",
            playerId: `k6-user-${Math.floor(Math.random() * 10000)}`,
            nickname: `Spammer-${__VU}`
          }
        ]);

        // Spam every 500ms
        const intervalId = setInterval(() => {
           socket.send(`42/game,${payload}`);
        }, 500);

        // Run for a bit then close
        sleep(10);
        clearInterval(intervalId);
        socket.close();
      }
    });

    socket.on('close', () => console.log('Disconnected'));
    socket.on('error', (e) => console.log('Error: ', e.error()));
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
}
