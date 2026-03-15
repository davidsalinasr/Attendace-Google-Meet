# Chrome Web Store Listing — Meet Attendance Tracker

Use this file as a reference when filling out the Chrome Web Store Developer Dashboard.

---

## Extension Name
Meet Attendance Tracker

## Short Description (132 characters max)
Track attendance & engagement in Google Meet — reactions, chat, speaking time. One-click start, detailed dashboard after every call.

## Detailed Description

Meet Attendance Tracker helps hosts and teachers track who attended their Google Meet calls and how engaged they were — all with a single click.

**How it works:**
• Click the tracking button directly in your Google Meet toolbar to start
• A subtle indicator shows tracking is active
• After the call, a full dashboard opens automatically with your session report

**What it tracks:**
• Participant attendance — who joined and for how long
• Speaking engagement — when participants unmuted their microphone
• Reactions — every emoji reaction with type and count
• Chat messages — full chat log attributed to each participant

**Dashboard features:**
• Overall session metrics at a glance (participants, reactions, messages, speaking events)
• Per-participant detail panel with individual engagement breakdown
• Reaction breakdown with emoji distribution
• Chat message log with sender and timestamp
• Most active participants ranking
• Session search, sort, and date filtering
• Archive and unarchive past sessions
• Edit session names directly from the list
• Export session data to CSV

**Privacy first:**
• All data is stored locally in your browser — nothing leaves your device
• No analytics, no tracking, no ads
• You control when tracking starts and stops
• Only requires access to meet.google.com

Perfect for teachers, team leads, meeting organizers, and anyone who wants better insight into their Google Meet sessions.

---

## Category
Education (or Productivity)

## Language
English

## Website (optional)
<!-- Add your landing page URL here if you have one -->

## Privacy Policy URL
<!-- Host the store/privacy-policy.html file and paste the URL here -->
<!-- Options: GitHub Pages, Netlify, Vercel, or any static host -->

---

## Screenshots Guide

Upload 1–5 screenshots at 1280×800 or 640×400 resolution (PNG or JPEG).

Recommended screenshots to capture:

1. **In-call tracking button** — Show the Meet toolbar with the tracking button visible next to the hang-up button, green "Tracking attendance" indicator visible at top-left.

2. **Dashboard — Session list** — Show the session list page with a few sessions, the toolbar visible (search bar, date filters, sort dropdown, archive toggle).

3. **Dashboard — Session detail overview** — Show the top metric cards (participants, reactions, messages, spoke) and the participant list below.

4. **Dashboard — Participant detail panel** — Show the right-side panel open for a participant with their individual engagement stats, chat messages, and reactions.

5. **Dashboard — Reaction breakdown** — Show the emoji reaction distribution section with the colorful emoji bars.

### Tips for great screenshots:
- Use a clean browser window (hide bookmarks bar, other extensions)
- Have realistic data (a real session or seed mock data)
- Use a 1280×800 browser window size
- Crop to exactly 1280×800 if needed

---

## Store Icon

Upload a 128×128 PNG icon. This should match the extension icon used in `icons/icon128.png`.

---

## Justification Texts (for the Privacy tab in Developer Dashboard)

### Why do you need the "storage" permission?
To save attendance session data (participant names, engagement events, chat messages) locally in the user's browser so they can review past sessions in the dashboard.

### Why do you need the "activeTab" permission?
To detect when the user is on a Google Meet page and inject the tracking button and status indicator into the Meet interface.

### Why do you need the "tabs" permission?
To open the dashboard page in a new tab after a meeting ends and to detect navigation to/from Google Meet pages.

### Why do you need the "identity" permission?
To authenticate with the user's Google account via OAuth 2.0 in order to access the Google Meet REST API for retrieving authoritative attendance data (join/leave times).

### Why do you need host permission for meet.google.com?
The extension only operates on Google Meet pages. This permission allows the content scripts to inject the tracking UI and observe participant engagement events within the Meet interface.

### Does your extension collect or transmit user data?
No. All data is stored locally in the user's browser using chrome.storage.local. No data is sent to any external server, analytics service, or third party.
