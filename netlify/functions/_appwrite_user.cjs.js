
// netlify/functions/_appwrite_user.cjs
// ✅ CommonJS wrapper: getAppwriteUser(event) -> { user }

const sdk = require("node-appwrite");

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1").trim();
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

function getBearer(event) {
    const h = event.headers?.authorization || event.headers?.Authorization || "";
    return h.startsWith("Bearer ") ? h.slice(7).trim() : "";
}

async function getAppwriteUser(event) {
    if (!APPWRITE_PROJECT_ID) throw new Error("Missing APPWRITE_PROJECT_ID env");

    const jwt =
        getBearer(event) ||
        String(event.headers?.["x-appwrite-jwt"] || event.headers?.["X-Appwrite-JWT"] || "").trim();

    if (!jwt) throw new Error("Missing JWT");

    const client = new sdk.Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setJWT(jwt);

    const account = new sdk.Account(client);
    const user = await account.get();
    return { user };
}

module.exports = { getAppwriteUser };
