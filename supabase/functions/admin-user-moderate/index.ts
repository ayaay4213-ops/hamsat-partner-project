import { createClient } from "npm:@supabase/supabase-js@2.95.0";

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
  if (req.method !== "POST") return json(405, { error: "الطريقة غير مسموحة." });

  const supabaseUrl = Deno.env.get("SUPABASE_URL") || "";
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") || "";
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") || Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || "";
  if (!supabaseUrl || !serviceKey || !anonKey) return json(503, { error: "خدمة إدارة الحسابات غير مهيأة على الخادم." });

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "سجّلي الدخول أولاً." });

  let body: { user_id?: unknown; banned?: unknown; reason?: unknown; action?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "بيانات الطلب غير صالحة." }); }
  const userId = typeof body.user_id === "string" ? body.user_id : "";
  const banned = body.banned === true;
  const action = body.action === 'kick' ? 'kick' : 'moderate';
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 300) : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (!uuid.test(userId)) return json(400, { error: "معرّف العضو غير صالح." });

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول." });
  const { data: isAdmin, error: adminError } = await caller.rpc("is_admin");
  if (adminError || isAdmin !== true) return json(403, { error: "هذه العملية متاحة للمديرة الرئيسية فقط." });
  if (authData.user.id === userId) return json(400, { error: "لا يمكنك حظر حسابك." });

  const service = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: target, error: targetError } = await service.from("profiles").select("id,role").eq("id", userId).maybeSingle();
  if (targetError) return json(500, { error: "تعذّر العثور على الحساب." });
  if (!target) return json(404, { error: "الحساب غير موجود." });
  if (target.role === "admin") return json(403, { error: "لا يمكن حظر حساب إداري." });

  if (action === "kick") {
    const { error: kickError } = await service.auth.admin.signOut(userId, "global");
    if (kickError) return json(502, { error: "تعذّر إنهاء جلسة العضو: " + kickError.message });
    const { error: auditError } = await service.from("staff_audit_log").insert({
      staff_user_id: authData.user.id,
      action: "user_session_kicked",
      target_type: "user",
      target_id: userId,
      reason: reason || "إنهاء جلسة العضو من لوحة الإدارة",
      metadata: { source: "admin-user-moderate" },
    });
    if (auditError) return json(500, { error: "تم إنهاء الجلسة لكن تعذّر حفظ سجل التدقيق: " + auditError.message });
    return json(200, { success: true, user_id: userId, kicked: true });
  }

  const { error: authBanError } = await service.auth.admin.updateUserById(userId, {
    ban_duration: banned ? "876000h" : "none",
  });
  if (authBanError) return json(502, { error: "تعذّر تحديث حالة تسجيل الدخول: " + authBanError.message });
  if (banned) {
    const { error: revokeError } = await service.auth.admin.signOut(userId, "global");
    if (revokeError) return json(502, { error: "تم تحديث الحظر لكن تعذّر إنهاء الجلسات الحالية: " + revokeError.message });
  }

  const { error: profileError } = await service.from("profiles").update({
    is_banned: banned,
    banned_at: banned ? new Date().toISOString() : null,
    ban_reason: banned ? (reason || "مخالفة إرشادات المجتمع") : null,
  }).eq("id", userId);
  if (profileError) return json(502, { error: "تم تحديث تسجيل الدخول لكن تعذّر تحديث سجل العضو: " + profileError.message });

  const { error: auditError } = await service.from("staff_audit_log").insert({
    staff_user_id: authData.user.id,
    action: banned ? "user_banned" : "user_unbanned",
    target_type: "user",
    target_id: userId,
    reason: banned ? (reason || "مخالفة إرشادات المجتمع") : (reason || "رفع الحظر من لوحة الإدارة"),
    metadata: { banned, auth_sessions_revoked: banned, source: "admin-user-moderate" },
  });
  if (auditError) return json(500, { error: "تم تحديث حالة الحساب لكن تعذّر حفظ سجل التدقيق: " + auditError.message });

  return json(200, { success: true, user_id: userId, banned });
});
