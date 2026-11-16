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
 await Promise.all([loadStats(),loadItems(),loadGifts(),loadGames(),loadRooms(),loadUsers()]);
}
async function upload(file,folder){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('الصورة يجب أن تكون PNG/JPG/WEBP وأقل من 5MB');
 const {data:{user}}=await supabase.auth.getUser(),ext=file.type.split('/')[1].replace('jpeg','jpg'),path=user.id+'/'+folder+'/'+crypto.randomUUID()+'.'+ext;
 const {data,error}=await supabase.storage.from('hamsat-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
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
 $(root).querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{b.disabled=true;try{const x=data.find(z=>z.id===b.dataset.toggle),table=kind==='gift'?'gifts':'shop_items';const {error}=await supabase.from(table).update({active:!x.active,...(table==='shop_items'?{updated_at:new Date().toISOString()}:{})}).eq('id',x.id);if(error)throw error;await Promise.all([kind==='gift'?loadGifts():loadItems(),loadStats()]);message('تم تحديث حالة العنصر.');}catch(e){message(e.message,true);}finally{b.disabled=false;}});
}
async function loadGames(){
 const {data,error}=await supabase.from('games').select('*').order('sort_order').order('created_at',{ascending:false});if(error)throw error;
 $('#game-list').innerHTML=data.length?data.map(x=>row(x.icon+' '+x.name,x.id+' · '+x.game_type,x.id,x.active,'game')).join(''):'<p class="muted">لا توجد ألعاب مسجلة بعد.</p>';
 bindToggles('#game-list',data,'game');
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
$('#item-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const image_url=await upload(f.elements.image.files[0],'catalog');const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),item_type:f.elements.item_type.value,price:Number(f.elements.price.value),rarity:f.elements.rarity.value,visual_key:f.elements.visual_key.value.trim(),description:f.elements.description.value.trim(),image_url,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('shop_items').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadItems(),loadStats()]);message('تم حفظ العنصر في كتالوج الإدارة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#gift-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),price:Number(f.elements.price.value),icon:f.elements.icon.value.trim(),category:f.elements.category.value,description:f.elements.description.value.trim(),image_url:f.elements.image_url.value.trim()||null,animation_url:f.elements.animation_url.value.trim()||null,active:f.elements.active.checked};const {error}=await supabase.from('gifts').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await Promise.all([loadGifts(),loadStats()]);message('تم حفظ الهدية في الكتالوج.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#user-search').onsubmit=async e=>{e.preventDefault();try{await loadUsers(e.currentTarget.elements.term.value);}catch(err){$('#user-results').innerHTML='<p class="text-red-300">'+esc(err.message)+'</p>';}};
$('#game-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{let config;try{config=JSON.parse(f.elements.config.value||'{}');}catch{throw Error('إعدادات JSON غير صحيحة');}const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),game_type:f.elements.game_type.value,icon:f.elements.icon.value||'🎮',description:f.elements.description.value.trim(),config,active:f.elements.active.checked};const {error}=await supabase.from('games').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();f.elements.config.value='{}';await loadGames();message('تم حفظ اللعبة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));['catalog','gifts','users','rooms','games'].forEach(id=>$('#'+id).classList.toggle('hidden',id!==b.dataset.tab));});
$('#refresh-rooms').onclick=()=>loadRooms().catch(e=>message(e.message,true));
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>message(e.message,true));