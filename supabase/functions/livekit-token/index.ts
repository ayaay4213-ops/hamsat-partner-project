import { createClient } from "npm:@supabase/supabase-js@2.95.0";
import { AccessToken } from "npm:livekit-server-sdk@2.19.2";

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
  const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY");

  if (!livekitUrl || !livekitApiKey || !livekitApiSecret || !supabaseUrl || !supabaseAnonKey) {
    return json(503, { error: "خدمة الصوت غير مهيأة بعد على الخادم." });
  }

  const authorization = req.headers.get("Authorization") || "";
  const accessToken = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!accessToken) return json(401, { error: "يجب تسجيل الدخول أولاً." });

  let body: { room_id?: unknown };
  try {
    body = await req.json();
  } catch {
    return json(400, { error: "بيانات الطلب غير صالحة." });
  }

  const roomId = typeof body.room_id === "string" ? body.room_id : "";
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(roomId)) {
    return json(400, { error: "معرّف الغرفة غير صالح." });
  }

  // All database reads use the caller's JWT, so existing RLS policies remain active.
  const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${accessToken}` } },
  });

  const { data: authData, error: authError } = await supabase.auth.getUser(accessToken);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول. سجّلي الدخول مجدداً." });
  const user = authData.user;

  const { data: membership, error: membershipError } = await supabase
    .from("room_members")
    .select("user_id")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (membershipError) return json(500, { error: "تعذّر التحقق من عضوية الغرفة." });
  if (!membership) return json(403, { error: "يجب الانضمام إلى الغرفة قبل الاتصال الصوتي." });

  const { data: seat, error: seatError } = await supabase
    .from("room_seats")
    .select("seat_no")
    .eq("room_id", roomId)
    .eq("user_id", user.id)
    .maybeSingle();

  if (seatError) return json(500, { error: "تعذّر التحقق من مقعد المايك." });

  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();

  const participantName = String(profile?.display_name || "عضو همسات").slice(0, 64);
  const token = new AccessToken(livekitApiKey, livekitApiSecret, {
    identity: user.id,
    name: participantName,
    ttl: "15m",
  });

  token.addGrant({
    roomJoin: true,
    room: roomId,
    canSubscribe: true,
    canPublish: Boolean(seat),
    canPublishData: true,
  });

  return json(200, {
    url: livekitUrl,
    token: await token.toJwt(),
    can_publish: Boolean(seat),
  });
});
