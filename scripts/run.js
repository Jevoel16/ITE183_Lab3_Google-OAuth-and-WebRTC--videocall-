// npm run dev / share / tunnel: starts the pieces Jmeet needs in one
// terminal, labels their output, and stops them all together.
const { spawn } = require("node:child_process");
const { writeConfigFile } = require("./write-config.js");

const PROGRAMS = {
    app: ["bonezegei", ["app.bzg"]],
    gateway: [process.execPath, ["--env-file-if-exists=.env", "scripts/gateway.js"]],
    // --config NUL skips %USERPROFILE%\.cloudflared\config.yml, whose catch-all
    // rule answers every quick-tunnel address with an empty 404
    tunnel: ["cloudflared", ["tunnel", "--config", "NUL", "--url", "http://localhost:8001"]]
};

const MODES = {
    dev: ["app", "gateway"],
    share: ["app", "gateway", "tunnel"],
    tunnel: ["tunnel"]
};

// bzg run starts every package.json script at once; npm sets
// npm_lifecycle_event and bzg doesn't, so these skip themselves there
const startedByBzg = (env) => !env.npm_lifecycle_event;

function findTunnelUrl(line) {
    const match = String(line).match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/);
    return match ? match[0] : null;
}

function refreshConfig() {
    try {
        console.log(`[config] Wrote public/config.js (${writeConfigFile(process.env)})`);
    } catch (err) {
        console.log(`[config] Skipped: ${err.message}`);
    }
}

function start(name, children, stopAll) {
    const [cmd, args] = PROGRAMS[name];
    const child = spawn(cmd, args, { stdio: ["ignore", "pipe", "pipe"] });
    let shownUrl = false;
    const print = (chunk) => {
        for (const line of String(chunk).split(/\r?\n/)) {
            if (!line.trim()) continue;
            console.log(`[${name}] ${line}`);
            const url = !shownUrl && findTunnelUrl(line);
            if (url) {
                shownUrl = true;
                console.log(`\n  Share this address: ${url}\n  Add it to Google's Authorized JavaScript origins first. It can take a minute to start working.\n`);
            }
        }
    };
    child.stdout.on("data", print);
    child.stderr.on("data", print);
    child.on("error", (err) => {
        console.error(err.code === "ENOENT" ? `[${name}] ${cmd} isn't installed or isn't on PATH.` : `[${name}] ${err.message}`);
        stopAll(1);
    });
    // One piece stopping (a busy port, a crash) stops the rest
    child.on("exit", (code) => {
        console.log(`[${name}] stopped${code ? ` (exit code ${code})` : ""}`);
        stopAll(code || 0);
    });
    children.push(child);
}

function main(mode) {
    if (!MODES[mode]) {
        console.error(`Unknown mode "${mode}". Use one of: ${Object.keys(MODES).join(", ")}.`);
        process.exit(1);
    }
    if (startedByBzg(process.env)) {
        console.log(`Skipping "${mode}" under bzg run. Use npm run ${mode}.`);
        return;
    }
    if (MODES[mode].includes("app")) refreshConfig();

    const children = [];
    let stopping = false;
    const stopAll = (code) => {
        if (stopping) return;
        stopping = true;
        for (const child of children) if (child.exitCode === null) child.kill();
        process.exitCode = code;
    };
    process.on("SIGINT", () => stopAll(0));

    for (const name of MODES[mode]) start(name, children, stopAll);
    if (MODES[mode].includes("gateway")) console.log("Open http://localhost:8001 (Ctrl+C stops everything)");
}

if (require.main === module) main(process.argv[2]);

module.exports = { MODES, PROGRAMS, startedByBzg, findTunnelUrl };
