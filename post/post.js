// /post/post.js (FULL - sm-api upload + create analysis)
console.log("✅ post.js loaded (sm-api only)");

const API_BASE = "https://api.chriontoken.com";

// endpoints
const EP_UPLOAD = `${API_BASE}/api/upload/analysis-image`;
const EP_CREATE = `${API_BASE}/api/analyses/create`;

const form = document.getElementById("postForm");
const msg = document.getElementById("formMsg");
const publishBtn = document.getElementById("publishBtn");

const $market = document.getElementById("market");
const $pair = document.getElementById("pair");
const $timeframe = document.getElementById("timeframe");
const $content = document.getElementById("postContent");
const $image = document.getElementById("image");

function setMsg(t) {
    if (msg) msg.textContent = t || "";
}

function disable(b) {
    if (publishBtn) publishBtn.disabled = !!b;
    if (publishBtn) publishBtn.textContent = b ? "Publishing..." : "Publish";
}

// ✅ localJoker falan yok. Direkt localStorage.
function getJWT() {
    return localStorage.getItem("sm_jwt") || "";
}

// pair input -> ["BTCUSDT","ETHUSDT"]
function parsePairs(str) {
    return String(str || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(EP_UPLOAD, { method: "POST", body: fd });
    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data?.ok || !data?.url) {
        throw new Error(data?.error || `Upload failed (${r.status})`);
    }
    return data.url; // public url
}

async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch("https://api.chriontoken.com/api/upload/analysis-image", {
        method: "POST",
        body: fd
        
    });

    const text = await r.text();
    if (!r.ok) throw new Error(`Upload failed ${r.status}: ${text}`);

    const data = JSON.parse(text);
    if (!data.ok || !data.url) throw new Error("Upload response invalid");

    return data.url;
}


form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    try {
        const market = String($market?.value || "").trim();
        const timeframe = String($timeframe?.value || "").trim();
        const pairs = parsePairs($pair?.value);
        const content = String($content?.value || "").trim();

        const file = $image?.files?.[0] || null;

        if (!market) throw new Error("Market required");
        if (!timeframe) throw new Error("Timeframe required");
        if (!pairs.length) throw new Error("Pair required (BTCUSDT, EURUSD...)");
        if (!content) throw new Error("Analysis content required");
        if (!file) throw new Error("Image required");

        disable(true);

        // 1) upload image
        const imageUrl = await uploadImage(file);

        // 2) create analysis row
        const analysis = await createAnalysis({
            market,
            timeframe,
            pairs,
            content,
            image_path: imageUrl,
        });

        setMsg("✅ Published!");
        form.reset();

        // istersen feed'e yönlendir:
        // location.href = "/feed/feed.html";

        console.log("✅ created analysis:", analysis);
    } catch (err) {
        console.error(err);
        setMsg("❌ " + String(err?.message || err));
    } finally {
        disable(false);
    }
});
