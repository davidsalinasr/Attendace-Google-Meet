# Chrome Web Store Publishing Checklist

## Before You Start
- [ ] Create a Chrome Web Store Developer account ($5 one-time fee)
      → https://chrome.google.com/webstore/devconsole

## Extension Assets (include in ZIP)
- [ ] Create extension icons and place in `icons/` folder:
  - [ ] `icons/icon16.png` (16×16)
  - [ ] `icons/icon48.png` (48×48)
  - [ ] `icons/icon128.png` (128×128)

## Store Assets (upload separately in dashboard)
- [ ] Store icon: 128×128 PNG (same as icon128.png)
- [ ] Screenshots: 1–5 images at 1280×800 or 640×400
  - [ ] Screenshot 1: In-call tracking button
  - [ ] Screenshot 2: Dashboard session list
  - [ ] Screenshot 3: Dashboard session detail
  - [ ] Screenshot 4: Participant detail panel
  - [ ] Screenshot 5: Reaction breakdown (optional)

## Store Listing (copy from store-listing.md)
- [ ] Extension name
- [ ] Short description (132 chars max)
- [ ] Detailed description
- [ ] Category: Education or Productivity

## Privacy (copy from store-listing.md)
- [ ] Host privacy-policy.html somewhere public (GitHub Pages, Netlify, etc.)
- [ ] Paste privacy policy URL in dashboard
- [ ] Fill in permission justifications (see store-listing.md)
- [ ] Declare: "No, I do not collect or transmit user data"

## Google Cloud Console
- [ ] OAuth consent screen set to "External" and Published (not Testing)
- [ ] After first upload: add Chrome Web Store extension ID to authorized origins
      → Format: chrome-extension://YOUR_EXTENSION_ID

## Build the ZIP
Run from the project root:
```bash
zip -r meet-attendance-tracker.zip manifest.json src/ icons/ -x "*.DS_Store"
```
Do NOT include: store/, landing/, .cursor/, index.html, *.log

## Submit
- [ ] Upload ZIP in Developer Dashboard → "New Item"
- [ ] Fill in Store Listing tab
- [ ] Fill in Privacy tab
- [ ] Choose distribution: Public or Unlisted
- [ ] Click "Submit for Review"
- [ ] Wait 1–3 business days for approval
