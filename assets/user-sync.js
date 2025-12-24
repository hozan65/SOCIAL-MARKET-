// /assets/user-sync.js
import { supabase } from "/services/supabase.js";
import { account } from "/assets/appwrite.js";

export async function syncUserToSupabase() {
    try {
        const user = await account.get();

        const { data, error } = await supabase
            .from("users")
            .select("id")
            .eq("appwrite_user_id", user.$id)
            .single();

        if (data) return; // zaten var

        await supabase.from("users").insert({
            appwrite_user_id: user.$id,
            email: user.email,
            name: user.name
        });

    } catch (err) {
        console.warn("User sync skipped:", err.message);
    }
}
