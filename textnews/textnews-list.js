(() => {
    const list = document.getElementById("tnList");
    if (!list) return;

    const sb = supabase.createClient(
        "https://yzrhqduuqvllatliulqv.supabase.co",
        "sb_publishable_dN5E6cw7uaKj7Cmmpo7RJg_W4FWxjs_"
    );

    function fmt(t){
        return new Date(t).toLocaleString("tr-TR",{dateStyle:"short",timeStyle:"short"});
    }

    async function load(){
        const { data } = await sb
            .from("news_feed")
            .select("source,title,published_at,slug")
            .order("published_at",{ascending:false})
            .limit(100);

        list.innerHTML = (data||[]).map(n=>`
      <div class="tnRow">
        <a href="/textnews/textnews-detail.html?slug=${n.slug}">
          <div class="tnRowTop">${n.source} • ${fmt(n.published_at)}</div>
          <div class="tnRowTitle">${n.title}</div>
        </a>
      </div>
    `).join("");
    }

    load();
})();
