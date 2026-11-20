const test = require("node:test");
const assert = require("node:assert");
const http = require("node:http");
const { fixUpgradeHeaders, rawRequestHead, isAuthPath, createGateway } = require("./gateway");

const upgrade = (keyHeader) =>
    "GET / HTTP/1.1\r\nHost: x.trycloudflare.com\r\nUpgrade: websocket\r\n" +
    `${keyHeader}: abc==\r\nSec-Websocket-Version: 13\r\n\r\n`;

test("rewrites the Go-style key header that cloudflared sends", () => {
    assert.match(fixUpgradeHeaders(upgrade("Sec-Websocket-Key")), /\r\nSec-WebSocket-Key: abc==\r\n/);
});

test("rewrites an all-lowercase key header", () => {
    assert.match(fixUpgradeHeaders(upgrade("sec-websocket-key")), /\r\nSec-WebSocket-Key: abc==\r\n/);
});

test("leaves a correctly spelled request unchanged", () => {
    const head = upgrade("Sec-WebSocket-Key");
    assert.strictEqual(fixUpgradeHeaders(head), head);
});

test("does not touch the key text inside other header values", () => {
    const head = "GET / HTTP/1.1\r\nX-Note: sec-websocket-key: no\r\n\r\n";
    assert.strictEqual(fixUpgradeHeaders(head), head);
});

test("rawRequestHead keeps header names as sent", () => {
    const req = { method: "GET", url: "/", httpVersion: "1.1", rawHeaders: ["Host", "a", "Sec-Websocket-Key", "k=="] };
    assert.strictEqual(rawRequestHead(req), "GET / HTTP/1.1\r\nHost: a\r\nSec-Websocket-Key: k==\r\n\r\n");
});

test("isAuthPath only matches the GitHub sign-in routes", () => {
    assert.ok(isAuthPath("/auth/github?room=abc-defg-hij"));
    assert.ok(isAuthPath("/auth/github/callback?code=x"));
    assert.strictEqual(isAuthPath("/auth/githubx"), false);
    assert.strictEqual(isAuthPath("/"), false);
});

function listen(server) {
    return new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));
}

function get(port, path) {
    return new Promise((resolve, reject) => {
        http.get({ host: "127.0.0.1", port, path, agent: false }, (res) => {
            let body = "";
            res.on("data", (c) => (body += c));
            res.on("end", () => resolve({ status: res.statusCode, body }));
        }).on("error", reject);
    });
}

test("forwards pages to the app and serves GitHub routes itself", async (t) => {
    const app = http.createServer((req, res) => res.end("app:" + req.url));
    const appPort = await listen(app);
    const gateway = createGateway({ appPort, githubHandler: (req, res) => res.end("github") });
    const port = await listen(gateway);
    t.after(() => { app.close(); gateway.close(); });

    assert.deepStrictEqual(await get(port, "/style.css"), { status: 200, body: "app:/style.css" });
    assert.deepStrictEqual(await get(port, "/auth/github?room=abc-defg-hij"), { status: 200, body: "github" });
});

test("returns 503 for GitHub routes when GitHub isn't set up", async (t) => {
    const gateway = createGateway();
    const port = await listen(gateway);
    t.after(() => gateway.close());

    const res = await get(port, "/auth/github");
    assert.strictEqual(res.status, 503);
    assert.match(res.body, /isn't set up/);
});

test("returns 502 when app.bzg isn't running", async (t) => {
    const probe = http.createServer();
    const deadPort = await listen(probe);
    await new Promise((r) => probe.close(r));
    const gateway = createGateway({ appPort: deadPort });
    const port = await listen(gateway);
    t.after(() => gateway.close());

    const res = await get(port, "/");
    assert.strictEqual(res.status, 502);
    assert.match(res.body, /isn't running/);
});
