"use strict";

require("dotenv").config();

const db = require("../db");

async function runAlter(sql) {
  try {
    await db.execute(sql);
  } catch (error) {
    if (!/duplicate column|already exists/i.test(error.message)) {
      throw error;
    }
  }
}

async function migrate() {
  await runAlter(`
    ALTER TABLE loan_applications
    ADD COLUMN application_status VARCHAR(50) NOT NULL DEFAULT 'submitted'
  `);

  await runAlter(`
    ALTER TABLE loan_applications
    ADD COLUMN status_message VARCHAR(255) NULL
  `);

  await runAlter(`
    ALTER TABLE loan_applications
    ADD COLUMN updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
  `);
}

migrate()
  .then(() => {
    console.log("Migration complete: loan application status fields");
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  });
