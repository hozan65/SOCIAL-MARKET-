// /assets1/realtime.js  (FINAL - reliable auth_user retry)
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

    window.rt = window.rt || {};
    window.rt.socket = socket;

    function getUid() {
        return window.APPWRITE_USER_ID || localStorage.getItem("sm_uid") || "";
    }

    let authed = false;
    function tryAuthUser() {
        const uid = getUid();
        if (!uid) return false;
        socket.emit("auth_user", uid);
        console.log("✅ auth_user sent:", uid);
        authed = true;
        return true;
    }

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);
        authed = false;

        // 1) hemen dene
        if (tryAuthUser()) return;

        // 2) UID daha sonra gelirse diye kısa süre retry
        let tries = 0;
        const t = setInterval(() => {
            tries++;
            if (tryAuthUser() || tries >= 20) clearInterval(t); // ~10sn
            if (tries >= 20 && !authed) console.warn("⚠️ auth_user NOT sent (uid missing after retry)");
        }, 500);
    });

    socket.on("disconnect", () => {
        console.log("❌ realtime disconnected");
        authed = false;
    });

    // DEBUG: dm_new global log
    socket.on("dm_new", (p) => {
        console.log("📩 dm_new (global):", p);
    });
})();
