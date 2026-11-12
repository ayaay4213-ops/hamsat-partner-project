import { supabase } from './supabase-auth.js';

function client() {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل. تحققي من ملف supabase/config.js.');
  return supabase;
}
function fail(error) { if (error) throw new Error(error.message || 'حدث خطأ في الاتصال بقاعدة البيانات'); }
function mapProfile(p) {
  if (!p) return null;
  return {
    uuid: p.id, handle: p.handle || '', displayName: p.display_name || '',
    bio: p.bio || '', country: p.country || '', color: p.color || '#7c3aed',
    avatarUrl: p.avatar_url || null, createdAt: p.created_at ? new Date(p.created_at).getTime() : Date.now()
  };
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
  signInWithEmail: async (email, password) => {
    const { data, error } = await client().auth.signInWithPassword({ email: email.trim().toLowerCase(), password });
    fail(error); return data;
  },
  signUpWithEmail: async (email, password) => {
    const { data, error } = await client().auth.signUp({
      email: email.trim().toLowerCase(), password,
      options: { emailRedirectTo: location.origin + location.pathname }
    });
    fail(error); return data;
  },
  signOut: async () => { const { error } = await client().auth.signOut(); fail(error); },
  uploadMedia: async (file, folder) => {
    const user=await currentUser();
    if(!file||!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('اختاري صورة JPG أو PNG أو WEBP');
    if(file.size>5*1024*1024)throw new Error('حجم الصورة يجب ألا يتجاوز 5 ميغابايت');
    const ext=file.type==='image/jpeg'?'jpg':file.type.split('/')[1];
    const path=user.id+'/'+folder+'/'+Date.now()+'.'+ext;
    const {data,error}=await client().storage.from('hamsat-media').upload(path,file,{upsert:true,contentType:file.type});fail(error);
    const {data:publicData}=client().storage.from('hamsat-media').getPublicUrl(data.path);
    return {url:publicData.publicUrl,path:data.path};
  },
  me: async () => {
    const user = await currentUser();
    const [pr, wr] = await Promise.all([
      client().from('profiles').select('*').eq('id', user.id).maybeSingle(),
      client().from('wallets').select('*').eq('user_id', user.id).maybeSingle()
    ]);
    fail(pr.error); fail(wr.error);
    if (!wr.data) throw new Error('لم تُنشأ محفظة الحساب بعد. راجعي إعداد trigger في Supabase.');
    return { account: { id: user.id, email: user.email || '', username: user.email || user.phone || 'عضو' },
      profile: mapProfile(pr.data), wallet: mapWallet(wr.data) };
  },
  saveProfile: async (p) => {
    const user = await currentUser();
    const payload = {
      id: user.id, handle: String(p.handle || '').trim().toLowerCase(),
      display_name: String(p.displayName || '').trim(), bio: String(p.bio || ''),
      country: String(p.country || ''), color: String(p.color || '#7c3aed'),
      avatar_url: p.avatarUrl || null
    };
    const { data, error } = await client().from('profiles').upsert(payload, { onConflict: 'id' }).select('*').single();
    fail(error);
    const { data: wallet, error: walletError } = await client().from('wallets').select('*').eq('user_id', user.id).single();
    fail(walletError);
    return { profile: mapProfile(data), wallet: mapWallet(wallet) };
  },
  users: async () => {
    const { data, error, count } = await client().from('profiles').select('*', { count: 'exact' }).not('handle', 'is', null).order('created_at', { ascending: false }).limit(30);
    fail(error);
    return { total: count ?? data.length, users: data.map(mapProfile) };
  },
  user: async (handle) => {
    const { data, error } = await client().from('profiles').select('*').eq('handle', handle.toLowerCase()).single();
    fail(error); return { profile: mapProfile(data) };
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
  rooms: async () => {
    const { data, error } = await client().from('rooms').select('*').order('created_at', { ascending: false }).limit(100);
    fail(error);
    const ids = [...new Set(data.map(r => r.owner_id))];
    let owners = [];
    if (ids.length) {
      const res = await client().from('profiles').select('*').in('id', ids);
      fail(res.error); owners = res.data;
    }
    const byId = Object.fromEntries(owners.map(p => [p.id, mapProfile(p)]));
    return { rooms: data.map(r => {
      const p = byId[r.owner_id] || {};
      return { id: r.id, ownerUuid: r.owner_id, title: r.title, topic: r.topic,
        description: r.description, coverUrl: r.cover_url || null, createdAt: new Date(r.created_at).getTime(),
        ownerName: p.displayName || 'عضو', ownerHandle: p.handle || '',
        ownerColor: p.color || '#7c3aed' };
    }) };
  },
  createRoom: async (r) => {
    const user = await currentUser();
    const { data, error } = await client().from('rooms').insert({
      owner_id: user.id, title: String(r.title || '').trim(),
      topic: r.topic || 'عام', description: r.description || '', cover_url: r.coverUrl || null
    }).select('*').single();
    fail(error); return data;
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
    const res = await client().from('profiles').select('*').in('id', ids);
    fail(res.error);
    const byId = Object.fromEntries(res.data.map(p => [p.id, mapProfile(p)]));
    return { members: data.map(x => ({ ...byId[x.user_id], userId: x.user_id, joinedAt: new Date(x.joined_at).getTime() })).filter(x => x.displayName) };
  },
  roomMessages: async (roomId) => {
    const { data, error } = await client().from('room_messages').select('id,user_id,body,created_at').eq('room_id', roomId).order('created_at', { ascending: true }).limit(100);
    fail(error);
    const ids = [...new Set(data.map(x => x.user_id))];
    let profiles = [];
    if (ids.length) {
      const res = await client().from('profiles').select('*').in('id', ids);
      fail(res.error); profiles = res.data;
    }
    const byId = Object.fromEntries(profiles.map(p => [p.id, mapProfile(p)]));
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
    .subscribe(),
  unsubscribeRoomChannel: async (channel) => { if (channel) await client().removeChannel(channel); },
  deleteRoom: async (id) => {
    const user = await currentUser();
    const { error } = await client().from('rooms').delete().eq('id', id).eq('owner_id', user.id);
    fail(error); return { success: true };
  },
  gifts: async () => {
    const { data, error } = await client().from('gifts').select('id,name,price,icon').eq('active', true).order('price');
    fail(error); return { gifts: data };
  },
  sendGift: async (recipientId, giftId, quantity = 1) => {
    const { data, error } = await client().rpc('send_gift', {
      p_recipient: recipientId, p_gift_id: giftId, p_quantity: quantity
    });
    fail(error); return data;
  }
};
