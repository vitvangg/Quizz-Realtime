import ws from 'k6/ws';
import { check, sleep } from 'k6';

export const options = {
  stages: [
    { duration: '1m', target: 100 }, // Ramp up to 100 players
    { duration: '3m', target: 100 }, // Stay at 100 players
    { duration: '1m', target: 0 },   // Ramp down
  ],
};

const BASE_URL = __ENV.BASE_URL || 'ws://localhost:5000/socket.io/?EIO=4&transport=websocket';

export default function () {
  const params = { tags: { my_tag: 'stress_test' } };

  const res = ws.connect(BASE_URL, params, function (socket) {
    socket.on('open', () => {
       // Handshake
    });

    socket.on('message', function (data) {
      if (data === '2') socket.send('3'); // Heartbeat

      if (data.startsWith('0')) {
        socket.send('40/game,');
      }

      if (data.startsWith('40/game,')) {
        // 1. Join game
        socket.send(`42/game,["join_game",{"sessionId":"stress-session","playerId":"VU-${__VU}","nickname":"Player-${__VU}"}]`);
      }

      // Simulate player logic when receiving question
      if (data.includes('question_start')) {
        // Random thinking time 1-5s
        sleep(Math.random() * 4 + 1);
        
        // 2. Submit answer
        const answerPayload = JSON.stringify([
          "submit_answer",
          {
            sessionId: "stress-session",
            playerId: `VU-${__VU}`,
            questionId: "q1",
            answerId: "a1",
            clientTimestamp: Date.now()
          }
        ]);
        socket.send(`42/game,${answerPayload}`);
      }
    });

    // Stay connected for the duration of the test
    socket.setTimeout(() => {
      socket.close();
    }, 60000);
  });

  check(res, { 'connected': (r) => r && r.status === 101 });
}
