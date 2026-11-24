const test = require("node:test");
const assert = require("node:assert/strict");
const core = require("../public/jmeet-core.js");

const ana = { name: "Ana", picture: "" };

test("sign-in machine allows every listed transition", () => {
    const { authTransition } = core;
    assert.deepEqual(authTransition({ status: "checking" }, { type: "ok", user: ana }), { status: "signedIn", user: ana });
    assert.deepEqual(authTransition({ status: "checking" }, { type: "unauthorized" }), { status: "signedOut" });
    assert.deepEqual(authTransition({ status: "checking" }, { type: "error" }), { status: "failed" });
    const signedIn = { status: "signedIn", user: ana };
    const ben = { name: "Ben", picture: "" };
    assert.deepEqual(authTransition(signedIn, { type: "ok", user: ben }), { status: "signedIn", user: ben });
    assert.deepEqual(authTransition(signedIn, { type: "unauthorized" }), { status: "signedOut" });
    assert.deepEqual(authTransition(signedIn, { type: "logout" }), { status: "signedOut" });
    assert.deepEqual(authTransition({ status: "failed" }, { type: "retry" }), { status: "checking" });
});

test("sign-in machine rejects invalid transitions and empty profiles", () => {
    assert.throws(() => core.authTransition({ status: "signedOut" }, { type: "ok", user: ana }));
    assert.throws(() => core.authTransition({ status: "signedOut" }, { type: "logout" }));
    assert.throws(() => core.authTransition({ status: "signedIn", user: ana }, { type: "error" }));
    assert.throws(() => core.authTransition({ status: "checking" }, { type: "retry" }));
    assert.throws(() => core.authTransition({ status: "checking" }, { type: "ok", user: { name: "" } }));
});

test("call machine allows every listed transition", () => {
    const { CALL, callTransition } = core;
    assert.equal(callTransition(CALL.IDLE, "join"), CALL.JOINING);
    assert.equal(callTransition(CALL.JOINING, "connected"), CALL.IN_CALL);
    assert.equal(callTransition(CALL.JOINING, "end"), CALL.IDLE);
    assert.equal(callTransition(CALL.IN_CALL, "end"), CALL.IDLE);
});

test("call machine rejects invalid transitions", () => {
    assert.throws(() => core.callTransition(core.CALL.IDLE, "end"));
    assert.throws(() => core.callTransition(core.CALL.IN_CALL, "join"));
    assert.throws(() => core.callTransition(core.CALL.IDLE, "connected"));
});

test("profileToUser reads Google and GitHub profiles", () => {
    assert.deepEqual(core.profileToUser({ name: "Ana Cruz", picture: "https://lh3.googleusercontent.com/a/x" }),
        { name: "Ana Cruz", picture: "https://lh3.googleusercontent.com/a/x" });
    assert.deepEqual(core.profileToUser({ login: "anacruz", name: null, avatar_url: "https://avatars.githubusercontent.com/u/1" }),
        { name: "anacruz", picture: "https://avatars.githubusercontent.com/u/1" });
    assert.deepEqual(core.profileToUser({ email: "a@b.c" }), { name: "a@b.c", picture: "" });
    assert.deepEqual(core.profileToUser(null), { name: "Participant", picture: "" });
});

test("profileToUser drops avatars from other hosts", () => {
    assert.equal(core.profileToUser({ name: "A", picture: "https://evil.example/x.png" }).picture, "");
});

test("isAllowedPicture only accepts Google and GitHub avatars over https", () => {
    assert.ok(core.isAllowedPicture("https://lh3.googleusercontent.com/a/x"));
    assert.ok(core.isAllowedPicture("https://avatars.githubusercontent.com/u/1?v=4"));
    assert.equal(core.isAllowedPicture("https://evil.example/avatars.githubusercontent.com"), false);
    assert.equal(core.isAllowedPicture("http://avatars.githubusercontent.com/u/1"), false);
    assert.equal(core.isAllowedPicture("not a url"), false);
});

test("initialOf gives an uppercase letter or ?", () => {
    assert.equal(core.initialOf(" ana"), "A");
    assert.equal(core.initialOf(""), "?");
    assert.equal(core.initialOf(null), "?");
});

test("gridColumns fits up to 8 tiles", () => {
    assert.deepEqual([1, 2, 3, 4, 5, 6, 7, 8].map(core.gridColumns), [1, 2, 2, 2, 3, 3, 3, 3]);
});

test("small signals pass through unsplit", () => {
    const data = { type: "candidate", candidate: { candidate: "x" } };
    assert.deepEqual(core.splitSignal(data, "c1", 3000), [data]);
});

test("big signals split into parts and join back in any order", () => {
    const data = { type: "offer", description: { type: "offer", sdp: "v=0\r\n".repeat(2000) } };
    const parts = core.splitSignal(data, "c1", 3000);
    assert.ok(parts.length > 1);
    assert.ok(parts.every(p => p.type === "chunk" && p.part.length <= 3000));
    const store = new Map();
    const shuffled = [...parts].reverse();
    const results = shuffled.map(p => core.collectChunk(store, 2, p));
    assert.deepEqual(results.slice(0, -1), Array(parts.length - 1).fill(null));
    assert.deepEqual(results.at(-1), data);
    assert.equal(store.size, 0);
});

test("collectChunk keeps senders apart and ignores bad parts", () => {
    const store = new Map();
    const [a0, a1] = core.splitSignal({ s: "x".repeat(50) }, "same", 40);
    assert.equal(core.collectChunk(store, 1, a0), null);
    assert.equal(core.collectChunk(store, 2, a1), null); // other sender, same cid
    assert.equal(core.collectChunk(store, 1, { cid: "z", i: 5, n: 2, part: "" }), null);
    assert.equal(core.collectChunk(store, 1, null), null);
    assert.deepEqual(core.collectChunk(store, 1, a1), { s: "x".repeat(50) });
});

test("parseTheme falls back to system", () => {
    assert.equal(core.parseTheme("light"), "light");
    assert.equal(core.parseTheme("dark"), "dark");
    for (const v of [null, "", "Dark", "system", "blue"]) assert.equal(core.parseTheme(v), "system");
});
