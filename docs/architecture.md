# Architecture

One process: `app.bzg` on Bonezegei, an HTTP and WebSocket server built from the class starter. By default it listens on plain HTTP at `localhost:8001` and a Cloudflare quick tunnel (`cloudflared`) gives browsers an HTTPS `trycloudflare.com` address; with `useTunnel = 0` it serves HTTPS on port 443 itself using `cert/`. Browsers send audio and video to each other directly over WebRTC; the server only signs people in and relays signaling and chat.

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

Everyone connected to `/signal` is in the one call (up to 8). All messages are JSON.

| From | Message | Meaning |
|---|---|---|
| Server | `{kind: "self", id, user}` | Your participant id and profile |
| Server | `{kind: "existing", id, user}` | Someone already in the call. The newcomer sends them an offer |
| Server | `{kind: "joined", id, user}` | Someone new. Wait for their offer |
| Server | `{kind: "left", id}` | Remove their tile |
| Client | `{kind: "signal", target, data}` | Offer, answer or ICE candidate for one participant. Arrives as `{kind: "signal", from, data}` |
| Client | `{kind: "chat", text}` | Up to 1000 bytes. Sent to everyone, sender included, as `{kind: "chat", from, text}` |
| Client | `{kind: "media", audio, video}` | Mic and camera state as `1`/`0`, sent to everyone else with `from` |

A `signal` whose JSON is longer than 3000 characters is split into `{type: "chunk", cid, i, n, part}` pieces by `splitSignal()` and rebuilt by `collectChunk()`, both in `jmeet-core.js`.

## Files

```
app.bzg              Server (starter + static files + media relay)
config.example.bzg   Key template; the real config.bzg is gitignored
public/              index.html, style.css, jmeet-core.js (tested logic), 404.html
scripts/             Syntax check and node:test tests (CI only)
cert/                Your certificate and key for local HTTPS (gitignored)
lib/                 http package from bzg install (gitignored)
```
