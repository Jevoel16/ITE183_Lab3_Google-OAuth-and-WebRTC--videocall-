// Pure logic shared by the page and the node:test tests: the sign-in and
// call state machines, room codes, profile parsing, grid sizing and signal chunking.
(function (root) {
    // ==============================
    // SIGN-IN STATE MACHINE (see docs/state-machines.md)
    // ==============================
    const AUTH = Object.freeze({
        CHECKING: "checking",
        SIGNED_IN: "signedIn",
        SIGNED_OUT: "signedOut",
        FAILED: "failed",
        EXPIRED: "expired"
    });

    // state: { status: "checking" | "signedOut" | "failed" } | { status: "signedIn" | "expired", user }
    // event: { type: "ok", user } | { type: "unauthorized" | "expired" | "error" | "logout" | "retry" }
    function authTransition(state, event) {
        const from = state.status;
        const type = event.type;
        if (type === "ok" && (from === AUTH.CHECKING || from === AUTH.SIGNED_IN || from === AUTH.EXPIRED)) {
            if (!event.user || !event.user.name) throw new Error("Invalid user profile");
            return { status: AUTH.SIGNED_IN, user: event.user };
        }
        // The session ran out mid-call: keep the user (and the call) until the call ends
        if (type === "expired" && from === AUTH.SIGNED_IN) return { status: AUTH.EXPIRED, user: state.user };
        if (type === "unauthorized" && (from === AUTH.CHECKING || from === AUTH.SIGNED_IN || from === AUTH.EXPIRED)) {
            return { status: AUTH.SIGNED_OUT };
        }
        if (type === "error" && from === AUTH.CHECKING) return { status: AUTH.FAILED };
        if (type === "logout" && (from === AUTH.SIGNED_IN || from === AUTH.EXPIRED)) return { status: AUTH.SIGNED_OUT };
        if (type === "retry" && from === AUTH.FAILED) return { status: AUTH.CHECKING };
        throw new Error(`Invalid sign-in transition: ${from} + ${type}`);
    }

    // ==============================
    // CALL STATE MACHINE
    // ==============================
    const CALL = Object.freeze({ IDLE: "idle", JOINING: "joining", IN_CALL: "inCall", RECONNECTING: "reconnecting" });

    const CALL_TRANSITIONS = Object.freeze({
        idle: { join: CALL.JOINING },
        joining: { connected: CALL.IN_CALL, end: CALL.IDLE },
        inCall: { lost: CALL.RECONNECTING, end: CALL.IDLE },
        reconnecting: { connected: CALL.IN_CALL, end: CALL.IDLE }
    });

    function callTransition(state, event) {
        const next = (CALL_TRANSITIONS[state] || {})[event];
        if (!next) throw new Error(`Invalid call transition: ${state} + ${event}`);
        return next;
    }

    // ==============================
    // CAMERA PREVIEW ON HOME (handOff: the call takes the stream without stopping it)
    // ==============================
    const PREVIEW = Object.freeze({ OFF: "off", STARTING: "starting", READY: "ready", BLOCKED: "blocked" });

    const PREVIEW_TRANSITIONS = Object.freeze({
        off: { start: PREVIEW.STARTING },
        starting: { ready: PREVIEW.READY, blocked: PREVIEW.BLOCKED, stop: PREVIEW.OFF, handOff: PREVIEW.OFF },
        ready: { stop: PREVIEW.OFF, handOff: PREVIEW.OFF },
        blocked: { start: PREVIEW.STARTING, stop: PREVIEW.OFF, handOff: PREVIEW.OFF }
    });

    function previewTransition(state, event) {
        const next = (PREVIEW_TRANSITIONS[state] || {})[event];
        if (!next) throw new Error(`Invalid preview transition: ${state} + ${event}`);
        return next;
    }

    // 1 s, 2 s, 4 s, 8 s, 15 s, 15 s, then null: about 45 s before giving up
    function reconnectDelay(attempt) {
        return attempt < 6 ? Math.min(1000 * 2 ** attempt, 15000) : null;
    }

    // ==============================
    // ROOM CODES (Meet-style abc-defg-hij, checked again by app.bzg)
    // ==============================
    const ROOM_RE = /^[a-z]{3}-[a-z]{4}-[a-z]{3}$/;
    const LETTERS = "abcdefghijklmnopqrstuvwxyz";

    function isRoomCode(code) {
        return typeof code === "string" && ROOM_RE.test(code);
    }

    // randomInt(n) returns 0..n-1; passed in so tests are deterministic
    function makeRoomCode(randomInt) {
        const pick = (n) => Array.from({ length: n }, () => LETTERS[randomInt(LETTERS.length)]).join("");
        return pick(3) + "-" + pick(4) + "-" + pick(3);
    }

    // Accepts what people paste: a bare code, "ABC-DEFG-HIJ" or a full invite link
    function normalizeRoomInput(text) {
        const match = String(text || "").trim().toLowerCase().match(/[a-z]{3}-[a-z]{4}-[a-z]{3}/);
        return match ? match[0] : "";
    }

    // ==============================
    // PROFILES
    // ==============================
    // Only Google and GitHub avatars are shown, so a peer can't make every
    // browser in the call load an arbitrary URL.
    function isAllowedPicture(url) {
        try {
            const u = new URL(url);
            const host = u.hostname.toLowerCase();
            return u.protocol === "https:" && (host.endsWith(".googleusercontent.com")
                || host === "avatars.githubusercontent.com");
        } catch (e) {
            return false;
        }
    }

    const text = (value) => typeof value === "string" ? value.trim() : "";

    // Google's userinfo has name/picture, GitHub's has login/avatar_url
    function profileToUser(profile) {
        const p = profile || {};
        const name = text(p.name) || text(p.login) || text(p.email) || "Participant";
        const picture = [p.picture, p.avatar_url].find(isAllowedPicture) || "";
        return { name, picture };
    }

    function initialOf(name) {
        return (text(name).charAt(0) || "?").toUpperCase();
    }

    // ==============================
    // VIDEO GRID
    // ==============================
    // Columns for n tiles: 1, 2x2 up to 4, then 3 wide (8 people = 3+3+2)
    function gridColumns(n) {
        return n <= 1 ? 1 : n <= 4 ? 2 : 3;
    }

    // ==============================
    // SIGNAL CHUNKING
    // ==============================
    // Big WebRTC offers can exceed what the native http.dll handles in one
    // WebSocket frame, so signals over `size` characters go as numbered parts.
    function splitSignal(data, cid, size) {
        const json = JSON.stringify(data);
        if (json.length <= size) return [data];
        const n = Math.ceil(json.length / size);
        return Array.from({ length: n }, (_, i) =>
            ({ type: "chunk", cid, i, n, part: json.slice(i * size, (i + 1) * size) }));
    }

    // store: a Map kept by the caller. Returns the whole signal once every
    // part from that sender has arrived, else null.
    function collectChunk(store, from, chunk) {
        const ok = chunk && typeof chunk.cid === "string" && Number.isInteger(chunk.i)
            && Number.isInteger(chunk.n) && chunk.n > 0 && chunk.n <= 64
            && chunk.i >= 0 && chunk.i < chunk.n && typeof chunk.part === "string";
        if (!ok) return null;
        const key = from + ":" + chunk.cid;
        const entry = store.get(key) || { parts: [], received: 0 };
        store.set(key, entry);
        if (entry.parts[chunk.i] === undefined) {
            entry.parts[chunk.i] = chunk.part;
            entry.received++;
        }
        if (entry.received < chunk.n) return null;
        store.delete(key);
        try { return JSON.parse(entry.parts.join("")); } catch (e) { return null; }
    }

    // ==============================
    // SIGNAL CHANNELS
    // ==============================
    // Screen shares use their own peer connection over the same signal relay.
    // data.channel says which connection a signal belongs to: absent means the
    // camera connection, "screen" goes presenter -> viewer, "screen-reply"
    // goes viewer -> presenter.
    const CHANNEL = Object.freeze({ CAMERA: "camera", SCREEN: "screen", SCREEN_REPLY: "screen-reply" });

    // Returns the channel of a signal, or null for anything that isn't a valid one
    function signalChannel(data) {
        // Not an object: not a signal at all
        if (!data || typeof data !== "object") return null;
        // Untagged signals are camera signals, exactly as before screen channels existed
        if (data.channel === undefined) return CHANNEL.CAMERA;
        if (data.channel === CHANNEL.SCREEN || data.channel === CHANNEL.SCREEN_REPLY) return data.channel;
        // An unknown tag is invalid, never silently treated as camera
        return null;
    }

    // Returns a copy of data tagged with channel; camera data stays untouched
    function withChannel(data, channel) {
        // Camera signals keep today's untagged shape
        if (channel === CHANNEL.CAMERA) return data;
        return { ...data, channel };
    }

    // ==============================
    // NOTIFICATIONS
    // ==============================
    // A chat message from someone else pings unless you're already reading it:
    // the tab is visible and the chat panel is open
    function shouldPing({ mine, hidden, chatOpen }) {
        if (mine) return false;
        return hidden || !chatOpen;
    }

    // What the presenting notice says, from the share picker's displaySurface
    const PRESENTING_TEXT = Object.freeze({
        monitor: "You're presenting your entire screen to this call",
        window: "You're presenting a window to this call",
        browser: "You're presenting a tab to this call"
    });

    function presentingText(displaySurface) {
        // Unknown or unreported surfaces get the plain wording
        if (!Object.hasOwn(PRESENTING_TEXT, displaySurface ?? "")) return "You're presenting to this call";
        return PRESENTING_TEXT[displaySurface];
    }

    // ==============================
    // THEME
    // ==============================
    // Anything but "light" or "dark" means follow the device
    function parseTheme(saved) {
        return saved === "light" || saved === "dark" ? saved : "system";
    }

    const api = {
        AUTH, authTransition,
        CALL, callTransition, reconnectDelay,
        PREVIEW, previewTransition,
        isRoomCode, makeRoomCode, normalizeRoomInput,
        isAllowedPicture, profileToUser, initialOf,
        gridColumns,
        splitSignal, collectChunk,
        CHANNEL, signalChannel, withChannel,
        shouldPing, presentingText,
        parseTheme
    };

    if (typeof module === "object" && module.exports) module.exports = api;
    else root.JmeetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
