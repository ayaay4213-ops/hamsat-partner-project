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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "الطريقة غير مسموحة" });

  const livekitUrl = Deno.env.get("LIVEKIT_URL");
  const livekitApiKey = Deno.env.get("LIVEKIT_API_KEY");
  const livekitApiSecret = Deno.env.get("LIVEKIT_API_SECRET");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  if (!livekitUrl || !livekitApiKey || !livekitApiSecret || !supabaseUrl || !anonKey) {
    return json(503, { error: "خدمة إدارة الصوت غير مهيأة على الخادم." });
  }

  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json(401, { error: "يجب تسجيل الدخول أولاً." });

  let body: { room_id?: unknown; participant_id?: unknown; muted?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "بيانات الطلب غير صالحة." }); }
  const roomId = typeof body.room_id === "string" ? body.room_id : "";
  const participantId = typeof body.participant_id === "string" ? body.participant_id : "";
  const muted = body.muted === true;
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(roomId) || !uuid.test(participantId)) return json(400, { error: "معرّف الغرفة أو العضو غير صالح." });

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });
  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول. سجّلي الدخول مجدداً." });
  if (authData.user.id === participantId) return json(400, { error: "لا يمكنك كتم حسابك من أدوات إدارة الآخرين." });

  const { data: room, error: roomError } = await supabase.from("rooms").select("owner_id").eq("id", roomId).maybeSingle();
  if (roomError) return json(500, { error: "تعذّر التحقق من الغرفة." });
  if (!room || room.owner_id !== authData.user.id) return json(403, { error: "كتم مايكات الأعضاء متاح لمضيف الغرفة فقط." });

  const { data: member, error: memberError } = await supabase.from("room_members").select("user_id").eq("room_id", roomId).eq("user_id", participantId).maybeSingle();
  if (memberError) return json(500, { error: "تعذّر التحقق من العضو." });
  if (!member) return json(404, { error: "هذا العضو لم يعد داخل الغرفة." });

  try {
    const host = livekitUrl.replace(/^wss:/i, "https:");
    const service = new RoomServiceClient(host, livekitApiKey, livekitApiSecret);
    const participant = await service.getParticipant(roomId, participantId);
    const audioTrack = participant.tracks?.find((track: { type?: number | string }) =>
      track.type === 0 || String(track.type).toUpperCase() === "AUDIO"
    );
    if (!audioTrack?.sid) return json(409, { error: "هذا العضو لا يرسل صوتاً حالياً أو لم يفتح المايك." });
    await service.mutePublishedTrack(roomId, participantId, audioTrack.sid, muted);
    return json(200, { success: true, muted, participant_id: participantId });
  } catch (error) {
    const detail = String((error as Error)?.message || error);
    if (!muted && /remote unmute|unmute.*disabled|not allowed/i.test(detail)) {
      return json(409, { error: "إلغاء الكتم عن بُعد غير مفعّل في إعدادات LiveKit. يمكن للعضو تشغيل مايكه بنفسه." });
    }
    return json(502, { error: "تعذّر تغيير مايك العضو: " + detail });
  }
});
