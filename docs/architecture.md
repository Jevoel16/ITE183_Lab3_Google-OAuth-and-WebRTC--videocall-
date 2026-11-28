# Architecture

One process: `app.bzg` on Bonezegei, an HTTP and WebSocket server built from the class starter. By default it listens on plain HTTP at `localhost:8002` and a Cloudflare quick tunnel (`cloudflared`) gives browsers an HTTPS `trycloudflare.com` address. cloudflared connects to `scripts/tunnel-proxy.js` on 8001, not to the app directly: cloudflared spells the WebSocket header `Sec-Websocket-Key`, Bonezegei's `http.dll` only accepts `Sec-WebSocket-Key`, and the proxy fixes the casing before the upgrade, then passes the bytes through untouched. Without it, pages and sign-in load but calls never connect; with `useTunnel = 0` it serves HTTPS on port 443 itself using `cert/`. Browsers send audio and video to each other directly over WebRTC; the server only signs people in and relays signaling and chat.

## Sign-in

1. The page asks `GET /api/me`. Without a valid `bsl_session` cookie it gets 401 and shows `#login`.
2. Continue with Google or GitHub goes to `/login/google` or `/login/github`. `server.oauthStart()` stores a random `state` and redirects to the provider.
3. The provider sends the user back to `/google-callback` or `/github-callback` with a `code`. `finishLogin()` checks the `state`, swaps the code for an access token with the client secret, fetches the profile and creates a session.
4. The server sets `bsl_session` (`HttpOnly; Secure; SameSite=Lax`, one hour) and redirects to `/`. Now `/api/me` returns the profile JSON.

The client secret and access token never reach the browser. `profileToUser()` in `jmeet-core.js` reads `name`/`picture` (Google) or `login`/`avatar_url` (GitHub), and only shows avatars from `*.googleusercontent.com` and `avatars.githubusercontent.com`.

`POST /logout` checks that `Origin` equals `baseUrl`, closes that session's sockets and clears the cookie.

## Routes

| Method | Path | Response |
|---|---|---|
| GET | `/` | `public/index.html` |
| GET | `/style.css`, `/jmeet-core.js` | Static files from `public/` |
| GET | `/login/google`, `/login/github` | 302 to the provider |
| GET | `/google-callback`, `/github-callback` | Session cookie and 302 to `/`, or a plain-text error (400, 502, 503) |
| GET | `/api/me` | Profile JSON, or 401 |
| POST | `/logout` | 200, or 403 for a foreign `Origin` |
| GET | anything else | `public/404.html` |
| WS | `/signal` | Signaling and chat, for signed-in users with the right `Origin` |

## Messages on /signal

Each call is a room with a Meet-style code (`abc-defg-hij`) kept in the URL hash, so an invite link is just the page address. A socket joins nothing until it sends `join`; after that, signals, chat, mic/camera state and departures only go to the same room. The server holds 8 sockets in total, across all rooms. All messages are JSON.

| From | Message | Meaning |
|---|---|---|
| Client | `{kind: "join", room, key}` | First message on a new socket. `app.bzg` checks the code (`isRoomCode()`) and ignores a second join. `key` is the tab's random id; any older slot with the same key is dropped (and announced as `left`), so a half-open socket can't leave a second tile |
| Client | `{kind: "ping"}` | Heartbeat every 25 s. The server ignores it; it only keeps Cloudflare from closing an idle socket (about 100 s) |
| Server | `{kind: "self", id, room, user}` | Your participant id, room and profile |
| Server | `{kind: "existing", id, user}` | Someone already in the room. The newcomer sends them an offer |
| Server | `{kind: "joined", id, user}` | Someone new in the room. Wait for their offer |
| Server | `{kind: "left", id}` | Remove their tile |
| Client | `{kind: "signal", target, data}` | Offer, answer or ICE candidate for one participant in the same room, or a screen-share `stop`. `data.channel` picks the connection (see [Screen sharing](#screen-sharing)). Arrives as `{kind: "signal", from, data}` |
| Client | `{kind: "chat", text}` | Up to 1000 bytes. Sent to the room, sender included, as `{kind: "chat", from, text}` |
| Client | `{kind: "media", audio, video}` | Mic and camera state as `1`/`0`, sent to the rest of the room with `from` |

A chat message from someone else plays a short ping when the tab is in the background or the chat panel is closed (`shouldPing()` in `jmeet-core.js`). The sound is synthesized with Web Audio on the call's `AudioContext`, so there's no audio file and no server route.

When the socket drops mid-call, the page keeps the camera and the chat, removes the peers, and opens a new socket after 1, 2, 4, 8, 15 and 15 s (`reconnectDelay()`). The new socket sends `join` for the same room and the others re-connect to it as a newcomer. After the sixth failed try it gives up and shows "Lost the connection to the call server".

Signing in leaves the page, and the provider sends you back to `/` without the hash, so the room code is also kept in `sessionStorage` for that tab. After sign-in the page shows the home screen with that code filled in; it never joins on its own.

The session lasts an hour. The page checks it every 60 s; a 401 during a call only shows a banner (the call's socket was signed in when it opened), and the login page comes up once the call ends.

A `signal` whose JSON is longer than 3000 characters is split into `{type: "chunk", cid, i, n, part}` pieces by `splitSignal()` and rebuilt by `collectChunk()`, both in `jmeet-core.js`.

## Screen sharing

A presenter sends the screen over a **second `RTCPeerConnection`** to each viewer, next to the camera connection, so the camera tile keeps going and the screen gets a tile of its own. The camera connection's offer and answer flow does not change, and the server does not either: screen signals ride the same `signal` relay with a tag in `data.channel`, read by `signalChannel()` in `jmeet-core.js`.

| `data.channel` | Sent by | Handled by the receiver as | Payloads |
|---|---|---|---|
| absent | either | camera connection (unchanged) | offer, answer, candidate |
| `"screen"` | presenter | its **incoming** screen connection from that presenter | offer, candidate, `{type: "stop"}` |
| `"screen-reply"` | viewer | its **outgoing** screen connection to that viewer | answer, candidate |

Two tags are needed because two people can present at once: A→B and B→A are separate connections, and each ICE candidate must reach the right one. Any other tag is dropped. Chunking wraps the whole `data` object, so the tag survives reassembly.

Lifecycle:

- **The presenter always offers** a screen connection, so there is no glare. It has one `sendonly` video transceiver carrying the screen track (`contentHint = "detail"`).
- **Start presenting:** open a screen connection to every participant, whatever state their camera connection is in, and show a local preview tile.
- **Viewer gets a `screen` offer:** replace any older incoming screen connection, answer as `recvonly` tagged `screen-reply`, and create the "<name> is presenting" tile right after the presenter's camera tile on `ontrack`. Candidates that arrive before the remote description are queued, as on the camera path.
- **Newcomer while presenting:** on `joined`, the presenter also opens a screen connection to the newcomer. The server sends `existing` to the newcomer before it sends `joined` to the presenter, so the newcomer already knows the presenter when the offer arrives.
- **Presenter reconnects:** a dropped socket removes every peer, and with them the screen connections, but capture and the local preview keep going. After the new socket joins, the presenter is the newcomer and gets `existing` for each person, so it reopens a screen connection there too.
- **Stop presenting** (Present button or the browser's "Stop sharing"): send `{channel: "screen", type: "stop"}` to every viewer, close all outgoing screen connections, stop the track and remove the preview.
- **The viewer removes the tile** on `stop`, on the presenter's `left`, or when the connection reaches `failed` or `closed`. `disconnected` is left to recover, and there is no ICE restart, as on the camera path.
- **Leave or cleanup** closes every screen connection in both directions. A screen tile that is full screen leaves full screen before it is removed.

A failing screen signal is logged and never ends the call. Screen tiles have no speaker ring or mic badge. Each one has a fullscreen button, or double-click, that calls `requestFullscreen()` on the tile, with `video.webkitEnterFullscreen()` as the iOS fallback.

## Files

```
app.bzg              Server (starter + static files + media relay)
config.example.bzg   Key template; the real config.bzg is gitignored
public/              index.html, style.css, jmeet-core.js (tested logic), 404.html
scripts/             Syntax check and node:test tests (CI only)
cert/                Your certificate and key for local HTTPS (gitignored)
lib/                 http package from bzg install (gitignored)
```
