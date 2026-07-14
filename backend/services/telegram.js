"use strict";

const axios = require("axios");
const crypto = require("crypto");
const db = require("../db");

const DEFAULT_ACCESS_PASSWORD = "123456";
const MENU_BUTTONS = {
  menu: "📋 Menu",
  access: "✅ Check access",
  stats: "📊 Loan stats",
  loans: "📄 View all loans",
  chats: "💬 Open chats",
  closeChat: "🧹 Close active chat",
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
      [{ text: MENU_BUTTONS.loans }, { text: MENU_BUTTONS.chats }],
      [{ text: MENU_BUTTONS.closeChat }, { text: MENU_BUTTONS.stats }],
      [{ text: MENU_BUTTONS.help }]
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
    "📄 View all loans - show recent loan applications",
    "💬 Open chats - show waiting live chats",
    "🧹 Close active chat - close the chat you picked",
    "ℹ️ Help - show bot instructions",
    "",
    "After you pick a live chat, just send a normal message here to reply.",
    "Use /close to close the active chat.",
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

async function answerCallbackQuery(callbackQueryId, text) {
  if (!callbackQueryId) {
    return null;
  }

  return telegramRequest("answerCallbackQuery", {
    callback_query_id: callbackQueryId,
    text: text || ""
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

async function getRecentLoanApplications(limit) {
  return db.query(
    `SELECT
      id,
      full_name AS fullName,
      email,
      mobile_number AS mobileNumber,
      loan_amount AS loanAmount,
      loan_purpose AS loanPurpose,
      application_status AS status,
      status_message AS message,
      created_at AS submittedAt
    FROM loan_applications
    ORDER BY created_at DESC
    LIMIT ?`,
    [limit]
  );
}

async function getOpenLiveChats() {
  return db.query(
    `SELECT
      id,
      name,
      email,
      status,
      assigned_chat_id AS assignedChatId,
      created_at AS createdAt
    FROM live_chat_sessions
    WHERE status IN ('open', 'assigned')
    ORDER BY created_at ASC
    LIMIT 10`
  );
}

async function getLiveChatById(sessionId) {
  const rows = await db.query(
    `SELECT
      id,
      name,
      email,
      status,
      assigned_chat_id AS assignedChatId,
      created_at AS createdAt
    FROM live_chat_sessions
    WHERE id = ?
    LIMIT 1`,
    [sessionId]
  );

  return rows[0] || null;
}

async function getAssignedLiveChat(chatId) {
  const rows = await db.query(
    `SELECT
      id,
      name,
      email,
      status,
      assigned_chat_id AS assignedChatId,
      created_at AS createdAt
    FROM live_chat_sessions
    WHERE assigned_chat_id = ?
      AND status = 'assigned'
    ORDER BY updated_at DESC
    LIMIT 1`,
    [String(chatId)]
  );

  return rows[0] || null;
}

async function getLiveChatMessageCount(sessionId) {
  const rows = await db.query("SELECT COUNT(*) AS count FROM live_chat_messages WHERE session_id = ?", [sessionId]);
  return Number(rows[0] && rows[0].count ? rows[0].count : 0);
}

async function getLiveChatCount() {
  const rows = await db.query("SELECT COUNT(*) AS count FROM live_chat_sessions WHERE status IN ('open', 'assigned')");
  return Number(rows[0] && rows[0].count ? rows[0].count : 0);
}

async function assignLiveChat(sessionId, chatId) {
  await db.execute(
    "UPDATE live_chat_sessions SET status = 'assigned', assigned_chat_id = ? WHERE id = ?",
    [String(chatId), sessionId]
  );
}

async function saveSupportReply(sessionId, message) {
  await db.execute(
    "INSERT INTO live_chat_messages (id, session_id, sender, message) VALUES (?, ?, 'support', ?)",
    [crypto.randomUUID(), sessionId, message]
  );
}

async function closeLiveChat(sessionId) {
  await db.execute("DELETE FROM live_chat_messages WHERE session_id = ?", [sessionId]);
  await db.execute("DELETE FROM live_chat_sessions WHERE id = ?", [sessionId]);
}

function shortChatId(sessionId) {
  return sessionId.slice(0, 8);
}

function buildLiveChatKeyboard(sessionId) {
  return {
    inline_keyboard: [
      [
        { text: "✅ Pick chat", callback_data: `chat:pick:${sessionId}` },
        { text: "🧹 Close", callback_data: `chat:close:${sessionId}` }
      ]
    ]
  };
}

async function sendManagerMenu(chatId, isAuthorized) {
  await sendTelegramMessage(chatId, getMenuText(isAuthorized), {
    reply_markup: getManagerKeyboard()
  });
}

async function sendManagerStats(chatId) {
  const [authorizedChatCount, loanApplicationCount, liveChatCount, latestApplication] = await Promise.all([
    getAuthorizedChatCount(),
    getLoanApplicationCount(),
    getLiveChatCount(),
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
      `Open live chats: ${liveChatCount}`,
      `Approved manager chats: ${authorizedChatCount}`,
      latestText
    ].join("\n"),
    { reply_markup: getManagerKeyboard() }
  );
}

async function sendRecentLoanApplications(chatId) {
  const applications = await getRecentLoanApplications(10);

  if (applications.length === 0) {
    await sendTelegramMessage(chatId, "📄 No loan applications found.", {
      reply_markup: getManagerKeyboard()
    });
    return;
  }

  await sendTelegramMessage(chatId, `📄 Recent loan applications: ${applications.length}`, {
    reply_markup: getManagerKeyboard()
  });

  for (const application of applications) {
    await sendTelegramMessage(
      chatId,
      [
        `Application: ${application.id}`,
        `Name: ${application.fullName}`,
        `Email: ${application.email}`,
        `Phone: ${application.mobileNumber}`,
        `Loan: ${application.loanPurpose} for ${application.loanAmount}`,
        `Status: ${application.status}`,
        application.message ? `Update: ${application.message}` : null,
        `Submitted: ${application.submittedAt}`
      ].filter(Boolean).join("\n")
    );
  }
}

async function sendOpenLiveChats(chatId) {
  const chats = await getOpenLiveChats();

  if (chats.length === 0) {
    await sendTelegramMessage(chatId, "💬 No open live chats right now.", {
      reply_markup: getManagerKeyboard()
    });
    return;
  }

  await sendTelegramMessage(chatId, `💬 Open live chats: ${chats.length}`, {
    reply_markup: getManagerKeyboard()
  });

  for (const chat of chats) {
    const count = await getLiveChatMessageCount(chat.id);
    await sendTelegramMessage(
      chatId,
      [
        `Chat ${shortChatId(chat.id)}`,
        `Name: ${chat.name}`,
        `Email: ${chat.email}`,
        `Status: ${chat.status}`,
        `Messages: ${count}`,
        "",
        "Tap Pick, then type a normal message here to reply.",
        `Close: /close ${chat.id}`
      ].join("\n"),
      { reply_markup: buildLiveChatKeyboard(chat.id) }
    );
  }
}

async function notifyAuthorizedChats(text, options) {
  const chats = await getAuthorizedChats();

  await Promise.allSettled(chats.map((chat) => sendTelegramMessage(chat.chat_id, text, options)));
}

async function notifyLiveChatStarted(session, queuePosition) {
  await notifyAuthorizedChats(
    [
      "💬 New live chat",
      `Queue position: ${queuePosition}`,
      `Chat: ${shortChatId(session.id)}`,
      `Name: ${session.name}`,
      `Email: ${session.email}`,
      "",
      "Tap Pick, then type a normal message here to reply.",
      `Close: /close ${session.id}`
    ].join("\n"),
    { reply_markup: buildLiveChatKeyboard(session.id) }
  );
}

async function notifyLiveChatMessage(session, message) {
  await notifyAuthorizedChats(
    [
      "💬 Live chat message",
      `Chat: ${shortChatId(session.id)}`,
      `Name: ${session.name}`,
      `Email: ${session.email}`,
      "",
      message,
      "",
      "Tap Pick, then type a normal message here to reply.",
      `Close: /close ${session.id}`
    ].join("\n"),
    { reply_markup: buildLiveChatKeyboard(session.id) }
  );
}

async function handleLiveChatCallback(callbackQuery) {
  const chatId = callbackQuery.message && callbackQuery.message.chat ? callbackQuery.message.chat.id : null;
  const data = callbackQuery.data || "";

  if (!chatId || !data.startsWith("chat:")) {
    return;
  }

  const [, action, sessionId] = data.split(":");
  const session = await getLiveChatById(sessionId);

  if (!session) {
    await answerCallbackQuery(callbackQuery.id, "Chat is already closed");
    await sendTelegramMessage(chatId, "This live chat is already closed.");
    return;
  }

  if (action === "pick") {
    await assignLiveChat(sessionId, chatId);
    await answerCallbackQuery(callbackQuery.id, "Chat picked");
    await sendTelegramMessage(
      chatId,
      [
        `✅ You picked chat ${shortChatId(sessionId)}.`,
        `Customer: ${session.name}`,
        "",
        "Now just type a normal message here and it will be sent to the customer.",
        "Use /close or tap 🧹 Close active chat when finished."
      ].join("\n"),
      { reply_markup: getManagerKeyboard() }
    );
    return;
  }

  if (action === "close") {
    await closeLiveChat(sessionId);
    await answerCallbackQuery(callbackQuery.id, "Chat closed");
    await sendTelegramMessage(chatId, `🧹 Chat ${shortChatId(sessionId)} closed and cleared.`, {
      reply_markup: getManagerKeyboard()
    });
  }
}

async function handleLiveChatCommand(chatId, text) {
  if (text === MENU_BUTTONS.loans || text === "/loans") {
    await sendRecentLoanApplications(chatId);
    return true;
  }

  if (text === MENU_BUTTONS.chats || text === "/chats") {
    await sendOpenLiveChats(chatId);
    return true;
  }

  if (text === MENU_BUTTONS.closeChat || text === "/close") {
    const session = await getAssignedLiveChat(chatId);

    if (!session) {
      await sendTelegramMessage(chatId, "No active picked chat. Tap 💬 Open chats, then pick a chat first.", {
        reply_markup: getManagerKeyboard()
      });
      return true;
    }

    await closeLiveChat(session.id);
    await sendTelegramMessage(chatId, `🧹 Chat ${shortChatId(session.id)} closed and cleared.`, {
      reply_markup: getManagerKeyboard()
    });
    return true;
  }

  if (text.startsWith("/reply ")) {
    const parts = text.split(" ");
    const sessionId = parts[1];
    const message = parts.slice(2).join(" ").trim();
    const session = await getLiveChatById(sessionId);

    if (!session || !message) {
      await sendTelegramMessage(chatId, "Use: /reply CHAT_ID your message", { reply_markup: getManagerKeyboard() });
      return true;
    }

    await assignLiveChat(sessionId, chatId);
    await saveSupportReply(sessionId, message);
    await sendTelegramMessage(chatId, `✅ Reply sent to ${session.name}.`, { reply_markup: getManagerKeyboard() });
    return true;
  }

  if (text.startsWith("/close ")) {
    const sessionId = text.split(" ")[1];
    const session = await getLiveChatById(sessionId);

    if (!session) {
      await sendTelegramMessage(chatId, "That chat is already closed or does not exist.", { reply_markup: getManagerKeyboard() });
      return true;
    }

    await closeLiveChat(sessionId);
    await sendTelegramMessage(chatId, `🧹 Chat ${shortChatId(sessionId)} closed and cleared.`, { reply_markup: getManagerKeyboard() });
    return true;
  }

  if (text && !text.startsWith("/")) {
    const session = await getAssignedLiveChat(chatId);

    if (session) {
      await saveSupportReply(session.id, text);
      await sendTelegramMessage(chatId, `✅ Sent to ${session.name}.`, { reply_markup: getManagerKeyboard() });
      return true;
    }
  }

  return false;
}

async function handleTelegramUpdate(update) {
  if (update.callback_query) {
    const chatId = update.callback_query.message && update.callback_query.message.chat
      ? update.callback_query.message.chat.id
      : null;

    if (chatId && await isAuthorizedChat(chatId)) {
      await handleLiveChatCallback(update.callback_query);
    }
    return;
  }

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

  if (authorized && await handleLiveChatCommand(chat.id, text)) {
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
    allowed_updates: ["message", "edited_message", "callback_query"]
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
    allowed_updates: ["message", "edited_message", "callback_query"]
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
  notifyLiveChatMessage,
  notifyLiveChatStarted,
  sendLoanApplication,
  setTelegramWebhook,
  stopTelegramBot,
  startTelegramBot
};
