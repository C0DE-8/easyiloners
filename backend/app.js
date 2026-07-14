"use strict";

const express = require("express");
const db = require("./db");

const app = express();

app.use(express.json());

app.get("/health", async (req, res) => {
  try {
    const status = await db.status();
    res.json({ ok: true, gateway: status });
  } catch (error) {
    res.status(503).json({ ok: false, error: error.message });
  }
});

module.exports = app;
