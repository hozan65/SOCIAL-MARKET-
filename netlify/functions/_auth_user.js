// netlify/functions/_auth_user.js
async function appwriteMe(appwriteJwt) {
    const endpoint = process.env.APPWRITE_ENDPOINT;
    const project = process.env.APPWRITE_PROJECT_ID;

    if (!endpoint) throw new Error("MISSING_APPWRITE_ENDPOINT");
    if (!project) throw new Error("MISSING_APPWRITE_PROJECT_ID");
    if (!appwriteJwt) throw new Error("MISSING_TOKEN");

    const r = await fetch(`${endpoint}/account`, {
        method: "GET",
        headers: {
            "X-Appwrite-Project": project,
            "X-Appwrite-JWT": appwriteJwt,
            "Content-Type": "application/json",
        },
    });

    const text = await r.text();
    let data = null;
    try { data = JSON.parse(text); } catch { data = text; }

    if (!r.ok) throw new Error("UNAUTHORIZED");
    const userId = data?.$id;
    if (!userId) throw new Error("NO_USER_ID");
    return String(userId);
}

function getBearerToken(event) {
    const auth = event.headers.authorization || event.headers.Authorization || "";
    return auth.startsWith("Bearer ") ? auth.slice(7) : "";
}

module.exports = { appwriteMe, getBearerToken };
