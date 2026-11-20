const test = require("node:test");
const assert = require("node:assert/strict");
const { MODES, PROGRAMS, startedByBzg, findTunnelUrl } = require("./run.js");

test("each mode starts only known programs", () => {
    assert.deepEqual(MODES.dev, ["app", "gateway"]);
    assert.deepEqual(MODES.share, ["app", "gateway", "tunnel"]);
    assert.deepEqual(MODES.tunnel, ["tunnel"]);
    for (const names of Object.values(MODES)) for (const name of names) assert.ok(PROGRAMS[name], name);
});

test("the tunnel points at the gateway port", () => {
    assert.ok(PROGRAMS.tunnel[1].includes("http://localhost:8001"));
});

test("skips itself when bzg run starts it", () => {
    assert.equal(startedByBzg({}), true);
    assert.equal(startedByBzg({ npm_lifecycle_event: "dev" }), false);
});

test("finds the quick-tunnel address in cloudflared's output", () => {
    const line = "2026-11-20T03:00:00Z INF |  https://brave-quiet-river-lamp.trycloudflare.com  |";
    assert.equal(findTunnelUrl(line), "https://brave-quiet-river-lamp.trycloudflare.com");
    assert.equal(findTunnelUrl("INF Requesting new quick Tunnel on trycloudflare.com..."), null);
});
