// /post/post.js  (FULL - Supabase removed, sm-api only)
// ✅ Upload image (multipart) + client compress
// ✅ Create post via sm-api
// ✅ Strong errors + safe DOM handling

console.log("✅ post.js loaded (sm-api only)");

/* =========================
   CONFIG
========================= */
const API_BASE = "https://api.chriontoken.com"; // <-- PROD API
const EP_UPLOAD = `${API_BASE}/api/upload/analysis-image`;
const EP_CREATE_POST = `${API_BASE}/api/posts`;

// LocalStorage keys
const LS_JWT = "sm_jwt"; // eğer farklıysa değiştir

/* =========================
   DOM HELPERS
========================= */
const $ = (id) => document.getElementById(id);

function pickEl(...ids) {
    for (const id of ids) {
        const el = $(id);
        if (el) return el;
    }
    return null;
}

function setText(el, text) {
    if (!el) return;
    el.textContent = text || "";
}

function setBusy(btn, busy, labelBusy = "Publishing...") {
    if (!btn) return;
    btn.disabled = !!busy;
    if (!btn.dataset._label) btn.dataset._label = btn.textContent || "Publish";
    btn.textContent = busy ? labelBusy : btn.dataset._label;
}

/* ✅ FIXED */
function getJWT() {
    const t = localStorage.getItem(LS_JWT);
    return (t || "").trim();
}

/* =========================
   IMAGE COMPRESS (client-side)
========================= */
async function resizeImageFile(file, { maxW = 1280, quality = 0.82 } = {}) {
    if (!file || !file.type || !file.type.startsWith("image/")) return file;

    const img = new Image();
    const url = URL.createObjectURL(file);

    try {
        await new Promise((resolve, reject) => {
            img.onload = resolve;
            img.onerror = reject;
            img.src = url;
        });

        const ratio = Math.min(1, maxW / img.width);
        const w = Math.max(1, Math.round(img.width * ratio));
        const h = Math.max(1, Math.round(img.height * ratio));

        const canvas = document.createElement("canvas");
        canvas.width = w;
        canvas.height = h;

        const ctx = canvas.getContext("2d");
        ctx.drawImage(img, 0, 0, w, h);

        const blob = await new Promise((resolve) =>
            canvas.toBlob(resolve, "image/jpeg", quality)
        );

        if (!blob) return file;

        const newName = (file.name || "image").replace(/\.\w+$/, "") + ".jpg";

        return new File([blob], newName, {
            type: "image/jpeg",
            lastModified: Date.now(),
        });
    } finally {
        URL.revokeObjectURL(url);
    }
}

/* =========================
   FETCH HELPERS
========================= */
async function safeText(res) {
    try {
        return await res.text();
    } catch {
        return "";
    }
}

async function postJson(url, bodyObj, jwt) {
    const res = await fetch(url, {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: JSON.stringify(bodyObj),
    });

    if (!res.ok) {
        const t = await safeText(res);
        throw new Error(`HTTP ${res.status} ${t || ""}`.trim());
    }

    return await res.json();
}

/* =========================
   UPLOAD IMAGE
========================= */
async function uploadImageToApi(file, jwt) {
    if (!file) return null;

    const resized = await resizeImageFile(file, { maxW: 1280, quality: 0.82 });

    const MAX = 6 * 1024 * 1024;
    if (resized.size > MAX) {
        throw new Error(
            `Image too large after compress: ${(resized.size / 1024 / 1024).toFixed(
                2
            )}MB (max ~6MB)`
        );
    }

    const fd = new FormData();
    fd.append("file", resized);

    const res = await fetch(EP_UPLOAD, {
        method: "POST",
        headers: {
            ...(jwt ? { Authorization: `Bearer ${jwt}` } : {}),
        },
        body: fd,
    });

    if (!res.ok) {
        const t = await safeText(res);
        throw new Error(`Upload failed: ${res.status} ${t || ""}`.trim());
    }

    const data = await res.json();
    const url = data?.url || data?.publicUrl || data?.path || null;

    if (!url) throw new Error("Upload response missing url");
    return url;
}

/* =========================
   MAIN: CREATE POST
========================= */
const form = pickEl("postForm", "createPostForm");
const publishBtn = pickEl("publishBtn", "submitBtn");
const msg = pickEl("formMsg", "postMsg", "msg");

const titleEl = pickEl("title", "postTitle");
const contentEl = pickEl("content", "postContent", "text", "body");
const tagsEl = pickEl("tags", "postTags");
const imageEl =
    document.querySelector('input[type="file"][name="image"]') ||
    pickEl("image", "imageFile", "postImage");

function getValue(el) {
    return (el?.value ?? "").toString().trim();
}

function parseTags(raw) {
    return (raw || "")
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean)
        .slice(0, 20);
}

function getFirstFile(input) {
    const f = input?.files?.[0];
    return f || null;
}

async function handleSubmit(e) {
    e.preventDefault();
    setText(msg, "");

    const jwt = getJWT();
    const title = getValue(titleEl);
    const content = getValue(contentEl);
    const tags = parseTags(getValue(tagsEl));

    if (!content && !title) {
        setText(msg, "Title or content is required.");
        return;
    }

    setBusy(publishBtn, true);

    try {
        const file = getFirstFile(imageEl);
        let imageUrl = null;

        if (file) {
            setText(msg, "Uploading image...");
            imageUrl = await uploadImageToApi(file, jwt);
        }

        setText(msg, "Publishing post...");

        const payload = {
            title,
            content,
            tags,
            image_url: imageUrl,
            imageUrl: imageUrl,
            visibility: "public",
        };

        const created = await postJson(EP_CREATE_POST, payload, jwt);

        setText(msg, "✅ Posted!");

        const newId = created?.id || created?.post?.id || created?.data?.id || null;
        if (newId) {
            location.href = `/view/view.html?id=${encodeURIComponent(newId)}`;
            return;
        }

        form?.reset?.();
    } catch (err) {
        console.error("POST ERROR:", err);
        setText(msg, `❌ ${err?.message || "Post failed"}`);
    } finally {
        setBusy(publishBtn, false);
    }
}

if (form) {
    form.addEventListener("submit", handleSubmit);
} else {
    console.warn("⚠️ post form not found (expected #postForm)");
}
