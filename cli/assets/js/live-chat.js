(function (window, document) {
  "use strict";

  var storageKey = "easyilonersLiveChatSessionId";
  var pollTimer = null;

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function formatTime(value) {
    var date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
  }

  function buildWidget() {
    document.body.insertAdjacentHTML("beforeend", [
      '<div class="live-chat-widget" id="live-chat-widget">',
      '  <button type="button" class="live-chat-widget__button" aria-label="Open live chat">💬</button>',
      '  <div class="live-chat-widget__panel" role="dialog" aria-label="Live chat">',
      '    <div class="live-chat-widget__header">',
      '      <h2 class="live-chat-widget__title">Live support</h2>',
      '      <button type="button" class="live-chat-widget__close" aria-label="Close live chat">×</button>',
      '    </div>',
      '    <div class="live-chat-widget__body">',
      '      <p class="live-chat-widget__notice">Add your name and email to start a live chat.</p>',
      '      <form class="live-chat-widget__form" id="live-chat-start-form">',
      '        <input class="live-chat-widget__input" name="name" type="text" placeholder="Your name" required>',
      '        <input class="live-chat-widget__input" name="email" type="email" placeholder="Your email" required>',
      '        <button class="live-chat-widget__submit" type="submit">Start chat</button>',
      '      </form>',
      '      <div class="live-chat-widget__chat" hidden>',
      '        <div class="live-chat-widget__messages"></div>',
      '        <form class="live-chat-widget__form" id="live-chat-message-form">',
      '          <textarea class="live-chat-widget__textarea" name="message" placeholder="Type your message" required></textarea>',
      '          <button class="live-chat-widget__submit" type="submit">Send</button>',
      '        </form>',
      '      </div>',
      '    </div>',
      '  </div>',
      '</div>'
    ].join(""));
  }

  function renderMessages(widget, messages) {
    var list = widget.querySelector(".live-chat-widget__messages");

    list.innerHTML = (messages || []).map(function (item) {
      return [
        '<div class="live-chat-widget__message live-chat-widget__message--' + escapeHtml(item.sender) + '">',
        '<span class="live-chat-widget__meta">' + escapeHtml(item.sender) + (item.createdAt ? " · " + escapeHtml(formatTime(item.createdAt)) : "") + '</span>',
        escapeHtml(item.message),
        '</div>'
      ].join("");
    }).join("");

    list.scrollTop = list.scrollHeight;
  }

  function setNotice(widget, message) {
    widget.querySelector(".live-chat-widget__notice").textContent = message;
  }

  function showChat(widget) {
    widget.querySelector("#live-chat-start-form").hidden = true;
    widget.querySelector(".live-chat-widget__chat").hidden = false;
  }

  function resetChat(widget, message) {
    window.localStorage.removeItem(storageKey);
    widget.querySelector("#live-chat-start-form").hidden = false;
    widget.querySelector(".live-chat-widget__chat").hidden = true;
    widget.querySelector(".live-chat-widget__messages").innerHTML = "";
    setNotice(widget, message || "Add your name and email to start a live chat.");
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
  }

  function loadSession(widget, sessionId) {
    return window.easyilonersApi.getLiveChat(sessionId)
      .then(function (data) {
        showChat(widget);
        setNotice(widget, "You are connected to live support. If support closes the chat, this panel will reset.");
        renderMessages(widget, data.messages);
      })
      .catch(function () {
        resetChat(widget, "Support closed this chat. Start a new live chat when you are ready.");
      });
  }

  function startPolling(widget, sessionId) {
    if (pollTimer) {
      clearInterval(pollTimer);
    }

    pollTimer = setInterval(function () {
      loadSession(widget, sessionId);
    }, 4000);
  }

  function initWidget() {
    if (!window.easyilonersApi) {
      return;
    }

    buildWidget();

    var widget = document.getElementById("live-chat-widget");
    var openButton = widget.querySelector(".live-chat-widget__button");
    var closeButton = widget.querySelector(".live-chat-widget__close");
    var startForm = widget.querySelector("#live-chat-start-form");
    var messageForm = widget.querySelector("#live-chat-message-form");
    var existingSessionId = window.localStorage.getItem(storageKey);

    openButton.addEventListener("click", function () {
      widget.classList.add("live-chat-widget--open");
    });

    closeButton.addEventListener("click", function () {
      widget.classList.remove("live-chat-widget--open");
    });

    startForm.addEventListener("submit", function (event) {
      event.preventDefault();
      setNotice(widget, "Starting live chat...");

      window.easyilonersApi.startLiveChat({
        name: startForm.elements.name.value,
        email: startForm.elements.email.value
      }).then(function (data) {
        window.localStorage.setItem(storageKey, data.session.id);
        setNotice(widget, data.message);
        showChat(widget);
        return loadSession(widget, data.session.id).then(function () {
          startPolling(widget, data.session.id);
        });
      }).catch(function (error) {
        setNotice(widget, error.message);
      });
    });

    messageForm.addEventListener("submit", function (event) {
      event.preventDefault();

      var sessionId = window.localStorage.getItem(storageKey);
      var message = messageForm.elements.message.value.trim();

      if (!sessionId || !message) {
        return;
      }

      window.easyilonersApi.sendLiveChatMessage(sessionId, message)
        .then(function () {
          messageForm.reset();
          return loadSession(widget, sessionId);
        })
        .catch(function (error) {
          setNotice(widget, error.message);
        });
    });

    if (existingSessionId) {
      loadSession(widget, existingSessionId).then(function () {
        startPolling(widget, existingSessionId);
      });
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", initWidget);
  } else {
    initWidget();
  }
})(window, document);
