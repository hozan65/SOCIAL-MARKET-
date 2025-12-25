// netlify/functions/_verify.js
import { Client, Account } from "node-appwrite";

export function getBearer(eventOrReq) {
    // Netlify event headers
    const h1 =
        eventOrReq?.headers?.authorization ||
        eventOrReq?.headers?.Authorization ||
        "";

    // Fetch Request headers
    const h2 =
        typeof eventOrReq?.headers?.get === "function"
            ? (eventOrReq.headers.get("authorization") ||
                eventOrReq.headers.get("Authorization") ||
                "")
            : "";

    const header = String(h1 || h2 || "").trim();
    const m = header.match(/^Bearer\s+(.+)$/i);
    return m ? m[1].trim() : "";
}

// ✅ Appwrite JWT -> user doğrulama
export async function verifyAppwriteUser(eventOrReq) {
    const jwt = getBearer(eventOrReq);
    if (!jwt) throw new Error("Missing JWT");

    const endpoint = process.env.APPWRITE_ENDPOINT;
    const projectId = process.env.APPWRITE_PROJECT_ID;
    if (!endpoint || !projectId) throw new Error("Missing Appwrite env");

    const client = new Client().setEndpoint(endpoint).setProject(projectId);
    const account = new Account(client);

    // Appwrite Node SDK: JWT ile session
    // Bazı sürümlerde setJWT var, bazı sürümlerde setSession yok.
    // Netlify’de en stabil: client.setJWT(jwt)
    if (typeof client.setJWT === "function") client.setJWT(jwt);
    else throw new Error("Appwrite SDK missing client.setJWT (update node-appwrite)");

    const me = await account.get();

    return {
        uid: me.$id,
        email: me.email || "",
        name: me.name || "",
    };
}
