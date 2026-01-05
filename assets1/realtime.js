// /assets1/realtime.js (FINAL++ - reliable auth_user + late-uid + reconnect safe)
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
        return (window.APPWRITE_USER_ID || localStorage.getItem("sm_uid") || "").trim();
    }

    function getJwt() {
        return (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    }

    let authed = false;
    let retryTimer = null;

    function stopRetry() {
        if (retryTimer) clearInterval(retryTimer);
        retryTimer = null;
    }

    function tryAuthUser() {
        const uid = getUid();
        if (!uid) return false;

        // ✅ send uid (and jwt if exists; backend can ignore)
        const jwt = getJwt();
        const payload = jwt ? { uid, jwt } : uid;

        socket.emit("auth_user", payload);
        console.log("✅ auth_user sent:", jwt ? { uid, jwt: "***" } : uid);

        authed = true;
        return true;
    }

    function startRetry() {
        stopRetry();

        let tries = 0;
        retryTimer = setInterval(() => {
            tries++;

            if (tryAuthUser()) {
                stopRetry();
                return;
            }

            if (tries >= 20) {
                stopRetry();
                if (!authed) console.warn("⚠️ auth_user NOT sent (uid missing after retry)");
            }
        }, 500);
    }

    socket.on("connect", () => {
        console.log("✅ realtime connected:", socket.id);
        authed = false;

        // 1) immediate
        if (tryAuthUser()) return;

        // 2) retry for late uid
        startRetry();
    });

    socket.on("disconnect", () => {
        console.log("⚠️ realtime disconnected");
        authed = false;
        stopRetry();
    });

    // ✅ If uid arrives AFTER socket already connected (login without full reload)
    // Trigger auth when localStorage sm_uid gets set/changed
    window.addEventListener("storage", (e) => {
        if (e.key === "sm_uid" && e.newValue) {
            if (socket.connected && !authed) {
                console.log("🔁 sm_uid arrived via storage → auth_user");
                tryAuthUser();
            }
        }
        if (e.key === "sm_jwt" && e.newValue) {
            // optional: re-auth with jwt if backend uses it
            if (socket.connected && getUid()) {
                console.log("🔁 sm_jwt changed → auth_user refresh");
                tryAuthUser();
            }
        }
    });

    // ✅ Also allow manual trigger from login flow:
    // window.dispatchEvent(new Event("sm:uid_ready"))
    window.addEventListener("sm:uid_ready", () => {
        if (socket.connected && getUid()) {
            console.log("🔁 sm:uid_ready → auth_user");
            tryAuthUser();
        }
    });

    // DEBUG: dm_new global log
    socket.on("dm_new", (p) => {
        console.log("📩 dm_new (global):", p);
    });
})();
