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
  return FIELDS.reduce((application, field) => {
    const value = body[field];
    application[field] = typeof value === "string" ? value.trim() : value || "";
    return application;
  }, {});
}

function validateApplication(application) {
  return REQUIRED_FIELDS.filter((field) => !application[field]);
}

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
