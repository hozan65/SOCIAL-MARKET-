// /assets/sm-api.js (NO IMPORT)
// window.smGet(path), window.smPost(path, body), window.smPut(path, body)
(() => {
    const API_BASE = "https://api.chriontoken.com";

    function getJWT() {
        const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
        if (!jwt) throw new Error("Login required (missing sm_jwt)");
        return jwt;
    }

    async function req(path, { method = "GET", body } = {}) {
        const jwt = getJWT();

        const url = path.startsWith("http") ? path : `${API_BASE}${path}`;
        const r = await fetch(url, {
            method,
            headers: {
                ...(method === "GET" ? {} : { "Content-Type": "application/json" }),
                Authorization: `Bearer ${jwt}`,
            },
            body: body ? JSON.stringify(body) : undefined,
            cache: "no-store",
        });

        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out?.error || out?.detail || `${method} ${path} failed (${r.status})`);
        return out;
    }

    window.smGet = (path) => req(path, { method: "GET" });
    window.smPost = (path, body) => req(path, { method: "POST", body });
    window.smPut = (path, body) => req(path, { method: "PUT", body });

    console.log("✅ sm-api helper ready");
})();
