import type { FastifyInstance } from 'fastify';
import { randomBytes } from 'node:crypto';
import { WebSocketServer, WebSocket } from 'ws';
import type { AppDatabase } from './database.js';

type InputMessage = {
  type: 'input';
  dir: -1 | 0 | 1;
};

type CreateRoomMessage = {
  type: 'create_room';
  nickname?: string;
};

type JoinRoomMessage = {
  type: 'join_room';
  roomCode: string;
  nickname?: string;
};

type JoinTournamentMatchMessage = {
  type: 'join_tournament_match';
  tournamentId: number;
  matchId: string;
  nickname?: string;
};

type PingMessage = { type: 'ping' };

type ClientMessage = InputMessage | CreateRoomMessage | JoinRoomMessage | JoinTournamentMatchMessage | PingMessage;

type PlayerState = {
  y: number;
  score: number;
  nickname?: string;
};

type GameState = {
  width: number;
  height: number;
  lineWidth: number;
  paddleWidth: number;
  paddleGap: number;
  paddleHeight: number;
  playerSpeed: number;
  ball: {
    x: number;
    y: number;
    dx: number;
    dy: number;
    speed: number;
    radius: number;
  };
  active: boolean;
  players: PlayerState[];
};

type Room = {
  code: string;
  state: GameState;
  clients: Array<{
    id: string;
    socket: WebSocket;
    playerIndex: 0 | 1;
    dir: -1 | 0 | 1;
    userId?: number;
  }>;
  loop?: NodeJS.Timeout;
  startTime?: Date;
  db?: AppDatabase;
  gameEnded?: boolean;
};

const RATIO = 1.79672131148;
const WIDTH = 1200;
const HEIGHT = Math.round(WIDTH / RATIO);
const PADDLE_WIDTH = HEIGHT / 50.8;
const PADDLE_HEIGHT = (WIDTH * 2) / 17.96;
const PADDLE_GAP = WIDTH / 46;
const PADDLE_SPEED = WIDTH / 92;
const LINE_WIDTH = WIDTH / 92;
const BALL_RADIUS = WIDTH / 90;
const BALL_SPEED = WIDTH / 90;
const TICK_MS = 1000 / 60;

const rooms = new Map<string, Room>();

const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));

const makeCode = () => randomBytes(2).toString('hex').slice(0, 4);

const makeTournamentRoomCode = (tournamentId: number, matchId: string) => {
  return `tournament-${tournamentId}-${matchId}`;
};

const createInitialState = (): GameState => ({
  width: WIDTH,
  height: HEIGHT,
  lineWidth: LINE_WIDTH,
  paddleWidth: PADDLE_WIDTH,
  paddleGap: PADDLE_GAP,
  paddleHeight: PADDLE_HEIGHT,
  playerSpeed: PADDLE_SPEED,
  ball: {
    x: WIDTH / 2,
    y: HEIGHT / 2,
    dx: -1,
    dy: 0,
    speed: BALL_SPEED,
    radius: BALL_RADIUS
  },
  active: false,
  players: [
    { y: PADDLE_WIDTH, score: 0 },
    { y: HEIGHT - PADDLE_WIDTH - PADDLE_HEIGHT, score: 0 }
  ]
});

const broadcast = (room: Room, payload: unknown) => {
  const data = JSON.stringify(payload);
  for (const client of room.clients) {
    if (client.socket.readyState === client.socket.OPEN) {
      client.socket.send(data);
    }
  }
};

const resetBall = (state: GameState) => {
  state.ball.x = WIDTH / 2;
  state.ball.y = HEIGHT / 2;
  const totalScore = state.players[0].score + state.players[1].score;
  state.ball.dx = (totalScore % 4) < 2 ? -1 : 1;
  state.ball.dy = 0;
  state.ball.speed = BALL_SPEED;
  state.active = false;
};

const handleGoal = async (room: Room, scoringIndex: 0 | 1) => {
  if (room.gameEnded) {
    return;
  }

  const state = room.state;
  state.players[scoringIndex].score += 1;

  const scoreA = state.players[0].score;
  const scoreB = state.players[1].score;

  if (scoreA >= 11 && scoreA - scoreB >= 2) {
    room.gameEnded = true;
    state.active = false;
    const endTime = new Date();
    const duration = room.startTime 
      ? Math.floor((endTime.getTime() - room.startTime.getTime()) / 1000)
      : 0;
    const player1 = room.clients.find(c => c.playerIndex === 0);
    const player2 = room.clients.find(c => c.playerIndex === 1);
    
    console.log('Oyun bitti - Player A kazandı:', {
      roomCode: room.code,
      hasDb: !!room.db,
      player1Id: player1?.userId,
      player2Id: player2?.userId,
      player1Nickname: state.players[0].nickname,
      player2Nickname: state.players[1].nickname,
      scoreA,
      scoreB
    });
    
    if (room.db) {
      try {
        const result = await room.db.run(`
          INSERT INTO game_sessions (
            player1_id, player1_nickname,
            player2_id, player2_nickname,
            winner_id, winner_nickname,
            player1_score, player2_score,
            game_type, tournament_id, match_id,
            started_at, ended_at, duration_seconds
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          player1?.userId || null,
          state.players[0].nickname || 'Player 1',
          player2?.userId || null,
          state.players[1].nickname || 'Player 2',
          player1?.userId || null,
          state.players[0].nickname || 'Player 1',
          scoreA,
          scoreB,
          room.code.startsWith('tournament-') ? 'tournament' : 'casual',
          room.code.startsWith('tournament-') 
            ? parseInt(room.code.split('-')[1]) || null 
            : null,
          room.code.startsWith('tournament-') 
            ? room.code.split('-').slice(2).join('-') 
            : null,
          room.startTime ? room.startTime.toISOString() : endTime.toISOString(),
          endTime.toISOString(),
          duration
        );
        console.log('Oyun oturumu başarıyla kaydedildi (Player A kazandı):', result.lastID);
      } catch (error) {
        console.error('Oyun oturumu kaydedilemedi (Player A kazandı):', error);
        console.error('Room:', {
          code: room.code,
          hasDb: !!room.db,
          player1: player1?.userId,
          player2: player2?.userId,
          startTime: room.startTime?.toISOString(),
          endTime: endTime.toISOString()
        });
      }
    } else {
      console.error('room.db undefined! Oyun kaydedilemedi (Player A kazandı)');
    }

    broadcast(room, {
      type: 'game_won',
      winner: 0,
      winnerScore: scoreA,
      loserScore: scoreB
    });
    if (room.loop) {
      clearInterval(room.loop);
      room.loop = undefined;
    }
    return;
  }

  if (scoreB >= 11 && scoreB - scoreA >= 2) {
    room.gameEnded = true;
    state.active = false;
    const endTime = new Date();
    const duration = room.startTime 
      ? Math.floor((endTime.getTime() - room.startTime.getTime()) / 1000)
      : 0;
    const player1 = room.clients.find(c => c.playerIndex === 0);
    const player2 = room.clients.find(c => c.playerIndex === 1);
    
    console.log('Oyun bitti - Player B kazandı:', {
      roomCode: room.code,
      hasDb: !!room.db,
      player1Id: player1?.userId,
      player2Id: player2?.userId,
      player1Nickname: state.players[0].nickname,
      player2Nickname: state.players[1].nickname,
      scoreA,
      scoreB
    });
    
    if (room.db) {
      try {
        const result = await room.db.run(`
          INSERT INTO game_sessions (
            player1_id, player1_nickname,
            player2_id, player2_nickname,
            winner_id, winner_nickname,
            player1_score, player2_score,
            game_type, tournament_id, match_id,
            started_at, ended_at, duration_seconds
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `,
          player1?.userId || null,
          state.players[0].nickname || 'Player 1',
          player2?.userId || null,
          state.players[1].nickname || 'Player 2',
          player2?.userId || null,
          state.players[1].nickname || 'Player 2',
          scoreA,
          scoreB,
          room.code.startsWith('tournament-') ? 'tournament' : 'casual',
          room.code.startsWith('tournament-') 
            ? parseInt(room.code.split('-')[1]) || null 
            : null,
          room.code.startsWith('tournament-') 
            ? room.code.split('-').slice(2).join('-') 
            : null,
          room.startTime ? room.startTime.toISOString() : endTime.toISOString(),
          endTime.toISOString(),
          duration
        );
        console.log('Oyun oturumu başarıyla kaydedildi (Player B kazandı):', result.lastID);
      } catch (error) {
        console.error('Oyun oturumu kaydedilemedi (Player B kazandı):', error);
        console.error('Room:', {
          code: room.code,
          hasDb: !!room.db,
          player1: player1?.userId,
          player2: player2?.userId,
          startTime: room.startTime?.toISOString(),
          endTime: endTime.toISOString()
        });
      }
    } else {
      console.error('room.db undefined! Oyun kaydedilemedi (Player B kazandı)');
    }

    broadcast(room, {
      type: 'game_won',
      winner: 1,
      winnerScore: scoreB,
      loserScore: scoreA
    });
    if (room.loop) {
      clearInterval(room.loop);
      room.loop = undefined;
    }
    return;
  }

  resetBall(state);
};

const collideWithPlayer = (playerY: number, ball: GameState['ball']) => {
  const dist = (ball.y - (playerY + PADDLE_HEIGHT / 2)) / (PADDLE_HEIGHT / 2);
  const angle = dist * (Math.PI / 4);
  const direction = ball.dx < 0 ? 1 : -1;
  ball.dx = Math.cos(angle) * direction;
  ball.dy = Math.sin(angle);
  ball.speed *= 1.05;
};

const tickRoom = (room: Room) => {
  const state = room.state;
  if (room.gameEnded) {
    broadcast(room, { type: 'state', state });
    return;
  }

  state.players.forEach((player, index) => {
    const client = room.clients.find((c) => c.playerIndex === index);
    if (!client) return;
    if (client.dir === 0) return;
    player.y = clamp(
      player.y + client.dir * state.playerSpeed,
      0,
      state.height - state.paddleHeight
    );
    state.active = true;
  });

  if (state.active) {
    state.ball.x += state.ball.dx * state.ball.speed;
    state.ball.y += state.ball.dy * state.ball.speed;
  }

  if (
    (state.ball.dy < 0 && state.ball.y < state.lineWidth) ||
    (state.ball.dy > 0 && state.height - state.ball.y < state.lineWidth)
  ) {
    state.ball.dy *= -1;
  }

  if (!room.gameEnded) {
    if (state.lineWidth / 2 > state.ball.x) {
      void handleGoal(room, 1);
    }

    if (state.width - state.ball.x < state.lineWidth / 2) {
      void handleGoal(room, 0);
    }
  }

  if (
    state.ball.dx < 0 &&
    state.ball.x - state.ball.radius <= state.paddleGap + state.paddleWidth &&
    state.ball.y >= state.players[0].y &&
    state.ball.y <= state.players[0].y + state.paddleHeight
  ) {
    state.ball.x = state.paddleGap + state.paddleWidth + state.ball.radius;
    collideWithPlayer(state.players[0].y, state.ball);
  }

  if (
    state.ball.dx > 0 &&
    state.ball.x + state.ball.radius >= state.width - state.paddleGap - state.paddleWidth &&
    state.ball.y >= state.players[1].y &&
    state.ball.y <= state.players[1].y + state.paddleHeight
  ) {
    state.ball.x = state.width - state.paddleGap - state.paddleWidth - state.ball.radius;
    collideWithPlayer(state.players[1].y, state.ball);
  }

  broadcast(room, { type: 'state', state });
};

const ensureLoop = (room: Room) => {
  if (room.loop) return;
  room.loop = setInterval(() => tickRoom(room), TICK_MS);
};

const teardownRoom = (roomCode: string) => {
  const room = rooms.get(roomCode);
  if (!room) return;
  if (room.loop) {
    clearInterval(room.loop);
  }
  rooms.delete(roomCode);
};

const bindClient = (socket: WebSocket, room: Room, playerIndex: 0 | 1) => {
  const clientId = randomBytes(8).toString('hex');
  const client: { id: string; socket: WebSocket; playerIndex: 0 | 1; dir: -1 | 0 | 1 } = {
    id: clientId,
    socket,
    playerIndex,
    dir: 0
  };
  room.clients.push(client);

  const handleInput = (data: Buffer | string) => {
    let parsed: ClientMessage | null = null;
    try {
      parsed = JSON.parse(String(data)) as ClientMessage;
    } catch {
      return;
    }

    if (parsed.type === 'input') {
      const foundClient = room.clients.find((c) => c.id === clientId);
      if (!foundClient) return;
      foundClient.dir = parsed.dir;
    } else if (parsed.type === 'ping') {
      socket.send(JSON.stringify({ type: 'pong' }));
    }
  };

  socket.on('message', handleInput);

  const handleClose = () => {
    room.clients = room.clients.filter((c) => c.id !== clientId);
    if (room.clients.length === 0) {
      teardownRoom(room.code);
    } else {
      broadcast(room, { type: 'opponent_left' });
      if (room.loop) {
        clearInterval(room.loop);
        room.loop = undefined;
      }
    }
  };

  socket.on('close', handleClose);

  socket.send(JSON.stringify({
    type: 'room_joined',
    roomCode: room.code,
    playerIndex
  }));
  if (room.clients.length === 2) {
    ensureLoop(room);
  }
};

export const registerGameWebSocket = (app: FastifyInstance) => {
  const wss = new WebSocketServer({ noServer: true });
  const db = (app as any).db as AppDatabase | undefined;
  console.log('registerGameWebSocket: db initialized:', !!db);
  app.server.on('upgrade', (request, socket, head) => {
    if (!request.url?.startsWith('/ws/game')) {
      return;
    }

    wss.handleUpgrade(request, socket, head, (ws) => {
      wss.emit('connection', ws, request);
    });
  });

  wss.on('connection', (socket, request) => {
    const url = new URL(request.url ?? '', `http://${request.headers.host ?? 'localhost'}`);
    const nickname = url.searchParams.get('nickname') ?? undefined;
    const userIdParam = url.searchParams.get('userId');
    const userId = userIdParam ? parseInt(userIdParam, 10) : undefined;
    let roomCode: string | null = null;
    let activeRoom: Room | null = null;

    const sendError = (message: string) => {
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'error', message }));
      }
      socket.close();
    };

    const assignToRoom = (room: Room) => {
      const playerIndex: 0 | 1 = room.clients.length === 0 ? 0 : 1;
      room.state.players[playerIndex].nickname = nickname;
      if (room.clients.length === 0) {
        room.startTime = new Date();
      }
      if (!room.db) {
        room.db = db || undefined;
        console.log('assignToRoom: room.db ayarlandı:', !!room.db, 'db var mı:', !!db);
      }
      activeRoom = room;
      roomCode = room.code;
      bindClient(socket, room, playerIndex);
      const client = room.clients.find(c => c.socket === socket);
      if (client && userId) {
        client.userId = userId;
      }
      socket.send(JSON.stringify({ type: 'state', state: room.state }));
    };

    socket.on('message', (data) => {
      let parsed: ClientMessage | null = null;
      try {
        parsed = JSON.parse(String(data)) as ClientMessage;
      } catch {
        return sendError('Geçersiz mesaj');
      }

      if (parsed.type === 'input' || parsed.type === 'ping') {
        return;
      }
      if (activeRoom) {
        return sendError('Zaten bir odadasınız');
      }

      if (parsed.type === 'create_room') {
        const code = makeCode();
        const room: Room = {
          code,
          state: createInitialState(),
          clients: [],
          startTime: new Date(),
          db: db || undefined,
          gameEnded: false
        };
        rooms.set(code, room);
        assignToRoom(room);
      } else if (parsed.type === 'join_room') {
        const requested = parsed.roomCode;
        const room = rooms.get(requested);
        if (!room) return sendError('Oda bulunamadı');
        if (room.clients.length >= 2) return sendError('Oda dolu');
        assignToRoom(room);
      } else if (parsed.type === 'join_tournament_match') {
        const code = makeTournamentRoomCode(parsed.tournamentId, parsed.matchId);
        let room = rooms.get(code);
        if (!room) {
          room = {
            code,
            state: createInitialState(),
            clients: [],
            startTime: new Date(),
            db: db || undefined,
            gameEnded: false
          };
          rooms.set(code, room);
        }

        if (room.clients.length >= 2) {
          return sendError('Oda dolu');
        }

        assignToRoom(room);
      }
    });

    socket.on('close', () => {
      activeRoom = null;
      roomCode = null;
    });

    socket.on('error', (error) => {
      console.error('WebSocket error:', error);
    });
  });
};
