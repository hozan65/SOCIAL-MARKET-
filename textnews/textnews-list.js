// /textnews/textnews-list.js  (MODULE)

import { supabase as sb } from "/services/supabase.js";

(() => {
    const list = document.getElementById("tnList");
    if (!list) return;

    function fmt(t) {
        return new Date(t).toLocaleString("tr-TR", {
            dateStyle: "short",
            timeStyle: "short",
        });
    }

    function esc(str) {
        return String(str ?? "")
            .replaceAll("&", "&amp;")
            .replaceAll("<", "&lt;")
            .replaceAll(">", "&gt;")
            .replaceAll('"', "&quot;")
            .replaceAll("'", "&#039;");
    }

    async function load() {
        try {
            const { data, error } = await sb
                .from("news_feed")
                .select("source,title,published_at,slug")
                .order("published_at", { ascending: false })
                .limit(100);

            if (error) throw error;

            list.innerHTML = (data || [])
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

