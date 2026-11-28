# Design: floating notices and a chat ping

Date: 2026-11-28. Size: small change (client only).

## Intent

Three call-page improvements requested by the author:

1. "Your sign-in expired" becomes a floating panel over the call instead of the fixed red banner
   at the top of the page.
2. The app's own sharing notice becomes a floating panel that stays while you present and can be
   hidden with a button. It replaces the 2.5 s toast "You're presenting to everyone".
3. A short ping plays when someone else sends a chat message, unless you're already reading the
   chat.

## Goals

- **Expired panel.** A floating card reading "Your sign-in expired. You can stay in this call;
  sign in again after you leave." with a close (✕) button.
  - Once closed, it stays closed for this call.
  - When the call ends, the login page comes up as it does today. That flow is unchanged.
- **Presenting panel.** A floating card reading "You're presenting your entire screen / a window
  / a tab to this call", with **Stop presenting** and **Hide** buttons.
  - The wording comes from `screenTrack.getSettings().displaySurface`: `monitor`, `window` or
    `browser`. If the browser doesn't report it, the text is "You're presenting to this call".
  - Hide closes the card until the next share. The blue Present button still shows you're sharing.
  - The card also goes away when sharing stops: the Stop button, the Present button, the
    browser's own "Stop sharing", Leave, or cleanup.
- **Chat ping.** It plays for a chat message from someone else when either:
  - the tab isn't visible (`document.hidden`: another tab, or the window minimized); or
  - the tab is visible and the chat panel is closed.

  It doesn't play when the tab is visible and the chat is open, and it never plays for your own
  messages or for system lines ("X joined", "Reconnected").

## Non-goals

- Chrome's own sharing bar ("… is sharing your screen" / "Sharing this tab to …"). The browser
  draws it, and a page can't change it.
- A mute or volume setting for the ping. Desktop notifications.
- Replacing the `#error` banner for real page errors (server unreachable and so on). Only the
  expired message moves.

## Anti-goals

- Any server (`app.bzg`) change.
- A ping that fires while you're reading the open chat, or for your own message.
- Panels covering the control bar or the chat input.

## Approaches

| Approach | Trade-off | Picked |
|---|---|---|
| **A. Web Audio tone** on the `AudioContext` the page creates when you click Join | No asset and no server route. The context was started by a user gesture, so it plays in background tabs. The sound is synthesized | **Yes (author's choice)** |
| B. Audio file (`ping.ogg`) played with `new Audio()` | Any sound, but `app.bzg` only serves files it lists by name, so this needs a server route or an inlined base64 blob | No |

The floating panels have one sensible approach. The author's CLAUDE.md asks for notifications to
live in one shared module, so the toast grows into a NOTIFICATIONS section with `toast()`
(unchanged) and `showNotice(id, { text, actions })` / `hideNotice(id)`. Both panels use it. Adding
two more ad-hoc elements would duplicate the show, hide and position logic.

## Design

- **Notices.** One container, `#notices`, holds floating cards stacked at the top left of the
  video area, inside `.call-body`.
  - Placement changed during review from the top right: a fixed top-right card covered the open
    chat panel's header and close button, and the screen tiles' fullscreen buttons.
  - Each card has `role="status"`, its text, and its action buttons.
  - `showNotice` replaces any existing card with the same id; `hideNotice` removes it.
  - The cards follow the existing theme variables and work in light and dark themes.
  - On a narrow screen (375 px), the cards span the width.
- **Expired.** The `AUTH.EXPIRED` branch of `renderAuth` calls `showNotice("expired", …)` instead
  of `showError`. A `dismissed` flag remembers the ✕ until the call ends. The places that hid
  `errorBox` for the expired case call `hideNotice("expired")` instead.
- **Presenting.**
  - `toggleShare` calls `showNotice("presenting", …)` once capture starts.
  - `endScreenCapture` calls `hideNotice("presenting")`, which covers every stop path.
  - The Stop action calls `stopShare()`; Hide calls `hideNotice`.
- **Ping.**
  - `playPing()` lives in the NOTIFICATIONS section. It plays two short sine notes (about
    880 Hz, then 1320 Hz, about 80 ms each, with a fast gain envelope) on `audioContext`.
  - It does nothing when there is no context.
  - It calls `audioContext.resume()` first, in case the browser suspended the context.
  - `addChat` calls it when `!mine && (document.hidden || !chatOpen())`.

## Verification

- `npm test` passes, including the inline-script syntax check. `git diff main -- app.bzg` is
  empty.
- Manual rows are added to `docs/testing.md` for:
  - the expired card (shown, closed, stays closed);
  - the presenting card (wording per surface, Hide, Stop, the browser's Stop sharing, Leave);
  - the ping in three cases: other tab, tab visible with chat closed, tab visible with chat open
    (no ping);
  - no ping for your own message.

## Left to the builder

Exact card styling, the stacking order of the two cards, and the exact envelope of the ping.
