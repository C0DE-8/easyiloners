"use strict";

function requireValue(name, value) {
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

function normalizeBaseUrl(url) {
  return requireValue("DBMS_URL", url).replace(/\/+$/, "");
}

function createAbortSignal(timeoutMs) {
  if (typeof AbortSignal !== "undefined" && AbortSignal.timeout) {
    return AbortSignal.timeout(timeoutMs);
  }

  const controller = new AbortController();
  setTimeout(() => controller.abort(), timeoutMs);
  return controller.signal;
}

async function parseGatewayResponse(response) {
  const text = await response.text();
  const payload = text ? JSON.parse(text) : {};

  if (!response.ok) {
    const message = payload.error || payload.message || `DBMS Gateway request failed with status ${response.status}`;
    throw new Error(message);
  }

  return payload;
}

function connectProject(siteId, options) {
  const config = options || {};
  const resolvedSiteId = requireValue("SITE_ID", siteId);
  const apiKey = requireValue("API_KEY", config.apiKey);
  const dbmsUrl = normalizeBaseUrl(config.dbmsUrl);
  const timeoutMs = Number(config.timeoutMs || 15000);

  async function request(path, init) {
    const response = await fetch(`${dbmsUrl}${path}`, {
      ...init,
      headers: {
        "Content-Type": "application/json",
        "x-site-id": resolvedSiteId,
        "x-api-key": apiKey
      },
      signal: createAbortSignal(timeoutMs)
    });

    return parseGatewayResponse(response);
  }

  async function query(sql, params) {
    const payload = await request("/gateway/query", {
      method: "POST",
      body: JSON.stringify({ sql, params: params || [] })
    });

    return payload.rows || [];
  }

  return {
    query,
    execute: query,
    status() {
      return request("/gateway/status", { method: "GET" });
    }
  };
}

module.exports = { connectProject };
