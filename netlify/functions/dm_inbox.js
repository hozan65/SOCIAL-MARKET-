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
        "Access-Control-Allow-Methods":"GET,OPTIONS"
    },
    body:JSON.stringify(b)
});

export const handler = async (event) => {
    try{
        if (event.httpMethod === "OPTIONS") return json(200,{ok:true});
        if (event.httpMethod !== "GET") return json(405,{error:"Method not allowed"});

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401,{error:"Unauthorized"});

        const { data: convs, error: e1 } = await sb
            .from("conversations")
            .select("id,user1_id,user2_id,created_at,updated_at")
            .or(`user1_id.eq.${me},user2_id.eq.${me}`)
            .order("updated_at", { ascending:false })
            .limit(100);

        if (e1) return json(500,{error:e1.message});
        if (!convs?.length) return json(200,{ok:true, list:[]});

        const convIds = convs.map(c=>c.id);
        const otherIds = convs.map(c => (c.user1_id === me ? c.user2_id : c.user1_id));

        const { data: profs, error: e2 } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .in("appwrite_user_id", otherIds);

        if (e2) return json(500,{error:e2.message});
        const profMap = new Map((profs||[]).map(p=>[p.appwrite_user_id, p]));

        // last message per conversation
        const { data: msgs, error: e3 } = await sb
            .from("messages")
            .select("conversation_id,body,created_at")
            .in("conversation_id", convIds)
            .order("created_at", { ascending:false })
            .limit(500);

        if (e3) return json(500,{error:e3.message});
        const lastMap = new Map();
        for (const m of msgs || []) if (!lastMap.has(m.conversation_id)) lastMap.set(m.conversation_id, m);

        const list = convs.map(c=>{
            const otherId = (c.user1_id === me ? c.user2_id : c.user1_id);
            const p = profMap.get(otherId) || {};
            const last = lastMap.get(c.id) || null;

            return {
                conversation_id: c.id,
                other_id: otherId,
                other_name: p.name || "User",
                other_avatar_url: p.avatar_url || "",
                last_body: last?.body || ""
            };
        });

        return json(200,{ok:true, list});
    } catch(e){
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status,{error:msg});
    }
};
