(() => {
    const grid = document.getElementById("textNewsGrid");
    if (!grid) return;

    const sb = window.sb; // ✅ tek Supabase client
    if (!sb) {
        console.error("❌ window.sb yok. /assets/sb.js yüklenmemiş.");
        return;
    }

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
                .limit(6);

            if (error) throw error;

            grid.innerHTML = (data || [])
                .map(
                    (n) => `
        <div class="textNewsItem">
          <a class="textNewsLink" href="/textnews/textnews-detail.html?slug=${encodeURIComponent(
                        n.slug
                    )}">
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
