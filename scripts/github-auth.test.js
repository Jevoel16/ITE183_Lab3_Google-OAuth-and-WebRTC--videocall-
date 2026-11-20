const test = require("node:test");
const assert = require("node:assert/strict");
const auth = require("./github-auth.js");
const core = require("../public/jmeet-core.js");

const ENV = { GITHUB_CLIENT_ID: "abc123", GITHUB_CLIENT_SECRET: "shh" };
const TUNNEL = "https://brave-quiet-river.trycloudflare.com";
const tunnelReq = (url) => ({ method: "GET", url, headers: { host: "brave-quiet-river.trycloudflare.com" } });
const config = auth.loadConfig(ENV);

test("loadConfig returns null when GitHub isn't set up at all", () => {
    assert.equal(auth.loadConfig({}), null);
    assert.equal(auth.loadConfig({ GITHUB_CLIENT_ID: "YOUR_ID", GITHUB_CLIENT_SECRET: "YOUR_SECRET" }), null);
});

test("loadConfig lists every missing or placeholder key when half set up", () => {
    assert.throws(() => auth.loadConfig({ GITHUB_CLIENT_ID: "abc" }), /Missing in \.env: GITHUB_CLIENT_SECRET \(/);
});

test("requestOrigin accepts localhost and quick tunnels only", () => {
    const origin = (host) => auth.requestOrigin({ headers: { host } });
    assert.equal(origin("localhost:8001"), "http://localhost:8001");
    assert.equal(origin("127.0.0.1:8001"), "http://127.0.0.1:8001");
    assert.equal(origin("Brave-River.trycloudflare.com"), "https://brave-river.trycloudflare.com");
    assert.equal(origin("evil.example"), null);
    assert.equal(origin("x.trycloudflare.com.evil.example"), null);
    assert.equal(auth.requestOrigin({ headers: {} }), null);
});

test("buildAuthorizeUrl sends the client ID, callback, scope and state", () => {
    const url = new URL(auth.buildAuthorizeUrl(config, "s1", TUNNEL));
    assert.equal(url.origin + url.pathname, "https://github.com/login/oauth/authorize");
    assert.equal(url.searchParams.get("client_id"), "abc123");
    assert.equal(url.searchParams.get("redirect_uri"), TUNNEL + "/auth/github/callback");
    assert.equal(url.searchParams.get("scope"), "read:user");
    assert.equal(url.searchParams.get("state"), "s1");
    assert.equal(url.searchParams.has("client_secret"), false);
});

test("state store hands each state out once and expires it", () => {
    let now = 0;
    const store = auth.createStateStore(() => now);
    const a = store.issue("abc-defg-hij", TUNNEL);
    assert.deepEqual(store.take(a), { room: "abc-defg-hij", origin: TUNNEL, expires: 600000 });
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
    const location = auth.appRedirect(TUNNEL, profile, "abc-defg-hij");
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

test("/auth/github sends GitHub the callback on the address the visitor opened", async () => {
    const store = auth.createStateStore();
    const res = fakeRes();
    await auth.createHandler(config, store, {})(tunnelReq("/auth/github?room=abc-defg-hij"), res);
    const url = new URL(res.headers.Location);
    assert.equal(url.searchParams.get("redirect_uri"), TUNNEL + "/auth/github/callback");
    assert.equal(store.take(url.searchParams.get("state")).origin, TUNNEL);
});

test("/auth/github refuses a Host it doesn't know", async () => {
    const res = fakeRes();
    await auth.createHandler(config, auth.createStateStore(), {})(
        { method: "GET", url: "/auth/github", headers: { host: "evil.example" } }, res);
    assert.equal(res.status, 400);
});

test("callback signs the user in and returns to their room on the same address", async () => {
    const store = auth.createStateStore();
    const state = store.issue("abc-defg-hij", TUNNEL);
    const handler = auth.createHandler(config, store, {
        exchangeCode: async (_c, code, callbackUrl) => {
            assert.equal(code, "c0de");
            assert.equal(callbackUrl, TUNNEL + "/auth/github/callback");
            return "tok";
        },
        fetchGitHubUser: async (token) => { assert.equal(token, "tok"); return { login: "ana" }; }
    });
    const res = fakeRes();
    await handler(tunnelReq(`/auth/github/callback?code=c0de&state=${state}`), res);
    assert.equal(res.status, 302);
    assert.ok(res.headers.Location.startsWith(TUNNEL + "/#auth="));
    assert.equal(core.parseAuthFragment(new URL(res.headers.Location).hash).user.name, "ana");
});

test("callback with an unknown state or a GitHub error goes back with auth_error", async () => {
    const store = auth.createStateStore();
    const handler = auth.createHandler(config, store, {});
    const res = fakeRes();
    await handler(tunnelReq("/auth/github/callback?code=x&state=forged"), res);
    assert.equal(res.headers.Location, TUNNEL + "/#auth_error=expired&room=");

    const state = store.issue("abc-defg-hij", "http://localhost:8001");
    const res2 = fakeRes();
    await handler({ method: "GET", url: `/auth/github/callback?error=access_denied&state=${state}`,
        headers: { host: "localhost:8001" } }, res2);
    assert.equal(res2.headers.Location, "http://localhost:8001/#auth_error=denied&room=abc-defg-hij");
});
