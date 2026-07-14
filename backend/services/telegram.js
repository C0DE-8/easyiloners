"use strict";

const axios = require("axios");
const db = require("../db");

const DEFAULT_ACCESS_PASSWORD = "123456";

let pollTimer = null;
let updateOffset = 0;

function buildApplicationMessage(application) {
  return [
    "New loan application",
    `Name: ${application.fullName}`,
    `Email: ${application.email}`,
    `Phone: ${application.mobileNumber}`,
    `Loan amount: ${application.loanAmount}`,
    `Monthly income: ${application.monthlyIncome}`,
    `Purpose: ${application.loanPurpose}`,
    `Loan years: ${application.loanYears}`,
    `City: ${application.city}`,
    `State: ${application.state}`,
    `Country: ${application.country}`,
    `Employer: ${application.employerName}`,
    `Employment industry: ${application.employmentIndustry}`
  ].join("\n");
}

function getBotToken() {
  return process.env.TELEGRAM_BOT_TOKEN || process.env.BOT;
}

function getTelegramTimeout() {
  return Number(process.env.TELEGRAM_TIMEOUT_MS || 10000);
}

function getAccessPassword() {
  return process.env.TELEGRAM_ACCESS_PASSWORD || DEFAULT_ACCESS_PASSWORD;
}

async function telegramRequest(method, payload) {
  const token = getBotToken();

  if (!token) {
    throw new Error("Telegram bot token is not configured");
  }

  const response = await axios.post(`https://api.telegram.org/bot${token}/${method}`, payload || {}, {
    timeout: getTelegramTimeout()
  });

  if (!response.data || response.data.ok !== true) {
    throw new Error(response.data && response.data.description ? response.data.description : "Telegram request failed");
  }

  return response.data.result;
}

async function sendTelegramMessage(chatId, text) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true
  });
}

async function saveAuthorizedChat(chat) {
  await db.execute(
    `INSERT INTO telegram_authorized_chats (
      chat_id,
      chat_type,
      username,
      first_name,
      last_name
    ) VALUES (?, ?, ?, ?, ?)
    ON DUPLICATE KEY UPDATE
      chat_type = VALUES(chat_type),
      username = VALUES(username),
      first_name = VALUES(first_name),
      last_name = VALUES(last_name),
      last_seen_at = CURRENT_TIMESTAMP`,
    [
      String(chat.id),
      chat.type || "",
      chat.username || "",
      chat.first_name || "",
      chat.last_name || ""
    ]
  );
}

async function isAuthorizedChat(chatId) {
  const rows = await db.query("SELECT chat_id FROM telegram_authorized_chats WHERE chat_id = ? LIMIT 1", [String(chatId)]);
  return rows.length > 0;
}

async function getAuthorizedChats() {
  return db.query("SELECT chat_id FROM telegram_authorized_chats ORDER BY authorized_at ASC");
}

async function handleTelegramUpdate(update) {
  const message = update.message || update.edited_message;

  if (!message || !message.chat) {
    return;
  }

  const chat = message.chat;
  const text = typeof message.text === "string" ? message.text.trim() : "";

  if (!text || text === "/start") {
    await sendTelegramMessage(chat.id, "Send the access password to receive loan application alerts.");
    return;
  }

  if (text === getAccessPassword()) {
    await saveAuthorizedChat(chat);
    await sendTelegramMessage(chat.id, "Access approved. You will receive new loan application alerts here.");
    return;
  }

  if (await isAuthorizedChat(chat.id)) {
    await sendTelegramMessage(chat.id, "You are already approved for loan application alerts.");
    return;
  }

  await sendTelegramMessage(chat.id, "Invalid password.");
}

async function pollTelegramUpdates() {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT;

  if (!token) {
    return;
  }

  const result = await telegramRequest("getUpdates", {
    offset: updateOffset || undefined,
    timeout: 0,
    allowed_updates: ["message", "edited_message"]
  });

  for (const update of result) {
    updateOffset = update.update_id + 1;
    await handleTelegramUpdate(update);
  }
}

function startTelegramBot() {
  if (pollTimer || process.env.TELEGRAM_BOT_ENABLED === "false") {
    return;
  }

  if (!getBotToken()) {
    console.log("Telegram bot disabled: TELEGRAM_BOT_TOKEN is not configured");
    return;
  }

  const intervalMs = Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 5000);

  pollTimer = setInterval(() => {
    pollTelegramUpdates().catch((error) => {
      console.error("Telegram bot polling failed:", error.message);
    });
  }, intervalMs);

  pollTelegramUpdates().catch((error) => {
    console.error("Telegram bot polling failed:", error.message);
  });

  console.log("Telegram bot polling started");
}

async function sendLoanApplication(application) {
  if (!getBotToken()) {
    return {
      sent: false,
      skipped: true,
      reason: "Telegram bot token is not configured"
    };
  }

  const chats = await getAuthorizedChats();

  if (chats.length === 0) {
    return {
      sent: false,
      skipped: true,
      reason: "No Telegram chats have been approved with the access password"
    };
  }

  const text = buildApplicationMessage(application);
  const results = await Promise.allSettled(chats.map((chat) => sendTelegramMessage(chat.chat_id, text)));
  const sentCount = results.filter((result) => result.status === "fulfilled").length;
  const failedCount = results.length - sentCount;

  return {
    sent: sentCount > 0,
    sentCount,
    failedCount
  };
}

module.exports = {
  handleTelegramUpdate,
  sendLoanApplication,
  startTelegramBot
};
