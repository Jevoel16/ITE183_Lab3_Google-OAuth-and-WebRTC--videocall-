// The one port people open (8001), locally and through the Cloudflare tunnel.
// It forwards the page and the WebSocket to app.bzg on port 8000 and serves
// the GitHub sign-in routes itself, because Bonezegei can't make the HTTPS
// call GitHub needs.
const http = require("node:http");
const net = require("node:net");
const { loadConfig, createStateStore, createHandler } = require("./github-auth.js");

const PORT = 8001;
const APP_PORT = 8000; // app.bzg

// cloudflared sends "Sec-Websocket-Key", but Bonezegei's http.dll only accepts
// "Sec-WebSocket-Key" and drops the connection otherwise. HTTP header names
// are case-insensitive, so changing the casing is safe.
function fixUpgradeHeaders(head) {
    return head.replace(/^sec-websocket-key:/gim, "Sec-WebSocket-Key:");
}

// Rebuilds the request head with header names exactly as the browser sent them
function rawRequestHead(req) {
    const lines = [`${req.method} ${req.url} HTTP/${req.httpVersion}`];
    for (let i = 0; i < req.rawHeaders.length; i += 2) lines.push(`${req.rawHeaders[i]}: ${req.rawHeaders[i + 1]}`);
    return lines.join("\r\n") + "\r\n\r\n";
}

function isAuthPath(url) {
    const { pathname } = new URL(url, "http://localhost");
    return pathname === "/auth/github" || pathname.startsWith("/auth/github/");
}

function sendText(res, status, text) {
    res.writeHead(status, { "Content-Type": "text/plain; charset=utf-8", Connection: "close" });
    res.end(text);
}

// githubHandler is null when GitHub isn't set up in .env
function createGateway({ appPort = APP_PORT, githubHandler = null } = {}) {
    const server = http.createServer((req, res) => {
        if (isAuthPath(req.url)) {
            if (!githubHandler) return sendText(res, 503, "GitHub sign-in isn't set up. Add the GitHub keys to .env and restart.");
            return githubHandler(req, res);
        }
        // agent: false gives each request its own connection to Bonezegei
        const upstream = http.request(
            { host: "127.0.0.1", port: appPort, method: req.method, path: req.url, headers: req.headers, agent: false },
            (appRes) => {
                res.writeHead(appRes.statusCode, appRes.headers);
                appRes.pipe(res);
            }
        );
        upstream.on("error", () => {
            if (!res.headersSent) sendText(res, 502, `The app server on port ${appPort} isn't running. Start it with bzg run.`);
            else res.destroy();
        });
        req.pipe(upstream);
    });

    // WebSocket: pass the raw bytes through once the header casing is fixed
    server.on("upgrade", (req, socket, head) => {
        const target = net.connect(appPort, "127.0.0.1", () => {
            target.write(fixUpgradeHeaders(rawRequestHead(req)));
            if (head.length) target.write(head);
            socket.pipe(target);
            target.pipe(socket);
        });
        target.on("error", () => socket.destroy());
        socket.on("error", () => target.destroy());
    });

    return server;
}

function start() {
    let github;
    try {
        github = loadConfig(process.env);
    } catch (err) {
        console.error(err.message);
        process.exit(1);
    }
    const server = createGateway({ githubHandler: github && createHandler(github, createStateStore()) });
    server.on("error", (err) => {
        console.error(err.code === "EADDRINUSE"
            ? `Port ${PORT} is already in use. Stop the other process and try again.`
            : err.message);
        process.exit(1);
    });
    server.listen(PORT, () => {
        console.log(`Jmeet on http://localhost:${PORT} -> app.bzg on port ${APP_PORT}`
            + (github ? ", GitHub sign-in on" : ", GitHub sign-in off (no keys in .env)"));
    });
}

if (require.main === module) start();

module.exports = { fixUpgradeHeaders, rawRequestHead, isAuthPath, createGateway };
