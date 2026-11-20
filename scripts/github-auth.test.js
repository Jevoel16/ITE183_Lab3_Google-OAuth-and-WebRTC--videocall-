const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("./github-auth.js");
const core = require("../public/jmeet-core.js");

const ENV = {
    GITHUB_CLIENT_ID: "abc123",
    GITHUB_CLIENT_SECRET: "shh",
    APP_URL: "http://localhost:8000",
    GITHUB_CALLBACK_URL: "http://localhost:8001/auth/github/callback"
};
const config = auth.loadConfig(ENV);

test("loadConfig returns null when GitHub isn't set up at all", () => {
    assert.equal(auth.loadConfig({}), null);
    assert.equal(auth.loadConfig({ GITHUB_CLIENT_ID: "YOUR_ID", GITHUB_CLIENT_SECRET: "YOUR_SECRET" }), null);
});

test("loadConfig lists every missing or placeholder key when half set up", () => {
    assert.throws(() => auth.loadConfig({ GITHUB_CLIENT_ID: "abc", APP_URL: "YOUR_URL" }),
        /GITHUB_CLIENT_SECRET, APP_URL, GITHUB_CALLBACK_URL/);
});

test("loadConfig rejects a broken URL and normalizes APP_URL", () => {
    assert.throws(() => auth.loadConfig({ ...ENV, APP_URL: "localhost" }), /APP_URL is not a valid URL/);
    assert.equal(auth.loadConfig({ ...ENV, APP_URL: "http://localhost:8000///" }).appUrl, "http://localhost:8000/");
});

test("buildAuthorizeUrl sends the client ID, callback, scope and state", () => {
    const url = new URL(auth.buildAuthorizeUrl(config, "s1"));
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "abc123");
    assert.equal(url.searchParams.get("redirect_uri"), ENV.GITHUB_CALLBACK_URL);
    assert.equal(url.searchParams.get("scope"), "read:user");
    assert.equal(url.searchParams.get("state"), "s1");
    assert.equal(url.searchParams.has("client_secret"), false);
});

test("state store hands each state out once and expires it", () => {
    let now = 0;
    const store = auth.createStateStore(() => now);
    const a = store.issue("abc-defg-hij");
    assert.deepEqual(store.take(a), { room: "abc-defg-hij", expires: 600000 });
    assert.equal(store.take(a), null);
    const b = store.issue("not a room");
    now = 600001;
    assert.equal(store.take(b), null);
    assert.equal(store.take("made-up"), null);
});

test("profileFromGitHubUser falls back to the login name", () => {
    const p = auth.profileFromGitHubUser({ login: "ana", avatar_url: "https://avatars.githubusercontent.com/u/1" }, 1000);
    assert.deepEqual(p, { provider: "github", name: "ana", email: "",
        picture: "https://avatars.githubusercontent.com/u/1", exp: 1 + 8 * 3600 });
});

test("appRedirect output is read back by the page", () => {
    const profile = auth.profileFromGitHubUser({ login: "ana", name: "Ana" }, Date.now());
    const location = auth.appRedirect(config.appUrl, profile, "abc-defg-hij");
    const parsed = core.parseAuthFragment(new URL(location).hash);
    assert.equal(parsed.user.name, "Ana");
    assert.equal(parsed.room, "abc-defg-hij");
});

function fakeRes() {
    return {
        status: 0, headers: {},
        writeHead(status, headers) { this.status = status; this.headers = headers || {}; },
        end() {}
    };
}

test("callback signs the user in and returns to their room", async () => {
    const store = auth.createStateStore();
    const state = store.issue("abc-defg-hij");
    const handler = auth.createHandler(config, store, {
        exchangeCode: async (_c, code) => { assert.equal(code, "c0de"); return "tok"; },
        fetchGitHubUser: async (token) => { assert.equal(token, "tok"); return { login: "ana" }; }
    });
    const res = fakeRes();
    await handler({ method: "GET", url: `/auth/github/callback?code=c0de&state=${state}` }, res);
    assert.equal(res.status, 302);
    assert.equal(core.parseAuthFragment(new URL(res.headers.Location).hash).user.name, "ana");
});

test("callback with an unknown state or a GitHub error goes back with auth_error", async () => {
    const store = auth.createStateStore();
    const handler = auth.createHandler(config, store, {});
    const res = fakeRes();
    await handler({ method: "GET", url: "/auth/github/callback?code=x&state=forged" }, res);
    assert.equal(res.headers.Location, "http://localhost:8000/#auth_error=expired&room=");

    const state = store.issue("abc-defg-hij");
    const res2 = fakeRes();
    await handler({ method: "GET", url: `/auth/github/callback?error=access_denied&state=${state}` }, res2);
    assert.equal(res2.headers.Location, "http://localhost:8000/#auth_error=denied&room=abc-defg-hij");
});
