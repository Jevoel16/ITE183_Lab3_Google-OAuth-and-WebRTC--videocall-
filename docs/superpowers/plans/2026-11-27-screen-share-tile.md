# Linux launcher and separate screen-share tile: implementation plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Two PRs.
1. A bash launcher (`npm run local:linux` / `online:linux`) that runs Jmeet on Linux.
2. Screen sharing as its own tile, carried over a second `RTCPeerConnection`, with a fullscreen button.

**Architecture:**
- PR 1 adds `scripts/run.sh`. It rewrites `config.bzg` the way the `.ps1` scripts do, then runs the native Linux `bonezegei`.
- In PR 2, each presenter opens one send-only `RTCPeerConnection` per viewer, alongside the existing camera connection.
- Screen signals reuse the server's `signal` relay, tagged with `data.channel` (`"screen"` or `"screen-reply"`), so `app.bzg` does not change.

**Tech Stack:** Bonezegei v1.3.3 (Linux deb), bash, cloudflared, vanilla JS with WebRTC and the Fullscreen API, `node:test`.

**Spec:** `docs/superpowers/specs/2026-11-27-screen-share-tile-design.md`

## Global Constraints

- `app.bzg` is not modified: `git diff main -- app.bzg` must be empty on both branches.
- Code style: 4-space indent, and a short comment on every function, loop, conditional and logical section. Use early returns.
- Run scripts skip with `Skipping: start this with npm run <script>.` when `npm_lifecycle_event` is unset, because `bzg run` starts every `package.json` script.
- Linux modes: `local` means `http://localhost:8001` (`useTunnel = 1`, `tunnelPort = 8001`); `online` means a cloudflared quick tunnel to `http://localhost:8001`. Linux has no local HTTPS mode.
- Input values are never built into shell strings or `sed` regexes. Config values pass as arguments.
- If `bzg install` on Linux lacks a function `app.bzg` calls, stop and report which function is missing. Don't change `app.bzg`, and don't try Wine.
- Screen capture stays `getDisplayMedia({ video: true })` and sets `screenTrack.contentHint = "detail"`.
- A screen tile is removed on `stop`, on the presenter's `left`, or when its connection reaches `failed` or `closed`. It is never removed on `disconnected`, and there is no ICE restart.
- Commits use Conventional Commits with the CLAUDE.md body (what, why, alternatives, verification, risks) and end with `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`.

## Review Focus

1. **Camera toggled while presenting.** The camera tile must update for everyone while the screen tile keeps going. Today `toggleMedia` skips `replaceTrack` when `screenTrack` is set (`index.html:644`), and that guard must go. Covered by Task 6 manual row M4.
2. **The presenter closes the tab or leaves while sharing.** Viewers' screen tiles disappear, because `left` calls `closeScreenIn`. Covered by Task 6 rows M6 and M7.
3. **The screen tile is removed while it is fullscreen.** The page must exit fullscreen rather than leave a black fullscreen view. `removeScreenTile` calls `document.exitFullscreen()` when `document.fullscreenElement === tile`. Covered by Task 5 row M3.
4. **A config value contains `&`, `/`, `|` or quotes.** `set_config_value` writes it literally. Covered by Task 1 tests.
5. **Cancelling the share picker, or leaving and rejoining after sharing.** Neither leaves a stale tile or a live capture track. `cleanup()` closes every screen connection and the local preview. Covered by Task 6 row M8.

---

# PR 1: `chore/linux-run-script` (branch from `main`)

### Task 1: `scripts/run.sh` local mode

**Files:**
- Create: `scripts/run.sh` (executable)
- Create: `scripts/run-sh.test.js`
- Modify: `package.json` (`scripts`)
- Add: `docs/superpowers/specs/2026-11-27-screen-share-tile-design.md` and this plan (committed with this task)

**Interfaces:**
- Produces, as bash functions that become available when the script is sourced:
  - `set_config_value <file> <name> <value>` replaces the line matching `^var <name> = .*;$` with `var <name> = <value>;`, or appends that line if none matches.
  - `require_npm <script-name>` prints the Skipping line and returns 1 when `npm_lifecycle_event` is empty.
  - `main <mode>` runs the chosen mode.
- The script body ends with `[[ "${BASH_SOURCE[0]}" == "$0" ]] && main "$@"`, so tests can source it without starting anything.

- [ ] **Step 1: Write failing tests** in `scripts/run-sh.test.js`. Each test copies a temporary config with `fs.mkdtempSync` and runs `spawnSync("bash", ["-c", 'source scripts/run.sh; set_config_value "$@"', "_", file, name, value])`.
  - `set_config_value replaces an existing line`: the input holds `var baseUrl = "x";` and the value is `"http://localhost:8001"`. The file then holds exactly one `var baseUrl = "http://localhost:8001";` line, and the other lines are unchanged.
  - `set_config_value appends a missing line`: with no `tunnelPort` line, the output ends with `var tunnelPort = 8001;`.
  - `set_config_value writes metacharacters literally`: the value `"https://a.trycloudflare.com/x?a=1&b=2|c"` ends up in the file byte for byte.
  - `run.sh skips outside npm`: runs `bash scripts/run.sh local` with `npm_lifecycle_event` deleted from `env`. Exit status is 0, and stdout includes `Skipping: start this with npm run local:linux.`
- [ ] **Step 2: Run** `node --test scripts/run-sh.test.js`. Expected: FAIL (no `scripts/run.sh`).
- [ ] **Step 3: Implement `scripts/run.sh`.**
  - Start with `#!/usr/bin/env bash`, `set -euo pipefail`, and `cd` to the repo root (`dirname "$0"/..`).
  - `set_config_value` reads the file line by line with `while IFS= read -r` and compares lines with bash `[[ $line == "var $name = "*";" ]]`. It writes to a temp file next to the original, then `mv`s it over. No `sed`.
  - `local` mode:
    - Check that `config.bzg` exists and that `bonezegei` is on `PATH`. Each check gets its own message, copied from the `.ps1` wording.
    - Check that `lib/http.bzg` exists, otherwise print `Run bzg install first.`
    - Set `useTunnel 1`, `tunnelPort 8001`, `baseUrl "http://localhost:8001"`, and the two redirect URIs under it.
    - Print `Open http://localhost:8001` and the two callbacks.
    - `exec bonezegei app.bzg`.
  - An unknown mode prints `Usage: scripts/run.sh local|online` and exits 2.
- [ ] **Step 4: Add npm scripts** to `package.json`:
  - `"local:linux": "bash scripts/run.sh local"`
  - `"online:linux": "bash scripts/run.sh online"`
  - `"test"` stays unchanged: its `scripts/*.test.js` glob already picks up `run-sh.test.js`. CI runs on ubuntu-latest, which has bash.
- [ ] **Step 5: Run** `npm test` and `shellcheck scripts/run.sh` (install it with `apt` if it's missing). Expected: all tests pass, and shellcheck prints no output.
- [ ] **Step 6: Install the Linux package and check what it exports.**
  - Run `bzg install` in the repo.
  - Then run `nm -D --defined-only lib/http/*.so | grep -E 'requestGET|close|send|getCookie|getHeader|addHeader|redirect|oauth'`.
  - If any method `app.bzg` calls (`requestGET`, `close`, `send`, `getCookie`, `getHeader`, `addHeader`, `redirect`, `getQuery`, `getResponseBody`, `oauth*`) is missing, **stop and report** (Global Constraints).
- [ ] **Step 7: Manual run.**
  - The user's `config.bzg` must hold their dev GitHub app keys and the Google client.
  - Run `npm run local:linux` in the background, then `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/`. Expected: `200`.
  - `curl -s -o /dev/null -w '%{http_code}\n' http://localhost:8001/api/me` should return `401`.
  - The user signs in with Google and with GitHub in two windows. Expected: the call view shows their name. This also confirms the `Secure` cookie works on `http://localhost`.
- [ ] **Step 8: Commit** `scripts/run.sh`, `scripts/run-sh.test.js`, `package.json`, the spec and the plan with the subject `chore: add Linux launcher for local mode`.

### Task 2: online mode (cloudflared)

**Files:**
- Modify: `scripts/run.sh`
- Modify: `scripts/run-sh.test.js`

**Interfaces:**
- Consumes: `set_config_value` and `require_npm` from Task 1.
- Produces: `extract_tunnel_url <logfile>`, which prints the first `https://[a-z0-9-]+\.trycloudflare\.com` match (`grep -oE ... | head -n 1`), or nothing.

- [ ] **Step 1: Write failing tests.**
  - `extract_tunnel_url finds the address`: a log containing a cloudflared banner with `https://ab-cd-12.trycloudflare.com` prints exactly that.
  - `extract_tunnel_url prints nothing without an address`: the output is an empty string.
- [ ] **Step 2: Run** `node --test scripts/run-sh.test.js`. Expected: the 2 new tests FAIL.
- [ ] **Step 3: Implement online mode.**
  - Check `cloudflared` is on `PATH`, otherwise print `cloudflared isn't installed or isn't on PATH.`
  - The log goes to `"${TMPDIR:-/tmp}/jmeet-cloudflared.log"`.
  - Start `cloudflared tunnel --config /dev/null --url http://localhost:8001 2>"$log" &`, and register a trap on `EXIT INT TERM` that kills the cloudflared PID.
  - Poll `extract_tunnel_url` once a second for 30 s. Fail with `No tunnel address after 30 seconds.` on timeout, or `cloudflared stopped. Its log is in $log` if the process exits.
  - Set `useTunnel 1`, `tunnelPort 8001`, `baseUrl "<url>"` and both redirect URIs.
  - Print the share address and callbacks with the `.ps1` wording.
  - Run `bonezegei app.bzg` without `exec`, so the trap still fires.
- [ ] **Step 4: Run** `npm test` and `shellcheck scripts/run.sh`. Expected: tests pass and shellcheck is clean.
- [ ] **Step 5: Manual run.**
  - Install cloudflared: download the `cloudflared-linux-amd64` release binary to `~/.local/bin/cloudflared` and `chmod +x` it.
  - Run `npm run online:linux`. `curl -s -o /dev/null -w '%{http_code}\n' <printed url>` should return `200`; allow up to a minute.
  - Press Ctrl+C. `pgrep -x cloudflared` should print nothing.
  - `bzg run` should print the Skipping line for both `:linux` scripts. Kill it if the Windows scripts error out under Linux, which is expected.
- [ ] **Step 6: Commit** with the subject `chore: add online mode to the Linux launcher`.

### Task 3: docs and PR 1

**Files:**
- Modify: `docs/setup.md` (new "Linux" section after section 1), `docs/troubleshooting.md` (Server table), and `README.md` (Setup: one line pointing to the Linux section)

- [ ] **Step 1: Write the `docs/setup.md` Linux section.** It covers:
  - The Bonezegei deb (`bonezegei --version` shows 1.3.3) and `bzg install`.
  - The cloudflared binary.
  - A **separate dev GitHub OAuth app** with the callback `http://localhost:8001/github-callback`.
  - Adding `http://localhost:8001/google-callback` to the Google client.
  - `npm run local:linux` and `npm run online:linux`.
  - Why there's no local HTTPS on Linux: no `enableTLS`, and port 443 needs root.
- [ ] **Step 2: Add troubleshooting rows** for `Run bzg install first.`, `cloudflared isn't installed or isn't on PATH.`, and the 30-second timeout on Linux.
- [ ] **Step 3: Run** `npm test`. Expected: pass.
- [ ] **Step 4: Commit** with the subject `docs: document running Jmeet on Linux`.
- [ ] **Step 5: Ask the user before pushing**, then `git push -u origin chore/linux-run-script` and `gh pr create --body-file`, using the CLAUDE.md sections. Post an inline review if the diff is over about 100 lines.

---

# PR 2: `feat/separate-screen-tile` (branch from `main` after PR 1 merges, or from PR 1's branch if it's still open; say which in the PR)

### Task 4: channel helpers in `jmeet-core.js`

**Files:**
- Modify: `public/jmeet-core.js` (new `SIGNAL CHANNELS` section, and export both functions in `api`)
- Test: `scripts/jmeet-core.test.js`

**Interfaces:**
- Produces:
  - `CHANNEL`, a frozen object: `{ CAMERA: "camera", SCREEN: "screen", SCREEN_REPLY: "screen-reply" }`.
  - `signalChannel(data) -> "camera" | "screen" | "screen-reply" | null` returns `"camera"` when `data.channel` is `undefined`, the tag when it is `"screen"` or `"screen-reply"`, and `null` for any other value, including a non-object `data`.
  - `withChannel(data, channel) -> object` returns a shallow copy with `channel` set. It returns `data` unchanged when `channel === CHANNEL.CAMERA`, so camera signals keep exactly today's shape.

- [ ] **Step 1: Write failing tests.**
  - `signalChannel reads untagged data as camera`: `signalChannel({ type: "offer" })` returns `"camera"`.
  - `signalChannel reads screen tags`: `{ channel: "screen" }` returns `"screen"`, and `{ channel: "screen-reply" }` returns `"screen-reply"`.
  - `signalChannel rejects unknown tags`: `{ channel: "x" }`, `null` and `"str"` all return `null`.
  - `withChannel tags screen data without mutating`: the input `{ type: "stop" }` gives `{ type: "stop", channel: "screen" }`, and the input object is unchanged.
  - `withChannel keeps camera data as is`: the result is `===` the input.
  - `chunked screen signals keep their tag`: `collectChunk` over `splitSignal(withChannel(big, "screen"), "c1", 3000)` returns an object whose `signalChannel` is `"screen"`.
- [ ] **Step 2: Run** `npm test`. Expected: the new tests FAIL (`signalChannel is not a function`).
- [ ] **Step 3: Implement both functions and add them to `api`.**
- [ ] **Step 4: Run** `npm test`. Expected: all pass.
- [ ] **Step 5: Commit** with the subject `feat: add signal channel helpers for screen sharing`.

### Task 5: screen tile, local preview, fullscreen

**Files:**
- Modify: `public/index.html`: VIDEO TILES (`createTile`), CONTROLS (`renderControls`, `outgoingTrack`, `sendMediaState`), `toggleMedia`, `toggleShare`/`stopShare`, `cleanup`, `ICONS`
- Modify: `public/style.css`: `.tile.screen` rules near line 361, plus a new `.fullscreen-btn`

**Interfaces:**
- Produces:
  - `createScreenTile(user, afterTile) -> { tile, video }` builds a `<figure class="tile screen">` holding a `<video autoplay playsinline muted>`, a label reading `` `${user.name} is presenting` ``, and a fullscreen button.
    - The tile is inserted with `afterTile.after(tile)`, followed by `layoutGrid()`.
    - Double-clicking the tile calls `toggleFullscreen(tile, video)`.
  - `removeScreenTile(tile) -> void` exits fullscreen if `document.fullscreenElement === tile`, removes the tile, then calls `layoutGrid()`.
  - `toggleFullscreen(tile, video) -> void` does one of three things:
    - exits fullscreen if `document.fullscreenElement === tile`;
    - otherwise calls `tile.requestFullscreen()`;
    - otherwise falls back to `video.webkitEnterFullscreen?.()`.
  - The module-level `let localScreenTile = null;` holds the presenter's own preview.
  - `ICONS.fullscreen` and `ICONS.exitFullscreen` are 24×24 SVG paths in the existing icon style. The button's `aria-label` and `title` read "Full screen" or "Exit full screen", and follow `fullscreenchange`.

- [ ] **Step 1: Make the camera path camera-only.**
  - `outgoingTrack("video")` never returns `screenTrack`.
  - `sendMediaState` sends `video: enabled.video && hasTrack("video") ? 1 : 0`.
  - `renderControls` calls `setTileMedia(localTile, ..., enabled.video && hasTrack("video"))` and drops the `localTile.classList.toggle("screen", ...)` line.
  - `toggleMedia` drops the `!(kind === "video" && screenTrack)` guard.
  - Delete `replaceOutgoingVideo`.
- [ ] **Step 2: Rework `toggleShare` and `stopShare`.**
  - `toggleShare`:
    - Set `screenTrack.contentHint = "detail"`.
    - Create the preview with `localScreenTile = createScreenTile(selfUser, localTile)`, then set `.video.srcObject = new MediaStream([screenTrack])`.
    - Remove `localVideo.srcObject = ...`.
  - `stopShare` stops the track, then `removeScreenTile(localScreenTile.tile)` and `localScreenTile = null`.
  - `cleanup` calls `stopShare()` logic synchronously: stop the track and remove the preview.
  - The peer connections come in Task 6.
- [ ] **Step 3: Add the CSS.**
  - `.tile.screen video` keeps `object-fit: contain` with no mirror.
  - `.fullscreen-btn` sits top right inside the tile and shows on hover or focus. It is always visible on `(hover: none)`.
  - `.tile.screen:fullscreen` sets `border-radius: 0` with a black background.
- [ ] **Step 4: Run** `npm test`. Expected: pass, and the syntax check covers the inline script.
- [ ] **Step 5: Manual checks**, using `npm run local:linux` in one window:

| # | Check | Expected |
|---|---|---|
| M1 | Join with the camera on, then Present | The camera tile still shows the camera live, and a new "<you> is presenting" tile appears right after it with the screen |
| M2 | Click fullscreen on the screen tile, then press Esc, then double-click it | Enters and exits fullscreen, and the button label flips |
| M3 | Enter fullscreen on the screen tile, then use the browser's "Stop sharing" | Fullscreen exits, the tile is gone, and the camera tile is unchanged |

- [ ] **Step 6: Commit** with the subject `feat: show your screen in its own tile with fullscreen`.

### Task 6: screen peer connections

**Files:**
- Modify: `public/index.html`: PARTICIPANTS AND PEERS (`addParticipant`, `removeParticipant`), `handleMessage`, `toggleShare`/`stopShare`, `cleanup`; add a new `SCREEN SHARING CONNECTIONS` section after `handleSignal`

**Interfaces:**
- Consumes:
  - `Core.CHANNEL`, `Core.signalChannel` and `Core.withChannel` from Task 4.
  - `createScreenTile` and `removeScreenTile` from Task 5.
  - The existing `sendSignal(id, data)` and `iceServers`.
- Produces:
  - Two new fields on each participant record, both `null` until used:
    - `screenOut: { peer, candidates }` for the connection this client sends its screen over.
    - `screenIn: { peer, candidates, tile, video }` for the connection it receives that participant's screen over.
  - `openScreenOut(participant) -> Promise<void>`:
    - Creates an `RTCPeerConnection({ iceServers })` with `addTransceiver(screenTrack, { direction: "sendonly" })`.
    - `onicecandidate` sends `withChannel({type:"candidate", candidate}, SCREEN)`.
    - Creates and sets the offer, then sends `withChannel({type:"offer", description}, SCREEN)`.
    - Applies the same `generation` and `participant.screenOut.peer === current` staleness checks as the camera path.
  - `closeScreenOut(participant, notify: boolean) -> void`:
    - When `notify` is true and the socket is open, sends `withChannel({type:"stop"}, SCREEN)`.
    - Closes the peer connection and sets `screenOut = null`.
  - `closeScreenIn(participant) -> void` closes the peer connection, calls `removeScreenTile(screenIn.tile)` and sets `screenIn = null`.
  - `handleScreenSignal(participant, data, channel, myGeneration) -> Promise<void>` handles two channels:
    - **`SCREEN` (this client is the viewer):**
      - `offer`: close any existing `screenIn`, then create a connection with a `recvonly` transceiver.
      - `ontrack`: create the tile with `createScreenTile(participant.user, participant.tile)`, then set `video.srcObject = new MediaStream([event.track])` and call `playRemote(video)`.
      - `onconnectionstatechange`: `failed` or `closed` calls `closeScreenIn`.
      - Then `setRemoteDescription`, drain the queued candidates, `createAnswer` and send it tagged `SCREEN_REPLY`.
      - `candidate`: add it, or queue it until a remote description exists.
      - `stop`: `closeScreenIn`.
    - **`SCREEN_REPLY` (this client is the presenter):** `answer` sets the remote description on `screenOut` and drains the queued candidates; `candidate` adds it or queues it.

- [ ] **Step 1: Route signals by channel.**
  - In `handleMessage`, after chunk reassembly, compute `const channel = Core.signalChannel(data)`.
  - If it is `null`, return.
  - If it is `CAMERA`, call `handleSignal` (unchanged).
  - Otherwise, call `handleScreenSignal`.
- [ ] **Step 2: Implement the four functions** in the new section.
- [ ] **Step 3: Wire the lifecycle.**
  - After `toggleShare` creates the preview, call `openScreenOut` for every participant in `participants`, whatever state its camera connection is in.
  - On `joined`, if `screenTrack` is set, also call `openScreenOut(participant)`.
  - `stopShare` calls `closeScreenOut(p, true)` for every participant.
  - `removeParticipant` calls `closeScreenOut(p, false)` and `closeScreenIn(p)` before removing the tile.
  - `cleanup` closes all of them through `removeParticipant`, as it does today.
  - `addParticipant` initialises `screenOut: null, screenIn: null`.
- [ ] **Step 4: Run** `npm test`. Expected: pass.
- [ ] **Step 5: Manual checks**, with three windows: Google, GitHub, and a second browser profile.

| # | Check | Expected |
|---|---|---|
| M4 | A presents; in window B, A's camera tile is live next to "A is presenting". A toggles the camera off and on | B sees A's camera tile switch to the avatar and back, and the screen keeps playing |
| M5 | A presents, then C joins | C sees A's screen tile |
| M6 | A stops with the Present button | The tile is gone in B and C |
| M7 | A presents and closes the tab | The tile is gone in B and C, and A's camera tile is gone too |
| M8 | A and B both present; then A clicks Leave and rejoins | Two screen tiles while both present. After the rejoin, A has no stale preview, and B's screen reaches A again |
| M9 | Run rows 5-11 of `docs/testing.md` | Unchanged behaviour |

- [ ] **Step 6: Commit** with the subject `feat: send screen shares over their own peer connection`.

### Task 7: docs, review and PR 2

**Files:**
- Modify:
  - `docs/architecture.md`: the Messages table and a "Screen sharing" subsection with the channel table and lifecycle copied from the spec.
  - `docs/testing.md`: turn M1-M8 into checklist rows, replacing row 10.
  - `README.md`: in UI Redesign, the Control bar paragraph says "Present adds your screen as its own tile next to your camera; viewers can make it full screen."
  - Screenshots go in `docs/images/` if the user takes them.

- [ ] **Step 1: Update the docs.** Run `npm test`. Expected: pass.
- [ ] **Step 2: Check** `git diff main -- app.bzg`. Expected: empty.
- [ ] **Step 3: Run the `spec-reviewer` subagent** on the branch diff against the spec and this plan, and fix any blocking gaps.
- [ ] **Step 4: Commit** with the subject `docs: describe separate screen-share tiles`.
- [ ] **Step 5: Ask the user before pushing**, then push and run `gh pr create --body-file` with the CLAUDE.md sections, including the screenshots from M1, M2 and M4. Post an inline review, since the diff is over about 100 lines.
