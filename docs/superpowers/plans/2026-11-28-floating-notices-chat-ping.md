# Floating notices and chat ping: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** three changes to the call page.
- "Your sign-in expired" becomes a closable floating card.
- The presenting notice becomes a floating card with Stop/Hide.
- A Web Audio ping plays for chat from others when the tab is hidden or the chat is closed.

**Architecture:**
- Two pure helpers in `public/jmeet-core.js` decide the ping and the presenting wording.
- A new NOTIFICATIONS section in `public/index.html` owns `toast()`, `showNotice()`, `hideNotice()` and `playPing()`. Both cards and the ping go through it.
- Client only; `app.bzg` is not touched.

**Tech Stack:** vanilla JS, Web Audio API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-28-floating-notices-chat-ping-design.md`

## Global Constraints

- No `app.bzg` change: `git diff main -- app.bzg` must be empty.
- **Tests stay out of the PR.** New tests go in `local-tests/`, which is git-excluded and never committed. Run them with `node --test "local-tests/*.test.js"`. `npm test` must still pass.
- Code style: 4-space indent, and a short comment on every function, loop, conditional and logical section. Use early returns.
- Expired text, verbatim: "Your sign-in expired. You can stay in this call; sign in again after you leave."
- Presenting text:
  - "You're presenting your entire screen to this call" for `monitor`;
  - "You're presenting a window to this call" for `window`;
  - "You're presenting a tab to this call" for `browser`;
  - "You're presenting to this call" for anything else.
- Ping rule: play only when `!mine && (hidden || !chatOpen)`. Never for system lines.
- Ping sound: two sine notes, about 880 Hz then about 1320 Hz, about 80 ms each, with a fast gain envelope, on the existing `audioContext`.
- The `#error` banner stays for real page errors. Only the expired message moves.
- Commits use Conventional Commits with the CLAUDE.md body and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Expired, then ✕, then a background check hits 401 again.** The card must not come back. `renderAuth` runs on every `setAuth`, so the `dismissed` flag must be checked there. Task 2 manual row.
2. **Expired, then a successful session check (signed in again in another tab).** The card disappears (`checkSession` already handles the `EXPIRED` → ok path). Task 2 manual row.
3. **The browser's own "Stop sharing" while the card is hidden or shown.** No card is left behind, because `endScreenCapture` hides it on every stop path. Task 3 manual row.
4. **A chat message before `audioContext` exists or after it's closed** (left the call, chat history arriving): no exception, and no ping. `playPing` returns early. Task 4 manual row.
5. **Narrow screens (375 px).** Cards span the width and don't cover the control bar or the chat input. Task 2 manual row.

---

### Task 1: ping and wording helpers in `jmeet-core.js`

**Files:**
- Modify: `public/jmeet-core.js`: a new `NOTIFICATIONS` section before `THEME`, with both functions exported in `api`.
- Test: `local-tests/notifications.test.js` (local only)

**Interfaces:**
- Produces:
  - `shouldPing({ mine, hidden, chatOpen }) -> boolean`
  - `presentingText(displaySurface) -> string` (the exact strings in Global Constraints)

- [ ] **Step 1: Write the failing tests** in `local-tests/notifications.test.js`. Require `../public/jmeet-core.js`, and use a header comment like the other local tests.
  - `shouldPing plays for others when the tab is hidden`: `{mine:false, hidden:true, chatOpen:true}` → `true`.
  - `shouldPing plays for others when the chat is closed`: `{mine:false, hidden:false, chatOpen:false}` → `true`.
  - `shouldPing stays quiet while reading the open chat`: `{mine:false, hidden:false, chatOpen:true}` → `false`.
  - `shouldPing never plays for your own message`: `mine:true` with every combination of `hidden` and `chatOpen` → `false`.
  - `presentingText names the shared surface`: `"monitor"`, `"window"` and `"browser"` give the three exact strings.
  - `presentingText falls back`: `undefined`, `""` and `"application"` → "You're presenting to this call".
- [ ] **Step 2: Run** `node --test local-tests/notifications.test.js`. Expected: FAIL (`core.shouldPing is not a function`).
- [ ] **Step 3: Implement both functions and add them to `api`.**
- [ ] **Step 4: Run** `node --test "local-tests/*.test.js"` and `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** `public/jmeet-core.js` only, with the subject `feat: add chat ping and presenting text helpers`.

### Task 2: notice module and the expired card

**Files:**
- Modify: `public/index.html`:
  - markup: `<div id="notices" aria-live="polite"></div>` next to `#toast`;
  - move `toast()` out of HELPERS into a new `NOTIFICATIONS` section, right after HELPERS;
  - `renderAuth` (the `AUTH.EXPIRED` and `SIGNED_OUT` cases), `checkSession`, `cleanup`.
- Modify: `public/style.css`: `#notices` and `.notice`, next to the `#toast` rules.
- Modify: `docs/testing.md`: new manual rows.

**Interfaces:**
- Produces, in the NOTIFICATIONS section:
  - `showNotice(id: string, { text: string, actions: Array<{ label: string, onClick: () => void, ariaLabel?: string }> }) -> void`
    - `ariaLabel`, when given, sets the button's `aria-label` and `title`.
    - Builds a `<div class="notice" role="status" data-notice="<id>">` holding a `<p>` with the text, plus one `<button type="button">` per action.
    - It replaces any card with the same id.
    - Clicking an action calls its `onClick`. The card isn't removed automatically; `onClick` decides that.
  - `hideNotice(id: string) -> void` removes that card if it exists.
  - Module-level `let expiredDismissed = false;`

- [ ] **Step 1: Notice markup and CSS.**
  - `#notices` is `position: fixed`, at the top right below the top bar, with `z-index` above the video grid. It's a vertical stack with a gap.
  - `.notice` uses the theme variables (`--surface`/`--text`, or whatever `#toast` uses), a rounded card, a shadow, and buttons in the existing `.text-btn` style.
  - With `@media (max-width: 600px)`, `#notices` spans the width with side margins.
  - It must not overlap the control bar at the bottom or the chat input.
- [ ] **Step 2: Implement `showNotice` and `hideNotice`.** Move `toast()` into the same section unchanged.
- [ ] **Step 3: Expired card.**
  - In `renderAuth`, the `AUTH.EXPIRED` case does nothing if `expiredDismissed`. Otherwise it calls `showNotice("expired", { text: <verbatim>, actions: [{ label: "✕" , onClick: () => { expiredDismissed = true; hideNotice("expired"); } }] })`.
  - Give the ✕ button `aria-label="Close"`, passed as an optional `ariaLabel` field on the action.
  - Replace `checkSession`'s `if (auth.status === Core.AUTH.EXPIRED) errorBox.hidden = true;` with `hideNotice("expired")`.
  - The `SIGNED_OUT` case calls `hideNotice("expired")` and sets `expiredDismissed = false`.
- [ ] **Step 4: Run** `npm test`. Expected: pass, including the inline-script syntax check.
- [ ] **Step 5: Add manual rows** to `docs/testing.md` after the sign-in rows. Number them 4a–4c so existing references stay valid:
  - **4a:** in a call, sign out in another tab, then wait up to 60 s. Expected: the floating expired card appears at the top right; the red banner doesn't.
  - **4b:** click ✕, then wait another 60 s. Expected: the card stays closed.
  - **4c:** leave the call. Expected: the login page, and no card.
- [ ] **Step 6: Manual check**, with the author, on `npm run online:linux`: rows 4a–4c, plus the card at a 375 px window width.
- [ ] **Step 7: Commit** with the subject `feat: show the expired sign-in notice as a floating card`.

### Task 3: presenting card

**Files:**
- Modify: `public/index.html`: `toggleShare`, `endScreenCapture`.
- Modify: `docs/testing.md`: rows next to 10a–10i.

**Interfaces:**
- Consumes: `showNotice` and `hideNotice` (Task 2), `Core.presentingText` (Task 1).

- [ ] **Step 1: Show the card.** In `toggleShare`, replace `toast("You're presenting to everyone")` with:
  - `showNotice("presenting", { text: Core.presentingText(screenTrack.getSettings?.().displaySurface), actions: [{ label: "Stop presenting", onClick: stopShare }, { label: "Hide", onClick: () => hideNotice("presenting") }] })`.
- [ ] **Step 2: Hide it on every stop.** `endScreenCapture` calls `hideNotice("presenting")`. It's the shared path for the Present button, Stop presenting, the browser's Stop sharing, Leave and cleanup.
- [ ] **Step 3: Run** `npm test`. Expected: pass.
- [ ] **Step 4: Add manual rows** `10j`–`10l`:
  - **10j:** Present, picking the entire screen, then a window, then a tab. Expected: the card says "your entire screen" / "a window" / "a tab".
  - **10k:** Hide. Expected: the card goes away, presenting continues, and the Present button stays blue. Present again → a new card.
  - **10l:** Stop with the card's Stop presenting button, then share again and use the browser's own Stop sharing. Expected: both times the card is gone and the screen tile is removed.
- [ ] **Step 5: Manual check** of 10j–10l with the author.
- [ ] **Step 6: Commit** with the subject `feat: show a floating presenting notice with Stop and Hide`.

### Task 4: chat ping

**Files:**
- Modify: `public/index.html`: NOTIFICATIONS (`playPing`), `addChat`.
- Modify: `docs/testing.md`, `docs/architecture.md`: one line saying the ping is Web Audio, with no asset and no server change.

**Interfaces:**
- Consumes: `Core.shouldPing` (Task 1) and the existing `audioContext`.
- Produces: `playPing() -> void` in NOTIFICATIONS.

- [ ] **Step 1: Implement `playPing()`.**
  - Return early when `!audioContext` or `audioContext.state === "closed"`.
  - Call `audioContext.resume()` without awaiting it, and ignore its rejection.
  - Schedule two `OscillatorNode`s (`type "sine"`), at about 880 Hz from `t` and about 1320 Hz from `t + 0.09`. Each goes through its own `GainNode`: ramp from 0 to about 0.15 in 10 ms, then exponentially down to 0.001 by +80 ms. Each node stops after its envelope.
- [ ] **Step 2: Call it.** In `addChat`, call `if (Core.shouldPing({ mine, hidden: document.hidden, chatOpen: chatOpen() })) playPing();`. Keep the existing unread dot and toast logic as it is.
- [ ] **Step 3: Run** `npm test` and `node --test "local-tests/*.test.js"`. Expected: pass.
- [ ] **Step 4: Add manual rows** `9a`–`9d`:
  - **9a:** B switches to another tab, and A sends a message. Expected: B hears the ping.
  - **9b:** B's tab is visible with the chat closed. Expected: ping, plus the dot and the toast.
  - **9c:** B's tab is visible with the chat open. Expected: no ping.
  - **9d:** A's own message. Expected: no ping for A.
- [ ] **Step 5: Manual check** of 9a–9d with the author (two browser profiles).
- [ ] **Step 6: Commit** with the subject `feat: ping on chat messages when the chat isn't in view`.
- [ ] **Step 7: Run the `spec-reviewer`** on `git diff main...HEAD` against the spec and this plan, and fix any blocking gaps. Check that `git diff main -- app.bzg` is empty. Ask before pushing, then open the PR with the CLAUDE.md sections, and an inline review if the diff is over about 100 lines.
