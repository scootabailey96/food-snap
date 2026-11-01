# Food Snap (PWA)

Open from the Pixel home screen → camera → snap → optional note + voice memo → big **Confirm & send** →
email lands in `scoota@mail.grokbot.com` (subject starts `[FOOD-SNAP]`) with up to 6 photos (JPEG ≤1600px, each ≤~700 KB) and
voice note attached, plus UTC / device-local / Perth timestamps.

## How it works
- Static files only (`index.html`, `app.js`, `style.css`, `config.js`, `sw.js`, `manifest.webmanifest`, `icons/`). No backend, no secrets.
- Camera: live `getUserMedia` preview (rear camera) with a shutter button. Fallback button "System camera" uses
  `<input type=file accept=image/* capture=environment>`. Chrome blocks auto-opening a file picker without a tap, so the
  app tries it only if the live preview is denied; the live preview is the "straight to camera" path.
- Multi-photo: up to 6 per entry (camera shutter, System camera, or Gallery; add one at a time, thumbnails with ✕ remove). Each is drawn to a canvas at 1600px long edge, JPEG q0.82, and re-compressed (lower quality, then smaller size) until ≤700 KB.
- Email attachment field names: `photo1`..`photoN` (+ `photo_count`), filenames `food-<stamp>-photo<i>of<N>.jpg`; voice is `voice` / `voice-<stamp>.<ext>`. Older queued single-photo items still send as `photo`.
- Voice note: `MediaRecorder` (webm/opus, 32 kbps, max 2 min).
- Send: multipart `fetch` POST to FormSubmit.co (free email relay, no account). The endpoint in `config.js` is a
  random alias for the mailbox, not a credential. Use the **non-AJAX** endpoint: `/ajax/` silently drops attachments (tested).
- Offline/failed sends are queued in IndexedDB and retried on next open / when back online.
- Service worker caches the app shell so it opens instantly and offline.

## Passcode
On first launch the app asks for a passcode, stores it in this phone's localStorage and sends it as the `passcode` form field with every submission (queued retries read the current value at send time). "Change passcode" link is on the camera and review screens. The passcode is **not** in the repo; FormSubmit cannot enforce it, so it is a tag for the inbox-watch routine to check (drop emails whose `passcode` row doesn't match). `.passcode.sha256` (local only, never upload) holds the SHA-256 of the expected value. `send-test.sh` sends `$FOOD_SNAP_PASSCODE` if set.

## Install on Pixel (Chrome)
1. Open the hosted HTTPS URL in Chrome. 2. Allow Camera (and Mic when you first record).
3. ⋮ menu → **Add to Home screen** / **Install app**. 4. Launch from the icon.

## Hosting / one-time activation
FormSubmit ties activation to the site origin. After hosting at `https://HOST`, run `./send-test.sh https://HOST`
once; FormSubmit emails an "Activate" link to scoota@; open it once; re-run the test. (Already activated for the placeholder `https://food-snap.example`.)
Host options with no payment: GitHub Pages (needs GitHub connected), Cloudflare Pages / Netlify (need an account).

## Limits
- FormSubmit: 10 MB total per submission, free tier, third-party relay; emails carry a small FormSubmit sponsor footer; anyone who finds the alias+origin could spam the inbox (rotate by re-registering).
- Photos/voice are emailed, not stored by FormSubmit.
- `./send-test.sh [origin]` sends one synthetic submission with the same fields.
