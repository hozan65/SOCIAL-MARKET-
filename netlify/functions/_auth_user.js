// netlify/functions/_auth_user.js  (COMMONJS FIX)
// ✅ add_comment.js require("./_auth_user") ile çalışır
// ✅ /_auth_user endpoint'i (GET) çalışmaya devam eder

const { getAppwriteUser } = require("../lib/appwrite_user.cjs");


// --- Netlify endpoint (GET) ---
exports.handler = async (event) => {
    try {
        if (event.httpMethod === "OPTIONS") return json(200, { ok: true });
        if (event.httpMethod !== "GET") return json(405, { error: "Method not allowed" });

        const { user } = await getAppwriteUser(event);

        return json(200, {
            ok: true,
            uid: user.$id,
            user_id: user.$id,
            user: {
                $id: user.$id,
                name: user.name || "",
                email: user.email || "",
            },
        });
    } catch (e) {
        const msg = String(e?.message || e);
        const low = msg.toLowerCase();
        const status = low.includes("jwt") || low.includes("unauthorized") || low.includes("invalid") ? 401 : 500;
        return json(status, { error: msg });
    }
};

// --- add_comment gibi fonksiyonların çağıracağı helper ---
async function authUser(jwt) {
    // add_comment tarafı event değil jwt gönderiyor
    const fakeEvent = {
        headers: {
            authorization: `Bearer ${jwt}`,
            Authorization: `Bearer ${jwt}`,
        },
        httpMethod: "GET",
    };

    const { user } = await getAppwriteUser(fakeEvent);
    const uid = String(user?.$id || "").trim();
    if (!uid) throw new Error("User id missing");
    return { uid, user };
}

module.exports.authUser = authUser;

function json(statusCode, body) {
    return {
        statusCode,
        headers: {
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Appwrite-JWT",
            "Access-Control-Allow-Methods": "GET, OPTIONS",
        },
        body: JSON.stringify(body),
    };
}
