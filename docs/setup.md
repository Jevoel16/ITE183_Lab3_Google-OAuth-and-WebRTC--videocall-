# Setup

## 1. Bonezegei v1.3.4

Uninstall any older Bonezegei, then install Bonezegei Scripting Language from the Microsoft Store. Check it:

```bash
bonezegei --version
```

Then, in the project folder, `bzg install` downloads the `http` package into `lib/` (gitignored). Its `http.dll` has `enableTLS`, which the local HTTPS fallback needs.

Also install [cloudflared](https://developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads/) (`winget install Cloudflare.cloudflared`). Quick tunnels need no Cloudflare account.

## Linux

On Linux, `scripts/run.sh` replaces the PowerShell launchers. It needs bash, Bonezegei and cloudflared.

**Bonezegei v1.3.4 or newer.** v1.3.3, the version some apt sources still carry, can't parse `app.bzg`: it stops with `Expected token SEMI but got LBRACE` at the `try`/`catch` in `profileField`. Install the deb from the language repository (`Bonezegei-arm64.deb` on 64-bit ARM):

```bash
curl -LO https://github.com/bonezegei/Bonezegei_Scripting_Language/raw/main/Release/Latest/Bonezegei-x86.deb
sudo dpkg -i Bonezegei-x86.deb
bonezegei --version   # Bonezegei Script Interpreter v1.3.4
```

Then run `bzg install` in the project folder, as on Windows.

**cloudflared**, only for online mode. The release binary is static, so it also runs on distributions without glibc, such as NixOS:

```bash
curl -L -o ~/.local/bin/cloudflared https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64
chmod +x ~/.local/bin/cloudflared
cloudflared --version
```

**Run it:**

```bash
# online: Cloudflare quick tunnel, prints https://<random>.trycloudflare.com
npm run online:linux

# local: http://localhost:8001, no tunnel (sign-in doesn't work yet, see below)
npm run local:linux
```

Online mode works like `npm run online` on Windows. It starts `scripts/tunnel-proxy.js` on port 8001 and cloudflared in front of it, then writes `useTunnel = 1`, `tunnelPort = 8002`, `baseUrl` and the two redirect URIs into `config.bzg` and starts the app on 8002. It needs `node` for the proxy, logs cloudflared to `${TMPDIR:-/tmp}/jmeet-cloudflared.log`, and Ctrl+C stops the app, the tunnel and the proxy together. The Linux `http` package rejects cloudflared's `Sec-Websocket-Key` header spelling just like `http.dll` does, so the proxy is needed here too.

**Local mode can't sign in yet.** It serves the app directly on `http://localhost:8001` (`tunnelPort = 8001`). The `http` package's `oauthStart` only accepts `https://` redirect URIs, so `/login/google` and `/login/github` answer "Could not start Google login." or "Could not start GitHub login.". Use online mode to sign in.

There's no local HTTPS mode on Linux. The fallback below listens on port 443, which needs root on Linux, and `http://localhost` already counts as a secure context for camera, microphone and screen sharing.

## 2. Keys in config.bzg

`config.bzg` is gitignored. Copy the template and fill it in:

```bash
cp config.example.bzg config.bzg
```

| Variable | Value |
|---|---|
| `googleClientId`, `googleClientSecret` | From the Google client below |
| `githubClientId`, `githubClientSecret` | From the GitHub app below |
| `useTunnel` | `1` for the Cloudflare tunnel (default), `0` for local HTTPS |
| `tunnelPort` | `8002`, where `app.bzg` listens behind the tunnel proxy (which listens on 8001) |
| `baseUrl` | The `https://<random>.trycloudflare.com` address, or `https://localhost` with `useTunnel = 0` |
| `googleRedirectUri`, `githubRedirectUri` | `<baseUrl>/google-callback`, `<baseUrl>/github-callback` |
| `certificatePath`, `privateKeyPath` | `cert/cert.pem`, `cert/key.pem` (only read with `useTunnel = 0`) |

`baseUrl` must match the address in the browser exactly: `/logout` and `/signal` reject any other `Origin`.

### Google OAuth client

1. [Google Cloud Console](https://console.cloud.google.com/) > create or pick a project.
2. APIs & Services > OAuth consent screen: External, and add every group member under Test users.
3. Credentials > Create credentials > OAuth client ID > Web application.
4. Authorized redirect URI: `https://<tunnel>.trycloudflare.com/google-callback` (and `https://localhost/google-callback` for the fallback). Google accepts `trycloudflare.com` addresses because they're real HTTPS domains.
5. Copy the client ID and secret into `config.bzg`.

### GitHub OAuth app

1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
2. Homepage URL `https://<tunnel>.trycloudflare.com`, Authorization callback URL `https://<tunnel>.trycloudflare.com/github-callback`. A GitHub OAuth app holds one callback URL, so switch it back to `https://localhost/github-callback` for the fallback.
3. Register, copy the client ID, then Generate a new client secret.

## 3. Run behind a Cloudflare quick tunnel

```bash
npm run online
```

It starts cloudflared, writes the new address into `useTunnel`, `tunnelPort`, `baseUrl` and both redirect URIs in `config.bzg` (no other lines are touched), copies the address, prints the two callbacks to register, then starts the app. Ctrl+C stops both. Add the printed callbacks to Google and GitHub (step 2 below) before signing in.

It also starts `scripts/tunnel-proxy.js` on port 8001, between cloudflared and the app on 8002. cloudflared spells the WebSocket header `Sec-Websocket-Key` and Bonezegei only accepts `Sec-WebSocket-Key`, so without the proxy the page loads but calls never connect. The proxy is the only thing Node runs while the app is up.

`npm run local` does the same for the fallback: it switches those lines to `https://localhost` and starts the app with `cert/`.

Both are PowerShell scripts in `scripts/`. They don't run when started by `bzg run`, which starts every `package.json` script at once, so `bzg run` still just starts the app with whatever `config.bzg` says.

### By hand

Three terminals, with `useTunnel = 1` and `tunnelPort = 8002` in `config.bzg`:

```bash
bzg run
```

```bash
node scripts/tunnel-proxy.js
```

```bash
cloudflared tunnel --config NUL --url http://localhost:8001
```

`--config NUL` makes cloudflared skip `%USERPROFILE%\.cloudflared\config.yml`; a catch-all rule in that file answers every quick-tunnel address with an empty 404.

cloudflared prints an address like `https://<random>.trycloudflare.com`. Then:

1. Put it in `baseUrl`, `googleRedirectUri` and `githubRedirectUri` in `config.bzg`.
2. Add `<address>/google-callback` to the Google client's redirect URIs and set the GitHub app's callback to `<address>/github-callback`.
3. Stop `bzg run` (Ctrl+C) and start it again so it reads the new `config.bzg`. Leave cloudflared and the proxy running, or the address changes.
4. Open the address and share it with the group. Everyone, the host included, uses that address.

A quick tunnel gets a new address each time cloudflared starts, so steps 1 to 3 repeat every session. Google can take a minute to accept a new redirect URI.

Cloudflare terminates HTTPS, so the browser still gets a secure page (camera, microphone and `Secure` cookies work) while `app.bzg` serves plain HTTP. Anyone with the address can reach the sign-in page while the tunnel runs; stop cloudflared when the call is over.

## Local HTTPS fallback

Without a tunnel, set `useTunnel = 0`, set `baseUrl` to `https://localhost` and the redirect URIs to match. The browser needs HTTPS for the camera on any address other than localhost, so this mode serves HTTPS itself with a self-signed certificate.

### Certificate

`cert/` is gitignored. Make a self-signed certificate:

```bash
mkdir -p cert
openssl req -x509 -newkey rsa:4096 -keyout cert/key.pem -out cert/cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"
```

On Windows, Git for Windows ships `openssl`. In Git Bash, put `MSYS_NO_PATHCONV=1` in front of the command so `/CN=localhost` isn't turned into a path.

The browser warns because nobody vouches for this certificate. Click Advanced > Proceed to localhost.

### Run

```bash
bzg run
```

With `useTunnel = 0` it prints `Open https://localhost`. Port 443 must be free (see [troubleshooting.md](troubleshooting.md)).

### Teammates on the same network

The host PC runs the server and teammates open its LAN address, for example `https://192.168.254.103`.

1. Put the LAN IP in the certificate as well as localhost:

   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout cert/key.pem -out cert/cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.254.103"
   ```

2. Set `baseUrl` and both redirect URIs in `config.bzg` to that address, add the GitHub callback for it, and restart.
3. Allow Bonezegei through Windows Firewall on private networks when Windows asks.

With `baseUrl` on the LAN IP, everyone signs in with GitHub, the host included: `baseUrl` is one address, so the host opens the LAN IP too. Google sign-in only works while `baseUrl` is `https://localhost`.

Google rejects redirect URIs on a bare IP address (only `localhost` is allowed), so Google sign-in won't work on the LAN IP. A domain that points at the IP, such as `192-168-254-103.nip.io`, gets around that. Use it everywhere (certificate `DNS:` entry, `baseUrl`, both redirect URIs). GitHub sign-in accepts the LAN IP as it is.
