import { Client, Account } from "node-appwrite";

export async function verifyAppwriteUser(req) {
    const auth = req.headers.get("authorization") || "";
    const token = auth.startsWith("Bearer ") ? auth.slice(7) : null;
    if (!token) throw new Error("Login required");

    const aw = new Client()
        .setEndpoint(process.env.APPWRITE_ENDPOINT)
        .setProject(process.env.APPWRITE_PROJECT_ID)
        .setJWT(token);

    const account = new Account(aw);
    const user = await account.get(); // invalid token -> throws
    return { userId: user.$id };
}
