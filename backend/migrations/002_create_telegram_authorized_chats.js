"use strict";

require("dotenv").config();

const db = require("../db");

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS telegram_authorized_chats (
      chat_id VARCHAR(100) NOT NULL PRIMARY KEY,
      chat_type VARCHAR(50) NULL,
      username VARCHAR(255) NULL,
      first_name VARCHAR(255) NULL,
      last_name VARCHAR(255) NULL,
      authorized_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_telegram_authorized_chats_authorized_at (authorized_at)
    )
  `);
}

migrate()
  .then(() => {
    console.log("Migration complete: telegram_authorized_chats");
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  });
