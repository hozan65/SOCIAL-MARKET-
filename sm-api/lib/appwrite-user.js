// /sm-api/lib/appwrite-user.js
import sdk from "node-appwrite";

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1").trim();
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

export function getBearer(req) {
    const h = req.headers?.authorization || req.headers?.Authorization || "";
    return String(h).startsWith("Bearer ") ? String(h).slice(7).trim() : "";
}

export async function getAppwriteUserFromJwt(jwt) {
    if (!APPWRITE_PROJECT_ID) throw new Error("Missing APPWRITE_PROJECT_ID env");
    if (!jwt) throw new Error("Missing JWT");

    const client = new sdk.Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setJWT(jwt);

    const account = new sdk.Account(client);
    const user = await account.get(); // throws if invalid/expired
    return user;
}
