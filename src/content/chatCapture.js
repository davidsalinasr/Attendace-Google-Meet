// Chat capture module — observes the Meet chat panel for new messages.
// Loaded as a content script alongside content.js.

(() => {
  const MAX_MESSAGES_PER_SESSION = 500;
  let chatObserver = null;
  let bodyWatcher = null;
  let capturedCount = 0;
  const seenMessages = new Set();
  const recentTexts = new Map();
  let isCapturing = false;

  const CHAT_PANEL_SELECTORS = [
    '[data-panel-id="chat"]',
    '[aria-label="Chat messages"]',
    '[aria-label="Messages in the call"]',
    '[aria-label="In-call messages"]',
  ];

  function findChatContainer() {
    for (const sel of CHAT_PANEL_SELECTORS) {
      const el = document.querySelector(sel);
      if (el) return el;
    }
    const msgEl = document.querySelector('[data-message-id]');
    if (msgEl) {
      let container = msgEl.parentElement;
      while (container && container !== document.body) {
        if (container.querySelectorAll('[data-message-id]').length >= 1) {
          const parent = container.parentElement;
          if (!parent || parent === document.body || parent.querySelectorAll('[data-message-id]').length === 0) {
            return container;
          }
        }
        container = container.parentElement;
      }
    }
    return null;
  }

  function captureMessagesFrom(container) {
    if (capturedCount >= MAX_MESSAGES_PER_SESSION) return;

    const messageElements = container.querySelectorAll('[data-message-id]');

    const selfNameEl = document.querySelector('[data-self-name]');
    const selfName = window.__matHostName
      || selfNameEl?.getAttribute('data-self-name')
      || selfNameEl?.textContent?.trim()
      || null;

    const groupSenders = new Map();
    const groups = container.querySelectorAll('.Ss4fHf');
    const timePattern = /^\d{1,2}:\d{2}\s*(AM|PM|am|pm)?$/;

    groups.forEach((group) => {
      let name = '';

      const nameEl = group.querySelector('[data-sender-name]')
        || group.querySelector('.HNucUd');
      if (nameEl?.textContent?.trim()) {
        const candidate = nameEl.textContent.trim();
        if (!timePattern.test(candidate)) name = candidate;
      }

      if (!name) {
        let prev = group.previousElementSibling;
        if (prev) {
          const prevText = prev.textContent?.trim();
          if (prevText && prevText.length < 60 && prevText.length > 1 && !timePattern.test(prevText)) {
            name = prevText;
          }
        }
      }

      if (!name && selfName) {
        name = selfName;
      }

      if (name) {
        group.querySelectorAll('[data-message-id]').forEach(msg => {
          groupSenders.set(msg.getAttribute('data-message-id'), name);
        });
      }
    });

    messageElements.forEach((el) => {
      const msgId = el.getAttribute('data-message-id');
      if (!msgId || seenMessages.has(msgId)) return;

      const textEl = el.querySelector('div[jsname="dTKtvb"] > div')
        || el.querySelector('div[jsname="dTKtvb"]')
        || el.querySelector('.jO4O1 .ptNLrf div')
        || el;
      let text = textEl?.textContent?.trim() || '';

      let sender = groupSenders.get(msgId) || '';

      if (!sender) {
        const group = el.closest('.Ss4fHf');
        if (group) {
          const nameArea = group.querySelector('.HNucUd');
          sender = nameArea?.textContent?.trim() || '';
        }
      }

      if (!sender) sender = 'Unknown';
      if (!text || text.length < 1) return;
      if (sender === text) sender = 'Unknown';

      seenMessages.add(msgId);

      // Deduplicate: Meet creates two elements for the same message with different IDs
      const dedupeKey = `${sender}::${text}`;
      const lastSeen = recentTexts.get(dedupeKey);
      const now = Date.now();
      if (lastSeen && now - lastSeen < 2000) return;
      recentTexts.set(dedupeKey, now);

      capturedCount++;

      chrome.runtime.sendMessage({
        type: 'CHAT_MESSAGE',
        sender,
        text,
        timestamp: new Date().toISOString(),
      });
    });
  }

  function observeChat(container) {
    captureMessagesFrom(container);

    chatObserver = new MutationObserver(() => {
      captureMessagesFrom(container);
    });
    chatObserver.observe(container, { childList: true, subtree: true });
  }

  function startCapture() {
    if (isCapturing) return;
    isCapturing = true;
    capturedCount = 0;
    seenMessages.clear();

    const container = findChatContainer();
    if (container) {
      observeChat(container);
    } else {
      bodyWatcher = new MutationObserver(() => {
        const c = findChatContainer();
        if (c) {
          bodyWatcher.disconnect();
          bodyWatcher = null;
          observeChat(c);
        }
      });
      bodyWatcher.observe(document.body, { childList: true, subtree: true });
    }
  }

  function stopCapture() {
    isCapturing = false;
    if (chatObserver) { chatObserver.disconnect(); chatObserver = null; }
    if (bodyWatcher) { bodyWatcher.disconnect(); bodyWatcher = null; }
    capturedCount = 0;
    seenMessages.clear();
    recentTexts.clear();
  }

  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START_OBSERVING') startCapture();
    if (msg.type === 'STOP_OBSERVING') stopCapture();
  });
})();
