import { supabase } from './supabase-auth.js';
const $=s=>document.querySelector(s), notice=$('#notice'), admin=$('#admin');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s,bad=false){notice.textContent=s;notice.style.borderColor=bad?'#a33':'#39734a';}
async function boot(){
 if(!supabase){message('إعداد Supabase غير مكتمل.',true);return;}
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session){message('سجّلي الدخول أولاً من تطبيق HAMSAT، ثم افتحي لوحة الإدارة في المتصفح نفسه.',true);return;}
 const {data:profile,error:e}=await supabase.from('profiles').select('role,display_name').eq('id',session.user.id).single();
 if(e){message('تعذّر التحقق من صلاحية الإدارة. تأكدي من ترحيل صلاحيات لوحة الإدارة.',true);return;}
 const {data:isOwner,error:ownerError}=await supabase.rpc('is_admin');
 if(ownerError||isOwner!==true){message('هذا الحساب لا يملك صلاحية Super Admin الرئيسية. الوصول محمي.',true);return;}
 admin.classList.remove('hidden');message('مرحباً '+(profile.display_name||'بالمديرة')+' — تم التحقق من صلاحية Super Admin.');watchLoginEvents();
 const sections=[
  ['الإحصاءات',loadStats],['المتجر والإطارات والخلفيات',loadItems],['الهدايا',loadGifts],['دخول الأعضاء',loadLogins],
  ['الألعاب',loadGames],['الغرف',loadRooms],['الأعضاء',loadUsers],['قنبلة الغرفة',loadBombLevels],
  ['الوكالات',loadAgencies],['باقات الشحن',loadTopupPackages],['البلاغات',loadReports]
 ];
 await Promise.all(sections.map(async([label,load])=>{
  try{await load();}
  catch(error){
   console.error('HAMSAT admin section failed:',label,error);
   const target=({
    'المتجر والإطارات والخلفيات':'#item-list','الهدايا':'#gift-list','الألعاب':'#game-list',
    'الغرف':'#room-list','الأعضاء':'#user-results','دخول الأعضاء':'#login-events','قنبلة الغرفة':'#bomb-level-list',
    'الوكالات':'#agency-list','باقات الشحن':'#topup-package-list','البلاغات':'#report-list'
   })[label];
   if(target&&$(target))$(target).innerHTML='<p class="text-red-300 text-sm">تعذر تحميل هذا القسم: '+esc(error.message||'خطأ غير معروف')+'</p>';
   message('تعذر تحميل قسم '+label+' فقط: '+(error.message||'خطأ غير معروف'),true);
  }
 }));
}
async function upload(file,folder,stableName=null){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('الصورة يجب أن تكون PNG/JPG/WEBP وأقل من 5MB');
 const {data:{user}}=await supabase.auth.getUser(),ext=file.type.split('/')[1].replace('jpeg','jpg');
 const safeName=stableName?String(stableName).replace(/[^a-zA-Z0-9_-]/g,''):crypto.randomUUID();
 if(!safeName)throw Error('اسم ملف الصورة غير صالح.');
 const path=user.id+'/'+folder+'/'+safeName+'.'+ext;
 const {data,error}=await supabase.storage.from('hamsat-media').upload(path,file,{upsert:true,contentType:file.type});if(error)throw error;
 return supabase.storage.from('hamsat-media').getPublicUrl(data.path).data.publicUrl;
}
function row(title,sub,id,active,kind){return '<div class="item"><div class="min-w-0"><b>'+esc(title)+'</b><p class="muted text-xs">'+esc(sub)+' · '+(active?'منشور':'مخفي')+'</p></div><button class="ghost text-sm" data-toggle="'+esc(id)+'" data-kind="'+kind+'">'+(active?'إخفاء':'نشر')+'</button></div>'}
async function loadStats(){
 const tables=['profiles','rooms','gifts','shop_items'],ids=['stat-users','stat-rooms','stat-gifts','stat-items'];
 const results=await Promise.all(tables.map(async(t,i)=>{
  try{
   const {count,error}=await supabase.from(t).select('id',{count:'exact',head:true});
   if(error)throw error;
   $('#'+ids[i]).textContent=count??0;
   return null;
  }catch(error){
   $('#'+ids[i]).textContent='—';
   console.error('HAMSAT admin statistic failed:',t,error);
   return t;
  }
 }));
 const failed=results.filter(Boolean);
 if(failed.length)throw new Error('تعذر جلب إحصاءات: '+failed.join('، '));
}
async function loadItems(){
 const {data,error}=await supabase.from('shop_items').select('*').order('item_type').order('name');if(error)throw error;
 const mediaItems=data.filter(x=>['room_background','profile_frame'].includes(x.item_type));
 const withImages=mediaItems.filter(x=>!!x.image_url).length;
 const missingImages=mediaItems.length-withImages;
 const summary='<div class="grid grid-cols-3 gap-2 mb-3">'+
  '<div class="stat"><span class="muted text-xs">الخلفيات والإطارات</span><b>'+mediaItems.length+'</b></div>'+
  '<div class="stat"><span class="muted text-xs">صور مرفوعة</span><b>'+withImages+'</b></div>'+
  '<div class="stat"><span class="muted text-xs">بانتظار الرفع</span><b>'+missingImages+'</b></div></div>';
 $('#item-list').innerHTML=summary+(data.length?data.map(x=>{
  const media=['room_background','profile_frame'].includes(x.item_type);
  const preview=x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.name)+'" loading="lazy" class="w-16 h-16 rounded-xl object-cover border border-amber-300/20">':'<div class="w-16 h-16 rounded-xl border border-dashed border-amber-300/30 grid place-items-center text-[10px] text-amber-200/70">'+(media?'بانتظار الصورة':'بدون صورة')+'</div>';
  const publishBlocked=media&&!x.image_url&&!x.active;
   const replaceControl=media?'<div class="flex items-center gap-2 mt-2"><input class="field text-xs" type="file" accept="image/png,image/jpeg,image/webp" data-replace-file="'+esc(x.id)+'"><button class="ghost text-xs" type="button" data-replace-image="'+esc(x.id)+'">استبدال الصورة</button></div>':'';
  return '<div class="item"><div class="flex gap-3 items-center min-w-0">'+preview+'<div class="min-w-0"><b>'+esc(x.name)+'</b><p class="muted text-xs">'+esc(x.id)+' · '+esc(x.item_type)+' · '+Number(x.price).toLocaleString('en-US')+' عملة</p><p class="text-[11px] '+(x.image_url?'text-emerald-300':'text-amber-200')+'">'+(x.image_url?'الصورة مرتبطة':'الصورة لم تُرفع بعد')+' · '+(x.active?'منشور':'مخفي للمراجعة')+'</p>'+replaceControl+'</div></div><button class="ghost text-sm shrink-0" data-toggle="'+esc(x.id)+'" data-kind="item" '+(publishBlocked?'disabled title="ارفعي الصورة وراجعيها قبل النشر"':'')+'>'+(publishBlocked?'ارفع الصورة أولاً':x.active?'إخفاء':'نشر')+'</button></div>';
 }).join(''):'<p class="muted">لا توجد عناصر بعد.</p>');
 bindToggles('#item-list',data,'item');
  $('#item-list').querySelectorAll('[data-replace-image]').forEach(button=>button.onclick=()=>replaceMediaImage(button.dataset.replaceImage,$('[data-replace-file="'+button.dataset.replaceImage+'"]'),button));
}
async function loadGifts(){
 const {data,error}=await supabase.from('gifts').select('*').order('price');if(error)throw error;
 $('#gift-list').innerHTML=data.length?data.map(x=>row(x.icon+' '+x.name,x.id+' · '+x.price+' عملة · '+({app:'التطبيق',event:'الحدث',lucky:'محظوظة',special:'خاصة'}[x.category]||'التطبيق'),x.id,x.active,'gift')).join(''):'<p class="muted">لا توجد هدايا بعد.</p>';
 bindToggles('#gift-list',data,'gift');
}
function bindToggles(root,data,kind){
 const tables={gift:'gifts',item:'shop_items',game:'games'};
 const table=tables[kind];
 if(!table){message('نوع عنصر غير معروف.',true);return;}
 $(root).querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{
  b.disabled=true;
  try{
   const x=data.find(z=>z.id===b.dataset.toggle);
   if(!x)throw new Error('العنصر غير موجود في القائمة الحالية.');
   if(table==='shop_items'&&['room_background','profile_frame'].includes(x.item_type)&&!x.image_url&&!x.active)throw new Error('لا يمكن نشر خلفية أو إطار قبل رفع صورته ومراجعتها.');
   const payload={active:!x.active};
   if(table==='shop_items'||table==='games')payload.updated_at=new Date().toISOString();
   const {error}=await supabase.from(table).update(payload).eq('id',x.id);
   if(error)throw error;
   if(kind==='gift')await Promise.all([loadGifts(),loadStats()]);
   else if(kind==='item')await Promise.all([loadItems(),loadStats()]);
   else await loadGames();
   message('تم تحديث حالة العنصر.');
  }catch(e){message(e.message,true);}
  finally{b.disabled=false;}
 });
}
async function loadGames(){
 const {data,error}=await supabase.from('games').select('id,name,game_type,icon,active,sort_order,created_at').order('sort_order').order('created_at',{ascending:false});if(error)throw error;
 $('#game-list').innerHTML=data.length?data.map(x=>row(x.icon+' '+x.name,x.id+' · '+x.game_type,x.id,x.active,'game')).join(''):'<p class="muted">لا توجد ألعاب مسجلة بعد.</p>';
 bindToggles('#game-list',data,'game');
}
async function loadBombLevels(){
 const {data,error}=await supabase.from('room_bomb_levels').select('*').order('level');
 if(error)throw error;
 $('#bomb-level-list').innerHTML=(data||[]).map(x=>'<div class="item"><div><b>LV.'+esc(x.level)+'</b><p class="muted text-xs">'+esc(x.threshold)+' نقطة · مكافأة '+esc(x.reward_min)+'–'+esc(x.reward_max)+' عملة · '+(x.active?'مفعّل':'متوقف')+'</p></div><button class="ghost text-sm" data-edit-bomb="'+esc(x.level)+'">تعديل</button></div>').join('')||'<p class="muted">لا توجد مستويات مسجلة.</p>';
 $('#bomb-level-list').querySelectorAll('[data-edit-bomb]').forEach(b=>b.onclick=()=>{const x=data.find(z=>String(z.level)===b.dataset.editBomb),form=$('#bomb-level-form');if(!x)return;form.elements.level.value=x.level;form.elements.threshold.value=x.threshold;form.elements.reward_min.value=x.reward_min;form.elements.reward_max.value=x.reward_max;form.elements.active.checked=x.active;});
}
async function loadAgencies(){
 const root=$('#agency-list'),select=$('#agency-select');
 const {data,error}=await supabase.from('agencies').select('*').order('created_at',{ascending:false});
 if(error){root.innerHTML='<p class="muted">تظهر الوكالات بعد تطبيق ترحيل الوكالات.</p>';select.innerHTML='';return;}
 const owners=[...new Set((data||[]).map(x=>x.owner_id))];
 let profiles=[];
 if(owners.length){const r=await supabase.from('profiles').select('id,public_id,display_name').in('id',owners);if(!r.error)profiles=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x]));
 root.innerHTML=(data||[]).map(x=>{const owner=byId[x.owner_id]||{};return '<div class="item"><div><b>'+esc(x.name)+'</b><p class="muted text-xs">'+esc(x.agency_type)+' · '+esc(x.status)+' · المالك #'+esc(owner.public_id||'—')+' · عمولة '+esc(x.commission_percent)+'%</p></div><button class="ghost text-xs" data-agency-toggle="'+esc(x.id)+'" data-status="'+(x.status==='active'?'suspended':'active')+'" data-commission="'+esc(x.commission_percent)+'" data-agent="'+esc(x.agent_commission_percent)+'">'+(x.status==='active'?'إيقاف':'تفعيل')+'</button></div>';}).join('')||'<p class="muted">لا توجد وكالات بعد.</p>';
 select.innerHTML=(data||[]).map(x=>'<option value="'+esc(x.id)+'">'+esc(x.name)+'</option>').join('');
 root.querySelectorAll('[data-agency-toggle]').forEach(b=>b.onclick=async()=>{try{const {error}=await supabase.rpc('admin_update_agency',{p_agency_id:b.dataset.agencyToggle,p_status:b.dataset.status,p_commission_percent:Number(b.dataset.commission),p_agent_commission_percent:Number(b.dataset.agent)});if(error)throw error;await loadAgencies();message('تم تحديث حالة الوكالة.');}catch(e){message(e.message,true);}});
}
async function loadTopupPackages(){
 const root=$('#topup-package-list');
 const {data,error}=await supabase.from('topup_packages').select('*').order('sort_order');
 if(error){root.innerHTML='<p class="muted">تظهر الباقات بعد تطبيق ترحيل الوكالات.</p>';return;}
 root.innerHTML=(data||[]).map(x=>'<div class="item"><div><b>'+esc(x.name)+'</b><p class="muted text-xs">'+esc(x.coins)+' عملة · '+esc(x.price_dzd)+' دج · '+(x.active?'نشطة':'متوقفة')+'</p></div><button class="ghost text-xs" data-package-toggle="'+esc(x.id)+'" data-active="'+(!x.active)+'">تبديل الحالة</button></div>').join('')||'<p class="muted">أضيفي أول باقة شحن.</p>';
 root.querySelectorAll('[data-package-toggle]').forEach(b=>b.onclick=async()=>{const item=(data||[]).find(x=>x.id===b.dataset.packageToggle);if(!item)return;const {error}=await supabase.from('topup_packages').update({active:b.dataset.active==='true'}).eq('id',item.id);if(error){message(error.message,true);return;}await loadTopupPackages();});
}
async function loadReports(){
 const root=$('#report-list');
 const {data,error}=await supabase.from('user_reports').select('*').order('created_at',{ascending:false}).limit(100);
 if(error){root.innerHTML='<p class="muted">تظهر البلاغات بعد تطبيق ترحيل الأمان.</p>';return;}
 const ids=[...new Set((data||[]).flatMap(x=>[x.reporter_id,x.subject_user_id].filter(Boolean)))];
 const roomIds=[...new Set((data||[]).map(x=>x.room_id).filter(Boolean))];
 let profiles=[],rooms=[];
 if(ids.length){const r=await supabase.from('profiles').select('id,public_id,display_name,handle').in('id',ids);if(!r.error)profiles=r.data||[];}
 if(roomIds.length){const r=await supabase.from('rooms').select('id,title').in('id',roomIds);if(!r.error)rooms=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x])),byRoom=Object.fromEntries(rooms.map(x=>[x.id,x]));
 root.innerHTML=(data||[]).map(x=>'<article class="item block"><div class="flex justify-between gap-3"><div><b>بلاغ #'+esc(x.id)+'</b><p class="muted text-xs">'+(x.subject_user_id?'مستخدم #'+esc(byId[x.subject_user_id]?.public_id||'—'):'غرفة '+esc(byRoom[x.room_id]?.title||'—'))+' · المبلّغ #'+esc(byId[x.reporter_id]?.public_id||'—')+'</p></div><span class="pill">'+esc(x.status)+'</span></div><p class="text-sm mt-2">'+esc(x.reason)+'</p><p class="muted text-xs mt-1">'+esc(x.details||'لا توجد تفاصيل إضافية')+'</p><div class="flex gap-2 mt-3"><button class="ghost text-xs" data-report-status="reviewing" data-id="'+esc(x.id)+'">قيد المراجعة</button><button class="ghost text-xs" data-report-status="resolved" data-id="'+esc(x.id)+'">تم الحل</button><button class="ghost text-xs" data-report-status="dismissed" data-id="'+esc(x.id)+'">إغلاق</button></div></article>').join('')||'<p class="muted">لا توجد بلاغات حالياً.</p>';
 root.querySelectorAll('[data-report-status]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.rpc('admin_update_user_report',{p_report_id:Number(b.dataset.id),p_status:b.dataset.reportStatus});if(error){message(error.message,true);return;}await loadReports();message('تم تحديث حالة البلاغ.');});
}

async function loadLogins(){
 const root=$('#login-events');
 const {data,error}=await supabase.rpc('admin_recent_logins',{p_limit:100});
 if(error)throw error;
 const dateText=value=>value?new Date(value).toLocaleString('ar-DZ'):'وقت غير متاح';
 root.innerHTML=(data||[]).length?data.map(x=>'<div class="item"><div class="min-w-0"><b>'+esc(x.display_name||'عضو بدون اسم')+'</b><p class="muted text-xs">HAMSAT-'+esc(String(x.public_id??'').padStart(6,'0'))+' · '+esc(x.handle?'@'+x.handle:'لم يحدد اسم مستخدم')+'</p><p class="muted text-xs mt-1">وقت الدخول: '+esc(dateText(x.signed_in_at))+'</p></div><span class="pill">دخول جديد</span></div>').join(''):'<p class="muted">لا توجد تسجيلات دخول مسجلة بعد تفعيل الإشعارات.</p>';
}

async function loadUsers(term=''){
 const clean=String(term||'').trim().replace(/[,%()]/g,'');
 const data=[];const pageSize=200;
 for(let from=0;;from+=pageSize){
  let q=supabase.from('profiles').select('id,public_id,display_name,handle,role,created_at,is_banned').order('created_at',{ascending:false}).range(from,from+pageSize-1);
  if(clean){
   const numeric=clean.toUpperCase().replace(/^HAMSAT-?/,'').replace(/^#/,'');
   const isId=/^\d+$/.test(numeric);
   q=isId?q.eq('public_id',Number(numeric)):q.or('display_name.ilike.%'+clean+'%,handle.ilike.%'+clean+'%');
  }
  const {data:page,error}=await q;if(error)throw error;data.push(...(page||[]));if(!page||page.length<pageSize)break;
 }
 const out=$('#user-results');
 let activityByUser={};
 if(data.length){
  const activity=await supabase.rpc('admin_user_activity',{p_user_ids:data.map(x=>x.id)});
  if(!activity.error)activityByUser=Object.fromEntries((activity.data||[]).map(x=>[x.user_id,x]));
  else console.warn('HAMSAT admin user activity is unavailable:',activity.error.message);
 }
 const dateText=value=>value?new Date(value).toLocaleString('ar-DZ'):'غير متاح';
 out.innerHTML=data.length?data.map(x=>{
  const activity=activityByUser[x.id]||{};
  const publicId=String(x.public_id??'').padStart(6,'0');
  const name=String(x.display_name||'').trim();
  const handle=String(x.handle||'').trim();
  const registered=activity.account_created_at||x.created_at;
  const lastLogin=activity.last_sign_in_at;
  return '<div class="item"><div class="min-w-0"><b>'+esc(name||'عضو بدون اسم')+'</b><p class="muted text-xs">HAMSAT-'+esc(publicId)+' · '+esc(handle?'@'+handle:'لم يحدد اسم مستخدم')+' · '+esc(x.role||'user')+' · '+(x.is_banned?'محظور':'نشط')+'</p><p class="muted text-xs mt-1">تاريخ التسجيل: '+esc(dateText(registered))+' · آخر دخول: '+esc(dateText(lastLogin))+'</p>'+(name&&handle?'':'<p class="text-amber-200 text-xs mt-1">لم يكمل العضو بيانات الملف الشخصي؛ لا يوجد اسم معلن للتعرّف عليه.</p>')+'</div><div class="flex flex-wrap gap-2"><button type="button" class="ghost text-xs" data-user-details="'+esc(x.id)+'">التفاصيل</button><button class="ghost text-xs" data-moderate-user="'+esc(x.id)+'" data-banned="'+(x.is_banned?'true':'false')+'">'+(x.is_banned?'فك الحظر':'حظر الحساب')+'</button></div></div>';
 }).join(''):'<p class="muted">لا يوجد أعضاء مطابقون.</p>';

 out.querySelectorAll('[data-user-details]').forEach(detailButton=>{
  detailButton.onclick=()=>{
   const x=data.find(item=>item.id===detailButton.dataset.userDetails);
   if(!x)return;
   const activity=activityByUser[x.id]||{};
   const existing=detailButton.closest('.item')?.nextElementSibling;
   if(existing?.dataset.userDetail===x.id){existing.remove();return;}
   const panel=document.createElement('div');panel.className='panel text-sm space-y-2';panel.dataset.userDetail=x.id;
   const publicId=String(x.public_id??'').padStart(6,'0');
   panel.innerHTML='<b class="text-amber-200">تفاصيل العضو · HAMSAT-'+esc(publicId)+'</b>'+
    '<p>الاسم: '+esc(x.display_name||'غير محدد')+'</p>'+
    '<p>اسم المستخدم: '+esc(x.handle?'@'+x.handle:'غير محدد')+'</p>'+
    '<p>نوع الحساب: '+esc(x.role||'user')+'</p>'+
    '<p>الحالة: '+(x.is_banned?'محظور':'نشط')+'</p>'+
    '<p>تاريخ التسجيل: '+esc(dateText(activity.account_created_at||x.created_at))+'</p>'+
    '<p>آخر دخول: '+esc(dateText(activity.last_sign_in_at))+'</p>'+
    '<p class="muted text-xs">لا تُعرض أرقام الهاتف أو البريد الإلكتروني في هذه اللوحة.</p>';
   detailButton.closest('.item')?.after(panel);
  };
 });
 out.querySelectorAll('[data-moderate-user]').forEach(moderateButton=>{
  const kickButton=document.createElement('button');
  kickButton.type='button';kickButton.className='ghost text-xs';kickButton.textContent='إخراج الآن';
  kickButton.onclick=async()=>{
   if(!confirm('هل تريدين إنهاء جلسة هذا العضو وإخراجه من التطبيق الآن؟'))return;
   kickButton.disabled=true;
   try{
    const {data,error}=await supabase.functions.invoke('admin-user-moderate',{body:{user_id:moderateButton.dataset.moderateUser,action:'kick'}});
    if(error)throw error;if(data?.error)throw new Error(data.error);
    message('تم إنهاء جلسة العضو. لم يتم حظره ويمكنه تسجيل الدخول مجدداً.');
    await loadUsers(clean);
   }catch(e){message(e.message||'تعذّر إخراج العضو.',true);kickButton.disabled=false;}
  };
  moderateButton.after(kickButton);
 });

 out.querySelectorAll('[data-moderate-user]').forEach(b=>b.onclick=async()=>{
  const next=b.dataset.banned!=='true';
  if(next&&!confirm('هل تريدين حظر هذا الحساب من HAMSAT؟'))return;
  b.disabled=true;
  try{
   const {data,error}=await supabase.functions.invoke('admin-user-moderate',{body:{user_id:b.dataset.moderateUser,banned:next,reason:next?'إجراء إداري من لوحة HAMSAT':''}});
   if(error)throw error;if(data?.error)throw new Error(data.error);
   message(next?'تم حظر الحساب.':'تم فك الحظر.');
   await Promise.all([loadUsers(clean),loadStats()]);
  }catch(e){message(e.message||'تعذّر تحديث حالة العضو.',true);b.disabled=false;}
 });
}
async function loadRooms(){
 const data=[];for(let from=0;;from+=200){const {data:page,error}=await supabase.from('rooms').select('id,public_id,title,topic,owner_id,created_at').order('created_at',{ascending:false}).range(from,from+199);if(error)throw error;data.push(...(page||[]));if(!page||page.length<200)break;}
 const ids=[...new Set(data.map(x=>x.owner_id))],p=ids.length?await supabase.from('profiles').select('id,display_name,public_id').in('id',ids):{data:[],error:null};if(p.error)throw p.error;
 const byId=Object.fromEntries(p.data.map(x=>[x.id,x]));
 $('#room-list').innerHTML=data.length?data.map(x=>{const owner=byId[x.owner_id]||{};return '<div class="item"><div><b>'+esc(x.title)+'</b><p class="muted text-xs">'+esc('ROOM-'+String(x.public_id).padStart(6,'0'))+' · '+esc(x.topic||'عام')+' · المضيفة: '+esc(owner.display_name||'عضو')+'</p></div><span class="pill">غرفة</span></div>';}).join(''):'<p class="muted">لا توجد غرف.</p>';
}
$('#item-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const id=f.elements.id.value.trim(),item_type=f.elements.item_type.value;const imageFile=f.elements.image.files[0];const imageFolder=item_type==='room_background'?'catalog/room-backgrounds':item_type==='profile_frame'?'catalog/profile-frames':'catalog';const image_url=imageFile?await upload(imageFile,imageFolder,['room_background','profile_frame'].includes(item_type)?id:null):null;const payload={id,name:f.elements.name.value.trim(),item_type,price:Number(f.elements.price.value),duration_days:Number(f.elements.duration_days.value||0),rarity:f.elements.rarity.value,visual_key:f.elements.visual_key.value.trim(),description:f.elements.description.value.trim(),image_url,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('shop_items').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadItems(),loadStats()]);message('تم حفظ العنصر في كتالوج الإدارة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
const ROOM_BACKGROUND_ASSETS=[
 ['free_01_queen_girl','الخلفية المجانية 1'],['free_02_moonlit_terrace','الخلفية المجانية 2'],
 ['free_03_gamer_girl','الخلفية المجانية 3'],['free_04_neon_controller','الخلفية المجانية 4'],
 ['free_05_royal_teddy','الخلفية المجانية 5'],['free_06_ribbon_girl','الخلفية المجانية 6'],
 ['premium_07_gaming_throne','الخلفية المميزة 7'],['premium_08_magic_stars','الخلفية المميزة 8'],
 ['premium_09_royal_kitten','الخلفية المميزة 9'],['premium_10_flower_girl','الخلفية المميزة 10'],
 ['premium_11_fantasy_castle','الخلفية المميزة 11'],['premium_12_cat_headphones','الخلفية المميزة 12']
];
const PROFILE_FRAME_ASSETS=[
 ['profile_ref_01_royal_gold_crown','التاج الذهبي الملكي'],['profile_ref_02_pink_roses_pearls','الورود الوردية واللآلئ'],
 ['profile_ref_03_purple_crystal_queen','الملكة الكريستالية البنفسجية'],['profile_ref_04_neon_gamer_headset','سماعة الألعاب النيون'],
 ['profile_ref_05_pink_hearts_butterflies','القلوب والفراشات الوردية'],['profile_ref_06_emerald_celestial_moon','القمر الزمردي'],
 ['profile_ref_07_ice_blue_snowflakes','رقاقات الثلج الزرقاء'],['profile_ref_08_black_gold_rose','الوردة السوداء والذهبية'],
 ['profile_ref_09_purple_cat_bows','القطة البنفسجية والفيونكات']
];
const selectedAssets={backgrounds:[],frames:[]};
const previewObjectUrls={backgrounds:[],frames:[]};
function clearAssetPreviews(kind){previewObjectUrls[kind].forEach(url=>URL.revokeObjectURL(url));previewObjectUrls[kind]=[];}
function renderAssetPreviews(kind,files,items,targetId){
 const target=$(targetId),list=Array.from(files||[]);clearAssetPreviews(kind);selectedAssets[kind]=list;
 if(!list.length){target.innerHTML='<p class="muted text-xs">لم يتم اختيار صور بعد.</p>';return;}
 target.innerHTML=list.map((file,index)=>{
  const options=items.map(([id,label],i)=>'<option value="'+esc(id)+'" '+(i===index?'selected':'')+'>'+esc(label)+'</option>').join('');
  const preview=URL.createObjectURL(file);previewObjectUrls[kind].push(preview);
  const valid=['image/png','image/jpeg','image/webp'].includes(file.type)&&file.size<=5*1024*1024;
  return '<div class="item !items-start"><div class="min-w-0 w-full"><img src="'+preview+'" alt="معاينة '+(index+1)+'" class="w-full h-36 object-contain rounded-lg bg-black/30"><p class="text-xs mt-2 break-all">'+esc(file.name)+'</p><label class="text-xs muted block mt-2">ربط الصورة بالعنصر<select class="field mt-1" data-asset-kind="'+kind+'" data-asset-index="'+index+'">'+options+'</select></label><p class="text-xs mt-1 '+(valid?'text-emerald-300':'text-red-300')+'">'+(file.size/1024/1024).toFixed(2)+' MB · '+(valid?'الملف صالح':'صيغة غير مقبولة أو الحجم أكبر من 5MB')+'</p></div></div>';
 }).join('');
}
function assetMappings(kind){return Array.from(document.querySelectorAll('[data-asset-kind="'+kind+'"]')).map(select=>({id:select.value,file:selectedAssets[kind][Number(select.dataset.assetIndex)]}));}
function mediaFolder(type){return type==='room_background'?'catalog/room-backgrounds':'catalog/profile-frames';}
async function replaceMediaImage(id,input,button){
 const file=input.files?.[0];if(!file)return;button.disabled=true;
 try{
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('الصورة يجب أن تكون PNG/JPG/WEBP وبحد أقصى 5MB.');
  const {data:item,error}=await supabase.from('shop_items').select('id,item_type').eq('id',id).maybeSingle();if(error)throw error;
  if(!item||!['room_background','profile_frame'].includes(item.item_type))throw Error('عنصر الخلفية أو الإطار غير موجود.');
  const url=await upload(file,mediaFolder(item.item_type),id);
  const {error:updateError}=await supabase.from('shop_items').update({image_url:url,active:false}).eq('id',id);if(updateError)throw updateError;
  await loadItems();message('تم استبدال الصورة. بقي العنصر مخفياً حتى المراجعة.');
 }catch(err){message(err.message||'تعذر استبدال الصورة.',true);}finally{button.disabled=false;input.value='';}
}
$('#room-background-files').onchange=e=>renderAssetPreviews('backgrounds',e.target.files,ROOM_BACKGROUND_ASSETS,'#room-background-preview');
$('#profile-frame-files').onchange=e=>renderAssetPreviews('frames',e.target.files,PROFILE_FRAME_ASSETS,'#profile-frame-preview');
$('#asset-batch-upload').onclick=async()=>{
 const button=$('#asset-batch-upload'),result=$('#asset-batch-result'),backgrounds=selectedAssets.backgrounds,frames=selectedAssets.frames;
 if(backgrounds.length!==12||frames.length!==9){result.textContent='يجب اختيار 12 خلفية و9 إطارات بالضبط قبل الرفع.';message(result.textContent,true);return;}
 const all=[...backgrounds,...frames],invalid=all.find(f=>!['image/png','image/jpeg','image/webp'].includes(f.type)||f.size>5*1024*1024);
 if(invalid){result.textContent='الملف '+invalid.name+' غير صالح. الصيغ المقبولة PNG/JPG/WEBP وبحد أقصى 5MB للصورة.';message(result.textContent,true);return;}
 const bgMap=assetMappings('backgrounds'),frameMap=assetMappings('frames'),mappings=[...bgMap,...frameMap];
 if(bgMap.length!==12||frameMap.length!==9||new Set(bgMap.map(x=>x.id)).size!==12||new Set(frameMap.map(x=>x.id)).size!==9){result.textContent='يوجد عنصر مكرر أو ربط ناقص. اربطي كل صورة بعنصر مختلف.';message(result.textContent,true);return;}
 if(bgMap.some(x=>!ROOM_BACKGROUND_ASSETS.some(y=>y[0]===x.id))||frameMap.some(x=>!PROFILE_FRAME_ASSETS.some(y=>y[0]===x.id))){result.textContent='الربط المحدد غير صحيح.';message(result.textContent,true);return;}
 button.disabled=true;let uploaded=0;const failed=[],status=[];
 try{
  const {data:catalog,error}=await supabase.from('shop_items').select('id,item_type').in('id',mappings.map(x=>x.id));if(error)throw error;
  const byId=new Map((catalog||[]).map(x=>[x.id,x]));
  const mismatch=mappings.find((m,i)=>!byId.has(m.id)||byId.get(m.id).item_type!==(i<12?'room_background':'profile_frame'));
  if(mismatch)throw Error('توقف الرفع قبل البدء: عنصر الكتالوج غير موجود أو نوعه غير مطابق: '+mismatch.id);
  for(let i=0;i<mappings.length;i++){
   const {id,file}=mappings[i],type=i<12?'room_background':'profile_frame';
   try{
    result.textContent='جارٍ رفع '+(i+1)+' من 21: '+file.name;
    const url=await upload(file,mediaFolder(type),id);
    const {error:updateError}=await supabase.from('shop_items').update({image_url:url,active:false}).eq('id',id);if(updateError)throw updateError;
    uploaded++;status.push('✓ '+file.name+' — تم الربط وبقي مخفياً');
   }catch(err){failed.push(file.name+': '+(err.message||'فشل الرفع'));status.push('✕ '+file.name+' — '+(err.message||'فشل الرفع'));}
   result.textContent='تم '+(i+1)+' من 21\n'+status.join('\n');
  }
  await loadItems();
  result.textContent='النتيجة: '+uploaded+' من 21 صورة مرتبطة.\n'+(failed.length?'صور تحتاج إعادة المحاولة:\n'+failed.join('\n'):'كل الصور ارتبطت بنجاح.')+'\nجميع العناصر بقيت مخفية للمراجعة.';
  message(failed.length?'اكتمل الرفع جزئياً: '+uploaded+' من 21. راجعي الصور التي فشلت.':'تم ربط الصور الـ21 بنجاح، وجميع العناصر بقيت مخفية للمراجعة.',!!failed.length);
 }catch(err){result.textContent=err.message||'تعذر بدء الرفع.';message(result.textContent,true);}
 finally{button.disabled=false;}
};
$('#gift-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),price:Number(f.elements.price.value),icon:f.elements.icon.value.trim(),category:f.elements.category.value,description:f.elements.description.value.trim(),image_url:f.elements.image_url.value.trim()||null,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('gifts').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadGifts(),loadStats()]);message('تم حفظ الهدية في الكتالوج.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#bomb-level-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={level:Number(f.elements.level.value),threshold:Number(f.elements.threshold.value),reward_min:Number(f.elements.reward_min.value),reward_max:Number(f.elements.reward_max.value),active:f.elements.active.checked,updated_at:new Date().toISOString()};if(!Number.isInteger(payload.level)||payload.level<1||payload.level>5)throw Error('المستوى يجب أن يكون بين LV.1 وLV.5.');if(!Number.isSafeInteger(payload.threshold)||payload.threshold<=0)throw Error('نقاط الوصول يجب أن تكون عدداً صحيحاً أكبر من صفر.');if(!Number.isSafeInteger(payload.reward_min)||payload.reward_min<0||!Number.isSafeInteger(payload.reward_max)||payload.reward_max<0)throw Error('قيم المكافأة يجب أن تكون أعداداً صحيحة غير سالبة.');if(payload.reward_max<payload.reward_min)throw Error('أعلى مكافأة يجب أن تكون أكبر من أو تساوي أقل مكافأة.');const {error}=await supabase.from('room_bomb_levels').upsert(payload,{onConflict:'level'});if(error)throw error;await loadBombLevels();message('تم حفظ إعدادات مستوى القنبلة.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#agency-create-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const {data,error}=await supabase.rpc('admin_create_agency',{p_name:f.elements.name.value.trim(),p_type:f.elements.agency_type.value,p_owner_public_id:Number(f.elements.owner_public_id.value),p_commission_percent:Number(f.elements.commission_percent.value),p_agent_commission_percent:Number(f.elements.agent_commission_percent.value)});if(error)throw error;f.reset();await loadAgencies();message('تم إنشاء الوكالة: '+data);}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#agency-member-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const {error}=await supabase.rpc('agency_add_member',{p_agency_id:f.elements.agency_id.value,p_member_public_id:Number(f.elements.public_id.value),p_role:f.elements.role.value});if(error)throw error;f.elements.public_id.value='';message('تمت إضافة العضو إلى الوكالة.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#topup-package-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),coins:Number(f.elements.coins.value),price_dzd:Number(f.elements.price_dzd.value),sort_order:Number(f.elements.sort_order.value||0),active:f.elements.active.checked};const {error}=await supabase.from('topup_packages').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await loadTopupPackages();message('تم حفظ باقة الشحن.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#user-search').onsubmit=async e=>{e.preventDefault();try{await loadUsers(e.currentTarget.elements.term.value);}catch(err){$('#user-results').innerHTML='<p class="text-red-300">'+esc(err.message)+'</p>';}};
$('#seed-default-games').onclick=async()=>{
 const button=$('#seed-default-games');button.disabled=true;
 const templates=[
  {id:'hamsat_general_quiz',name:'معلومات عامة',game_type:'trivia',icon:'🧠',description:'أسئلة ثقافية خفيفة ومتنوعة — جولة فردية تجريبية.',sort_order:10,config:{mode:'solo_preview',questions:[
   {question:'ما عاصمة الجزائر؟',options:['وهران','الجزائر','قسنطينة','عنابة'],answer:1,explanation:'مدينة الجزائر هي عاصمة البلاد.'},
   {question:'كم عدد ألوان قوس قزح التقليدية؟',options:['5','6','7','8'],answer:2,explanation:'تُقسم ألوانه تقليدياً إلى سبعة.'},
   {question:'ما الكوكب المعروف بالكوكب الأحمر؟',options:['الزهرة','المريخ','زحل','عطارد'],answer:1,explanation:'يبدو المريخ أحمر بسبب أكاسيد الحديد.'},
   {question:'ما أكبر محيط على الأرض؟',options:['الأطلسي','الهندي','الهادئ','المتجمد'],answer:2,explanation:'المحيط الهادئ هو الأكبر.'}
  ]}},
  {id:'hamsat_riddles',name:'ألغاز وذكاء',game_type:'guess',icon:'🧩',description:'ألغاز قصيرة لتنشيط التفكير — جولة فردية تجريبية.',sort_order:20,config:{mode:'solo_preview',questions:[
   {question:'شيء كلما أخذت منه كبر، ما هو؟',options:['الحفرة','العمر','الظل','البحر'],answer:0,explanation:'الحفرة تكبر كلما أخذت من ترابها.'},
   {question:'له أسنان ولا يعض، ما هو؟',options:['الأسد','المشط','المفتاح','المنشار'],answer:1,explanation:'المشط له أسنان.'},
   {question:'ما الشيء الذي يكتب ولا يقرأ؟',options:['القلم','الكتاب','الطالب','الحاسوب'],answer:0,explanation:'القلم يكتب ولا يقرأ.'},
   {question:'ما الشيء الذي يسمع بلا أذن ويتكلم بلا لسان؟',options:['الراديو','الصدى','الهاتف','الكتاب'],answer:2,explanation:'الهاتف ينقل الصوت.'}
  ]}},
  {id:'hamsat_words',name:'تحدي الكلمات',game_type:'challenge',icon:'🔤',description:'اختاري الإجابة الصحيحة في تحدي الكلمات — جولة فردية تجريبية.',sort_order:30,config:{mode:'solo_preview',questions:[
   {question:'ما جمع كلمة «قلم»؟',options:['أقلام','قلمات','قلمون','قواليم'],answer:0,explanation:'جمع قلم هو أقلام.'},
   {question:'أي كلمة تبدأ بحرف الضاد؟',options:['صباح','ضوء','ظلال','طريق'],answer:1,explanation:'ضوء تبدأ بحرف الضاد.'},
   {question:'ما مرادف كلمة «سعيد»؟',options:['حزين','فرح','غاضب','متعب'],answer:1,explanation:'فرح من مرادفات سعيد.'},
   {question:'أي كلمة هي اسم حيوان؟',options:['نافذة','غيمة','غزال','مصباح'],answer:2,explanation:'الغزال حيوان.'}
  ]}}
 ];
 try{
  const ids=templates.map(x=>x.id);
  const {data:existing,error:lookupError}=await supabase.from('games').select('id').in('id',ids);if(lookupError)throw lookupError;
  const found=new Set((existing||[]).map(x=>x.id)),missing=templates.filter(x=>!found.has(x.id));
  if(!missing.length){message('الألعاب الجاهزة موجودة مسبقاً؛ لم نكررها.');return;}
  const {error}=await supabase.from('games').insert(missing);if(error)throw error;
  await loadGames();message('تمت إضافة '+missing.length+' ألعاب جاهزة ونشرها. هذه جولات فردية بلا مكافآت مالية.');
 }catch(err){message(err.message||'تعذر إضافة الألعاب الجاهزة.',true);}
 finally{button.disabled=false;}
};
$('#game-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{let config;try{config=JSON.parse(f.elements.config.value||'{}');}catch{throw Error('إعدادات JSON غير صحيحة');}const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),game_type:f.elements.game_type.value,icon:f.elements.icon.value||'🎮',description:f.elements.description.value.trim(),config,active:f.elements.active.checked};const {error}=await supabase.from('games').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();f.elements.config.value='{}';await loadGames();message('تم حفظ اللعبة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===b.dataset.tab));['catalog','gifts','users','logins','rooms','games','bomb','agencies','reports'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==b.dataset.tab));$('#admin-menu')?.classList.add('hidden');});
$('#admin-menu-toggle').onclick=()=>$('#admin-menu').classList.toggle('hidden');
let loginChannel=null;
function watchLoginEvents(){if(loginChannel)return;loginChannel=supabase.channel('hamsat-admin-login-events').on('postgres_changes',{event:'INSERT',schema:'public',table:'admin_login_events'},async payload=>{message('دخول عضو جديد إلى همسات · '+new Date(payload.new?.signed_in_at||Date.now()).toLocaleString('ar-DZ'));try{await loadLogins();await loadStats();}catch(e){console.warn('تعذّر تحديث إشعارات الدخول',e);}}).subscribe();}

$('#refresh-rooms').onclick=()=>loadRooms().catch(e=>message(e.message,true));
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>message(e.message,true));