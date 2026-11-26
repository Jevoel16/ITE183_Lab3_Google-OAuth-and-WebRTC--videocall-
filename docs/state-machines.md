# State machines

Each machine has one status field and one transition function. Nothing else changes the status. Both live in [`public/jmeet-core.js`](../public/jmeet-core.js) and are tested in [`scripts/jmeet-core.test.js`](../scripts/jmeet-core.test.js).

## Sign-in

Who is using the page, as told by `GET /api/me` (the `bsl_session` cookie that `app.bzg` sets after Google or GitHub sign-in). Owner: `authTransition(state, event)`, used by `setAuth()` in `public/index.html`.

States: `{ status: "checking" }`, `{ status: "signedIn", user }`, `{ status: "signedOut" }` or `{ status: "failed" }`. `user` is `{ name, picture }` from `profileToUser()` and only exists in `signedIn`.

| State | Event | Next state |
|---|---|---|
| `checking` | `ok` (with a user) | `signedIn` |
| `checking` | `unauthorized` (401) | `signedOut` |
| `checking` | `error` (network or 5xx) | `failed` |
| `signedIn` | `ok` (with a user) | `signedIn` (profile refreshed) |
| `signedIn` | `unauthorized` | `signedOut` |
| `signedIn` | `logout` | `signedOut` |
| `failed` | `retry` | `checking` |
| `signedOut` | (none) | |

- The page checks once on load, then every 60 s while signed in. A failed background check sends no event, so a network blip doesn't end the call.
- Signing in leaves the page (`/login/google` or `/login/github`) and comes back to `checking`, so `signedOut` needs no outgoing event.
- Each state has its own view: `#session-status`, `#app`, `#login`, and the `#error` banner with a Try again button.
- Any other pair throws, for example `signedOut` + `logout`.

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

- `join` fires on the Join call button, before the camera prompt.
- `connected` fires when `app.bzg` answers our `join` with `{kind: "self"}` over `/signal`.
- `lost` fires when the socket closes while `inCall` (`lostConnection()`). The camera stays on and the page retries with `reconnectDelay()`.
- `end` fires on Leave call, Log out, an expired session, a socket that closes while `joining`, a signaling error, or the sixth failed reconnect (`cleanup()`).
- Chat input and the Present button only work in `inCall`. Join shows in `idle`, Leave in the other three. The room code can only be edited in `idle`.
- Any other pair throws, for example `idle` + `end`.
