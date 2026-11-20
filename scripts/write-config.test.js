const test = require("node:test");
const assert = require("node:assert/strict");
const vm = require("node:vm");
const { buildConfig, renderConfigJs } = require("./write-config.js");

const GOOGLE = { GOOGLE_CLIENT_ID: "123-abc.apps.googleusercontent.com" };
const GITHUB = { GITHUB_CLIENT_ID: "Ov23li" };

test("buildConfig reads Google, GitHub and TURN keys", () => {
    const config = buildConfig({
        ...GOOGLE, ...GITHUB,
        TURN_URLS: "turn:relay.example:3478, turns:relay.example:443?transport=tcp",
        TURN_USERNAME: "user", TURN_CREDENTIAL: "pass"
    });
    assert.deepEqual(config, {
        googleClientId: "123-abc.apps.googleusercontent.com",
        githubAuthUrl: "/auth/github",
        iceServers: [{ urls: ["turn:relay.example:3478", "turns:relay.example:443?transport=tcp"],
                       username: "user", credential: "pass" }]
    });
});

test("buildConfig leaves out providers that still have placeholders", () => {
    const config = buildConfig({ ...GOOGLE, GITHUB_CLIENT_ID: "YOUR_GITHUB_CLIENT_ID", TURN_URLS: "YOUR_TURN_URLS" });
    assert.equal(config.githubAuthUrl, "");
    assert.deepEqual(config.iceServers, []);
    assert.equal(buildConfig(GITHUB).googleClientId, "");
});

test("buildConfig refuses to write without any sign-in provider", () => {
    assert.throws(() => buildConfig({}), /GOOGLE_CLIENT_ID or the GitHub keys/);
});

test("buildConfig needs TURN credentials when TURN_URLS is set", () => {
    assert.throws(() => buildConfig({ ...GOOGLE, TURN_URLS: "turn:relay.example:3478" }), /TURN_USERNAME/);
});

test("renderConfigJs produces a script that sets window.JMEET_CONFIG", () => {
    const config = buildConfig({ ...GOOGLE, GOOGLE_CLIENT_ID: 'x"; alert(1); "' });
    const sandbox = { window: {} };
    vm.runInNewContext(renderConfigJs(config), sandbox);
    assert.equal(sandbox.window.JMEET_CONFIG.googleClientId, 'x"; alert(1); "');
});
