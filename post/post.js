// /post/post.js (FINAL - sm-api publish / UUID fix)
// ✅ NO X-User-Id
// ✅ Author UUID resolved on backend via JWT -> users.appwrite_uid -> users.id
// ✅ Upload image + create analysis

console.log("✅ post.js loaded (sm-api publish)");

const API_BASE = "https://api.chriontoken.com";
const EP_UPLOAD = `${API_BASE}/api/upload/analysis-image`;
const EP_CREATE = `${API_BASE}/api/analyses/create`;

const form = document.getElementById("postForm");
const msg = document.getElementById("formMsg");
const publishBtn = document.getElementById("publishBtn");

const $market = document.getElementById("market");
const $pair = document.getElementById("pair");
const $timeframe = document.getElementById("timeframe");
const $category = document.getElementById("category"); // optional
const $content = document.getElementById("postContent");
const $image = document.getElementById("image");

let busy = false;

function setMsg(t) {
    if (msg) msg.textContent = t || "";
}

function disable(b) {
    if (!publishBtn) return;
    publishBtn.disabled = !!b;
    publishBtn.textContent = b ? "Publishing..." : "Publish";
}

function parsePairs(str) {
    return String(str || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

// ✅ JWT required for create
function getJWT() {
    const jwt = (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
    if (!jwt) throw new Error("Login required (missing sm_jwt)");
    return jwt;
}

// ✅ JWT optional for upload (keep it soft)
function getJWTSoft() {
    return (window.SM_JWT || localStorage.getItem("sm_jwt") || "").trim();
}

async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const jwt = getJWTSoft();

    const r = await fetch(EP_UPLOAD, {
        method: "POST",
        headers: jwt ? { Authorization: `Bearer ${jwt}` } : undefined,
        body: fd,
    });

    const data = await r.json().catch(() => ({}));

    // expected: { ok:true, url:"https://..../uploads/x.png" }  (optional: path:"/uploads/x.png")
    if (!r.ok || !data.ok || (!data.url && !data.path)) {
        throw new Error(data.error || `Upload failed (${r.status})`);
    }

    // DB prefers path if server returns it, else url
    return data.path || data.url;
}

async function createAnalysis(payload) {
    const jwt = getJWT();

    const r = await fetch(EP_CREATE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload || {}),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
        throw new Error(j.error || j.detail || `Create failed (${r.status})`);
    }

    return j.analysis || j;
}

form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    if (busy) return;
    busy = true;

    setMsg("");
    disable(true);

    let success = false;

    try {
        const market = String($market?.value || "").trim();
        const timeframe = String($timeframe?.value || "").trim();
        const category = String($category?.value || "").trim();
        const pairs = parsePairs($pair?.value);
        const content = String($content?.value || "").trim();
        const file = $image?.files?.[0];

        if (!market) throw new Error("Market required");
        if (!timeframe) throw new Error("Timeframe required");
        if (!pairs.length) throw new Error("Pair required");
        if (!content) throw new Error("Content required");
        if (!file) throw new Error("Image required");

        setMsg("Uploading image...");
        const imagePathOrUrl = await uploadImage(file);

        setMsg("Creating post...");
        const created = await createAnalysis({
            market,
            category: category || "General",
            timeframe,
            content,
            pairs,
            image_path: imagePathOrUrl,
        });

        console.log("✅ CREATED:", created);

        success = true;
        setMsg("✅ Published! Redirecting...");

        setTimeout(() => {
            window.location.href = "/feed/feed.html";
        }, 350);
    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || err));
    } finally {
        busy = false;
        if (!success) disable(false);
    }
});
