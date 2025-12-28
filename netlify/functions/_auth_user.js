// netlify/functions/_auth_user.js
import { getAppwriteUser } from "./_appwrite_user.js";

export async function handler(event) {
    try {
        if (event.httpMethod === "OPTIONS") return json(204, null);

        if (event.httpMethod !== "GET") {
            return json(405, { error: "Method not allowed" });
        }

        const { user } = await getAppwriteUser(event);

        return json(200, {
            ok: true,
            user: {
                $id: user.$id,
                name: user.name || "",
                email: user.email || "",
            },
            uid: user.$id,
            user_id: user.$id,
        });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        const status = low.includes("jwt") || low.includes("authorization") ? 401 : 500;
        return json(status, { error: msg });
    }
}

function json(status, body) {
    return new Response(body == null ? "" : JSON.stringify(body), {
        status,
        headers: {
            "Content-Type": "application/json; charset=utf-8",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
    });
}
