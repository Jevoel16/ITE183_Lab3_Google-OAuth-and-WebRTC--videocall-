// Local proxy for sharing the app through a Cloudflare quick tunnel.
// cloudflared sends "Sec-Websocket-Key", but Bonezegei's http.dll only accepts
// "Sec-WebSocket-Key" and drops the connection otherwise.
const net = require("node:net");

const LISTEN_PORT = 8001;
const TARGET_PORT = 8000; // app.bzg

// HTTP header names are case-insensitive, so changing the casing is safe.
function fixUpgradeHeaders(head) {
    return head.replace(/^sec-websocket-key:/gim, "Sec-WebSocket-Key:");
}

function start() {
    const server = net.createServer((client) => {
        const target = net.connect(TARGET_PORT, "127.0.0.1");
        let upgraded = false;

        client.on("data", (chunk) => {
            // After the 101 response the bytes are WebSocket frames, so pass them through untouched.
            if (upgraded) return target.write(chunk);
            target.write(Buffer.from(fixUpgradeHeaders(chunk.toString("latin1")), "latin1"));
        });
        target.on("data", (chunk) => {
            if (!upgraded && chunk.toString("latin1", 0, 12) === "HTTP/1.1 101") upgraded = true;
            client.write(chunk);
        });

        client.on("end", () => target.end());
        target.on("end", () => client.end());
        client.on("error", () => target.destroy());
        target.on("error", () => client.destroy());
    });

    server.on("error", (err) => {
        console.error(err.code === "EADDRINUSE"
            ? `Port ${LISTEN_PORT} is already in use. Stop the other process and try again.`
            : err.message);
        process.exit(1);
    });

    server.listen(LISTEN_PORT, () => {
        console.log(`Tunnel proxy on http://localhost:${LISTEN_PORT} -> app.bzg on port ${TARGET_PORT}`);
    });
}

if (require.main === module) start();

module.exports = { fixUpgradeHeaders };
