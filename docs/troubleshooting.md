# Troubleshooting

## Server

| Problem | Fix |
|---|---|
| `TLS setup failed; the video call server was not started.` | `cert/cert.pem` or `cert/key.pem` is missing or the pair doesn't match. Make them again (see [setup.md](setup.md#3-certificate)) |
| `include("config.bzg")` fails | Copy `config.example.bzg` to `config.bzg` |
| `enableTLS` is unknown | `lib/` is from an old `http` package. Delete `lib/` and run `bzg install` |
| Port 443 already in use | Find it with `Get-NetTCPConnection -LocalPort 443` and stop that process (IIS, Skype or another `bzg run`) |
| `openssl` fails with "subject name is expected to be in the format /type0=value0..." | Git Bash rewrote `/CN=localhost` as a path. Put `MSYS_NO_PATHCONV=1` in front of the command |

## Sign-in

| Problem | Fix |
|---|---|
| Browser says "Your connection is not private" | Expected with a self-signed certificate. Advanced > Proceed |
| `Error 400: redirect_uri_mismatch` (Google) | Add `<baseUrl>/google-callback` exactly as in `config.bzg` to the client's Authorized redirect URIs |
| `Error 403: access_denied` (Google) | The app is in Testing mode: add the account under OAuth consent screen > Test users |
| GitHub: "The redirect_uri is not associated with this application" | The callback URL on GitHub must match `githubRedirectUri` |
| "Invalid or expired OAuth state." | The sign-in took too long or was opened in another browser. Start again from the login page |
| "Could not exchange the authorization code." | Wrong client secret in `config.bzg` |
| Back on the login page right after signing in | The address doesn't match `baseUrl` (for example `127.0.0.1` vs `localhost`), so the cookie or `Origin` check fails. Open exactly `baseUrl` |

## Calls

| Problem | Fix |
|---|---|
| "Couldn't use your camera or microphone" | Allow both in the browser's site settings, and close other apps using the camera |
| "Disconnected. The call may be full or your session expired." | More than 8 people, or the one-hour session ended. Reload and sign in |
| "Couldn't connect to …. A TURN server may be needed." | The two networks block direct connections. Try the same Wi-Fi |
| "Tap to hear the call" button | The phone blocked audio until a tap. Tap it once |
