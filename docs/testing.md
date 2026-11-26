# Testing

## Automated

`npm test` checks the syntax of `package.json` and the inline scripts in the HTML pages, then runs [scripts/jmeet-core.test.js](../scripts/jmeet-core.test.js):

- both state machines (every allowed transition and some rejected ones)
- reading Google and GitHub profiles, and the avatar host check
- grid columns for 1 to 8 tiles
- splitting big signals into parts and joining them back, in any order

[CI](../.github/workflows/ci.yml) runs the same command on every push and pull request to `main`. Bonezegei only runs on Windows, so the server is tested by hand.

## Manual checklist

Run these after `bzg run`, with real keys in `config.bzg`.

| # | Check | Expected result |
|---|---|---|
| 1 | Open `https://localhost` signed out | "Checking your session...", then the login card |
| 2 | Continue with Google with a test-user account | Home screen with your name and photo in the top bar; not in a call |
| 3 | Log out, then Continue with GitHub | Same, with your GitHub name and avatar |
| 4 | Stop the server and reload | Error banner with Try again; start the server and click it |
| 5 | New meeting in one window, paste its invite link and Join in another account's window | Both tiles show names; video and audio connect; status says `2 in the call` |
| 6 | Turn the mic off in one window | Red button there, mic-off badge on that tile in the other window |
| 7 | Turn the camera off | The other window shows the photo or initial |
| 8 | Talk | The speaker's tile gets the accent ring |
| 9 | Send chat messages, with the chat closed in the other window | Bubbles on both sides; a dot and a toast in the closed window |
| 10 | Present | The other window sees your screen; stopping brings the camera back |
| 11 | Leave call | Your tile goes from the other window; you're back on home |
| 12 | Open `https://localhost/does-not-exist` | Custom 404 page |
| 13 | Narrow the window to 375px | Chat becomes a full-screen drawer; no sideways scroll |
| 14 | Click System, Light and Dark | The page and the chat panel switch at once and the choice survives a reload |
| 15 | Send 30 chat messages | The chat log scrolls; the page itself doesn't grow |
| 16 | Open an invite link while signed out, then sign in | Home with the code filled in; Join takes you in |
