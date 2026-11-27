# Troubleshooting

## Server

| Problem | Fix |
|---|---|
| `TLS setup failed; the video call server was not started.` | `cert/cert.pem` or `cert/key.pem` is missing or the pair doesn't match. Make them again (see [setup.md](setup.md#certificate)). Only happens with `useTunnel = 0` |
| `include("config.bzg")` fails | Copy `config.example.bzg` to `config.bzg` |
| `enableTLS` is unknown | `lib/` is from an old `http` package. Delete `lib/` and run `bzg install` |
| Port 443 already in use | Find it with `Get-NetTCPConnection -LocalPort 443` and stop that process (IIS, Skype or another `bzg run`) |
| Port 8001 or 8002 already in use | Find it with `Get-NetTCPConnection -LocalPort 8001` (or 8002) and stop that process, often a leftover `node` or `bonezegei` |
| Online, the page and sign-in work but Join call says "Disconnected" | The tunnel proxy isn't running, so the WebSocket upgrade is dropped. Use `npm run online`, or start `node scripts/tunnel-proxy.js` by hand |
| Tunnel address shows an empty 404 page | cloudflared read `%USERPROFILE%\.cloudflared\config.yml`. Start it with `--config NUL` |
| Tunnel address shows a Cloudflare 502 or 1033 error | `bzg run` isn't running, or it's on a different port than `--url` |
| `npm run online` says "No tunnel address after 30 seconds" | Cloudflare didn't answer. Check the connection and run it again. cloudflared's log is in `%TEMP%\jmeet-cloudflared.log` |
| `Skipping: start this with npm run online.` | The script was started directly or by `bzg run`. Use `npm run online` or `npm run local` |
| `cloudflared` is not recognized | Install it (`winget install Cloudflare.cloudflared`) and open a new terminal |
| Linux: `Run bzg install first.` | `lib/http.bzg` is missing. Run `bzg install` in the project folder |
| Linux: `Error at Line 76: Expected token SEMI but got LBRACE` | Bonezegei is older than v1.3.4 and has no `try`/`catch`. Install the v1.3.4 deb (see [setup.md](setup.md#linux)) |
| Linux: `cloudflared isn't installed or isn't on PATH.` | Put the `cloudflared-linux-amd64` binary in `~/.local/bin/cloudflared` and `chmod +x` it (see [setup.md](setup.md#linux)) |
| Linux: `npm run online:linux` says "No tunnel address after 30 seconds" | Cloudflare didn't answer. Check the connection and run it again. cloudflared's log is in `${TMPDIR:-/tmp}/jmeet-cloudflared.log` |
| Linux: `Skipping: start this with npm run local:linux.` | The script was started directly. Use `npm run local:linux` or `npm run online:linux` |
| `openssl` fails with "subject name is expected to be in the format /type0=value0..." | Git Bash rewrote `/CN=localhost` as a path. Put `MSYS_NO_PATHCONV=1` in front of the command |

## Sign-in

| Problem | Fix |
|---|---|
| Browser says "Your connection is not private" | Expected with the self-signed certificate in local HTTPS mode. Advanced > Proceed. The tunnel address never shows this |
| `redirect_uri_mismatch` right after restarting cloudflared | Quick tunnels get a new address each run. Update `config.bzg` and both OAuth apps, then restart `bzg run` |
| `Error 400: redirect_uri_mismatch` (Google) | Add `<baseUrl>/google-callback` exactly as in `config.bzg` to the client's Authorized redirect URIs |
| `Error 403: access_denied` (Google) | The app is in Testing mode: add the account under OAuth consent screen > Test users |
| GitHub: "The redirect_uri is not associated with this application" | The callback URL on GitHub must match `githubRedirectUri` |
| "Invalid or expired OAuth state." | The sign-in took too long or was opened in another browser. Start again from the login page |
| "Could not exchange the authorization code." | Wrong client secret in `config.bzg` |
| Back on the login page right after signing in | The address doesn't match `baseUrl` (for example `127.0.0.1` vs `localhost`), so the cookie or `Origin` check fails. Open exactly `baseUrl` |

## Calls

| Problem | Fix |
|---|---|
| "Camera and mic are blocked" under the preview | Allow both in the browser's site settings, then click a toggle to try again. You can also join without them |
| "Joined without camera or mic" | Same: the browser blocked them or no device was found. Close other apps using the camera |
| Teammates are in the call but can't see each other | They're in different rooms. Compare the code in the header, or share the link from the copy button |
| "Reconnecting..." stays on screen | The server stopped or the network dropped. It retries for about 45 s, then shows "Lost the connection to the call server" |
| "Disconnected. The call may be full or your session expired." | More than 8 people, or the one-hour session ended. Reload and sign in |
| "Your sign-in expired. You can stay in this call…" | The one-hour session ended mid-call. The call keeps going; sign in again after you leave |
| The same person shows up twice | Fixed: a rejoining tab now replaces its old slot. If it still happens, they're in two tabs; close one |
| "Couldn't connect to …. A TURN server may be needed." | The two networks block direct connections. Try the same Wi-Fi |
| "Tap to hear the call" button | The phone blocked audio until a tap. Tap it once |
