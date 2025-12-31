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

    // IMPORTANT: allow websocket + fallback polling
    const socket = io(url, {
        transports: ["websocket", "polling"],
        withCredentials: true,
        timeout: 8000,
    });

    socket.on("connect", () => console.log("✅ realtime connected:", socket.id));
    socket.on("disconnect", (r) => console.warn("⚠️ realtime disconnected:", r));
    socket.on("connect_error", (e) => console.error("❌ realtime connect_error:", e.message));

    // expose
    window.rt.socket = socket;
    window.SM_SOCKET = socket;
    console.log("✅ SM_SOCKET exposed");

    window.rt.emit = (ev, payload) => socket.emit(ev, payload);
    window.rt.on = (ev, fn) => socket.on(ev, fn);
})();
