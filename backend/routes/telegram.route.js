"use strict";

const express = require("express");
const {
  deleteTelegramWebhook,
  getTelegramDebug,
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  setTelegramWebhook
} = require("../services/telegram");

const router = express.Router();

function requireAdminKey(req, res, next) {
  const adminKey = process.env.TELEGRAM_ADMIN_KEY;

  if (!adminKey) {
    return next();
  }

  if (req.get("x-admin-key") !== adminKey) {
    return res.status(401).json({ ok: false, error: "Invalid admin key" });
  }

  next();
}

router.get("/debug", requireAdminKey, async (req, res) => {
  try {
    const telegram = await getTelegramDebug();
    res.json({ ok: true, telegram });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.get("/webhook", requireAdminKey, async (req, res) => {
  try {
    const webhook = await getTelegramWebhookInfo();
    res.json({ ok: true, webhook });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/webhook", requireAdminKey, async (req, res) => {
  const url = (req.body && req.body.url) || process.env.TELEGRAM_WEBHOOK_URL;

  try {
    const result = await setTelegramWebhook(url);
    res.json({ ok: true, result });
  } catch (error) {
    res.status(400).json({ ok: false, error: error.message });
  }
});

router.delete("/webhook", requireAdminKey, async (req, res) => {
  try {
    const result = await deleteTelegramWebhook();
    res.json({ ok: true, result });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

router.post("/webhook/update", async (req, res) => {
  const expectedSecret = process.env.TELEGRAM_WEBHOOK_SECRET;

  if (expectedSecret && req.get("x-telegram-bot-api-secret-token") !== expectedSecret) {
    return res.status(401).json({ ok: false, error: "Invalid Telegram webhook secret" });
  }

  try {
    await handleTelegramUpdate(req.body || {});
    res.json({ ok: true });
  } catch (error) {
    res.status(500).json({ ok: false, error: error.message });
  }
});

module.exports = router;
