// Pure logic shared by the page and the node:test tests: room codes,
// the connection and sign-in state machines, and input parsing.
(function (root) {
    // ==============================
    // ROOM CODES (Meet-style abc-defg-hij)
    // ==============================
    const ROOM_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
    const LETTERS = "abcdefghijklmnopqrstuvwxyz";

    function isRoomCode(code) {
        return typeof code === "string" && ROOM_RE.test(code);
    }

    // randomInt(n) returns 0..n-1; injectable so tests are deterministic
    function makeRoomCode(randomInt) {
        const pick = (n) => Array.from({ length: n }, () => LETTERS[randomInt(LETTERS.length)]).join("");
        return pick(3) + "-" + pick(4) + "-" + pick(3);
    }

    // Accepts what people paste: a bare code, "ABC-DEFG-HIJ" or a full link
    function normalizeRoomInput(text) {
        const match = String(text || "").trim().toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
        return match ? match[0] : "";
    }

    function roomFromHash(hash) {
        const code = String(hash || "").replace(/^#/, "");
        return isRoomCode(code) ? code : "";
    }

    // ==============================
    // CONNECTION STATE MACHINE (see docs/state-machines.md)
    // ==============================
    const CONN = Object.freeze({
        CONNECTING: "connecting",
        OPEN: "open",
        RECONNECTING: "reconnecting",
        CLOSED: "closed"
    });

    const CONN_TRANSITIONS = Object.freeze({
        connecting: { opened: CONN.OPEN, lost: CONN.RECONNECTING, close: CONN.CLOSED },
        open: { lost: CONN.RECONNECTING, close: CONN.CLOSED },
        reconnecting: { opened: CONN.OPEN, close: CONN.CLOSED },
        closed: {}
    });

    function connTransition(state, event) {
        const next = (CONN_TRANSITIONS[state] || {})[event];
        if (!next) throw new Error(`Invalid connection transition: ${state} + ${event}`);
        return next;
    }

    // 1 s, 2 s, 4 s, 8 s, then every 15 s
    function reconnectDelay(attempt) {
        return Math.min(1000 * 2 ** attempt, 15000);
    }

    // ==============================
    // SIGN-IN STATE MACHINE
    // ==============================
    const AUTH = Object.freeze({ SIGNED_OUT: "signedOut", SIGNED_IN: "signedIn" });
    const PROVIDERS = Object.freeze(["google", "github"]);

    // state: { status: "signedOut" } | { status: "signedIn", user }
    function authTransition(state, event) {
        if (event.type === "signIn" && state.status === AUTH.SIGNED_OUT) {
            if (!isValidUser(event.user)) throw new Error("Invalid user profile");
            return { status: AUTH.SIGNED_IN, user: event.user };
        }
        if (event.type === "signOut" && state.status === AUTH.SIGNED_IN) {
            return { status: AUTH.SIGNED_OUT };
        }
        throw new Error(`Invalid sign-in transition: ${state.status} + ${event.type}`);
    }

    function isValidUser(user, now) {
        return !!user
            && PROVIDERS.includes(user.provider)
            && typeof user.name === "string" && user.name.length > 0
            && typeof user.exp === "number" && user.exp * 1000 > (now || Date.now());
    }

    // Only Google and GitHub avatars are shown, so a peer can't make every
    // browser in the room load an arbitrary URL.
    function isAllowedPicture(url) {
        try {
            const u = new URL(url);
            return u.protocol === "https:" && (u.hostname.endsWith(".googleusercontent.com")
                || u.hostname === "avatars.githubusercontent.com");
        } catch (e) {
            return false;
        }
    }

    function base64UrlDecode(part) {
        const b64 = part.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(part.length / 4) * 4, "=");
        const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
        return new TextDecoder().decode(bytes);
    }

    // The gateway redirects back from GitHub to "#auth=<base64url JSON>&room=<code>"
    function parseAuthFragment(hash, now) {
        const params = new URLSearchParams(String(hash || "").replace(/^#/, ""));
        const auth = params.get("auth");
        if (!auth) return null;
        let user;
        try { user = JSON.parse(base64UrlDecode(auth)); } catch (e) { return null; }
        if (!user || user.provider !== "github" || !isValidUser(user, now)) return null;
        return {
            user: {
                provider: "github",
                name: user.name,
                email: typeof user.email === "string" ? user.email : "",
                picture: isAllowedPicture(user.picture) ? user.picture : "",
                exp: user.exp
            },
            room: roomFromHash(params.get("room"))
        };
    }

    // ==============================
    // THEME
    // ==============================
    // Anything but "light" or "dark" means follow the device
    function parseTheme(saved) {
        return saved === "light" || saved === "dark" ? saved : "system";
    }

    const api = {
        isRoomCode, makeRoomCode, normalizeRoomInput, roomFromHash,
        CONN, connTransition, reconnectDelay,
        AUTH, authTransition, isValidUser, isAllowedPicture, parseAuthFragment,
        parseTheme
    };

    if (typeof module === "object" && module.exports) module.exports = api;
    else root.JmeetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
