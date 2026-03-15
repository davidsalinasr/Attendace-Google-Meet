// Meet REST API helper — called from the background service worker
// Uses chrome.identity for OAuth token management

const MEET_API_BASE = 'https://meet.googleapis.com/v2';
const SCOPES = ['https://www.googleapis.com/auth/meetings.space.readonly'];

async function getAuthToken(interactive = true) {
  return new Promise((resolve, reject) => {
    chrome.identity.getAuthToken({ interactive }, (token) => {
      if (chrome.runtime.lastError) {
        reject(new Error(chrome.runtime.lastError.message));
      } else {
        resolve(token);
      }
    });
  });
}

async function apiFetch(path, token) {
  const res = await fetch(`${MEET_API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Meet API ${res.status}: ${text}`);
  }
  return res.json();
}

/**
 * Find the active conference record for a given meeting code.
 * Uses filter: end_time IS NULL AND space.meeting_code = "<code>"
 */
async function findActiveConference(meetingCode, token) {
  const filter = encodeURIComponent(
    `end_time IS NULL AND space.meeting_code = "${meetingCode}"`
  );
  const data = await apiFetch(`/conferenceRecords?filter=${filter}&pageSize=5`, token);
  const records = data.conferenceRecords || [];
  return records.length > 0 ? records[0] : null;
}

/**
 * List all participants for a conference record.
 * Returns array of participant objects.
 */
async function listParticipants(conferenceRecordName, token) {
  let allParticipants = [];
  let pageToken = '';

  do {
    const url = `/${conferenceRecordName}/participants?pageSize=250${
      pageToken ? `&pageToken=${pageToken}` : ''
    }`;
    const data = await apiFetch(url, token);
    allParticipants = allParticipants.concat(data.participants || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allParticipants;
}

/**
 * List participant sessions for a specific participant.
 * Returns array of session objects with startTime / endTime.
 */
async function listParticipantSessions(participantName, token) {
  let allSessions = [];
  let pageToken = '';

  do {
    const url = `/${participantName}/participantSessions?pageSize=250${
      pageToken ? `&pageToken=${pageToken}` : ''
    }`;
    const data = await apiFetch(url, token);
    allSessions = allSessions.concat(data.participantSessions || []);
    pageToken = data.nextPageToken || '';
  } while (pageToken);

  return allSessions;
}

/**
 * Normalize raw API participants + sessions into our session model format.
 * Returns array of { id, displayName, email, joinTime, leaveTime, durationSeconds, joinCount }
 */
function normalizeParticipants(rawParticipants, sessionsByParticipant) {
  return rawParticipants.map((p) => {
    const user = p.signedinUser || p.anonymousUser || p.phoneUser || {};
    const displayName = user.displayName || 'Unknown';
    const email = user.user ? `users/${user.user}` : null;

    const sessions = sessionsByParticipant[p.name] || [];
    const joinCount = sessions.length || 1;

    let firstJoin = p.earliestStartTime ? new Date(p.earliestStartTime) : null;
    let lastLeave = p.latestEndTime ? new Date(p.latestEndTime) : null;

    // Compute total duration from individual sessions
    let totalMs = 0;
    sessions.forEach((s) => {
      const start = new Date(s.startTime);
      const end = s.endTime ? new Date(s.endTime) : new Date();
      totalMs += end - start;
    });

    // Fallback if no sessions data
    if (sessions.length === 0 && firstJoin) {
      const end = lastLeave || new Date();
      totalMs = end - firstJoin;
    }

    return {
      id: p.name,
      displayName,
      email,
      joinTime: firstJoin ? firstJoin.toISOString() : null,
      leaveTime: lastLeave ? lastLeave.toISOString() : null,
      durationSeconds: Math.round(totalMs / 1000),
      joinCount,
      spokeCount: 0,
      reactionCount: 0,
      engagementLabel: 'Passive',
      engagementSummary: '',
      statusOverride: null,
    };
  });
}

// Export for use in background.js (will be imported via importScripts or inline)
self.meetApi = {
  getAuthToken,
  findActiveConference,
  listParticipants,
  listParticipantSessions,
  normalizeParticipants,
};
