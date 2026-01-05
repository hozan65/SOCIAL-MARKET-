// /assets1/appwrite-init.js
// ✅ Safe init + global helpers (JWT + UID hydrate)
// Works as normal script (no import)

(() => {
    if (window.account?.createJWT) {
        console.log("✅ Appwrite already initialized (window.account exists)");
        return;
    }

    if (!window.Appwrite) {
        console.error("❌ Appwrite SDK not found. Include Appwrite CDN before this file.");
        return;
    }

    const endpoint = (window.APPWRITE_ENDPOINT || "").trim();
    const projectId = (window.APPWRITE_PROJECT_ID || "").trim();

    if (!endpoint || !projectId) {
        console.error("❌ Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID on window.");
        return;
    }

    const client = new window.Appwrite.Client()
        .setEndpoint(endpoint)
        .setProject(projectId);

    const account = new window.Appwrite.Account(client);

    // ✅ globals
    window.appwrite = { client, account };
    window.account = account;

    // ✅ helpers used across site
    window.SM_GET_UID = async () => {
        // 1) cache
        const cached = (localStorage.getItem("sm_uid") || "").trim();
        if (cached) return cached;

        // 2) account.get
        const u = await account.get();
        const uid = (u?.$id || "").trim();
        if (uid) {
            localStorage.setItem("sm_uid", uid);
            window.APPWRITE_USER_ID = uid;
            // optional cache name/email
            if (u?.name) localStorage.setItem("sm_name", u.name);
            if (u?.email) localStorage.setItem("sm_email", u.email);
        }
        return uid;
    };

    window.SM_REFRESH_JWT = async () => {
        const r = await account.createJWT();
        const jwt = (r?.jwt || "").trim();
        if (!jwt) throw new Error("JWT create failed");
        localStorage.setItem("sm_jwt", jwt);
        window.SM_JWT = jwt;
        return jwt;
    };

    // ✅ Promise gate (others can await)
    window.SM_JWT_READY = (async () => {
        try {
            // hydrate uid (best-effort)
            try { await window.SM_GET_UID(); } catch {}

            // if jwt already cached, keep it
            const existing = (localStorage.getItem("sm_jwt") || "").trim();
            if (existing) {
                window.SM_JWT = existing;
                return existing;
            }

            // create new jwt (best-effort; some pages might be public)
            const jwt = await window.SM_REFRESH_JWT();
            return jwt;
        } catch (e) {
            // do not hard-crash public pages
            return null;
        }
    })();

    console.log("✅ Appwrite initialized (window.account ready)");
})();
