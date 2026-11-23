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
  if (req.method !== "POST") return json(405, { error: "الطريقة غير مسموحة" });

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const publishableKeyNames = Deno.env.get("SUPABASE_PUBLISHABLE_KEYS");
  let mappedPublishableKey = "";
  if (publishableKeyNames) {
    try {
      const names = JSON.parse(publishableKeyNames);
      if (typeof names?.default === "string") mappedPublishableKey = Deno.env.get(names.default) || "";
    } catch (_) {}
  }
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || mappedPublishableKey || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!supabaseUrl || !serviceRoleKey || !livekitUrl || !livekitApiKey || !livekitApiSecret || !anonKey) {
    return json(503, { error: "خدمة الطرد من الغرفة غير مهيأة على الخادم." });
  }

  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json(401, { error: "يجب تسجيل الدخول أولاً." });

  let body: { room_id?: unknown; participant_id?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "بيانات الطلب غير صالحة." }); }
  const roomId = typeof body.room_id === "string" ? body.room_id : "";
  const participantId = typeof body.participant_id === "string" ? body.participant_id : "";
  if (!uuid.test(roomId) || !uuid.test(participantId)) return json(400, { error: "معرّف الغرفة أو العضو غير صالح." });

  const callerClient = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + accessToken } },
  });
  const { data: authData, error: authError } = await callerClient.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول. سجّلي الدخول مجدداً." });

  const admin = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data: callerProfile, error: callerProfileError } = await admin
    .from("profiles").select("is_banned").eq("id", authData.user.id).maybeSingle();
  if (callerProfileError || !callerProfile || callerProfile.is_banned === true) {
    return json(403, { error: "الحساب غير مخوّل بإدارة الغرفة." });
  }
  if (authData.user.id === participantId) return json(400, { error: "لا يمكنك طرد نفسك من أدوات إدارة الأعضاء." });

  const { data: room, error: roomError } = await callerClient.from("rooms")
    .select("owner_id").eq("id", roomId).maybeSingle();
  if (roomError) return json(500, { error: "تعذّر التحقق من الغرفة." });
  if (!room || room.owner_id !== authData.user.id) return json(403, { error: "طرد الأعضاء متاح لمضيفة الغرفة فقط." });

  const { data: member, error: memberError } = await callerClient.from("room_members")
    .select("user_id").eq("room_id", roomId).eq("user_id", participantId).maybeSingle();
  if (memberError) return json(500, { error: "تعذّر التحقق من العضو." });
  if (!member) return json(404, { error: "هذا العضو لم يعد داخل الغرفة." });

  try {
    const livekitHost = livekitUrl.replace(/^wss:/i, "https:");
    const service = new RoomServiceClient(livekitHost, livekitApiKey, livekitApiSecret);
    const participants = await service.listParticipants(roomId);
    if (participants.some((participant) => participant.identity === participantId)) {
      await service.removeParticipant(roomId, participantId);
    }
  } catch (error) {
    console.error("LiveKit kick failed", error);
    return json(502, { error: "تعذّر فصل العضو عن خادم الصوت. لم تُحذف عضويته؛ حاولي مجدداً." });
  }

  const { error: seatsError } = await admin.from("room_seats").delete()
    .eq("room_id", roomId).eq("user_id", participantId);
  if (seatsError) {
    console.error("Could not release kicked member seat", seatsError);
    return json(500, { error: "تم فصل العضو صوتياً، لكن تعذّر تحرير مقعده. حدّثي الغرفة." });
  }
  const { error: membershipError } = await admin.from("room_members").delete()
    .eq("room_id", roomId).eq("user_id", participantId);
  if (membershipError) {
    console.error("Could not remove kicked room membership", membershipError);
    return json(500, { error: "تم فصل العضو صوتياً، لكن تعذّر إنهاء عضويته. حدّثي الغرفة." });
  }
  const { error: muteError } = await admin.from("room_participant_mutes").delete()
    .eq("room_id", roomId).eq("user_id", participantId);
  if (muteError) {
    console.error("Could not clear kicked member mute state", muteError);
    return json(500, { error: "تم إخراج العضو من الغرفة، لكن تعذّر تنظيف حالة الكتم. حدّثي الغرفة." });
  }
  return json(200, { success: true, participant_id: participantId, removed_from_audio: true, removed_from_room: true });
});
