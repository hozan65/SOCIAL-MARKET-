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

        const body = JSON.parse(event.body || "{}");
        if (!body.conversation_id || !body.body)
            return json(400,{ error:"Missing data" });

        const { data } = await supabase
            .from("messages")
            .insert({
                conversation_id: body.conversation_id,
                sender_id: me,
                body: body.body
            })
            .select()
            .single();

        return json(200,{ ok:true, message:data });
    } catch (e) {
        return json(401,{ error:String(e.message||e) });
    }
};
