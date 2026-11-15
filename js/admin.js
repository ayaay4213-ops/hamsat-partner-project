import { supabase } from './supabase-auth.js';
const $=s=>document.querySelector(s), notice=$('#notice'), admin=$('#admin');
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
function message(s,bad=false){notice.textContent=s;notice.style.borderColor=bad?'#a33':'#39734a';}
async function boot(){
 if(!supabase){message('إعداد Supabase غير مكتمل.',true);return;}
 const {data:{session},error}=await supabase.auth.getSession();
 if(error||!session){message('سجّلي الدخول أولاً من تطبيق همسات، ثم افتحي لوحة الإدارة في نفس المتصفح.',true);return;}
 const {data:profile,error:e}=await supabase.from('profiles').select('role').eq('id',session.user.id).single();
 if(e){message('تعذّر التحقق من صلاحية الإدارة. يلزم تطبيق ترحيل لوحة الإدارة في Supabase.',true);return;}
 if(profile?.role!=='admin'){message('هذا الحساب ليس لديه صلاحية مدير. الدخول محمي ولن تُعرض أدوات الإدارة.',true);return;}
 admin.classList.remove('hidden');message('تم التحقق من صلاحية المدير.');await Promise.all([loadFrames(),loadGames()]);
}
async function upload(file,folder){
 if(!file)return null;
 if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>5*1024*1024)throw Error('الصورة يجب أن تكون PNG/JPG/WEBP وأقل من 5MB');
 const {data:{user}}=await supabase.auth.getUser(),ext=file.type.split('/')[1].replace('jpeg','jpg'),path=user.id+'/'+folder+'/'+crypto.randomUUID()+'.'+ext;
 const {data,error}=await supabase.storage.from('hamsat-media').upload(path,file,{upsert:false,contentType:file.type});if(error)throw error;
 return supabase.storage.from('hamsat-media').getPublicUrl(data.path).data.publicUrl;
}
function row(title,sub,id,active){return '<div class="item"><div class="min-w-0"><b>'+esc(title)+'</b><p class="muted text-xs">'+esc(sub)+' · '+(active?'منشور':'مخفي')+'</p></div><button class="ghost text-sm" data-toggle="'+esc(id)+'">'+(active?'إخفاء':'نشر')+'</button></div>'}
async function loadFrames(){
 const {data,error}=await supabase.from('shop_items').select('*').eq('item_type','frame').order('price');if(error)throw error;
 $('#frame-list').innerHTML=data.length?data.map(x=>row(x.name,x.id+' · '+x.price+' عملة',x.id,x.active)).join(''):'<p class="muted">لا توجد إطارات بعد.</p>';
 $('#frame-list').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const x=data.find(z=>z.id===b.dataset.toggle);const {error}=await supabase.from('shop_items').update({active:!x.active,updated_at:new Date().toISOString()}).eq('id',x.id);if(error)alert(error.message);else await loadFrames();});
}
async function loadGames(){
 const {data,error}=await supabase.from('games').select('*').order('sort_order').order('created_at',{ascending:false});if(error)throw error;
 $('#game-list').innerHTML=data.length?data.map(x=>row(x.icon+' '+x.name,x.id+' · '+x.game_type,x.id,x.active)).join(''):'<p class="muted">لا توجد ألعاب مسجلة بعد.</p>';
 $('#game-list').querySelectorAll('[data-toggle]').forEach(b=>b.onclick=async()=>{const x=data.find(z=>z.id===b.dataset.toggle);const {error}=await supabase.from('games').update({active:!x.active,updated_at:new Date().toISOString()}).eq('id',x.id);if(error)alert(error.message);else await loadGames();});
}
$('#frame-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{const image_url=await upload(f.elements.image.files[0],'frames');const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),item_type:'frame',price:Number(f.elements.price.value),rarity:f.elements.rarity.value,visual_key:f.elements.id.value.trim(),description:f.elements.description.value.trim(),image_url,active:f.elements.active.checked};const {error}=await supabase.from('shop_items').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();await loadFrames();message('تم حفظ الإطار.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
$('#game-form').onsubmit=async e=>{e.preventDefault();const f=e.currentTarget,b=f.querySelector('button[type=submit]');b.disabled=true;try{let config;try{config=JSON.parse(f.elements.config.value||'{}');}catch{throw Error('إعدادات JSON غير صحيحة');}const payload={id:f.elements.id.value.trim(),name:f.elements.name.value.trim(),game_type:f.elements.game_type.value,icon:f.elements.icon.value||'🎮',description:f.elements.description.value.trim(),config,active:f.elements.active.checked};const {error}=await supabase.from('games').upsert(payload,{onConflict:'id'});if(error)throw error;f.reset();f.elements.config.value='{}';await loadGames();message('تم حفظ اللعبة.');}catch(e){message(e.message,true);}finally{b.disabled=false;}};
document.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('active',x===b));$('#frames').classList.toggle('hidden',b.dataset.tab!=='frames');$('#games').classList.toggle('hidden',b.dataset.tab!=='games');});
$('#logout').onclick=async()=>{await supabase?.auth.signOut();location.href='./';};
boot().catch(e=>message(e.message,true));
