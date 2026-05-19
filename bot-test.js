const { io } = require("socket.io-client");

// Cấu hình
const URL = "http://localhost:5000";
const ROOM_PIN = "082631"; // <--- Đổi mã PIN ở đây nếu tạo phòng mới
const TOTAL_BOTS = 15; // Số lượng bot muốn test
const BATCH_SIZE = 5; // Mỗi đợt kết nối bao nhiêu bot để tránh quá tải
const BATCH_DELAY = 1000; // Khoảng cách giữa các đợt (ms)

let connectedCount = 0;
let answeredCount = 0;

function createBot(botIndex) {
  const nickname = `Bot_${botIndex}`;
  let sessionId = null;
  let playerId = null;

  // 1. Kết nối vào Lobby
  const lobbySocket = io(`${URL}/lobby`, {
    reconnection: false,
    transports: ["websocket"],
  });

  lobbySocket.on("connect", () => {
    // 2. Tham gia phòng chờ
    lobbySocket.emit("join_room", {
      pin: ROOM_PIN,
      nickname: nickname,
    });
  });

  lobbySocket.on("room_joined", (data) => {
    connectedCount++;
    playerId = data.player.id;
    if (connectedCount % 50 === 0 || connectedCount === TOTAL_BOTS) {
      console.log(`[Lobby] Đã join phòng chờ: ${connectedCount}/${TOTAL_BOTS} bots`);
    }
  });

  lobbySocket.on("game_redirect", (data) => {
    sessionId = data.sessionId;

    // 3. Khi Host bắt đầu game, chuyển sang Game Socket
    const gameSocket = io(`${URL}/game`, {
      reconnection: false,
      transports: ["websocket"],
    });

    gameSocket.on("connect", () => {
      // Stagger join_game to prevent thundering herd (spread across 3 seconds)
      const jitter = Math.random() * 3000;
      setTimeout(() => {
        // 4. Tham gia Game
        gameSocket.emit("join_game", {
          sessionId: sessionId,
          playerId: playerId,
          nickname: nickname,
        });
      }, jitter);
    });

    gameSocket.on("question_start", (qData) => {
      const question = qData.question;
      if (!question || !question.answers || question.answers.length === 0) return;

      // 5. Nghĩ từ 1-4 giây rồi Random chọn đáp án
      const thinkTime = 1000 + Math.random() * 3000;

      setTimeout(() => {
        const randomIdx = Math.floor(Math.random() * question.answers.length);
        const answerId = question.answers[randomIdx].id;

        gameSocket.emit("submit_answer", {
          sessionId: sessionId,
          playerId: playerId,
          questionId: question.id,
          answerId: answerId,
          clientTimestamp: Date.now(),
        });
      }, thinkTime);
    });

    gameSocket.on("answer_received", (res) => {
      if (res.success) {
        answeredCount++;
        if (res.isCorrect) {
          console.log(`[${nickname}] Trả lời ĐÚNG! Cộng +${res.scoreEarned} điểm`);
        } else {
          console.log(`[${nickname}] Trả lời SAI! 0 điểm`);
        }
        if (answeredCount % 50 === 0) {
          console.log(`[Game] Đã xử lý ${answeredCount} câu trả lời...`);
        }
      }
    });

    gameSocket.on("game_ended", () => {
      gameSocket.disconnect();
      lobbySocket.disconnect();
    });

    gameSocket.on("disconnect", () => {
      // console.log(`[${nickname}] Game Socket bị ngắt kết nối`);
    });
  });

  lobbySocket.on("disconnect", () => {
    // console.log(`[${nickname}] Lobby Socket bị ngắt kết nối`);
  });
}

// Bắt đầu tạo bots từ từ để tránh nghẽn mạng cục bộ
console.log(`Bắt đầu tạo ${TOTAL_BOTS} bots...`);
let botsCreated = 0;

const interval = setInterval(() => {
  const end = Math.min(botsCreated + BATCH_SIZE, TOTAL_BOTS);
  for (let i = botsCreated; i < end; i++) {
    createBot(i);
  }
  botsCreated = end;

  if (botsCreated >= TOTAL_BOTS) {
    clearInterval(interval);
    console.log(`Đã gửi yêu cầu kết nối cho ${TOTAL_BOTS} bots. Chờ Host bắt đầu Game...`);
  }
}, BATCH_DELAY);
