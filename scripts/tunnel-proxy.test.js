const test = require("node:test");
const assert = require("node:assert");
const { fixUpgradeHeaders } = require("./tunnel-proxy");

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
