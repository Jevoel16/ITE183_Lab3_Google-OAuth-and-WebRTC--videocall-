# Troubleshooting

## Sign-in

| Problem | Fix |
|---|---|
| `Error 400: origin_mismatch` or "The given origin is not allowed" | Add `http://localhost:8001`, `http://localhost:8000` and `http://localhost` to the client's Authorized JavaScript origins, then wait a few minutes |
| `origin_mismatch` on the tunnel address | Add the current `https://….trycloudflare.com` address to the Authorized JavaScript origins; it changes on every run |
| `Error 403: access_denied` | The app is in Testing mode: add the account under OAuth consent screen → Test users |
| "Sign-in is not configured" | Set `GOOGLE_CLIENT_ID` in `.env` and run `npm run config` |
| "Sign-in failed: Token was issued for a different app" | The client ID in `config.js` doesn't match the one the token was issued for |
| Google button doesn't appear | Check your internet connection, and turn off ad or tracker blockers for `accounts.google.com` |
| Sign-in fails on `http://127.0.0.1:8001` or a LAN IP | Use `http://localhost:8001`. Google only allows the origins you registered, and browsers block the camera on plain HTTP except on localhost |
| No GitHub button | Set `GITHUB_CLIENT_ID` in `.env` and run `npm run config` |
| "GitHub sign-in isn't set up" | Add the GitHub keys to `.env` and restart `npm run dev` |
| GitHub sign-in: "Missing in .env: ..." | Copy the Local block of `.env.example` into `.env` and fill in the GitHub keys |
| GitHub sign-in: `redirect_uri` mismatch | The callback URL on GitHub doesn't match the address you opened. Use `http://localhost:8001/auth/github/callback` locally and `https://trycloudflare.com/auth/github/callback` while sharing |
| GitHub sign-in from `localhost:8000` shows a 404 | The sign-in routes live on the gateway. Use `http://localhost:8001` |
| GitHub sign-in: "Open Jmeet on http://localhost:8001 or its trycloudflare.com address" | The gateway only sends GitHub back to localhost or a quick tunnel, so a LAN IP or other hostname is refused |
| `npm run config`: "Set GOOGLE_CLIENT_ID or the GitHub keys" | `.env` is missing or still has `YOUR_...` placeholders; `config.js` was left as it was |

## Calls

| Problem | Fix |
|---|---|
| Camera preview is blank | Allow camera and microphone in the browser, and close other apps using the camera |
| One person hears the other but not the other way round | Add a TURN server (see [setup.md](setup.md#turn-server)) |
| "Tap to hear the call" button | The phone blocked audio until a tap. Tap it once |
| "Disconnected from server" or "Reconnecting..." that never ends | Make sure `npm run dev` is running from the project root |

## Servers and tunnel

| Problem | Fix |
|---|---|
| "The app server on port 8000 isn't running" | The gateway is up but Bonezegei isn't. Stop it and start both with `npm run dev` |
| `npm run dev` stops with "Port 8001 is already in use" | An old gateway, tunnel or `bzg run` is still running. Find it with `Get-NetTCPConnection -LocalPort 8001` and stop it |
| Port 8000 already in use | Find the process with `Get-NetTCPConnection -LocalPort 8000` and stop it |
| Tunnel page loads but says "Could not reach wss://…" | Use `npm run share`, or start the app (`npm run dev`) before `npm run tunnel` |
| `[tunnel] cloudflared isn't installed or isn't on PATH` | Run `winget install Cloudflare.cloudflared` and open a new terminal |
| Every tunnel address returns an empty 404 | cloudflared is loading `%USERPROFILE%\.cloudflared\config.yml`. Start the tunnel with `--config NUL` (`npm run share` does) |
| Tunnel address doesn't resolve right away | New addresses take up to a minute. If it still fails, run `ipconfig /flushdns` |
