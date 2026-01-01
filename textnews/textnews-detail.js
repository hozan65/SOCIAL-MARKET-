(() => {
    const p = new URLSearchParams(location.search);
    const slug = p.get("slug");

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

    function setSafe(id, text) {
        const el = document.getElementById(id);
        if (el) el.textContent = text ?? "";
    }

    async function load() {
        try {
            if (!slug) {
                setSafe("tnTitle", "News not found");
                setSafe("tnContent", "Missing slug.");
                return;
            }

            const { data, error } = await sb
                .from("news_feed")
                .select("source,title,content,slug,published_at")
                .eq("slug", slug)
                .single();

            if (error) throw error;
            if (!data) throw new Error("Not found");

            setSafe("tnTitle", data.title || "");
            setSafe("tnSource", data.source || "");
            setSafe("tnDate", data.published_at ? fmt(data.published_at) : "");
            setSafe("tnContent", data.content || "");
        } catch (e) {
            console.error("textnews detail load error:", e);
            setSafe("tnTitle", "News unavailable");
            setSafe("tnContent", "Could not load this news item.");
        }
    }

    load();
})();
