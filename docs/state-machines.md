# State machines

Each machine has one status field and one transition function. Nothing else changes the status. Both live in [`public/jmeet-core.js`](../public/jmeet-core.js) and are tested in [`scripts/jmeet-core.test.js`](../scripts/jmeet-core.test.js).

## Sign-in

Who is using the page, as told by `GET /api/me` (the `bsl_session` cookie that `app.bzg` sets after Google or GitHub sign-in). Owner: `authTransition(state, event)`, used by `setAuth()` in `public/index.html`.

States: `{ status: "checking" }`, `{ status: "signedIn", user }`, `{ status: "expired", user }`, `{ status: "signedOut" }` or `{ status: "failed" }`. `user` is `{ name, picture }` from `profileToUser()` and only exists in `signedIn` and `expired`.

| State | Event | Next state |
|---|---|---|
| `checking` | `ok` (with a user) | `signedIn` |
| `checking` | `unauthorized` (401) | `signedOut` |
| `checking` | `error` (network or 5xx) | `failed` |
| `signedIn` | `ok` (with a user) | `signedIn` (profile refreshed) |
| `signedIn` | `unauthorized` | `signedOut` |
| `signedIn` | `logout` | `signedOut` |
| `signedIn` | `expired` (401 during a call) | `expired` |
| `expired` | `ok` (signed in again in another tab) | `signedIn` |
| `expired` | `unauthorized` (the call ended) | `signedOut` |
| `expired` | `logout` | `signedOut` |
| `failed` | `retry` | `checking` |
| `signedOut` | (none) | |

- The page checks once on load, then every 60 s while signed in. A failed background check sends no event, so a network blip doesn't end the call.
- Signing in leaves the page (`/login/google` or `/login/github`) and comes back to `checking`, so `signedOut` needs no outgoing event.
- A 401 during a call sends `expired` instead of `unauthorized`. The call's WebSocket was signed in when it opened, so the call keeps going with a banner; `cleanup()` sends `unauthorized` once the call ends.
- Each state has its own view: `#session-status`, `#app` (also in `expired`, with the `#error` banner), `#login`, and the `#error` banner with a Try again button.
- Any other pair throws, for example `signedOut` + `logout`.

## Camera preview

Your own tile on the home screen, before joining. Owner: `previewTransition(state, event)`, used by `setPreview()` in `public/index.html`. The stream lives in the same `stream` variable the call uses.

| State | Event | Next state |
|---|---|---|
| `off` | `start` (home shown) | `starting` |
| `starting` | `ready` (got the devices) | `ready` |
| `starting` | `blocked` (permission denied or no device) | `blocked` |
| `starting`, `ready`, `blocked` | `stop` (signed out) | `off`, tracks stopped |
| `starting`, `ready`, `blocked` | `handOff` (joined) | `off`, the call keeps the stream |
| `blocked` | `start` (a toggle tries again) | `starting` |

- `renderView()` starts it whenever home is visible and stops it when the login page shows.
- A late `getUserMedia` answer after `stop` or `handOff` is dropped (`previewGeneration`).
- Mic and camera toggles inside `ready` don't change the status; they add or stop one track.
- Any other pair throws, for example `ready` + `start`.

## Call

Whether this tab is in the call. Owner: `callTransition(state, event)`, used by `setCall()` in `public/index.html`.

| State | Event | Next state |
|---|---|---|
| `idle` | `join` | `joining` |
| `joining` | `connected` | `inCall` |
| `joining` | `end` | `idle` |
| `inCall` | `lost` | `reconnecting` |
| `inCall` | `end` | `idle` |
| `reconnecting` | `connected` | `inCall` |
| `reconnecting` | `end` | `idle` |

- `join` fires on New meeting or Join on the home screen, before the camera prompt.
- `connected` fires when `app.bzg` answers our `join` with `{kind: "self"}` over `/signal`.
- `lost` fires when the socket closes while `inCall` (`lostConnection()`). The camera stays on and the page retries with `reconnectDelay()`.
- `end` fires on Leave call, Log out, a socket that closes while `joining`, a signaling error outside one peer's offer/answer, or the sixth failed reconnect (`cleanup()`). A bad signal from one peer is logged and the call goes on.
- Chat input and the Present button only work in `inCall`. Signed in, `idle` shows the home screen (`#home`, with New meeting, the room code and Join) and the other three show the call view (`#app`, with Leave). No separate view flag: `renderView()` reads both machines.
- Any other pair throws, for example `idle` + `end`.
