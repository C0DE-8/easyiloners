"use strict";

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { sendLoanApplication } = require("../services/telegram");

const router = express.Router();

const FIELDS = [
  "loanAmount",
  "monthlyIncome",
  "loanPurpose",
  "loanYears",
  "fullName",
  "email",
  "mobileNumber",
  "maritalStatus",
  "birthDate",
  "dependents",
  "houseInfo",
  "street",
  "city",
  "state",
  "country",
  "pinCode",
  "employmentIndustry",
  "employerName",
  "employerStatus",
  "workPhoneCountryCode",
  "workPhoneNumber"
];

const REQUIRED_FIELDS = [
  "loanAmount",
  "monthlyIncome",
  "loanPurpose",
  "loanYears",
  "fullName",
  "email",
  "mobileNumber"
];

function normalizeApplication(body) {
  const application = FIELDS.reduce((normalized, field) => {
    const value = body[field];
    normalized[field] = typeof value === "string" ? value.trim() : value || "";
    return normalized;
  }, {});

  if (application.employerStatus === "not working") {
    application.employmentIndustry = "";
    application.employerName = "";
    application.workPhoneNumber = "";
    return application;
  }

  if (application.workPhoneCountryCode && application.workPhoneNumber) {
    application.workPhoneNumber = `${application.workPhoneCountryCode} ${application.workPhoneNumber}`;
  }

  return application;
}

function validateApplication(application) {
  return REQUIRED_FIELDS.filter((field) => !application[field]);
}

function selectLoanApplications(whereClause, params, limit) {
  return db.query(
    `SELECT
      id,
      loan_amount AS loanAmount,
      monthly_income AS monthlyIncome,
      loan_purpose AS loanPurpose,
      loan_years AS loanYears,
      full_name AS fullName,
      email,
      mobile_number AS mobileNumber,
      city,
      state,
      country,
      employer_status AS employerStatus,
      application_status AS status,
      status_message AS message,
      created_at AS submittedAt,
      updated_at AS updatedAt
    FROM loan_applications
    ${whereClause}
    ORDER BY created_at DESC
    LIMIT ?`,
    [...params, limit]
  );
}

// Recent loan applications list for the page "View all loans" button.
router.get("/all", async (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit || 25), 1), 100);
  const rows = await selectLoanApplications("", [], limit);

  res.json({ ok: true, applications: rows });
});

// Public status lookup used by borrowers on apply-loan.html.
router.get("/status", async (req, res) => {
  const email = typeof req.query.email === "string" ? req.query.email.trim() : "";

  if (!email) {
    return res.status(400).json({ ok: false, error: "Email is required" });
  }

  const rows = await selectLoanApplications("WHERE LOWER(email) = LOWER(?)", [email], 5);

  res.json({ ok: true, applications: rows });
});

// Accept the public loan application form, store it, then notify approved Telegram chats.
router.post("/", async (req, res) => {
  const application = normalizeApplication(req.body || {});
  const missingFields = validateApplication(application);

  if (missingFields.length > 0) {
    return res.status(400).json({
      ok: false,
      error: "Missing required loan application fields",
      fields: missingFields
    });
  }

  const id = crypto.randomUUID();
  let telegramResult = { sent: false, skipped: true };

  try {
    telegramResult = await sendLoanApplication(application);
  } catch (error) {
    telegramResult = {
      sent: false,
      error: error.message
    };
  }

  await db.execute(
    `INSERT INTO loan_applications (
      id,
      loan_amount,
      monthly_income,
      loan_purpose,
      loan_years,
      full_name,
      email,
      mobile_number,
      marital_status,
      birth_date,
      dependents,
      house_info,
      street,
      city,
      state,
      country,
      pin_code,
      employment_industry,
      employer_name,
      employer_status,
      work_phone_number,
      ip_address,
      user_agent,
      telegram_sent,
      telegram_error
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      id,
      application.loanAmount,
      application.monthlyIncome,
      application.loanPurpose,
      application.loanYears,
      application.fullName,
      application.email,
      application.mobileNumber,
      application.maritalStatus,
      application.birthDate,
      application.dependents,
      application.houseInfo,
      application.street,
      application.city,
      application.state,
      application.country,
      application.pinCode,
      application.employmentIndustry,
      application.employerName,
      application.employerStatus,
      application.workPhoneNumber,
      req.ip || "",
      req.get("user-agent") || "",
      telegramResult.sent ? 1 : 0,
      telegramResult.error || telegramResult.reason || ""
    ]
  );

  res.status(201).json({
    ok: true,
    id,
    telegram: {
      sent: Boolean(telegramResult.sent),
      skipped: Boolean(telegramResult.skipped)
    }
  });
});

module.exports = router;
