import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type { AppDatabase } from '../database.js';
import cookie from 'cookie';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const GOOGLE_USERINFO_URL = 'https://www.googleapis.com/oauth2/v3/userinfo';

type JwtBasePayload = {
  sub: number;
  email: string;
  nickname: string;
  provider: 'local' | 'google';
};

type GoogleTokenResponse = {
  access_token?: string;
  id_token?: string;
  expires_in?: number;
  token_type?: string;
  refresh_token?: string;
  scope?: string;
};

type GoogleUserInfo = {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  given_name?: string;
  picture?: string;
  locale?: string;
  hd?: string;
};

type OAuthDeps = {
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  oauthSentinel: string;
  googleStateCookie: string;
  googleStateTtlSeconds: number;
  buildGoogleAuthUrl: (state: string) => string;
  buildFrontendRedirect: (status?: string) => string;
  appendCookies: (reply: FastifyReply, cookiesToAdd: string[]) => void;
  serializeCookie: (name: string, value: string, maxAge: number) => string;
  clearOauthStateCookie: (reply: FastifyReply) => void;
  issueTokens: (reply: FastifyReply, payload: JwtBasePayload) => void;
  ensureUniqueNickname: (db: AppDatabase, desired: string) => Promise<string>;
};

export const registerOAuthRoutes = (app: FastifyInstance, deps: OAuthDeps) => {
  app.get('/api/users/oauth/google/start', async (_request, reply) => {
    const state = randomBytes(24).toString('hex');

    deps.appendCookies(reply, [
      deps.serializeCookie(deps.googleStateCookie, state, deps.googleStateTtlSeconds)
    ]);

    const googleUrl = deps.buildGoogleAuthUrl(state);
    reply.redirect(googleUrl);
  });

  type GoogleCallbackQuery = {
    code?: string;
    state?: string;
    error?: string;
  };

  app.get<{ Querystring: GoogleCallbackQuery }>(
    '/api/users/oauth/google/callback',
    async (request, reply) => {
      const redirectWithStatus = (status: string) =>
        reply.redirect(303, deps.buildFrontendRedirect(status));

      const { code, state, error } = request.query;

      if (error) {
        deps.clearOauthStateCookie(reply);
        request.log.warn({ error }, 'Google OAuth reddedildi');
        return redirectWithStatus('denied');
      }

      if (!code || !state) {
        deps.clearOauthStateCookie(reply);
        return redirectWithStatus('missing_params');
      }

      const cookies = cookie.parse(request.headers.cookie ?? '');
      const storedState = cookies[deps.googleStateCookie];

      if (!storedState || storedState !== state) {
        deps.clearOauthStateCookie(reply);
        request.log.warn({ storedState, state }, 'Google OAuth state eslesmedi');
        return redirectWithStatus('state_mismatch');
      }

      deps.clearOauthStateCookie(reply);

      let tokenData: GoogleTokenResponse;
      try {
        const tokenResponse = await fetch(GOOGLE_TOKEN_URL, {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            code,
            client_id: deps.googleClientId,
            client_secret: deps.googleClientSecret,
            redirect_uri: deps.googleRedirectUri,
            grant_type: 'authorization_code'
          }).toString()
        });

        if (!tokenResponse.ok) {
          request.log.error({ status: tokenResponse.status }, 'Google token istegi basarisiz');
          return redirectWithStatus('token_error');
        }

        tokenData = (await tokenResponse.json()) as GoogleTokenResponse;
      } catch (fetchError) {
        request.log.error({ err: fetchError }, 'Google token istegi sirasinda hata');
        return redirectWithStatus('token_error');
      }

      if (!tokenData.access_token) {
        request.log.error({ tokenData }, 'Google access token alinamadi');
        return redirectWithStatus('token_error');
      }

      let profile: GoogleUserInfo;
      try {
        const profileResponse = await fetch(GOOGLE_USERINFO_URL, {
          headers: { Authorization: `Bearer ${tokenData.access_token}` }
        });

        if (!profileResponse.ok) {
          request.log.error({ status: profileResponse.status }, 'Google profil istegi basarisiz');
          return redirectWithStatus('profile_error');
        }

        profile = (await profileResponse.json()) as GoogleUserInfo;
      } catch (profileError) {
        request.log.error({ err: profileError }, 'Google profil istegi sirasinda hata');
        return redirectWithStatus('profile_error');
      }

      if (!profile.sub || !profile.email) {
        request.log.error({ profile }, 'Google profilinde sub veya e-posta eksik');
        return redirectWithStatus('profile_error');
      }

      if (profile.email_verified === false) {
        request.log.warn({ email: profile.email }, 'Google e-postasi dogrulanmamis');
        return redirectWithStatus('email_unverified');
      }

      const googleId = profile.sub;
      const email = profile.email.toLowerCase();

      let user = await request.server.db.get<{
        id: number;
        email: string;
        nickname: string;
        provider: string;
      }>(
        `SELECT id, email, nickname, provider FROM users WHERE provider = 'google' AND provider_id = ?`,
        googleId
      );

      if (!user) {
        const existingEmailOwner = await request.server.db.get<{
          id: number;
          provider: string;
          nickname: string;
          provider_id: string | null;
        }>(`SELECT id, provider, nickname, provider_id FROM users WHERE email = ?`, email);

        if (existingEmailOwner && existingEmailOwner.provider === 'google') {
          const needsUpdate = existingEmailOwner.provider_id !== googleId;
          if (needsUpdate) {
            try {
              await request.server.db.run(
                `
                  UPDATE users
                  SET provider_id = ?, password_hash = ?
                  WHERE id = ?
                `,
                googleId,
                deps.oauthSentinel,
                existingEmailOwner.id
              );
            } catch (syncError) {
              request.log.error({ err: syncError }, 'Google kullanicisi provider_id guncellenemedi');
              return redirectWithStatus('internal_error');
            }
          }

          user = {
            id: existingEmailOwner.id,
            email,
            nickname: existingEmailOwner.nickname,
            provider: 'google'
          };
        } else if (existingEmailOwner && existingEmailOwner.provider !== 'google') {
          try {
            await request.server.db.run(
              `
                UPDATE users
                SET provider = 'google',
                    provider_id = ?,
                    password_hash = ?
                WHERE id = ?
              `,
              googleId,
              deps.oauthSentinel,
              existingEmailOwner.id
            );

            user = {
              id: existingEmailOwner.id,
              email,
              nickname: existingEmailOwner.nickname,
              provider: 'google'
            };
          } catch (updateError) {
            request.log.error({ err: updateError }, 'Local kullaniciyi Google ile eslestirme basarisiz');
            return redirectWithStatus('internal_error');
          }
        } else if (!existingEmailOwner) {
          const nicknameSource =
            profile.given_name ?? profile.name ?? email.split('@')[0] ?? 'google-user';
          const nickname = await deps.ensureUniqueNickname(request.server.db, nicknameSource);

          try {
            const result = await request.server.db.run(
              `
                INSERT INTO users (email, password_hash, nickname, provider, provider_id)
                VALUES (?, ?, ?, 'google', ?)
              `,
              email,
              deps.oauthSentinel,
              nickname,
              googleId
            );

            user = {
              id: result.lastID ?? 0,
              email,
              nickname,
              provider: 'google'
            };
          } catch (insertError) {
            request.log.error({ err: insertError }, 'Google kullanicisi olusturulamadi');
            return redirectWithStatus('internal_error');
          }
        }
      }

      if (!user) {
        request.log.error(
          { email, googleId },
          'Google OAuth akisinda kullanici olusturma/guncelleme tamamlanamadi'
        );
        return redirectWithStatus('internal_error');
      }

      const payload: JwtBasePayload = {
        sub: user.id,
        email: user.email,
        nickname: user.nickname,
        provider: 'google'
      };

      deps.issueTokens(reply, payload);
      return redirectWithStatus('success');
    }
  );
};
