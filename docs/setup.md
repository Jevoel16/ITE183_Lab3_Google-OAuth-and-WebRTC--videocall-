# Setup

## 1. Bonezegei v1.3.4

Uninstall any older Bonezegei, then install Bonezegei Scripting Language from the Microsoft Store. Check it:

```bash
bonezegei --version
```

Then, in the project folder, `bzg install` downloads the `http` package into `lib/` (gitignored). Its `http.dll` has `enableTLS`, which the HTTPS server needs.

## 2. Keys in config.bzg

`config.bzg` is gitignored. Copy the template and fill it in:

```bash
cp config.example.bzg config.bzg
```

| Variable | Value |
|---|---|
| `googleClientId`, `googleClientSecret` | From the Google client below |
| `githubClientId`, `githubClientSecret` | From the GitHub app below |
| `baseUrl` | `https://localhost`, or the address teammates open |
| `googleRedirectUri`, `githubRedirectUri` | `<baseUrl>/google-callback`, `<baseUrl>/github-callback` |
| `certificatePath`, `privateKeyPath` | `cert/cert.pem`, `cert/key.pem` |

`baseUrl` must match the address in the browser exactly: `/logout` and `/signal` reject any other `Origin`.

### Google OAuth client

1. [Google Cloud Console](https://console.cloud.google.com/) > create or pick a project.
2. APIs & Services > OAuth consent screen: External, and add every group member under Test users.
3. Credentials > Create credentials > OAuth client ID > Web application.
4. Authorized redirect URI: `https://localhost/google-callback`.
5. Copy the client ID and secret into `config.bzg`.

### GitHub OAuth app

1. GitHub > Settings > Developer settings > OAuth Apps > New OAuth App.
2. Homepage URL `https://localhost`, Authorization callback URL `https://localhost/github-callback`.
3. Register, copy the client ID, then Generate a new client secret.

## 3. Certificate

`cert/` is gitignored. Make a self-signed certificate:

```bash
mkdir -p cert
openssl req -x509 -newkey rsa:4096 -keyout cert/key.pem -out cert/cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost"
```

On Windows, Git for Windows ships `openssl`. In Git Bash, put `MSYS_NO_PATHCONV=1` in front of the command so `/CN=localhost` isn't turned into a path.

The browser warns because nobody vouches for this certificate. Click Advanced > Proceed to localhost.

## 4. Run

```bash
bzg run
```

It prints `Open https://localhost`. Port 443 must be free (see [troubleshooting.md](troubleshooting.md)).

## Teammates on the same network

The host PC runs the server and teammates open its LAN address, for example `https://192.168.254.103`.

1. Put the LAN IP in the certificate as well as localhost:

   ```bash
   openssl req -x509 -newkey rsa:4096 -keyout cert/key.pem -out cert/cert.pem -sha256 -days 365 -nodes -subj "/CN=localhost" -addext "subjectAltName=DNS:localhost,IP:127.0.0.1,IP:192.168.254.103"
   ```

2. Set `baseUrl` and both redirect URIs in `config.bzg` to that address, add the GitHub callback for it, and restart.
3. Allow Bonezegei through Windows Firewall on private networks when Windows asks.

Google rejects redirect URIs on a bare IP address (only `localhost` is allowed), so Google sign-in won't work on the LAN IP. A domain that points at the IP, such as `192-168-254-103.nip.io`, gets around that. Use it everywhere (certificate `DNS:` entry, `baseUrl`, both redirect URIs). GitHub sign-in accepts the LAN IP as it is.
