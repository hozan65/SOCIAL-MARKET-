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

        const conversation_id = event.queryStringParameters?.conversation_id;
        if (!conversation_id) return json(400,{ error:"Missing conversation_id" });

        const { data } = await supabase
            .from("messages")
            .select("id,conversation_id,sender_id,body,created_at")
            .eq("conversation_id", conversation_id)
            .order("created_at",{ ascending:true });

        return json(200,{ ok:true, list:data||[] });
    } catch (e) {
        return json(401,{ error:String(e.message||e) });
    }
};
