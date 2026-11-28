import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { RoomServiceClient } from "npm:livekit-server-sdk@2.19.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Content-Type": "application/json",
};
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders });
}
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "الطريقة غير مسموحة." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const livekitUrl = Deno.env.get("LIVEKIT_URL") || "";
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY") || "";
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET") || "";
  const keyNames = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") || "";
  let mappedKey = "";
  if (keyNames) {
    try {
      const parsed = JSON.parse(keyNames);
      if (typeof parsed?.default === "string") mappedKey = Deno.env.get(parsed.default) || "";
    } catch (_) {}
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || mappedKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !serviceKey || !anonKey) return json(503, { error: "خدمة إدارة الغرف غير مهيأة على الخادم." });

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "يجب تسجيل الدخول أولاً." });

  let body: { action?: unknown; room_id?: unknown; participant_id?: unknown; reason?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "بيانات الطلب غير صالحة." }); }
  const action = typeof body.action === "string" ? body.action : "";
  const roomId = typeof body.room_id === "string" ? body.room_id : "";
  const participantId = typeof body.participant_id === "string" ? body.participant_id : "";
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  if (!["list", "mute", "unmute", "kick"].includes(action)) return json(400, { error: "نوع الإجراء غير مدعوم." });
  if (!uuid.test(roomId)) return json(400, { error: "معرّف الغرفة غير صالح." });
  if (action !== "list" && !uuid.test(participantId)) return json(400, { error: "معرّف العضو غير صالح." });

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول. سجّلي الدخول مجدداً." });

  const [{ data: isOwner, error: ownerError }, { data: staffRole, error: staffError }] = await Promise.all([
    caller.rpc("is_admin"),
    caller.from("staff_roles").select("permissions,active").eq("user_id", authData.user.id).maybeSingle(),
  ]);
  if (ownerError || staffError) return json(500, { error: "تعذّر التحقق من صلاحيات إدارة الغرف." });
  const allowed = isOwner === true || (staffRole?.active === true && Array.isArray(staffRole.permissions) && staffRole.permissions.includes("room_moderation"));
  if (!allowed) return json(403, { error: "تحتاج هذه العملية إلى صلاحية إدارة الغرف." });

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: room, error: roomError } = await service.from("rooms")
    .select("id,public_id,title,owner_id").eq("id", roomId).maybeSingle();
  if (roomError) return json(500, { error: "تعذّر التحقق من الغرفة." });
  if (!room) return json(404, { error: "الغرفة غير موجودة." });

  if (action === "list") {
    const since = new Date(Date.now() - 180_000).toISOString();
    const { data: memberships, error: membersError } = await service.from("room_members")
      .select("user_id,joined_at,last_seen_at").eq("room_id", roomId).gte("last_seen_at", since)
      .order("joined_at", { ascending: true });
    if (membersError) return json(500, { error: "تعذّر تحميل أعضاء الغرفة." });
    const ids = [...new Set((memberships || []).map((row) => row.user_id))];
    if (!ids.length) return json(200, { success: true, members: [] });
    const [profilesResult, seatsResult, mutesResult] = await Promise.all([
      service.from("profiles").select("id,public_id,display_name,handle,avatar_url").in("id", ids),
      service.from("room_seats").select("user_id,seat_no").eq("room_id", roomId).in("user_id", ids),
      service.from("room_participant_mutes").select("user_id,muted").eq("room_id", roomId).in("user_id", ids),
    ]);
    if (profilesResult.error || seatsResult.error || mutesResult.error) return json(500, { error: "تعذّر تحميل تفاصيل أعضاء الغرفة." });
    const profiles = new Map((profilesResult.data || []).map((row) => [row.id, row]));
    const seats = new Map((seatsResult.data || []).map((row) => [row.user_id, row.seat_no]));
    const mutes = new Map((mutesResult.data || []).map((row) => [row.user_id, row.muted]));
    const members = (memberships || []).map((row) => ({
      user_id: row.user_id,
      joined_at: row.joined_at,
      last_seen_at: row.last_seen_at,
      profile: profiles.get(row.user_id) || null,
      seat_no: seats.get(row.user_id) ?? null,
      muted: mutes.get(row.user_id) === true,
      is_room_owner: row.user_id === room.owner_id,
    }));
    return json(200, { success: true, members });
  }

  if (participantId === authData.user.id) return json(400, { error: "لا يمكنك تنفيذ هذا الإجراء على حسابك." });
  if (participantId === room.owner_id) return json(403, { error: "لا يمكن طرد مضيفة الغرفة أو كتمها من أدوات المسؤولين." });
  const { data: member, error: memberError } = await service.from("room_members")
    .select("user_id").eq("room_id", roomId).eq("user_id", participantId).maybeSingle();
  if (memberError) return json(500, { error: "تعذّر التحقق من عضوية العضو." });
  if (!member) return json(404, { error: "هذا العضو لم يعد داخل الغرفة." });

  const livekitConfigured = !!(livekitUrl && livekitApiKey && livekitApiSecret);
  if (!livekitConfigured) return json(503, { error: "خدمة الصوت LiveKit غير مهيأة." });
  const livekit = new RoomServiceClient(livekitUrl.replace(/^wss:/i, "https:"), livekitApiKey, livekitApiSecret);

  if (action === "mute" || action === "unmute") {
    try {
      const participant = await livekit.getParticipant(roomId, participantId);
      const audioTrack = participant.tracks?.find((track: { type?: number | string }) =>
        track.type === 0 || String(track.type).toUpperCase() === "AUDIO"
      );
      if (!audioTrack?.sid) return json(409, { error: "هذا العضو لا يرسل صوتاً حالياً أو لم يفتح المايك." });
      const muted = action === "mute";
      await livekit.mutePublishedTrack(roomId, participantId, audioTrack.sid, muted);
      if (muted) {
        const { error } = await service.from("room_participant_mutes").upsert(
          { room_id: roomId, user_id: participantId, muted: true, updated_at: new Date().toISOString() },
          { onConflict: "room_id,user_id" },
        );
        if (error) return json(500, { success: true, warning: "تم كتم الصوت، لكن تعذّر حفظ حالة الكتم في قاعدة البيانات." });
      } else {
        const { error } = await service.from("room_participant_mutes").delete().eq("room_id", roomId).eq("user_id", participantId);
        if (error) return json(500, { success: true, warning: "تم إرسال إلغاء الكتم، لكن تعذّر تحديث حالة الكتم في قاعدة البيانات." });
      }
      const { error: auditError } = await service.from("staff_audit_log").insert({
        staff_user_id: authData.user.id, action: muted ? "room_participant_muted" : "room_participant_unmuted",
        target_type: "room_member", target_id: participantId,
        reason: reason || (muted ? "كتم مايك من لوحة إدارة الغرف" : "إلغاء كتم مايك من لوحة إدارة الغرف"),
        metadata: { room_id: roomId, room_public_id: room.public_id, source: "admin-room-moderation" },
      });
      return json(200, { success: true, muted, warning: auditError ? "تم تنفيذ الإجراء، لكن تعذّر حفظ سجل التدقيق." : undefined });
    } catch (error) {
      const detail = String((error as Error)?.message || error);
      if (action === "unmute" && /remote unmute|unmute.*disabled|not allowed/i.test(detail)) {
        return json(409, { error: "إلغاء الكتم عن بُعد غير مفعّل في إعدادات LiveKit. يمكن للعضو تشغيل مايكه بنفسه." });
      }
      return json(502, { error: "تعذّر تغيير حالة المايك: " + detail });
    }
  }

  try {
    const participants = await livekit.listParticipants(roomId);
    if (participants.some((participant) => participant.identity === participantId)) {
      await livekit.removeParticipant(roomId, participantId);
    }
  } catch (error) {
    console.error("LiveKit room moderation kick failed", roomId, error);
    return json(502, { error: "تعذّر فصل العضو عن خادم الصوت؛ لم تُحذف عضويته." });
  }
  const [seatResult, memberResult, muteResult] = await Promise.all([
    service.from("room_seats").delete().eq("room_id", roomId).eq("user_id", participantId),
    service.from("room_members").delete().eq("room_id", roomId).eq("user_id", participantId),
    service.from("room_participant_mutes").delete().eq("room_id", roomId).eq("user_id", participantId),
  ]);
  if (seatResult.error || memberResult.error || muteResult.error) {
    console.error("Room moderation cleanup failed", { seat: seatResult.error, member: memberResult.error, mute: muteResult.error });
    return json(500, { success: true, warning: "تم فصل العضو صوتياً، لكن تعذّر تنظيف كل سجلات الغرفة. حدّثي قائمة الأعضاء." });
  }
  const { error: auditError } = await service.from("staff_audit_log").insert({
    staff_user_id: authData.user.id, action: "room_participant_kicked",
    target_type: "room_member", target_id: participantId,
    reason: reason || "طرد عضو من لوحة إدارة الغرف",
    metadata: { room_id: roomId, room_public_id: room.public_id, source: "admin-room-moderation" },
  });
  return json(200, { success: true, kicked: true, warning: auditError ? "تم طرد العضو، لكن تعذّر حفظ سجل التدقيق." : undefined });
});
