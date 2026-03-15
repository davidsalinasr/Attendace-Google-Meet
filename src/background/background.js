import './meetApi.js';

const MESSAGES = {
  GET_STATE: 'GET_STATE',
  START_TRACKING: 'START_TRACKING',
  STOP_TRACKING: 'STOP_TRACKING',
  IN_CALL_DETECTED: 'IN_CALL_DETECTED',
  CALL_LEFT: 'CALL_LEFT',
  DISMISS_REMINDER: 'DISMISS_REMINDER',
  ENGAGEMENT_EVENT: 'ENGAGEMENT_EVENT',
};

const TRACKING_STATE = {
  IDLE: 'idle',
  TRACKING: 'tracking',
  STOPPED: 'stopped',
};

const REMINDER_DELAY_MS = 5 * 60 * 1000;
const STORAGE_KEYS = { SESSIONS: 'sessions', CURRENT_SESSION: 'currentSession' };

// Per-tab state (not persisted across SW restarts for active tracking — we use storage too)
const tabState = {};

function getTab(tabId) {
  if (!tabState[tabId]) {
    tabState[tabId] = {
      trackingState: TRACKING_STATE.IDLE,
      meetingCode: null,
      inCall: false,
      inCallSince: null,
      reminderShown: false,
      reminderDismissed: false,
      reminderTimerId: null,
      session: null,
    };
  }
  return tabState[tabId];
}

function startReminderTimer(tabId) {
  const tab = getTab(tabId);
  if (tab.reminderTimerId) clearTimeout(tab.reminderTimerId);
  tab.reminderTimerId = setTimeout(() => {
    if (tab.trackingState === TRACKING_STATE.IDLE && tab.inCall && !tab.reminderDismissed) {
      tab.reminderShown = true;
      // Badge to draw attention
      chrome.action.setBadgeText({ text: '!', tabId });
      chrome.action.setBadgeBackgroundColor({ color: '#F59E0B', tabId });
    }
  }, REMINDER_DELAY_MS);
}

function createSession(tabId, meetingCode, hostName) {
  const now = new Date().toISOString();
  const session = {
    id: `${meetingCode}-${Date.now()}`,
    meetingCode,
    meetingTitle: null,
    hostName: hostName || null,
    startTrackingTime: now,
    endTrackingTime: null,
    participants: [],
    engagementEvents: [],
  };

  // Always add the host as the first participant
  session.participants.push({
    id: '__host__',
    displayName: hostName || 'You (Host)',
    email: null,
    joinTime: now,
    leaveTime: null,
    durationSeconds: 0,
    joinCount: 1,
    spokeCount: 0,
    reactionCount: 0,
    engagementLabel: 'Passive',
    engagementSummary: '',
    statusOverride: null,
    isHost: true,
  });

  return session;
}

async function saveSession(session, openDashboard = true) {
  session.endTrackingTime = new Date().toISOString();

  // Finalize host participant duration
  const hostEntry = (session.participants || []).find(p => p.isHost);
  if (hostEntry) {
    const start = new Date(session.startTrackingTime);
    const end = new Date(session.endTrackingTime);
    hostEntry.durationSeconds = Math.round((end - start) / 1000);
    hostEntry.leaveTime = session.endTrackingTime;
  }

  const { sessions = [] } = await chrome.storage.local.get(STORAGE_KEYS.SESSIONS);
  const existing = sessions.findIndex(s => s.id === session.id);
  if (existing >= 0) {
    sessions[existing] = session;
  } else {
    sessions.unshift(session);
  }
  await chrome.storage.local.set({
    [STORAGE_KEYS.SESSIONS]: sessions,
    [STORAGE_KEYS.CURRENT_SESSION]: null,
  });

  // Auto-open dashboard after call ends
  if (openDashboard) {
    const dashUrl = chrome.runtime.getURL(
      `src/dashboard/dashboard.html?session=${encodeURIComponent(session.id)}`
    );
    chrome.tabs.create({ url: dashUrl });
  }
}

async function persistCurrentSession(tabId) {
  const tab = getTab(tabId);
  if (tab.session) {
    await chrome.storage.local.set({ [STORAGE_KEYS.CURRENT_SESSION]: tab.session });
  }
}

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  const tabId = sender.tab?.id || msg.tabId;

  if (msg.type === MESSAGES.GET_STATE) {
    // Popup asks for current state — need tabId from active tab
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'no tab' }); return; }
      const id = tabs[0].id;
      const tab = getTab(id);
      sendResponse({
        trackingState: tab.trackingState,
        meetingCode: tab.meetingCode,
        inCall: tab.inCall,
        reminderShown: tab.reminderShown,
        reminderDismissed: tab.reminderDismissed,
      });
    });
    return true; // async
  }

  if (msg.type === MESSAGES.IN_CALL_DETECTED) {
    const tab = getTab(tabId);
    tab.inCall = true;
    tab.meetingCode = msg.meetingCode;
    if (msg.hostName) tab.hostName = msg.hostName;
    if (!tab.inCallSince) tab.inCallSince = Date.now();

    // If we're already tracking, keep the host entry's displayName up-to-date
    if (tab.session && msg.hostName) {
      const hostEntry = tab.session.participants.find(p => p.isHost);
      if (hostEntry && (!hostEntry.displayName || hostEntry.displayName === 'You (Host)' || hostEntry.displayName !== msg.hostName)) {
        const oldName = hostEntry.displayName;
        hostEntry.displayName = msg.hostName;
        // Also rename any engagement events that used the old name
        if (oldName && oldName !== msg.hostName) {
          (tab.session.engagementEvents || []).forEach(e => {
            if (e.participantName === oldName) e.participantName = msg.hostName;
          });
          (tab.session.chatMessages || []).forEach(m => {
            if (m.sender === oldName) m.sender = msg.hostName;
          });
        }
      }
      if (!hostEntry) {
        // Host was never added (name was null at session creation) — add now
        tab.session.participants.unshift({
          id: '__host__',
          displayName: msg.hostName,
          email: null,
          joinTime: tab.session.startTrackingTime,
          leaveTime: null,
          durationSeconds: 0,
          joinCount: 1,
          spokeCount: 0,
          reactionCount: 0,
          engagementLabel: 'Passive',
          engagementSummary: '',
          statusOverride: null,
          isHost: true,
        });
        persistCurrentSession(tabId);
      }
    }

    if (tab.trackingState === TRACKING_STATE.IDLE && !tab.reminderDismissed) {
      startReminderTimer(tabId);
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === MESSAGES.CALL_LEFT) {
    const tab = getTab(tabId);
    tab.inCall = false;
    if (tab.reminderTimerId) clearTimeout(tab.reminderTimerId);
    if (tab.trackingState === TRACKING_STATE.TRACKING && tab.session) {
      tab.trackingState = TRACKING_STATE.STOPPED;
      stopApiPolling(tabId);
      saveSession(tab.session);
      chrome.action.setBadgeText({ text: '', tabId });
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === MESSAGES.START_TRACKING) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'no tab' }); return; }
      const id = tabs[0].id;
      const tab = getTab(id);

      // Extract meeting code from the tab URL as fallback
      if (!tab.meetingCode && tabs[0].url) {
        const urlMatch = tabs[0].url.match(/meet\.google\.com\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
        if (urlMatch) {
          tab.meetingCode = urlMatch[1];
          tab.inCall = true;
        }
      }

      tab.trackingState = TRACKING_STATE.TRACKING;
      tab.reminderShown = false;
      if (tab.reminderTimerId) clearTimeout(tab.reminderTimerId);
      tab.session = createSession(id, tab.meetingCode, tab.hostName);
      persistCurrentSession(id);

      chrome.action.setBadgeText({ text: '●', tabId: id });
      chrome.action.setBadgeBackgroundColor({ color: '#10B981', tabId: id });

      // Start API polling for attendance
      startApiPolling(id);

      // Notify content script to start observing engagement (include hostName for attribution)
      chrome.tabs.sendMessage(id, { type: 'START_OBSERVING', hostName: tab.hostName || null });

      sendResponse({ ok: true, trackingState: tab.trackingState });
    });
    return true;
  }

  if (msg.type === MESSAGES.STOP_TRACKING) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'no tab' }); return; }
      const id = tabs[0].id;
      const tab = getTab(id);
      tab.trackingState = TRACKING_STATE.STOPPED;
      stopApiPolling(id);
      if (tab.session) {
        saveSession(tab.session);
      }
      chrome.action.setBadgeText({ text: '', tabId: id });

      chrome.tabs.sendMessage(id, { type: 'STOP_OBSERVING' });

      sendResponse({ ok: true, trackingState: tab.trackingState });
    });
    return true;
  }

  if (msg.type === MESSAGES.DISMISS_REMINDER) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (!tabs[0]) { sendResponse({ error: 'no tab' }); return; }
      const id = tabs[0].id;
      const tab = getTab(id);
      tab.reminderShown = false;
      tab.reminderDismissed = true;
      chrome.action.setBadgeText({ text: '', tabId: id });
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'UPDATE_MEETING_TITLE') {
    chrome.storage.local.get(STORAGE_KEYS.SESSIONS, ({ sessions = [] }) => {
      const s = sessions.find(s => s.id === msg.sessionId);
      if (s) {
        s.meetingTitle = msg.title;
        chrome.storage.local.set({ [STORAGE_KEYS.SESSIONS]: sessions });
      }
      sendResponse({ ok: true });
    });
    return true;
  }

  if (msg.type === 'CHAT_MESSAGE') {
    const tab = getTab(tabId);
    if (tab.trackingState === TRACKING_STATE.TRACKING && tab.session) {
      if (!tab.session.chatMessages) tab.session.chatMessages = [];
      if (tab.session.chatMessages.length < 500) {
        tab.session.chatMessages.push({
          sender: msg.sender,
          text: msg.text,
          timestamp: msg.timestamp,
        });
        persistCurrentSession(tabId);
      }
    }
    sendResponse({ ok: true });
    return false;
  }

  if (msg.type === MESSAGES.ENGAGEMENT_EVENT) {
    const tab = getTab(tabId);
    if (tab.trackingState === TRACKING_STATE.TRACKING && tab.session) {
      tab.session.engagementEvents.push({
        participantName: msg.participantName,
        eventType: msg.eventType,
        reactionType: msg.reactionType || null,
        timestamp: new Date().toISOString(),
      });

      // Update participant counters so dashboard detail panel matches
      const p = tab.session.participants.find(
        pt => pt.displayName === msg.participantName || (pt.isHost && msg.participantName === tab.hostName)
      );
      if (p) {
        if (msg.eventType === 'unmute') {
          p.spokeCount = (p.spokeCount || 0) + 1;
          if (p.engagementLabel === 'Passive') p.engagementLabel = 'Spoke';
        } else if (msg.eventType === 'reaction') {
          p.reactionCount = (p.reactionCount || 0) + 1;
          if (p.engagementLabel === 'Passive') p.engagementLabel = 'Reacted only';
        }
      }

      persistCurrentSession(tabId);
    }
    sendResponse({ ok: true });
    return false;
  }
});

// --- Meet API polling ---
const POLL_INTERVAL_MS = 30000; // 30 seconds
const pollTimers = {};

async function startApiPolling(tabId) {
  if (pollTimers[tabId]) clearInterval(pollTimers[tabId]);
  await pollParticipants(tabId);
  pollTimers[tabId] = setInterval(() => pollParticipants(tabId), POLL_INTERVAL_MS);
}

function stopApiPolling(tabId) {
  if (pollTimers[tabId]) {
    clearInterval(pollTimers[tabId]);
    delete pollTimers[tabId];
  }
}

async function pollParticipants(tabId) {
  const tab = getTab(tabId);
  if (!tab.session || !tab.meetingCode) return;

  try {
    const token = await self.meetApi.getAuthToken(false);
    if (!token) return;

    // Find active conference
    if (!tab.session.conferenceRecordName) {
      const conf = await self.meetApi.findActiveConference(tab.meetingCode, token);
      if (conf) {
        tab.session.conferenceRecordName = conf.name;
      } else {
        return; // No conference found yet
      }
    }

    // List participants
    const rawParticipants = await self.meetApi.listParticipants(
      tab.session.conferenceRecordName, token
    );

    // List sessions for each participant
    const sessionsByParticipant = {};
    for (const p of rawParticipants) {
      try {
        sessionsByParticipant[p.name] = await self.meetApi.listParticipantSessions(p.name, token);
      } catch {
        sessionsByParticipant[p.name] = [];
      }
    }

    // Normalize API participants
    const apiParticipants = self.meetApi.normalizeParticipants(
      rawParticipants, sessionsByParticipant
    );

    // Preserve the host entry: update duration, merge with API data if host appears
    const hostEntry = tab.session.participants.find(p => p.isHost);
    if (hostEntry) {
      const now = new Date();
      const start = new Date(tab.session.startTrackingTime);
      hostEntry.durationSeconds = Math.round((now - start) / 1000);
      hostEntry.leaveTime = null; // still in call

      // If the API returned the host too, merge their data but keep isHost flag
      const apiHost = apiParticipants.find(p => p.displayName === hostEntry.displayName);
      if (apiHost) {
        hostEntry.joinTime = apiHost.joinTime || hostEntry.joinTime;
        hostEntry.joinCount = apiHost.joinCount || hostEntry.joinCount;
        // Remove the duplicate from API list
        const idx = apiParticipants.indexOf(apiHost);
        if (idx >= 0) apiParticipants.splice(idx, 1);
      }
    }

    // Merge: keep host + add API participants
    tab.session.participants = [
      ...(hostEntry ? [hostEntry] : []),
      ...apiParticipants,
    ];

    // Merge engagement data: preserve spoke/reaction counts from DOM events
    const engagementByName = {};
    (tab.session.engagementEvents || []).forEach((evt) => {
      if (!engagementByName[evt.participantName]) {
        engagementByName[evt.participantName] = { spoke: 0, reactions: 0 };
      }
      if (evt.eventType === 'unmute') engagementByName[evt.participantName].spoke++;
      if (evt.eventType === 'reaction') engagementByName[evt.participantName].reactions++;
    });

    tab.session.participants.forEach((p) => {
      const eng = engagementByName[p.displayName];
      if (eng) {
        p.spokeCount = eng.spoke;
        p.reactionCount = eng.reactions;
        if (eng.spoke > 0) p.engagementLabel = 'Spoke';
        else if (eng.reactions > 0) p.engagementLabel = 'Reacted only';
        else p.engagementLabel = 'Passive';
        const parts = [];
        if (eng.spoke > 0) parts.push(`Spoke ${eng.spoke} time${eng.spoke > 1 ? 's' : ''}`);
        if (eng.reactions > 0) parts.push(`${eng.reactions} reaction${eng.reactions > 1 ? 's' : ''}`);
        p.engagementSummary = parts.join(', ') || 'Passive';
      }
    });

    await persistCurrentSession(tabId);
  } catch (err) {
    console.warn('[Meet Attendance] API poll error:', err.message);
  }
}

// Clean up when tab closes
chrome.tabs.onRemoved.addListener((tabId) => {
  const tab = tabState[tabId];
  if (tab) {
    if (tab.reminderTimerId) clearTimeout(tab.reminderTimerId);
    stopApiPolling(tabId);
    if (tab.trackingState === TRACKING_STATE.TRACKING && tab.session) {
      saveSession(tab.session);
    }
    delete tabState[tabId];
  }
});
