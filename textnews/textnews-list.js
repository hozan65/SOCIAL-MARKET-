// /textnews/textnews-list.js  (NO SUPABASE - sm-api)
// Renders list into #tnList

(() => {
    const list = document.getElementById("tnList");
    if (!list) return;

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

    async function fetchList(limit = 100) {
        const r = await fetch(`/api/textnews?limit=${encodeURIComponent(limit)}`, { cache: "no-store" });
        const out = await r.json().catch(() => ({}));
        if (!r.ok) throw new Error(out?.error || `textnews list failed (${r.status})`);

        // accepted shapes: {list:[...]}, {data:[...]}, [...]
        const arr = out?.list || out?.data || out;
        return Array.isArray(arr) ? arr : [];
    }

    async function load() {
        list.innerHTML = `<div class="tnRow"><div class="tnRowTitle">Loading...</div></div>`;

        try {
            const data = await fetchList(100);

            if (!data.length) {
                list.innerHTML = `<div class="tnRow"><div class="tnRowTitle">News unavailable</div></div>`;
                return;
            }

            list.innerHTML = data
                .map((n) => `
          <div class="tnRow">
            <a href="/textnews/textnews-detail.html?slug=${encodeURIComponent(n.slug)}">
              <div class="tnRowTop">${esc(n.source)} • ${esc(fmt(n.published_at))}</div>
              <div class="tnRowTitle">${esc(n.title)}</div>
            </a>
          </div>
        `)
                .join("");
        } catch (e) {
            console.error("textnews list load error:", e);
            list.innerHTML = `<div class="tnRow"><div class="tnRowTitle">News unavailable</div></div>`;
        }
    }

    load();
})();
