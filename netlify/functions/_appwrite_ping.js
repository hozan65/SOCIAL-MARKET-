import { getAppwriteUser } from "./_appwrite_user.js";

export const handler = async (event) => {
    try {
        const { user } = await getAppwriteUser(event);
        return {
            statusCode: 200,
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ ok:true, uid: user.$id }),
        };
    } catch (e) {
        return {
            statusCode: 500,
            headers: { "Content-Type":"application/json" },
            body: JSON.stringify({ ok:false, error: String(e?.message || e) }),
        };
    }
};
