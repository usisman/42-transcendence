import sqlite3 from 'sqlite3';
import { open, Database } from 'sqlite';
import path from 'path';
import { promises as fs } from 'fs';
export const createDatabaseConnection = async () => {
  const dataDir = path.join(process.cwd(), 'data');
  const databasePath = path.join(dataDir, 'transcendence.sqlite');
  await fs.mkdir(dataDir, { recursive: true });
  const db = await open({
    filename: databasePath,
    driver: sqlite3.Database
  });
  await db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT NOT NULL,
      provider TEXT NOT NULL DEFAULT 'local',
      provider_id TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const existingColumnsRaw = await db.all(`PRAGMA table_info(users)`);
  const existingColumns = existingColumnsRaw as Array<{ name: string }>;
  const columnNames = new Set(
    existingColumns.map((column: { name: string }) => column.name)
  );

  if (!columnNames.has('provider')) {
    await db.exec(`ALTER TABLE users ADD COLUMN provider TEXT NOT NULL DEFAULT 'local';`);
  }

  if (!columnNames.has('provider_id')) {
    await db.exec(`ALTER TABLE users ADD COLUMN provider_id TEXT;`);
  }

  if (!columnNames.has('avatar_path')) {
    await db.exec(`ALTER TABLE users ADD COLUMN avatar_path TEXT;`);
  }
  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_provider_provider_id
    ON users (provider, provider_id)
    WHERE provider_id IS NOT NULL
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tournaments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL,
      owner_id INTEGER,
      max_players INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      bracket_json TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      started_at DATETIME,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    )
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS tournament_players (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      tournament_id INTEGER NOT NULL,
      user_id INTEGER,
      alias TEXT NOT NULL,
      is_ai INTEGER NOT NULL DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id),
      FOREIGN KEY (user_id) REFERENCES users(id)
    )
  `);

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_players_unique_user
    ON tournament_players (tournament_id, user_id)
    WHERE user_id IS NOT NULL
  `);

  await db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_tournament_players_alias
    ON tournament_players (tournament_id, alias)
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS game_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      player1_id INTEGER,
      player1_nickname TEXT NOT NULL,
      player2_id INTEGER,
      player2_nickname TEXT NOT NULL,
      winner_id INTEGER,
      winner_nickname TEXT NOT NULL,
      player1_score INTEGER NOT NULL DEFAULT 0,
      player2_score INTEGER NOT NULL DEFAULT 0,
      game_type TEXT NOT NULL DEFAULT 'casual',
      tournament_id INTEGER,
      match_id TEXT,
      started_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      ended_at DATETIME,
      duration_seconds INTEGER,
      FOREIGN KEY (player1_id) REFERENCES users(id),
      FOREIGN KEY (player2_id) REFERENCES users(id),
      FOREIGN KEY (winner_id) REFERENCES users(id),
      FOREIGN KEY (tournament_id) REFERENCES tournaments(id)
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_sessions_player1_id ON game_sessions(player1_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_sessions_player2_id ON game_sessions(player2_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_sessions_winner_id ON game_sessions(winner_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_game_sessions_started_at ON game_sessions(started_at);
  `);

  await db.exec(`
    CREATE TABLE IF NOT EXISTS friends (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      friend_id INTEGER NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id),
      FOREIGN KEY (friend_id) REFERENCES users(id),
      UNIQUE(user_id, friend_id)
    )
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_friends_user_id ON friends(user_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_friends_friend_id ON friends(friend_id);
  `);

  await db.exec(`
    CREATE INDEX IF NOT EXISTS idx_friends_status ON friends(status);
  `);

  return db;
};

export type AppDatabase = Database;
