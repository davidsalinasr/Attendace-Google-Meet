document.addEventListener('DOMContentLoaded', async () => {
  const dashboard = document.querySelector('.dashboard');
  const sessionsListSection = document.getElementById('sessions-list');
  const sessionDetailSection = document.getElementById('session-detail');
  const container = document.getElementById('sessions-container');
  const toolbar = document.getElementById('sessions-toolbar');

  const { sessions = [] } = await chrome.storage.local.get('sessions');

  // Filter/sort state — must be declared before any call to renderSessionDetail
  let currentFilter = 'all';
  let currentSort = 'joinTime';

  // Session list filter state
  let listArchiveView = 'active'; // 'active' | 'archived'
  let listDateFilter = 'all';     // 'today' | 'week' | 'month' | 'all' | 'custom'
  let listDateFrom = '';
  let listDateTo = '';
  let listSearch = '';
  let listSort = 'newest';

  // Check URL params for direct session link
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session');

  if (sessionId) {
    const session = sessions.find(s => s.id === sessionId);
    if (session) {
      renderSessionDetail(session);
      return;
    }
  }

  if (sessions.length > 0 && !sessionId) {
    renderSessionsList();
  } else if (sessions.length === 0) {
    container.innerHTML = '<p class="empty-state">No sessions recorded yet. Start tracking in a Google Meet call.</p>';
  }

  // --- Build toolbar (once) ---
  function buildToolbar() {
    toolbar.classList.remove('hidden');
    toolbar.innerHTML = `
      <div class="sessions-toolbar-row">
        <div class="archive-toggle">
          <button class="archive-toggle-btn active" data-view="active">Active</button>
          <button class="archive-toggle-btn" data-view="archived">Archived</button>
        </div>
        <input type="text" class="sessions-search" id="sessions-search" placeholder="Search sessions or participants...">
        <select class="sessions-sort" id="sessions-sort">
          <option value="newest">Newest first</option>
          <option value="oldest">Oldest first</option>
          <option value="participants">Most participants</option>
          <option value="duration">Longest duration</option>
          <option value="name">Name (A–Z)</option>
        </select>
      </div>
      <div class="sessions-toolbar-row">
        <div class="date-filter-group">
          <button class="date-filter-btn active" data-date="all">All Time</button>
          <button class="date-filter-btn" data-date="today">Today</button>
          <button class="date-filter-btn" data-date="week">This Week</button>
          <button class="date-filter-btn" data-date="month">This Month</button>
          <button class="date-filter-btn" data-date="custom">Custom</button>
        </div>
        <div class="date-range-inputs" id="date-range-inputs">
          <input type="date" class="date-range-input" id="date-from">
          <span class="date-range-sep">to</span>
          <input type="date" class="date-range-input" id="date-to">
        </div>
      </div>
      <div class="sessions-count" id="sessions-count"></div>
    `;

    // Wire archive toggle
    toolbar.querySelectorAll('.archive-toggle-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.archive-toggle-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        listArchiveView = btn.dataset.view;
        renderSessionCards();
      });
    });

    // Wire search
    toolbar.querySelector('#sessions-search').addEventListener('input', (e) => {
      listSearch = e.target.value.trim().toLowerCase();
      renderSessionCards();
    });

    // Wire sort
    toolbar.querySelector('#sessions-sort').addEventListener('change', (e) => {
      listSort = e.target.value;
      renderSessionCards();
    });

    // Wire date filters
    toolbar.querySelectorAll('.date-filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        toolbar.querySelectorAll('.date-filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        listDateFilter = btn.dataset.date;
        const rangeEl = document.getElementById('date-range-inputs');
        if (listDateFilter === 'custom') {
          rangeEl.classList.add('visible');
        } else {
          rangeEl.classList.remove('visible');
        }
        renderSessionCards();
      });
    });

    // Wire custom date inputs
    document.getElementById('date-from')?.addEventListener('change', (e) => {
      listDateFrom = e.target.value;
      if (listDateFilter === 'custom') renderSessionCards();
    });
    document.getElementById('date-to')?.addEventListener('change', (e) => {
      listDateTo = e.target.value;
      if (listDateFilter === 'custom') renderSessionCards();
    });
  }

  // --- Filter pipeline ---
  function getFilteredSessions() {
    let filtered = [...sessions];

    // 1. Archive filter
    if (listArchiveView === 'active') {
      filtered = filtered.filter(s => !s.archived);
    } else {
      filtered = filtered.filter(s => !!s.archived);
    }

    // 2. Date filter
    const now = new Date();
    if (listDateFilter === 'today') {
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
      filtered = filtered.filter(s => new Date(s.startTrackingTime) >= start);
    } else if (listDateFilter === 'week') {
      const dayOfWeek = now.getDay();
      const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - dayOfWeek);
      filtered = filtered.filter(s => new Date(s.startTrackingTime) >= start);
    } else if (listDateFilter === 'month') {
      const start = new Date(now.getFullYear(), now.getMonth(), 1);
      filtered = filtered.filter(s => new Date(s.startTrackingTime) >= start);
    } else if (listDateFilter === 'custom') {
      if (listDateFrom) {
        const from = new Date(listDateFrom + 'T00:00:00');
        filtered = filtered.filter(s => new Date(s.startTrackingTime) >= from);
      }
      if (listDateTo) {
        const to = new Date(listDateTo + 'T23:59:59');
        filtered = filtered.filter(s => new Date(s.startTrackingTime) <= to);
      }
    }

    // 3. Search filter
    if (listSearch) {
      filtered = filtered.filter(s => {
        const title = (s.meetingTitle || '').toLowerCase();
        const code = (s.meetingCode || '').toLowerCase();
        const names = (s.participants || []).map(p => (p.displayName || '').toLowerCase()).join(' ');
        return title.includes(listSearch) || code.includes(listSearch) || names.includes(listSearch);
      });
    }

    // 4. Sort
    filtered.sort((a, b) => {
      switch (listSort) {
        case 'oldest':
          return new Date(a.startTrackingTime) - new Date(b.startTrackingTime);
        case 'participants':
          return (b.participants?.length || 0) - (a.participants?.length || 0);
        case 'duration': {
          const durA = a.endTrackingTime ? new Date(a.endTrackingTime) - new Date(a.startTrackingTime) : 0;
          const durB = b.endTrackingTime ? new Date(b.endTrackingTime) - new Date(b.startTrackingTime) : 0;
          return durB - durA;
        }
        case 'name':
          return (a.meetingTitle || a.meetingCode || '').localeCompare(b.meetingTitle || b.meetingCode || '');
        case 'newest':
        default:
          return new Date(b.startTrackingTime) - new Date(a.startTrackingTime);
      }
    });

    return filtered;
  }

  // --- Toggle archive on a session ---
  async function toggleArchive(sessionId, archive) {
    const s = sessions.find(s => s.id === sessionId);
    if (s) {
      s.archived = archive;
      await chrome.storage.local.set({ sessions });
      renderSessionCards();
    }
  }

  // --- Render the session cards (after filter) ---
  function renderSessionCards() {
    container.innerHTML = '';
    const filtered = getFilteredSessions();

    const countEl = document.getElementById('sessions-count');
    if (countEl) {
      const totalInView = listArchiveView === 'active'
        ? sessions.filter(s => !s.archived).length
        : sessions.filter(s => !!s.archived).length;
      if (filtered.length === totalInView) {
        countEl.textContent = `${filtered.length} session${filtered.length !== 1 ? 's' : ''}`;
      } else {
        countEl.textContent = `Showing ${filtered.length} of ${totalInView} session${totalInView !== 1 ? 's' : ''}`;
      }
    }

    if (filtered.length === 0) {
      const msg = listArchiveView === 'archived'
        ? 'No archived sessions.'
        : listSearch || listDateFilter !== 'all'
          ? 'No sessions match your filters.'
          : 'No sessions recorded yet. Start tracking in a Google Meet call.';
      container.innerHTML = `<p class="empty-state">${msg}</p>`;
      return;
    }

    filtered.forEach((session) => {
      const date = new Date(session.startTrackingTime);
      const dateStr = date.toLocaleDateString('en-US', {
        weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
      });
      const timeStr = date.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      const count = session.participants?.length || 0;
      const isArchived = !!session.archived;

      const card = document.createElement('div');
      card.className = 'session-card';
      card.innerHTML = `
        <div class="session-card-left">
          <div class="session-card-title-row">
            <span class="session-card-title">${escapeHtml(session.meetingTitle || session.meetingCode || 'Meeting')}</span>
            <button class="session-card-edit-btn" title="Rename session">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
          </div>
          <span class="session-card-meta">${dateStr} at ${timeStr}</span>
        </div>
        <div class="session-card-right">
          <span class="session-card-participants">${count} participant${count !== 1 ? 's' : ''}</span>
          <button class="archive-btn ${isArchived ? 'unarchive' : ''}" title="${isArchived ? 'Unarchive' : 'Archive'}" data-session-id="${session.id}" data-archived="${isArchived}">
            ${isArchived
              ? '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 14 4 9 9 4"/><path d="M20 20v-7a4 4 0 0 0-4-4H4"/></svg>'
              : '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="5" rx="1"/><path d="m2 8 0 10a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V8"/><path d="M10 12h4"/></svg>'
            }
          </button>
          <span class="session-card-arrow">›</span>
        </div>
      `;

      // Inline rename on pencil click
      card.querySelector('.session-card-edit-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const titleEl = card.querySelector('.session-card-title');
        const titleRow = card.querySelector('.session-card-title-row');
        const current = session.meetingTitle || session.meetingCode || 'Meeting';
        const input = document.createElement('input');
        input.type = 'text';
        input.value = current;
        input.className = 'session-card-edit-input';

        let saved = false;
        const save = () => {
          if (saved) return;
          saved = true;
          const newTitle = input.value.trim();
          if (newTitle && newTitle !== current) {
            session.meetingTitle = newTitle;
            chrome.runtime.sendMessage({
              type: 'UPDATE_MEETING_TITLE',
              sessionId: session.id,
              title: newTitle,
            });
          }
          titleEl.textContent = session.meetingTitle || session.meetingCode || 'Meeting';
          titleEl.style.display = '';
          titleRow.querySelector('.session-card-edit-btn').style.display = '';
          if (input.parentElement) input.remove();
        };

        input.addEventListener('blur', save);
        input.addEventListener('keydown', (ev) => {
          if (ev.key === 'Enter') { ev.preventDefault(); save(); }
          if (ev.key === 'Escape') { saved = true; titleEl.style.display = ''; titleRow.querySelector('.session-card-edit-btn').style.display = ''; if (input.parentElement) input.remove(); }
        });

        titleEl.style.display = 'none';
        titleRow.querySelector('.session-card-edit-btn').style.display = 'none';
        titleRow.insertBefore(input, titleEl);
        input.focus();
        input.select();
      });

      // Archive button click
      card.querySelector('.archive-btn').addEventListener('click', (e) => {
        e.stopPropagation();
        const sid = e.currentTarget.dataset.sessionId;
        const wasArchived = e.currentTarget.dataset.archived === 'true';
        toggleArchive(sid, !wasArchived);
      });

      card.addEventListener('click', () => renderSessionDetail(session));
      container.appendChild(card);
    });
  }

  // --- Render sessions list (entry point) ---
  function renderSessionsList() {
    sessionsListSection.classList.remove('hidden');
    sessionDetailSection.classList.add('hidden');
    buildToolbar();
    renderSessionCards();
  }

  // --- Render session detail ---
  function renderSessionDetail(session) {
    sessionsListSection.classList.add('hidden');
    sessionDetailSection.classList.remove('hidden');

    const start = new Date(session.startTrackingTime);
    const end = session.endTrackingTime ? new Date(session.endTrackingTime) : new Date();
    const durationMin = Math.round((end - start) / 60000);
    const participants = session.participants || [];
    const events = session.engagementEvents || [];

    const totalAttended = participants.filter(p => getStatus(p, session) === 'Attended' || getStatus(p, session) === 'Left early').length;
    const reactionEvents = events.filter(e => e.eventType === 'reaction');
    const totalReactions = reactionEvents.length;
    const totalSpoke = events.filter(e => e.eventType === 'unmute').length;
    const chatMessages = session.chatMessages || [];

    // Build emoji breakdown: { "👍": 3, "❤️": 2, ... }
    const emojiCounts = {};
    reactionEvents.forEach(e => {
      const emoji = e.reactionType || '👍';
      emojiCounts[emoji] = (emojiCounts[emoji] || 0) + 1;
    });
    const emojiBreakdownHtml = totalReactions > 0
      ? Object.entries(emojiCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([emoji, count]) => {
            const pct = Math.round((count / totalReactions) * 100);
            return `<span class="emoji-stat">${emoji} <span class="emoji-pct">${pct}%</span></span>`;
          }).join('')
      : '<span class="emoji-none">No reactions yet</span>';

    const dateStr = start.toLocaleDateString('en-US', {
      weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
    });
    const timeStr = start.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });

    sessionDetailSection.innerHTML = `
      <a class="back-link" id="back-to-list">← All Sessions</a>

      <div class="dash-header">
        <div class="dash-header-left">
          <div class="title-row">
            <h1 id="session-title">${escapeHtml(session.meetingTitle || session.meetingCode || 'Meeting')}</h1>
            <button class="edit-title-btn" id="btn-edit-title" title="Edit meeting name">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
            </button>
          </div>
          <p class="dash-subtitle">${dateStr} at ${timeStr}</p>
        </div>
        <div class="dash-header-right">
          <button class="btn btn-primary" id="btn-export-csv">Export CSV</button>
        </div>
      </div>

      <!-- Metrics -->
      <div class="metrics-row">
        <div class="metric-card">
          <div class="metric-value">${totalAttended}</div>
          <div class="metric-label">Attended</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${participants.length}</div>
          <div class="metric-label">Total Participants</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${durationMin}m</div>
          <div class="metric-label">Call Duration</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${totalSpoke}</div>
          <div class="metric-label">Spoke</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${totalReactions}</div>
          <div class="metric-label">Reactions</div>
        </div>
        <div class="metric-card">
          <div class="metric-value">${chatMessages.length}</div>
          <div class="metric-label">Chat Messages</div>
        </div>
      </div>

      <!-- Reaction breakdown -->
      <div class="reaction-breakdown">
        <span class="reaction-breakdown-label">Reactions:</span>
        ${emojiBreakdownHtml}
      </div>

      <!-- Controls -->
      <div class="controls-row">
        <div class="filter-group">
          <button class="filter-btn active" data-filter="all">All</button>
          <button class="filter-btn" data-filter="attended">Attended</button>
          <button class="filter-btn" data-filter="left-early">Left early</button>
          <button class="filter-btn" data-filter="no-show">No show</button>
        </div>
        <select class="sort-select" id="sort-select">
          <option value="joinTime">Sort by Join Time</option>
          <option value="name">Sort by Name</option>
          <option value="engagement">Sort by Engagement</option>
          <option value="duration">Sort by Duration</option>
        </select>
      </div>

      <!-- Table -->
      <table class="participants-table">
        <thead>
          <tr>
            <th>Participant</th>
            <th>Status</th>
            <th>Join Time</th>
            <th>Leave Time</th>
            <th>Duration</th>
            <th>Joins</th>
            <th>Engagement</th>
          </tr>
        </thead>
        <tbody id="participants-tbody"></tbody>
      </table>

      <!-- Insights section (Phase 2: chat, questions, topics) -->
      <div id="insights-section" class="section ${(session.chatMessages && session.chatMessages.length > 0) ? '' : 'hidden'}" style="margin-top: 24px;">
        <div style="display:flex; align-items:center; justify-content:space-between; margin-bottom:12px;">
          <h2 style="margin:0;">Insights</h2>
          <button class="btn btn-secondary" id="btn-export-chat" style="font-size:12px; padding:6px 12px;">Export Chat</button>
        </div>

        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px;">
          <!-- Questions -->
          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px;">
            <h3 style="font-size:13px; font-weight:600; color:#374151; margin-bottom:8px;">Questions Asked</h3>
            <div id="questions-list" style="font-size:12px; color:#4b5563;"></div>
          </div>

          <!-- Top keywords -->
          <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px;">
            <h3 style="font-size:13px; font-weight:600; color:#374151; margin-bottom:8px;">Most Chatted Topics</h3>
            <div id="keywords-list" style="font-size:12px; color:#4b5563;"></div>
          </div>
        </div>

        <!-- Most active -->
        <div style="background:#fff; border:1px solid #e5e7eb; border-radius:10px; padding:16px; margin-top:12px;">
          <h3 style="font-size:13px; font-weight:600; color:#374151; margin-bottom:8px;">Most Active Participants</h3>
          <div id="most-active-list" style="font-size:12px; color:#4b5563;"></div>
        </div>
      </div>

      <!-- Detail panel -->
      <div class="detail-overlay" id="detail-panel">
        <button class="detail-close" id="detail-close">&times;</button>
        <div id="detail-content"></div>
      </div>
    `;

    // Wire back link
    document.getElementById('back-to-list').addEventListener('click', () => {
      renderSessionsList();
    });

    // Wire export
    document.getElementById('btn-export-csv').addEventListener('click', () => {
      exportSessionCSV(session);
    });

    // Wire edit title
    document.getElementById('btn-edit-title').addEventListener('click', () => {
      const titleEl = document.getElementById('session-title');
      const current = session.meetingTitle || session.meetingCode || 'Meeting';
      const input = document.createElement('input');
      input.type = 'text';
      input.value = current;
      input.className = 'edit-title-input';
      input.setAttribute('autofocus', 'true');

      let saved = false;
      const save = () => {
        if (saved) return;
        saved = true;
        const newTitle = input.value.trim();
        if (newTitle && newTitle !== current) {
          session.meetingTitle = newTitle;
          chrome.runtime.sendMessage({
            type: 'UPDATE_MEETING_TITLE',
            sessionId: session.id,
            title: newTitle,
          });
        }
        titleEl.textContent = session.meetingTitle || session.meetingCode || 'Meeting';
        titleEl.style.display = '';
        if (input.parentElement) input.remove();
      };

      input.addEventListener('blur', save);
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') { e.preventDefault(); save(); }
        if (e.key === 'Escape') { saved = true; titleEl.style.display = ''; if (input.parentElement) input.remove(); }
      });

      titleEl.style.display = 'none';
      titleEl.parentElement.insertBefore(input, titleEl);
      input.focus();
      input.select();
    });

    // Wire filters
    document.querySelectorAll('.filter-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        currentFilter = btn.dataset.filter;
        renderParticipantsTable(session);
      });
    });

    // Wire sort
    document.getElementById('sort-select').addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderParticipantsTable(session);
    });

    // Wire detail close
    document.getElementById('detail-close').addEventListener('click', closeDetail);

    // Render insights if chat data exists
    if (session.chatMessages && session.chatMessages.length > 0 && window.Insights) {
      renderInsights(session);
    }

    // Wire chat export
    document.getElementById('btn-export-chat')?.addEventListener('click', () => {
      exportChatLog(session);
    });

    renderParticipantsTable(session);
  }

  function renderInsights(session) {
    const chat = session.chatMessages || [];
    const { extractQuestions, extractTopKeywords, computeMostActive } = window.Insights;

    // Questions
    const questions = extractQuestions(chat);
    const questionsEl = document.getElementById('questions-list');
    if (questionsEl) {
      if (questions.length === 0) {
        questionsEl.innerHTML = '<p style="color:#9ca3af">No questions detected.</p>';
      } else {
        questionsEl.innerHTML = questions.slice(0, 15).map(q =>
          `<div style="padding:4px 0; border-bottom:1px solid #f3f4f6;">
            <strong>${escapeHtml(q.sender)}</strong>: ${escapeHtml(q.text)}
            <span style="color:#9ca3af; font-size:11px; margin-left:4px;">${new Date(q.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' })}</span>
          </div>`
        ).join('');
      }
    }

    // Top keywords
    const keywords = extractTopKeywords(chat);
    const keywordsEl = document.getElementById('keywords-list');
    if (keywordsEl) {
      if (keywords.length === 0) {
        keywordsEl.innerHTML = '<p style="color:#9ca3af">Not enough chat data.</p>';
      } else {
        keywordsEl.innerHTML = '<div style="display:flex; flex-wrap:wrap; gap:4px;">' +
          keywords.map(k =>
            `<span style="display:inline-block; background:#f3f4f6; padding:2px 8px; border-radius:9999px; font-size:11px; font-weight:500;">${escapeHtml(k.word)} <span style="color:#9ca3af">${k.count}</span></span>`
          ).join('') +
          '</div>';
      }
    }

    // Most active
    const active = computeMostActive(chat, session.participants);
    const activeEl = document.getElementById('most-active-list');
    if (activeEl) {
      if (active.length === 0) {
        activeEl.innerHTML = '<p style="color:#9ca3af">No activity data.</p>';
      } else {
        activeEl.innerHTML = active.slice(0, 10).map((a, i) =>
          `<div style="display:flex; align-items:center; gap:8px; padding:6px 0; ${i < active.length - 1 ? 'border-bottom:1px solid #f3f4f6;' : ''}">
            <span style="font-weight:600; min-width:20px; color:#9ca3af;">${i + 1}.</span>
            <span style="flex:1; font-weight:500;">${escapeHtml(a.name)}</span>
            <span style="color:#6b7280; font-size:11px;">${a.chatCount} chats, ${a.spokeCount} spoke, ${a.reactionCount} reactions</span>
          </div>`
        ).join('');
      }
    }
  }

  function renderParticipantsTable(session) {
    const tbody = document.getElementById('participants-tbody');
    if (!tbody) return;

    let participants = [...(session.participants || [])];

    // Compute status for each
    participants = participants.map(p => ({
      ...p,
      _status: p.statusOverride || getStatus(p, session),
    }));

    // Filter
    if (currentFilter !== 'all') {
      const filterMap = {
        'attended': 'Attended',
        'left-early': 'Left early',
        'no-show': 'No show',
      };
      participants = participants.filter(p => p._status === filterMap[currentFilter]);
    }

    // Sort
    participants.sort((a, b) => {
      switch (currentSort) {
        case 'name':
          return (a.displayName || '').localeCompare(b.displayName || '');
        case 'engagement':
          return (b.spokeCount + b.reactionCount) - (a.spokeCount + a.reactionCount);
        case 'duration':
          return (b.durationSeconds || 0) - (a.durationSeconds || 0);
        case 'joinTime':
        default:
          return new Date(a.joinTime || 0) - new Date(b.joinTime || 0);
      }
    });

    tbody.innerHTML = '';

    if (participants.length === 0) {
      tbody.innerHTML = '<tr><td colspan="7" class="empty-state">No participants match the filter.</td></tr>';
      return;
    }

    participants.forEach(p => {
      const status = p._status;
      const statusClass = status === 'Attended' ? 'status-attended'
        : status === 'Left early' ? 'status-left-early' : 'status-no-show';
      const engClass = p.engagementLabel === 'Spoke' ? 'eng-spoke'
        : p.engagementLabel === 'Reacted only' ? 'eng-reacted' : 'eng-passive';

      const initials = getInitials(p.displayName);
      const joinTimeStr = p.joinTime ? new Date(p.joinTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
      const leaveTimeStr = p.leaveTime ? new Date(p.leaveTime).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) : '—';
      const durationStr = formatDuration(p.durationSeconds || 0);

      const tr = document.createElement('tr');
      tr.innerHTML = `
        <td><div class="name-cell"><span class="avatar">${initials}</span> ${escapeHtml(p.displayName)}${p.isHost ? ' <span class="role-badge role-host">Host</span>' : ''}</div></td>
        <td><span class="status-pill ${statusClass}">${status}</span></td>
        <td>${joinTimeStr}</td>
        <td>${leaveTimeStr}</td>
        <td>${durationStr}</td>
        <td>${p.joinCount || 1}</td>
        <td><span class="engagement-pill ${engClass}">${escapeHtml(p.engagementSummary || p.engagementLabel || 'Passive')}</span></td>
      `;
      tr.addEventListener('click', () => openDetail(p, session));
      tbody.appendChild(tr);
    });
  }

  // --- Detail panel ---
  function openDetail(participant, session) {
    const panel = document.getElementById('detail-panel');
    const content = document.getElementById('detail-content');

    const status = participant.statusOverride || getStatus(participant, session);
    const events = (session.engagementEvents || [])
      .filter(e => e.participantName === participant.displayName)
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

    // Per-person reaction emoji breakdown
    const personReactions = events.filter(e => e.eventType === 'reaction');
    const personEmojiCounts = {};
    personReactions.forEach(e => {
      const emoji = e.reactionType || '👍';
      personEmojiCounts[emoji] = (personEmojiCounts[emoji] || 0) + 1;
    });
    const personEmojiHtml = personReactions.length > 0
      ? Object.entries(personEmojiCounts)
          .sort((a, b) => b[1] - a[1])
          .map(([emoji, count]) => `<span class="emoji-stat">${emoji}<span class="emoji-count">×${count}</span></span>`)
          .join('')
      : '<span class="emoji-none">None</span>';

    // Per-person chat messages
    const personChats = (session.chatMessages || [])
      .filter(m => m.sender === participant.displayName);
    const chatListHtml = personChats.length > 0
      ? personChats.map(m => {
          const t = new Date(m.timestamp).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
          return `<div class="chat-msg-item"><span class="chat-msg-time">${t}</span> <span class="chat-msg-text">${escapeHtml(m.text)}</span></div>`;
        }).join('')
      : '<p class="empty-state" style="padding:4px 0;font-size:12px">No messages from this participant.</p>';

    const timeline = buildTimeline(participant, events);

    content.innerHTML = `
      <div class="detail-name">${escapeHtml(participant.displayName)}${participant.isHost ? ' <span class="role-badge role-host">Host</span>' : ''}</div>
      <div class="detail-email">${escapeHtml(participant.email || '')}</div>

      <div class="detail-stats">
        <div class="detail-stat">
          <div class="detail-stat-value">${formatDuration(participant.durationSeconds || 0)}</div>
          <div class="detail-stat-label">Duration</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">${participant.joinCount || 1}</div>
          <div class="detail-stat-label">Times Joined</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">${participant.spokeCount || 0}</div>
          <div class="detail-stat-label">Times Spoke</div>
        </div>
        <div class="detail-stat">
          <div class="detail-stat-value">${participant.reactionCount || 0}</div>
          <div class="detail-stat-label">Reactions</div>
        </div>
      </div>

      <div class="detail-section-title">Reactions</div>
      <div class="detail-reactions">${personEmojiHtml}</div>

      <div class="detail-section-title">Chat Messages <span class="detail-count">(${personChats.length})</span></div>
      <div class="detail-chat-list">${chatListHtml}</div>

      <div class="detail-section-title">Status</div>
      <div class="status-actions">
        <button class="status-action-btn ${status === 'Attended' ? 'active' : ''}" data-status="Attended">Attended</button>
        <button class="status-action-btn ${status === 'Left early' ? 'active' : ''}" data-status="Left early">Left early</button>
        <button class="status-action-btn ${status === 'No show' ? 'active' : ''}" data-status="No show">No show</button>
      </div>

      <div class="detail-section-title">Activity Timeline</div>
      <div class="timeline">${timeline}</div>
    `;

    // Status override buttons
    content.querySelectorAll('.status-action-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const newStatus = btn.dataset.status;
        participant.statusOverride = newStatus;
        // Persist
        chrome.storage.local.get('sessions', ({ sessions: stored = [] }) => {
          const s = stored.find(s => s.id === session.id);
          if (s) {
            const p = s.participants.find(pp => pp.id === participant.id);
            if (p) p.statusOverride = newStatus;
            chrome.storage.local.set({ sessions: stored });
          }
        });
        content.querySelectorAll('.status-action-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        renderParticipantsTable(session);
      });
    });

    panel.classList.add('open');
  }

  function closeDetail() {
    document.getElementById('detail-panel')?.classList.remove('open');
  }

  // --- Helpers ---
  function getStatus(participant, session) {
    if (participant.statusOverride) return participant.statusOverride;
    if (!participant.joinTime) return 'No show';
    if (session.endTrackingTime && participant.leaveTime) {
      const leave = new Date(participant.leaveTime);
      const end = new Date(session.endTrackingTime);
      const diffMs = end - leave;
      if (diffMs > 60000) return 'Left early'; // Left > 1 min before session ended
    }
    return 'Attended';
  }

  function getInitials(name) {
    if (!name) return '?';
    const parts = name.trim().split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    return parts[0][0]?.toUpperCase() || '?';
  }

  function formatDuration(seconds) {
    if (!seconds || seconds <= 0) return '0m';
    const h = Math.floor(seconds / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m`;
  }

  function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
  }

  function buildTimeline(participant, events) {
    const items = [];

    if (participant.joinTime) {
      items.push({
        time: new Date(participant.joinTime),
        dot: 'dot-join',
        text: 'Joined the call',
      });
    }

    events.forEach(e => {
      items.push({
        time: new Date(e.timestamp),
        dot: e.eventType === 'unmute' ? 'dot-unmute' : 'dot-reaction',
        text: e.eventType === 'unmute'
          ? 'Unmuted (spoke)'
          : `Reacted with ${e.reactionType || 'emoji'}`,
      });
    });

    if (participant.leaveTime) {
      items.push({
        time: new Date(participant.leaveTime),
        dot: 'dot-leave',
        text: 'Left the call',
      });
    }

    items.sort((a, b) => a.time - b.time);

    if (items.length === 0) {
      return '<p class="empty-state" style="padding:8px 0">No activity recorded.</p>';
    }

    return items.map(i => `
      <div class="timeline-item">
        <span class="timeline-dot ${i.dot}"></span>
        <span class="timeline-time">${i.time.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}</span>
        <span>${escapeHtml(i.text)}</span>
      </div>
    `).join('');
  }

  // --- CSV Export (Epic 5 — built here for wiring) ---
  function exportSessionCSV(session) {
    const participants = session.participants || [];
    const headers = ['Name', 'Email', 'Status', 'Join Time', 'Leave Time', 'Duration (min)', 'Times Joined', 'Spoke Count', 'Reaction Count', 'Engagement'];
    const rows = participants.map(p => {
      const status = p.statusOverride || getStatus(p, session);
      return [
        csvEscape(p.displayName),
        csvEscape(p.email || ''),
        csvEscape(status),
        p.joinTime || '',
        p.leaveTime || '',
        Math.round((p.durationSeconds || 0) / 60),
        p.joinCount || 1,
        p.spokeCount || 0,
        p.reactionCount || 0,
        csvEscape(p.engagementSummary || p.engagementLabel || 'Passive'),
      ].join(',');
    });

    const csv = [headers.join(','), ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date(session.startTrackingTime).toISOString().slice(0, 10);
    const filename = `meet-attendance-${session.meetingCode || 'session'}-${dateStr}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // --- Chat export ---
  function exportChatLog(session) {
    const messages = session.chatMessages || [];
    if (messages.length === 0) return;

    const header = 'Timestamp,Sender,Message';
    const rows = messages.map(m =>
      `${m.timestamp},${csvEscape(m.sender)},${csvEscape(m.text)}`
    );
    const csv = [header, ...rows].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const dateStr = new Date(session.startTrackingTime).toISOString().slice(0, 10);
    const filename = `meet-chat-${session.meetingCode || 'session'}-${dateStr}.csv`;

    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  function csvEscape(str) {
    if (!str) return '';
    str = String(str);
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return '"' + str.replace(/"/g, '""') + '"';
    }
    return str;
  }
});
