"use strict";

const express = require("express");
const crypto = require("crypto");
const db = require("../db");
const { notifyLiveChatMessage, notifyLiveChatStarted } = require("../services/telegram");

const router = express.Router();

function cleanString(value) {
  return typeof value === "string" ? value.trim() : "";
}

async function getOpenChatCount() {
  const rows = await db.query("SELECT COUNT(*) AS count FROM live_chat_sessions WHERE status IN ('open', 'assigned')");
  return Number(rows[0] && rows[0].count ? rows[0].count : 0);
}

async function getSession(sessionId) {
  const rows = await db.query(
    `SELECT
      id,
      name,
      email,
      status,
      assigned_chat_id AS assignedChatId,
      created_at AS createdAt,
      updated_at AS updatedAt
    FROM live_chat_sessions
    WHERE id = ?
    LIMIT 1`,
    [sessionId]
  );

  return rows[0] || null;
}

async function getMessages(sessionId) {
  return db.query(
    `SELECT
      id,
      sender,
      message,
      created_at AS createdAt
    FROM live_chat_messages
    WHERE session_id = ?
    ORDER BY created_at ASC`,
    [sessionId]
  );
}

router.post("/start", async (req, res) => {
  const name = cleanString(req.body && req.body.name);
  const email = cleanString(req.body && req.body.email);

  if (!name || !email) {
    return res.status(400).json({ ok: false, error: "Name and email are required" });
  }

  const waitingBefore = await getOpenChatCount();
  const id = crypto.randomUUID();

  await db.execute(
    "INSERT INTO live_chat_sessions (id, name, email, status) VALUES (?, ?, ?, 'open')",
    [id, name, email]
  );

  const session = await getSession(id);
  await db.execute(
    "INSERT INTO live_chat_messages (id, session_id, sender, message) VALUES (?, ?, 'system', ?)",
    [crypto.randomUUID(), id, "Live chat started. A support manager will reply here."]
  );

  await notifyLiveChatStarted(session, waitingBefore + 1).catch((error) => {
    console.error("Live chat Telegram notification failed:", error.message);
  });

  res.status(201).json({
    ok: true,
    session,
    queuePosition: waitingBefore + 1,
    message: waitingBefore > 0
      ? `There are ${waitingBefore} open chat(s) ahead of you. You are number ${waitingBefore + 1}.`
      : "A support manager will be with you shortly."
  });
});

router.get("/:sessionId", async (req, res) => {
  const session = await getSession(req.params.sessionId);

  if (!session) {
    return res.status(404).json({ ok: false, error: "Chat session was closed or not found" });
  }

  res.json({ ok: true, session, messages: await getMessages(session.id) });
});

router.post("/:sessionId/messages", async (req, res) => {
  const session = await getSession(req.params.sessionId);
  const message = cleanString(req.body && req.body.message);

  if (!session) {
    return res.status(404).json({ ok: false, error: "Chat session was closed or not found" });
  }

  if (!message) {
    return res.status(400).json({ ok: false, error: "Message is required" });
  }

  const id = crypto.randomUUID();

  await db.execute(
    "INSERT INTO live_chat_messages (id, session_id, sender, message) VALUES (?, ?, 'user', ?)",
    [id, session.id, message]
  );

  await notifyLiveChatMessage(session, message).catch((error) => {
    console.error("Live chat Telegram notification failed:", error.message);
  });

  res.status(201).json({ ok: true, message: { id, sender: "user", message } });
});

module.exports = router;
