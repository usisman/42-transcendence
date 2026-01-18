import { Game } from './Game';

const RATIO = 1.79672131148;

export const initializePongGame = (
    canvas: HTMLCanvasElement,
    scoreAEl: HTMLElement,
    scoreBEl: HTMLElement,
    statusEl: HTMLElement | null,
    onTournamentMatchEnd?: (winner: 'A' | 'B', scoreA: number, scoreB: number) => void,
    tournamentId?: string,
    player1Nickname?: string,
    player2Nickname?: string
) => {
    const pressedKeys = new Set<string>();
    const ctx = canvas.getContext('2d');

    if (!ctx) {
        return () => {};
    }

    const resizeCanvas = () => {
        canvas.height = window.innerHeight * 0.6;
        canvas.width = canvas.height * RATIO;
    };

    resizeCanvas();

    const handleResize = () => {
        resizeCanvas();
    };
    window.addEventListener('resize', handleResize);

    if (scoreAEl) {
        scoreAEl.textContent = "A: 0";
    }
    if (scoreBEl) {
        scoreBEl.textContent = "B: 0";
    }

    const game = new Game(ctx, canvas, pressedKeys, scoreAEl, scoreBEl, statusEl, onTournamentMatchEnd, tournamentId, player1Nickname, player2Nickname);

    const handleKeyDown = (event: KeyboardEvent) => {
        if (event.key === "ArrowUp" || event.key === "ArrowDown") {
            event.preventDefault();
        }
        pressedKeys.add(event.key);
    };

    const handleKeyUp = (event: KeyboardEvent) => {
        pressedKeys.delete(event.key);
    };

    document.addEventListener("keydown", handleKeyDown);
    document.addEventListener("keyup", handleKeyUp);

    game.loop();

    return () => {
        game.stop();
        window.removeEventListener('resize', handleResize);
        document.removeEventListener("keydown", handleKeyDown);
        document.removeEventListener("keyup", handleKeyUp);
    };
};


