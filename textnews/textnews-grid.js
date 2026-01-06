// /textnews/textnews-grid.js (NO SUPABASE - sm-api)
// Renders small grid into #textNewsGrid

(() => {
    const grid = document.getElementById("textNewsGrid");
    if (!grid) return;

    const API_BASE = "https://api.chriontoken.com";

    function fmt(t) {
        try {
            return new Date(t).toLocaleString("tr-TR", { dateStyle: "short", timeStyle: "short" });
        } catch {
            return "";
        }
    }

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function fetchGrid(limit = 6) {
        const url = `${API_BASE}/api/textnews?limit=${encodeURIComponent(limit)}`;
        const r = await fetch(url, { cache: "no-store" });

        const ct = (r.headers.get("content-type") || "").toLowerCase();
        const isJson = ct.includes("application/json");

        const out = isJson ? await r.json().catch(() => ({})) : { error: await r.text().catch(() => "") };

        if (!r.ok) throw new Error(out?.error || `textnews grid failed (${r.status})`);

        const arr = out?.list || out?.data || out;
        return Array.isArray(arr) ? arr : [];
    }

    async function load() {
        grid.innerHTML = `<div class="textNewsItem"><div class="textNewsTitle">Loading...</div></div>`;

        try {
            const data = await fetchGrid(6);

            if (!data.length) {
                grid.innerHTML = `<div class="textNewsItem"><div class="textNewsTitle">News unavailable</div></div>`;
                return;
            }

            grid.innerHTML = data
                .map(
                    (n) => `
          <div class="textNewsItem">
            <a class="textNewsLink" href="/textnews/textnews-detail.html?slug=${encodeURIComponent(n.slug)}">
              <div class="textNewsTop">
                <span class="textNewsSource">${esc(n.source)}</span>
                <span>${esc(fmt(n.published_at))}</span>
              </div>
              <div class="textNewsTitle">${esc(n.title)}</div>
            </a>
          </div>
        `
                )
                .join("");
        } catch (e) {
            console.error("textNewsGrid load error:", e);
            grid.innerHTML = `<div class="textNewsItem"><div class="textNewsTitle">News unavailable</div></div>`;
        }
    }

    load();
})();
