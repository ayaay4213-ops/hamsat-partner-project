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
 admin.classList.remove('hidden');message('مرحباً '+(profile.display_name||'بالمديرة')+' — تم التحقق من صلاحية Super Admin.');
 await Promise.all([loadStats(),loadItems(),loadGifts(),loadGames(),loadRooms(),loadUsers(),loadBombLevels(),loadAgencies(),loadTopupPackages(),loadReports()]);
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
 await Promise.all(tables.map(async(t,i)=>{const {count,error}=await supabase.from(t).select('*',{count:'exact',head:true});if(error)throw error;$('#'+ids[i]).textContent=count??0;}));
}
async function loadItems(){
 const {data,error}=await supabase.from('shop_items').select('*').order('price');if(error)throw error;
 $('#item-list').innerHTML=data.length?data.map(x=>row(x.name,x.id+' · '+x.item_type+' · '+x.price+' عملة',x.id,x.active,'item')).join(''):'<p class="muted">لا توجد عناصر بعد.</p>';
 bindToggles('#item-list',data,'item');
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
 if(error){$('#bomb-level-list').innerHTML='<p class="muted">تظهر إعدادات القنبلة بعد تطبيق ترحيل قاعدة البيانات.</p>';return;}
 $('#bomb-level-list').innerHTML=(data||[]).map(x=>'<div class="item"><div><b>LV.'+esc(x.level)+'</b><p class="muted text-xs">'+esc(x.threshold)+' نقطة · مكافأة '+esc(x.reward_min)+'–'+esc(x.reward_max)+' عملة · '+(x.active?'مفعّل':'متوقف')+'</p></div><button class="ghost text-sm" data-edit-bomb="'+esc(x.level)+'">تعديل</button></div>').join('')||'<p class="muted">لا توجد مستويات.</p>';
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
 if(roomIds.length){const r=await supabase.from('rooms').select('id,name').in('id',roomIds);if(!r.error)rooms=r.data||[];}
 const byId=Object.fromEntries(profiles.map(x=>[x.id,x])),byRoom=Object.fromEntries(rooms.map(x=>[x.id,x]));
 root.innerHTML=(data||[]).map(x=>'<article class="item block"><div class="flex justify-between gap-3"><div><b>بلاغ #'+esc(x.id)+'</b><p class="muted text-xs">'+(x.subject_user_id?'مستخدم #'+esc(byId[x.subject_user_id]?.public_id||'—'):'غرفة '+esc(byRoom[x.room_id]?.name||'—'))+' · المبلّغ #'+esc(byId[x.reporter_id]?.public_id||'—')+'</p></div><span class="pill">'+esc(x.status)+'</span></div><p class="text-sm mt-2">'+esc(x.reason)+'</p><p class="muted text-xs mt-1">'+esc(x.details||'لا توجد تفاصيل إضافية')+'</p><div class="flex gap-2 mt-3"><button class="ghost text-xs" data-report-status="reviewing" data-id="'+esc(x.id)+'">قيد المراجعة</button><button class="ghost text-xs" data-report-status="resolved" data-id="'+esc(x.id)+'">تم الحل</button><button class="ghost text-xs" data-report-status="dismissed" data-id="'+esc(x.id)+'">إغلاق</button></div></article>').join('')||'<p class="muted">لا توجد بلاغات حالياً.</p>';
 root.querySelectorAll('[data-report-status]').forEach(b=>b.onclick=async()=>{const {error}=await supabase.rpc('admin_update_user_report',{p_report_id:Number(b.dataset.id),p_status:b.dataset.reportStatus});if(error){message(error.message,true);return;}await loadReports();message('تم تحديث حالة البلاغ.');});
}
async function loadUsers(term=''){
 const clean=String(term||'').trim().replace(/[,%()]/g,'');
 let q=supabase.from('profiles').select('id,public_id,display_name,handle,role,created_at,is_banned').order('created_at',{ascending:false}).limit(200);
 if(clean){
  const numeric=clean.toUpperCase().replace(/^HAMSAT-?/,'').replace(/^#/,'');
  const isId=/^\d+$/.test(numeric);
  q=isId?q.eq('public_id',Number(numeric)):q.or('display_name.ilike.%'+clean+'%,handle.ilike.%'+clean+'%');
 }
 const {data,error}=await q;if(error)throw error;
 const out=$('#user-results');
 out.innerHTML=data.length?data.map(x=>'<div class="item"><div class="min-w-0"><b>'+esc(x.display_name||'عضو')+'</b><p class="muted text-xs">HAMSAT-'+esc(x.public_id)+' · @'+esc(x.handle||'—')+' · '+esc(x.role)+' · '+(x.is_banned?'محظور':'نشط')+'</p></div><button class="ghost text-xs" data-moderate-user="'+esc(x.id)+'" data-banned="'+(x.is_banned?'true':'false')+'">'+(x.is_banned?'فك الحظر':'حظر الحساب')+'</button></div>').join(''):'<p class="muted">لا يوجد أعضاء مطابقون.</p>';
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
 const {data,error}=await supabase.from('rooms').select('id,public_id,title,topic,owner_id,created_at').order('created_at',{ascending:false}).limit(100);if(error)throw error;
 const ids=[...new Set(data.map(x=>x.owner_id))],p=ids.length?await supabase.from('profiles').select('id,display_name,public_id').in('id',ids):{data:[],error:null};if(p.error)throw p.error;
 const byId=Object.fromEntries(p.data.map(x=>[x.id,x]));
 $('#room-list').innerHTML=data.length?data.map(x=>{const owner=byId[x.owner_id]||{};return '<div class="item"><div><b>'+esc(x.title)+'</b><p class="muted text-xs">'+esc('ROOM-'+String(x.public_id).padStart(6,'0'))+' · '+esc(x.topic||'عام')+' · المضيفة: '+esc(owner.display_name||'عضو')+'</p></div><span class="pill">غرفة</span></div>';}).join(''):'<p class="muted">لا توجد غرف.</p>';
}
$('#item-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const id=f.elements.id.value.trim(),item_type=f.elements.item_type.value;const imageFile=f.elements.image.files[0];const imageFolder=item_type==='room_background'?'catalog/room-backgrounds':item_type==='profile_frame'?'catalog/profile-frames':'catalog';const image_url=imageFile?await upload(imageFile,imageFolder,['room_background','profile_frame'].includes(item_type)?id:null):null;const payload={id,name:f.elements.name.value.trim(),item_type,price:Number(f.elements.price.value),duration_days:Number(f.elements.duration_days.value||0),rarity:f.elements.rarity.value,visual_key:f.elements.visual_key.value.trim(),description:f.elements.description.value.trim(),image_url,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('shop_items').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadItems(),loadStats()]);message('تم حفظ العنصر في كتالوج الإدارة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#asset-batch-form').onsubmit=async e=>{
 e.preventDefault();
 const form=e.currentTarget,button=form.querySelector('button[type=submit]'),result=$('#asset-batch-result');
 const files=Array.from(form.elements.assets.files||[]);
 const frameMap={
  '01_royal_crown.png':'profile_orig_01_royal_crown',
  '02_rose_pearl.png':'profile_orig_02_rose_pearl',
  '03_purple_crystal.png':'profile_orig_03_purple_crystal',
  '04_neon_gamer.png':'profile_orig_04_neon_gamer',
  '05_hearts_butterflies.png':'profile_orig_05_hearts_butterflies',
  '06_celestial_moon.png':'profile_orig_06_celestial_moon',
  '07_ice_snowflake.png':'profile_orig_07_ice_snowflake',
  '08_black_gold_royal.png':'profile_orig_08_black_gold_royal',
  '09_kawaii_cat.png':'profile_orig_09_kawaii_cat',
  '01_royal_gold_crown.png':'profile_ref_01_royal_gold_crown',
  '02_pink_roses_pearls.png':'profile_ref_02_pink_roses_pearls',
  '03_purple_crystal_queen.png':'profile_ref_03_purple_crystal_queen',
  '04_neon_gamer_headset.png':'profile_ref_04_neon_gamer_headset',
  '05_pink_hearts_butterflies.png':'profile_ref_05_pink_hearts_butterflies',
  '06_emerald_celestial_moon.png':'profile_ref_06_emerald_celestial_moon',
  '07_ice_blue_snowflakes.png':'profile_ref_07_ice_blue_snowflakes',
  '08_black_gold_rose.png':'profile_ref_08_black_gold_rose',
  '09_purple_cat_bows.png':'profile_ref_09_purple_cat_bows'
 };
 let uploaded=0,skipped=[],failed=[];
 button.disabled=true;
 try{
  for(let index=0;index<files.length;index++){
   const file=files[index],name=file.name.toLowerCase();
   const backgroundId=name.replace(/\\.[^.]+$/,'');
   const id=frameMap[name]||(backgroundId.startsWith('free_')||backgroundId.startsWith('premium_')?backgroundId:null);
   if(!id){skipped.push(file.name);continue;}
   const itemType=id.startsWith('free_')||id.startsWith('premium_')?'room_background':'profile_frame';
   try{
    result.textContent='جارٍ رفع '+(index+1)+' من '+files.length+': '+file.name;
    const {data:item,error:itemError}=await supabase.from('shop_items').select('id,item_type').eq('id',id).maybeSingle();
    if(itemError)throw itemError;
    if(!item||item.item_type!==itemType)throw new Error('عنصر الكتالوج غير موجود أو نوعه لا يطابق الصورة');
    const folder=itemType==='room_background'?'catalog/room-backgrounds':'catalog/profile-frames';
    const imageUrl=await upload(file,folder,id);
    const {error:updateError}=await supabase.from('shop_items').update({image_url:imageUrl}).eq('id',id);
    if(updateError)throw updateError;
    uploaded++;
   }catch(err){failed.push(file.name+': '+(err.message||'فشل الرفع'));}
  }
  await loadItems();
  result.textContent='اكتمل الرفع: '+uploaded+' صورة مرتبطة. '+(skipped.length?'ملفات تم تجاهلها: '+skipped.join('، ')+'. ':'')+(failed.length?'أخطاء: '+failed.join(' | '):'');
  message('تم ربط '+uploaded+' صورة. بقيت العناصر مخفية حتى مراجعتها وتفعيلها.');
 }catch(err){result.textContent=err.message||'تعذر رفع الصور.';message(result.textContent,true);}
 finally{button.disabled=false;}
};
$('#gift-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),price:Number(f.elements.price.value),icon:f.elements.icon.value.trim(),category:f.elements.category.value,description:f.elements.description.value.trim(),image_url:f.elements.image_url.value.trim()||null,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('gifts').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadGifts(),loadStats()]);message('تم حفظ الهدية في الكتالوج.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#bomb-level-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={level:Number(f.elements.level.value),threshold:Number(f.elements.threshold.value),reward_min:Number(f.elements.reward_min.value),reward_max:Number(f.elements.reward_max.value),active:f.elements.active.checked,updated_at:new Date().toISOString()};if(payload.reward_max<payload.reward_min)throw Error('أعلى مكافأة يجب أن تكون أكبر من أو تساوي أقل مكافأة.');const {error}=await supabase.from('room_bomb_levels').upsert(payload,{onConflict:'level'});if(error)throw error;await loadBombLevels();message('تم حفظ إعدادات مستوى القنبلة.');}catch(err){message(err.message,true);}finally{b.disabled=false;}};
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
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));['catalog','gifts','users','rooms','games','bomb','agencies','reports'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==b.dataset.tab));});
$('#refresh-rooms').onclick=()=>loadRooms().catch(e=>message(e.message,true));
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>message(e.message,true));