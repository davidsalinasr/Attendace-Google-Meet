// Centralized DOM selectors for Google Meet elements.
// When Meet updates its UI, only this file needs to change.

export const SELECTORS = {
  // "Leave call" button — indicates the user is in an active call
  leaveCallButton: [
    '[data-tooltip="Leave call"]',
    '[aria-label="Leave call"]',
  ],

  // Participant items (in the People panel or video tiles)
  participantItem: [
    '[data-participant-id]',
    '[data-requested-participant-id]',
  ],

  // Participant name within a participant item
  participantName: [
    '[data-self-name]',
    'span',
  ],

  // Muted mic indicator within a participant item
  mutedMic: [
    '[aria-label*="muted"]',
    '[aria-label*="Muted"]',
    '[data-is-muted="true"]',
  ],

  // Microphone icon (for unmute detection on video tiles)
  micIcon: [
    '[aria-label*="microphone"]',
    '[aria-label*="Microphone"]',
  ],

  // Reaction elements (added to DOM when someone reacts)
  reactionElement: [
    '[aria-label*="reacted"]',
  ],
};

/**
 * Try multiple selectors and return the first match.
 */
export function queryFirst(parent, selectorList) {
  for (const sel of selectorList) {
    const el = parent.querySelector(sel);
    if (el) return el;
  }
  return null;
}

/**
 * Try multiple selectors and return all matches combined.
 */
export function queryAllMulti(parent, selectorList) {
  for (const sel of selectorList) {
    const els = parent.querySelectorAll(sel);
    if (els.length > 0) return els;
  }
  return [];
}
