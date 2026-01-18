import type { FastifyInstance } from 'fastify';

type ApiErrorResponse = {
  error: string;
  message: string;
};

type UserStatsResponse = {
  totalGames: number;
  wins: number;
  losses: number;
  winRate: number;
  totalScore: number;
  avgScore: number;
  longestWinStreak: number;
  recentGames: Array<{
    id: number;
    opponent: string;
    won: boolean;
    score: string;
    gameType: string;
    endedAt: string;
  }>;
  dailyStats: {
    games: number;
    wins: number;
    losses: number;
  };
  weeklyStats: {
    games: number;
    wins: number;
    losses: number;
  };
};

type GameSessionDetailResponse = {
  id: number;
  player1: {
    id: number | null;
    nickname: string;
    score: number;
  };
  player2: {
    id: number | null;
    nickname: string;
    score: number;
  };
  winner: {
    id: number | null;
    nickname: string;
  };
  gameType: string;
  tournamentId: number | null;
  matchId: string | null;
  startedAt: string;
  endedAt: string;
  duration: number;
};

type GameSessionsResponse = {
  sessions: Array<{
    id: number;
    player1: string;
    player2: string;
    winner: string;
    score: string;
    gameType: string;
    tournamentId: number | null;
    startedAt: string;
    endedAt: string;
    duration: number;
  }>;
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
  };
};

type CreateOfflineGameSessionBody = {
  player1Nickname: string;
  player2Nickname: string;
  winnerNickname: string;
  player1Score: number;
  player2Score: number;
  startedAt: string;
  endedAt: string;
  duration: number;
};

export const registerGameSessionRoutes = (app: FastifyInstance) => {
  app.get<{ Reply: UserStatsResponse | ApiErrorResponse }>(
    '/api/users/stats',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const userId = session.sub;

      const totalGames = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
      `, userId, userId);

      const wins = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) 
          AND winner_id = ?
      `, userId, userId, userId);

      const losses = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) 
          AND (winner_id IS NULL OR winner_id != ?)
      `, userId, userId, userId);

      const totalScore = await request.server.db.get<{ total: number }>(`
        SELECT 
          COALESCE(SUM(CASE WHEN player1_id = ? THEN player1_score ELSE player2_score END), 0) as total
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
      `, userId, userId, userId);

      const avgScore = totalGames?.count 
        ? Math.round((totalScore?.total || 0) / totalGames.count)
        : 0;

      const winRate = totalGames?.count 
        ? Math.round((wins?.count || 0) / totalGames.count * 100)
        : 0;

      const recentGamesRaw = await request.server.db.all<{
        id: number;
        player1_nickname: string;
        player2_nickname: string;
        winner_nickname: string;
        player1_score: number;
        player2_score: number;
        game_type: string;
        ended_at: string;
      }>(`
        SELECT 
          id, player1_nickname, player2_nickname, winner_nickname,
          player1_score, player2_score, game_type, ended_at
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
        ORDER BY ended_at DESC
        LIMIT 10
      `, userId, userId);

      const recentGames = Array.isArray(recentGamesRaw) ? recentGamesRaw : [];

      const todayStats = await request.server.db.get<{
        games: number;
        wins: number;
        losses: number;
      }>(`
        SELECT 
          COUNT(*) as games,
          SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN (winner_id IS NULL OR winner_id != ?) THEN 1 ELSE 0 END) as losses
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) 
          AND DATE(ended_at) = DATE('now')
          AND ended_at IS NOT NULL
      `, userId, userId, userId, userId);

      const dailyStats = {
        games: todayStats?.games || 0,
        wins: todayStats?.wins || 0,
        losses: todayStats?.losses || 0
      };

      const weeklyStatsTotal = await request.server.db.get<{
        games: number;
        wins: number;
        losses: number;
      }>(`
        SELECT 
          COUNT(*) as games,
          SUM(CASE WHEN winner_id = ? THEN 1 ELSE 0 END) as wins,
          SUM(CASE WHEN (winner_id IS NULL OR winner_id != ?) THEN 1 ELSE 0 END) as losses
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) 
          AND ended_at >= datetime('now', '-7 days')
          AND ended_at IS NOT NULL
      `, userId, userId, userId, userId);

      const weeklyStats = {
        games: weeklyStatsTotal?.games || 0,
        wins: weeklyStatsTotal?.wins || 0,
        losses: weeklyStatsTotal?.losses || 0
      };

      const allGamesRaw = await request.server.db.all<{
        winner_nickname: string;
        ended_at: string;
      }>(`
        SELECT winner_nickname, ended_at
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?)
          AND ended_at IS NOT NULL
        ORDER BY ended_at ASC
      `, userId, userId);

      const allGames = Array.isArray(allGamesRaw) ? allGamesRaw : [];
      let longestWinStreak = 0;
      let currentStreak = 0;

      for (const game of allGames) {
        if (game.winner_nickname === session.nickname) {
          currentStreak++;
          longestWinStreak = Math.max(longestWinStreak, currentStreak);
        } else {
          currentStreak = 0;
        }
      }

      return {
        totalGames: totalGames?.count || 0,
        wins: wins?.count || 0,
        losses: losses?.count || 0,
        winRate,
        totalScore: totalScore?.total || 0,
        avgScore,
        longestWinStreak,
        recentGames: recentGames.map((game: {
          id: number;
          player1_nickname: string;
          player2_nickname: string;
          winner_nickname: string;
          player1_score: number;
          player2_score: number;
          game_type: string;
          ended_at: string;
        }) => ({
          id: game.id,
          opponent: game.player1_nickname === session.nickname 
            ? game.player2_nickname 
            : game.player1_nickname,
          won: game.winner_nickname === session.nickname,
          score: game.player1_nickname === session.nickname
            ? `${game.player1_score}-${game.player2_score}`
            : `${game.player2_score}-${game.player1_score}`,
          gameType: game.game_type,
          endedAt: game.ended_at
        })),
        dailyStats: dailyStats,
        weeklyStats: weeklyStats
      };
    }
  );

  app.get<{ 
    Querystring: { page?: string; limit?: string };
    Reply: GameSessionsResponse | ApiErrorResponse;
  }>(
    '/api/game-sessions',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const page = Math.max(1, parseInt(request.query.page || '1'));
      const limit = Math.min(50, Math.max(10, parseInt(request.query.limit || '20')));
      const offset = (page - 1) * limit;

      const sessionsRaw = await request.server.db.all<{
        id: number;
        player1_nickname: string;
        player2_nickname: string;
        winner_nickname: string;
        player1_score: number;
        player2_score: number;
        game_type: string;
        tournament_id: number | null;
        started_at: string;
        ended_at: string;
        duration_seconds: number;
      }>(`
        SELECT 
          id, player1_nickname, player2_nickname, winner_nickname,
          player1_score, player2_score, game_type, tournament_id,
          started_at, ended_at, duration_seconds
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
        ORDER BY ended_at DESC
        LIMIT ? OFFSET ?
      `, session.sub, session.sub, limit, offset);

      const sessions = Array.isArray(sessionsRaw) ? sessionsRaw : [];

      const total = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
      `, session.sub, session.sub);

      return {
        sessions: sessions.map((sessionItem: {
          id: number;
          player1_nickname: string;
          player2_nickname: string;
          winner_nickname: string;
          player1_score: number;
          player2_score: number;
          game_type: string;
          tournament_id: number | null;
          started_at: string;
          ended_at: string;
          duration_seconds: number;
        }) => ({
          id: sessionItem.id,
          player1: sessionItem.player1_nickname,
          player2: sessionItem.player2_nickname,
          winner: sessionItem.winner_nickname,
          score: `${sessionItem.player1_score}-${sessionItem.player2_score}`,
          gameType: sessionItem.game_type,
          tournamentId: sessionItem.tournament_id,
          startedAt: sessionItem.started_at,
          endedAt: sessionItem.ended_at,
          duration: sessionItem.duration_seconds
        })),
        pagination: {
          page,
          limit,
          total: total?.count || 0,
          totalPages: Math.ceil((total?.count || 0) / limit)
        }
      };
    }
  );

  app.post<{
    Body: CreateOfflineGameSessionBody;
    Reply: { id: number } | ApiErrorResponse;
  }>(
    '/api/game-sessions/offline',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const { player1Nickname, player2Nickname, winnerNickname, player1Score, player2Score, startedAt, endedAt, duration } = request.body;

      const isPlayer1 = player1Nickname === session.nickname;
      const isPlayer2 = player2Nickname === session.nickname;

      if (!isPlayer1 && !isPlayer2) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Bu oyunda oynamadığınız için kayıt yapamazsınız.'
        });
      }

      let winnerId: number | null = null;
      if (winnerNickname === session.nickname) {
        winnerId = session.sub;
      } else {
        const opponent = await request.server.db.get<{ id: number }>(
          `SELECT id FROM users WHERE nickname = ?`,
          winnerNickname
        );
        winnerId = opponent?.id || null;
      }

      try {
        const result = await request.server.db.run(`
          INSERT INTO game_sessions (
            player1_id, player1_nickname,
            player2_id, player2_nickname,
            winner_id, winner_nickname,
            player1_score, player2_score,
            game_type, started_at, ended_at, duration_seconds
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'casual', ?, ?, ?)
        `,
          isPlayer1 ? session.sub : null,
          player1Nickname,
          isPlayer2 ? session.sub : null,
          player2Nickname,
          winnerId,
          winnerNickname,
          player1Score,
          player2Score,
          startedAt,
          endedAt,
          duration
        );

        return reply.status(201).send({
          id: result.lastID ?? 0
        });
      } catch (error) {
        request.log.error({ err: error }, 'Offline oyun oturumu kaydedilemedi');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Oyun oturumu kaydedilirken hata oluştu.'
        });
      }
    }
  );

  app.get<{
    Params: { id: string };
    Reply: GameSessionDetailResponse | ApiErrorResponse;
  }>(
    '/api/game-sessions/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const sessionId = Number(request.params.id);
      if (!Number.isInteger(sessionId)) {
        return reply.status(400).send({
          error: 'InvalidSession',
          message: 'Geçersiz oyun oturumu kimliği.'
        });
      }

      const gameSession = await request.server.db.get<{
        id: number;
        player1_id: number | null;
        player1_nickname: string;
        player2_id: number | null;
        player2_nickname: string;
        winner_id: number | null;
        winner_nickname: string;
        player1_score: number;
        player2_score: number;
        game_type: string;
        tournament_id: number | null;
        match_id: string | null;
        started_at: string;
        ended_at: string;
        duration_seconds: number;
      }>(`
        SELECT 
          id, player1_id, player1_nickname,
          player2_id, player2_nickname,
          winner_id, winner_nickname,
          player1_score, player2_score,
          game_type, tournament_id, match_id,
          started_at, ended_at, duration_seconds
        FROM game_sessions
        WHERE id = ? AND (player1_id = ? OR player2_id = ?)
      `, sessionId, session.sub, session.sub);

      if (!gameSession) {
        return reply.status(404).send({
          error: 'SessionNotFound',
          message: 'Oyun oturumu bulunamadı veya bu oturuma erişim yetkiniz yok.'
        });
      }

      return {
        id: gameSession.id,
        player1: {
          id: gameSession.player1_id,
          nickname: gameSession.player1_nickname,
          score: gameSession.player1_score
        },
        player2: {
          id: gameSession.player2_id,
          nickname: gameSession.player2_nickname,
          score: gameSession.player2_score
        },
        winner: {
          id: gameSession.winner_id,
          nickname: gameSession.winner_nickname
        },
        gameType: gameSession.game_type,
        tournamentId: gameSession.tournament_id,
        matchId: gameSession.match_id,
        startedAt: gameSession.started_at,
        endedAt: gameSession.ended_at,
        duration: gameSession.duration_seconds
      };
    }
  );
};
