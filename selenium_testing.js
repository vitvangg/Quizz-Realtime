import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// Customize this URL based on your VPS setup. For local docker-compose it's usually localhost:5000
const BASE_URL = __ENV.API_URL || 'http://localhost:5000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:5000';

// Default Socket.IO path is /socket.io/
const SOCKET_IO_URL = `${WS_URL}/socket.io/?EIO=4&transport=websocket`;

// Metrics
const joinRoomSuccess = new Rate('join_room_success');
const connectionErrors = new Counter('connection_errors');
const connectionTime = new Trend('connection_time');

export const options = {
  scenarios: {
    // Stage 1: Ramp up players joining the room
    join_room_ramp: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 200 }, // Ramp up to 200 users over 30s
        { duration: '1m', target: 500 },  // Ramp up to 500 users over 1m
        { duration: '30s', target: 1000 },// Ramp up to 1000 users over 30s
        { duration: '2m', target: 1000 }, // Stay at 1000 for 2m
        { duration: '30s', target: 0 },   // Scale down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    join_room_success: ['rate>0.95'], // 95% of join_room requests should succeed
    connection_errors: ['count<50'],  // Less than 50 connection errors
  },
};

// We need a known valid PIN to join a room. 
// Pass it via environment variable: k6 run -e ROOM_PIN=123456 load-test.js
const ROOM_PIN = __ENV.ROOM_PIN || '577605';

export default function () {
  const nickname = `Player_${__VU}_${__ITER}`;
  const res = ws.connect(SOCKET_IO_URL, function (socket) {
    socket.on('open', () => {
      // Wait for Engine.IO open packet before sending Socket.IO connect
    });

    socket.on('message', (msg) => {
      // Engine.IO open packet
      if (msg.startsWith('0')) {
        // Send Socket.IO connect packet for /game namespace
        socket.send('40/game,');
      }

      // Socket.IO connected packet for /game
      if (msg.startsWith('40/game')) {
        // Connected! Now emit join_room event
        const joinPayload = {
          pin: ROOM_PIN,
          nickname: nickname,
        };
        // 42 indicates a Socket.IO EVENT message
        // Format for namespace: 42/game,["event_name", payload]
        socket.send(`42/game,["join_room", ${JSON.stringify(joinPayload)}]`);
      }

      // Handle Socket.IO EVENT messages for /game
      if (msg.startsWith('42/game')) {
        try {
          // Extract the array part after the comma
          const eventDataString = msg.substring(msg.indexOf('['));
          const data = JSON.parse(eventDataString);
          const eventName = data[0];
          const eventPayload = data[1];

          if (eventName === 'room_joined') {
            joinRoomSuccess.add(1);
            // Save playerId for later game phase
            socket.playerId = eventPayload.player.id;
            // Now we wait in the room until the Host starts the game.
          }

          if (eventName === 'game_redirect') {
            const sessionId = eventPayload.sessionId;
            socket.sessionId = sessionId; // Save to socket for later use
            // Join the game session
            const joinGamePayload = {
              sessionId: sessionId,
              playerId: socket.playerId,
              nickname: nickname
            };
            // Emulate navigation delay (Thundering Herd prevention)
            // Real users take 1-3 seconds to load the new page and reconnect
            const navDelay = Math.random() * 3000;
            socket.setTimeout(() => {
              socket.send(`42/game,["join_game", ${JSON.stringify(joinGamePayload)}]`);
            }, navDelay);
          }

          if (eventName === 'question_start') {
            console.log(`[VU ${__VU}] Received question_start. Waiting to answer...`);
            // Emulate thinking time (1-4 seconds) before answering
            const thinkTime = 1000 + Math.random() * 3000;

            socket.setTimeout(() => {
              const question = eventPayload.question;
              if (question && question.answers && question.answers.length > 0) {
                // Randomly pick an answer (so statistically some bots will get points and rank high)
                const randomAnswerIndex = Math.floor(Math.random() * question.answers.length);
                const answerId = question.answers[randomAnswerIndex].id;

                const submitPayload = {
                  sessionId: socket.sessionId,
                  playerId: socket.playerId,
                  questionId: question.id,
                  answerId: answerId,
                  clientTimestamp: Date.now()
                };

                console.log(`[VU ${__VU}] Submitting answer ${answerId} for question ${question.id}`);
                socket.send(`42/game,["submit_answer", ${JSON.stringify(submitPayload)}]`);
              } else {
                console.log(`[VU ${__VU}] ERROR: question or answers missing in payload!`, JSON.stringify(eventPayload));
              }
            }, thinkTime);
          }

          if (eventName === 'answer_received') {
            console.log(`[VU ${__VU}] Answer received by server:`, JSON.stringify(eventPayload));
          }

          if (eventName === 'game_ended' || eventName === 'session_closed') {
            socket.close();
          }

          if (eventName === 'room_left') {
            socket.close();
          }

          if (eventName === 'exception') {
            console.error('Exception from server:', eventPayload);
            joinRoomSuccess.add(0);
          }
        } catch (e) {
          // Ignore parse errors for keep-alive or other packets
        }
      }

      // Handle Ping from server
      if (msg === '2') {
        socket.send('3'); // Send Pong
      }
    });

    socket.on('close', () => {
      // Connection closed
    });

    socket.on('error', (e) => {
      if (e.error() != 'websocket: close sent') {
        console.error('WebSocket connection error:', e.error());
        connectionErrors.add(1);
      }
    });
  });

  check(res, { 'status is 101': (r) => r && r.status === 101 });
  sleep(1);
}
