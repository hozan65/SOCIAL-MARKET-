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

const sortPair = (a,b)=> String(a) < String(b) ? [String(a),String(b)] : [String(b),String(a)];

export const handler = async (event) => {
    try{
        if (event.httpMethod === "OPTIONS") return json(200,{ok:true});
        if (event.httpMethod !== "GET") return json(405,{error:"Method not allowed"});

        const to = String(event.queryStringParameters?.to || "").trim();
        if (!to) return json(400,{error:"Missing 'to' param"});

        const { user } = await getAppwriteUser(event);
        const me = user?.$id;
        if (!me) return json(401,{error:"Unauthorized"});
        if (to === me) return json(400,{error:"Cannot message yourself"});

        // target profile must exist
        const { data: other, error: pe } = await sb
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .eq("appwrite_user_id", to)
            .maybeSingle();

        if (pe) return json(500,{error:pe.message});
        if (!other?.appwrite_user_id) return json(404,{error:"User not found"});

        const [user1_id, user2_id] = sortPair(me, to);

        // existing conversation?
        const { data: existing, error: e1 } = await sb
            .from("conversations")
            .select("id")
            .eq("user1_id", user1_id)
            .eq("user2_id", user2_id)
            .maybeSingle();

        if (e1) return json(500,{error:e1.message});
        if (existing?.id){
            return json(200,{
                ok:true,
                conversation_id: existing.id,
                peer: { id: other.appwrite_user_id, name: other.name || "User", avatar_url: other.avatar_url || "" }
            });
        }

        // create
        const { data: created, error: e2 } = await sb
            .from("conversations")
            .insert({ user1_id, user2_id })
            .select("id")
            .single();

        if (e2) return json(500,{error:e2.message});

        return json(200,{
            ok:true,
            conversation_id: created.id,
            peer: { id: other.appwrite_user_id, name: other.name || "User", avatar_url: other.avatar_url || "" }
        });

    } catch(e){
        const msg = String(e?.message || e);
        const status = msg.toLowerCase().includes("jwt") ? 401 : 500;
        return json(status,{error:msg});
    }
};
