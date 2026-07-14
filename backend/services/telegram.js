"use strict";

const axios = require("axios");

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

async function sendLoanApplication(application) {
  const token = process.env.TELEGRAM_BOT_TOKEN || process.env.BOT;
  const chatId = process.env.TELEGRAM_CHAT_ID;

  if (!token || !chatId) {
    return {
      sent: false,
      skipped: true,
      reason: "Telegram bot token or chat id is not configured"
    };
  }

  const response = await axios.post(
    `https://api.telegram.org/bot${token}/sendMessage`,
    {
      chat_id: chatId,
      text: buildApplicationMessage(application),
      disable_web_page_preview: true
    },
    {
      timeout: Number(process.env.TELEGRAM_TIMEOUT_MS || 10000)
    }
  );

  return {
    sent: true,
    messageId: response.data && response.data.result ? response.data.result.message_id : null
  };
}

module.exports = {
  sendLoanApplication
};
