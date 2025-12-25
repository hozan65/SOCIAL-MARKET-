(() => {
    const grid = document.getElementById("textNewsGrid");
    if (!grid) return;

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
            .limit(6);

        grid.innerHTML = (data||[]).map(n=>`
      <div class="textNewsItem">
        <a class="textNewsLink" href="/textnews/textnews-detail.html?slug=${n.slug}">
          <div class="textNewsTop">
            <span class="textNewsSource">${n.source}</span>
            <span>${fmt(n.published_at)}</span>
          </div>
          <div class="textNewsTitle">${n.title}</div>
        </a>
      </div>
    `).join("");
    }

    load();
})();
