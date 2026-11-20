// GitHub sign-in routes, served by scripts/gateway.js. GitHub only hands out
// a profile after a server swaps the login code for a token using the client
// secret, and Bonezegei can't make HTTPS requests, so Node does that step.
// The token is used once to read the profile and never reaches the browser.
const crypto = require("node:crypto");
const { isRoomCode } = require("../public/jmeet-core.js");

const STATE_TTL_MS = 10 * 60 * 1000;
const SESSION_SECONDS = 8 * 60 * 60;
const REQUIRED_KEYS = ["GITHUB_CLIENT_ID", "GITHUB_CLIENT_SECRET", "APP_URL", "GITHUB_CALLBACK_URL"];
const isSet = (value) => !!value && !value.startsWith("YOUR_");

// null when GitHub isn't set up at all (Google-only is fine); fails fast,
// listing every missing or broken key, when it's only half set up
function loadConfig(env) {
    if (!isSet(env.GITHUB_CLIENT_ID) && !isSet(env.GITHUB_CLIENT_SECRET)) return null;
    const missing = REQUIRED_KEYS.filter((key) => !isSet(env[key]));
    if (missing.length) throw new Error(`Missing in .env: ${missing.join(", ")} (see .env.example)`);
    for (const key of ["APP_URL", "GITHUB_CALLBACK_URL"]) {
        try { new URL(env[key]); } catch (e) { throw new Error(`${key} is not a valid URL: ${env[key]}`); }
    }
    return {
        clientId: env.GITHUB_CLIENT_ID,
        clientSecret: env.GITHUB_CLIENT_SECRET,
        appUrl: env.APP_URL.replace(/\/+$/, "") + "/",
        callbackUrl: env.GITHUB_CALLBACK_URL
    };
}

function buildAuthorizeUrl(config, state) {
    const url = new URL("https://github.com/login/oauth/authorize");
    url.searchParams.set("client_id", config.clientId);
    url.searchParams.set("redirect_uri", config.callbackUrl);
    url.searchParams.set("scope", "read:user");
    url.searchParams.set("state", state);
    url.searchParams.set("allow_signup", "true");
    return url.toString();
}

// The random state ties the callback to a login this server started (CSRF check)
function createStateStore(now = Date.now) {
    const pending = new Map();
    return {
        issue(room) {
            const state = crypto.randomBytes(16).toString("hex");
            pending.set(state, { room: isRoomCode(room) ? room : "", expires: now() + STATE_TTL_MS });
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

function appRedirect(appUrl, profile, room) {
    const auth = Buffer.from(JSON.stringify(profile)).toString("base64url");
    return `${appUrl}#auth=${auth}&room=${room || ""}`;
}

function errorRedirect(appUrl, reason, room) {
    return `${appUrl}#auth_error=${encodeURIComponent(reason)}&room=${room || ""}`;
}

async function exchangeCode(config, code) {
    const res = await fetch("https://github.com/login/oauth/access_token", {
        method: "POST",
        headers: { Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify({
            client_id: config.clientId,
            client_secret: config.clientSecret,
            code,
            redirect_uri: config.callbackUrl
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
        if (url.pathname === "/auth/github") {
            return redirect(res, buildAuthorizeUrl(config, store.issue(url.searchParams.get("room"))));
        }
        if (url.pathname === "/auth/github/callback") {
            const entry = store.take(url.searchParams.get("state") || "");
            if (!entry) return redirect(res, errorRedirect(config.appUrl, "expired", ""));
            // The user pressed Cancel on GitHub's consent screen
            if (url.searchParams.get("error")) return redirect(res, errorRedirect(config.appUrl, "denied", entry.room));
            try {
                const token = await deps.exchangeCode(config, url.searchParams.get("code") || "");
                const ghUser = await deps.fetchGitHubUser(token);
                return redirect(res, appRedirect(config.appUrl, profileFromGitHubUser(ghUser, Date.now()), entry.room));
            } catch (err) {
                console.error("GitHub sign-in failed:", err.message);
                return redirect(res, errorRedirect(config.appUrl, "failed", entry.room));
            }
        }
        res.writeHead(404, { "Content-Type": "text/plain" });
        res.end("Not found");
    };
}

module.exports = {
    loadConfig, buildAuthorizeUrl, createStateStore, profileFromGitHubUser,
    appRedirect, errorRedirect, createHandler
};
