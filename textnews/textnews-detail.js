(() => {
    const p = new URLSearchParams(location.search);
    const slug = p.get("slug");

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
            .select("*")
            .eq("slug", slug)
            .single();

        document.getElementById("tnTitle").textContent = data.title;
        document.getElementById("tnSource").textContent = data.source;
        document.getElementById("tnDate").textContent = fmt(data.published_at);
        document.getElementById("tnContent").textContent = data.content;
    }

    load();
})();
