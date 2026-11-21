import { supabase } from './supabase-auth.js';

function client() {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل. تحققي من ملف supabase/config.js.');
  return supabase;
}
function fail(error) { if (error) throw new Error(error.message || 'حدث خطأ في الاتصال بقاعدة البيانات'); }
// Email addresses must never be used as public HAMSAT handles.
function isEmailLikeHandle(value) {
  const handle=String(value||'').trim();
  return /@/.test(handle) || /(?:gmail|yahoo|hotmail|outlook|icloud)\.com$/i.test(handle);
}
function safePublicHandle(value, publicId='') {
  const handle=String(value||'').trim().toLowerCase();
  if(!handle || isEmailLikeHandle(handle)) return publicId ? 'member'+String(publicId) : '';
  return handle;
}

// Return auth callbacks to the exact origin currently hosting HAMSAT.
// Supabase Auth must allow the production and preview origins in its Redirect URLs list.
const AUTH_REDIRECT_URL = new URL('/', window.location.href).toString();
// Explicit allowlist for profile data used by app screens. Never fetch auth email,
// phone numbers, or future private columns through public/social profile queries.
const PROFILE_COLUMNS = 'id,public_id,handle,display_name,bio,country,age,gender,role,vip_level,wealth_level,charisma_level,color,avatar_url,cover_url,background_url,equipped_frame_id,equipped_emoji_pack_id,equipped_entrance_id,equipped_bubble_id,equipped_special_id,equipped_profile_frame_id,equipped_sound_frame_id,equipped_voice_wave_id,created_at';

function mapProfile(p) {
  if (!p) return null;
  return {
    uuid: p.id, publicId: p.public_id == null ? '' : 'HAMSAT-' + String(p.public_id).padStart(6, '0'), handle: safePublicHandle(p.handle,p.public_id), displayName: p.display_name || 'عضو جديد',
    bio: p.bio || '', country: p.country || '', age: p.age == null ? null : Number(p.age), gender: p.gender || '', role: p.role || 'user', vipLevel: Number(p.vip_level || 0), wealthLevel: Number(p.wealth_level || 1), charismaLevel: Number(p.charisma_level || 1), color: p.color || '#7c3aed',
    avatarUrl: p.avatar_url || null, coverUrl: p.cover_url || null, backgroundUrl: p.background_url || null, equippedFrameId: p.equipped_frame_id || null, equippedEmojiPackId: p.equipped_emoji_pack_id || null, equippedEntranceId: p.equipped_entrance_id || null, equippedBubbleId: p.equipped_bubble_id || null, equippedSpecialId: p.equipped_special_id || null, equippedProfileFrameId: p.equipped_profile_frame_id || null, equippedSoundFrameId: p.equipped_sound_frame_id || null, equippedVoiceWaveId: p.equipped_voice_wave_id || null, createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now()
  };
}
async function mapProfilesWithFrames(rows) {
  const mapped=(rows||[]).map(mapProfile);
  const ids=[...new Set(mapped.map(p=>p?.equippedProfileFrameId).filter(Boolean))];
  if(!ids.length)return mapped;
  const {data,error}=await client().from('shop_items').select('id,image_url').in('id',ids).eq('item_type','profile_frame').eq('active',true);
  fail(error);
  const urls=Object.fromEntries((data||[]).map(x=>[x.id,x.image_url]));
  return mapped.map(p=>({...p,equippedProfileFrameUrl:urls[p.equippedProfileFrameId]||null}));
}
async function mapProfileWithFrame(row) {
  return (await mapProfilesWithFrames(row?[row]:[]))[0]||null;
}
function mapWallet(w, tx = []) {
  const next = w?.daily_claimed_at ? new Date(new Date(w.daily_claimed_at).getTime() + 86400000).getTime() : null;
  return {
    balance: Number(w?.balance || 0), dailyReward: 20, nextDailyAt: next,
    transactions: tx.map(t => ({
      amount: Math.abs(Number(t.amount)), type: Number(t.amount) >= 0 ? 'credit' : 'debit',
      label: t.label, at: new Date(t.created_at).getTime()
    }))
  };
}
async function currentUser() {
  const { data, error } = await client().auth.getUser();
  fail(error);
  if (!data.user) throw new Error('يرجى تسجيل الدخول أولًا');
  return data.user;
}

export const api = {
  getSession: async () => {
    const { data, error } = await client().auth.getSession(); fail(error); return data.session;
  },
  // The database is the authority: never infer Super Admin access from editable profile fields.
  isAdmin: async () => {
    const { data, error } = await client().rpc('is_admin');
    if (error) return false;
    return data === true;
  },
  onAuthStateChange: (callback) => client().auth.onAuthStateChange(callback),
  signInWithEmail: async (email, password) => {
    const { data, error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    fail(error); return data;
  },
  sendPhoneOtp: async (phone) => {
    const normalized=String(phone||'').trim();
    if(!/^\+[1-9]\d{7,14}$/.test(normalized))throw new Error('اكتبي الرقم بالصيغة الدولية مثل +213XXXXXXXXX');
    const {data,error}=await client().auth.signInWithOtp({phone:normalized,options:{shouldCreateUser:true}});
    fail(error);return data;
  },
  verifyPhoneOtp: async (phone,token) => {
    const normalized=String(phone||'').trim(),code=String(token||'').trim();
    if(!/^\+[1-9]\d{7,14}$/.test(normalized)||!/^\d{6}$/.test(code))throw new Error('تحققي من رقم الهاتف ورمز التحقق المكوّن من 6 أرقام.');
    const {data,error}=await client().auth.verifyOtp({phone:normalized,token:code,type:'sms'});
    fail(error);return data;
  },
  requestPhoneLink: async (phone) => {
    const normalized=String(phone||'').trim();
    if(!/^\+[1-9]\d{7,14}$/.test(normalized))throw new Error('اكتبي الرقم بالصيغة الدولية مثل +213XXXXXXXXX');
    await currentUser();
    const {data,error}=await client().auth.updateUser({phone:normalized});
    fail(error);return data;
  },
  verifyPhoneLink: async (phone,token) => {
    const normalized=String(phone||'').trim(),code=String(token||'').trim();
    if(!/^\+[1-9]\d{7,14}$/.test(normalized)||!/^\d{6}$/.test(code))throw new Error('تحققي من رقم الهاتف ورمز التحقق المكوّن من 6 أرقام.');
    const {data,error}=await client().auth.verifyOtp({phone:normalized,token:code,type:'phone_change'});
    fail(error);return data;
  },
  sendPasswordReset: async (email) => {
    const { data, error } = await client().auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: AUTH_REDIRECT_URL
    });
    fail(error); return data;
  },
  updatePassword: async (password) => {
    const { data, error } = await client().auth.updateUser({ password });
    fail(error); return data;
  },
  signUpWithEmail: async (email, password) => {
    const { data, error } = await client().auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: { emailRedirectTo: AUTH_REDIRECT_URL }
    });
    fail(error); return data;
  },
  signOut: async () => { const { error } = await client().auth.signOut(); fail(error); },
  uploadMedia: async (file, folder) => {
    const user=await currentUser();
    if(!file)throw new Error('اختاري صورة أولاً');
    const ext=(file.name?.split('.').pop()||'').toLowerCase();
    const mime=(file.type||'').toLowerCase();
    const allowedExt=['jpg','jpeg','png','webp'];
    const allowedMime=['image/jpeg','image/jpg','image/pjpeg','image/png','image/webp'];
    if(!allowedExt.includes(ext)&&!allowedMime.includes(mime))throw new Error('الصيغ المدعومة هي JPG وPNG وWEBP فقط');
    if(file.size>5*1024*1024)throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت');
    const normalizedExt=allowedExt.includes(ext)?(ext==='jpeg'?'jpg':ext):(mime.includes('png')?'png':mime.includes('webp')?'webp':'jpg');
    const contentType=normalizedExt==='png'?'image/png':normalizedExt==='webp'?'image/webp':'image/jpeg';
    const path=user.id+'/'+folder+'/'+Date.now()+'.'+normalizedExt;
    const {data,error}=await client().storage.from('hamsat-media').upload(path,file,{upsert:true,contentType});fail(error);
    const {data:publicData}=client().storage.from('hamsat-media').getPublicUrl(data.path);
    return {url:publicData.publicUrl,path:data.path};
  },
  me: async () => {
    const { error: expiryError } = await client().rpc('refresh_cosmetic_expirations');
    if (expiryError && !/Could not find the function|does not exist/i.test(expiryError.message || '')) fail(expiryError);
    const user = await currentUser();
    const [pr, wr] = await Promise.all([
      client().from('profiles').select(PROFILE_COLUMNS).eq('id', user.id).maybeSingle(),
      client().from('wallets').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    fail(pr.error); fail(wr.error);
    if (!wr.data) throw new Error('لم تُنشأ محفظة الحساب بعد. راجعي إعداد trigger في Supabase.');
    return { account: { id: user.id, username: safePublicHandle(pr.data?.handle || user.user_metadata?.username,pr.data?.public_id) || 'عضو' },
      profile: await mapProfileWithFrame(pr.data), wallet: mapWallet(wr.data) };
  },
  saveProfile: async (p) => {
    const user = await currentUser();
    const requestedHandle=String(p.handle || '').trim().toLowerCase();
    if(isEmailLikeHandle(requestedHandle)) throw new Error('لا تستخدمي بريدك الإلكتروني كاسم عام. اختاري اسم مستخدم لا يكشف بياناتك.');
    const payload = {
      id: user.id, handle: requestedHandle,
      display_name: String(p.displayName || '').trim(), bio: String(p.bio || ''),
      country: String(p.country || ''), age: p.age ? Number(p.age) : null, gender: p.gender || null, color: String(p.color || '#7c3aed'),
      avatar_url: p.avatarUrl || null, cover_url: p.coverUrl || null, background_url: p.backgroundUrl || null
    };
    const { data, error } = await client().from('profiles').upsert(payload, { onConflict: 'id' }).select(PROFILE_COLUMNS).single();
    fail(error);
    const { data: wallet, error: walletError } = await client().from('wallets').select('*').eq('user_id', user.id).single();
    fail(walletError);
    return { profile: await mapProfileWithFrame(data), wallet: mapWallet(wallet) };
  },
  users: async () => {
    const { data, error, count } = await client().from('profiles').select(PROFILE_COLUMNS, { count: 'exact' }).order('created_at', { ascending: false }).limit(100);
    fail(error);
    return { total: count ?? data.length, users: await mapProfilesWithFrames(data) };
  },
  user: async (identifier) => {
    const value=String(identifier||'').trim();
    const publicMatch=value.toUpperCase().match(/^HAMSAT-?0*(\d+)$/)||value.match(/^\d+$/);
    const query=client().from('profiles').select(PROFILE_COLUMNS);
    const publicId=publicMatch?Number(publicMatch[1]||publicMatch[0]):null;
    const {data,error}=publicId!==null?await query.eq('public_id',publicId).single():await query.eq('handle',value.toLowerCase()).single();
    fail(error); return {profile:await mapProfileWithFrame(data)};
  },
  searchUsers: async (term) => {
    const q=String(term||'').trim().replace(/[,%()]/g,'');
    if(q.length<2) return {users:[]};
    const user=await currentUser();
    const idText=q.toUpperCase().replace(/^HAMSAT-?/, '').replace(/^#/, '');
    const isPublicId=/^\d+$/.test(idText);
    const requests=[client().from('profiles').select(PROFILE_COLUMNS).or('handle.ilike.%'+q+'%,display_name.ilike.%'+q+'%').neq('id',user.id).limit(30)];
    if(isPublicId) requests.push(client().from('profiles').select(PROFILE_COLUMNS).eq('public_id',Number(idText)).neq('id',user.id).limit(1));
    const results=await Promise.all(requests);
    for(const result of results) fail(result.error);
    const byId=new Map();
    for(const result of results) for(const profile of (result.data||[])) byId.set(profile.id,profile);
    return {users:(await mapProfilesWithFrames([...byId.values()])).slice(0,30)};
  },
  profileStats: async (profileId, recordVisit = false) => {
    if (recordVisit) {
      const visit = await client().rpc('record_profile_visit', { p_profile_id: profileId });
      fail(visit.error);
    }
    const { data, error } = await client().rpc('get_profile_stats', { p_profile_id: profileId });
    fail(error);
    return data || { friends: 0, followers: 0, following: 0, visitors: 0, giftsReceived: 0 };
  },
  profileRewards: async (profileId) => {
    const [progress,badges,inventory]=await Promise.all([
      client().from('user_progress').select('xp,level').eq('user_id',profileId).maybeSingle(),
      client().from('user_badges').select('earned_at,badge:badge_catalog(id,name,description,icon,rarity)').eq('user_id',profileId).order('earned_at',{ascending:false}),
      client().from('user_inventory').select('item_id,purchased_at,item:shop_items(id,name,item_type,rarity,visual_key,image_url,animation_url)').eq('user_id',profileId).order('purchased_at',{ascending:false}).limit(30)
    ]);
    fail(progress.error);fail(badges.error);fail(inventory.error);
    return {
      progress:progress.data||{xp:0,level:1},
      badges:(badges.data||[]).map(x=>({...x.badge,earnedAt:x.earned_at})).filter(x=>x.id),
      items:(inventory.data||[]).map(x=>({...x.item,purchasedAt:x.purchased_at})).filter(x=>x.id)
    };
  },
  momentsFeed: async () => {
    const user=await currentUser();
    const {data,error}=await client().from('moments').select('id,user_id,body,image_url,location,created_at').order('created_at',{ascending:false}).limit(100);fail(error);
    const rows=data||[];if(!rows.length)return {moments:[]};
    const ids=rows.map(x=>x.id),userIds=[...new Set(rows.map(x=>x.user_id))];
    const [people,likes,comments]=await Promise.all([
      client().from('profiles').select(PROFILE_COLUMNS).in('id',userIds),
      client().from('moment_likes').select('moment_id,user_id').in('moment_id',ids),
      client().from('moment_comments').select('id,moment_id,user_id,body,created_at').in('moment_id',ids).order('created_at',{ascending:true})
    ]);
    fail(people.error);fail(likes.error);fail(comments.error);
    const mapped=await mapProfilesWithFrames(people.data||[]),byUser=Object.fromEntries(mapped.map(p=>[p.uuid,p]));
    const commentUserIds=[...new Set((comments.data||[]).map(x=>x.user_id))];
    const commentPeople=commentUserIds.length?await client().from('profiles').select(PROFILE_COLUMNS).in('id',commentUserIds):{data:[],error:null};fail(commentPeople.error);
    const commentProfiles=await mapProfilesWithFrames(commentPeople.data||[]),commentByUser=Object.fromEntries(commentProfiles.map(p=>[p.uuid,p]));
    const likeRows=likes.data||[],commentRows=comments.data||[];
    return {moments:rows.map(m=>({...m,profile:byUser[m.user_id]||null,likesCount:likeRows.filter(x=>x.moment_id===m.id).length,likedByMe:likeRows.some(x=>x.moment_id===m.id&&x.user_id===user.id),comments:commentRows.filter(x=>x.moment_id===m.id).map(c=>({...c,profile:commentByUser[c.user_id]||null}))}))};
  },
  moments: async (profileId) => {
    const user=await currentUser();
    const {data,error}=await client().from('moments').select('id,user_id,body,image_url,location,created_at').eq('user_id',profileId).order('created_at',{ascending:false}).limit(30);fail(error);
    const ids=(data||[]).map(x=>x.id);if(!ids.length)return {moments:[]};
    const [likes,comments]=await Promise.all([
      client().from('moment_likes').select('moment_id,user_id').in('moment_id',ids),
      client().from('moment_comments').select('id,moment_id,user_id,body,created_at').in('moment_id',ids).order('created_at',{ascending:true})
    ]);fail(likes.error);fail(comments.error);
    const userIds=[...new Set((comments.data||[]).map(x=>x.user_id))];
    const people=userIds.length?await client().from('profiles').select('id,display_name,handle,avatar_url').in('id',userIds):{data:[],error:null};fail(people.error);
    const byUser=Object.fromEntries((people.data||[]).map(x=>[x.id,x]));
    const likeRows=likes.data||[],commentRows=comments.data||[];
    return {moments:data.map(m=>({...m,likesCount:likeRows.filter(x=>x.moment_id===m.id).length,likedByMe:likeRows.some(x=>x.moment_id===m.id&&x.user_id===user.id),comments:commentRows.filter(x=>x.moment_id===m.id).map(c=>({...c,profile:byUser[c.user_id]||null}))}))};
  },
  toggleMomentLike: async (momentId,liked) => {
    const user=await currentUser();
    if(liked){const {error}=await client().from('moment_likes').delete().eq('moment_id',momentId).eq('user_id',user.id);fail(error);}
    else{const {error}=await client().from('moment_likes').insert({moment_id:momentId,user_id:user.id});if(error&&error.code!=='23505')fail(error);}
  },
  addMomentComment: async (momentId,body) => {
    const user=await currentUser(),text=String(body||'').trim();
    if(!text||text.length>500)throw new Error('اكتبي تعليقاً من 1 إلى 500 حرف.');
    const {data,error}=await client().from('moment_comments').insert({moment_id:momentId,user_id:user.id,body:text}).select('id,moment_id,user_id,body,created_at').single();fail(error);return data;
  },
  createMoment: async (body,imageUrl=null,location=null) => { const user=await currentUser();const text=String(body||'').trim(),place=String(location||'').trim().slice(0,120);if(!text&&!imageUrl)throw new Error('أضيفي نصاً أو صورة قبل النشر.');const {data,error}=await client().from('moments').insert({user_id:user.id,body:text,image_url:imageUrl,location:place||null}).select('id,user_id,body,image_url,location,created_at').single();fail(error);return data; },
  deleteMoment: async (momentId) => { const user=await currentUser();const {error}=await client().from('moments').delete().eq('id',momentId).eq('user_id',user.id);fail(error); },
  coupleSpace: async (profileId) => { const {data,error}=await client().from('couple_spaces').select('*').or('owner_id.eq.'+profileId+',partner_id.eq.'+profileId).in('status',['pending','active']).order('created_at',{ascending:false}).limit(1).maybeSingle();fail(error);if(!data)return {space:null,partner:null};const partnerId=data.owner_id===profileId?data.partner_id:data.owner_id;const {data:partner,error:pe}=await client().from('profiles').select(PROFILE_COLUMNS).eq('id',partnerId).maybeSingle();fail(pe);return {space:data,partner:await mapProfileWithFrame(partner)}; },
  inviteCouple: async (partnerId) => { const user=await currentUser();const {data,error}=await client().from('couple_spaces').insert({owner_id:user.id,partner_id:partnerId,status:'pending'}).select('*').single();fail(error);return data; },
  respondCoupleSpace: async (spaceId,accept) => { const {error}=await client().from('couple_spaces').update({status:accept?'active':'rejected',updated_at:new Date().toISOString()}).eq('id',spaceId);fail(error); },
  endCoupleSpace: async (spaceId) => { const {error}=await client().from('couple_spaces').update({status:'ended',updated_at:new Date().toISOString()}).eq('id',spaceId);fail(error); },
  friends: async () => {
    const user=await currentUser();
    const {data,error}=await client().from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('status','accepted').or('sender_id.eq.'+user.id+',receiver_id.eq.'+user.id).order('created_at',{ascending:false});
    fail(error);
    const ids=[...new Set((data||[]).map(x=>x.sender_id===user.id?x.receiver_id:x.sender_id))];
    if(!ids.length)return {friends:[]};
    const res=await client().from('profiles').select(PROFILE_COLUMNS).in('id',ids);fail(res.error);
    const mapped=await mapProfilesWithFrames(res.data);const byId=Object.fromEntries(mapped.map(p=>[p.uuid,p]));
    return {friends:ids.map(id=>byId[id]).filter(Boolean)};
  },
  friendRequests: async () => {
    const user=await currentUser();
    const {data,error}=await client().from('friend_requests').select('id,sender_id,receiver_id,created_at').eq('status','pending').or('sender_id.eq.'+user.id+',receiver_id.eq.'+user.id).order('created_at',{ascending:false});
    fail(error);
    const ids=[...new Set((data||[]).map(x=>x.sender_id===user.id?x.receiver_id:x.sender_id))];
    const res=ids.length?await client().from('profiles').select(PROFILE_COLUMNS).in('id',ids):{data:[],error:null};fail(res.error);
    const mapped=await mapProfilesWithFrames(res.data);const byId=Object.fromEntries(mapped.map(p=>[p.uuid,p]));
    return {incoming:data.filter(x=>x.receiver_id===user.id).map(x=>({id:x.id,user:byId[x.sender_id]})).filter(x=>x.user),
      outgoing:data.filter(x=>x.sender_id===user.id).map(x=>({id:x.id,user:byId[x.receiver_id]})).filter(x=>x.user)};
  },
  friendState: async (otherId) => {
    const user=await currentUser();
    const [fr,fo]=await Promise.all([
      client().from('friend_requests').select('id,sender_id,receiver_id,status').or('and(sender_id.eq.'+user.id+',receiver_id.eq.'+otherId+'),and(sender_id.eq.'+otherId+',receiver_id.eq.'+user.id+')').maybeSingle(),
      client().from('user_follows').select('follower_id').eq('follower_id',user.id).eq('followed_id',otherId).maybeSingle()
    ]);
    fail(fr.error);fail(fo.error);
    return {request:fr.data||null,following:!!fo.data};
  },
  sendFriendRequest: async (otherId) => {
    const user=await currentUser();
    const {data,error}=await client().from('friend_requests').insert({sender_id:user.id,receiver_id:otherId}).select('id').single();
    fail(error);return data;
  },
  respondFriendRequest: async (requestId,accept) => {
    const {error}=await client().from('friend_requests').update({status:accept?'accepted':'rejected',responded_at:new Date().toISOString()}).eq('id',requestId);
    fail(error);return {success:true};
  },
  followUser: async (otherId) => {
    const user=await currentUser();
    const {error}=await client().from('user_follows').insert({follower_id:user.id,followed_id:otherId});
    if(error&&error.code!=='23505')fail(error);return {success:true};
  },
  unfollowUser: async (otherId) => {
    const user=await currentUser();
    const {error}=await client().from('user_follows').delete().eq('follower_id',user.id).eq('followed_id',otherId);
    fail(error);return {success:true};
  },
  wallet: async () => {
    const user = await currentUser();
    const [wr, tr] = await Promise.all([
      client().from('wallets').select('*').eq('user_id', user.id).single(),
      client().from('wallet_transactions').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(50)
    ]);
    fail(wr.error); fail(tr.error);
    return { wallet: mapWallet(wr.data, tr.data) };
  },
  claimDaily: async () => {
    const { error } = await client().rpc('claim_daily_reward'); fail(error);
    return api.wallet();
  },
  roomById: async (roomId) => {
    const {data,error}=await client().from('rooms').select('*').eq('id',roomId).single();fail(error);
    const {data:p,error:pe}=await client().from('profiles').select(PROFILE_COLUMNS).eq('id',data.owner_id).single();fail(pe);
    const owner=await mapProfileWithFrame(p);
    return {room:{id:data.id,publicId:'ROOM-'+String(data.public_id).padStart(6,'0'),seatLimit:data.seat_limit||8,ownerUuid:data.owner_id,title:data.title,topic:data.topic,description:data.description,coverUrl:data.cover_url||null,backgroundItemId:data.background_item_id||null,roomEmoji:data.room_emoji||'🎙️',createdAt:new Date(data.created_at).getTime(),ownerName:owner.displayName||'عضو',ownerHandle:owner.handle||'',ownerColor:owner.color||'#C9A64B'}};
  },
  rooms: async () => {
    // Load every public room in pages instead of silently stopping at the first 100.
    const data = [];
    const pageSize = 500;
    for (let from = 0; ; from += pageSize) {
      const { data: page, error } = await client().from('rooms').select('*')
        .order('created_at', { ascending: false }).range(from, from + pageSize - 1);
      fail(error);
      data.push(...(page || []));
      if (!page || page.length < pageSize) break;
    }
    const ids = [...new Set(data.map(r => r.owner_id))];
    let owners = [];
    if (ids.length) {
      const res = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
      fail(res.error); owners = res.data;
    }
    const mappedOwners=await mapProfilesWithFrames(owners);const byId = Object.fromEntries(mappedOwners.map(p => [p.uuid,p]));
    return { rooms: data.map(r => {
      const p = byId[r.owner_id] || {};
      return { id: r.id, publicId: 'ROOM-' + String(r.public_id).padStart(6,'0'), seatLimit: r.seat_limit || 8, seatLayout: r.seat_layout || 'grid', ownerUuid: r.owner_id, title: r.title, topic: r.topic,
        description: r.description, coverUrl: r.cover_url || null, backgroundItemId: r.background_item_id || null, roomEmoji: r.room_emoji || '🎙️', createdAt: new Date(r.created_at).getTime(),
        ownerName: p.displayName || 'عضو', ownerHandle: p.handle || '',
        ownerColor: p.color || '#7c3aed' };
    }) };
  },
  createRoom: async (r) => {
    const user = await currentUser();
    const { data: existingRooms, error: existingError } = await client().from('rooms').select('id').eq('owner_id', user.id).limit(1);
    fail(existingError);
    if (existingRooms?.length) throw new Error('يمكن لكل عضو إنشاء غرفة واحدة فقط. يمكنك إدارة غرفتك الحالية بدلاً من إنشاء غرفة ثانية.');
    const { data, error } = await client().rpc('create_owned_room', {
      p_title: String(r.title || '').trim(),
      p_topic: r.topic || 'عام',
      p_description: r.description || '',
      p_cover_url: r.coverUrl || null
    });
    fail(error);
    return data;
  },
  roomBackground: async (roomId) => {
    const {data,error}=await client().from('room_backgrounds').select('image_url,updated_at').eq('room_id',roomId).maybeSingle();
    fail(error);return {imageUrl:data?.image_url||null,updatedAt:data?.updated_at||null};
  },
  saveRoomBackground: async (roomId,imageUrl) => {
    const user=await currentUser();
    if(imageUrl && (!/^https:\/\//i.test(String(imageUrl)) || String(imageUrl).length>2048))throw new Error('رابط خلفية الغرفة غير صالح.');
    const {error}=await client().from('room_backgrounds').upsert({room_id:roomId,image_url:imageUrl||null,updated_by:user.id,updated_at:new Date().toISOString()},{onConflict:'room_id'});
    fail(error);return {imageUrl:imageUrl||null};
  },
  updateRoomSettings: async (roomId, settings) => {
    const user = await currentUser();
    const payload = {
      title: String(settings.title || '').trim().slice(0, 60),
      topic: String(settings.topic || 'عام').trim().slice(0, 40),
      description: String(settings.description || '').trim().slice(0, 240),
      cover_url: settings.coverUrl || null,
      background_item_id: settings.backgroundItemId || null,
      room_emoji: String(settings.roomEmoji || '🎙️').slice(0, 8),
      seat_limit: [4,6,8,10,12,16].includes(Number(settings.seatLimit)) ? Number(settings.seatLimit) : 8,
      seat_layout: ['grid','one-top','two-top'].includes(settings.seatLayout) ? settings.seatLayout : 'grid'
    };
    if (!payload.title) throw new Error('اسم الغرفة مطلوب');
    const { data, error } = await client().from('rooms').update(payload).eq('id', roomId).eq('owner_id', user.id).select('id,title,topic,description,cover_url,background_item_id,room_emoji,seat_limit,seat_layout').single();
    fail(error); return { title: data.title, topic: data.topic, description: data.description, coverUrl: data.cover_url, backgroundItemId: data.background_item_id || null, roomEmoji: data.room_emoji, seatLimit: data.seat_limit, seatLayout: data.seat_layout || 'grid' };
  },

  leaveRoom: async (roomId) => {
    const user = await currentUser();
    // Free the speaker seat as well as the room membership so abandoned rooms
    // never keep a microphone seat locked for a user who has already left.
    await api.leaveRoomSeat(roomId);
    const { error } = await client().from('room_members').delete().eq('room_id', roomId).eq('user_id', user.id);
    fail(error); return { success: true };
  },
  joinRoom: async (roomId) => {
    const user = await currentUser();
    const { error } = await client().from('room_members').insert({ room_id: roomId, user_id: user.id });
    if (error && error.code !== '23505') fail(error);
    return api.roomMembers(roomId);
  },
  roomMembers: async (roomId) => {
    const { data, error } = await client().from('room_members').select('user_id,joined_at').eq('room_id', roomId).order('joined_at', { ascending: true });
    fail(error);
    const ids = [...new Set(data.map(x => x.user_id))];
    if (!ids.length) return { members: [] };
    const res = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
    fail(res.error);
    const mapped=await mapProfilesWithFrames(res.data);const byId = Object.fromEntries(mapped.map(p => [p.uuid,p]));
    return { members: data.map(x => ({ ...byId[x.user_id], userId: x.user_id, joinedAt: new Date(x.joined_at).getTime() })).filter(x => x.displayName) };
  },
  roomSeats: async (roomId) => {
    const {data,error}=await client().from('room_seats').select('seat_no,user_id,seated_at').eq('room_id',roomId).order('seat_no');
    fail(error);
    const ids=[...new Set(data.map(x=>x.user_id))];
    if(!ids.length)return {seats:data};
    const res=await client().from('profiles').select(PROFILE_COLUMNS).in('id',ids);fail(res.error);
    const mapped=await mapProfilesWithFrames(res.data);const byId=Object.fromEntries(mapped.map(p=>[p.uuid,p]));
    return {seats:data.map(x=>({...x,member:byId[x.user_id]||null}))};
  },
  requestRoomSeat: async (roomId,seatNo) => {
    const {data,error}=await client().rpc('request_room_seat',{p_room_id:roomId,p_seat_no:seatNo});
    fail(error);return data;
  },
  leaveRoomSeat: async (roomId) => {
    const {data,error}=await client().rpc('leave_room_seat',{p_room_id:roomId});
    fail(error);return data;
  },
  roomMutedUsers: async (roomId) => {
    const {data,error}=await client().from('room_participant_mutes').select('user_id').eq('room_id',roomId).eq('muted',true);
    fail(error);return {userIds:(data||[]).map(x=>x.user_id)};
  },
  setRoomParticipantMuteState: async (roomId,userId,muted) => {
    if(muted){
      const {error}=await client().from('room_participant_mutes').upsert({room_id:roomId,user_id:userId,muted:true,updated_at:new Date().toISOString()},{onConflict:'room_id,user_id'});
      fail(error);
    }else{
      const {error}=await client().from('room_participant_mutes').delete().eq('room_id',roomId).eq('user_id',userId);
      fail(error);
    }
    return {success:true};
  },
  moderateRoomParticipant: async (roomId,userId,muted) => {
    const {data,error}=await client().functions.invoke('livekit-moderate',{body:{room_id:roomId,participant_id:userId,muted:Boolean(muted)}});
    fail(error);if(data?.error)throw new Error(data.error);return data;
  },
  hostRemoveRoomSeat: async (roomId,userId) => {
    const {data,error}=await client().rpc('host_remove_room_seat',{p_room_id:roomId,p_target_user:userId});
    fail(error);return data;
  },
  kickRoomParticipant: async (roomId,userId) => {
    const {data,error}=await client().functions.invoke('livekit-kick',{body:{room_id:roomId,participant_id:userId}});
    fail(error);if(data?.error)throw new Error(data.error);return data;
  },
  roomMessages: async (roomId, since = null) => {
    let query = client().from('room_messages').select('id,user_id,body,created_at').eq('room_id', roomId);
    if (since) query = query.gte('created_at', new Date(since).toISOString());
    const { data, error } = await query.order('created_at', { ascending: true }).limit(100);
    fail(error);
    const ids = [...new Set(data.map(x => x.user_id))];
    let profiles = [];
    if (ids.length) {
      const res = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
      fail(res.error); profiles = res.data;
    }
    const mapped=await mapProfilesWithFrames(profiles);const byId = Object.fromEntries(mapped.map(p => [p.uuid,p]));
    return { messages: data.map(x => ({ id: x.id, body: x.body, userId: x.user_id,
      displayName: byId[x.user_id]?.displayName || 'عضو',
      color: byId[x.user_id]?.color || '#7c3aed',
      createdAt: new Date(x.created_at).getTime() })) };
  },
  sendRoomMessage: async (roomId, body) => {
    const user = await currentUser();
    const text = String(body || '').trim();
    if (!text || text.length > 1000) throw new Error('اكتبي رسالة من 1 إلى 1000 حرف');
    const { error } = await client().from('room_messages').insert({ room_id: roomId, user_id: user.id, body: text });
    fail(error);
    return { success: true };
  },
  subscribeRoomMessages: (roomId, callback) => client().channel('room-chat-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_messages', filter: 'room_id=eq.' + roomId }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_seats', filter: 'room_id=eq.' + roomId }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_members', filter: 'room_id=eq.' + roomId }, callback)
    .on('postgres_changes', { event: '*', schema: 'public', table: 'room_backgrounds', filter: 'room_id=eq.' + roomId }, callback)
    .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'rooms', filter: 'id=eq.' + roomId }, callback)
    .subscribe(),
  unsubscribeRoomChannel: async (channel) => { if (channel) await client().removeChannel(channel); },
  deleteRoom: async (id) => {
    const user = await currentUser();
    const { error } = await client().from('rooms').delete().eq('id', id).eq('owner_id', user.id);
    fail(error); return { success: true };
  },
  games: async () => {
    const {data,error}=await client().from('games').select('id,name,description,game_type,icon').eq('active',true).in('game_type',['quiz','trivia']).order('sort_order').order('created_at',{ascending:false});
    fail(error); return {games:data||[]};
  },
  findRoomGameSession: async (roomId) => {
    const {data,error}=await client().from('room_game_sessions').select('id,status,game_id,created_at').eq('room_id',roomId).in('status',['lobby','active']).order('created_at',{ascending:false}).limit(1).maybeSingle();
    fail(error); return data;
  },
  createRoomGameSession: async (roomId,gameId) => {
    const {data,error}=await client().rpc('room_game_create',{p_room_id:roomId,p_game_id:gameId});
    fail(error); return data;
  },
  joinRoomGameSession: async (sessionId) => {
    const {data,error}=await client().rpc('room_game_join',{p_session_id:sessionId});
    fail(error); return data;
  },
  startRoomGameSession: async (sessionId) => {
    const {data,error}=await client().rpc('room_game_start',{p_session_id:sessionId});
    fail(error); return data;
  },
  answerRoomGameSession: async (sessionId,answerIndex) => {
    const {data,error}=await client().rpc('room_game_answer',{p_session_id:sessionId,p_answer_index:answerIndex});
    fail(error); return data;
  },
  nextRoomGameQuestion: async (sessionId) => {
    const {data,error}=await client().rpc('room_game_next',{p_session_id:sessionId});
    fail(error); return data;
  },
  cancelRoomGameSession: async (sessionId) => {
    const {data,error}=await client().rpc('room_game_cancel',{p_session_id:sessionId});
    fail(error); return data;
  },
  roomGameState: async (sessionId) => {
    const {data,error}=await client().rpc('room_game_state',{p_session_id:sessionId});
    fail(error); return data;
  },
  subscribeRoomGame: (sessionId,callback) => client().channel('room-game-'+sessionId)
    .on('postgres_changes',{event:'*',schema:'public',table:'room_game_sessions',filter:'id=eq.'+sessionId},callback)
    .on('postgres_changes',{event:'*',schema:'public',table:'room_game_players',filter:'session_id=eq.'+sessionId},callback)
    .on('postgres_changes',{event:'*',schema:'public',table:'room_game_answers',filter:'session_id=eq.'+sessionId},callback)
    .subscribe(),
  gifts: async () => {
    const { data, error } = await client().from('gifts').select('*').eq('active', true).order('price');
    fail(error); return { gifts: data };
  },
  shopItems: async () => {
    const {data,error}=await client().from('shop_items').select('*').eq('active',true).order('price');
    fail(error); return {items:data};
  },
  inventory: async () => {
    const user=await currentUser();
    const {data,error}=await client().from('user_inventory').select('item_id,purchased_at,expires_at,shop_items(id,name,item_type,price,rarity,visual_key,image_url,animation_url,description,duration_days)').eq('user_id',user.id).order('purchased_at',{ascending:false});
    fail(error); return {items:data.map(x=>({...x.shop_items,purchasedAt:x.purchased_at,expiresAt:x.expires_at}))};
  },
  purchaseShopItem: async (itemId) => {
    const {data,error}=await client().rpc('purchase_shop_item',{p_item_id:itemId});
    fail(error); return data;
  },
  equipShopItem: async (itemId) => {
    const {data,error}=await client().rpc('equip_shop_item',{p_item_id:itemId});
    fail(error); return data;
  },
  unequipShopItem: async (itemType) => {
    const {data,error}=await client().rpc('unequip_shop_item',{p_item_type:itemType});
    fail(error); return data;
  },


  notifications: async () => {
    const {data,error}=await client().from('notifications').select('id,type,title,body,actor_id,target_url,created_at,read_at').order('created_at',{ascending:false}).limit(60);
    fail(error); return {notifications:data};
  },
  markNotificationRead: async (id) => {
    const {error}=await client().from('notifications').update({read_at:new Date().toISOString()}).eq('id',id);
    fail(error); return {success:true};
  },
  markAllNotificationsRead: async () => {
    const {error}=await client().from('notifications').update({read_at:new Date().toISOString()}).is('read_at',null);
    fail(error); return {success:true};
  },
  startConversation: async (otherUserId) => {
    const { data, error } = await client().rpc('get_or_create_conversation', { p_other_user: otherUserId });
    fail(error); return { conversationId: data };
  },
  conversations: async () => {
    const user = await currentUser();
    const { data, error } = await client().from('dm_conversations')
      .select('id,user_a,user_b,updated_at,dm_messages(id,body,sender_id,created_at,read_at)')
      .or('user_a.eq.' + user.id + ',user_b.eq.' + user.id)
      .order('updated_at', { ascending: false }).limit(50);
    fail(error);
    const ids = [...new Set(data.map(c => c.user_a === user.id ? c.user_b : c.user_a))];
    const profiles = ids.length ? await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids) : {data:[],error:null};
    fail(profiles.error);
    const mapped=await mapProfilesWithFrames(profiles.data);const byId = Object.fromEntries(mapped.map(p => [p.uuid,p]));
    return { conversations: data.map(c => {
      const otherId = c.user_a === user.id ? c.user_b : c.user_a;
      const msgs = (c.dm_messages || []).sort((a,b) => new Date(b.created_at)-new Date(a.created_at));
      const last = msgs[0];
      return { id:c.id, other:byId[otherId], lastMessage:last?.body || '', updatedAt:c.updated_at,
        unread:msgs.filter(m=>m.sender_id!==user.id&&!m.read_at).length };
    }).filter(c=>c.other) };
  },
  directMessages: async (conversationId) => {
    const { data, error } = await client().from('dm_messages').select('id,sender_id,body,created_at,read_at')
      .eq('conversation_id', conversationId).order('created_at',{ascending:true}).limit(200);
    fail(error);
    const { error: readError } = await client().from('dm_messages').update({read_at:new Date().toISOString()})
      .eq('conversation_id',conversationId).neq('sender_id',(await currentUser()).id).is('read_at',null);
    fail(readError);
    return { messages:data };
  },
  sendDirectMessage: async (conversationId, body) => {
    const user = await currentUser(), text = String(body || '').trim();
    if (!text || text.length > 2000) throw new Error('الرسالة يجب أن تكون من 1 إلى 2000 حرف');
    const { error } = await client().from('dm_messages').insert({conversation_id:conversationId,sender_id:user.id,body:text});
    fail(error); return {success:true};
  },
  subscribeDirectMessages: (conversationId, callback) => client().channel('dm-' + conversationId)
    .on('postgres_changes',{event:'INSERT',schema:'public',table:'dm_messages',filter:'conversation_id=eq.'+conversationId},callback).subscribe(),
  blockState: async (targetId) => {
    const user = await currentUser();
    const { data, error } = await client().from('user_blocks').select('blocked_id')
      .eq('blocker_id', user.id).eq('blocked_id', targetId).maybeSingle();
    fail(error); return { blocked: !!data };
  },
  blockUser: async (publicId) => {
    const { data, error } = await client().rpc('block_user', { p_target_public_id: publicId });
    fail(error); return data;
  },
  unblockUser: async (publicId) => {
    const { data, error } = await client().rpc('unblock_user', { p_target_public_id: publicId });
    fail(error); return data;
  },
  reportUser: async (publicId, reason, details = '') => {
    const { data, error } = await client().rpc('report_user', { p_target_public_id: publicId, p_reason: reason, p_details: details });
    fail(error); return data;
  },
  reportRoom: async (roomId, reason, details = '') => {
    const { data, error } = await client().rpc('report_room', { p_room_id: roomId, p_reason: reason, p_details: details });
    fail(error); return data;
  },
  hostStartSession: async (roomId) => {
    const { data, error } = await client().rpc('host_start_session', { p_room_id: roomId });
    if (error && /Could not find the function|does not exist/i.test(error.message || '')) return null;
    fail(error); return data;
  },
  hostHeartbeatSession: async (sessionId) => {
    const { data, error } = await client().rpc('host_heartbeat_session', { p_session_id: sessionId });
    fail(error); return data;
  },
  hostEndSession: async (sessionId) => {
    const { data, error } = await client().rpc('host_end_session', { p_session_id: sessionId });
    if (error && /Could not find the function|does not exist/i.test(error.message || '')) return false;
    fail(error); return data;
  },
  agencyHostStats: async (agencyId) => {
    const { data, error } = await client().from('agency_host_daily_stats').select('*')
      .eq('agency_id', agencyId).order('stat_date', { ascending: false }).limit(120);
    fail(error);
    const ids = [...new Set((data || []).map(x => x.host_id))];
    let profiles = [];
    if (ids.length) { const r = await client().from('profiles').select('id,public_id,display_name,handle').in('id', ids); fail(r.error); profiles = r.data || []; }
    const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    return { stats: (data || []).map(x => ({ ...x, profile: byId[x.host_id] || null })) };
  },
  myAgencies: async () => {
    const user = await currentUser();
    const { data, error } = await client().from('agency_members')
      .select('agency_id,member_role,status,agencies(id,name,agency_type,status,commission_percent,agent_commission_percent)')
      .eq('user_id', user.id).eq('status', 'active');
    fail(error);
    return { agencies: (data || []).map(x => ({ ...x.agencies, agencyId: x.agency_id, memberRole: x.member_role })) };
  },
  agencyMembers: async (agencyId) => {
    const { data, error } = await client().from('agency_members')
      .select('user_id,member_role,status,joined_at').eq('agency_id', agencyId).order('joined_at');
    fail(error);
    const ids = (data || []).map(x => x.user_id);
    let profiles = [];
    if (ids.length) { const r = await client().from('profiles').select('id,public_id,display_name,handle,avatar_url').in('id', ids); fail(r.error); profiles = r.data || []; }
    const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    return { members: (data || []).map(x => ({ ...x, profile: byId[x.user_id] || null })) };
  },
  agencyRecharges: async (agencyId) => {
    const { data, error } = await client().from('agency_recharges')
      .select('id,agent_id,target_user_id,package_id,coins,price_dzd,total_commission_dzd,agent_commission_dzd,agency_commission_dzd,payment_method,payment_reference,created_at')
      .eq('agency_id', agencyId).order('created_at', { ascending: false }).limit(50);
    fail(error);
    const ids = [...new Set((data || []).flatMap(x => [x.agent_id, x.target_user_id]))];
    let profiles = [];
    if (ids.length) { const r = await client().from('profiles').select('id,public_id,display_name,handle').in('id', ids); fail(r.error); profiles = r.data || []; }
    const byId = Object.fromEntries(profiles.map(p => [p.id, p]));
    return { recharges: (data || []).map(x => ({ ...x, agent: byId[x.agent_id] || null, target: byId[x.target_user_id] || null })) };
  },
  agencyFinance: async (agencyId, canViewAgency = false) => {
    const user = await currentUser();
    const agent = await client().from('agent_commission_wallets').select('balance_dzd').eq('user_id', user.id).maybeSingle();
    fail(agent.error);
    let agencyBalance = null;
    if (canViewAgency) {
      const agency = await client().from('agency_wallets').select('balance_dzd').eq('agency_id', agencyId).maybeSingle();
      fail(agency.error); agencyBalance = agency.data?.balance_dzd || 0;
    }
    return { agencyBalance, agentBalance: agent.data?.balance_dzd || 0 };
  },
  topupPackages: async () => {
    const { data, error } = await client().from('topup_packages').select('*').eq('active', true).order('sort_order');
    fail(error); return { packages: data || [] };
  },
  agentRechargeUser: async (agencyId, targetPublicId, packageId, paymentMethod, paymentReference) => {
    const { data, error } = await client().rpc('agent_recharge_user', {
      p_agency_id: agencyId, p_target_public_id: targetPublicId, p_package_id: packageId,
      p_payment_method: paymentMethod, p_payment_reference: paymentReference
    });
    fail(error); return data;
  },
  agencyAddMember: async (agencyId, publicId, role) => {
    const { data, error } = await client().rpc('agency_add_member', { p_agency_id: agencyId, p_member_public_id: publicId, p_role: role });
    fail(error); return data;
  },
  agencyRemoveMember: async (agencyId, publicId) => {
    const { data, error } = await client().rpc('agency_remove_member', { p_agency_id: agencyId, p_member_public_id: publicId });
    fail(error); return data;
  },
  createExternalTopupOrder: async (packageId, provider) => {
    const { data, error } = await client().rpc('create_external_topup_order', { p_package_id: packageId, p_payment_provider: provider });
    fail(error); return data;
  },
  roomBombState: async (roomId) => {
    const { error: refreshError } = await client().rpc('refresh_room_bomb', { p_room_id: roomId });
    fail(refreshError);
    const [bombResult, levelResult, contributionResult] = await Promise.all([
      client().from('room_bombs').select('*').eq('room_id', roomId).maybeSingle(),
      client().from('room_bomb_levels').select('*').order('level'),
      client().from('room_bomb_contributions').select('user_id,points').eq('room_id', roomId).order('points', { ascending: false }).limit(3)
    ]);
    fail(bombResult.error); fail(levelResult.error); fail(contributionResult.error);
    const ids = (contributionResult.data || []).map(x => x.user_id);
    let profiles = [];
    if (ids.length) {
      const result = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
      fail(result.error); profiles = result.data || [];
    }
    const mapped=await mapProfilesWithFrames(profiles);const byId = Object.fromEntries(mapped.map(p => [p.uuid,p]));
    return {
      bomb: bombResult.data || { room_id: roomId, level: 1, progress: 0, ends_at: null },
      levels: levelResult.data || [],
      contributors: (contributionResult.data || []).map(x => ({ ...x, profile: byId[x.user_id] || null }))
    };
  },
  roomEvents: async (roomId, since = null) => {
    let query = client().from('room_activity_events').select('id,room_id,actor_id,target_user_id,event_type,payload,created_at').eq('room_id', roomId);
    if (since) query = query.gte('created_at', new Date(since).toISOString());
    const { data, error } = await query.order('created_at', { ascending: true }).limit(120);
    fail(error);
    const ids = [...new Set((data || []).flatMap(e => [e.actor_id, e.target_user_id]).filter(Boolean))];
    let profiles = [];
    if (ids.length) {
      const result = await client().from('profiles').select(PROFILE_COLUMNS).in('id', ids);
      fail(result.error);
      profiles = result.data || [];
    }
    const mapped=await mapProfilesWithFrames(profiles);const byId = Object.fromEntries(mapped.map(p => [p.uuid,p]));
    return { events: (data || []).map(e => ({ ...e, actor: byId[e.actor_id] || null, target: byId[e.target_user_id] || null })) };
  },
  subscribeRoomEvents: (roomId, callback) => client().channel('room-events-' + roomId)
    .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'room_activity_events', filter: 'room_id=eq.' + roomId }, callback)
    .subscribe(),
  sendRoomEmoji: async (roomId, emoji) => {
    const { data, error } = await client().rpc('send_room_emoji', { p_room_id: roomId, p_emoji: emoji });
    fail(error); return data;
  },
  sendRoomGift: async (roomId, recipientId, giftId, quantity = 1, requestId = crypto.randomUUID()) => {
    const { data, error } = await client().rpc('send_room_gift', {
      p_room_id: roomId, p_recipient: recipientId, p_gift_id: giftId, p_quantity: quantity, p_request_id: requestId
    });
    fail(error); return data;
  },
  sendRoomGiftToAll: async (roomId, giftId, quantity = 1, requestId = crypto.randomUUID()) => {
    const { data, error } = await client().rpc('send_room_gift_to_all', {
      p_room_id: roomId, p_gift_id: giftId, p_quantity: quantity, p_request_id: requestId
    });
    fail(error); return data;
  },
  sendGift: async (recipientId, giftId, quantity = 1, requestId = crypto.randomUUID()) => {
    const { data, error } = await client().rpc('send_gift', {
      p_recipient: recipientId, p_gift_id: giftId, p_quantity: quantity, p_request_id: requestId
    });
    fail(error); return data;
  }
};
