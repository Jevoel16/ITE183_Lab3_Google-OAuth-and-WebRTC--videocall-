// Syntax checks for CI: the server (Bonezegei) can't run on GitHub's runners,
// so this catches broken JSON and JavaScript before anyone runs `bzg run`.
const fs = require("fs");
const path = require("path");
const vm = require("vm");

const root = path.join(__dirname, "..");
let failed = 0;

function check(label, fn) {
    try {
        fn();
        console.log(`ok    ${label}`);
    } catch (err) {
        failed++;
        console.error(`FAIL  ${label}: ${err.message}`);
    }
}

const read = (file) => fs.readFileSync(path.join(root, file), "utf8");
// Compile without running, so browser globals don't matter.
const compile = (code, file) => new vm.Script(code, { filename: file });

// lib/ is the vendored Bonezegei module and is left as shipped.
check("package.json", () => JSON.parse(read("package.json")));

check("public/config.example.js", () => compile(read("public/config.example.js"), "config.example.js"));

// Inline <script> blocks only; external ones (src=...) are skipped.
for (const file of ["public/index.html", "public/404.html"]) {
    const scripts = [...read(file).matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)];
    scripts.forEach((m, i) => check(`${file} inline script #${i + 1}`, () => compile(m[1], file)));
}

if (failed) {
    console.error(`\n${failed} check(s) failed`);
    process.exit(1);
}
console.log("\nAll syntax checks passed");
