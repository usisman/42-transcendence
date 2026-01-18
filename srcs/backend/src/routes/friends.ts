import type { FastifyInstance } from 'fastify';

type ApiErrorResponse = {
  error: string;
  message: string;
};

type FriendResponse = {
  id: number;
  userId: number;
  friendId: number;
  friendNickname: string;
  friendAvatarUrl: string | null;
  status: 'pending' | 'accepted' | 'rejected';
  createdAt: string;
  updatedAt: string;
  isOnline: boolean;
};

type FriendsListResponse = {
  friends: FriendResponse[];
  requests: {
    sent: FriendResponse[];
    received: FriendResponse[];
  };
};

type AddFriendBody = {
  friendId: number;
};

type SearchUsersResponse = {
  users: Array<{
    id: number;
    nickname: string;
    avatarUrl: string | null;
    isFriend: boolean;
    friendStatus: 'none' | 'pending' | 'accepted' | 'rejected';
  }>;
};

type PublicProfileResponse = {
  id: number;
  nickname: string;
  avatarUrl: string | null;
  createdAt: string;
  stats: {
    totalGames: number;
    wins: number;
    losses: number;
  };
  isFriend: boolean;
  friendStatus: 'none' | 'pending' | 'accepted' | 'rejected';
};

export const registerFriendRoutes = (app: FastifyInstance, deps: { isOnline: (userId: number) => boolean }) => {
  app.get<{
    Querystring: { q?: string };
    Reply: SearchUsersResponse | ApiErrorResponse;
  }>(
    '/api/users/search',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const query = (request.query.q || '').trim();
      if (query.length < 2) {
        return reply.status(400).send({
          error: 'InvalidQuery',
          message: 'Arama sorgusu en az 2 karakter olmalı.'
        });
      }

      const usersRaw = await request.server.db.all<{
        id: number;
        nickname: string;
        avatar_path: string | null;
      }>(
        `
        SELECT id, nickname, avatar_path
        FROM users
        WHERE id != ? AND nickname LIKE ?
        LIMIT 20
      `,
        session.sub,
        `%${query}%`
      );

      const users = Array.isArray(usersRaw) ? usersRaw : [];

      const usersWithStatus = await Promise.all(
        users.map(async (user: { id: number; nickname: string; avatar_path: string | null }) => {
          const friendship = await request.server.db.get<{
            status: string;
            user_id: number;
          }>(
            `
            SELECT status, user_id
            FROM friends
            WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
            ORDER BY updated_at DESC
            LIMIT 1
          `,
            session.sub,
            user.id,
            user.id,
            session.sub
          );

          let friendStatus: 'none' | 'pending' | 'accepted' | 'rejected' = 'none';
          if (friendship) {
            if (friendship.status === 'accepted') {
              friendStatus = 'accepted';
            } else if (friendship.status === 'pending') {
              friendStatus = 'pending';
            } else if (friendship.status === 'rejected') {
              friendStatus = 'rejected';
            }
          }

          return {
            id: user.id,
            nickname: user.nickname,
            avatarUrl: user.avatar_path ? `/api/avatars/${user.avatar_path}` : null,
            isFriend: friendStatus === 'accepted',
            friendStatus
          };
        })
      );

      return { users: usersWithStatus };
    }
  );

  app.get<{ Reply: FriendsListResponse | ApiErrorResponse }>(
    '/api/friends',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const acceptedFriendsRaw = await request.server.db.all<{
        id: number;
        user_id: number;
        friend_id: number;
        friend_nickname: string;
        friend_avatar_path: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `
        SELECT 
          f.id,
          f.user_id,
          f.friend_id,
          u.nickname as friend_nickname,
          u.avatar_path as friend_avatar_path,
          f.status,
          f.created_at,
          f.updated_at
        FROM friends f
        JOIN users u ON (
          CASE 
            WHEN f.user_id = ? THEN f.friend_id
            ELSE f.user_id
          END = u.id
        )
        WHERE (f.user_id = ? OR f.friend_id = ?) AND f.status = 'accepted'
        ORDER BY f.updated_at DESC
      `,
        session.sub,
        session.sub,
        session.sub
      );

      const sentRequestsRaw = await request.server.db.all<{
        id: number;
        user_id: number;
        friend_id: number;
        friend_nickname: string;
        friend_avatar_path: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `
        SELECT 
          f.id,
          f.user_id,
          f.friend_id,
          u.nickname as friend_nickname,
          u.avatar_path as friend_avatar_path,
          f.status,
          f.created_at,
          f.updated_at
        FROM friends f
        JOIN users u ON f.friend_id = u.id
        WHERE f.user_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `,
        session.sub
      );

      const receivedRequestsRaw = await request.server.db.all<{
        id: number;
        user_id: number;
        friend_id: number;
        friend_nickname: string;
        friend_avatar_path: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `
        SELECT 
          f.id,
          f.user_id,
          f.friend_id,
          u.nickname as friend_nickname,
          u.avatar_path as friend_avatar_path,
          f.status,
          f.created_at,
          f.updated_at
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.friend_id = ? AND f.status = 'pending'
        ORDER BY f.created_at DESC
      `,
        session.sub
      );

      const acceptedFriends = Array.isArray(acceptedFriendsRaw) ? acceptedFriendsRaw : [];
      const sentRequests = Array.isArray(sentRequestsRaw) ? sentRequestsRaw : [];
      const receivedRequests = Array.isArray(receivedRequestsRaw) ? receivedRequestsRaw : [];

      type FriendRow = {
        id: number;
        user_id: number;
        friend_id: number;
        friend_nickname: string;
        friend_avatar_path: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      };

      const formatFriend = (row: FriendRow, type: 'accepted' | 'sent' | 'received'): FriendResponse => {
        let friendId: number;

        if (type === 'accepted') {
          friendId = row.user_id === session.sub ? row.friend_id : row.user_id;
        } else if (type === 'sent') {
          friendId = row.friend_id;
        } else {
          friendId = row.user_id;
        }

        return {
          id: row.id,
          userId: row.user_id,
          friendId: friendId,
          friendNickname: row.friend_nickname,
          friendAvatarUrl: row.friend_avatar_path ? `/api/avatars/${row.friend_avatar_path}` : null,
          status: row.status as 'pending' | 'accepted' | 'rejected',
          createdAt: row.created_at,
          updatedAt: row.updated_at,
          isOnline: deps.isOnline(friendId)
        };
      };

      return {
        friends: acceptedFriends.map((row) => formatFriend(row, 'accepted')),
        requests: {
          sent: sentRequests.map((row) => formatFriend(row, 'sent')),
          received: receivedRequests.map((row) => formatFriend(row, 'received'))
        }
      };
    }
  );

  app.post<{
    Body: AddFriendBody;
    Reply: FriendResponse | ApiErrorResponse;
  }>(
    '/api/friends/add',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const { friendId } = request.body;

      if (!Number.isInteger(friendId) || friendId <= 0) {
        return reply.status(400).send({
          error: 'InvalidFriendId',
          message: 'Geçersiz kullanıcı kimliği.'
        });
      }

      if (friendId === session.sub) {
        return reply.status(400).send({
          error: 'InvalidFriendId',
          message: 'Kendinizi arkadaş olarak ekleyemezsiniz.'
        });
      }

      const friend = await request.server.db.get<{ id: number; nickname: string }>(
        `SELECT id, nickname FROM users WHERE id = ?`,
        friendId
      );

      if (!friend) {
        return reply.status(404).send({
          error: 'UserNotFound',
          message: 'Kullanıcı bulunamadı.'
        });
      }

      const existing = await request.server.db.get<{ id: number; status: string }>(
        `SELECT id, status FROM friends 
         WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)`,
        session.sub,
        friendId,
        friendId,
        session.sub
      );

      if (existing) {
        if (existing.status === 'accepted') {
          return reply.status(409).send({
            error: 'AlreadyFriends',
            message: 'Bu kullanıcı zaten arkadaşınız.'
          });
        } else if (existing.status === 'pending') {
          return reply.status(409).send({
            error: 'RequestExists',
            message: 'Bu kullanıcıya zaten bir arkadaşlık isteği gönderilmiş.'
          });
        }
      }

      const result = await request.server.db.run(
        `
        INSERT INTO friends (user_id, friend_id, status, updated_at)
        VALUES (?, ?, 'pending', CURRENT_TIMESTAMP)
      `,
        session.sub,
        friendId
      );

      const friendAvatar = await request.server.db.get<{ avatar_path: string | null }>(
        `SELECT avatar_path FROM users WHERE id = ?`,
        friendId
      );

      return reply.status(201).send({
        id: result.lastID ?? 0,
        userId: session.sub,
        friendId: friendId,
        friendNickname: friend.nickname,
        friendAvatarUrl: friendAvatar?.avatar_path ? `/api/avatars/${friendAvatar.avatar_path}` : null,
        status: 'pending',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        isOnline: deps.isOnline(friendId)
      });
    }
  );

  app.post<{
    Params: { id: string };
    Reply: FriendResponse | ApiErrorResponse;
  }>(
    '/api/friends/accept/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const requestId = Number(request.params.id);
      if (!Number.isInteger(requestId)) {
        return reply.status(400).send({
          error: 'InvalidRequestId',
          message: 'Geçersiz istek kimliği.'
        });
      }

      const friendship = await request.server.db.get<{
        id: number;
        user_id: number;
        friend_id: number;
        status: string;
      }>(
        `SELECT id, user_id, friend_id, status FROM friends WHERE id = ? AND friend_id = ?`,
        requestId,
        session.sub
      );

      if (!friendship) {
        return reply.status(404).send({
          error: 'RequestNotFound',
          message: 'Arkadaşlık isteği bulunamadı veya bu isteği kabul etme yetkiniz yok.'
        });
      }

      if (friendship.status !== 'pending') {
        return reply.status(400).send({
          error: 'InvalidStatus',
          message: 'Bu istek zaten işlenmiş.'
        });
      }

      await request.server.db.run(
        `
        UPDATE friends 
        SET status = 'accepted', updated_at = CURRENT_TIMESTAMP
        WHERE id = ?
      `,
        requestId
      );

      const updated = await request.server.db.get<{
        id: number;
        user_id: number;
        friend_id: number;
        friend_nickname: string;
        friend_avatar_path: string | null;
        status: string;
        created_at: string;
        updated_at: string;
      }>(
        `
        SELECT 
          f.id,
          f.user_id,
          f.friend_id,
          u.nickname as friend_nickname,
          u.avatar_path as friend_avatar_path,
          f.status,
          f.created_at,
          f.updated_at
        FROM friends f
        JOIN users u ON f.user_id = u.id
        WHERE f.id = ?
      `,
        requestId
      );

      if (!updated) {
        return reply.status(500).send({
          error: 'InternalServerError',
          message: 'İstek kabul edilirken bir hata oluştu.'
        });
      }

      return reply.status(200).send({
        id: updated.id,
        userId: updated.user_id,
        friendId: updated.friend_id,
        friendNickname: updated.friend_nickname,
        friendAvatarUrl: updated.friend_avatar_path ? `/api/avatars/${updated.friend_avatar_path}` : null,
        status: 'accepted',
        createdAt: updated.created_at,
        updatedAt: updated.updated_at,
        isOnline: deps.isOnline(updated.friend_id)
      });
    }
  );

  app.post<{
    Params: { id: string };
    Reply: { success: boolean } | ApiErrorResponse;
  }>(
    '/api/friends/reject/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const requestId = Number(request.params.id);
      if (!Number.isInteger(requestId)) {
        return reply.status(400).send({
          error: 'InvalidRequestId',
          message: 'Geçersiz istek kimliği.'
        });
      }

      const friendship = await request.server.db.get<{
        id: number;
        status: string;
      }>(
        `SELECT id, status FROM friends WHERE id = ? AND friend_id = ?`,
        requestId,
        session.sub
      );

      if (!friendship) {
        return reply.status(404).send({
          error: 'RequestNotFound',
          message: 'Arkadaşlık isteği bulunamadı veya bu isteği reddetme yetkiniz yok.'
        });
      }

      if (friendship.status !== 'pending') {
        return reply.status(400).send({
          error: 'InvalidStatus',
          message: 'Bu istek zaten işlenmiş.'
        });
      }

      await request.server.db.run(`DELETE FROM friends WHERE id = ?`, requestId);

      return reply.status(200).send({ success: true });
    }
  );

  app.delete<{
    Params: { id: string };
    Reply: { success: boolean } | ApiErrorResponse;
  }>(
    '/api/friends/:id',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const friendId = Number(request.params.id);
      if (!Number.isInteger(friendId)) {
        return reply.status(400).send({
          error: 'InvalidFriendId',
          message: 'Geçersiz kullanıcı kimliği.'
        });
      }

      const friendship = await request.server.db.get<{
        id: number;
      }>(
        `SELECT id FROM friends 
         WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)) 
         AND status = 'accepted'`,
        session.sub,
        friendId,
        friendId,
        session.sub
      );

      if (!friendship) {
        return reply.status(404).send({
          error: 'FriendshipNotFound',
          message: 'Arkadaşlık bulunamadı.'
        });
      }

      await request.server.db.run(
        `
        DELETE FROM friends 
        WHERE ((user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?))
      `,
        session.sub,
        friendId,
        friendId,
        session.sub
      );

      return reply.status(200).send({ success: true });
    }
  );

  app.get<{
    Params: { id: string };
    Reply: PublicProfileResponse | ApiErrorResponse;
  }>(
    '/api/users/:id/profile',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const userId = Number(request.params.id);
      if (!Number.isInteger(userId) || userId <= 0) {
        return reply.status(400).send({
          error: 'InvalidUserId',
          message: 'Geçersiz kullanıcı kimliği.'
        });
      }

      const user = await request.server.db.get<{
        id: number;
        nickname: string;
        avatar_path: string | null;
        created_at: string;
      }>(
        `SELECT id, nickname, avatar_path, created_at FROM users WHERE id = ?`,
        userId
      );

      if (!user) {
        return reply.status(404).send({
          error: 'UserNotFound',
          message: 'Kullanıcı bulunamadı.'
        });
      }

      const totalGames = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE player1_id = ? OR player2_id = ?
      `, userId, userId);

      const wins = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) AND winner_id = ?
      `, userId, userId, userId);

      const losses = await request.server.db.get<{ count: number }>(`
        SELECT COUNT(*) as count
        FROM game_sessions
        WHERE (player1_id = ? OR player2_id = ?) AND (winner_id IS NULL OR winner_id != ?)
      `, userId, userId, userId);

      const friendship = await request.server.db.get<{
        status: string;
        user_id: number;
      }>(`
        SELECT status, user_id
        FROM friends
        WHERE (user_id = ? AND friend_id = ?) OR (user_id = ? AND friend_id = ?)
        ORDER BY updated_at DESC
        LIMIT 1
      `, session.sub, userId, userId, session.sub);

      let friendStatus: 'none' | 'pending' | 'accepted' | 'rejected' = 'none';
      let isFriend = false;
      if (friendship) {
        if (friendship.status === 'accepted') {
          friendStatus = 'accepted';
          isFriend = true;
        } else if (friendship.status === 'pending') {
          friendStatus = 'pending';
        } else if (friendship.status === 'rejected') {
          friendStatus = 'rejected';
        }
      }

      return {
        id: user.id,
        nickname: user.nickname,
        avatarUrl: user.avatar_path ? `/api/avatars/${user.avatar_path}` : null,
        createdAt: user.created_at,
        stats: {
          totalGames: totalGames?.count || 0,
          wins: wins?.count || 0,
          losses: losses?.count || 0
        },
        isFriend,
        friendStatus
      };
    }
  );
};
