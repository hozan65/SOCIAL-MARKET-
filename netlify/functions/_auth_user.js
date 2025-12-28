// netlify/functions/_auth_user.js
// CommonJS helper: verifies Appwrite JWT and returns { uid, email }

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "").trim();     // e.g. https://cloud.appwrite.io/v1
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim(); // Appwrite Project ID

async function authUser(jwt) {
    if (!jwt) throw new Error("Missing JWT");

    if (!APPWRITE_ENDPOINT || !APPWRITE_PROJECT_ID) {
        throw new Error("Missing APPWRITE_ENDPOINT / APPWRITE_PROJECT_ID in Netlify env");
    }

    const url = `${APPWRITE_ENDPOINT.replace(/\/$/, "")}/account`;

    const r = await fetch(url, {
        method: "GET",
        headers: {
            "X-Appwrite-Project": APPWRITE_PROJECT_ID,
            "X-Appwrite-JWT": jwt,
        },
    });

    const j = await r.json().catch(() => null);

    if (!r.ok) {
        const msg = j?.message || `Appwrite auth failed (${r.status})`;
        throw new Error(msg);
    }

    const uid = j?.$id || j?.id || null;
    const email = j?.email || null;

    if (!uid) throw new Error("Appwrite user id not found");
    return { uid, email };
}

module.exports = { authUser };
