# Setup

How to get the keys Jmeet needs, how the two ports fit together, and how to share the app online. The README has the short version.

## Keys and config.js

Every key lives in `.env`, in one of the three blocks of `.env.example`. Keys left as `YOUR_...` are skipped.

The browser can't read `.env`, so `npm run config` writes `public/config.js` from it. `npm run dev` and `npm run share` do this on every start. Run it again after you change `.env`. It refuses to write when neither Google nor GitHub is set, so an existing `config.js` is never wiped.

The server sends `config.js` to every visitor at `/config.js`. The generated file only ever holds the Google client ID, the GitHub sign-in URL and the TURN details, so never add a secret to it by hand:

```js
window.JMEET_CONFIG = {
    googleClientId: "123456789-abc123.apps.googleusercontent.com",
    githubAuthUrl: "http://localhost:8001/auth/github",   // "" hides the GitHub button
    iceServers: [
        { urls: "turn:YOUR_TURN_HOST:3478", username: "YOUR_USERNAME", credential: "YOUR_PASSWORD" }
    ]
};
```

Without Node.js, copy `public/config.example.js` to `public/config.js` and fill it in by hand.

| File | Committed? | Purpose |
|---|---|---|
| `.env.example` | Yes | Placeholder keys in Local, Development and Production blocks |
| `.env` | No | All your keys |
| `public/config.js` | No | Written by `npm run config` from `.env` |
| `public/config.example.js` | Yes | Shape of `config.js`, for filling in by hand |

Google sign-in needs no client secret. The popup hands the browser a signed ID token, so only the client ID is used. `GOOGLE_CLIENT_SECRET` is kept for a server-side code flow, which the app doesn't use yet. Only the gateway reads `GITHUB_CLIENT_SECRET`.

## Ports

You open one port: 8001, locally and through the tunnel.

| Port | Program | Use |
|---|---|---|
| 8001 | `scripts/gateway.js` | The address you open. Serves `/auth/github` itself and forwards everything else (page, files, WebSocket) to 8000 |
| 8000 | `app.bzg` | The Bonezegei server behind the gateway |

Bonezegei can't make the HTTPS call GitHub needs, and its `http.dll` rejects the WebSocket header as cloudflared spells it (`Sec-Websocket-Key`), so the gateway sits in front and handles both.

For local use with Google sign-in only, 8000 alone is enough: run `npm start` and open `http://localhost:8000`. You need the gateway only for GitHub sign-in or the tunnel.

## Google OAuth client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. Go to APIs & Services → OAuth consent screen (Google Auth Platform → Branding / Audience):
   - User type: External
   - App name: `Jmeet`, plus your support and developer email
   - App logo (optional): [`images/oauth-logo-120.png`](images/oauth-logo-120.png) (120×120 PNG, under 1 MB). A 512×512 copy is in [`images/oauth-logo-512.png`](images/oauth-logo-512.png). A logo makes Google ask for brand verification before users outside your test list see it, so skip it if you don't need it.
   - Publishing status: leave it in Testing, and add every Google account that will sign in under Test users
3. Go to APIs & Services → Credentials → Create credentials → OAuth client ID:
   - Application type: Web application
   - Authorized JavaScript origins: `http://localhost:8001`, `http://localhost:8000`, `http://localhost`, and your tunnel address if you share the app online
   - Authorized redirect URIs: leave empty (the popup flow doesn't use one)
4. Put the Client ID in `GOOGLE_CLIENT_ID` in `.env` and run `npm run config`.

New origins can take a few minutes to start working.

## GitHub OAuth app

1. Open GitHub Settings → Developer settings → OAuth Apps → New OAuth App.
2. Homepage URL: `http://localhost:8001`. Authorization callback URL: `http://localhost:8001/auth/github/callback`.
3. Copy the Client ID, click Generate a new client secret, and put both in `.env`.
4. Restart `npm run dev`. It rewrites `config.js`, which shows the GitHub button, and the gateway picks up the keys.

The gateway sends GitHub a callback on whatever address you opened (`localhost:8001` or the `trycloudflare.com` one) and brings you back there. GitHub allows one callback URL per OAuth app, but it accepts any subdomain of the one you register. So while you share the app, change the callback URL on GitHub to `https://trycloudflare.com/auth/github/callback`; that matches every quick-tunnel address. Change it back to `http://localhost:8001/auth/github/callback` for local sign-in.

## TURN server

STUN lets two browsers find a direct path. Between very different networks (mobile data and home Wi-Fi) that path often fails, or carries audio one way only. A TURN server relays the media instead. Metered's Open Relay and Cloudflare's TURN service both have free tiers. Put the TURN URLs, username and credential in `TURN_URLS`, `TURN_USERNAME` and `TURN_CREDENTIAL`, run `npm run config`, and reload.

## Share it online

A Cloudflare quick tunnel gives the app a public `https://….trycloudflare.com` address with a valid certificate. It's free and needs no account. The app stays on your PC, so it's only online while it and the tunnel run.

```bash
npm run share
```

This starts everything `npm run dev` does plus the tunnel, and prints `Share this address: https://….trycloudflare.com`. If the app is already running, use `npm run tunnel` in a second terminal.

1. Copy the printed address. It can take up to a minute to start working.
2. Add it to the client's Authorized JavaScript origins and wait a few minutes.
3. Share it. Everyone who signs in must be a test user while the app is in Testing mode.

The address changes every run, so you add the new one to Google each time.

Notes:

- The tunnel runs `cloudflared tunnel --config NUL --url http://localhost:8001`. `--config NUL` stops cloudflared from loading `%USERPROFILE%\.cloudflared\config.yml`, whose catch-all rule would answer every quick-tunnel address with an empty 404. The "Configuration file NUL was empty" line is harmless.
- The tunnel points at the gateway, not 8000. Pointed straight at `app.bzg`, the page loads but never connects, because of the header casing above.
- Cloudflare closes a WebSocket after about 100 seconds with no traffic, so the page pings the server every 25 seconds.
- `bzg run` starts every `package.json` script at once. `dev`, `share` and `tunnel` notice they were started by `bzg` and skip themselves, so `bzg run` never opens a public tunnel.
