"use strict";

const express = require("express");
const helmet = require("helmet");
const db = require("./db");
const applyLoanRouter = require("./routes/applyLoan.route");
const telegramRouter = require("./routes/telegram.route");

const app = express();

app.use(helmet());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", process.env.CORS_ORIGIN || "*");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,DELETE,OPTIONS");

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }

  next();
});

app.get("/", (req, res) => {
  res.json({ ok: true, message: "easyiloners is working" });
});

app.get("/health", async (req, res) => {
  const dbms = db.debug();

  try {
    const status = await db.status();
    res.json({ ok: true, gateway: status, dbms });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message, dbms });
  }
});

app.use("/api/apply-loan", applyLoanRouter);
app.use("/api/telegram", telegramRouter);

module.exports = app;
