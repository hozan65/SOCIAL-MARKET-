// /assets1/text-news.js
// Reads from Supabase table: news_feed
// Renders Matriks-style text news block in feed.

(() => {
    const grid = document.getElementById("textNewsGrid");
    const empty = document.getElementById("textNewsEmpty");
    if (!grid) return;

    const SUPABASE_URL = "https://yzrhqduuqvllatliulqv.supabase.co";
    const SUPABASE_ANON_KEY = "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_";

    const sb = window.supabase?.createClient
        ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
        : null;

    const esc = (s) =>
        String(s ?? "")
            .replaceAll("&","&amp;")
            .replaceAll("<","&lt;")
            .replaceAll(">","&gt;")
            .replaceAll('"',"&quot;")
            .replaceAll("'","&#039;");

    function fmtTR(iso){
        try{
            const d = new Date(iso);
            if (Number.isNaN(d.getTime())) return "";
            return d.toLocaleString("en-GB", {
                day: "2-digit",
                month: "short",
                year: "numeric",
                hour: "2-digit",
                minute: "2-digit"
            }) + " GMT+3";
        }catch{
            return "";
        }
    }

    function renderItem(n){
        const source = esc(n.source || "Source");
        const title = esc(n.title || "");
        const time = esc(fmtTR(n.published_at));
        const url = String(n.url || "#");

        // smnews:// ise gerçek link yok => tıklayınca açmayalım (ileride modal yaparız)
        const isFake = url.startsWith("smnews://");
        const href = isFake ? "#" : esc(url);

        return `
      <div class="textNewsItem">
        <a class="textNewsLink" href="${href}" ${isFake ? "" : `target="_blank" rel="noopener"`} data-smnews="${isFake ? esc(url) : ""}">
          <div class="textNewsTop">
            <span class="textNewsSource">${source}</span>
            <span class="textNewsDot">•</span>
            <span class="textNewsTime">${time}</span>
          </div>
          <div class="textNewsTitle">${title}</div>
        </a>
      </div>
    `;
    }

    async function loadTextNews(limit = 9){
        if (!sb) {
            // supabase CDN yüklenmemişse sessiz kal
            if (empty) empty.style.display = "block";
            return;
        }

        try{
            const { data, error } = await sb
                .from("news_feed")
                .select("id, source, title, url, published_at")
                .order("published_at", { ascending: false })
                .limit(limit);

            if (error) throw error;

            const rows = data || [];
            if (!rows.length) {
                grid.innerHTML = "";
                if (empty) empty.style.display = "block";
                return;
            }

            if (empty) empty.style.display = "none";
            grid.innerHTML = rows.map(renderItem).join("");
        }catch(e){
            grid.innerHTML = "";
            if (empty) empty.style.display = "block";
        }
    }

    // smnews:// click => şimdilik engelle (ileride detail modal yaparız)
    document.addEventListener("click", (e) => {
        const a = e.target.closest("a[data-smnews]");
        if (!a) return;
        const token = a.dataset.smnews || "";
        if (token.startsWith("smnews://")) {
            e.preventDefault();
            // İstersen burada modal açarız.
        }
    });

    document.addEventListener("DOMContentLoaded", () => {
        loadTextNews(9);
        // isteğe bağlı: 60 sn’de bir yenile
        setInterval(() => loadTextNews(9), 60_000);
    });
})();
