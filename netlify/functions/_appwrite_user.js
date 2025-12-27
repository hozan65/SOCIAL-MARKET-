// netlify/functions/_appwrite_user.js
export async function getAppwriteUser(event) {
    const h = event.headers || {};
    const auth = h.authorization || h.Authorization || "";
    const jwt =
        (auth.startsWith("Bearer ") ? auth.slice(7) : "") ||
        h["x-appwrite-jwt"] || h["X-Appwrite-JWT"] ||
        h["x-jwt"] || h["X-JWT"];

    if (!jwt) throw new Error("Missing JWT");

    const endpoint = process.env.APPWRITE_ENDPOINT;
    const project = process.env.APPWRITE_PROJECT_ID;
    if (!endpoint || !project) throw new Error("Missing Appwrite envs");

    const res = await fetch(`${endpoint.replace(/\/$/, "")}/account`, {
        headers: {
            "X-Appwrite-Project": project,
            "X-Appwrite-JWT": jwt
        }
    });

    if (!res.ok) throw new Error("Invalid JWT");
    const user = await res.json();
    return { user, jwt };
}
