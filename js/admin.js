import { supabase } from './supabase-auth.js';
const $=s=>document.querySelector(s), notice=$('#notice'), admin=$('#admin');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s,bad=false){notice.textContent=s;notice.style.borderColor=bad?'#a33':'#39734a';}
const withTimeout=(promise,label,ms=15000)=>Promise.race([
 promise,
 new Promise((_,reject)=>setTimeout(()=>reject(new Error('انتهت مهلة '+label+' بعد '+Math.round(ms/1000)+' ثانية.')),ms))
]);
async function boot(){
 try{
  if(!supabase){message('إعداد Supabase غير مكتمل.',true);return;}
  message('الخطوة 1/3: استرجاع جلسة الدخول…');
  const {data:{session},error}=await withTimeout(supabase.auth.getSession(),'استرجاع جلسة الدخول');
  if(error)throw error;
  if(!session){message('لم نعثر على جلسة دخول في رابط المعاينة. سجّلي الدخول من نسخة المعاينة أولاً ثم أعيدي فتح اللوحة.',true);return;}
  message('الخطوة 2/3: التحقق من ملف الحساب…');
  const {data:profile,error:e}=await withTimeout(
   supabase.from('profiles').select('role,display_name').eq('id',session.user.id).single(),
   'قراءة ملف الحساب'
  );
  if(e)throw e;
  message('الخطوة 3/3: التحقق من صلاحيات الإدارة…');
  const [{data:isOwner,error:ownerError},{data:staffRole,error:staffError}]=await withTimeout(Promise.all([
   supabase.rpc('is_admin'),
   supabase.from('staff_roles').select('permissions,active').eq('user_id',session.user.id).maybeSingle()
  ]),'فحص صلاحيات الإدارة');
  if(ownerError)throw ownerError;
  if(staffError)throw staffError;
  const canModerateRooms=isOwner===true||(staffRole?.active===true&&Array.isArray(staffRole.permissions)&&staffRole.permissions.includes('room_moderation'));
  if(!canModerateRooms){message('تم تسجيل الدخول، لكن هذا الحساب لا يملك صلاحية إدارة الغرف.',true);return;}
  admin.classList.remove('hidden');
  if(isOwner===true){
   message('مرحباً '+(profile?.display_name||'بالمديرة')+' — تم التحقق من صلاحية Super Admin.');
   watchLoginEvents();
  }else{
   message('مرحباً '+(profile?.display_name||'بالمسؤول')+' — تم التحقق من صلاحية إدارة الغرف فقط.');
   document.querySelectorAll('#admin-menu [data-tab]').forEach(button=>{button.hidden=button.dataset.tab!=='rooms';});
   $('#admin-menu')?.classList.remove('hidden');
   if($('#admin-menu-toggle'))$('#admin-menu-toggle').hidden=true;
   document.querySelectorAll('section.panel').forEach(section=>section.classList.toggle('hidden',section.id!=='rooms'));
   document.querySelector('.room-design-studio')?.classList.add('hidden');
  }
  setInterval(()=>refreshRoomPresence().catch(error=>{console.warn('Automatic room presence refresh failed:',error);}),30000);
  const ownerSections=[
   ['الإحصاءات',loadStats],['نمو المستخدمين',loadSignupTrend],['المتجر والإطارات والخلفيات',loadItems],['الهدايا',loadGifts],['دخول الأعضاء',loadLogins],
   ['الألعاب',loadGames],['الغرف',loadRooms],['الأعضاء',loadUsers],['قنبلة الغرفة',loadBombLevels],
   ['الوكالات',loadAgencies],['المضيفون',loadHosts],['باقات الشحن',loadTopupPackages],['طلبات الشحن الخارجية',loadExternalTopupOrders],['المسؤولون المساعدون',loadStaffRoles],['البلاغات',loadReports],['ملاحظات الأعضاء',loadFeedback]
  ];
  const sections=isOwner===true?ownerSections:[['الغرف',loadRooms]];
  await Promise.all(sections.map(async([label,load])=>{
   try{await load();}
   catch(error){
    console.error('HAMSAT admin section failed:',label,error);
    const target=({
     'نمو المستخدمين':'#signup-trend','المضيفون':'#host-list','المتجر والإطارات والخلفيات':'#item-list','الهدايا':'#gift-list','الألعاب':'#game-list',
     'الغرف':'#room-list','الأعضاء':'#user-results','دخول الأعضاء':'#login-events','قنبلة الغرفة':'#bomb-level-list',
     'الوكالات':'#agency-list','باقات الشحن':'#topup-package-list','طلبات الشحن الخارجية':'#topup-order-list','المسؤولون المساعدون':'#staff-list','البلاغات':'#report-list','ملاحظات الأعضاء':'#feedback-list'
    })[label];
    if(target&&$(target))$(target).innerHTML='<p class="text-red-300 text-sm">تعذر تحميل هذا القسم: '+esc(error.message||'خطأ غير معروف')+'</p>';
    message('تعذر تحميل قسم '+label+' فقط: '+(error.message||'خطأ غير معروف'),true);
   }
  }));
 }catch(error){
  console.error('HAMSAT admin authorization failed:',error);
  message('توقف التحقق: '+(error?.message||'خطأ غير معروف')+' — أعيدي تحميل الصفحة بعد قليل.',true);
 }
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
async function uploadGiftAnimation(file){
 if(!file)return null;
 const ext=(file.name.match(/\.([a-z0-9]+)$/i)||[])[1]?.toLowerCase();
 if(!['svga','json','lottie'].includes(ext)||file.size>15*1024*1024)throw Error('ملف الحركة يجب أن يكون SVGA أو JSON/Lottie وأقل من 15MB');
 const {data:{user}}=await supabase.auth.getUser();
 const path=user.id+'/catalog/gift-animations/'+crypto.randomUUID()+'.'+ext;
 const contentType=file.type||(ext==='json'?'application/json':'application/octet-stream');
 const {data,error}=await supabase.storage.from('hamsat-media').upload(path,file,{upsert:false,contentType});
 if(error)throw error;
 return supabase.storage.from('hamsat-media').getPublicUrl(data.path).data.publicUrl;
}
function row(title,sub,id,active,kind){return '<div class="item"><div class="min-w-0"><b>'+esc(title)+'</b><p class="muted text-xs">'+esc(sub)+' · '+(active?'منشور':'مخفي')+'</p></div><button class="ghost text-sm" data-toggle="'+esc(id)+'" data-kind="'+kind+'">'+(active?'إخفاء':'نشر')+'</button></div>'}
async function loadStats(){
 const tables=['profiles','rooms','gifts','shop_items'],ids=['stat-users','stat-rooms','stat-gifts','stat-items'];
 const results=await Promise.all(tables.map(async(t,i)=>{
  try{
   const {count,error}=await supabase.from(t).select('id',{count:'exact',head:true});
   if(error)throw error;
   $('#'+ids[i]).textContent=Number(count??0).toLocaleString('ar-DZ');
   return null;
  }catch(error){
   $('#'+ids[i]).textContent='—';
   console.error('HAMSAT admin statistic failed:',t,error);
   return t;
  }
 }));
 try{
  const {data,error}=await supabase.rpc('get_public_room_presence');
  if(error)throw error;
  const rooms=Array.isArray(data)?data:[];
  const members=rooms.reduce((sum,row)=>sum+Math.max(0,Number(row.active_count)||0),0);
  $('#stat-live-rooms').textContent=rooms.length.toLocaleString('ar-DZ');
  $('#stat-room-members').textContent=members.toLocaleString('ar-DZ');
 }catch(error){
  $('#stat-live-rooms').textContent='—';
  $('#stat-room-members').textContent='—';
  console.warn('HAMSAT live room presence metric unavailable:',error);
 }
 const failed=results.filter(Boolean);
 if(failed.length)throw new Error('تعذر جلب إحصاءات: '+failed.join('، '));
}
async function loadSignupTrend(days=30){
 const root=$('#signup-trend');if(!root)return;
 const span=Math.max(7,Math.min(30,Number(days)||30));
 const start=new Date();start.setHours(0,0,0,0);start.setDate(start.getDate()-(span-1));
 const {data,error}=await supabase.from('profiles').select('created_at').gte('created_at',start.toISOString()).order('created_at',{ascending:true});
 if(error)throw error;
 const key=date=>[date.getFullYear(),String(date.getMonth()+1).padStart(2,'0'),String(date.getDate()).padStart(2,'0')].join('-');
 const counts=new Map();
 for(const row of data||[]){if(!row.created_at)continue;const d=new Date(row.created_at);const k=key(d);counts.set(k,(counts.get(k)||0)+1);}
 const daysList=Array.from({length:span},(_,i)=>{const d=new Date(start);d.setDate(start.getDate()+i);return {date:d,count:counts.get(key(d))||0};});
 const max=Math.max(1,...daysList.map(x=>x.count));
 const number=(data||[]).length.toLocaleString('ar-DZ');
 root.innerHTML='<div class="flex items-center justify-between gap-2"><b class="text-lg">'+number+'</b><span class="muted text-xs">حساباً جديداً خلال '+span+' يوماً</span></div><div style="display:flex;align-items:flex-end;gap:5px;height:172px;overflow-x:auto;padding:10px 2px 4px;direction:ltr">'+daysList.map((x,i)=>{const label=x.date.toLocaleDateString('ar-DZ',{day:'numeric',month:'short'});const height=Math.max(3,Math.round(x.count/max*112));return '<div title="'+esc(label+': '+x.count)+' حساب" style="flex:1 0 '+(span===7?'28px':'14px')+';min-width:0;height:100%;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;gap:5px"><small style="font-size:10px;color:#718096">'+(x.count||'')+'</small><i style="display:block;width:100%;max-width:24px;height:'+height+'px;border-radius:5px 5px 2px 2px;background:linear-gradient(180deg,#5b9bd5,#2876ba)"></i><small style="font-size:9px;color:#718096;white-space:nowrap">'+(span===7||i%5===0||i===span-1?label:'')+'</small></div>';}).join('')+'</div>';
 document.querySelectorAll('[data-signup-range]').forEach(button=>button.classList.toggle('active',Number(button.dataset.signupRange)===span));
}
document.querySelectorAll('[data-signup-range]').forEach(button=>button.addEventListener('click',()=>loadSignupTrend(Number(button.dataset.signupRange)).catch(error=>message('تعذر تحميل اتجاه التسجيلات: '+error.message,true))));
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
 $('#gift-list').innerHTML=data.length?data.map(x=>{
  const preview=x.image_url?'<img src="'+esc(x.image_url)+'" alt="'+esc(x.name)+'" loading="lazy" class="w-14 h-14 rounded-xl object-cover border border-slate-200">':'<div class="w-14 h-14 rounded-xl bg-slate-100 grid place-items-center text-2xl">'+esc(x.icon||'🎁')+'</div>';
  const status=x.active?'منشورة':'مخفية';
  return '<article class="item"><div class="flex gap-3 items-center min-w-0">'+preview+'<div class="min-w-0"><b>'+esc(x.name)+'</b><p class="muted text-xs">'+esc(x.id)+' · '+Number(x.price).toLocaleString('ar-DZ')+' Coins · '+esc(({app:'التطبيق',event:'الحدث',lucky:'محظوظة',special:'خاصة'}[x.category]||'التطبيق'))+'</p><p class="muted text-xs">'+status+(x.animation_url?' · حركة مرتبطة':' · بلا حركة')+'</p></div></div><div class="flex flex-wrap gap-2"><button type="button" class="ghost text-xs" data-edit-gift="'+esc(x.id)+'">تعديل</button><button type="button" class="ghost text-xs" data-toggle="'+esc(x.id)+'" data-kind="gift">'+(x.active?'إخفاء':'نشر')+'</button></div></article>';
 }).join(''):'<p class="muted">لا توجد هدايا بعد.</p>';
 bindToggles('#gift-list',data,'gift');
 $('#gift-list').querySelectorAll('[data-edit-gift]').forEach(button=>button.onclick=()=>{
  const gift=data.find(x=>x.id===button.dataset.editGift),form=$('#gift-form');if(!gift||!form)return;
  form.elements.id.value=gift.id;form.elements.name.value=gift.name;form.elements.price.value=gift.price;
  form.elements.icon.value=gift.icon||'🎁';form.elements.category.value=gift.category||'app';
  form.elements.description.value=gift.description||'';form.elements.image_url.value=gift.image_url||'';
  form.elements.animation_url.value=gift.animation_url||'';form.elements.active.checked=Boolean(gift.active);
  form.elements.image_file.value='';form.elements.animation_file.value='';
  form.scrollIntoView({behavior:'smooth',block:'start'});message('تم تحميل بيانات الهدية للتعديل. احفظي بعد الانتهاء.');
 });
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

async function loadHosts(){
 const root=$('#host-list');if(!root)return;
 const {data:members,error}=await supabase.from('agency_members').select('agency_id,user_id,status,member_role,joined_at').eq('member_role','host').eq('status','active').order('joined_at',{ascending:false});
 if(error)throw error;
 if(!members?.length){root.innerHTML='<p class="muted">لا يوجد مضيفون مرتبطون بوكالات نشطة حالياً.</p>';return;}
 const agencyIds=[...new Set(members.map(x=>x.agency_id))],userIds=[...new Set(members.map(x=>x.user_id))];
 const [agenciesResult,profilesResult]=await Promise.all([
  supabase.from('agencies').select('id,name,status,agency_type').in('id',agencyIds),
  supabase.from('profiles').select('id,public_id,display_name,handle').in('id',userIds)
 ]);
 if(agenciesResult.error)throw agenciesResult.error;
 if(profilesResult.error)throw profilesResult.error;
 const since=new Date(Date.now()-30*24*60*60*1000).toISOString().slice(0,10);
 const statsResult=await supabase.from('agency_host_daily_stats').select('agency_id,host_id,live_seconds,gift_coins,stat_date').in('agency_id',agencyIds).in('host_id',userIds).gte('stat_date',since);
 if(statsResult.error)throw statsResult.error;
 const agencies=Object.fromEntries((agenciesResult.data||[]).map(x=>[x.id,x]));
 const profiles=Object.fromEntries((profilesResult.data||[]).map(x=>[x.id,x]));
 const totals=new Map();
 for(const row of statsResult.data||[]){
  const key=row.agency_id+':'+row.host_id,old=totals.get(key)||{seconds:0,gifts:0};
  old.seconds+=Math.max(0,Number(row.live_seconds)||0);old.gifts+=Math.max(0,Number(row.gift_coins)||0);totals.set(key,old);
 }
 root.innerHTML=members.map(member=>{
  const agency=agencies[member.agency_id]||{},profile=profiles[member.user_id]||{},stats=totals.get(member.agency_id+':'+member.user_id)||{seconds:0,gifts:0};
  const hours=(stats.seconds/3600).toFixed(1);
  return '<article class="item"><div class="min-w-0"><b>'+esc(profile.display_name||profile.handle||'مضيف')+'</b><p class="muted text-xs">UID '+esc(profile.public_id||'—')+' · '+esc(agency.name||'وكالة غير معروفة')+' · '+esc(agency.status||'')+'</p><p class="text-xs mt-2">ساعات البث المسجلة: <b>'+esc(hours)+'</b> ساعة · هدايا مسجلة: <b>'+stats.gifts.toLocaleString('ar-DZ')+'</b> Coins</p><p class="muted text-xs">الهدف والراتب: غير متاحين حتى ربط سياسة الأهداف والاستحقاقات</p></div></article>';
 }).join('');
}

async function loadTopupPackages(){
 const root=$('#topup-package-list');
 const {data,error}=await supabase.from('topup_packages').select('*').order('sort_order');
 if(error){root.innerHTML='<p class="muted">تظهر الباقات بعد تطبيق ترحيل الوكالات.</p>';return;}
 root.innerHTML=(data||[]).map(x=>'<div class="item"><div><b>'+esc(x.name)+'</b><p class="muted text-xs">'+esc(x.coins)+' عملة · '+esc(x.price_dzd)+' دج · '+(x.active?'نشطة':'متوقفة')+'</p></div><button class="ghost text-xs" data-package-toggle="'+esc(x.id)+'" data-active="'+(!x.active)+'">تبديل الحالة</button></div>').join('')||'<p class="muted">أضيفي أول باقة شحن.</p>';
 root.querySelectorAll('[data-package-toggle]').forEach(b=>b.onclick=async()=>{const item=(data||[]).find(x=>x.id===b.dataset.packageToggle);if(!item)return;const {error}=await supabase.from('topup_packages').update({active:b.dataset.active==='true'}).eq('id',item.id);if(error){message(error.message,true);return;}await loadTopupPackages();});
}
async function loadExternalTopupOrders(){
 const root=$('#topup-order-list');
 const {data,error}=await supabase.from('external_topup_orders').select('id,user_id,package_id,payment_provider,coins,price_dzd,provider_reference,status,created_at,verified_at').order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 const ids=[...new Set((data||[]).map(x=>x.user_id).filter(Boolean))];
 let profiles=[];
 if(ids.length){const r=await supabase.from('profiles').select('id,public_id,display_name,handle').in('id',ids);if(r.error)throw r.error;profiles=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x]));
 const statusNames={pending:'بانتظار التحقق',paid:'مدفوع',failed:'فشل الدفع',cancelled:'ملغى'};
 root.innerHTML=(data||[]).length?(data||[]).map(x=>{
  const p=byId[x.user_id]||{};
  return '<article class="item"><div class="flex justify-between gap-3"><div class="min-w-0"><b>طلب '+esc(String(x.id).slice(0,8))+'…</b><p class="muted text-xs">العضو '+esc(p.public_id||'—')+' · '+esc(p.display_name||p.handle||'عضو')+'</p><p class="text-xs mt-1">'+esc(x.coins)+' عملة · '+esc(x.price_dzd)+' دج · '+esc(x.payment_provider)+'</p><p class="muted text-xs">مرجع الدفع: '+esc(x.provider_reference||'غير متوفر')+' · '+esc(new Date(x.created_at).toLocaleString('ar-DZ'))+'</p></div><span class="pill">'+esc(statusNames[x.status]||x.status)+'</span></div></article>';
 }).join(''):'<p class="muted">لا توجد طلبات شحن خارجية حالياً.</p>';
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
 root.querySelectorAll('[data-report-status]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.rpc('staff_update_user_report',{p_report_id:Number(b.dataset.id),p_status:b.dataset.reportStatus,p_reason:'مراجعة من لوحة السوبر أدمن'});if(error){message(error.message,true);return;}await loadReports();message('تم تحديث حالة البلاغ.');});
}

async function loadFeedback(){
 const root=$('#feedback-list');
 const {data,error}=await supabase.from('user_feedback').select('*').order('created_at',{ascending:false}).limit(100);
 if(error)throw error;
 const ids=[...new Set((data||[]).map(x=>x.user_id).filter(Boolean))];
 let profiles=[];
 if(ids.length){const r=await supabase.from('profiles').select('id,public_id,display_name,handle').in('id',ids);if(!r.error)profiles=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x]));
 const statusNames={new:'جديدة',reviewing:'قيد المراجعة',resolved:'تمت المعالجة',dismissed:'مغلقة'};
 root.innerHTML=(data||[]).map(x=>'<article class="item block"><div class="flex justify-between gap-3"><div><b>ملاحظة #'+esc(x.id)+' · '+esc(x.feedback_type)+'</b><p class="muted text-xs">'+esc(byId[x.user_id]?.display_name||byId[x.user_id]?.handle||'عضو')+' · ID '+esc(byId[x.user_id]?.public_id||'—')+' · '+new Date(x.created_at).toLocaleString('ar-DZ')+'</p></div><span class="pill">'+esc(statusNames[x.status]||x.status)+'</span></div><p class="text-sm mt-2 whitespace-pre-wrap">'+esc(x.body)+'</p><div class="flex flex-wrap gap-2 mt-3"><button class="ghost text-xs" data-feedback-status="reviewing" data-id="'+esc(x.id)+'">قيد المراجعة</button><button class="ghost text-xs" data-feedback-status="resolved" data-id="'+esc(x.id)+'">تمت المعالجة</button><button class="ghost text-xs" data-feedback-status="dismissed" data-id="'+esc(x.id)+'">إغلاق</button></div></article>').join('')||'<p class="muted">لا توجد ملاحظات واردة حالياً.</p>';
 root.querySelectorAll('[data-feedback-status]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const {error}=await supabase.rpc('admin_update_user_feedback',{p_feedback_id:Number(b.dataset.id),p_status:b.dataset.feedbackStatus});if(error)throw error;await loadFeedback();message('تم تحديث حالة الملاحظة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}});
}
const STAFF_PERMISSION_LABELS={
 room_moderation:'إدارة الغرف والإشراف',
 report_review:'مراجعة البلاغات',
 member_support:'دعم الأعضاء',
 event_management:'إدارة الفعاليات'
};
async function loadStaffRoles(){
 const root=$('#staff-list'),auditRoot=$('#staff-audit-list');
 const {data,error}=await supabase.from('staff_roles').select('user_id,permissions,active,assigned_by,created_at,updated_at').order('updated_at',{ascending:false});
 if(error)throw error;
 const rows=data||[],ids=[...new Set(rows.map(x=>x.user_id).filter(Boolean))];
 let profiles=[];
 if(ids.length){const r=await supabase.from('profiles').select('id,public_id,display_name,handle,role').in('id',ids);if(r.error)throw r.error;profiles=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x]));
 root.innerHTML=rows.length?rows.map(x=>{
  const p=byId[x.user_id]||{},perms=(x.permissions||[]).map(k=>STAFF_PERMISSION_LABELS[k]||k);
  return '<article class="item"><div class="min-w-0"><b>'+esc(p.display_name||p.handle||'عضو فريق')+'</b><p class="muted text-xs">ID '+esc(p.public_id||'—')+' · '+(x.active?'<span class="text-emerald-300">نشط</span>':'<span class="text-amber-200">متوقف</span>')+'</p><p class="text-xs mt-2">'+esc(perms.join(' · ')||'بلا صلاحيات')+'</p></div><div class="flex flex-wrap gap-2"><button type="button" class="ghost text-xs" data-staff-toggle="'+esc(x.user_id)+'" data-active="'+(!x.active)+'">'+(x.active?'تعطيل':'تفعيل')+'</button><button type="button" class="ghost text-xs" data-staff-revoke="'+esc(x.user_id)+'">سحب كل الصلاحيات</button></div></article>';
 }).join(''):'<p class="muted">لا يوجد مسؤولون مساعدين حتى الآن.</p>';
 root.querySelectorAll('[data-staff-toggle]').forEach(b=>b.onclick=async()=>{
  const row=rows.find(x=>x.user_id===b.dataset.staffToggle);if(!row)return;b.disabled=true;
  try{const {error}=await supabase.rpc('assign_staff_permissions',{p_user_id:row.user_id,p_permissions:row.permissions||[],p_active:b.dataset.active==='true'});if(error)throw error;await loadStaffRoles();message('تم تحديث حالة المسؤول.');}
  catch(e){message(e.message,true);}finally{b.disabled=false;}
 });
 root.querySelectorAll('[data-staff-revoke]').forEach(b=>b.onclick=async()=>{
  if(!confirm('سيتم سحب جميع صلاحيات هذا المسؤول وإيقافه. هل تتابعين؟'))return;
  b.disabled=true;try{const {error}=await supabase.rpc('assign_staff_permissions',{p_user_id:b.dataset.staffRevoke,p_permissions:[],p_active:false});if(error)throw error;await loadStaffRoles();message('تم سحب الصلاحيات.');}
  catch(e){message(e.message,true);}finally{b.disabled=false;}
 });
 const {data:audit,error:auditError}=await supabase.from('staff_audit_log').select('id,staff_user_id,action,target_type,target_id,reason,metadata,created_at').order('created_at',{ascending:false}).limit(30);
 if(auditError)throw auditError;
 const auditIds=[...new Set((audit||[]).map(x=>x.staff_user_id).filter(Boolean))];
 let auditProfiles=[];
 if(auditIds.length){const r=await supabase.from('profiles').select('id,public_id,display_name,handle').in('id',auditIds);if(r.error)throw r.error;auditProfiles=r.data||[];}
 const auditById=Object.fromEntries(auditProfiles.map(x=>[x.id,x]));
 auditRoot.innerHTML=(audit||[]).length?(audit||[]).map(x=>'<div class="item"><b>'+esc(x.action)+'</b><p class="muted text-xs">'+esc(auditById[x.staff_user_id]?.display_name||'مسؤول')+' · '+esc(auditById[x.staff_user_id]?.public_id||'—')+' · '+esc(new Date(x.created_at).toLocaleString('ar-DZ'))+'</p><p class="muted text-xs">'+esc(x.target_type||'')+' '+esc(x.target_id||'')+'</p></div>').join(''):'<p class="muted">لا توجد عمليات مسجلة حتى الآن.</p>';
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
  const {data:directory,error}=await supabase.functions.invoke('admin-user-directory',{body:{search:clean,offset:from,limit:pageSize}});
  if(error)throw error;
  if(directory?.error)throw new Error(directory.error);
  const page=directory?.users||[];
  data.push(...page);
  if(page.length<pageSize)break;
 }
 const out=$('#user-results');
 let activityByUser={},walletByUser={};
 if(data.length){
  const activity=await supabase.rpc('admin_user_activity',{p_user_ids:data.map(x=>x.id)});
  if(!activity.error)activityByUser=Object.fromEntries((activity.data||[]).map(x=>[x.user_id,x]));
  else console.warn('HAMSAT admin user activity is unavailable:',activity.error.message);
  const wallets=await supabase.from('wallets').select('user_id,balance').in('user_id',data.map(x=>x.id));
  if(!wallets.error)walletByUser=Object.fromEntries((wallets.data||[]).map(x=>[x.user_id,x]));
  else console.warn('HAMSAT admin wallet balances are unavailable:',wallets.error.message);
 }
 const dateText=value=>value?new Date(value).toLocaleString('ar-DZ'):'غير متاح';
 out.innerHTML=data.length?data.map(x=>{
  const activity=activityByUser[x.id]||{};
  const publicId=String(x.public_id??'').padStart(6,'0');
  const name=String(x.display_name||'').trim();
  const handle=String(x.handle||'').trim();
  const registered=activity.account_created_at||x.created_at;
  const lastLogin=activity.last_sign_in_at;
  return '<div class="item"><div class="min-w-0"><b>'+esc(name||'عضو بدون اسم')+'</b><p class="muted text-xs">HAMSAT-'+esc(publicId)+' · '+esc(handle?'@'+handle:'لم يحدد اسم مستخدم')+' · '+esc(x.role||'user')+' · '+(x.is_banned?'محظور':'نشط')+'</p><p class="muted text-xs mt-1">رصيد Coins: '+(walletByUser[x.id]?.balance===undefined?'غير متاح':Number(walletByUser[x.id].balance).toLocaleString('ar-DZ'))+'</p><p class="muted text-xs mt-1">تاريخ التسجيل: '+esc(dateText(registered))+' · آخر دخول: '+esc(dateText(lastLogin))+'</p>'+(name&&handle?'':'<p class="text-amber-200 text-xs mt-1">لم يكمل العضو بيانات الملف الشخصي؛ لا يوجد اسم معلن للتعرّف عليه.</p>')+'</div><div class="flex flex-wrap gap-2"><button type="button" class="ghost text-xs" data-user-details="'+esc(x.id)+'">التفاصيل</button><button class="ghost text-xs" data-moderate-user="'+esc(x.id)+'" data-banned="'+(x.is_banned?'true':'false')+'">'+(x.is_banned?'فك الحظر':'حظر الحساب')+'</button></div></div>';
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
    '<p>رصيد Coins: '+(walletByUser[x.id]?.balance===undefined?'غير متاح':Number(walletByUser[x.id].balance).toLocaleString('ar-DZ'))+'</p>'+
    '<p class="muted text-xs">تعديل الرصيد غير متاح من الواجهة الحالية؛ يجب أن يمر عبر إجراء مالي آمن ومسجل.</p>'+
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
    message(data?.warning || 'تم إنهاء جلسة العضو. لم يتم حظره ويمكنه تسجيل الدخول مجدداً.', Boolean(data?.warning));
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
   message(data?.warning || (next?'تم حظر الحساب.':'تم فك الحظر.'), Boolean(data?.warning));
   await Promise.all([loadUsers(clean),loadStats()]);
  }catch(e){message(e.message||'تعذّر تحديث حالة العضو.',true);b.disabled=false;}
 });
}
let roomDesignRooms=[],roomPresenceByRoom={},roomPresenceAvailable=false,roomPresenceUpdatedAt=null,roomRosterByRoom={},roomRosterOpen=new Set();
function renderRoomRosterHtml(roomId){
 const state=roomRosterByRoom[roomId];
 if(!state)return '<p class="muted text-xs">اضغطي «عرض الأعضاء» لتحميل الحضور الحالي.</p>';
 if(state.loading)return '<p class="muted text-xs">جارٍ تحميل أعضاء الغرفة…</p>';
 if(state.error)return '<p class="text-red-300 text-xs">'+esc(state.error)+'</p>';
 const members=state.members||[];
 if(!members.length)return '<p class="muted text-xs">لا يوجد أعضاء نشطون في الغرفة حالياً.</p>';
 return '<div class="grid gap-2">'+members.map(member=>{
  const profile=member.profile||{},name=profile.display_name||profile.handle||'عضو';
  const publicId=profile.public_id?'HAMSAT-'+String(profile.public_id).padStart(6,'0'):'عضو';
  const seat=member.seat_no?' · المايك '+member.seat_no:' · مستمع';
  const controls=member.is_room_owner?'<span class="pill">مضيفة الغرفة</span>':'<div class="flex flex-wrap gap-2"><button type="button" class="ghost text-xs" data-room-mute="'+esc(roomId)+'" data-user="'+esc(member.user_id)+'" data-muted="'+(member.muted?'true':'false')+'">'+(member.muted?'إلغاء كتم المايك':'كتم المايك')+'</button><button type="button" class="ghost text-xs" data-room-kick="'+esc(roomId)+'" data-user="'+esc(member.user_id)+'">طرد من الغرفة</button></div>';
  return '<div class="item flex flex-wrap items-center justify-between gap-2"><div class="min-w-0"><b>'+esc(name)+'</b><p class="muted text-xs">'+esc(publicId)+esc(seat)+(member.muted?' · المايك مكتوم':'')+'</p></div>'+controls+'</div>';
 }).join('')+'</div>';
}
async function loadRoomRoster(roomId){
 roomRosterByRoom[roomId]={loading:true};renderRoomList();
 const {data,error}=await supabase.functions.invoke('admin-room-moderation',{body:{action:'list',room_id:roomId}});
 if(error)throw error;if(data?.error)throw new Error(data.error);
 roomRosterByRoom[roomId]={members:data?.members||[],loadedAt:Date.now()};renderRoomList();
}
async function runRoomModeration(action,roomId,userId,button){
 if(action==='kick'&&!confirm('سيتم فصل العضو صوتياً وإزالته من الغرفة. هل تريدين المتابعة؟'))return;
 if(button)button.disabled=true;
 try{
  const {data,error}=await supabase.functions.invoke('admin-room-moderation',{body:{action,room_id:roomId,participant_id:userId}});
  if(error)throw error;if(data?.error)throw new Error(data.error);
  message(data?.warning||({mute:'تم كتم مايك العضو.',unmute:'تم إرسال طلب إلغاء الكتم.',kick:'تم طرد العضو من الغرفة.'}[action]||'تم تنفيذ الإجراء.'),Boolean(data?.warning));
  await loadRoomRoster(roomId);await refreshRoomPresence();
 }catch(error){message(error.message||'تعذّر تنفيذ إجراء إدارة الغرفة.',true);if(button)button.disabled=false;}
}
function bindRoomModerationControls(root){
 root.querySelectorAll('[data-room-roster]').forEach(button=>button.onclick=async()=>{
  const roomId=button.dataset.roomRoster;
  if(roomRosterOpen.has(roomId)){roomRosterOpen.delete(roomId);renderRoomList();return;}
  roomRosterOpen.add(roomId);roomRosterByRoom[roomId]={loading:true};renderRoomList();
  try{await loadRoomRoster(roomId);}catch(error){roomRosterByRoom[roomId]={error:error.message||'تعذّر تحميل الأعضاء.'};renderRoomList();}
 });
 root.querySelectorAll('[data-room-mute]').forEach(button=>button.onclick=()=>runRoomModeration(button.dataset.muted==='true'?'unmute':'mute',button.dataset.roomMute,button.dataset.user,button));
 root.querySelectorAll('[data-room-kick]').forEach(button=>button.onclick=()=>runRoomModeration('kick',button.dataset.roomKick,button.dataset.user,button));
}
function renderRoomList(){
 const root=$('#room-list');if(!root)return;
 const query=($('#room-search')?.value||'').trim().toLocaleLowerCase();
 const filter=$('#room-presence-filter')?.value||'all';
 const filtered=roomDesignRooms.filter(room=>{
  const count=roomPresenceByRoom[room.id];
  if(filter==='live'&&!(Number(count)>0))return false;
  if(filter==='quiet'&&(count??0)!==0)return false;
  const haystack=[room.title,room.topic,room.public_id,room.ownerName].join(' ').toLocaleLowerCase();
  return !query||haystack.includes(query);
 });
 const active=roomDesignRooms.filter(room=>Number(roomPresenceByRoom[room.id])>0).length;
 const members=Object.values(roomPresenceByRoom).reduce((sum,count)=>sum+Math.max(0,Number(count)||0),0);
 $('#room-live-summary').innerHTML=[
  ['إجمالي الغرف',roomDesignRooms.length.toLocaleString('ar-DZ')],
  ['غرف بها حضور',roomPresenceAvailable?active.toLocaleString('ar-DZ'):'—'],
  ['مقاعد/أعضاء ظاهرون',roomPresenceAvailable?members.toLocaleString('ar-DZ'):'—']
 ].map(([label,value])=>'<div class="stat"><span class="muted text-xs">'+label+'</span><b>'+value+'</b></div>').join('');
 root.innerHTML=filtered.length?filtered.map(room=>{
  const count=roomPresenceByRoom[room.id];
  const countLabel=roomPresenceAvailable?(count??0).toLocaleString('ar-DZ'):'غير متاح';
  const live=roomPresenceAvailable&&Number(count)>0,opened=roomRosterOpen.has(room.id);
  return '<article class="item"><div class="flex flex-wrap items-center justify-between gap-3"><div class="min-w-0"><div class="flex flex-wrap items-center gap-2"><b>'+esc(room.title)+'</b><span class="pill">'+(live?'نشطة الآن':'غرفة')+'</span></div><p class="muted text-xs">'+esc('ROOM-'+String(room.public_id).padStart(6,'0'))+' · '+esc(room.topic||'عام')+' · المضيفة: '+esc(room.ownerName||'عضو')+'</p><p class="text-xs mt-1">الحضور الآن: <b>'+countLabel+'</b></p></div><button type="button" class="ghost text-xs" data-room-roster="'+esc(room.id)+'">'+(opened?'إخفاء الأعضاء':'عرض الأعضاء وإدارتهم')+'</button></div><div class="mt-3 pt-3 border-t border-slate-200/70" data-room-roster-panel="'+esc(room.id)+'" '+(opened?'':'hidden')+'>'+ (opened?renderRoomRosterHtml(room.id):'')+'</div></article>';
 }).join(''):'<p class="muted">لا توجد غرف تطابق البحث أو الفلتر المحدد.</p>';
 if(roomPresenceUpdatedAt)$('#room-presence-updated').textContent='آخر تحديث للحضور: '+roomPresenceUpdatedAt.toLocaleTimeString('ar-DZ');
 bindRoomModerationControls(root);
}
async function refreshRoomPresence(){
 const {data,error}=await supabase.rpc('get_public_room_presence');
 if(error)throw error;
 roomPresenceByRoom=Object.fromEntries((data||[]).map(row=>[row.room_id,Math.max(0,Number(row.active_count)||0)]));
 roomPresenceAvailable=true;roomPresenceUpdatedAt=new Date();renderRoomList();
}
async function loadRooms(){
 const data=[];
 for(let from=0;;from+=200){
  const {data:page,error}=await supabase.from('rooms').select('id,public_id,title,topic,owner_id,created_at').order('created_at',{ascending:false}).range(from,from+199);
  if(error)throw error;data.push(...(page||[]));if(!page||page.length<200)break;
 }
 const ids=[...new Set(data.map(x=>x.owner_id))];
 const p=ids.length?await supabase.from('profiles').select('id,display_name,public_id').in('id',ids):{data:[],error:null};
 if(p.error)throw p.error;
 const byId=Object.fromEntries((p.data||[]).map(x=>[x.id,x]));
 roomDesignRooms=data.map(x=>({...x,ownerName:byId[x.owner_id]?.display_name||'عضو'}));
 const roomSelect=$('#rd-room');
 if(roomSelect){
  const selected=roomSelect.value;
  roomSelect.innerHTML='<option value="">اختاري غرفة</option>'+roomDesignRooms.map(x=>'<option value="'+esc(x.id)+'">'+esc(x.title)+' · ROOM-'+esc(String(x.public_id).padStart(6,'0'))+'</option>').join('');
  if(roomDesignRooms.some(x=>x.id===selected))roomSelect.value=selected;
 }
 try{await refreshRoomPresence();}
 catch(error){roomPresenceAvailable=false;roomPresenceByRoom={};roomPresenceUpdatedAt=null;$('#room-presence-updated').textContent='تعذر جلب الحضور: '+(error.message||'خطأ غير معروف');renderRoomList();}
}
$('#room-search')?.addEventListener('input',renderRoomList);
$('#room-presence-filter')?.addEventListener('change',renderRoomList);
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
$('#gift-form').onsubmit=async e=>{
 e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
 try{
  const imageFile=f.elements.image_file.files[0],animationFile=f.elements.animation_file.files[0];
  const image_url=imageFile?await upload(imageFile,'catalog/gifts'):f.elements.image_url.value.trim()||null;
  const animation_url=animationFile?await uploadGiftAnimation(animationFile):f.elements.animation_url.value.trim()||null;
  const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),price:Number(f.elements.price.value),icon:f.elements.icon.value.trim(),category:f.elements.category.value,description:f.elements.description.value.trim(),image_url,animation_url,active:f.elements.active.checked};
  const {error}=await supabase.from('gifts').upsert(payload,{onConflict:'id'});if(error)throw error;
  f.reset();await Promise.all([loadGifts(),loadStats()]);message('تم حفظ الهدية وربط ملفاتها في الكتالوج.');
 }catch(e){message(e.message,true);}finally{b.disabled=false;}
};
$('#bomb-level-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={level:Number(f.elements.level.value),threshold:Number(f.elements.threshold.value),reward_min:Number(f.elements.reward_min.value),reward_max:Number(f.elements.reward_max.value),active:f.elements.active.checked,updated_at:new Date().toISOString()};if(!Number.isInteger(payload.level)||payload.level<1||payload.level>5)throw Error('المستوى يجب أن يكون بين LV.1 وLV.5.');if(!Number.isSafeInteger(payload.threshold)||payload.threshold<=0)throw Error('نقاط الوصول يجب أن تكون عدداً صحيحاً أكبر من صفر.');if(!Number.isSafeInteger(payload.reward_min)||payload.reward_min<0||!Number.isSafeInteger(payload.reward_max)||payload.reward_max<0)throw Error('قيم المكافأة يجب أن تكون أعداداً صحيحة غير سالبة.');if(payload.reward_max<payload.reward_min)throw Error('أعلى مكافأة يجب أن تكون أكبر من أو تساوي أقل مكافأة.');const {error}=await supabase.from('room_bomb_levels').upsert(payload,{onConflict:'level'});if(error)throw error;await loadBombLevels();message('تم حفظ إعدادات مستوى القنبلة.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#agency-create-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const {data,error}=await supabase.rpc('admin_create_agency',{p_name:f.elements.name.value.trim(),p_type:f.elements.agency_type.value,p_owner_public_id:Number(f.elements.owner_public_id.value),p_commission_percent:Number(f.elements.commission_percent.value),p_agent_commission_percent:Number(f.elements.agent_commission_percent.value)});if(error)throw error;f.reset();await loadAgencies();message('تم إنشاء الوكالة: '+data);}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#agency-member-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const {error}=await supabase.rpc('agency_add_member',{p_agency_id:f.elements.agency_id.value,p_member_public_id:Number(f.elements.public_id.value),p_role:f.elements.role.value});if(error)throw error;f.elements.public_id.value='';message('تمت إضافة العضو إلى الوكالة.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#topup-package-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),coins:Number(f.elements.coins.value),price_dzd:Number(f.elements.price_dzd.value),sort_order:Number(f.elements.sort_order.value||0),active:f.elements.active.checked};const {error}=await supabase.from('topup_packages').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await loadTopupPackages();message('تم حفظ باقة الشحن.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
$('#staff-assign-form').onsubmit=async e=>{
 e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;
 try{
  const publicId=Number(f.elements.public_id.value);
  if(!Number.isSafeInteger(publicId)||publicId<=0)throw Error('أدخلي المعرّف العام الصحيح للعضو.');
  const {data:directory,error:directoryError}=await supabase.functions.invoke('admin-user-directory',{body:{search:String(publicId),offset:0,limit:1}});
  if(directoryError)throw directoryError;if(directory?.error)throw Error(directory.error);
  const target=(directory?.users||[]).find(x=>Number(x.public_id)===publicId);
  if(!target)throw Error('لم يتم العثور على عضو بهذا المعرّف.');
  if(target.role==='admin')throw Error('لا يمكن تعيين صلاحيات مساعدة لحساب Super Admin.');
  const permissions=[...f.querySelectorAll('input[name="permissions"]:checked')].map(x=>x.value);
  if(!permissions.length)throw Error('اختاري صلاحية واحدة على الأقل.');
  const {error}=await supabase.rpc('assign_staff_permissions',{p_user_id:target.id,p_permissions:permissions,p_active:f.elements.active.checked});
  if(error)throw error;
  f.reset();f.elements.active.checked=true;await loadStaffRoles();message('تم حفظ صلاحيات المسؤول المساعد.');
 }catch(err){message(err.message,true);}finally{b.disabled=false;}
};
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
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x.dataset.tab===b.dataset.tab));['catalog','gifts','users','logins','rooms','games','bomb','hosts','agencies','staff','reports','feedback'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==b.dataset.tab));$('#admin-menu')?.classList.add('hidden');});
$('#admin-menu-toggle').onclick=()=>$('#admin-menu').classList.toggle('hidden');
let loginChannel=null;
function watchLoginEvents(){if(loginChannel)return;loginChannel=supabase.channel('hamsat-admin-login-events').on('postgres_changes',{event:'INSERT',schema:'public',table:'admin_login_events'},async payload=>{message('دخول عضو جديد إلى همسات · '+new Date(payload.new?.signed_in_at||Date.now()).toLocaleString('ar-DZ'));try{await loadLogins();await loadStats();}catch(e){console.warn('تعذّر تحديث إشعارات الدخول',e);}}).subscribe();}

function initRoomDesignStudio(){
 const $id=id=>document.getElementById(id),controlIds=['rd-seat-count','rd-gap','rd-size','rd-accent','rd-stage','rd-layout','rd-show-host','rd-show-attendees','rd-show-chat','rd-show-tools'];
 const defaults={'rd-seat-count':'8','rd-gap':'16','rd-size':'52','rd-accent':'#d8b66e','rd-stage':'#211d30','rd-layout':'grid','rd-show-host':true,'rd-show-attendees':true,'rd-show-chat':true,'rd-show-tools':true};
 const globalDraft={...defaults},roomDrafts={};let activeKey='global';
 const snapshot=()=>Object.fromEntries(controlIds.map(id=>[id,$id(id)?.type==='checkbox'?$id(id).checked:$id(id)?.value]));
 const apply=cfg=>{for(const id of controlIds){const el=$id(id);if(!el)continue;const value=cfg[id]??defaults[id];if(el.type==='checkbox')el.checked=Boolean(value);else el.value=String(value);}render();};
 const store=()=>{if(activeKey==='global')Object.assign(globalDraft,snapshot());else roomDrafts[activeKey]={...snapshot()};};
 const render=()=>{
  const count=Number($id('rd-seat-count').value),gap=Number($id('rd-gap').value),size=Number($id('rd-size').value),accent=$id('rd-accent').value,stage=$id('rd-stage').value,layout=$id('rd-layout').value;
  $id('rd-seat-count-value').textContent=count;$id('rd-gap-value').textContent=gap+'px';$id('rd-size-value').textContent=size+'px';
  const grid=$id('rd-seat-grid');grid.style.gap=gap+'px '+Math.max(4,Math.round(gap*.65))+'px';grid.style.gridTemplateColumns=layout==='row'?'repeat('+Math.min(count,5)+',minmax(0,1fr))':'repeat(4,minmax(0,1fr))';
  grid.innerHTML=Array.from({length:count},(_,i)=>'<div class="rd-seat"><div class="rd-seat-avatar" style="width:'+size+'px;height:'+size+'px;border-color:'+accent+';font-size:'+Math.round(size*.43)+'px">'+(i===0?'👑':['🌸','🦋','🌙','💎','⭐','🌹','🎧','✨','🐱'][i%9])+'</div><b>'+(i===0?'المقعد 1':'المقعد '+(i+1))+'</b><small>'+(i===0?'مقعد المضيفة':'متحدث')+'</small></div>').join('');
  [...grid.children].forEach((card,index)=>{card.style.gridColumn='auto';if(layout==='one-top'&&index===0)card.style.gridColumn='2 / span 2';if(layout==='two-top'&&index<2)card.style.gridColumn=index===0?'1 / span 2':'3 / span 2';});
  $id('rd-preview-stage').style.background=stage;$id('rd-preview-stage').style.borderColor=accent;
  $id('rd-attendees').hidden=!$id('rd-show-attendees').checked;$id('rd-chat').hidden=!$id('rd-show-chat').checked;$id('rd-toolbar').hidden=!$id('rd-show-tools').checked;$id('rd-preview-host').hidden=!$id('rd-show-host').checked;
  $id('rd-preview-lower').hidden=!$id('rd-show-attendees').checked&&!$id('rd-show-chat').checked;
 };
 controlIds.forEach(id=>$id(id)?.addEventListener('input',()=>{store();render();}));
 controlIds.forEach(id=>$id(id)?.addEventListener('change',()=>{store();render();}));
 const scope=$id('rd-scope'),room=$id('rd-room');
 scope?.addEventListener('change',()=>{
  store();room.disabled=scope.value!=='room';
  if(scope.value==='room'){if(!room.value&&room.options.length>1)room.selectedIndex=1;activeKey=room.value||'room-pending';apply(roomDrafts[activeKey]||defaults);}
  else{activeKey='global';apply(globalDraft);}
 });
 room?.addEventListener('change',()=>{store();activeKey=room.value||'room-pending';apply(roomDrafts[activeKey]||defaults);});
 $id('rd-reset')?.addEventListener('click',()=>{
  if(activeKey==='global'){Object.assign(globalDraft,defaults);apply(globalDraft);}
  else{delete roomDrafts[activeKey];apply(defaults);}
 });
 apply(defaults);
}
$('#refresh-rooms').onclick=()=>loadRooms().catch(e=>message(e.message,true));
initRoomDesignStudio();
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>message(e.message,true));