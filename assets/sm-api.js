// /assets/sm-api.js (NO IMPORT)
// window.smGet(path), window.smPost(path, body), window.smPut(path, body)
(() => {
    const API_BASE = "https://api.chriontoken.com";

    function getUID() {
        return (localStorage.getItem("sm_user_id") || "").trim();
    }


    function getJWTOptional() {
        return (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    }

    async function req(path, { method = "GET", body } = {}) {
        const url = path.startsWith("http") ? path : `${API_BASE}${path}`;

        const uid = getUID();
        const jwt = getJWTOptional();

        const headers = {};

        // JSON body varsa
        if (method !== "GET" && body !== undefined) {
            headers["Content-Type"] = "application/json";
        }

        // ✅ server.js bunu bekliyor (analyses/create, dm/inbox, follows vs)
        if (uid) {
            headers["X-User-Id"] = uid;
        }

        // opsiyonel (şu an server verify etmiyor ama ileride edebilir)
        if (jwt) {
            headers["Authorization"] = `Bearer ${jwt}`;
        }

        const r = await fetch(url, {
            method,
            headers,
            body: body !== undefined ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });

        const out = await r.json().catch(() => ({}));

        // server bazen {ok:false} dönüyor, bazen sadece status
        if (!r.ok || out?.ok === false) {
            throw new Error(out?.error || out?.detail || `${method} ${path} failed (${r.status})`);
        }
        return out;
    }

    window.smGet = (path) => req(path, { method: "GET" });
    window.smPost = (path, body) => req(path, { method: "POST", body });
    window.smPut = (path, body) => req(path, { method: "PUT", body });

    console.log("✅ sm-api helper ready (uid+jwt compatible)");
})();
