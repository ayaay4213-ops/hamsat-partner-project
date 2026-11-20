import { supabase } from './supabase-auth.js';
const $ = s => document.querySelector(s);
const labels = {
 room_moderation:'إشراف الغرف',
 report_review:'مراجعة البلاغات',
 member_support:'مساعدة الأعضاء',
 event_management:'إدارة الفعاليات'
};
function notice(message,error=false){const el=$('#notice');el.textContent=message;el.className='panel status '+(error?'error':'ok');}
function esc(value){return String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));}
function date(value){return new Date(value).toLocaleString('ar-DZ',{dateStyle:'medium',timeStyle:'short'});}
async function loadAudit(){
 const {data,error}=await supabase.from('staff_audit_log').select('action,target_type,target_id,reason,metadata,created_at').eq('staff_user_id',(await supabase.auth.getUser()).data.user.id).order('created_at',{ascending:false}).limit(30);
 if(error)throw error;
 $('#audit').innerHTML=data.length?data.map(x=>'<div class="item"><b>'+esc(x.action)+'</b><p class="muted text-xs">'+esc(x.target_type)+' '+esc(x.target_id||'')+' · '+date(x.created_at)+'</p>'+(x.reason?'<p class="text-sm mt-1">'+esc(x.reason)+'</p>':'')+'</div>').join(''):'<p class="muted text-sm">لا توجد إجراءات مسجلة بعد.</p>';
}
async function loadReports(){
 const root=$('#reports');
 root.innerHTML='<p class="muted text-sm">جارٍ تحميل البلاغات...</p>';
 const {data,error}=await supabase.from('user_reports').select('id,reporter_id,subject_user_id,room_id,reason,details,status,created_at').order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 const ids=[...new Set((data||[]).flatMap(x=>[x.reporter_id,x.subject_user_id].filter(Boolean)))];
 let profiles=[];
 if(ids.length){const result=await supabase.from('profiles').select('id,public_id,display_name').in('id',ids);if(result.error)throw result.error;profiles=result.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x]));
 root.innerHTML=data.length?data.map(x=>{
  const target=x.subject_user_id?('عضو #'+(byId[x.subject_user_id]?.public_id||'—')+' '+(byId[x.subject_user_id]?.display_name||'')):('غرفة '+x.room_id);
  return '<article class="item"><div class="flex flex-wrap justify-between gap-2"><b>بلاغ #'+esc(x.id)+'</b><span class="pill">'+esc(x.status)+'</span></div><p class="text-sm mt-2">'+esc(target)+'</p><p class="muted text-xs">المبلّغ: '+esc(byId[x.reporter_id]?.display_name||'عضو')+' · '+date(x.created_at)+'</p><p class="mt-2">'+esc(x.reason)+'</p><p class="muted text-sm mt-1">'+esc(x.details||'لا توجد تفاصيل إضافية')+'</p><div class="flex flex-wrap gap-2 mt-3">'+['reviewing','resolved','dismissed'].map(status=>'<button class="ghost" data-report="'+esc(x.id)+'" data-status="'+status+'">'+({reviewing:'قيد المراجعة',resolved:'تم الحل',dismissed:'إغلاق البلاغ'}[status])+'</button>').join('')+'</div></article>';
 }).join(''):'<p class="muted text-sm">لا توجد بلاغات حالياً.</p>';
 root.querySelectorAll('[data-report]').forEach(button=>button.onclick=async()=>{
  button.disabled=true;
  try{
   const reason=button.dataset.status==='dismissed'?'تم إغلاق البلاغ بعد المراجعة':button.dataset.status==='resolved'?'تمت معالجة البلاغ':'بدأت مراجعة البلاغ';
   const {data,error}=await supabase.rpc('staff_update_user_report',{p_report_id:Number(button.dataset.report),p_status:button.dataset.status,p_reason:reason});
   if(error)throw error;
   if(data!==true)throw new Error('لم يتم العثور على البلاغ.');
   notice('تم تحديث البلاغ وتسجيل الإجراء.');
   await Promise.all([loadReports(),loadAudit()]);
  }catch(error){notice(error.message||'تعذر تحديث البلاغ.',true);button.disabled=false;}
 });
}
async function boot(){
 if(!supabase){notice('إعداد Supabase غير مكتمل.',true);return;}
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session){notice('سجّلي الدخول إلى همسات أولاً، ثم افتحي مساحة المسؤول.',true);return;}
 const {data:role,error:roleError}=await supabase.from('staff_roles').select('permissions,active').eq('user_id',session.user.id).maybeSingle();
 if(roleError){notice('لم يتم تفعيل قاعدة صلاحيات المسؤولين بعد. يلزم تطبيق ترحيل قاعدة البيانات 0062 في بيئة الاختبار.',true);return;}
 if(!role?.active||!role.permissions?.length){notice('هذا الحساب لا يملك صلاحيات مسؤول نشطة.',true);return;}
 $('#staff').classList.remove('hidden');
 $('#permissions').innerHTML=role.permissions.map(key=>'<span class="pill">'+esc(labels[key]||key)+'</span>').join('');
 $('#reports-panel').classList.toggle('hidden',!role.permissions.includes('report_review'));
 $('#room-note').classList.toggle('hidden',!role.permissions.includes('room_moderation'));
 $('#support-note').classList.toggle('hidden',!role.permissions.includes('member_support'));
 $('#events-note').classList.toggle('hidden',!role.permissions.includes('event_management'));
 notice('تم التحقق من صلاحيات حسابك. تظهر لك الأقسام المصرح بها فقط.');
 if(role.permissions.includes('report_review'))await loadReports();
 await loadAudit();
}
$('#refresh-reports').onclick=()=>loadReports().catch(e=>notice(e.message,true));
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>notice(e.message||'تعذر فتح مساحة المسؤول.',true));
