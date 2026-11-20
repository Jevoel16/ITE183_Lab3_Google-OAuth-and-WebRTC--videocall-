// GitHub sign-in routes, served by scripts/gateway.js. GitHub only hands out
// a profile after a server swaps the login code for a token using the client
// secret, and Bonezegei can't make HTTPS requests, so Node does that step.
// The token is used once to read the profile and never reaches the browser.
const crypto = require("node:crypto");
const { isRoomCode } = require("../public/jmeet-core.js");

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_SECONDS = 8 * 60 * 60;
const REQUIRED_KEYS = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET"];
const CALLBACK_PATH = "/auth/github/callback";
const isSet = (value) => !!value && !value.startsWith("YOUR_");

// null when GitHub isn't set up at all (Google-only is fine); fails fast,
// listing every missing or broken key, when it's only half set up
function loadConfig(env) {
    if (!isSet(env.GITHUB_CLIENT_ID) && !isSet(env.GITHUB_CLIENT_SECRET)) return null;
    const missing = REQUIRED_KEYS.filter((key) => !isSet(env[key]));
    if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")} (see .env.example)`);
    return { clientId: env.GITHUB_CLIENT_ID, clientSecret: env.GITHUB_CLIENT_SECRET };
}

// The address the visitor opened (localhost or a quick tunnel), so GitHub
// sends them back there. Other Host values get null: the Host header is
// client-controlled, and trusting it would make this an open redirect.
function requestOrigin(req) {
    const host = String((req.headers && req.headers.host) || "").toLowerCase();
    if (/^(localhost|127\.0\.0\.1)(:\d{1,5})?$/.test(host)) return `http://${host}`;
    if (/^[a-z0-9-]+\.trycloudflare\.com$/.test(host)) return `https://${host}`;
    return null;
}

function buildAuthorizeUrl(config, state, origin) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", origin + CALLBACK_PATH);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "true");
    return url.toString();
}

// The random state ties the callback to a login this server started (CSRF check)
function createStateStore(now = Date.now) {
    const pending = new Map();
    return {
        issue(room, origin) {
            const state = crypto.randomBytes(16).toString("hex");
            pending.set(state, { room: isRoomCode(room) ? room : "", origin, expires: now() + STATE_TTL_MS });
            return state;
        },
        // Each state works once
        take(state) {
            const entry = pending.get(state);
            pending.delete(state);
            for (const [key, value] of pending) if (value.expires <= now()) pending.delete(key);
            return entry && entry.expires > now() ? entry : null;
        }
    };
}

function profileFromGitHubUser(ghUser, nowMs) {
    return {
        provider: "github",
        name: ghUser.name || ghUser.login,
        email: ghUser.email || "",
        picture: ghUser.avatar_url || "",
        exp: Math.floor(nowMs / 1000) + SESSION_SECONDS
    };
}

function appRedirect(origin, profile, room) {
    const auth = Buffer.from(JSON.stringify(profile)).toString("base64url");
    return `${origin}/#auth=${auth}&room=${room || ""}`;
}

function errorRedirect(origin, reason, room) {
    return `${origin}/#auth_error=${encodeURIComponent(reason)}&room=${room || ""}`;
}

async function exchangeCode(config, code, callbackUrl) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: callbackUrl
        })
    });
    const body = await res.json();
    if (!res.ok || !body.access_token) throw new Error(body.error_description || body.error || `HTTP ${res.status}`);
    return body.access_token;
}

async function fetchGitHubUser(token) {
    const res = await fetch("https://api.github.com/user", {
        headers: {
            Accept: "application/vnd.github+json",
            Authorization: `Bearer ${token}`,
            "User-Agent": "jmeet-github-auth"
        }
    });
    if (!res.ok) throw new Error(`GitHub /user returned HTTP ${res.status}`);
    return res.json();
}

function redirect(res, location) {
    res.writeHead(302, { Location: location, "Cache-Control": "no-store" });
    res.end();
}

function createHandler(config, store, deps = { exchangeCode, fetchGitHubUser }) {
    return async (req, res) => {
        const url = new URL(req.url, "http://localhost");
        if (req.method !== "GET") {
            res.writeHead(405, { Allow: "GET" });
            return res.end();
        }
        const origin = requestOrigin(req);
        if (!origin) {
            res.writeHead(400, { "Content-Type": "text/plain" });
            return res.end("Open Jmeet on http://localhost:8001 or its trycloudflare.com address to sign in with GitHub.");
        }
        if (url.pathname === "/auth/github") {
            const state = store.issue(url.searchParams.get("room"), origin);
            return redirect(res, buildAuthorizeUrl(config, state, origin));
        }
        if (url.pathname === CALLBACK_PATH) {
            const entry = store.take(url.searchParams.get("state") || "");
            if (!entry) return redirect(res, errorRedirect(origin, "expired", ""));
            // The user pressed Cancel on GitHub's consent screen
            if (url.searchParams.get("error")) return redirect(res, errorRedirect(entry.origin, "denied", entry.room));
            try {
                const token = await deps.exchangeCode(config, url.searchParams.get("code") || "", entry.origin + CALLBACK_PATH);
                const ghUser = await deps.fetchGitHubUser(token);
                return redirect(res, appRedirect(entry.origin, profileFromGitHubUser(ghUser, Date.now()), entry.room));
            } catch (err) {
                console.error("GitHub sign-in failed:", err.message);
                return redirect(res, errorRedirect(entry.origin, "failed", entry.room));
            }
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    };
}

module.exports = {
    loadConfig, requestOrigin, buildAuthorizeUrl, createStateStore, profileFromGitHubUser,
    appRedirect, errorRedirect, createHandler
};
