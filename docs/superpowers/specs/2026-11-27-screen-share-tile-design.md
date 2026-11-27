# Design: separate screen-share tile, and running Jmeet on Linux

Date: 2026-11-27. Status: draft, awaiting approval.

## Intent

Today, Present (`toggleShare()` in `public/index.html`) calls `replaceTrack(screenTrack)` on the
single video sender of each peer connection, so the presenter's screen **replaces** their camera
in their own tile. The user wants the screen in **its own tile**, so that:

- the presenter's camera stays visible next to it, and
- viewers can make the screen tile fullscreen.

To build and confirm this, the app must run on this Linux machine (Ubuntu distrobox on NixOS).
The existing launchers are PowerShell (`scripts/online.ps1`, `scripts/local.ps1`) and Windows-only.

## Work split (two PRs, each mergeable alone)

| # | Branch | Scope |
|---|---|---|
| 1 | `chore/linux-run-script` | Bash launcher with `local` and `online` modes, npm scripts, `docs/setup.md` section |
| 2 | `feat/separate-screen-tile` | Screen share as its own tile over a second peer connection, fullscreen button, docs, tests |

PR 1 lands first, because PR 2 is verified with it.

---

## PR 1: Linux launcher

### Facts found (verified on this machine)

- Native Linux Bonezegei is installed: `/usr/bin/bonezegei` and `/usr/bin/bzg`, **v1.3.3** (dpkg package
  `bonezegei`). The README targets v1.3.4 on Windows.
- The Linux `http.so` from Lab 2 exports `oauth*`, `getCookie`, `getHeader`, `addHeader`, `redirect`,
  `client_requestGET` and WebSocket send/close, but **not `enableTLS`**.
- Tunnel mode (`useTunnel = 1`) never calls `enableTLS`; it serves plain HTTP on `tunnelPort` (8001).

### Unverified (checked during implementation)

- Whether `bzg install` on Linux fetches an `http` package exposing `requestGET`, `close`, `send` under
  the names `app.bzg` uses. If not, PR 1 stops and reports; `app.bzg` is not rewritten to fit.
- That browsers accept the `Secure` session cookie on `http://localhost:8001` (Chrome and Firefox treat
  `localhost` as a secure context, so they should).

### Design

`scripts/run.sh` (bash, `set -euo pipefail`), invoked as `scripts/run.sh local|online`:

- **Guard:** exits with "Skipping: start this with npm run ..." when `npm_lifecycle_event` is unset,
  mirroring the `.ps1` guard, because `bzg run` starts every `package.json` script at once.
- **Shared:** checks `config.bzg` exists and `bonezegei` is on `PATH`; a `set_config_value name value`
  function replaces the `var name = ...;` line or appends it, like `Set-ConfigValue` in the `.ps1` files.
  Values are passed as arguments, never built into a shell string.
- **`local` mode:** sets `useTunnel = 1`, `tunnelPort = 8001`, `baseUrl = "http://localhost:8001"` and
  the two redirect URIs under it, prints the callbacks to register, then runs `bonezegei app.bzg`.
  Local HTTPS on 443 is not offered on Linux: it needs `enableTLS` and root for port 443.
- **`online` mode:** checks `cloudflared`, starts `cloudflared tunnel --config /dev/null --url
  http://localhost:8001` in the background with stderr to a log in `${TMPDIR:-/tmp}`, waits up to 30 s
  for the `https://*.trycloudflare.com` address, writes it into `config.bzg`, prints the share address
  and callbacks, runs `bonezegei app.bzg`, and kills cloudflared on exit (`trap ... EXIT INT TERM`).
- **npm scripts:** `local:linux` and `online:linux` added beside the existing `local` / `online`.
- **Docs:** a "Linux" section in `docs/setup.md` (Bonezegei deb, `bzg install`, cloudflared install,
  OAuth callbacks for `http://localhost:8001`), troubleshooting rows for the new failure messages.

The script must also run on the NixOS host (bash exists there), so it uses only POSIX tools plus bash.

### Acceptance

- `npm run local:linux` prints the localhost address and the server answers `curl -s -o /dev/null
  -w '%{http_code}' http://localhost:8001/` with `200`.
- `npm run online:linux` prints a `trycloudflare.com` address that returns 200, and Ctrl+C leaves no
  `cloudflared` process (`pgrep cloudflared` empty).
- `bzg run` with the new scripts prints the Skipping line and does not start them.
- `shellcheck scripts/run.sh` is clean; `npm test` still passes.

---

## PR 2: separate screen tile

### Approaches considered

| Approach | Trade-off | Picked |
|---|---|---|
| Spare (second) video transceiver on the existing connection, filled with `replaceTrack` | Least code, no renegotiation; an idle m-line on every connection | No |
| Renegotiate the existing connection (`addTrack` + new offer/answer, "perfect negotiation") | Standard general solution; rewrites `createPeer`/`handleSignal`, glare risk | No |
| **Second `RTCPeerConnection` per presenter-viewer pair, only for the screen** | Camera connection untouched; more ICE and signaling, more code | **Yes (user's choice)** |

### Goals

- While someone presents, every participant (presenter included) sees a **separate screen tile**
  labelled "<name> is presenting", next to that person's camera tile, which keeps showing camera or
  avatar exactly as today.
- Each screen tile has a **fullscreen button** (Fullscreen API on the tile; double-click does the same).
  Esc or the button again exits.
- Someone who joins mid-presentation receives the screen.
- Stopping (button or the browser's own "Stop sharing") removes the tile everywhere.

### Non-goals

- Screen audio (capture stays `getDisplayMedia({ video: true })`).
- Pin / spotlight layouts, recording, annotation.
- TURN support (still STUN only).

### Anti-goals (a failure even if it "works")

- Any regression of camera/mic calls, mute badges, active-speaker ring or chat.
- Changing the camera connection's offer/answer flow.
- A server change being required for this feature.

### Signaling (no server change)

`app.bzg` relays `{kind: "signal", target, data}` and only requires `data` to be an object, so screen
signals reuse it with a channel tag inside `data`:

| `data.channel` | Sent by | Handled by receiver as | Payloads |
|---|---|---|---|
| absent | either | camera connection (unchanged) | offer, answer, candidate |
| `"screen"` | presenter | its **incoming** screen connection from that presenter | offer, candidate, `{type: "stop"}` |
| `"screen-reply"` | viewer | its **outgoing** screen connection to that viewer | answer, candidate |

Two tags are needed because two people can present at once: A→B and B→A are separate connections,
and an ICE candidate must reach the right one. Chunking (`splitSignal`/`collectChunk`) wraps the whole
`data` object, so the tag survives reassembly.

### Connection lifecycle

- **Presenter is always the offerer** of a screen connection, so there is no glare.
- **Start sharing:** for each participant with a camera connection, create an outgoing screen
  connection with one `sendonly` video transceiver carrying `screenTrack`, offer it tagged `screen`.
- **Viewer gets a `screen` offer:** create the incoming connection (`recvonly`), answer tagged
  `screen-reply`, create the screen tile on `ontrack`. Candidates arriving before the remote
  description are queued, as the camera path does.
- **Newcomer while presenting:** on `joined`, the presenter also opens a screen connection to the
  newcomer (after adding the participant).
- **Stop sharing:** send `{channel: "screen", type: "stop"}` to every viewer, close all outgoing screen
  connections, stop the track, remove the local screen tile. The viewer closes the incoming connection
  and removes the tile on `stop`, on that connection reaching `failed`/`closed`, or on `left`.
- **Leave / cleanup / participant left:** closes every screen connection involving them and removes
  their screen tiles.

### State and UI

- Each participant record gains `screenIn` (incoming connection, tile, queued candidates) and
  `screenOut` (outgoing connection, queued candidates).
- The local presenter sees their own screen as a tile too (preview, muted, `object-fit: contain`).
  `localVideo` always shows the camera stream; the current swap of `localVideo.srcObject` is removed.
- The `media` message's `video` flag goes back to meaning camera only; the local tile's `.screen` class
  goes away and moves to screen tiles.
- Screen tiles are inserted directly after their presenter's camera tile; `layoutGrid()` counts all
  tiles (up to 16), so `gridColumns` stays 3 above 4 tiles.
- Screen tiles get no speaker meter and no mic badge.
- The fullscreen button uses `tile.requestFullscreen()`, with `video.webkitEnterFullscreen()` as the
  fallback when `requestFullscreen` is missing (iOS Safari).

### Pure logic in `jmeet-core.js` (unit-tested)

- `signalChannel(data)` → `"camera" | "screen" | "screen-reply"` (unknown tags treated as invalid, not
  camera).
- Any other routing or tile-ordering decision that can be written without the DOM.

### Docs

`docs/architecture.md` (signal channels, lifecycle), `docs/state-machines.md` if a screen state machine
is added, `docs/testing.md` checklist rows, README "UI Redesign" paragraph.

### Acceptance (verified with PR 1's launcher, two browser windows: Google and GitHub accounts)

| Criterion | Check |
|---|---|
| Presenting shows a separate tile, camera tile still live, in both windows | Screenshot of both windows |
| Fullscreen button and double-click enter/exit fullscreen on the screen tile | Manual, screenshot |
| Third window joining mid-presentation sees the screen | Manual |
| Browser "Stop sharing" and Present button both remove the tile everywhere | Manual |
| Both people presenting at once gives two screen tiles | Manual |
| Leaving while presenting removes the tile for others | Manual |
| Camera/mic toggles, mute badges, speaker ring, chat unchanged | Manual checklist rows 5-11 |
| `signalChannel` and other new pure helpers covered | `npm test` |
| No change to `app.bzg` | `git diff main -- app.bzg` empty |

## Settled during review

- **Screen connections don't depend on the camera connection.** "Start sharing" opens a screen
  connection to every id in `participants`, whatever state its camera connection is in. Anyone who
  is in the call can present, even with no camera or mic. *(Designer's call.)*
- **Ordering for late joiners is already safe.** `onConnect` sends `existing{presenter}` to the
  newcomer before it sends `joined{newcomer}` to the presenter. The presenter only offers after it
  gets `joined`, and the client handles messages one at a time through the `messages` promise
  chain. So the newcomer always knows the presenter before a `screen` offer arrives. A `screen`
  signal from an unknown id is dropped, the same as on the camera path.
- **Limits.** `maxParticipants` is 8 (`app.bzg:10`), so the grid tops out at 16 tiles: 8 camera
  tiles plus up to 8 screen tiles, counting the presenter's own preview. Big SDPs are already
  covered by chunking. There's no tile cap.
- **Quality.** The screen track gets `contentHint = "detail"`. There's no `maxBitrate` cap.
  *(Designer's call.)*
- **Failure handling.** Only `failed` and `closed` remove a screen tile. `disconnected` is left to
  recover on its own. There's no ICE restart, which matches the camera path.
  *(Designer's call.)*
- **Local OAuth (user's decision).** The user creates a separate dev GitHub OAuth app with callback
  `http://localhost:8001/github-callback`, and adds `http://localhost:8001/google-callback` to the
  existing Google client. The dev keys go only in the user's own `config.bzg`. `docs/setup.md`
  documents this. The user does the manual browser checks.
- **Blocked Linux build (user's decision).** If `bzg install` on Linux lacks a function `app.bzg`
  calls, PR 1 stops and reports which function is missing. `app.bzg` is not changed to fit, and
  Wine is not tried without asking.
- **Docs targets exist.** `docs/state-machines.md`, `architecture.md` and `testing.md` are all in
  the repo.

## Left to the builder

Exact function names and splits, CSS for the fullscreen button and presenting label, whether to add a
small screen-connection state machine, and how to name the npm scripts if `local:linux` collides with
anything.
