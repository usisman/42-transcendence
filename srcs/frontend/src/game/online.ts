import type { StoredUser } from '../utils/storage';

const RATIO = 1.79672131148;

type ServerState = {
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
  players: Array<{ y: number; score: number; nickname?: string }>;
};

type ServerMessage =
  | { type: 'room_joined'; roomCode: string; playerIndex: number }
  | { type: 'state'; state: ServerState }
  | { type: 'error'; message: string }
  | { type: 'opponent_left' }
  | { type: 'pong' }
  | { type: 'game_won'; winner: 0 | 1; winnerScore: number; loserScore: number };

type Controls = {
  createButton: HTMLButtonElement;
  joinButton: HTMLButtonElement;
  roomInput: HTMLInputElement;
  statusEl: HTMLElement;
};

const wsUrl = () => {
  const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
  return `${protocol}://${location.host}/ws/game`;
};

const resizeCanvas = (canvas: HTMLCanvasElement) => {
  canvas.height = window.innerHeight * 0.6;
  canvas.width = canvas.height * RATIO;
};

class OnlineGameClient {
  private ws: WebSocket | null = null;
  private state: ServerState | null = null;
  private animationId: number | null = null;
  private pressedKeys = new Set<string>();
  private playerIndex: number | null = null;
  private roomCode: string | null = null;
  private handleResize: () => void;
  private gameEnded: boolean = false;
  private controlsHiddenForActiveGame: boolean = false;
  private tournamentMatchData: { tournamentId: string; matchId: string; opponentIsAI?: boolean; tournamentName?: string; roundNumber?: number } | null = null;
  private onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void;

  constructor(
    private canvas: HTMLCanvasElement,
    private scoreAEl: HTMLElement,
    private scoreBEl: HTMLElement,
    private controls: Controls,
    private user: StoredUser,
    tournamentMatchData?: { tournamentId: string; matchId: string; tournamentName?: string; roundNumber?: number },
    onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void
  ) {
    this.tournamentMatchData = tournamentMatchData || null;
    this.onTournamentMatchEnd = onTournamentMatchEnd;
    this.attachInputHandlers();
    resizeCanvas(canvas);
    this.handleResize = () => resizeCanvas(canvas);
    window.addEventListener('resize', this.handleResize);
  }

  private setStatus(message: string, type: 'info' | 'success' | 'error' = 'info') {
    this.controls.statusEl.textContent = message;
    this.controls.statusEl.className = 'text-sm font-medium px-4 py-3 rounded-xl text-center transition-all duration-200';

    if (type === 'success') {
      this.controls.statusEl.className += ' bg-emerald-500/20 text-emerald-300 border border-emerald-500/30';
    } else if (type === 'error') {
      this.controls.statusEl.className += ' bg-red-500/20 text-red-300 border border-red-500/30';
    } else {
      if (this.tournamentMatchData) {
        this.controls.statusEl.className += ' bg-yellow-500/20 text-yellow-300 border border-yellow-500/50';
      } else {
        this.controls.statusEl.className += ' bg-slate-700/50 text-slate-300 border border-slate-600/50';
      }
    }
  }

  private stopAnimation() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  private startAnimation() {
    if (this.animationId !== null) return;
    const ctx = this.canvas.getContext('2d');
    if (!ctx) return;

    const drawLine = (x: number, y: number, dx: number, dy: number, lineWidth: number) => {
      ctx.beginPath();
      ctx.strokeStyle = 'black';
      ctx.lineWidth = lineWidth;
      ctx.moveTo(x, y);
      ctx.lineTo(x + dx, y + dy);
      ctx.stroke();
    };

    const render = () => {
      if (this.gameEnded) {
        return;
      }

      if (this.state) {
        const { state } = this;
        const scaleX = this.canvas.width / state.width;
        const scaleY = this.canvas.height / state.height;
        ctx.fillStyle = '#7dd3fc';
        ctx.fillRect(0, 0, this.canvas.width, this.canvas.height);

        const lineWidth = state.lineWidth * scaleX;
        drawLine(0, 0, this.canvas.width, 0, lineWidth);
        drawLine(0, 0, 0, this.canvas.height, lineWidth);
        drawLine(this.canvas.width, 0, 0, this.canvas.height, lineWidth);
        drawLine(0, this.canvas.height, this.canvas.width, 0, lineWidth);
        drawLine(this.canvas.width / 2, 0, 0, this.canvas.height, lineWidth / 2);

        ctx.fillStyle = 'black';
        state.players.forEach((player, index) => {
          const x =
            index === 0
              ? state.paddleGap * scaleX
              : this.canvas.width - state.paddleGap * scaleX - state.paddleWidth * scaleX;
          const y = player.y * scaleY;
          ctx.fillRect(x, y, state.paddleWidth * scaleX, state.paddleHeight * scaleY);
        });

        ctx.fillStyle = 'orange';
        ctx.beginPath();
        ctx.arc(
          state.ball.x * scaleX,
          state.ball.y * scaleY,
          state.ball.radius * scaleX,
          0,
          Math.PI * 2
        );
        ctx.fill();
      }

      this.animationId = requestAnimationFrame(render);
    };

    this.animationId = requestAnimationFrame(render);
  }

  private attachInputHandlers() {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
        event.preventDefault();
      }
      this.pressedKeys.add(event.key);
      this.pushInput();
    };

    const onKeyUp = (event: KeyboardEvent) => {
      this.pressedKeys.delete(event.key);
      this.pushInput();
    };

    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('keyup', onKeyUp);

    (this as unknown as { cleanupInput?: () => void }).cleanupInput = () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('keyup', onKeyUp);
    };
  }

  private pushInput() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN || this.playerIndex === null) return;

    let dir: -1 | 0 | 1 = 0;
    const upKeys = this.playerIndex === 0 ? ['w', 'W'] : ['ArrowUp'];
    const downKeys = this.playerIndex === 0 ? ['s', 'S'] : ['ArrowDown'];

    if (upKeys.some((key) => this.pressedKeys.has(key))) dir = -1;
    if (downKeys.some((key) => this.pressedKeys.has(key))) dir = 1;

    this.ws.send(JSON.stringify({ type: 'input', dir }));
  }

  private updateScores() {
    if (!this.state) return;
    this.scoreAEl.textContent = `A: ${this.state.players[0]?.score ?? 0}`;
    this.scoreBEl.textContent = `B: ${this.state.players[1]?.score ?? 0}`;
  }

  private handleMessage(event: MessageEvent<string>) {
    let parsed: ServerMessage | null = null;
    try {
      parsed = JSON.parse(event.data) as ServerMessage;
    } catch {
      return;
    }

    if (parsed.type === 'room_joined') {
      this.playerIndex = parsed.playerIndex;
      this.roomCode = parsed.roomCode;

      if (this.tournamentMatchData) {
        const roundLabel = this.tournamentMatchData.roundNumber === undefined
          ? 'Turnuva Maçı'
          : this.tournamentMatchData.roundNumber === 1
            ? 'Round 1'
            : `Round ${this.tournamentMatchData.roundNumber}`;
        const tournamentName = this.tournamentMatchData.tournamentName || 'Turnuva';
        this.setStatus(`🏆 ${tournamentName} - ${roundLabel} | Sen: Oyuncu ${parsed.playerIndex === 0 ? 'A' : 'B'}`, 'success');
      } else {
        this.setStatus(`Oda: ${parsed.roomCode} | Sen: Oyuncu ${parsed.playerIndex === 0 ? 'A' : 'B'}`, 'success');
      }
    } else if (parsed.type === 'state') {
      this.state = parsed.state;
      this.updateScores();
      this.startAnimation();
      if (this.state.active && !this.controlsHiddenForActiveGame) {
        this.controlsHiddenForActiveGame = true;
        this.controls.createButton.style.display = 'none';
        this.controls.joinButton.style.display = 'none';
        this.controls.roomInput.style.display = 'none';
      }
    } else if (parsed.type === 'error') {
      this.setStatus(parsed.message, 'error');
    } else if (parsed.type === 'opponent_left') {
      this.gameEnded = true;
      this.stopAnimation();

      if (this.tournamentMatchData) {
        this.controls.statusEl.innerHTML = `
          <div class="text-center">
            <div class="text-xl font-extrabold mb-2 text-yellow-400">⚠️ Rakip Ayrıldı</div>
            <div class="text-lg font-bold mb-1 text-yellow-300">Rakip oyuncu bağlantısını kesti.</div>
            <div class="text-sm text-slate-300 mb-4">Turnuvaya dönmek için butona tıklayın.</div>
            <button class="px-6 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold hover:from-sky-600 hover:to-indigo-700 transition-all duration-200" data-action="back-to-tournament" data-tournament-id="${this.tournamentMatchData.tournamentId}">
              Turnuvaya Dön
            </button>
          </div>
        `;
        this.controls.statusEl.className = 'text-sm font-medium px-6 py-4 rounded-xl text-center border-2 shadow-lg transition-all duration-200 bg-gradient-to-br from-yellow-500/20 to-yellow-600/20 text-yellow-300 border-yellow-500/50';

        const backButton = this.controls.statusEl.querySelector<HTMLButtonElement>('[data-action="back-to-tournament"]');
        if (backButton) {
          const tournamentId = backButton.dataset.tournamentId || this.tournamentMatchData.tournamentId;
          backButton.addEventListener('click', () => {
            setTimeout(() => {
              location.hash = `/tournament?tournament=${tournamentId}`;
            }, 100);
          });
        }
      } else {
        this.setStatus('Rakip ayrıldı, oda kapatıldı.', 'error');
      }
    } else if (parsed.type === 'game_won') {
      this.gameEnded = true;
      this.stopAnimation();
      const winnerName = parsed.winner === 0 ? 'A' : 'B';
      const isYou = this.playerIndex === parsed.winner;
      const winner: 'A' | 'B' = parsed.winner === 0 ? 'A' : 'B';
      const scoreA = parsed.winner === 0 ? parsed.winnerScore : parsed.loserScore;
      const scoreB = parsed.winner === 1 ? parsed.winnerScore : parsed.loserScore;

      if (this.tournamentMatchData && this.onTournamentMatchEnd) {
        this.onTournamentMatchEnd(winner, scoreA, scoreB);
      }

      this.controls.statusEl.innerHTML = `
        <div class="text-center">
          <div class="text-2xl font-extrabold mb-2 ${isYou ? 'text-emerald-400' : 'text-red-400'}">${isYou ? '🎉 Oyun Bitti! 🎉' : '😔 Oyun Bitti'}</div>
          <div class="text-xl font-bold mb-1 ${isYou ? 'text-emerald-300' : 'text-red-300'}">${isYou ? 'Sen Kazandın!' : `Oyuncu ${winnerName} Kazandı!`}</div>
          <div class="text-lg text-slate-300">Skor: ${parsed.winnerScore} - ${parsed.loserScore}</div>
          ${this.tournamentMatchData ? `<div class="mt-4"><button class="px-6 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold hover:from-sky-600 hover:to-indigo-700 transition-all duration-200" data-action="back-to-tournament" data-tournament-id="${this.tournamentMatchData.tournamentId}">Turnuvaya Dön</button></div>` : ''}
        </div>
      `;
      this.controls.statusEl.className = `text-sm font-medium px-6 py-4 rounded-xl text-center border-2 shadow-lg transition-all duration-200 ${
        isYou
          ? 'bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 text-emerald-300 border-emerald-500/50'
          : 'bg-gradient-to-br from-red-500/20 to-red-600/20 text-red-300 border-red-500/50'
      }`;

      const backButton = this.controls.statusEl.querySelector<HTMLButtonElement>('[data-action="back-to-tournament"]');
      if (backButton && this.tournamentMatchData) {
        const tournamentId = backButton.dataset.tournamentId || this.tournamentMatchData.tournamentId;
        backButton.addEventListener('click', () => {
          setTimeout(() => {
            location.hash = `/tournament?tournament=${tournamentId}`;
          }, 500);
        });
      }
    }
  }

  private connect(action: 'create' | 'join' | 'tournament', roomCode?: string) {
    if (this.ws) {
      this.ws.close();
    }

    this.playerIndex = null;
    this.roomCode = null;
    this.state = null;
    this.stopAnimation();

    const url = `${wsUrl()}?nickname=${encodeURIComponent(this.user.nickname)}&userId=${this.user.id}`;
    this.ws = new WebSocket(url);
    this.ws.addEventListener('message', (ev) => this.handleMessage(ev));
    this.ws.addEventListener('open', () => {
      if (action === 'create') {
        this.ws?.send(JSON.stringify({ type: 'create_room', nickname: this.user.nickname }));
        this.setStatus('Oda oluşturuluyor...', 'info');
      } else if (action === 'join' && roomCode) {
        this.ws?.send(
          JSON.stringify({
            type: 'join_room',
            roomCode,
            nickname: this.user.nickname
          })
        );
        this.setStatus(`Odaya bağlanılıyor (${roomCode})...`, 'info');
      } else if (action === 'tournament' && this.tournamentMatchData) {
        this.ws?.send(
          JSON.stringify({
            type: 'join_tournament_match',
            tournamentId: Number(this.tournamentMatchData.tournamentId),
            matchId: this.tournamentMatchData.matchId,
            nickname: this.user.nickname
          })
        );
        this.setStatus('Turnuva maçına bağlanılıyor...', 'info');
      }
    });

    this.ws.addEventListener('close', () => {
      this.setStatus('Bağlantı kapandı.', 'error');
    });
  }

  joinTournamentMatch() {
    if (this.tournamentMatchData) {
      this.connect('tournament');
    }
  }

  createRoom() {
    this.connect('create');
  }

  joinRoom(roomCode: string) {
    const cleanCode = roomCode.trim();
    if (!cleanCode) {
      this.setStatus('Oda kodu gerekli.');
      return;
    }
    this.connect('join', cleanCode);
  }

  destroy() {
    this.ws?.close();
    this.stopAnimation();
    (this as unknown as { cleanupInput?: () => void }).cleanupInput?.();
    window.removeEventListener('resize', this.handleResize);
  }
}

export const initializeOnlineGame = (
  canvas: HTMLCanvasElement,
  scoreAEl: HTMLElement,
  scoreBEl: HTMLElement,
  controls: Controls,
  user: StoredUser,
  tournamentMatchData?: { tournamentId: string; matchId: string; tournamentName?: string; roundNumber?: number },
  onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void
) => {
  const client = new OnlineGameClient(canvas, scoreAEl, scoreBEl, controls, user, tournamentMatchData, onTournamentMatchEnd);

  controls.createButton.addEventListener('click', () => client.createRoom());
  controls.joinButton.addEventListener('click', () => client.joinRoom(controls.roomInput.value));

  if (tournamentMatchData) {
    controls.createButton.style.display = 'none';
    controls.joinButton.style.display = 'none';
    controls.roomInput.style.display = 'none';
    const roundLabel = tournamentMatchData.roundNumber === undefined
      ? 'Turnuva Maçı'
      : tournamentMatchData.roundNumber === 1
        ? 'Round 1'
        : `Round ${tournamentMatchData.roundNumber}`;
    const tournamentName = tournamentMatchData.tournamentName || 'Turnuva';
    controls.statusEl.textContent = `🏆 ${tournamentName} - ${roundLabel} - Bağlanılıyor...`;
    controls.statusEl.className = 'text-sm font-medium px-4 py-3 rounded-xl text-center bg-yellow-500/20 text-yellow-300 border border-yellow-500/50 transition-all duration-200';

    setTimeout(() => {
      client.joinTournamentMatch();
    }, 100);
  } else {
    controls.statusEl.textContent = 'Oda oluştur veya katıl.';
    controls.statusEl.className = 'text-sm font-medium px-4 py-3 rounded-xl text-center bg-slate-700/50 text-slate-300 border border-slate-600/50 transition-all duration-200';
  }

  return () => client.destroy();
};
