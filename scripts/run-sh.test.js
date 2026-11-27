const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const repoRoot = path.join(__dirname, "..");
const script = path.join(repoRoot, "scripts", "run.sh");

// Writes text to a config file in a fresh temp directory and returns its path
function tempConfig(text) {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), "jmeet-run-sh-"));
    const file = path.join(dir, "config.bzg");
    fs.writeFileSync(file, text);
    return file;
}

// Sources run.sh and calls one of its functions with the given arguments.
// $0 is "_" so the script sees itself sourced; its path arrives through RUN_SH.
function callFunction(name, args) {
    const env = { ...process.env, RUN_SH: script };
    return spawnSync("bash", ["-c", `source "$RUN_SH"; ${name} "$@"`, "_", ...args], { encoding: "utf8", env });
}

// Sources run.sh and runs set_config_value on file, failing the test if bash fails
function setConfigValue(file, name, value) {
    const result = callFunction("set_config_value", [file, name, value]);
    assert.equal(result.status, 0, result.stderr);
}

test("set_config_value replaces an existing line", () => {
    const file = tempConfig('var useTunnel = 1;\nvar baseUrl = "x";\nvar other = 2;\n');
    setConfigValue(file, "baseUrl", '"http://localhost:8001"');
    const text = fs.readFileSync(file, "utf8");
    assert.equal(text, 'var useTunnel = 1;\nvar baseUrl = "http://localhost:8001";\nvar other = 2;\n');
    assert.equal(text.split("\n").filter((line) => line.startsWith("var baseUrl")).length, 1);
});

test("set_config_value appends a missing line", () => {
    const file = tempConfig("var useTunnel = 1;\n");
    setConfigValue(file, "tunnelPort", "8001");
    const text = fs.readFileSync(file, "utf8");
    assert.equal(text, "var useTunnel = 1;\nvar tunnelPort = 8001;\n");
    assert.ok(text.trimEnd().endsWith("var tunnelPort = 8001;"));
});

test("set_config_value writes metacharacters literally", () => {
    const value = '"https://a.trycloudflare.com/x?a=1&b=2|c"';
    const file = tempConfig('var baseUrl = "old";\n');
    setConfigValue(file, "baseUrl", value);
    assert.equal(fs.readFileSync(file, "utf8"), `var baseUrl = ${value};\n`);
});

test("run.sh skips outside npm", () => {
    const env = { ...process.env };
    delete env.npm_lifecycle_event;
    const result = spawnSync("bash", [script, "local"], { encoding: "utf8", env });
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /Skipping: start this with npm run local:linux\./);
});
