// /feed/interactions.js
import { supabase, getUID } from "../services/supabase.js";

/* =========================
   LIKE
   - post_likes: (post_id uuid, user_id uuid)
========================= */

export async function toggleLike(postId) {
    const uid = await getUID();

    const { data: existing, error: selErr } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", uid)
        .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
        const { error } = await supabase
            .from("post_likes")
            .delete()
            .eq("post_id", postId)
            .eq("user_id", uid);

        if (error) throw error;
        return { liked: false };
    } else {
        const { error } = await supabase
            .from("post_likes")
            .insert({ post_id: postId, user_id: uid });

        if (error) throw error;
        return { liked: true };
    }
}

export async function getLikeCount(postId) {
    const { count, error } = await supabase
        .from("post_likes")
        .select("*", { count: "exact", head: true })
        .eq("post_id", postId);

    if (error) throw error;
    return count || 0;
}

export async function isLikedByMe(postId) {
    const uid = await getUID();
    const { data, error } = await supabase
        .from("post_likes")
        .select("post_id")
        .eq("post_id", postId)
        .eq("user_id", uid)
        .maybeSingle();

    if (error) throw error;
    return !!data;
}

/* =========================
   COMMENT
   - post_comments: (id uuid, post_id uuid, user_id uuid, content text)
========================= */

export async function addComment(postId, text) {
    const uid = await getUID();
    const content = String(text || "").trim();
    if (!content) throw new Error("Comment is empty.");

    const { data, error } = await supabase
        .from("post_comments")
        .insert({ post_id: postId, user_id: uid, content })
        .select("id, post_id, user_id, content, created_at")
        .single();

    if (error) throw error;
    return data;
}

export async function loadComments(postId, limit = 50) {
    const { data, error } = await supabase
        .from("post_comments")
        .select("id, user_id, content, created_at")
        .eq("post_id", postId)
        .order("created_at", { ascending: true })
        .limit(limit);

    if (error) throw error;
    return data || [];
}

export async function deleteMyComment(commentId) {
    const uid = await getUID();
    const { error } = await supabase
        .from("post_comments")
        .delete()
        .eq("id", commentId)
        .eq("user_id", uid);

    if (error) throw error;
    return true;
}

/* =========================
   FOLLOW (Subscribe)
   - follows: (follower_id uuid, following_id uuid)
   targetUserId = profiles.id (UUID)  /  analyses.author_id (UUID)
========================= */

export async function toggleFollow(targetUserId) {
    const uid = await getUID();
    if (!targetUserId) throw new Error("Target user id missing.");
    if (uid === targetUserId) throw new Error("You can't follow yourself.");

    const { data: existing, error: selErr } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", uid)
        .eq("following_id", targetUserId)
        .maybeSingle();

    if (selErr) throw selErr;

    if (existing) {
        const { error } = await supabase
            .from("follows")
            .delete()
            .eq("follower_id", uid)
            .eq("following_id", targetUserId);

        if (error) throw error;
        return { following: false };
    } else {
        const { error } = await supabase
            .from("follows")
            .insert({ follower_id: uid, following_id: targetUserId });

        if (error) throw error;
        return { following: true };
    }
}

export async function isFollowing(targetUserId) {
    const uid = await getUID();
    const { data, error } = await supabase
        .from("follows")
        .select("follower_id")
        .eq("follower_id", uid)
        .eq("following_id", targetUserId)
        .maybeSingle();

    if (error) throw error;
    return !!data;
}

export async function getFollowersCount(targetUserId) {
    const { count, error } = await supabase
        .from("follows")
        .select("*", { count: "exact", head: true })
        .eq("following_id", targetUserId);

    if (error) throw error;
    return count || 0;
}
