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

    const socket = io(url, { transports: ["websocket"] });

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);
    });

    socket.on("connect_error", (e) => {
        console.error("❌ realtime error:", e.message);
    });

    // expose (🔥 KRİTİK)
    window.rt.socket = socket;
    window.SM_SOCKET = socket; // 👈 BUNU EKLE
    console.log("✅ SM_SOCKET exposed");

    // helpers
    window.rt.emit = (ev, payload) => socket.emit(ev, payload);
    window.rt.on = (ev, fn) => socket.on(ev, fn);
})();
