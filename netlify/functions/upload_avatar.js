// netlify/functions/upload_avatar.js
import { authedUser } from "./_auth_user.js";

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

export async function handler(event) {
    if (event.httpMethod === "OPTIONS") {
        return {
            statusCode: 200,
            headers: {
                "Access-Control-Allow-Origin": "*",
                "Access-Control-Allow-Headers": "Content-Type, Authorization",
                "Access-Control-Allow-Methods": "POST, OPTIONS",
            },
            body: "",
        };
    }

    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method not allowed" };
    }

    if (!SUPABASE_URL || !SERVICE_KEY) {
        return { statusCode: 500, body: "Missing Supabase ENV" };
    }

    // ✅ JWT doğrula
    const me = await authedUser(event);
    if (!me?.ok) {
        return { statusCode: 401, body: "Unauthorized" };
    }

    const contentType = event.headers["content-type"] || "";
    if (!contentType.includes("multipart/form-data")) {
        return { statusCode: 400, body: "Expected multipart/form-data" };
    }

    // multipart parse (basit)
    const boundary = contentType.split("boundary=")[1];
    const raw = Buffer.from(event.body, "base64").toString("binary");
    const parts = raw.split("--" + boundary);

    const filePart = parts.find((p) => p.includes("filename="));
    if (!filePart) {
        return { statusCode: 400, body: "File not found" };
    }

    const match = filePart.match(/filename="(.+?)"/);
    const filename = match ? match[1] : "avatar.jpg";
    const ext = filename.split(".").pop().toLowerCase();
    if (!["jpg", "jpeg", "png", "webp"].includes(ext)) {
        return { statusCode: 400, body: "Invalid file type" };
    }

    const fileData = filePart.split("\r\n\r\n")[1].split("\r\n--")[0];
    const buffer = Buffer.from(fileData, "binary");

    const path = `avatars/${me.user_id}.${ext}`;

    // 🔹 Supabase upload
    const uploadRes = await fetch(
        `${SUPABASE_URL}/storage/v1/object/${path}`,
        {
            method: "PUT",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                "Content-Type": `image/${ext}`,
            },
            body: buffer,
        }
    );

    if (!uploadRes.ok) {
        return { statusCode: 500, body: "Upload failed" };
    }

    const publicUrl = `${SUPABASE_URL}/storage/v1/object/public/${path}`;

    // 🔹 DB update
    await fetch(
        `${SUPABASE_URL}/rest/v1/profiles?appwrite_user_id=eq.${me.user_id}`,
        {
            method: "PATCH",
            headers: {
                Authorization: `Bearer ${SERVICE_KEY}`,
                apikey: SERVICE_KEY,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                avatar_url: publicUrl,
                updated_at: new Date().toISOString(),
            }),
        }
    );

    return {
        statusCode: 200,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ok: true, avatar_url: publicUrl }),
    };
}
