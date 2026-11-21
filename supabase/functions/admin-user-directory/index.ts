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
  if (!supabaseUrl || !serviceKey || !anonKey) return json(503, { error: "خدمة دليل الأعضاء غير مهيأة على الخادم." });

  const authorization = req.headers.get("Authorization") || "";
  const token = authorization.startsWith("Bearer ") ? authorization.slice(7) : "";
  if (!token) return json(401, { error: "سجّلي الدخول أولاً." });

  let body: { search?: unknown; offset?: unknown; limit?: unknown };
  try { body = await req.json(); } catch { return json(400, { error: "بيانات البحث غير صالحة." }); }

  const search = typeof body.search === "string" ? body.search.trim().slice(0, 100) : "";
  const offset = Number.isSafeInteger(body.offset) && Number(body.offset) >= 0 ? Number(body.offset) : 0;
  const limit = Number.isSafeInteger(body.limit) ? Math.min(200, Math.max(1, Number(body.limit))) : 200;

  const caller = createClient(supabaseUrl, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: "Bearer " + token } },
  });
  const { data: authData, error: authError } = await caller.auth.getUser(token);
  if (authError || !authData.user) return json(401, { error: "انتهت جلسة الدخول." });

  const { data: isAdmin, error: adminError } = await caller.rpc("is_admin");
  if (adminError || isAdmin !== true) return json(403, { error: "هذه البيانات متاحة للمديرة الرئيسية فقط." });

  const service = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  let query = service.from("profiles")
    .select("id,public_id,display_name,handle,role,created_at,is_banned")
    .order("created_at", { ascending: false });

  if (search) {
    const normalized = search.toUpperCase().replace(/^HAMSAT[\s-]*/, "").replace(/^#/, "").replace(/\s/g, "");
    if (/^\d+$/.test(normalized)) {
      const publicId = Number(normalized);
      if (!Number.isSafeInteger(publicId)) return json(400, { error: "رقم العضو خارج النطاق الصحيح." });
      query = query.eq("public_id", publicId);
    } else {
      const safeText = search.replace(/^@/, "").replace(/[,%()"'\\\\]/g, "").trim();
      if (!safeText) return json(400, { error: "اكتبي الاسم أو المعرّف للبحث." });
      query = query.or("display_name.ilike.%" + safeText + "%,handle.ilike.%" + safeText + "%");
    }
  }

  const { data: users, error } = await query.range(offset, offset + limit - 1);
  if (error) return json(500, { error: "تعذّر تحميل دليل الأعضاء: " + error.message });

  return json(200, {
    users: users || [],
    offset,
    limit,
    hasMore: (users || []).length === limit,
  });
});
