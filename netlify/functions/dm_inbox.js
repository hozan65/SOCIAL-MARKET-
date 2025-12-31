import { createClient } from "@supabase/supabase-js";
import { getAppwriteUser } from "./_appwrite_user.js";

const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_ROLE_KEY
);

const json = (s,b)=>({statusCode:s,headers:{ "Content-Type":"application/json"},body:JSON.stringify(b)});

export const handler = async (event) => {
    try {
        const { user } = await getAppwriteUser(event);
        const me = user.$id;

        const { data: convs } = await supabase
            .from("conversations")
            .select("id,user1_id,user2_id,updated_at")
            .or(`user1_id.eq.${me},user2_id.eq.${me}`)
            .order("updated_at", { ascending:false });

        if (!convs?.length) return json(200,{ ok:true, list:[] });

        const otherIds = convs.map(c => c.user1_id === me ? c.user2_id : c.user1_id);

        const { data: profs } = await supabase
            .from("profiles")
            .select("appwrite_user_id,name,avatar_url")
            .in("appwrite_user_id", otherIds);

        const pmap = new Map((profs||[]).map(p=>[p.appwrite_user_id,p]));

        const list = convs.map(c=>{
            const otherId = c.user1_id === me ? c.user2_id : c.user1_id;
            const p = pmap.get(otherId)||{};
            return {
                conversation_id: c.id,
                other_id: otherId,
                other_name: p.name || "User",
                other_avatar_url: p.avatar_url || "",
                last_body: ""
            };
        });

        return json(200,{ ok:true, list });
    } catch (e) {
        return json(401,{ error:String(e.message||e) });
    }
};
