const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../public/jmeet-core.js");

const NOW = Date.UTC(2026, 10, 20);
const future = NOW / 1000 + 3600;
const toB64Url = (obj) => Buffer.from(JSON.stringify(obj)).toString("base64url");

test("room codes are generated in the abc-defg-hij shape", () => {
    const code = core.makeRoomCode(() => 0);
    assert.equal(code, "aaa-aaaa-aaa");
    assert.ok(core.isRoomCode(core.makeRoomCode((n) => Math.floor(Math.random() * n))));
});

test("isRoomCode rejects other shapes", () => {
    for (const bad of ["", "abc-defg-hi", "ABC-DEFG-HIJ", "abc-defg-hij-", "abc_defg_hij", null]) {
        assert.equal(core.isRoomCode(bad), false, String(bad));
    }
});

test("normalizeRoomInput accepts pasted codes and links", () => {
    assert.equal(core.normalizeRoomInput(" ABC-DEFG-HIJ "), "abc-defg-hij");
    assert.equal(core.normalizeRoomInput("http://localhost:8000/#abc-defg-hij"), "abc-defg-hij");
    assert.equal(core.normalizeRoomInput("hello"), "");
});

test("roomFromHash reads a room code from the URL hash", () => {
    assert.equal(core.roomFromHash("#abc-defg-hij"), "abc-defg-hij");
    assert.equal(core.roomFromHash("#nope"), "");
    assert.equal(core.roomFromHash(""), "");
});

test("connection machine allows every listed transition", () => {
    const { CONN, connTransition } = core;
    assert.equal(connTransition(CONN.CONNECTING, "opened"), CONN.OPEN);
    assert.equal(connTransition(CONN.CONNECTING, "lost"), CONN.RECONNECTING);
    assert.equal(connTransition(CONN.CONNECTING, "close"), CONN.CLOSED);
    assert.equal(connTransition(CONN.OPEN, "lost"), CONN.RECONNECTING);
    assert.equal(connTransition(CONN.OPEN, "close"), CONN.CLOSED);
    assert.equal(connTransition(CONN.RECONNECTING, "opened"), CONN.OPEN);
    assert.equal(connTransition(CONN.RECONNECTING, "close"), CONN.CLOSED);
});

test("connection machine rejects invalid transitions", () => {
    assert.throws(() => core.connTransition(core.CONN.CLOSED, "opened"));
    assert.throws(() => core.connTransition(core.CONN.OPEN, "opened"));
});

test("reconnect delay doubles up to 15 seconds", () => {
    assert.deepEqual([0, 1, 2, 3, 4, 10].map(core.reconnectDelay), [1000, 2000, 4000, 8000, 15000, 15000]);
});

test("sign-in machine signs in and out", () => {
    const user = { provider: "github", name: "Ana", exp: Date.now() / 1000 + 60 };
    const signedIn = core.authTransition({ status: "signedOut" }, { type: "signIn", user });
    assert.deepEqual(signedIn, { status: "signedIn", user });
    assert.deepEqual(core.authTransition(signedIn, { type: "signOut" }), { status: "signedOut" });
});

test("sign-in machine rejects invalid transitions and profiles", () => {
    assert.throws(() => core.authTransition({ status: "signedOut" }, { type: "signOut" }));
    assert.throws(() => core.authTransition({ status: "signedOut" },
        { type: "signIn", user: { provider: "myspace", name: "x", exp: Date.now() / 1000 + 60 } }));
    assert.throws(() => core.authTransition({ status: "signedOut" },
        { type: "signIn", user: { provider: "google", name: "x", exp: 1 } }));
});

test("isAllowedPicture only accepts Google and GitHub avatars over https", () => {
    assert.ok(core.isAllowedPicture("https://lh3.googleusercontent.com/a/x"));
    assert.ok(core.isAllowedPicture("https://avatars.githubusercontent.com/u/1?v=4"));
    assert.equal(core.isAllowedPicture("https://evil.example/avatars.githubusercontent.com"), false);
    assert.equal(core.isAllowedPicture("http://avatars.githubusercontent.com/u/1"), false);
    assert.equal(core.isAllowedPicture("not a url"), false);
});

test("parseAuthFragment reads the GitHub helper redirect", () => {
    const hash = "#auth=" + toB64Url({ provider: "github", name: "Ana", email: "a@b.c",
        picture: "https://avatars.githubusercontent.com/u/1", exp: future }) + "&room=abc-defg-hij";
    assert.deepEqual(core.parseAuthFragment(hash, NOW), {
        user: { provider: "github", name: "Ana", email: "a@b.c",
                picture: "https://avatars.githubusercontent.com/u/1", exp: future },
        room: "abc-defg-hij"
    });
});

test("parseAuthFragment rejects missing, broken, expired or foreign profiles", () => {
    assert.equal(core.parseAuthFragment("#abc-defg-hij", NOW), null);
    assert.equal(core.parseAuthFragment("#auth=%%%", NOW), null);
    assert.equal(core.parseAuthFragment("#auth=" + toB64Url({ provider: "github", name: "A", exp: 1 }), NOW), null);
    assert.equal(core.parseAuthFragment("#auth=" + toB64Url({ provider: "google", name: "A", exp: future }), NOW), null);
});

test("parseAuthFragment drops avatars from other hosts", () => {
    const hash = "#auth=" + toB64Url({ provider: "github", name: "A", picture: "https://evil.example/x.png", exp: future });
    assert.equal(core.parseAuthFragment(hash, NOW).user.picture, "");
});

test("parseTheme falls back to system", () => {
    assert.equal(core.parseTheme("light"), "light");
    assert.equal(core.parseTheme("dark"), "dark");
    for (const v of [null, "", "Dark", "system", "blue"]) assert.equal(core.parseTheme(v), "system");
});
