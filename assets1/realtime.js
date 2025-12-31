// /assets1/realtime.js
(() => {
    if (window.rt?.socket) return;

    const url = window.SOCKET_URL || "https://socket.chriontoken.com";
    if (!window.io) {
        console.error("❌ socket.io not loaded");
        return;
    }

    const socket = io(url, {
        transports: ["websocket"],
        withCredentials: true,
    });

    window.rt = { socket };

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);

        const uid = window.APPWRITE_USER_ID || localStorage.getItem("sm_uid");
        if (uid) {
            // 🔥 SERVER BUNU BEKLİYOR
            socket.emit("auth_user", uid);
            console.log("✅ auth_user sent:", uid);
        } else {
            console.warn("⚠️ auth_user NOT sent (uid missing)");
        }
    });

    socket.on("disconnect", () => {
        console.log("❌ realtime disconnected");
    });
})();
