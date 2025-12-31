// /assets1/realtime.js
(() => {
    // double init guard
    if (window.rt?.socket) return;

    window.rt = window.rt || {};

    const url = window.SOCKET_URL || "https://socket.chriontoken.com";
    if (!window.io) {
        console.error("❌ Socket.IO client (io) not loaded. Add socket.io CDN before realtime.js");
        return;
    }

    // Connect
    const socket = io(url, {
        transports: ["websocket"],
        withCredentials: true,
    });

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);

        // ✅ Identify user for DM routing (room/auth)
        const me = localStorage.getItem("sm_uid");
        if (me) {
            // Most common patterns (server may use one of these)
            socket.emit("auth", { user_id: me });
            socket.emit("join", { room: `user:${me}` });

            console.log("✅ socket auth/join sent:", me);
        } else {
            console.warn("⚠️ sm_uid missing -> cannot auth socket");
        }
    });

    socket.on("connect_error", (e) => {
        console.error("❌ realtime error:", e.message);
    });

    // expose (🔥 KRİTİK)
    window.rt.socket = socket;
    window.SM_SOCKET = socket;
    console.log("✅ SM_SOCKET exposed");

    // helpers
    window.rt.emit = (ev, payload) => socket.emit(ev, payload);
    window.rt.on = (ev, fn) => socket.on(ev, fn);

    // Optional: show all events for debugging (comment out in prod)
    // socket.onAny((e, ...a) => console.log("SOCKET EVENT:", e, a));
})();
