console.log("✅ post.js loaded (sm-api only)");

const API_BASE = "https://api.chriontoken.com";
const EP_UPLOAD = `${API_BASE}/api/upload/analysis-image`;

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
    if (publishBtn) {
        publishBtn.disabled = !!b;
        publishBtn.textContent = b ? "Publishing..." : "Publish";
    }
}

function parsePairs(str) {
    return String(str || "")
        .split(",")
        .map(s => s.trim())
        .filter(Boolean);
}

// ✅ TEK uploadImage — ÇAKIŞMA YOK
async function uploadImage(file) {
    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(EP_UPLOAD, {
        method: "POST",
        body: fd
    });

    const data = await r.json().catch(() => ({}));

    if (!r.ok || !data.ok || !data.url) {
        throw new Error(data.error || `Upload failed (${r.status})`);
    }

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
        const file = $image?.files?.[0];

        if (!market) throw new Error("Market required");
        if (!timeframe) throw new Error("Timeframe required");
        if (!pairs.length) throw new Error("Pair required");
        if (!content) throw new Error("Content required");
        if (!file) throw new Error("Image required");

        disable(true);

        const imageUrl = await uploadImage(file);

        console.log("✅ IMAGE UPLOADED:", imageUrl);
        setMsg("✅ Image uploaded successfully");

        // burada ister create analysis endpointine geçersin
        // şimdilik upload test yeterli

        form.reset();
    } catch (err) {
        console.error(err);
        setMsg("❌ " + (err.message || err));
    } finally {
        disable(false);
    }
});
