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
const $category = document.getElementById("category"); // varsa
const $content = document.getElementById("postContent");
const $image = document.getElementById("image");

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

// ❗ author_id lazım: localStorage’dan alıyoruz
function getAuthorId() {
    // senin projede genelde sm_uid veya appwrite uid tutuluyor
    const uid =
        String(localStorage.getItem("sm_uid") || "").trim() ||
        String(localStorage.getItem("appwrite_uid") || "").trim() ||
        String(localStorage.getItem("uid") || "").trim();

    if (!uid) throw new Error("Author id (sm_uid) not found. Login required.");
    return uid;
}

async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(EP_UPLOAD, { method: "POST", body: fd });
    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Upload failed (${r.status})`);
    }
    return data.url; // full public url
}

async function createAnalysis(payload) {
    const authorId = getAuthorId();

    const r = await fetch(EP_CREATE, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            "X-User-Id": authorId,
        },
        body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => ({}));
    if (!r.ok || !j.ok) {
        throw new Error(j.error || j.detail || `Create failed (${r.status})`);
    }

    // senin server.js bazen {ok:true, id,...} bazen {ok:true, analysis:{id...}}
    return j.analysis || j;
}

form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");

    try {
        const market = String($market?.value || "").trim();
        const timeframe = String($timeframe?.value || "").trim();
        const category = String($category?.value || "").trim(); // opsiyonel
        const pairs = parsePairs($pair?.value);
        const content = String($content?.value || "").trim();
        const file = $image?.files?.[0];

        if (!market) throw new Error("Market required");
        if (!timeframe) throw new Error("Timeframe required");
        if (!pairs.length) throw new Error("Pair required");
        if (!content) throw new Error("Content required");
        if (!file) throw new Error("Image required");

        disable(true);
        setMsg("Uploading image...");

        const imageUrl = await uploadImage(file);
        setMsg("Creating post...");

        const created = await createAnalysis({
            market,
            category: category || "General",
            timeframe,
            content,
            pairs,
            image_path: imageUrl, // feed.js resolveImageUrl bunu da okur (full url)
        });

        console.log("✅ CREATED:", created);
        setMsg("✅ Published!");

        // Feed’e at
        setTimeout(() => {
            window.location.href = "/feed/feed.html";
        }, 400);
    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err?.message || err));
    } finally {
        disable(false);
    }
});
