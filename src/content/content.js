(() => {
  let isObserving = false;
  let pollInterval = null;
  let reactionObserver = null;
  let isTracking = false;

  const participantMuteState = {};

  // --- Meeting detection ---
  function getMeetingCode() {
    const match = window.location.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
    return match ? match[1] : null;
  }

  function detectInCall() {
    const selectors = [
      '[data-tooltip="Leave call"]',
      '[aria-label="Leave call"]',
      'button[aria-label="Leave call"]',
      '[data-tooltip="Salir de la llamada"]',
      '[data-tooltip="Abandonar la llamada"]',
      'button[jsname="CQylAd"]',
    ];
    for (const sel of selectors) {
      if (document.querySelector(sel)) return true;
    }
    const hasVideoTiles = document.querySelectorAll('[data-participant-id]').length > 0 ||
                          document.querySelectorAll('[data-requested-participant-id]').length > 0;
    if (hasVideoTiles) return true;
    const hasSelfView = document.querySelector('[data-self-name]') ||
                        document.querySelector('[data-is-local-user="true"]');
    if (hasSelfView) return true;
    return false;
  }

  // --- Get the host's display name from the Meet UI ---
  function deduplicateName(raw) {
    if (!raw) return raw;
    const trimmed = raw.trim();
    // Check if the string is the same name repeated (with or without separator)
    // e.g. "David SalinasDavid Salinas" or "David Salinas David Salinas"
    for (let sep of ['', ' ', '\n']) {
      const parts = sep ? trimmed.split(sep) : [null];
      if (sep) {
        // For space/newline: check if first half equals second half
        const halfIdx = Math.ceil(parts.length / 2);
        const firstHalf = parts.slice(0, halfIdx).join(sep);
        const secondHalf = parts.slice(halfIdx).join(sep);
        if (firstHalf && firstHalf === secondHalf) return firstHalf;
      } else {
        // For no separator: check if string is exactly doubled
        const half = Math.floor(trimmed.length / 2);
        if (half > 1 && trimmed.slice(0, half) === trimmed.slice(half)) return trimmed.slice(0, half);
      }
    }
    return trimmed;
  }

  function getHostName() {
    let winner = null;

    // Strategy 1: data-self-name attribute
    const selfNameEl = document.querySelector('[data-self-name]');
    const s1 = selfNameEl ? (selfNameEl.getAttribute('data-self-name') || selfNameEl.textContent?.trim()) : null;
    if (s1) winner = s1;

    // Strategy 2: local user marker
    if (!winner) {
      const localUser = document.querySelector('[data-is-local-user="true"]');
      winner = localUser?.querySelector('span')?.textContent?.trim() || null;
    }

    // Strategy 3: name overlay on video tile
    if (!winner) {
      const nameTag = document.querySelector('.zWfAib');
      winner = nameTag?.textContent?.trim() || null;
    }

    // Strategy 4: participant list "(You)" badge
    if (!winner) {
      const items = document.querySelectorAll('[role="listitem"]');
      for (const item of items) {
        const youBadge = item.querySelector('[data-is-you="true"]')
          || item.querySelector('[aria-label*="(You)"]')
          || item.querySelector('[aria-label*="(Tú)"]');
        if (youBadge) {
          const nameSpan = item.querySelector('span');
          winner = nameSpan?.textContent?.trim()?.replace(/\s*\(You\)|\(Tú\)\s*/g, '').trim() || null;
          if (winner) break;
        }
      }
    }

    // Strategy 5: self video tile
    if (!winner) {
      const tiles = document.querySelectorAll('[data-participant-id]');
      for (const tile of tiles) {
        if (tile.querySelector('[data-is-local-user="true"]') || tile.querySelector('[data-self-name]')) {
          const nameEl = tile.querySelector('.zWfAib') || tile.querySelector('.XEazBc');
          winner = nameEl?.textContent?.trim() || null;
          if (winner) break;
        }
      }
    }

    // Strategy 6: overlay elements
    if (!winner) {
      const overlays = document.querySelectorAll('.XEazBc, .cS7aqe, .NnTWjc, .gYckH');
      for (const el of overlays) {
        const t = el.textContent?.trim();
        if (t && t.length > 1 && t.length < 50 && !t.includes(':')) {
          winner = t; break;
        }
      }
    }

    if (winner) winner = deduplicateName(winner);
    return winner;
  }

  // ========================================================
  // IMPROVEMENT 1: Inject Start/Stop button next to hang-up
  // ========================================================
  let controlBtnInjected = false;

  function findHangUpButton() {
    const selectors = [
      'button[aria-label="Leave call"]',
      '[data-tooltip="Leave call"]',
      '[data-tooltip="Salir de la llamada"]',
      '[data-tooltip="Abandonar la llamada"]',
      'button[jsname="CQylAd"]',
    ];
    for (const sel of selectors) {
      const el = document.querySelector(sel);
      if (el) {
        const btn = el.closest('button') || el;
        return btn;
      }
    }
    return null;
  }

  function injectControlButton() {
    if (controlBtnInjected) return;
    const hangUp = findHangUpButton();
    if (!hangUp) return;

    // The hang-up button sits inside a small wrapper div.
    // We need to find the flex row that holds all toolbar buttons and insert at that level.
    // Strategy: walk up from the hang-up button until we find a parent whose own parent
    // uses a flex/grid row layout — that parent is the toolbar row.
    let anchor = hangUp;
    let toolbar = null;
    for (let el = hangUp; el && el !== document.body; el = el.parentElement) {
      const style = window.getComputedStyle(el.parentElement || el);
      const isRow = (style.display === 'flex' || style.display === 'inline-flex') &&
                    (style.flexDirection === 'row' || style.flexDirection === '');
      if (isRow && el.parentElement && el.parentElement.children.length > 2) {
        anchor = el;
        toolbar = el.parentElement;
        break;
      }
    }
    if (!toolbar) {
      // Fallback: just use immediate parent
      anchor = hangUp;
      toolbar = hangUp.parentElement;
    }
    if (!toolbar) return;

    const btn = document.createElement('button');
    btn.id = 'mat-control-btn';
    btn.className = 'start';
    btn.innerHTML = '<span class="mat-btn-dot"></span> Start Tracking';

    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (isTracking) {
        chrome.runtime.sendMessage({ type: 'STOP_TRACKING' }, (res) => {
          if (res?.ok) {
            isTracking = false;
            updateControlButton();
            updateIndicator();
          }
        });
      } else {
        chrome.runtime.sendMessage({ type: 'START_TRACKING' }, (res) => {
          if (res?.ok) {
            isTracking = true;
            updateControlButton();
            updateIndicator();
            hideReminder();
          }
        });
      }
    });

    // Insert right after the hang-up button's wrapper in the toolbar row
    if (anchor.nextSibling) {
      toolbar.insertBefore(btn, anchor.nextSibling);
    } else {
      toolbar.appendChild(btn);
    }
    controlBtnInjected = true;
  }

  function updateControlButton() {
    const btn = document.getElementById('mat-control-btn');
    if (!btn) return;
    if (isTracking) {
      btn.className = 'stop';
      btn.innerHTML = '<span class="mat-btn-dot"></span> Stop Tracking';
    } else {
      btn.className = 'start';
      btn.innerHTML = '<span class="mat-btn-dot"></span> Start Tracking';
    }
  }

  // ========================================================
  // IMPROVEMENT 2: Persistent tracking indicator (top-left)
  // ========================================================
  let indicatorInjected = false;

  function injectIndicator() {
    if (indicatorInjected) return;
    const indicator = document.createElement('div');
    indicator.id = 'mat-tracking-indicator';
    indicator.className = 'not-tracking';
    indicator.innerHTML = '<span class="mat-dot"></span><span class="mat-label">Not tracking</span>';
    document.body.appendChild(indicator);
    indicatorInjected = true;
  }

  function updateIndicator() {
    const indicator = document.getElementById('mat-tracking-indicator');
    if (!indicator) return;
    const label = indicator.querySelector('.mat-label');
    if (isTracking) {
      indicator.className = 'tracking';
      if (label) label.textContent = 'Tracking attendance';
    } else {
      indicator.className = 'not-tracking';
      if (label) label.textContent = 'Not tracking';
    }
  }

  // ========================================================
  // 5-min reminder (injected into Meet page, not popup)
  // ========================================================
  let reminderTimeout = null;
  let reminderShown = false;

  function startReminderTimer() {
    if (reminderTimeout) clearTimeout(reminderTimeout);
    reminderTimeout = setTimeout(() => {
      if (!isTracking && !reminderShown) {
        showReminder();
      }
    }, 5 * 60 * 1000);
  }

  function showReminder() {
    if (document.getElementById('mat-reminder-tooltip')) return;
    reminderShown = true;
    const tooltip = document.createElement('div');
    tooltip.id = 'mat-reminder-tooltip';
    tooltip.innerHTML = `
      <button class="mat-reminder-close" aria-label="Dismiss">&times;</button>
      <strong>Reminder:</strong> You've been in this call for 5 minutes.<br>
      Start attendance tracking to record who joined and their engagement.
    `;
    tooltip.querySelector('.mat-reminder-close').addEventListener('click', () => {
      hideReminder();
      chrome.runtime.sendMessage({ type: 'DISMISS_REMINDER' }).catch(() => {});
    });
    document.body.appendChild(tooltip);
  }

  function hideReminder() {
    const el = document.getElementById('mat-reminder-tooltip');
    if (el) el.remove();
  }

  // ========================================================
  // Call state management
  // ========================================================
  let wasInCall = false;
  let notifiedInCall = false;
  let hostNameSent = false;

  function checkCallState() {
    const meetingCode = getMeetingCode();
    const inCall = detectInCall();

    if (inCall && meetingCode) {
      if (!wasInCall) {
        wasInCall = true;
        notifiedInCall = true;
        const hostName = getHostName();
        if (hostName) hostNameSent = true;
        chrome.runtime.sendMessage({
          type: 'IN_CALL_DETECTED',
          meetingCode,
          hostName,
        }).catch(() => {});
        startReminderTimer();
      }

      // Keep trying to send host name if we haven't found it yet
      if (!hostNameSent) {
        const hostName = getHostName();
        if (hostName) {
          hostNameSent = true;
          chrome.runtime.sendMessage({
            type: 'IN_CALL_DETECTED',
            meetingCode,
            hostName,
          }).catch(() => {});
        }
      }

      // Inject UI elements once we're in a call
      injectControlButton();
      injectIndicator();
    } else if (meetingCode && !notifiedInCall) {
      notifiedInCall = true;
      chrome.runtime.sendMessage({
        type: 'IN_CALL_DETECTED',
        meetingCode,
        hostName: getHostName(),
      }).catch(() => {});
    } else if (!inCall && wasInCall) {
      wasInCall = false;
      chrome.runtime.sendMessage({ type: 'CALL_LEFT' }).catch(() => {});
    }
  }

  // Sync tracking state from background on load
  function syncState() {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (chrome.runtime.lastError || !state) return;
      isTracking = state.trackingState === 'tracking';
      updateControlButton();
      updateIndicator();
      if (state.reminderShown && !state.reminderDismissed && !isTracking) {
        showReminder();
      }
    });
  }

  // Fast polling at start, then slower
  let fastPollCount = 0;
  const fastPoll = setInterval(() => {
    checkCallState();
    fastPollCount++;
    if (fastPollCount >= 15) clearInterval(fastPoll);
  }, 1000);
  pollInterval = setInterval(checkCallState, 3000);
  checkCallState();

  // Sync state once the page stabilizes
  setTimeout(syncState, 2000);
  setTimeout(syncState, 5000);

  // --- Message listener ---
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg.type === 'START_OBSERVING') {
      isTracking = true;
      // Store host name globally so chatCapture and reaction observer can use it
      window.__matHostName = msg.hostName || getHostName() || null;
      updateControlButton();
      updateIndicator();
      hideReminder();
      startEngagementObservers();
    } else if (msg.type === 'STOP_OBSERVING') {
      isTracking = false;
      updateControlButton();
      updateIndicator();
      stopEngagementObservers();
    }
  });

  // ========================================================
  // Engagement: mute/unmute detection
  // ========================================================
  function getParticipantMuteInfo() {
    const results = [];
    const participantItems = document.querySelectorAll(
      '[data-participant-id], [data-requested-participant-id]'
    );
    participantItems.forEach((item) => {
      const nameEl = item.querySelector('[data-self-name]') ||
                     item.querySelector('span[class]') ||
                     item.querySelector('span');
      const name = deduplicateName(nameEl?.textContent?.trim());
      if (!name) return;
      const micOff = item.querySelector('[aria-label*="muted" i]') ||
                     item.querySelector('[data-is-muted="true"]');
      results.push({ name, isMuted: !!micOff });
    });
    return results;
  }

  function checkMuteChanges() {
    const participants = getParticipantMuteInfo();

    // For the host: use the toolbar mic button (most reliable source)
    // The mic button has a data-is-muted attribute that reflects the actual mic state
    const hostName = window.__matHostName || getHostName() || 'Unknown';
    const micBtn = document.querySelector('[data-is-muted]');
    if (micBtn) {
      const isMuted = micBtn.getAttribute('data-is-muted') === 'true';
      // Remove any existing entry for the host to avoid duplicates
      const existingIdx = participants.findIndex(p => p.name === hostName);
      if (existingIdx >= 0) participants.splice(existingIdx, 1);
      participants.push({ name: hostName, isMuted });
    }

    participants.forEach(({ name, isMuted }) => {
      const prev = participantMuteState[name];
      if (prev !== undefined && prev === true && isMuted === false) {
        chrome.runtime.sendMessage({
          type: 'ENGAGEMENT_EVENT',
          participantName: name,
          eventType: 'unmute',
        }).catch(() => {});
      }
      participantMuteState[name] = isMuted;
    });
  }

  // ========================================================
  // Engagement: reaction detection
  // ========================================================
  function observeReactions() {
    // Strategy: Poll the DOM for floating reaction bubble images.
    // Meet shows .webp emoji images (42x42) that animate upward when a reaction is sent.
    // The picker bar always has .png (24x24) icons — those are filtered out.
    // Dedup: max 1 count per emoji per 3-second window (a single click spawns many bubbles).
    const lastReactionByEmoji = new Map();
    const REACTION_COOLDOWN_MS = 3000;

    function codePointToEmoji(hex) {
      try { return String.fromCodePoint(parseInt(hex, 16)); } catch { return null; }
    }

    function scanForReactions() {
      const allImgs = document.querySelectorAll('img[src*="notoemoji"], img[src*="noto-emoji"], img[src*="emoji"]');
      const participant = window.__matHostName || getHostName() || 'Unknown';
      const now = Date.now();

      // Separate picker icons from floating bubbles
      // Picker icons: .png URLs with =s48 or =s60 suffix, 24px, at bottom of viewport
      // Floating bubbles: .webp URLs, ~42px, float up from bottom
      let bubbleEmojis = new Map(); // emoji -> count of bubble instances this scan

      for (const img of allImgs) {
        const src = img.src || '';
        const rect = img.getBoundingClientRect();

        // Skip picker bar icons: small and near the bottom
        if (rect.height <= 32 && rect.bottom > window.innerHeight - 120) continue;
        // Skip zero-size images (not rendered)
        if (rect.width === 0 || rect.height === 0) continue;

        let emoji = null;
        const cpMatch = src.match(/\/u([0-9a-f]{4,6})/i);
        if (cpMatch) emoji = codePointToEmoji(cpMatch[1]);
        if (!emoji && img.alt) emoji = img.alt;
        if (!emoji) continue;

        bubbleEmojis.set(emoji, (bubbleEmojis.get(emoji) || 0) + 1);
      }

      // For each emoji that has active bubbles, count it once per cooldown window
      for (const [emoji, count] of bubbleEmojis) {
        const lastTime = lastReactionByEmoji.get(emoji) || 0;
        if (now - lastTime < REACTION_COOLDOWN_MS) continue;

        lastReactionByEmoji.set(emoji, now);

        chrome.runtime.sendMessage({
          type: 'ENGAGEMENT_EVENT',
          participantName: participant,
          eventType: 'reaction',
          reactionType: emoji,
        }).catch(() => {});
      }
    }

    const reactionPollTimer = setInterval(scanForReactions, 1000);
    scanForReactions();

    // MutationObserver for "X reacted with Y" aria-labels (other participants)
    reactionObserver = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (!(node instanceof HTMLElement)) continue;
          const ariaEls = [node, ...(node.querySelectorAll?.('[aria-label*="reacted" i]') || [])];
          for (const el of ariaEls) {
            const lbl = el.getAttribute?.('aria-label') || '';
            const match = lbl.match(/^(.+?)\s+reacted\s+with\s+(.+)$/i);
            if (match) {
              chrome.runtime.sendMessage({
                type: 'ENGAGEMENT_EVENT',
                participantName: match[1].trim(),
                eventType: 'reaction',
                reactionType: match[2].trim(),
              }).catch(() => {});
            }
          }
        }
      }
    });
    reactionObserver.observe(document.body, { childList: true, subtree: true });
    reactionObserver._pollTimer = reactionPollTimer;
  }

  // --- Start / Stop ---
  let muteCheckInterval = null;

  function startEngagementObservers() {
    if (isObserving) return;
    isObserving = true;
    muteCheckInterval = setInterval(checkMuteChanges, 2000);
    checkMuteChanges();
    observeReactions();
  }

  function stopEngagementObservers() {
    isObserving = false;
    if (muteCheckInterval) { clearInterval(muteCheckInterval); muteCheckInterval = null; }
    if (reactionObserver) {
      if (reactionObserver._pollTimer) {
        clearInterval(reactionObserver._pollTimer);
      }
      reactionObserver.disconnect();
      reactionObserver = null;
    }
  }
})();
