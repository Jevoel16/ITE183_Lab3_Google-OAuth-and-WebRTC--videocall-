// Pure logic shared by the page and the node:test tests: the sign-in and
// call state machines, profile parsing, grid sizing and signal chunking.
(function (root) {
    // ==============================
    // SIGN-IN STATE MACHINE (see docs/state-machines.md)
    // ==============================
    const AUTH = Object.freeze({
        CHECKING: "checking",
        SIGNED_IN: "signedIn",
        SIGNED_OUT: "signedOut",
        FAILED: "failed"
    });

    // state: { status: "checking" | "signedOut" | "failed" } | { status: "signedIn", user }
    // event: { type: "ok", user } | { type: "unauthorized" | "error" | "logout" | "retry" }
    function authTransition(state, event) {
        const from = state.status;
        const type = event.type;
        if (type === "ok" && (from === AUTH.CHECKING || from === AUTH.SIGNED_IN)) {
            if (!event.user || !event.user.name) throw new Error("Invalid user profile");
            return { status: AUTH.SIGNED_IN, user: event.user };
        }
        if (type === "unauthorized" && (from === AUTH.CHECKING || from === AUTH.SIGNED_IN)) {
            return { status: AUTH.SIGNED_OUT };
        }
        if (type === "error" && from === AUTH.CHECKING) return { status: AUTH.FAILED };
        if (type === "logout" && from === AUTH.SIGNED_IN) return { status: AUTH.SIGNED_OUT };
        if (type === "retry" && from === AUTH.FAILED) return { status: AUTH.CHECKING };
        throw new Error(`Invalid sign-in transition: ${from} + ${type}`);
    }

    // ==============================
    // CALL STATE MACHINE
    // ==============================
    const CALL = Object.freeze({ IDLE: "idle", JOINING: "joining", IN_CALL: "inCall" });

    const CALL_TRANSITIONS = Object.freeze({
        idle: { join: CALL.JOINING },
        joining: { connected: CALL.IN_CALL, end: CALL.IDLE },
        inCall: { end: CALL.IDLE }
    });

    function callTransition(state, event) {
        const next = (CALL_TRANSITIONS[state] || {})[event];
        if (!next) throw new Error(`Invalid call transition: ${state} + ${event}`);
        return next;
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
    // THEME
    // ==============================
    // Anything but "light" or "dark" means follow the device
    function parseTheme(saved) {
        return saved === "light" || saved === "dark" ? saved : "system";
    }

    const api = {
        AUTH, authTransition,
        CALL, callTransition,
        isAllowedPicture, profileToUser, initialOf,
        gridColumns,
        splitSignal, collectChunk,
        parseTheme
    };

    if (typeof module === "object" && module.exports) module.exports = api;
    else root.JmeetCore = api;
})(typeof globalThis !== "undefined" ? globalThis : this);
