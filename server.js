const express = require('express');
const cors = require('cors');
const { WebSocketServer } = require('ws');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = 4000;

// 게임 상태
let game = {
  started: false,
  teams: {}, // { teamCode: { name, ws, alive, choice } }
  round: 1,
  choices: {}, // { number: [teamCode, ...] }
};

const TEAM_LIMIT = 10; // 최대 참가자 수

// 참가 코드로 팀 참가
app.post('/join', (req, res) => {
  const { teamCode, name } = req.body;
  if (Object.keys(game.teams).length >= TEAM_LIMIT) return res.status(400).json({ error: '방이 가득 찼습니다.' });
  if (game.teams[teamCode]) return res.status(400).json({ error: '이미 참가한 코드입니다.' });
  game.teams[teamCode] = { name, ws: null, alive: true, choice: null };
  res.json({ success: true });
});

// 관리자 게임 시작
app.post('/start', (req, res) => {
  if (game.started) return res.status(400).json({ error: '이미 시작됨' });
  game.started = true;
  broadcastGameState();
  res.json({ success: true });
});

// WebSocket 연결
const server = app.listen(PORT, () => console.log(`Server on ${PORT}`));
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'register') {
      const { teamCode } = data;
      if (game.teams[teamCode]) {
        game.teams[teamCode].ws = ws;
        send(ws, { type: 'registered', teamCode });
        broadcastGameState();
      }
    }
    if (data.type === 'choose') {
      const { teamCode, number } = data;
      if (game.teams[teamCode] && game.teams[teamCode].alive && game.started) {
        game.teams[teamCode].choice = number;
        broadcastGameState();
        checkAllChosen();
      }
    }
  });
  ws.on('close', () => {
    // 연결 종료시 처리 (선택)
  });
});

function send(ws, data) {
  try { ws.send(JSON.stringify(data)); } catch {}
}

function broadcastGameState() {
  const state = {
    type: 'state',
    started: game.started,
    round: game.round,
    teams: Object.fromEntries(
      Object.entries(game.teams).map(([k, v]) => [k, { name: v.name, alive: v.alive, choice: v.choice }])
    ),
  };
  Object.values(game.teams).forEach(team => {
    if (team.ws) send(team.ws, state);
  });
}

function checkAllChosen() {
  const aliveTeams = Object.entries(game.teams).filter(([_, t]) => t.alive);
  if (aliveTeams.every(([_, t]) => t.choice !== null)) {
    // 결과 처리
    const choices = {};
    aliveTeams.forEach(([code, t]) => {
      if (!choices[t.choice]) choices[t.choice] = [];
      choices[t.choice].push(code);
    });
    // 중복 선택한 팀 탈락
    Object.entries(choices).forEach(([num, codes]) => {
      if (codes.length > 1) {
        codes.forEach(code => { game.teams[code].alive = false; });
      }
    });
    // 다음 라운드 준비
    aliveTeams.forEach(([code, t]) => { t.choice = null; });
    game.round += 1;
    broadcastGameState();

    // 승자 판정
    const alive = Object.values(game.teams).filter(t => t.alive);
    if (alive.length === 1) {
      Object.values(game.teams).forEach(team => {
        if (team.ws) send(team.ws, { type: 'winner', winner: alive[0].name });
      });
      resetGame();
    } else if (alive.length === 0) {
      Object.values(game.teams).forEach(team => {
        if (team.ws) send(team.ws, { type: 'draw' });
      });
      resetGame();
    }
  }
}

function resetGame() {
  game.started = false;
  game.round = 1;
  Object.values(game.teams).forEach(t => {
    t.alive = true;
    t.choice = null;
  });
  broadcastGameState();
} 