// /post/post.js (FINAL - NO SUPABASE)
// ✅ Upload image -> sm-api (multipart)
// ✅ Create analysis row -> sm-api
//
// Required API:
// POST https://api.chriontoken.com/api/upload/analysis-image   (FormData: file)
// POST https://api.chriontoken.com/api/analyses/create        (JSON: { me, market, category, timeframe, content, pairs, image_path })

const API_BASE = "https://api.chriontoken.com";

const form = document.getElementById("postForm");
const msg = document.getElementById("formMsg");
const publishBtn = document.getElementById("publishBtn");

function setMsg(text) {
    if (msg) msg.textContent = text || "";
}

function safeTrim(v) {
    return String(v ?? "").trim();
}

function parsePairs(input) {
    return safeTrim(input)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);
}

// ✅ Appwrite UID (login.js set ediyor: localStorage.setItem("sm_uid", user.$id))
function getAppwriteUid() {
    const uid = localStorage.getItem("sm_uid");
    if (!uid) throw new Error("Login required");
    return uid;
}

// ---------- 1) Upload image to sm-api ----------
async function uploadImageToApi(file) {
    if (!file) throw new Error("Please select an image.");

    const fd = new FormData();
    fd.append("file", file);

    const r = await fetch(`${API_BASE}/api/upload/analysis-image`, {
        method: "POST",
        body: fd,
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `upload failed (${r.status})`);

    // j: { ok:true, image_path:"/uploads/analysis-images/xxx.webp" }
    if (!j?.image_path) throw new Error("upload: image_path missing");
    return j.image_path;
}

// ---------- 2) Create analysis row in DB ----------
async function createAnalysis(payload) {
    const r = await fetch(`${API_BASE}/api/analyses/create`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `create failed (${r.status})`);
    return j; // { ok:true, id: ... }
}

form?.addEventListener("submit", async (e) => {
    e.preventDefault();
    setMsg("");
    if (publishBtn) publishBtn.disabled = true;

    try {
        const market = safeTrim(document.getElementById("market")?.value);
        const pairInput = safeTrim(document.getElementById("pair")?.value);
        const timeframe = safeTrim(document.getElementById("timeframe")?.value);
        const content = safeTrim(document.getElementById("description")?.value);
        const file = document.getElementById("image")?.files?.[0];

        if (!market) throw new Error("Select market.");
        if (!pairInput) throw new Error("Enter pair(s).");
        if (!timeframe) throw new Error("Select timeframe.");
        if (!content) throw new Error("Analysis text cannot be empty.");
        if (!file) throw new Error("Please select a chart image.");

        const pairs = parsePairs(pairInput);
        if (!pairs.length) throw new Error("Invalid pair format.");

        setMsg("Uploading image...");
        const image_path = await uploadImageToApi(file); // ✅ /uploads/analysis-images/...

        setMsg("Saving analysis...");

        const payload = {
            me: getAppwriteUid(),          // ✅ Appwrite UID
            market,
            category: "Trend",
            timeframe,
            content,
            pairs,
            image_path,                   // ✅ public path
        };

        console.log("CREATE ANALYSIS:", payload);

        await createAnalysis(payload);

        setMsg("Published successfully!");
        form.reset();
    } catch (err) {
        console.error("POST ERROR:", err);
        setMsg("Error: " + (err?.message || "unknown"));
    } finally {
        if (publishBtn) publishBtn.disabled = false;
    }
});
