"use strict";

require("dotenv").config();

const db = require("../db");

async function migrate() {
  await db.execute(`
    CREATE TABLE IF NOT EXISTS loan_applications (
      id CHAR(36) NOT NULL PRIMARY KEY,
      loan_amount VARCHAR(100) NOT NULL,
      monthly_income VARCHAR(100) NOT NULL,
      loan_purpose VARCHAR(100) NOT NULL,
      loan_years VARCHAR(50) NOT NULL,
      full_name VARCHAR(255) NOT NULL,
      email VARCHAR(255) NOT NULL,
      mobile_number VARCHAR(100) NOT NULL,
      marital_status VARCHAR(100) NULL,
      birth_date VARCHAR(50) NULL,
      dependents VARCHAR(50) NULL,
      house_info VARCHAR(255) NULL,
      street VARCHAR(255) NULL,
      city VARCHAR(150) NULL,
      state VARCHAR(150) NULL,
      country VARCHAR(150) NULL,
      pin_code VARCHAR(50) NULL,
      employment_industry VARCHAR(255) NULL,
      employer_name VARCHAR(255) NULL,
      employer_status VARCHAR(150) NULL,
      work_phone_number VARCHAR(100) NULL,
      ip_address VARCHAR(100) NULL,
      user_agent TEXT NULL,
      telegram_sent TINYINT(1) NOT NULL DEFAULT 0,
      telegram_error TEXT NULL,
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_loan_applications_created_at (created_at),
      INDEX idx_loan_applications_email (email)
    )
  `);
}

migrate()
  .then(() => {
    console.log("Migration complete: loan_applications");
  })
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  });
