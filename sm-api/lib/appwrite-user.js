// /sm-api/lib/appwrite-user.js
import sdk from "node-appwrite";

const APPWRITE_ENDPOINT = (process.env.APPWRITE_ENDPOINT || "https://cloud.appwrite.io/v1").trim();
const APPWRITE_PROJECT_ID = (process.env.APPWRITE_PROJECT_ID || "").trim();

export function getBearer(req) {
    const h = String(req.headers?.authorization || req.headers?.Authorization || "").trim();
    const m = h.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
}

export async function getAppwriteUserFromJwt(jwt) {
    if (!APPWRITE_PROJECT_ID) throw new Error("Missing APPWRITE_PROJECT_ID env");
    if (!jwt) throw new Error("Missing JWT");

    const client = new sdk.Client()
        .setEndpoint(APPWRITE_ENDPOINT)
        .setProject(APPWRITE_PROJECT_ID)
        .setJWT(jwt);

    const account = new sdk.Account(client);
    const user = await account.get(); // invalid/expired => throw
    return user; // { $id, email, name ... }
}
