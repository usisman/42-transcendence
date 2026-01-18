import { Player } from './Player';
import { Ball } from './Ball';

export class Game {
    private ctx;
    private pressedKeys;
    private height;
    private width;
    private rect;

    private active;
    private players: Player[];
    private ball: Ball;
    private lastAIMoveTime: number;
    private target: number;
    private line_width;

    private random_part;
    private scoreAEl: HTMLElement | null;
    private scoreBEl: HTMLElement | null;
    private statusEl: HTMLElement | null;
    private gameEnded: boolean = false;
    private animationFrameId: number | null = null;
    private onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void;
    private tournamentId?: string;
    private startTime?: Date;
    private player1Nickname?: string;
    private player2Nickname?: string;



    constructor(
        ctx: CanvasRenderingContext2D,
        canvas: HTMLCanvasElement,
        pressedKeys: Set<string>,
        scoreAEl: HTMLElement | null = null,
        scoreBEl: HTMLElement | null = null,
        statusEl: HTMLElement | null = null,
        onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void,
        tournamentId?: string,
        player1Nickname?: string,
        player2Nickname?: string
    ) {
        this.scoreAEl = scoreAEl;
        this.scoreBEl = scoreBEl;
        this.statusEl = statusEl;
        this.onTournamentMatchEnd = onTournamentMatchEnd;
        this.tournamentId = tournamentId;
        this.player1Nickname = player1Nickname || 'Player A';
        this.player2Nickname = player2Nickname || 'AI';
        this.startTime = new Date();
        this.ctx = ctx;
        this.height = canvas.height;
        this.width = canvas.width;
        this.rect = canvas.getBoundingClientRect();
        this.pressedKeys = pressedKeys;
        this.active = 0;

        let player_width_ratio = this.height / 50.8;
        let player_height_ratio = this.width * 2 / 17.96
        let player_gap_ratio = this.width / 46;
        let player_speed_ratio = this.width / 92;
        this.line_width = this.width / 92;
        this.players = [
            new Player({
                canvas: canvas,
                ctx: this.ctx,
                x: player_gap_ratio,
                y: player_width_ratio,
                height: player_height_ratio,
                width: player_width_ratio,
                speed: player_speed_ratio
            }),
            new Player({
                canvas:canvas,
                ctx: this.ctx,
                x: this.width - player_gap_ratio - player_width_ratio,
                y: this.height - player_width_ratio,
                height: player_height_ratio,
                width: player_width_ratio,
                speed: player_speed_ratio
            })
        ];


        this.ball = new Ball(canvas, this.ctx, this.width / 2, this.height / 2, this.width / 90, this.width * 2 / 90)


        this.active = 0;
        this.lastAIMoveTime = 0;
        this.target = 0;
        this.random_part = 0.5
    }

    private find_target(player_x: number)
    {
        let res = this.height / 2;
        if (this.ball.dx < 0) {
            return res;
        }
        let step = this.ball.dy * (player_x - this.ball.x) / this.ball.dx;

        let cur_pos = this.ball.y;
        let cur_step;

        while (step != 0)
       {
            if (step > 0)
                cur_step = Math.min(step, this.height - cur_pos);
            else
                cur_step = Math.max(step, -cur_pos);
            step -= cur_step;
            cur_pos += cur_step;
            step *= -1;
        }
        return cur_pos;
    }

    loop() {
        if (this.gameEnded) {
            return;
        }

        this.ctx.fillStyle = "#7dd3fc"; // Açık mavi (sky-300)
        this.ctx.fillRect(0, 0, this.width, this.height);

        this.draw(this.line_width);

        this.ball.draw();
        const now = Date.now();

        if (now - this.lastAIMoveTime >= 1000) {
            this.target = this.find_target(this.players[1].x);
            this.random_part = Math.random();
            this.lastAIMoveTime = now;
        }
        this.play_ai(this.players[1], this.target, this.random_part);
        this.players[0].draw();
        this.players[1].draw();

        if (this.pressedKeys.has("ArrowUp")) {
            this.players[1].y += this.update_player(this.players[1], -1);
            this.active = 1;
        }
        if (this.pressedKeys.has("ArrowDown")) {
            this.players[1].y += this.update_player(this.players[1], 1);
            this.active = 1;
        }

        if (this.pressedKeys.has("w")) {
            this.players[0].y += this.update_player(this.players[0], -1);
            this.active = 1;
        }
        if (this.pressedKeys.has("s")) {
            this.players[0].y += this.update_player(this.players[0], 1);
            this.active = 1;
        }

        if (this.active) {
            this.ball.update();
        }
        this.check_areas();

        this.animationFrameId = requestAnimationFrame(() => this.loop());
    }

    public stop() {
        if (this.animationFrameId !== null) {
            cancelAnimationFrame(this.animationFrameId);
            this.animationFrameId = null;
        }
    }


    private draw_line(x: number, y: number, dx: number, dy: number, lineWidth = 10) {
        this.ctx.beginPath();
        this.ctx.strokeStyle = "black";
        this.ctx.lineWidth = lineWidth;
        this.ctx.moveTo(x, y);
        this.ctx.lineTo(x + dx, y + dy);
        this.ctx.stroke();
    }

    private draw(line_width: number) {
        this.draw_line(0, 0, this.width, 0, line_width);
        this.draw_line(0, 0, 0, this.height, line_width);
        this.draw_line(this.width, 0, 0, this.height, line_width);
        this.draw_line(0, this.height, this.width, 0, line_width);
        this.draw_line(this.width / 2, 0, 0, this.height, line_width / 2);
    }


    private update_player(player: Player, inc: number) {
        if (inc > 0) {
            return Math.min(inc * player.speed, this.height - player.height - player.y);
        }
        return Math.max(inc * player.speed, - player.y);
    }

    private goal(number: number) {
        if (number == 0) {
            this.players[0].goal();
        }
        else
            this.players[1].goal();

        if (this.scoreAEl) {
            this.scoreAEl.textContent = "A: " + this.players[0].score;
        }

        if (this.scoreBEl) {
            this.scoreBEl.textContent = "B: " + this.players[1].score;
        }

        const scoreA = this.players[0].score;
        const scoreB = this.players[1].score;

        if (scoreA >= 11 && scoreA - scoreB >= 2) {
            this.endGame(0);
            return;
        }

        if (scoreB >= 11 && scoreB - scoreA >= 2) {
            this.endGame(1);
            return;
        }

        const totalScore = this.players[0].score + this.players[1].score;
        const direction = (totalScore % 4) < 2 ? -1 : 1; // 0-1: A'ya (-1), 2-3: B'ye (1)

        this.ball.reset(direction);
        this.active = 0;
    }

    private endGame(winner: number) {
        this.gameEnded = true;
        this.active = 0;
        this.stop();

        const winnerName = winner === 0 ? "A" : "B";
        const winnerScore = winner === 0 ? this.players[0].score : this.players[1].score;
        const loserScore = winner === 0 ? this.players[1].score : this.players[0].score;
        const winnerKey: 'A' | 'B' = winner === 0 ? 'A' : 'B';
        const scoreA = winner === 0 ? winnerScore : loserScore;
        const scoreB = winner === 1 ? winnerScore : loserScore;

        if (this.onTournamentMatchEnd) {
            this.onTournamentMatchEnd(winnerKey, scoreA, scoreB);
        } else {
            const endTime = new Date();
            const duration = this.startTime 
                ? Math.floor((endTime.getTime() - this.startTime.getTime()) / 1000)
                : 0;
            
            const winnerNickname = winner === 0 ? this.player1Nickname! : this.player2Nickname!;
            
            void fetch('/api/game-sessions/offline', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({
                    player1Nickname: this.player1Nickname!,
                    player2Nickname: this.player2Nickname!,
                    winnerNickname,
                    player1Score: scoreA,
                    player2Score: scoreB,
                    startedAt: this.startTime?.toISOString() || endTime.toISOString(),
                    endedAt: endTime.toISOString(),
                    duration
                })
            }).catch(error => {
            });
        }

        if (this.statusEl) {
            const isTournamentMatch = !!this.onTournamentMatchEnd;
            this.statusEl.innerHTML = `
                <div class="text-center">
                    <div class="text-2xl font-extrabold mb-2 text-emerald-400">🎉 Oyun Bitti! 🎉</div>
                    <div class="text-xl font-bold mb-1 text-emerald-300">Oyuncu ${winnerName} Kazandı!</div>
                    <div class="text-lg text-slate-300 mb-4">Skor: ${winnerScore} - ${loserScore}</div>
                    ${isTournamentMatch ? `
                        <div class="mt-4">
                            <button class="px-6 py-2 rounded-lg bg-gradient-to-r from-sky-500 to-indigo-600 text-white font-semibold hover:from-sky-600 hover:to-indigo-700 transition-all duration-200" data-action="back-to-tournament" data-tournament-id="${this.tournamentId || ''}">
                                Turnuvaya Dön
                            </button>
                        </div>
                    ` : ''}
                </div>
            `;
            this.statusEl.className = 'px-6 py-4 rounded-xl text-center bg-gradient-to-br from-emerald-500/20 to-emerald-600/20 border-2 border-emerald-500/50 shadow-lg transition-all duration-200';

            if (isTournamentMatch) {
                const backButton = this.statusEl.querySelector<HTMLButtonElement>('[data-action="back-to-tournament"]');
                if (backButton && this.tournamentId) {
                    backButton.addEventListener('click', () => {
                        location.hash = `/tournament?tournament=${this.tournamentId}`;
                    });
                }
            }
        }
    }

    private check_areas() {

        if ((this.ball.dy < 0 && this.ball.y < this.line_width) || (this.ball.dy > 0 && this.height - this.ball.y < this.line_width))
            this.ball.dy *= -1;


        if (this.line_width / 2 > this.ball.x) {
            this.goal(1);
        }

        if (this.width - this.ball.x < this.line_width / 2) {
            this.goal(0);
        }

        if (this.ball.dx < 0 && this.ball.x - this.ball.radius <= this.players[0].x + this.players[0].width) {
            this.player_ball_collision(this.players[0], this.ball);
        }

        if (this.ball.dx > 0 && this.ball.x + this.ball.radius >= this.players[1].x) {
            this.player_ball_collision(this.players[1], this.ball);
        }
    }

    private player_ball_collision(player: Player, ball: Ball) {
        if (player.y > ball.y) {
        } else if (player.y + player.height > ball.y) {
            let dist = (ball.y - (player.y + player.height / 2)) / (player.height / 2);
            let angle =  dist * (Math.PI / 4);


            ball.dx = Math.cos(angle) * (-Math.abs(ball.dx) / ball.dx);
            ball.dy = Math.sin(angle);
            ball.speed *= 1.05;
        } else if (player.y + player.height + ball.radius / 2 > ball.y) {
        }
    }

    private play_ai(player: Player, target: number, part: number)
    {
        if (player.y + player.height * (((1 - part) / 2) + part) >= target && target >= player.y + player.height * ((1 - part) / 2))
            return ;
        let way = 1;
        if (player.y + player.height / 2 > target)
            way = -1;
        player.y += this.update_player(player, way);
    }

}
