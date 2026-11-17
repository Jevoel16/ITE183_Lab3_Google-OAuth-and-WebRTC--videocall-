<a id="top"></a>

<div align="center">

<img src="screenshots/logo.svg" alt="Jmeet logo" width="96" />

# Jmeet: Google OAuth + WebRTC Video Call

**ITE183 – Web Systems and Technologies | Laboratory 3: Google OAuth and WebRTC (Video Call)**

*Sign in with Google, then join a real-time, multi-person video call on a Bonezegei WebSocket server.*

![Bonezegei](https://img.shields.io/badge/Bonezegei-1.3.3-6f42c1?style=flat)
![http module](https://img.shields.io/badge/http_module-1.0.1-0a7ea4?style=flat)
![Google Identity Services](https://img.shields.io/badge/Google_Identity_Services-gsi%2Fclient-4285f4?style=flat)
![WebRTC](https://img.shields.io/badge/WebRTC-browser_native-2ea44f?style=flat)

![Version](https://img.shields.io/badge/version-1.2.1-blue?style=flat)
![License](https://img.shields.io/badge/license-Sprucetrap_SAL_1.0-yellow?style=flat)
![Platform](https://img.shields.io/badge/platform-Windows-0078d4?style=flat)
[![CI](https://img.shields.io/github/actions/workflow/status/Jevoel16/ITE183_Lab3_Google-OAuth-and-WebRTC--videocall-/ci.yml?branch=main&label=CI&style=flat)](https://github.com/Jevoel16/ITE183_Lab3_Google-OAuth-and-WebRTC--videocall-/actions/workflows/ci.yml)

</div>

---

## Table of Contents

- [Description](#description)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [How It Works](#how-it-works)
- [Project Structure](#project-structure)
- [Scripts](#scripts)
- [Testing](#testing)
- [Troubleshooting](#troubleshooting)
- [Contributing](#contributing)
- [License](#license)
- [Author](#author)

---

## Description

Jmeet is a browser-based meeting room in the style of Google Meet. Laboratory 3 builds on the Laboratory 2 WebSocket server and adds:

1. **Google OAuth sign-in.** Participants must sign in with their Google account (OAuth 2.0 / OpenID Connect through Google Identity Services) before they can join. Their Google name and profile photo are used in the call.
2. **WebRTC video calling.** Audio and video go peer-to-peer between browsers. The Bonezegei server (`app.bzg`) only relays the signaling messages (offer / answer / ICE) and chat over WebSocket.

The app runs locally at `http://localhost:8000`. To let people on other networks join, share it through a Cloudflare quick tunnel (see [Share it online](#share-it-online)).

<p align="right"><a href="#top">back to top</a></p>

---

## Features

- **Sign in with Google**: the official Google button, a signed-in user chip (photo, name, email) and **Sign out**
- **ID token checks**: audience, issuer, expiry and verified email are checked before sign-in is accepted
- **Session kept on refresh** (per browser tab) until the Google token expires (about 1 hour)
- **Join is locked** until the user is signed in *and* connected to the server
- **Multi-person video grid** (mesh WebRTC) with Google names and profile photos when the camera is off
- **Pre-join mic and camera toggles**: turn the microphone or camera off on the join screen, and the call starts that way
- **Call controls**: microphone, camera, screen sharing and Leave
- **Real-time chat** with names, timestamps, unread badge and pop-up notifications
- **Custom 404 page** and server console logging of HTTP requests and WebSocket events
- **Message chunking** that keeps large WebRTC payloads under the native module's frame-size limit

<p align="right"><a href="#top">back to top</a></p>

---

## Tech Stack

| Layer | Technology | Version |
|---|---|---|
| Server runtime | Bonezegei Scripting Language | 1.3.3 |
| HTTP / WebSocket | Bonezegei `http` native module (`lib/http/http.dll`) | 1.0.1 |
| Authentication | Google Identity Services (`https://accounts.google.com/gsi/client`) | Google-hosted |
| Media | WebRTC (`RTCPeerConnection`) with Google's public STUN server | Browser-native |
| Client | HTML, CSS, vanilla JavaScript (no build step, no npm packages) | – |

<p align="right"><a href="#top">back to top</a></p>

---

## Prerequisites

| Requirement | Details |
|---|---|
| Operating system | Windows (64-bit) |
| Runtime | **Bonezegei v1.3.3**, with `bonezegei` and `bzg` on your `PATH` (default: `C:\Program Files\Bonezegei`) |
| Google account | To create the OAuth client and to sign in |
| Google Cloud project | Free; used only for the OAuth client ID |
| Browser | Chrome, Edge or Firefox, with a camera and microphone for video |
| Internet | Needed to load Google's sign-in script and to sign in |
| Node.js (optional) | For `npm test` and the tunnel proxy (`scripts/tunnel-proxy.js`) |
| cloudflared (optional) | To share the app online: `winget install Cloudflare.cloudflared` |

Install Bonezegei on Windows from the **Microsoft Store** (uninstall older versions first). Then check the version:

```bash
bonezegei -v
```

<p align="right"><a href="#top">back to top</a></p>

---

## Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/Jevoel16/ITE183_Lab3_Google-OAuth-and-WebRTC.git
   ```

2. **Install dependencies** (from the project root)

   ```bash
   bzg install
   ```

3. **Create your config file** from the template

   ```bash
   copy public\config.example.js public\config.js
   ```

4. **Add your Google client ID** to `public/config.js` (see [Configuration](#configuration)).

<p align="right"><a href="#top">back to top</a></p>

---

## Configuration

The app has no environment variables. The only setting is the Google OAuth **client ID** in `public/config.js`:

```js
window.JMEET_CONFIG = {
    googleClientId: "123456789-abc123.apps.googleusercontent.com"
};
```

| File | Committed? | Purpose |
|---|---|---|
| `public/config.example.js` | Yes | Template with a placeholder client ID |
| `public/config.js` | No (gitignored) | Your own client ID |

A client ID is not a secret (it is sent to every browser), but each developer should use their own Google Cloud project. There is **no client secret** in this project.

### Creating the Google OAuth client ID

1. Open the [Google Cloud Console](https://console.cloud.google.com/) and create (or pick) a project.
2. Go to **APIs & Services → OAuth consent screen** (Google Auth Platform → Branding / Audience):
   - User type: **External**
   - App name: `Jmeet`, plus your support and developer email
   - App logo (optional): upload [`screenshots/oauth-logo-120.png`](screenshots/oauth-logo-120.png) (120×120 PNG, under 1 MB, as Google requires). A 512×512 copy, [`screenshots/oauth-logo-512.png`](screenshots/oauth-logo-512.png), is there if you need a larger version. Adding a logo makes Google ask for brand verification before it is shown to users outside your test list; skip it if you don't need it.
   - Publishing status: leave it in **Testing**, and add every Google account that will sign in under **Test users**
3. Go to **APIs & Services → Credentials → Create credentials → OAuth client ID**:
   - Application type: **Web application**
   - **Authorized JavaScript origins**: add both
     - `http://localhost:8000`
     - `http://localhost`
     - your tunnel URL, if you share the app online (see [Share it online](#share-it-online))
   - Authorized redirect URIs: leave empty (the popup flow doesn't use one)
4. Copy the **Client ID** into `public/config.js`.

> New origins can take a few minutes to start working.

<p align="right"><a href="#top">back to top</a></p>

---

## Usage

### Start the server

```bash
bzg run
```

Expected output:

```
HTTP server listening on port 8000 (High Concurrency Thread-Pool Active)
```

### Participant flow

1. Open <http://localhost:8000>. The join screen shows the camera preview and `Connected to ws://localhost:8000`.
2. Click **Sign in with Google** and choose your account in the popup.
3. Your photo, name and email appear in the user chip, and **Join now** becomes active.
   Optionally use the microphone and camera buttons under the preview to join muted or with the camera off (they turn red, and the preview shows "Camera is off").
4. Click **Join now**. Your tile shows your Google name with "(You)".
5. A second participant opens the same URL in another window or browser, signs in (with the same or a different Google account) and joins. Video, audio and chat start straight away.
6. Use the controls to mute, turn off the camera (your Google photo is shown instead), present your screen, chat, or **Leave**.
7. Click **Sign out** on the join screen to switch accounts.

### Share it online

A Cloudflare quick tunnel gives the app a public `https://….trycloudflare.com` address with a valid certificate. It's free and needs no account. The app stays on your PC, so it's only online while `bzg run` and the tunnel are running.

Run each command in its own terminal, from the project root:

```bash
bzg run
```

```bash
node scripts/tunnel-proxy.js
```

```bash
cloudflared tunnel --config NUL --url http://localhost:8001
```

`--config NUL` stops cloudflared from loading `%USERPROFILE%\.cloudflared\config.yml`. A named tunnel's config there has a catch-all rule that answers every quick tunnel address with an empty 404. The "Configuration file NUL was empty" line it prints is harmless.

1. Copy the `https://….trycloudflare.com` address that cloudflared prints. It can take up to a minute to start working.
2. Add that address to the client's **Authorized JavaScript origins** (see [Creating the Google OAuth client ID](#creating-the-google-oauth-client-id)) and wait a few minutes.
3. Share the address. Everyone who signs in must be a test user while the app is in Testing mode.

The tunnel points at the proxy on port 8001, not at port 8000. cloudflared sends the WebSocket header as `Sec-Websocket-Key`, and Bonezegei's `http.dll` only accepts `Sec-WebSocket-Key`, so without the proxy the page loads but never connects. The proxy fixes the header's capitalization and passes everything else through unchanged.

The address changes every time you start cloudflared, so you add the new one to Google each time. Two people on very different networks (mobile data and home Wi-Fi, for example) may still fail to connect video, because the app only uses a STUN server and has no TURN relay.

### Screenshots

| Screen | File |
|---|---|
| Join screen with the Google button | `screenshots/google-signin.png` *(to capture)* |
| Signed-in join screen (user chip) | `screenshots/signed-in.png` *(to capture)* |
| Two signed-in users in a call | `screenshots/video-call.png` *(to capture)* |
| Server log | `screenshots/terminal-install-run.png` |
| Custom 404 page | `screenshots/404-page.png` |

![Custom 404 page](screenshots/404-page.png)

<p align="right"><a href="#top">back to top</a></p>

---

## How It Works

```
 ┌───────────────┐  1. Sign in (popup)   ┌────────────────────────┐
 │   Browser A   │ ────────────────────► │ Google Identity        │
 │               │ ◄──────────────────── │ Services (OAuth 2.0)   │
 │               │  2. ID token (JWT)    └────────────────────────┘
 │               │
 │               │  3. join / chat / offer / answer / ice   ┌──────────────┐
 │               │ ───────────────────────────────────────► │  Bonezegei   │
 │               │ ◄─────────── server.sendAll() ────────── │  app.bzg     │
 └───────┬───────┘                                          │  :8000       │
         │ 4. WebRTC peer-to-peer audio / video             │              │
 ┌───────┴───────┐ ◄──────────────────────────────────────► │              │
 │   Browser B   │                                          └──────────────┘
 └───────────────┘
```

### Sign-in

1. `public/index.html` loads Google Identity Services and renders the **Sign in with Google** button with the client ID from `/config.js`.
2. After the user picks an account, Google returns an **ID token**, which is a signed JWT with the user's `name`, `email` and `picture`.
3. The browser decodes the token and checks that:
   - `aud` equals your client ID
   - `iss` is `accounts.google.com`
   - `exp` has not passed
   - `email_verified` is true
4. The profile is kept in `sessionStorage` until the token expires. Only the name and photo are shared with other participants; the email stays in your browser.

> **Security note:** the Bonezegei `http` module cannot make outbound HTTPS requests, so the server cannot check the token's signature with Google or run the server-side authorization-code flow. Sign-in is enforced in the browser, which is fine for a local lab but not for production. In production, the token would be sent to a backend that verifies it (for example with `google-auth-library`) before letting the user into a call.

### Server routes and events

| Event | Server action |
|---|---|
| HTTP `GET /` | Sends `public/index.html` |
| HTTP `GET /style.css` | Sends `public/style.css` |
| HTTP `GET /config.js` | Sends `public/config.js` (the Google client ID) |
| HTTP `GET` (any other path) | Sends `public/404.html` |
| `onConnect(clientId)` | Logs the connection and sends `__id__:<clientId>` to that client |
| `onData(message, clientId)` | Logs the message and relays it to everyone with `sendAll` |
| `onDisconnect(clientId)` | Logs the disconnect and broadcasts `__left__:<clientId>` |

### Message protocol

| Type | Purpose |
|---|---|
| `join` | Announces a participant's Google name, photo and media state |
| `chat` | A chat message (name, text, timestamp) |
| `offer` / `answer` / `ice` | WebRTC signaling between two peers |
| `media` | Mic and camera on/off updates |
| `leave` | The participant left the call |
| `chunk` | Part of a message over 3,000 characters (the native `http.dll` crashes on WebSocket frames of roughly 8 KB or more) |

<p align="right"><a href="#top">back to top</a></p>

---

## Project Structure

```
ITE183_Lab3_Google OAuth and WebRTC (videocall)/
├── app.bzg                  # Server entry point: HTTP routes + WebSocket relay
├── .github/workflows/ci.yml # GitHub Actions: runs npm test on push and pull request
├── scripts/
│   ├── check-syntax.js      # Syntax checks used by npm test and CI
│   ├── tunnel-proxy.js      # Port 8001 proxy that fixes the WebSocket header for cloudflared
│   └── tunnel-proxy.test.js # Unit tests for the header fix
├── package.json             # Project metadata, "http" dependency, start script
├── .gitattributes           # Treats *.bzg as JavaScript on GitHub
├── .gitignore               # Ignores config.js, commit-msg.txt, .claude/, CLAUDE.md
├── LICENSE                  # Sprucetrap Source-Available License 1.0
├── lib/
│   ├── http.bzg             # Loads the native http module
│   ├── http.json            # API description of the http module
│   └── http/http.dll        # Native HTTP/WebSocket module
├── public/
│   ├── index.html           # Jmeet client: Google sign-in, video grid, chat
│   ├── style.css            # Styles for index.html and 404.html
│   ├── 404.html             # Custom Not Found page
│   ├── config.example.js    # Template for the Google client ID
│   └── config.js            # Your client ID (gitignored)
└── screenshots/             # Logo and laboratory screenshots
    ├── logo.svg             # App logo (README header)
    ├── oauth-logo-120.png   # Logo for the Google OAuth consent screen
    └── oauth-logo-512.png   # Larger PNG of the same logo
```

<p align="right"><a href="#top">back to top</a></p>

---

## Scripts

| Command | What it does |
|---|---|
| `bzg install` | Installs the `http` dependency listed in `package.json` |
| `bzg run` | Runs the `start` script (`bonezegei app.bzg`) on port 8000 |
| `bonezegei -v` | Prints the installed Bonezegei version |
| `npm test` | Checks the JSON and JavaScript syntax of the project files and runs the tunnel proxy tests (needs Node.js; also run by CI) |
| `node scripts/tunnel-proxy.js` | Starts the proxy on port 8001 for a Cloudflare tunnel (see [Share it online](#share-it-online)) |
| `cloudflared tunnel --config NUL --url http://localhost:8001` | Opens a quick tunnel and prints the public address |

<p align="right"><a href="#top">back to top</a></p>

---

## Testing

`npm test` (Node.js) runs syntax checks on `package.json`, `public/config.example.js` and the inline scripts in the HTML pages, then the `node:test` unit tests for the tunnel proxy's header fix. [GitHub Actions CI](.github/workflows/ci.yml) runs the same command on every push and pull request to `main`. The server itself only runs on Windows with Bonezegei, so the app is tested by hand.

Run these manual checks after `bzg run`:

<details>
<summary><b>Manual test checklist</b></summary>

| # | Check | Expected result |
|---|---|---|
| 1 | Open `http://localhost:8000` with the placeholder client ID | "Google sign-in is not configured..." message; **Join now** disabled |
| 2 | Add a real client ID and reload | **Sign in with Google** button appears |
| 3 | Sign in with a test-user account | User chip shows photo, name and email; **Join now** enabled |
| 4 | Reload the page | Still signed in (same tab) |
| 5 | Click **Sign out** | Google button returns; **Join now** disabled; reload stays signed out |
| 6 | Join in two windows | Both tiles show Google names; video and audio connect |
| 7 | Turn the camera off | Tile shows the Google profile photo |
| 8 | Send chat messages | They appear instantly in the other window |
| 9 | Stop the server while in a call | "Lost connection to the server" toast; **Join now** disabled |
| 10 | Open `http://localhost:8000/does-not-exist` | Custom 404 page |
| 11 | Turn the mic and camera off on the join screen, then join | Buttons turn red and the preview shows "Camera is off"; in the call your tile and the other window show the photo and mic-off badge, with no audio |
| 12 | Turn them back on in the call | The other window sees video and hears audio |
| 13 | Start the tunnel proxy and cloudflared, then open the tunnel address on a phone | Page loads over HTTPS, shows `Connected to wss://…`, and joins a call with your PC |

</details>

<p align="right"><a href="#top">back to top</a></p>

---

## Troubleshooting

<details>
<summary><b>Common problems</b></summary>

| Problem | Fix |
|---|---|
| `Error 400: origin_mismatch` or "The given origin is not allowed" | Add `http://localhost:8000` **and** `http://localhost` to the client's Authorized JavaScript origins, then wait a few minutes |
| `Error 403: access_denied` | The app is in Testing mode: add the account under **OAuth consent screen → Test users** |
| "Google sign-in is not configured" | Create `public/config.js` from `config.example.js` and paste your client ID |
| "Sign-in failed: Token was issued for a different app" | The client ID in `config.js` doesn't match the one the token was issued for; recheck it |
| Google button doesn't appear | Check your internet connection, and disable ad/tracker blockers for `accounts.google.com` |
| Opening via `http://127.0.0.1:8000` or a LAN IP fails to sign in | Use `http://localhost:8000`; Google only allows the origins you registered, and browsers block the camera on plain HTTP except localhost |
| Camera preview is blank | Allow camera and microphone in the browser, and close other apps using the camera |
| "Disconnected from server" | Make sure `bzg run` is running from the project root |
| Port 8000 already in use | Find the process with `Get-NetTCPConnection -LocalPort 8000` and stop it |
| Tunnel page loads but says "Could not reach wss://…" | Point cloudflared at the proxy (`--url http://localhost:8001`) and make sure `node scripts/tunnel-proxy.js` is running |
| Every tunnel address returns an empty 404 | cloudflared is loading `%USERPROFILE%\.cloudflared\config.yml` and its ingress rules. Start the tunnel with `--config NUL` |
| Tunnel address doesn't resolve right away | New addresses take up to a minute. If it still fails, your DNS may have cached the miss: run `ipconfig /flushdns` |
| `origin_mismatch` on the tunnel address | Add the current `https://….trycloudflare.com` address to the Authorized JavaScript origins; it changes on every run |

</details>

<p align="right"><a href="#top">back to top</a></p>

---

## Contributing

1. Create a branch with a matching prefix, for example `feat/short-description` or `fix/short-description`.
2. Use [Conventional Commits](https://www.conventionalcommits.org/): `feat:`, `fix:`, `docs:`, `refactor:`, `chore:`, `style:`, `perf:`, `test:`, `ci:`. Use a short imperative subject (72 characters or less) that ends with the bumped [SemVer](https://semver.org/) version, a blank line, then one bullet per change. Example: `feat: add CSV export (v1.4.0)`.
   - Version bumps: breaking change → major, `feat` → minor, anything else → patch. Update `package.json` `version` and the README version badge in the same commit.
3. Run `npm test` and the [manual checks](#testing) before opening a pull request.
4. **Update this README with every change** (features, configuration, structure and badges).

<p align="right"><a href="#top">back to top</a></p>

---

## License

This project is licensed under the [Sprucetrap Source-Available License 1.0](LICENSE). Copyright (c) 2026 Sprucetrap ([github.com/Jevoel16](https://github.com/Jevoel16)).

In short: you may view, run, modify and share it for **non-commercial** use, as long as you keep the `LICENSE` file, credit the author visibly with a link ("Based on Jmeet by Sprucetrap (https://github.com/Jevoel16)") and mark your changes. Commercial use, resale and rebranding need written permission. See [`LICENSE`](LICENSE) for the full terms.

<p align="right"><a href="#top">back to top</a></p>

---

## Author

**Jevoel16** ([GitHub](https://github.com/Jevoel16))
ITE183 – Web Systems and Technologies, Laboratory 3

<p align="right"><a href="#top">back to top</a></p>
