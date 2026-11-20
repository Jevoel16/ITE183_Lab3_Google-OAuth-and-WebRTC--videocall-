# Testing

## Automated

`npm test` checks the syntax of `package.json`, `public/config.example.js` and the inline scripts in the HTML pages, then runs the `node:test` suites in `scripts/`:

- room codes and the GitHub redirect parser
- both state machines (every allowed transition and some rejected ones)
- the GitHub sign-in routes: config, `state` and callback handling
- the config writer
- the gateway: header fix, routing, and its 502/503 messages
- the `dev` / `share` / `tunnel` launcher

[CI](../.github/workflows/ci.yml) runs the same command on every push and pull request to `main`. The server only runs on Windows with Bonezegei, so the app itself is tested by hand.

## Manual checklist

Run these after `npm run dev`.

| # | Check | Expected result |
|---|---|---|
| 1 | Open `http://localhost:8001` with the placeholder client ID | "Google sign-in is not configured..." message; Join now disabled |
| 2 | Add a real client ID and reload | Sign in with Google button appears |
| 3 | Sign in with a test-user account | User chip shows photo, name and email; Join now enabled |
| 4 | Reload the page | Still signed in (same tab) |
| 5 | Click Sign out | Google button returns; Join now disabled; reload stays signed out |
| 6 | Join in two windows | Both tiles show Google names; video and audio connect |
| 7 | Turn the camera off | Tile shows the Google profile photo |
| 8 | Send chat messages | They appear at once in the other window |
| 9 | Stop the server while in a call, then start it again | "Connection lost. Reconnecting..." toast; within 15 s both windows are back in the same room |
| 10 | Open `http://localhost:8001/does-not-exist` | Custom 404 page |
| 11 | Turn the mic and camera off on the join screen, then join | Buttons turn red and the preview shows "Camera is off"; in the call both windows show the photo and mic-off badge, with no audio |
| 12 | Turn them back on in the call | The other window sees video and hears audio |
| 13 | Run `npm run share` and open the address on a phone | Page loads over HTTPS, shows `Connected to wss://…`, and joins a call with your PC |
| 14 | Join room A in two windows and room B in a third | The room A windows see each other; the room B window sees only itself, and chat stays in each room |
| 15 | Leave a call idle for 3 minutes over the tunnel | Still connected; chat still works |
| 16 | Set the GitHub keys in `.env`, restart `npm run dev`, click Sign in with GitHub | Back on the join screen in the same room, signed in with your GitHub name and avatar |
| 17 | Click System, Light and Dark | The page switches at once, the choice survives a reload, and System follows the device |
