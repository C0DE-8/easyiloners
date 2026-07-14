"use strict";

const axios = require("axios");
const db = require("../db");

const DEFAULT_ACCESS_PASSWORD = "123456";
const MENU_BUTTONS = {
  menu: "📋 Menu",
  access: "✅ Check access",
  stats: "📊 Loan stats",
  help: "ℹ️ Help"
};

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

function stopTelegramBot() {
  if (!pollTimer) {
    return;
  }

  clearInterval(pollTimer);
  pollTimer = null;
}

function getManagerKeyboard() {
  return {
    keyboard: [
      [{ text: MENU_BUTTONS.menu }, { text: MENU_BUTTONS.access }],
      [{ text: MENU_BUTTONS.stats }, { text: MENU_BUTTONS.help }]
    ],
    resize_keyboard: true,
    one_time_keyboard: false,
    input_field_placeholder: "Choose a manager action"
  };
}

function getMenuText(isAuthorized) {
  if (!isAuthorized) {
    return [
      "👋 Welcome to easyiloners manager bot.",
      "Send the access password to receive loan application alerts.",
      "",
      "Default password: 123456"
    ].join("\n");
  }

  return [
    "📋 easyiloners manager menu",
    "",
    "✅ Check access - confirm this chat is approved",
    "📊 Loan stats - see application and manager counts",
    "ℹ️ Help - show bot instructions",
    "",
    "New loan applications will be sent here automatically."
  ].join("\n");
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

async function sendTelegramMessage(chatId, text, options) {
  return telegramRequest("sendMessage", {
    chat_id: chatId,
    text,
    disable_web_page_preview: true,
    ...(options || {})
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

async function getAuthorizedChatCount() {
  const rows = await db.query("SELECT COUNT(*) AS count FROM telegram_authorized_chats");
  return Number(rows[0] && rows[0].count ? rows[0].count : 0);
}

async function getLoanApplicationCount() {
  const rows = await db.query("SELECT COUNT(*) AS count FROM loan_applications");
  return Number(rows[0] && rows[0].count ? rows[0].count : 0);
}

async function getLatestLoanApplication() {
  const rows = await db.query(
    `SELECT
      full_name AS fullName,
      email,
      loan_amount AS loanAmount,
      loan_purpose AS loanPurpose,
      application_status AS status,
      created_at AS submittedAt
    FROM loan_applications
    ORDER BY created_at DESC
    LIMIT 1`
  );

  return rows[0] || null;
}

async function sendManagerMenu(chatId, isAuthorized) {
  await sendTelegramMessage(chatId, getMenuText(isAuthorized), {
    reply_markup: getManagerKeyboard()
  });
}

async function sendManagerStats(chatId) {
  const [authorizedChatCount, loanApplicationCount, latestApplication] = await Promise.all([
    getAuthorizedChatCount(),
    getLoanApplicationCount(),
    getLatestLoanApplication()
  ]);

  const latestText = latestApplication
    ? [
        "",
        "Latest application:",
        `Name: ${latestApplication.fullName}`,
        `Email: ${latestApplication.email}`,
        `Loan: ${latestApplication.loanPurpose} for ${latestApplication.loanAmount}`,
        `Status: ${latestApplication.status}`,
        `Submitted: ${latestApplication.submittedAt}`
      ].join("\n")
    : "\nLatest application: none yet";

  await sendTelegramMessage(
    chatId,
    [
      "📊 easyiloners loan stats",
      "",
      `Loan applications: ${loanApplicationCount}`,
      `Approved manager chats: ${authorizedChatCount}`,
      latestText
    ].join("\n"),
    { reply_markup: getManagerKeyboard() }
  );
}

async function handleTelegramUpdate(update) {
  const message = update.message || update.edited_message;

  if (!message || !message.chat) {
    return;
  }

  const chat = message.chat;
  const text = typeof message.text === "string" ? message.text.trim() : "";

  const authorized = await isAuthorizedChat(chat.id);

  if (!text || text === "/start" || text === "/menu" || text === MENU_BUTTONS.menu) {
    await sendManagerMenu(chat.id, authorized);
    return;
  }

  if (text === getAccessPassword()) {
    await saveAuthorizedChat(chat);
    await sendTelegramMessage(chat.id, "✅ Access approved. You will receive new loan application alerts here.", {
      reply_markup: getManagerKeyboard()
    });
    await sendManagerMenu(chat.id, true);
    return;
  }

  if (text === MENU_BUTTONS.access || text === "/access") {
    await sendTelegramMessage(
      chat.id,
      authorized ? "✅ This chat is approved for loan alerts." : "🔒 This chat is not approved yet. Send the access password.",
      { reply_markup: getManagerKeyboard() }
    );
    return;
  }

  if (text === MENU_BUTTONS.help || text === "/help") {
    await sendTelegramMessage(chat.id, getMenuText(authorized), {
      reply_markup: getManagerKeyboard()
    });
    return;
  }

  if (text === MENU_BUTTONS.stats || text === "/stats") {
    if (!authorized) {
      await sendTelegramMessage(chat.id, "🔒 Send the access password before viewing loan stats.", {
        reply_markup: getManagerKeyboard()
      });
      return;
    }

    await sendManagerStats(chat.id);
    return;
  }

  if (authorized) {
    await sendTelegramMessage(chat.id, "📋 Choose an action from the manager menu.", {
      reply_markup: getManagerKeyboard()
    });
    return;
  }

  await sendTelegramMessage(chat.id, "❌ Invalid password. Send the access password or tap 📋 Menu.", {
    reply_markup: getManagerKeyboard()
  });
}

async function setTelegramWebhook(url) {
  if (!url) {
    throw new Error("Webhook URL is required");
  }

  const payload = {
    url,
    allowed_updates: ["message", "edited_message"]
  };

  if (process.env.TELEGRAM_WEBHOOK_SECRET) {
    payload.secret_token = process.env.TELEGRAM_WEBHOOK_SECRET;
  }

  const result = await telegramRequest("setWebhook", payload);
  stopTelegramBot();
  return result;
}

async function deleteTelegramWebhook() {
  return telegramRequest("deleteWebhook", {
    drop_pending_updates: process.env.TELEGRAM_DROP_PENDING_UPDATES === "true"
  });
}

async function getTelegramWebhookInfo() {
  return telegramRequest("getWebhookInfo");
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

  if (process.env.TELEGRAM_USE_WEBHOOK === "true" || process.env.TELEGRAM_WEBHOOK_URL) {
    console.log("Telegram polling disabled: webhook mode is configured");
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

async function getTelegramDebug() {
  const token = getBotToken();
  let webhook = null;
  let webhookError = null;

  try {
    webhook = token ? await getTelegramWebhookInfo() : null;
  } catch (error) {
    webhookError = error.message;
  }

  return {
    tokenConfigured: Boolean(token),
    tokenLength: token ? token.length : 0,
    passwordConfigured: Boolean(getAccessPassword()),
    pollingEnabled: Boolean(pollTimer),
    webhookModeConfigured: process.env.TELEGRAM_USE_WEBHOOK === "true" || Boolean(process.env.TELEGRAM_WEBHOOK_URL),
    webhookUrlConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_URL),
    webhookSecretConfigured: Boolean(process.env.TELEGRAM_WEBHOOK_SECRET),
    pollIntervalMs: Number(process.env.TELEGRAM_POLL_INTERVAL_MS || 5000),
    authorizedChatCount: await getAuthorizedChatCount(),
    webhook,
    webhookError
  };
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
  deleteTelegramWebhook,
  getTelegramDebug,
  getTelegramWebhookInfo,
  handleTelegramUpdate,
  sendLoanApplication,
  setTelegramWebhook,
  stopTelegramBot,
  startTelegramBot
};
