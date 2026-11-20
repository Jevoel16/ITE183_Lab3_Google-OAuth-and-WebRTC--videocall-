# State machines

Each machine has one status field and one transition function. Nothing else changes the status. Both live in [`public/jmeet-core.js`](../public/jmeet-core.js) and are tested in [`scripts/jmeet-core.test.js`](../scripts/jmeet-core.test.js).

## Connection

The WebSocket link to `app.bzg`. Owner: `connTransition(state, event)`, used by `setConn()` in `public/index.html`.

| State | Event | Next state |
|---|---|---|
| `connecting` | `opened` | `open` |
| `connecting` | `lost` | `reconnecting` |
| `connecting` | `close` | `closed` |
| `open` | `lost` | `reconnecting` |
| `open` | `close` | `closed` |
| `reconnecting` | `opened` | `open` |
| `reconnecting` | `close` | `closed` |
| `closed` | (none) | |

- `lost` fires when the socket closes or no `__pong__` arrives for 60 s. While `reconnecting`, the page retries after `reconnectDelay(attempt)`: 1, 2, 4, 8, then every 15 s.
- `close` fires only when the user clicks Leave.
- **Join now** is enabled only in `open`, with a signed-in user and a client ID from the server.
- Any other pair throws, for example `closed` + `opened`.

## Sign-in

Who is using the page. Owner: `authTransition(state, event)`, used by `setUser()` in `public/index.html`.

States: `{ status: "signedOut" }` or `{ status: "signedIn", user }`, where `user` is `{ provider: "google" | "github", name, email, picture, exp }`. The user only exists in `signedIn`.

| State | Event | Next state |
|---|---|---|
| `signedOut` | `signIn` (valid user) | `signedIn` |
| `signedIn` | `signOut` | `signedOut` |

- `signIn` with an unknown provider, an empty name or a past `exp` throws.
- `signIn` while already signed in throws, so switching accounts signs out first.
- A user restored from `sessionStorage` must pass `isValidUser()`, or the page stays signed out.
