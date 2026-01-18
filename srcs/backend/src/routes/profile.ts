import type { FastifyInstance } from 'fastify';
import path from 'path';
import { promises as fs } from 'fs';

type ApiErrorResponse = {
  error: string;
  message: string;
};

type LoginSuccess = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type MeResponse = LoginSuccess;

type ProfileResponse = {
  id: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
  createdAt: string;
  avatarUrl: string | null;
};

type UpdateProfileBody = {
  nickname: string;
};

type ProfileDeps = {
  uploadsDir: string;
};

const responseUserSchema = () => ({
  type: 'object',
  properties: {
    id: { type: 'number' },
    email: { type: 'string' },
    nickname: { type: 'string' },
    provider: { type: 'string' }
  },
  required: ['id', 'email', 'nickname', 'provider']
});

const whoAmISchema = {
  response: {
    200: responseUserSchema()
  }
} as const;

export const registerProfileRoutes = (app: FastifyInstance, deps: ProfileDeps) => {
  app.get<{ Reply: MeResponse }>(
    '/api/users/me',
    { preHandler: [app.authenticate], schema: whoAmISchema },
    async (request) => {
      const session = request.session;
      if (!session) {
        throw new Error('Oturum doğrulaması başarısız.');
      }

      const user = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
      }>(
        `SELECT id, email, nickname, provider FROM users WHERE id = ?`,
        session.sub
      );

      if (!user) {
        throw new Error('Authenticated kullanıcı veritabanında bulunamadı.');
      }

      return {
        id: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: user.provider === 'google' ? 'google' : 'local'
      };
    }
  );

  type ProfileErrorResponse = ApiErrorResponse;

  app.get<{ Reply: ProfileResponse | ProfileErrorResponse }>(
    '/api/users/profile',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const record = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
        created_at: string;
        avatar_path: string | null;
      }>(
        `
          SELECT id, email, nickname, provider, created_at, avatar_path
          FROM users
          WHERE id = ?
        `,
        session.sub
      );

      if (!record) {
        return reply.status(404).send({
          error: 'UserNotFound',
          message: 'Kullanıcı profili bulunamadı.'
        });
      }

      return {
        id: record.id,
        email: record.email,
        nickname: record.nickname,
        provider: record.provider === 'google' ? 'google' : 'local',
        createdAt: record.created_at,
        avatarUrl: record.avatar_path ? `/api/avatars/${record.avatar_path}` : null
      };
    }
  );

  app.patch<{
    Body: UpdateProfileBody;
    Reply: ProfileResponse | ApiErrorResponse;
  }>(
    '/api/users/profile',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      const nickname = (request.body.nickname ?? '').trim();
      if (nickname.length < 3 || nickname.length > 48) {
        return reply.status(400).send({
          error: 'InvalidNickname',
          message: 'Takma ad 3 ile 48 karakter arasında olmalı.'
        });
      }

      const duplicate = await request.server.db.get(
        `SELECT 1 FROM users WHERE LOWER(nickname) = LOWER(?) AND id != ?`,
        nickname,
        session.sub
      );
      if (duplicate) {
        return reply.status(409).send({
          error: 'NicknameTaken',
          message: 'Bu takma ad başka bir kullanıcı tarafından kullanılıyor.'
        });
      }

      await request.server.db.run(
        `UPDATE users SET nickname = ? WHERE id = ?`,
        nickname,
        session.sub
      );

      const updated = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
        created_at: string;
        avatar_path: string | null;
      }>(
        `
          SELECT id, email, nickname, provider, created_at, avatar_path
          FROM users
          WHERE id = ?
        `,
        session.sub
      );

      if (!updated) {
        return reply.status(404).send({
          error: 'UserNotFound',
          message: 'Kullanıcı profili bulunamadı.'
        });
      }

      return {
        id: updated.id,
        email: updated.email,
        nickname: updated.nickname,
        provider: updated.provider === 'google' ? 'google' : 'local',
        createdAt: updated.created_at,
        avatarUrl: updated.avatar_path ? `/api/avatars/${updated.avatar_path}` : null
      };
    }
  );

  app.post<{ Reply: { avatarUrl: string } | ApiErrorResponse }>(
    '/api/users/avatar',
    { preHandler: [app.authenticate] },
    async (request, reply) => {
      const session = request.session;
      if (!session) {
        return reply.status(401).send({
          error: 'Unauthorized',
          message: 'Bu işlemi gerçekleştirmek için giriş yapmalısın.'
        });
      }

      try {
        const data = await request.file();
        if (!data) {
          return reply.status(400).send({
            error: 'NoFile',
            message: 'Dosya yüklenmedi.'
          });
        }

        if (!data.mimetype.startsWith('image/')) {
          return reply.status(400).send({
            error: 'InvalidFileType',
            message: 'Sadece resim dosyaları yüklenebilir.'
          });
        }

        const buffer = await data.toBuffer();
        if (buffer.length > 5 * 1024 * 1024) {
          return reply.status(400).send({
            error: 'FileTooLarge',
            message: 'Dosya boyutu 5MB\'dan büyük olamaz.'
          });
        }

        const ext = data.filename.split('.').pop()?.toLowerCase() || 'jpg';
        const allowedExts = ['jpg', 'jpeg', 'png', 'gif', 'webp'];
        if (!allowedExts.includes(ext)) {
          return reply.status(400).send({
            error: 'InvalidFileExtension',
            message: 'Geçersiz dosya uzantısı. İzin verilen: jpg, jpeg, png, gif, webp'
          });
        }

        const timestamp = Date.now();
        const filename = `${session.sub}-${timestamp}.${ext}`;
        const filePath = path.join(deps.uploadsDir, filename);

        await fs.writeFile(filePath, buffer);

        const oldRecord = await request.server.db.get<{ avatar_path: string | null }>(
          `SELECT avatar_path FROM users WHERE id = ?`,
          session.sub
        );

        if (oldRecord?.avatar_path) {
          const oldFilePath = path.join(deps.uploadsDir, oldRecord.avatar_path);
          await fs.unlink(oldFilePath).catch(() => {
          });
        }

        await request.server.db.run(
          `UPDATE users SET avatar_path = ? WHERE id = ?`,
          filename,
          session.sub
        );

        return reply.status(200).send({
          avatarUrl: `/api/avatars/${filename}`
        });
      } catch (error) {
        request.log.error({ err: error }, 'Avatar yükleme hatası');
        return reply.status(500).send({
          error: 'UploadFailed',
          message: 'Avatar yüklenirken bir hata oluştu.'
        });
      }
    }
  );

  app.get<{ Params: { filename: string } }>(
    '/api/avatars/:filename',
    async (request, reply) => {
      const { filename } = request.params;

      const safeFilename = path.basename(filename);
      const filePath = path.join(deps.uploadsDir, safeFilename);

      try {
        await fs.access(filePath);

        const fileBuffer = await fs.readFile(filePath);
        const ext = safeFilename.split('.').pop()?.toLowerCase() || 'jpg';
        const contentType = ext === 'png' ? 'image/png'
          : ext === 'gif' ? 'image/gif'
          : ext === 'webp' ? 'image/webp'
          : 'image/jpeg';

        reply.type(contentType);
        return reply.send(fileBuffer);
      } catch {
        return reply.status(404).send({
          error: 'AvatarNotFound',
          message: 'Avatar bulunamadı.'
        });
      }
    }
  );
};
