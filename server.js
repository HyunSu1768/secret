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
  teams: {}, // { name: { name, ws, alive, choice } }
  round: 1,
  choices: {}, // { number: [name, ...] }
  lastEliminated: null, // { round, eliminated: [{number, teams: [name, ...]}] }
};

const TEAM_LIMIT = 10; // 최대 참가자 수

// 참가 코드로 팀 참가
app.post('/join', (req, res) => {
  const { name } = req.body;
  if (game.started) return res.status(400).json({ error: '게임이 이미 시작되어 참가할 수 없습니다.' });
  if (Object.keys(game.teams).length >= TEAM_LIMIT) return res.status(400).json({ error: '방이 가득 찼습니다.' });
  if (Object.values(game.teams).some(team => team.name === name)) return res.status(400).json({ error: '이미 참가한 이름입니다.' });
  game.teams[name] = { name, ws: null, alive: true, choice: null };
  res.json({ success: true });
});

// 관리자 게임 시작
app.post('/start', (req, res) => {
  if (game.started) return res.status(400).json({ error: '이미 시작됨' });
  game.started = true;
  broadcastGameState();
  res.json({ success: true });
});

// 게임 상태 초기화 (관리자용)
app.post('/reset', (req, res) => {
  game = {
    started: false,
    teams: {},
    round: 1,
    choices: {},
    lastEliminated: null,
  };
  res.json({ success: true });
});

// WebSocket 연결
const server = app.listen(PORT, () => console.log(`Server on ${PORT}`));
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  ws.on('message', (msg) => {
    const data = JSON.parse(msg);
    if (data.type === 'register') {
      const { name } = data;
      if (game.teams[name]) {
        game.teams[name].ws = ws;
        send(ws, { type: 'registered', name });
        broadcastGameState();
      }
    }
    if (data.type === 'choose') {
      const { name, number } = data;
      if (game.teams[name] && game.teams[name].alive && game.started) {
        game.teams[name].choice = number;
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
    lastEliminated: game.lastEliminated,
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
    aliveTeams.forEach(([name, t]) => {
      if (!choices[t.choice]) choices[t.choice] = [];
      choices[t.choice].push(name);
    });
    // 중복 선택한 팀 탈락 및 기록
    const eliminated = [];
    Object.entries(choices).forEach(([num, names]) => {
      if (names.length > 1) {
        names.forEach(name => { game.teams[name].alive = false; });
        eliminated.push({ number: Number(num), teams: names });
      }
    });
    // 라운드 탈락 결과 저장
    if (eliminated.length > 0) {
      game.lastEliminated = { round: game.round, eliminated };
    } else {
      game.lastEliminated = null;
    }
    // 다음 라운드 준비
    aliveTeams.forEach(([name, t]) => { t.choice = null; });
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
  game.lastEliminated = null;
  Object.values(game.teams).forEach(t => {
    t.alive = true;
    t.choice = null;
  });
  broadcastGameState();
} 