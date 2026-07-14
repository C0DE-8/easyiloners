"use strict";

const express = require("express");
const db = require("./db");

const app = express();

app.use(express.json());

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

module.exports = app;
