// /assets1/realtime.js
(() => {
    // double init guard
    if (window.rt?.socket) return;

    window.rt = window.rt || {};

    const url = window.SOCKET_URL || "https://socket.chriontoken.com";
    if (!window.io) {
        console.error("❌ socket.io client not found. Did you include /socket.io/socket.io.js or CDN?");
        return;
    }

    // expose for debug
    window.SM_SOCKET = { url };

    const socket = window.io(url, {
        transports: ["websocket"],     // ✅ anlık için
        withCredentials: true,
        reconnection: true,
        reconnectionAttempts: 10,
        reconnectionDelay: 600,
        timeout: 15000
    });

    window.rt.socket = socket;

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);

        // user_id globalde varsa otomatik join dene
        const uid =
            window.APPWRITE_USER_ID ||
            window.user_id ||
            localStorage.getItem("sm_uid") ||
            null;

        if (uid) {
            socket.emit("join", { user_id: uid });
        }
    });

    socket.on("connect_error", (err) => {
        console.warn("⚠️ realtime connect_error:", err?.message || err);
    });

    socket.on("disconnect", (reason) => {
        console.warn("⚠️ realtime disconnected:", reason);
    });

    // debug: joined confirmation
    socket.on("joined", (d) => {
        console.log("✅ joined:", d);
    });

    console.log("✅ SM_SOCKET exposed");
})();
