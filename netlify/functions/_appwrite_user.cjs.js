// netlify/functions/_appwrite_user.cjs
// ✅ Minimal helper to create Appwrite client + account
// Works in Netlify Functions (Node). Uses env vars.

const sdk = require("node-appwrite");

function getJwtFromHeaders(headers = {}) {
    const h = {};
    for (const k of Object.keys(headers || {})) h[k.toLowerCase()] = headers[k];

    // supported headers
    const raw =
        h["x-appwrite-jwt"] ||
        h["x-jwt"] ||
        h["authorization"] ||
        "";

    // "Bearer <token>" or direct token
    const s = String(raw).trim();
    if (!s) return "";
    if (s.toLowerCase().startsWith("bearer ")) return s.slice(7).trim();
    return s;
}

function makeClient(jwt) {
    const endpoint = (process.env.APPWRITE_ENDPOINT || "").trim();
    const project = (process.env.APPWRITE_PROJECT_ID || "").trim();

    if (!endpoint || !project) {
        const err = new Error("Missing APPWRITE_ENDPOINT or APPWRITE_PROJECT_ID env");
        err.statusCode = 500;
        throw err;
    }

    const client = new sdk.Client().setEndpoint(endpoint).setProject(project);

    if (jwt) client.setJWT(jwt);
    return client;
}

async function getUserIdFromJwt(headers = {}) {
    const jwt = getJwtFromHeaders(headers);
    if (!jwt) {
        const err = new Error("Missing JWT (Authorization / X-Appwrite-JWT / x-jwt)");
        err.statusCode = 401;
        throw err;
    }

    const client = makeClient(jwt);
    const account = new sdk.Account(client);

    const me = await account.get(); // requires JWT
    const userId = me && (me.$id || me.id);
    if (!userId) {
        const err = new Error("Could not resolve user id from JWT");
        err.statusCode = 401;
        throw err;
    }
    return { userId, me };
}

module.exports = {
    getJwtFromHeaders,
    makeClient,
    getUserIdFromJwt
};
