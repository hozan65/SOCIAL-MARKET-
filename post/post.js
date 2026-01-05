// /post/post.js (FINAL - sm-api upload + create analysis)
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

// ✅ localStorage'dan JWT
function getJWT() {
    return localStorage.getItem("sm_jwt") || "";
}

// "BTCUSDT, ETHUSDT" -> ["BTCUSDT","ETHUSDT"]
function parsePairs(str) {
    return String(str || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

/** Upload image (multipart/form-data, field: "file") -> returns public url */
async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file, file?.name || "image.png");

    const r = await fetch(EP_UPLOAD, {
        method: "POST",
        body: fd,
    });

    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!r.ok) {
        // server json döndürmediyse text'i göster
        throw new Error(data?.error || `Upload failed (${r.status}): ${text || r.statusText}`);
    }
    if (!data?.ok || !data?.url) {
        throw new Error(data?.error || "Upload response invalid");
    }
    return data.url;
}

/** Create analysis row */
async function createAnalysis(payload) {
    const jwt = getJWT();

    const r = await fetch(EP_CREATE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(payload),
    });

    const text = await r.text();
    let data = {};
    try { data = JSON.parse(text); } catch {}

    if (!r.ok) {
        throw new Error(data?.error || `Create failed (${r.status}): ${text || r.statusText}`);
    }

    // API bazen {ok:true, analysis:{...}} bazen direkt {...} döndürebilir
    return data?.analysis || data;
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
        if (!file) throw new Error("Image required (please select a file)");

        // ekstra güvenlik: client-side limit (server/nginx de limit var)
        const maxMB = 9.5;
        if (file.size > maxMB * 1024 * 1024) {
            throw new Error(`Image too large (${(file.size/1024/1024).toFixed(2)}MB). Max ~${maxMB}MB`);
        }

        disable(true);

        // 1) upload image
        const imageUrl = await uploadImage(file);

        // 2) create analysis
        const analysis = await createAnalysis({
            market,
            timeframe,
            pairs,
            content,
            image_path: imageUrl, // serverın beklediği alan buysa kalsın
        });

        setMsg("✅ Published!");
        console.log("✅ created analysis:", analysis);

        form.reset();

        // istersen feed'e yönlendir:
        // location.href = "/feed/feed.html";

    } catch (err) {
        console.error(err);
        setMsg("❌ " + String(err?.message || err));
    } finally {
        disable(false);
    }
});
