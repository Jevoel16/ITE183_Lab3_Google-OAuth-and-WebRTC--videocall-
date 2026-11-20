# Architecture

Every request goes through the gateway on 8001. It forwards pages, files and the WebSocket to `app.bzg` on 8000 and handles `/auth/github` itself. Audio and video go peer to peer between browsers; the server only relays signaling and chat, and only within a room.

## Google sign-in

1. `public/index.html` loads Google Identity Services and renders the Sign in with Google button with the client ID from `/config.js`.
2. After the user picks an account, Google returns an ID token: a signed JWT with the user's `name`, `email` and `picture`.
3. The browser decodes it and checks that `aud` equals the client ID, `iss` is `accounts.google.com`, `exp` hasn't passed and `email_verified` is true.
4. The profile stays in `sessionStorage` until the token expires (about 1 hour). Only the name and photo are shared with other participants; the email stays in your browser.

## GitHub sign-in

GitHub's authorization-code flow needs the client secret, so its routes live in `scripts/github-auth.js` and run inside the gateway.

1. Sign in with GitHub opens `/auth/github?room=<code>` on the address the page is on. The gateway reads that address from the `Host` header (only `localhost`, `127.0.0.1` or `*.trycloudflare.com`), saves it with a random `state` for 10 minutes and redirects to GitHub with the callback on the same address.
2. GitHub sends the user back to `/auth/github/callback` with a `code`. The gateway checks the `state`, swaps the code for a token, reads `api.github.com/user` and drops the token.
3. The gateway redirects to `<same address>/#auth=<profile>&room=<code>`. The page reads the profile (name, email, avatar, 8-hour expiry), clears the hash and keeps the room.

## Security note

The Bonezegei `http` module can't make outbound HTTPS requests, so the server can't check a Google token's signature, and it trusts whatever profile the browser presents for both providers. That's fine for a local lab but not for production. In production, a backend would verify the Google token (for example with `google-auth-library`) and issue a signed session for GitHub users before letting anyone into a call.

## Rooms and reconnecting

- Before sending `join`, the page sends `__room__:<code>`. `app.bzg` stores each client's room in an array indexed by client ID and relays chat and signaling only to that room.
- The page sends `__ping__` every 25 s and the server answers `__pong__` to that client only. With no pong for 60 s, the page treats the socket as dead.
- After a drop, the page reconnects after 1, 2, 4, 8, then every 15 s, gets a new client ID, and sends `__room__` and `join` again. The others in the room call it back.
- Signaling messages are handled one at a time. If two people offer to each other at once, the lower client ID keeps its offer and the other answers.
- Each peer gets one ICE restart before the page gives up on it.
- The connection and sign-in state machines are in [`state-machines.md`](state-machines.md).

## Server routes and events

| Event | Server action |
|---|---|
| HTTP `GET /` | Sends `public/index.html` |
| HTTP `GET /style.css` | Sends `public/style.css` |
| HTTP `GET /config.js` | Sends `public/config.js` (client ID, GitHub sign-in URL, TURN servers) |
| HTTP `GET /jmeet-core.js` | Sends `public/jmeet-core.js` (shared logic) |
| HTTP `GET` (any other path) | Sends `public/404.html` |
| `onConnect(clientId)` | Logs the connection and sends `__id__:<clientId>` to that client |
| `onData("__ping__", clientId)` | Answers `__pong__` to that client only |
| `onData("__room__:<code>", clientId)` | Puts the client in that room |
| `onData(message, clientId)` | Logs the message and relays it to everyone in the sender's room |
| `onDisconnect(clientId)` | Logs the disconnect and sends `__left__:<clientId>` to the rest of the room |

## Message protocol

| Type | Purpose |
|---|---|
| `join` | Announces a participant's name, photo and media state |
| `chat` | A chat message (name, text, timestamp) |
| `offer` / `answer` / `ice` | WebRTC signaling between two peers |
| `media` | Mic and camera on/off updates |
| `leave` | The participant left the call |
| `chunk` | Part of a message over 3,000 characters. The native `http.dll` crashes on WebSocket frames of roughly 8 KB or more |
