// netlify/functions/upload_avatar.js
const { createClient } = require("@supabase/supabase-js");
const { authUser } = require("./_auth_user");

const SUPABASE_URL = (process.env.SUPABASE_URL || "").trim();
const SERVICE_KEY = (process.env.SUPABASE_SERVICE_ROLE_KEY || "").trim();
const BUCKET = (process.env.AVATAR_BUCKET || "avatars").trim();

function json(statusCode, obj) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization",
            "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: JSON.stringify(obj),
    };
}

function getBearer(event) {
    const h = event.headers.authorization || event.headers.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : null;
}

/**
 * Parse multipart/form-data from Netlify event.body
 * Netlify supplies body as base64 for multipart.
 * We must decode base64 -> Buffer then split by boundary.
 */
function parseMultipart(event) {
    const ct = event.headers["content-type"] || event.headers["Content-Type"] || "";
    if (!ct.includes("multipart/form-data")) {
        throw new Error("Expected multipart/form-data");
    }

    const m = ct.match(/boundary=([^\s;]+)/i);
    if (!m) throw new Error("Missing boundary");
    const boundary = m[1];

    if (!event.body) throw new Error("Missing body");

    // Netlify often sets event.isBase64Encoded = true for multipart
    const bodyBuf = event.isBase64Encoded
        ? Buffer.from(event.body, "base64")
        : Buffer.from(event.body, "utf8");

    const boundaryBuf = Buffer.from(`--${boundary}`);
    const parts = [];
    let start = bodyBuf.indexOf(boundaryBuf);

    while (start !== -1) {
        start += boundaryBuf.length + 2; // skip boundary + CRLF
        const end = bodyBuf.indexOf(boundaryBuf, start);
        if (end === -1) break;

        const part = bodyBuf.slice(start, end - 2); // remove trailing CRLF
        parts.push(part);
        start = end;
    }

    // Find file part: has Content-Disposition with name="file"
    for (const p of parts) {
        const headerEnd = p.indexOf(Buffer.from("\r\n\r\n"));
        if (headerEnd === -1) continue;

        const header = p.slice(0, headerEnd).toString("utf8");
        const content = p.slice(headerEnd + 4); // after \r\n\r\n

        const disp = header.match(/Content-Disposition:.*name="([^"]+)"/i);
        const filename = header.match(/filename="([^"]*)"/i);
        const ctype = header.match(/Content-Type:\s*([^\r\n]+)/i);

        const fieldName = disp?.[1] || "";
        if (fieldName !== "file") continue;

        const originalName = filename?.[1] || "avatar";
        const mime = (ctype?.[1] || "application/octet-stream").trim();

        return { fileBuffer: content, originalName, mime };
    }

    throw new Error("Missing file in multipart (field name must be 'file')");
}

exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "POST") return json(405, { error: "Method not allowed" });

        if (!SUPABASE_URL || !SERVICE_KEY) return json(500, { error: "Missing Supabase env" });

        const jwt = getBearer(event);
        if (!jwt) return json(401, { error: "Missing JWT" });

        // ✅ Verify Appwrite JWT
        const user = await authUser(jwt); // { uid, email }

        // ✅ Parse multipart file
        const { fileBuffer, originalName, mime } = parseMultipart(event);

        // ✅ Basic validation
        if (!fileBuffer || !fileBuffer.length) return json(400, { error: "Empty file" });
        if (fileBuffer.length > 3 * 1024 * 1024) return json(400, { error: "Max 3MB" });

        // Only allow images
        if (!mime.startsWith("image/")) return json(400, { error: "File must be an image" });

        const sb = createClient(SUPABASE_URL, SERVICE_KEY);

        // ✅ Create path
        const ext = (originalName.split(".").pop() || "jpg").toLowerCase().replace(/[^a-z0-9]/g, "");
        const safeExt = ["jpg", "jpeg", "png", "webp", "gif"].includes(ext) ? ext : "jpg";
        const filePath = `${user.uid}/avatar.${safeExt}`;

        // ✅ Upload (upsert true)
        const up = await sb.storage.from(BUCKET).upload(filePath, fileBuffer, {
            contentType: mime,
            upsert: true,
            cacheControl: "3600",
        });

        if (up.error) throw up.error;

        // ✅ Public URL
        const pub = sb.storage.from(BUCKET).getPublicUrl(filePath);
        const avatar_url = pub?.data?.publicUrl || "";

        if (!avatar_url) return json(500, { error: "Could not create public URL" });

        // ✅ Save avatar_url to profiles row (PK = appwrite_user_id)
        const { error: upsertErr } = await sb.from("profiles").upsert(
            {
                appwrite_user_id: user.uid,
                avatar_url,
                updated_at: new Date().toISOString(),
            },
            { onConflict: "appwrite_user_id" }
        );

        if (upsertErr) throw upsertErr;

        return json(200, { ok: true, avatar_url });
    } catch (e) {
        console.error("upload_avatar error:", e);
        return json(400, { error: e?.message || "Upload error" });
    }
};
