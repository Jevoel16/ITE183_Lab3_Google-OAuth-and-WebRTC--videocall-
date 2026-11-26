const test = require("node:test");
const assert = require("node:assert/strict");
const net = require("node:net");
const { fixUpgradeHeaders, createProxy } = require("./tunnel-proxy");

const upgrade = (keyHeader) =>
    "GET /signal HTTP/1.1\r\nHost: x.trycloudflare.com\r\nUpgrade: websocket\r\n" +
    `${keyHeader}: abc==\r\nSec-Websocket-Version: 13\r\n\r\n`;

test("rewrites the Go-style key header that cloudflared sends", () => {
    assert.match(fixUpgradeHeaders(upgrade("Sec-Websocket-Key")), /\r\nSec-WebSocket-Key: abc==\r\n/);
});

test("rewrites an all-lowercase key header", () => {
    assert.match(fixUpgradeHeaders(upgrade("sec-websocket-key")), /\r\nSec-WebSocket-Key: abc==\r\n/);
});

test("leaves a correctly spelled request unchanged", () => {
    const head = upgrade("Sec-WebSocket-Key");
    assert.equal(fixUpgradeHeaders(head), head);
});

test("does not touch the key text inside other header values", () => {
    const head = "GET / HTTP/1.1\r\nX-Note: sec-websocket-key: no\r\n\r\n";
    assert.equal(fixUpgradeHeaders(head), head);
});

const listen = (server) => new Promise((resolve) => server.listen(0, "127.0.0.1", () => resolve(server.address().port)));

test("proxy fixes the handshake, then passes frames through untouched", async () => {
    const received = [];
    const app = net.createServer((socket) => {
        socket.once("data", (head) => {
            received.push(head.toString("latin1"));
            socket.write("HTTP/1.1 101 Switching Protocols\r\n\r\n");
            socket.on("data", (frame) => received.push(frame.toString("latin1")));
        });
    });
    const proxy = createProxy(await listen(app));
    const proxyPort = await listen(proxy);

    const client = net.connect(proxyPort, "127.0.0.1");
    await new Promise((resolve) => client.on("connect", resolve));
    client.write(upgrade("Sec-Websocket-Key"));
    await new Promise((resolve) => client.once("data", resolve));
    // Looks like a header line, but after the upgrade it must stay as sent
    client.write("sec-websocket-key: frame");
    await new Promise((resolve) => setTimeout(resolve, 100));

    client.destroy();
    proxy.close();
    app.close();
    assert.match(received[0], /\r\nSec-WebSocket-Key: abc==\r\n/);
    assert.equal(received[1], "sec-websocket-key: frame");
});
