// /post/post.js (FINAL - Appwrite JWT + create_post)
// - Upload image to Supabase Storage (client via /service/supabase.js)
// - Create analysis row via API (create_post)

import { supabase } from "/services/supabase.js";

const BUCKET = "analysis-images";
const FN_CREATE_POST = "/.netlify/functions/create_post"; // sen backend endpointin buysa kalsın

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

function getJWT() {
    const jwt = localStorage.getItem("sm_jwt");
    if (!jwt) throw new Error("Login required");
    return jwt;
}

function guessExt(file) {
    const byName = (file?.name || "").split(".").pop()?.toLowerCase();
    if (byName) return byName;
    const t = (file?.type || "").toLowerCase();
    if (t.includes("png")) return "png";
    if (t.includes("jpeg") || t.includes("jpg")) return "jpg";
    if (t.includes("webp")) return "webp";
    return "png";
}

async function uploadImage(file) {
    if (!file) throw new Error("Please select an image.");

    const ext = guessExt(file);
    const filePath = `posts/${Date.now()}-${Math.random().toString(16).slice(2)}.${ext}`;

    const { error } = await supabase.storage.from(BUCKET).upload(filePath, file, {
        upsert: false,
        cacheControl: "3600",
        contentType: file.type || "image/*",
    });

    if (error) throw error;

    // Bucket PUBLIC ise:
    const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);
    if (!data?.publicUrl) throw new Error("Image URL not available");

    return data.publicUrl;
}

async function createPost(payload) {
    const jwt = getJWT();

    const r = await fetch(FN_CREATE_POST, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${jwt}`,
        },
        body: JSON.stringify(payload),
    });

    const j = await r.json().catch(() => null);
    if (!r.ok) throw new Error(j?.error || `create_post failed (${r.status})`);
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
        const imageUrl = await uploadImage(file);

        setMsg("Saving analysis...");

        // ✅ create_post function already sets author_id from Appwrite userId
        const payload = {
            market,
            category: "Trend",
            timeframe,
            content,
            pairs,
            image_path: imageUrl,
        };

        console.log("CREATE_POST PAYLOAD:", payload);

        await createPost(payload);

        setMsg("Published successfully!");
        form.reset();
    } catch (err) {
        console.error("POST ERROR:", err);
        setMsg("Error: " + (err?.message || "unknown"));
    } finally {
        if (publishBtn) publishBtn.disabled = false;
    }
});
