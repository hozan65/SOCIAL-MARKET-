import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

const json = (s,b)=>({
    statusCode:s,
    headers:{
        "Content-Type":"application/json",
        "Cache-Control":"no-store",
        "Access-Control-Allow-Origin":"*",
        "Access-Control-Allow-Headers":"Content-Type, Authorization, X-Appwrite-JWT",
        "Access-Control-Allow-Methods":"POST,OPTIONS"
    },
    body:JSON.stringify(b)
});

export const handler = async (event) => {
    try{
        if (event.httpMethod === "OPTIONS") return json(200,{ok:true});
        if (event.httpMethod !== "POST") return json(405,{error:"Method not allowed"});

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401,{error:"Unauthorized"});

        const body = JSON.parse(event.body || "{}");
        const conversation_id = String(body?.conversation_id || "").trim();
        if (!conversation_id) return json(400,{error:"Missing conversation_id"});

        // ✅ must be participant
        const { data: conv, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id")
            .eq("id", conversation_id)
            .maybeSingle();

        if (e1) return json(500,{error:e1.message});
        if (!conv?.id) return json(404,{error:"Conversation not found"});
        if (conv.user1_id !== me && conv.user2_id !== me) return json(403,{error:"Forbidden"});

        const nowIso = new Date().toISOString();
        const { error: e2 } = await sb
            .from("messages")
            .update({ read_at: nowIso })
            .eq("conversation_id", conversation_id)
            .is("read_at", null)
            .neq("sender_id", me);

        if (e2) return json(500,{error:e2.message});

        return json(200,{ ok:true });
    } catch(e){
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status,{error:msg});
    }
};
