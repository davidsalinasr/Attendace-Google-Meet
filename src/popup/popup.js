document.addEventListener('DOMContentLoaded', async () => {
  const screens = {
    notMeet: document.getElementById('not-meet'),
    idle: document.getElementById('meet-idle'),
    tracking: document.getElementById('meet-tracking'),
    stopped: document.getElementById('meet-stopped'),
  };

  const els = {
    meetingCode: document.getElementById('meeting-code'),
    meetingCodeTracking: document.getElementById('meeting-code-tracking'),
    meetingCodeStopped: document.getElementById('meeting-code-stopped'),
    btnStart: document.getElementById('btn-start'),
    btnStop: document.getElementById('btn-stop'),
    btnRestart: document.getElementById('btn-restart'),
    btnViewSummary: document.getElementById('btn-view-summary'),
    btnOpenDashboard: document.getElementById('btn-open-dashboard'),
    btnDashboardIdle: document.getElementById('btn-dashboard-idle'),
    reminderTooltip: document.getElementById('reminder-tooltip'),
    reminderClose: document.getElementById('reminder-close'),
    toast: document.getElementById('toast'),
    toastClose: document.getElementById('toast-close'),
  };

  function hideAll() {
    Object.values(screens).forEach(s => s.classList.add('hidden'));
  }

  function show(screen) {
    hideAll();
    screen.classList.remove('hidden');
  }

  function setMeetingCodeDisplay(code) {
    const display = code || '---';
    els.meetingCode.textContent = display;
    els.meetingCodeTracking.textContent = display;
    els.meetingCodeStopped.textContent = display;
  }

  function showToast() {
    els.toast.classList.remove('hidden');
    setTimeout(() => {
      els.toast.classList.add('hidden');
    }, 4000);
  }

  // Extract meeting code from a Meet URL
  function extractMeetingCode(url) {
    if (!url) return null;
    try {
      const u = new URL(url);
      if (!u.hostname.includes('meet.google.com')) return null;
      // Match patterns: /abc-defg-hij or /abc-defg-hij?...
      const match = u.pathname.match(/^\/([a-z]{3}-[a-z]{4}-[a-z]{3})/);
      return match ? match[1] : null;
    } catch {
      return null;
    }
  }

  // Check if current tab is a Meet call (by URL)
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  const meetingCode = extractMeetingCode(tab?.url);
  const isMeet = !!meetingCode;

  if (!isMeet) {
    show(screens.notMeet);
    return;
  }

  // We're on a Meet page — show the idle screen immediately as default,
  // then refine based on background state
  setMeetingCodeDisplay(meetingCode);
  show(screens.idle);

  // Ask background for tracking state
  try {
    chrome.runtime.sendMessage({ type: 'GET_STATE' }, (state) => {
      if (chrome.runtime.lastError) {
        // Background may not have state yet — stay on idle, that's fine
        console.log('[popup] Background not ready:', chrome.runtime.lastError.message);
        return;
      }
      if (!state || state.error) return;

      // Update meeting code display if background has it
      setMeetingCodeDisplay(state.meetingCode || meetingCode);

      if (state.trackingState === 'tracking') {
        show(screens.tracking);
      } else if (state.trackingState === 'stopped') {
        show(screens.stopped);
      } else {
        show(screens.idle);
        if (state.reminderShown && !state.reminderDismissed) {
          els.reminderTooltip.classList.remove('hidden');
        }
      }
    });
  } catch (e) {
    // Stay on idle screen
  }

  // --- Button handlers ---

  els.btnStart.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_TRACKING' }, (res) => {
      if (chrome.runtime.lastError) {
        console.error('[popup] Start error:', chrome.runtime.lastError.message);
        return;
      }
      if (res?.ok) {
        show(screens.tracking);
        showToast();
      }
    });
  });

  els.btnStop.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'STOP_TRACKING' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok) {
        show(screens.stopped);
      }
    });
  });

  els.btnRestart.addEventListener('click', () => {
    chrome.runtime.sendMessage({ type: 'START_TRACKING' }, (res) => {
      if (chrome.runtime.lastError) return;
      if (res?.ok) {
        show(screens.tracking);
        showToast();
      }
    });
  });

  els.reminderClose.addEventListener('click', () => {
    els.reminderTooltip.classList.add('hidden');
    chrome.runtime.sendMessage({ type: 'DISMISS_REMINDER' });
  });

  els.toastClose.addEventListener('click', () => {
    els.toast.classList.add('hidden');
  });

  // Dashboard buttons
  function openDashboard() {
    chrome.tabs.create({ url: chrome.runtime.getURL('src/dashboard/dashboard.html') });
  }
  els.btnOpenDashboard.addEventListener('click', openDashboard);
  els.btnDashboardIdle.addEventListener('click', openDashboard);
  els.btnViewSummary.addEventListener('click', openDashboard);
});
