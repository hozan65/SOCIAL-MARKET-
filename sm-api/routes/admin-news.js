// /admin/admin-news.js (FINAL - sm-api)
(() => {
    const API_BASE = "https://api.chriontoken.com";

    const $ = (id) => document.getElementById(id);
    const msgEl = $("adminMsg");

    const titleEl = $("newsTitle");
    const sumEl = $("newsSummary");
    const urlEl = $("newsUrl");
    const imgEl = $("newsImage");
    const srcEl = $("newsSource");
    const catEl = $("newsCategory");
    const pubEl = $("newsPublishedAt");

    const btn = $("newsSubmitBtn");
    const listEl = $("adminNewsList");

    function setMsg(t, err=false){
        if(!msgEl) return;
        msgEl.textContent = t || "";
        msgEl.className = err ? "adminMsg err" : "adminMsg ok";
    }

    function getJWT(){
        const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
        if(!jwt) throw new Error("Login required (sm_jwt)");
        return jwt;
    }

    async function api(path, {method="GET", body} = {}){
        const jwt = getJWT();
        const r = await fetch(`${API_BASE}${path}`, {
            method,
            headers: {
                ...(method==="GET" ? {} : {"Content-Type":"application/json"}),
                Authorization: `Bearer ${jwt}`,
            },
            body: body ? JSON.stringify(body) : undefined,
            cache:"no-store",
        });
        const out = await r.json().catch(()=> ({}));
        if(!r.ok) throw new Error(out?.error || `${path} failed (${r.status})`);
        return out;
    }

    function esc(s){
        return String(s ?? "")
            .replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;")
            .replaceAll('"',"&quot;").replaceAll("'","&#039;");
    }

    function renderItem(n){
        const when = n.published_at || n.created_at || "";
        return `
      <div class="adminNewsRow">
        <div class="adminNewsTitle">${esc(n.title || "")}</div>
        <div class="adminNewsMeta">${esc(n.category||"")} • ${esc(n.source||"")} • ${esc(when ? new Date(when).toLocaleString() : "")}</div>
        <div class="adminNewsLinks">
          ${n.url ? `<a href="${esc(n.url)}" target="_blank" rel="noopener">Open</a>` : ""}
        </div>
      </div>
    `;
    }

    async function loadList(){
        if(!listEl) return;
        try{
            const out = await api(`/api/news?limit=200`);
            const items = out.items || out.list || [];
            listEl.innerHTML = items.length ? items.map(renderItem).join("") : `<div class="adminEmpty">No news</div>`;
        }catch(e){
            console.error(e);
            listEl.innerHTML = `<div class="adminEmpty">Load failed</div>`;
        }
    }

    async function createNews(){
        const payload = {
            category: (catEl?.value || "macro").trim(),
            title: (titleEl?.value || "").trim(),
            summary: (sumEl?.value || "").trim(),
            url: (urlEl?.value || "").trim(),
            image_url: (imgEl?.value || "").trim(),
            source: (srcEl?.value || "").trim(),
            published_at: (pubEl?.value || "").trim(), // ISO veya boş
        };

        if(!payload.title) throw new Error("Title required");
        if(!payload.summary) throw new Error("Summary required");

        setMsg("Publishing...");
        btn && (btn.disabled = true);

        try{
            await api("/api/news/create", { method:"POST", body: payload });
            setMsg("✅ Published");
            if(titleEl) titleEl.value="";
            if(sumEl) sumEl.value="";
            if(urlEl) urlEl.value="";
            if(imgEl) imgEl.value="";
            if(srcEl) srcEl.value="";
            if(pubEl) pubEl.value="";
            await loadList();
        }finally{
            btn && (btn.disabled = false);
            setTimeout(()=> setMsg(""), 1200);
        }
    }

    btn?.addEventListener("click", (e)=>{ e.preventDefault(); createNews().catch(err=> setMsg(err?.message||String(err), true)); });

    document.addEventListener("DOMContentLoaded", loadList);
})();
