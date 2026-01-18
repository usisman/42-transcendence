import type { FastifyInstance } from 'fastify';
import type { Counter } from 'prom-client';
import type { AppDatabase } from '../database.js';

type ApiErrorResponse = {
  error: string;
  message: string;
};

type CreateTournamentBody = {
  name: string;
  maxPlayers: number;
};

type TournamentDTO = {
  id: number;
  name: string;
  ownerId: number | null;
  ownerNickname: string | null;
  status: 'pending' | 'active' | 'completed';
  maxPlayers: number;
  currentPlayers: number;
  isJoined?: boolean;
  createdAt: string;
  startedAt?: string;
  bracket?: {
    rounds: Array<{
      roundNumber: number;
      matches: Array<{
        matchId: string;
        match: number;
        playerA: { alias: string; isAi: boolean };
        playerB: { alias: string; isAi: boolean };
        winner: string | null;
        scoreA: number | null;
        scoreB: number | null;
        status: 'pending' | 'completed';
      }>;
    }>;
    completed: boolean;
  } | null;
};

type TournamentRow = {
  id: number;
  name: string;
  owner_id: number | null;
  owner_nickname: string | null;
  max_players: number;
  status: string;
  player_count: number;
  bracket_json: string | null;
  created_at: string;
  started_at: string | null;
  is_joined?: number | null;
};

type TournamentPlayerRow = {
  alias: string;
  is_ai: number;
};

type TournamentDeps = {
  tournamentCreatedCounter: Counter<'ownerProvider'>;
  tournamentJoinedCounter: Counter<'provider'>;
  tournamentStartedCounter: Counter<string>;
};

const isPowerOfTwo = (value: number) => value > 0 && (value & (value - 1)) === 0;

const shuffle = <T>(items: T[]) => {
  const cloned = [...items];
  for (let i = cloned.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [cloned[i], cloned[j]] = [cloned[j], cloned[i]];
  }
  return cloned;
};

const chunkPairs = <T>(items: T[]) => {
  const pairs: Array<[T, T]> = [];
  for (let i = 0; i < items.length; i += 2) {
    pairs.push([items[i], items[i + 1]]);
  }
  return pairs;
};

const simulateAIMatch = (): { winner: 'A' | 'B'; scoreA: number; scoreB: number } => {
  const winner = Math.random() < 0.5 ? 'A' : 'B';
  const winnerScore = 11 + Math.floor(Math.random() * 3);
  const loserScore = Math.max(0, winnerScore - 2 - Math.floor(Math.random() * 3));

  return {
    winner,
    scoreA: winner === 'A' ? winnerScore : loserScore,
    scoreB: winner === 'B' ? winnerScore : loserScore
  };
};

const processAIMatches = async (
  db: AppDatabase,
  tournamentId: number,
  bracket: TournamentDTO['bracket']
): Promise<boolean> => {
  if (!bracket) return false;

  let hasChanges = false;

  for (const round of bracket.rounds) {
    for (const match of round.matches) {
      if (match.playerA.isAi && match.playerB.isAi && match.status === 'pending') {
        const result = simulateAIMatch();
        match.winner = result.winner;
        match.scoreA = result.scoreA;
        match.scoreB = result.scoreB;
        match.status = 'completed';
        hasChanges = true;
      }
    }
  }

  if (hasChanges) {
    await db.run(
      `
        UPDATE tournaments
        SET bracket_json = ?
        WHERE id = ?
      `,
      JSON.stringify(bracket),
      tournamentId
    );

    for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
      const round = bracket.rounds[roundIndex];
      const completedMatches = round.matches.filter((m) => m.status === 'completed');
      const allMatchesCompleted = round.matches.length === completedMatches.length;

      if (allMatchesCompleted && roundIndex === bracket.rounds.length - 1) {
        const winners = completedMatches.map((m) => {
          const winnerAlias = m.winner === 'A' ? m.playerA.alias : m.playerB.alias;
          const winnerIsAi = m.winner === 'A' ? m.playerA.isAi : m.playerB.isAi;
          return { alias: winnerAlias, isAi: winnerIsAi };
        });

        if (winners.length === 1) {
          bracket.completed = true;
          await db.run(
            `
              UPDATE tournaments
              SET status = 'completed',
                  bracket_json = ?
              WHERE id = ?
            `,
            JSON.stringify(bracket),
            tournamentId
          );
        } else {
          const nextRoundNumber = round.roundNumber + 1;
          const nextPairs = chunkPairs(winners);
          const nextRound = {
            roundNumber: nextRoundNumber,
            matches: nextPairs.map((pair, index) => ({
              matchId: `r${nextRoundNumber}-m${index + 1}`,
              match: index + 1,
              playerA: { alias: pair[0].alias, isAi: pair[0].isAi },
              playerB: { alias: pair[1].alias, isAi: pair[1].isAi },
              winner: null as string | null,
              scoreA: null as number | null,
              scoreB: null as number | null,
              status: 'pending' as 'pending' | 'completed'
            }))
          };
          bracket.rounds.push(nextRound);

          await db.run(
            `
              UPDATE tournaments
              SET bracket_json = ?
              WHERE id = ?
            `,
            JSON.stringify(bracket),
            tournamentId
          );

          await processAIMatches(db, tournamentId, bracket);
        }
      }
    }
  }

  return hasChanges;
};

const createUniqueAlias = async (
  db: AppDatabase,
  tournamentId: number,
  desiredAlias: string
) => {
  const base = desiredAlias.trim().slice(0, 32) || 'Player';
  let alias = base;
  let counter = 1;

  while (true) {
    const existing = await db.get(
      `
        SELECT 1
        FROM tournament_players
        WHERE tournament_id = ?
          AND LOWER(alias) = LOWER(?)
      `,
      tournamentId,
      alias
    );
    if (!existing) {
      return alias;
    }
    const suffix = `-${counter++}`;
    alias = `${base.slice(0, Math.max(1, 32 - suffix.length))}${suffix}`;
  }
};

const mapTournamentRow = (row: TournamentRow): TournamentDTO => {
  const dto: TournamentDTO = {
    id: row.id,
    name: row.name,
    ownerId: row.owner_id,
    ownerNickname: row.owner_nickname,
    status: row.status === 'active' ? 'active' : row.status === 'completed' ? 'completed' : 'pending',
    maxPlayers: row.max_players,
    currentPlayers: row.player_count,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    bracket: row.bracket_json ? (JSON.parse(row.bracket_json) as TournamentDTO['bracket']) : null
  };

  if (typeof row.is_joined === 'number') {
    dto.isJoined = row.is_joined === 1;
  }

  return dto;
};

const fetchTournamentDTO = async (db: AppDatabase, tournamentId: number) => {
  const row = await db.get<TournamentRow>(
    `
      SELECT
        t.id,
        t.name,
        t.owner_id,
        t.max_players,
        t.status,
        t.bracket_json,
        t.created_at,
        t.started_at,
        u.nickname AS owner_nickname,
        (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count
      FROM tournaments t
      LEFT JOIN users u ON u.id = t.owner_id
      WHERE t.id = ?
    `,
    tournamentId
  );

  return row ? mapTournamentRow(row) : null;
};

export const registerTournamentRoutes = (app: FastifyInstance, deps: TournamentDeps) => {
  app.post<{
    Body: CreateTournamentBody;
    Reply: TournamentDTO | ApiErrorResponse;
  }>(
    '/api/tournaments',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const name = (request.body.name ?? '').trim();
      const maxPlayers = Number(request.body.maxPlayers);

      if (name.length < 3 || name.length > 64) {
        return reply.status(400).send({
          error: 'InvalidName',
          message: 'Turnuva adı 3 ile 64 karakter arasında olmalı.'
        });
      }

      if (!Number.isInteger(maxPlayers) || maxPlayers < 2 || maxPlayers > 32 || !isPowerOfTwo(maxPlayers)) {
        return reply.status(400).send({
          error: 'InvalidMaxPlayers',
          message: 'Oyuncu sayısı 2 ile 32 arasında ve 2\'nin kuvveti olmalı.'
        });
      }

      const result = await request.server.db.run(
        `
          INSERT INTO tournaments (name, owner_id, max_players)
          VALUES (?, ?, ?)
        `,
        name,
        session.sub,
        maxPlayers
      );
      deps.tournamentCreatedCounter.inc({ ownerProvider: session.provider });

      const tournamentId = result.lastID ?? 0;

      try {
        const alias = await createUniqueAlias(request.server.db, tournamentId, session.nickname);
        await request.server.db.run(
          `
            INSERT INTO tournament_players (tournament_id, user_id, alias, is_ai)
            VALUES (?, ?, ?, 0)
          `,
          tournamentId,
          session.sub,
          alias
        );
        deps.tournamentJoinedCounter.inc({ provider: session.provider });
      } catch (error) {
        request.log.warn({ err: error }, 'Turnuva oluşturucu otomatik eklenirken hata oluştu, devam ediliyor');
      }

      const dto = await fetchTournamentDTO(request.server.db, tournamentId);
      return reply.status(201).send(dto as TournamentDTO);
    }
  );

  app.get<{ Reply: TournamentDTO[] }>(
    '/api/tournaments',
    { preHandler: [app.authenticate] },
    async (request) => {
      const session = request.session;
      if (!session) {
        return [];
      }
      const rows = (await request.server.db.all<TournamentRow>(
        `
          SELECT
            t.id,
            t.name,
            t.owner_id,
            t.max_players,
            t.status,
            t.bracket_json,
            t.created_at,
            t.started_at,
            u.nickname AS owner_nickname,
            (SELECT COUNT(*) FROM tournament_players tp WHERE tp.tournament_id = t.id) AS player_count,
            (SELECT 1 FROM tournament_players tp WHERE tp.tournament_id = t.id AND tp.user_id = ?) AS is_joined
          FROM tournaments t
          LEFT JOIN users u ON u.id = t.owner_id
          ORDER BY t.created_at DESC
        `,
        session.sub
      )) as unknown as TournamentRow[];

      return rows.map(mapTournamentRow);
    }

  );

  app.post<{
    Params: { id: string };
    Reply: TournamentDTO | ApiErrorResponse;
  }>(
    '/api/tournaments/:id/join',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const tournamentId = Number(request.params.id);
      if (!Number.isInteger(tournamentId)) {
        return reply.status(400).send({
          error: 'InvalidTournament',
          message: 'Turnuva kimliği geçersiz.'
        });
      }

      const tournament = await fetchTournamentDTO(request.server.db, tournamentId);
      if (!tournament) {
        return reply.status(404).send({
          error: 'TournamentNotFound',
          message: 'Turnuva bulunamadı.'
        });
      }

      if (tournament.status !== 'pending') {
        return reply.status(400).send({
          error: 'TournamentStarted',
          message: 'Turnuva başlatıldığı için katılım kapalı.'
        });
      }

      if (tournament.currentPlayers >= tournament.maxPlayers) {
        return reply.status(400).send({
          error: 'TournamentFull',
          message: 'Turnuva oyuncu kapasitesi dolu.'
        });
      }

      try {
        const alias = await createUniqueAlias(request.server.db, tournamentId, session.nickname);
        await request.server.db.run(
          `
            INSERT INTO tournament_players (tournament_id, user_id, alias, is_ai)
            VALUES (?, ?, ?, 0)
          `,
          tournamentId,
          session.sub,
          alias
        );
        deps.tournamentJoinedCounter.inc({ provider: session.provider });
      } catch (error) {
        const sqliteError = error as { code?: string };
        if (sqliteError?.code === 'SQLITE_CONSTRAINT') {
          return reply.status(409).send({
            error: 'AlreadyJoined',
            message: 'Bu turnuvaya zaten katıldın.'
          });
        }
        request.log.error({ err: error }, 'Turnuva katılımı başarısız oldu');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Turnuvaya katılım sırasında hata oluştu.'
        });
      }

      const dto = await fetchTournamentDTO(request.server.db, tournamentId);
      return reply.status(200).send(dto as TournamentDTO);
    }
  );

  app.post<{
    Params: { id: string };
    Reply: TournamentDTO | ApiErrorResponse;
  }>(
    '/api/tournaments/:id/start',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const tournamentId = Number(request.params.id);
      if (!Number.isInteger(tournamentId)) {
        return reply.status(400).send({
          error: 'InvalidTournament',
          message: 'Turnuva kimliği geçersiz.'
        });
      }

      const tournament = await fetchTournamentDTO(request.server.db, tournamentId);
      if (!tournament) {
        return reply.status(404).send({
          error: 'TournamentNotFound',
          message: 'Turnuva bulunamadı.'
        });
      }

      if (tournament.ownerId !== session.sub) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Bu turnuvayı sadece oluşturan kullanıcı başlatabilir.'
        });
      }

      if (tournament.status !== 'pending') {
        return reply.status(400).send({
          error: 'TournamentAlreadyStarted',
          message: 'Turnuva zaten başlatıldı.'
        });
      }

      const players = (await request.server.db.all<TournamentPlayerRow>(
        `SELECT alias, is_ai FROM tournament_players WHERE tournament_id = ? ORDER BY created_at ASC`,
        tournamentId
      )) as unknown as TournamentPlayerRow[];

      const shuffledPlayers = shuffle(players);
      const aiNeeded = tournament.maxPlayers - players.length;

      if (aiNeeded > 0) {
        for (let i = 0; i < aiNeeded; i++) {
          const aiAlias = `AI-${i + 1}`;
          await request.server.db.run(
            `
              INSERT INTO tournament_players (tournament_id, user_id, alias, is_ai)
              VALUES (?, NULL, ?, 1)
            `,
            tournamentId,
            aiAlias
          );
          shuffledPlayers.push({ alias: aiAlias, is_ai: 1 });
        }
      }

      const pairs = chunkPairs(shuffledPlayers);
      const bracket = {
        rounds: [
          {
            roundNumber: 1,
            matches: pairs.map((pair, index) => ({
              matchId: `r1-m${index + 1}`,
              match: index + 1,
              playerA: { alias: pair[0].alias, isAi: Boolean(pair[0].is_ai) },
              playerB: { alias: pair[1].alias, isAi: Boolean(pair[1].is_ai) },
              winner: null,
              scoreA: null,
              scoreB: null,
              status: 'pending' as const
            }))
          }
        ],
        completed: false
      };

      await request.server.db.run(
        `
          UPDATE tournaments
          SET status = 'active',
              bracket_json = ?,
              started_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `,
        JSON.stringify(bracket),
        tournamentId
      );
      deps.tournamentStartedCounter.inc();

      await processAIMatches(request.server.db, tournamentId, bracket);

      const dto = await fetchTournamentDTO(request.server.db, tournamentId);
      return reply.status(200).send(dto as TournamentDTO);
    }
  );

  app.post<{
    Params: { id: string; matchId: string };
    Body: { winner: 'A' | 'B'; scoreA: number; scoreB: number };
    Reply: TournamentDTO | ApiErrorResponse;
  }>(
    '/api/tournaments/:id/matches/:matchId/result',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const tournamentId = Number(request.params.id);
      if (!Number.isInteger(tournamentId)) {
        return reply.status(400).send({
          error: 'InvalidTournament',
          message: 'Turnuva kimliği geçersiz.'
        });
      }

      const tournament = await fetchTournamentDTO(request.server.db, tournamentId);
      if (!tournament) {
        return reply.status(404).send({
          error: 'TournamentNotFound',
          message: 'Turnuva bulunamadı.'
        });
      }

      if (tournament.status !== 'active') {
        return reply.status(400).send({
          error: 'TournamentNotActive',
          message: 'Turnuva aktif değil.'
        });
      }

      if (!tournament.bracket) {
        return reply.status(400).send({
          error: 'BracketMissing',
          message: 'Turnuva eşleşmeleri bulunamadı.'
        });
      }

      const bracket = tournament.bracket as {
        rounds: Array<{
          roundNumber: number;
          matches: Array<{
            matchId: string;
            match: number;
            playerA: { alias: string; isAi: boolean };
            playerB: { alias: string; isAi: boolean };
            winner: string | null;
            scoreA: number | null;
            scoreB: number | null;
            status: 'pending' | 'completed';
          }>;
        }>;
        completed: boolean;
      };

      let foundMatch: typeof bracket.rounds[0]['matches'][0] | null = null;
      let foundRoundIndex = -1;
      let foundMatchIndex = -1;

      for (let roundIndex = 0; roundIndex < bracket.rounds.length; roundIndex++) {
        const round = bracket.rounds[roundIndex];
        const matchIndex = round.matches.findIndex((match) => match.matchId === request.params.matchId);
        if (matchIndex >= 0) {
          foundMatch = round.matches[matchIndex];
          foundRoundIndex = roundIndex;
          foundMatchIndex = matchIndex;
          break;
        }
      }

      if (!foundMatch) {
        return reply.status(404).send({
          error: 'MatchNotFound',
          message: 'Maç bulunamadı.'
        });
      }

      if (foundMatch.status === 'completed') {
        const dto = await fetchTournamentDTO(request.server.db, tournamentId);
        return reply.status(200).send(dto as TournamentDTO);
      }

      const playerAlias = session.nickname;
      const isPlayerA = foundMatch.playerA.alias === playerAlias && !foundMatch.playerA.isAi;
      const isPlayerB = foundMatch.playerB.alias === playerAlias && !foundMatch.playerB.isAi;

      if (!isPlayerA && !isPlayerB) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Bu maçta oynama yetkin yok.'
        });
      }

      const { winner, scoreA, scoreB } = request.body;

      foundMatch.winner = winner;
      foundMatch.scoreA = scoreA;
      foundMatch.scoreB = scoreB;
      foundMatch.status = 'completed';

      const currentRound = bracket.rounds[foundRoundIndex];
      const completedMatches = currentRound.matches.filter((m) => m.status === 'completed');
      const allMatchesCompleted = currentRound.matches.length === completedMatches.length;

      if (allMatchesCompleted) {
        const winners = completedMatches.map((m) => {
          const winnerAlias = m.winner === 'A' ? m.playerA.alias : m.playerB.alias;
          const winnerIsAi = m.winner === 'A' ? m.playerA.isAi : m.playerB.isAi;
          return { alias: winnerAlias, isAi: winnerIsAi };
        });

        if (winners.length === 1) {
          bracket.completed = true;
        } else {
          const nextRoundNumber = currentRound.roundNumber + 1;
          const nextPairs = chunkPairs(winners);
          const nextRound = {
            roundNumber: nextRoundNumber,
            matches: nextPairs.map((pair, index) => ({
              matchId: `r${nextRoundNumber}-m${index + 1}`,
              match: index + 1,
              playerA: { alias: pair[0].alias, isAi: pair[0].isAi },
              playerB: { alias: pair[1].alias, isAi: pair[1].isAi },
              winner: null as string | null,
              scoreA: null as number | null,
              scoreB: null as number | null,
              status: 'pending' as 'pending' | 'completed'
            }))
          };
          bracket.rounds.push(nextRound);
        }
      }

      await request.server.db.run(
        `
          UPDATE tournaments
          SET bracket_json = ?
          WHERE id = ?
        `,
        JSON.stringify(bracket),
        tournamentId
      );

      await processAIMatches(request.server.db, tournamentId, bracket);

      if (bracket.completed) {
        await request.server.db.run(
          `
            UPDATE tournaments
            SET status = 'completed',
                bracket_json = ?
            WHERE id = ?
          `,
          JSON.stringify(bracket),
          tournamentId
        );
      }

      const dto = await fetchTournamentDTO(request.server.db, tournamentId);
      return reply.status(200).send(dto as TournamentDTO);
    }
  );

  app.delete<{
    Params: { id: string };
    Reply: { success: boolean } | ApiErrorResponse;
  }>(
    '/api/tournaments/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const tournamentId = Number(request.params.id);
      if (!Number.isInteger(tournamentId)) {
        return reply.status(400).send({
          error: 'InvalidTournament',
          message: 'Turnuva kimliği geçersiz.'
        });
      }

      const tournament = await fetchTournamentDTO(request.server.db, tournamentId);
      if (!tournament) {
        return reply.status(404).send({
          error: 'TournamentNotFound',
          message: 'Turnuva bulunamadı.'
        });
      }

      if (tournament.ownerId !== session.sub) {
        return reply.status(403).send({
          error: 'Forbidden',
          message: 'Bu turnuvayı sadece oluşturan kullanıcı silebilir.'
        });
      }

      try {
        await request.server.db.run(
          `DELETE FROM tournament_players WHERE tournament_id = ?`,
          tournamentId
        );

        await request.server.db.run(
          `DELETE FROM tournaments WHERE id = ?`,
          tournamentId
        );

        return reply.status(200).send({ success: true });
      } catch (error) {
        request.log.error({ err: error }, 'Turnuva silinirken hata oluştu');
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'Turnuva silinirken bir hata oluştu.'
        });
      }
    }
  );
};
