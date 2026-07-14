"use strict";

require("dotenv").config();

const db = require("../db");

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS live_chat_sessions (
      id CHAR(36) NOT NULL PRIMARY KEY,
      name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'open',
      assigned_chat_id VARCHAR(100) NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_live_chat_sessions_status_created_at (status, created_at),
      INDEX idx_live_chat_sessions_email (email)
    )
  `);

  await db.execute(`
    CREATE TABLE IF NOT EXISTS live_chat_messages (
      id CHAR(36) NOT NULL PRIMARY KEY,
      session_id CHAR(36) NOT NULL,
      sender VARCHAR(50) NOT NULL,
      message TEXT NOT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_live_chat_messages_session_created_at (session_id, created_at)
    )
  `);
}

migrate()
  .then(() => {
    console.log("Migration complete: live chat");
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  });
