import { supabase } from './supabase-auth.js';

const LIVEKIT_CLIENT_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.24.1/+esm';

export function createLiveKitVoiceRoom({ roomId, onState = () => {} }) {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل.');
  if (!roomId) throw new Error('تعذّر تحديد الغرفة.');

  let room = null;
  let joined = false;
  let muted = false;
  let roomAudioMuted = false;
  let activeSpeakerIds = [];
  let canPublish = false;
  let joining = null;
  let disposed = false;
  let seatChannel = null;
  let permissionRefreshing = false;
  let stateHandler = onState;
  const audioElements = new Map();
  const mutedParticipants = new Set();

  const status = (message, connected = joined) => {
    if (!disposed) stateHandler({ message, connected, muted, roomAudioMuted, activeSpeakers: activeSpeakerIds });
  };

  function setStateHandler(handler) { stateHandler = typeof handler === 'function' ? handler : () => {}; status(joined ? 'الصوت المباشر متصل' : 'الصوت غير متصل', joined); }

  async function requestToken() {
    const { data, error } = await supabase.functions.invoke('livekit-token', {
      body: { room_id: roomId }
    });
    if (error) {
      const detail = error.context?.json?.error || error.message;
      throw new Error(detail || 'تعذّر الحصول على رمز الاتصال الصوتي.');
    }
    if (!data?.url || !data?.token) {
      throw new Error(data?.error || 'خادم الصوت لم يُرجع بيانات اتصال صالحة.');
    }
    return data;
  }

  async function refreshPermissions() {
    if (!room || !joined || disposed || permissionRefreshing) return;
    permissionRefreshing = true;
    try {
      const credentials = await requestToken();
      if (disposed || !room || !joined) return;
      const nextCanPublish = Boolean(credentials.can_publish);
      if (nextCanPublish === canPublish) return;

      // LiveKit publish permission is fixed by the access token. Reconnect with
      // a fresh server-issued token whenever this participant gains or loses a seat.
      try { await room.localParticipant.setMicrophoneEnabled(false); } catch (_) {}
      await room.disconnect();
      joined = false;
      await room.connect(credentials.url, credentials.token);
      canPublish = nextCanPublish;
      muted = false;
      if (canPublish) await room.localParticipant.setMicrophoneEnabled(true);
      joined = true;
      status(canPublish
        ? 'تم تفعيل المايك بعد حجز المقعد'
        : 'تم إيقاف المايك. ما زلتِ تستمعين للغرفة',
        true);
    } catch (error) {
      // A failed permission refresh happens after disconnecting the old session.
      // Never report the room as connected when the SFU connection is down.
      joined = Boolean(room?.state === 'connected');
      status('تعذّر تحديث صلاحية المايك: ' + error.message, joined);
    } finally {
      permissionRefreshing = false;
    }
  }

  async function join() {
    if (joined) return;
    if (joining) return joining;
    joining = (async () => {
      status('جارٍ تجهيز الاتصال الصوتي...', false);
      const { Room, RoomEvent, Track } = await import(LIVEKIT_CLIENT_URL);
      room = new Room({
        adaptiveStream: true,
        dynacast: true,
        audioCaptureDefaults: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true
        }
      });

      room.on(RoomEvent.ActiveSpeakersChanged, speakers => {
        activeSpeakerIds = (speakers || []).map(participant => participant.identity);
        status('الصوت المباشر متصل', true);
      });

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.playsInline = true;
        element.setAttribute('playsinline', '');
        element.dataset.livekitParticipant = participant.identity;
        element.muted = roomAudioMuted || mutedParticipants.has(participant.identity);
        const root = document.getElementById('voice-audio');
        if (root) root.appendChild(element);
        audioElements.set(track.sid, { track, element });
      });

      room.on(RoomEvent.TrackUnsubscribed, (track) => {
        track.detach();
        const item = audioElements.get(track.sid);
        if (item) {
          item.element.remove();
          audioElements.delete(track.sid);
        }
      });

      room.on(RoomEvent.Reconnecting, () => status('انقطع الاتصال مؤقتاً، جارٍ إعادة الربط...', false));
      room.on(RoomEvent.Reconnected, () => {
        status('عاد الاتصال الصوتي', true);
        refreshPermissions().catch(error => status('تعذّر تحديث صلاحية المايك: ' + error.message, true));
      });
      room.on(RoomEvent.AudioPlaybackStatusChanged, () => {
        if (room && !room.canPlaybackAudio) {
          status('اضغطي «سماع الآخرين» للسماح بتشغيل الصوت', true);
        }
      });
      room.on(RoomEvent.Disconnected, () => {
        joined = false;
        status('انقطع الاتصال الصوتي', false);
      });

      const credentials = await requestToken();
      if (disposed) throw new Error('تم إلغاء الاتصال الصوتي.');
      try {
        await room.connect(credentials.url, credentials.token);
        if (disposed) {
          await room.disconnect();
          throw new Error('تم إلغاء الاتصال الصوتي.');
        }
      } catch (connectError) {
        const detail = String(connectError?.message || connectError || '');
        if (/invalid token|could not establish signal connection|unauthoriz|401/i.test(detail)) {
          throw new Error('رفض خادم LiveKit رمز الدخول. يجب أن تكون LIVEKIT_URL وLIVEKIT_API_KEY وLIVEKIT_API_SECRET من المشروع نفسه في LiveKit Cloud، ثم إعادة نشر دالة livekit-token. لم يتم تشغيل صوت وهمي بديل.');
        }
        if (/websocket|network|failed to fetch|timeout|connection/i.test(detail)) {
          throw new Error('تعذّر الوصول إلى خادم الصوت. تحققي من اتصال الإنترنت ومن عنوان LIVEKIT_URL في أسرار Supabase.');
        }
        throw new Error('فشل الاتصال بخادم الصوت: ' + detail);
      }
      canPublish = Boolean(credentials.can_publish);
      if (canPublish) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      joined = true;
      muted = false;
      seatChannel = supabase.channel('hamsat-seat-permissions-' + roomId)
        .on('postgres_changes', {
          event: '*',
          schema: 'public',
          table: 'room_seats',
          filter: 'room_id=eq.' + roomId
        }, () => {
          refreshPermissions().catch(error => status('تعذّر تحديث صلاحية المايك: ' + error.message, true));
        })
        .subscribe();
      status(canPublish
        ? 'اتصلتِ بالغرفة والميكروفون يعمل'
        : 'دخلتِ الغرفة كمستمعة. احجزي مقعداً للتحدث',
        true);
    })();

    try {
      await joining;
    } catch (error) {
      if (room) {
        try { await room.disconnect(); } catch (_) {}
        room = null;
      }
      joined = false;
      throw error;
    } finally {
      joining = null;
    }
  }

  async function enableAudio() {
    if (!room || !joined) throw new Error('ابدئي الاتصال الصوتي أولاً.');
    await room.startAudio();
    status('تم تفعيل سماع المشاركين', true);
    return true;
  }

  async function setMuted(shouldMute) {
    if (!room || !joined || !canPublish) throw new Error('احجزي مقعداً على المايك أولاً.');
    const nextMuted = Boolean(shouldMute);
    await room.localParticipant.setMicrophoneEnabled(!nextMuted);
    muted = nextMuted;
    status(muted ? 'الميكروفون مكتوم' : 'الميكروفون يعمل', true);
    return muted;
  }
  async function toggleMute() { return setMuted(!muted); }

  function toggleRoomAudioMute() {
    roomAudioMuted = !roomAudioMuted;
    for (const item of audioElements.values()) item.element.muted = roomAudioMuted || mutedParticipants.has(item.element.dataset.livekitParticipant);
    status(roomAudioMuted ? 'تم كتم صوت الغرفة على جهازك' : 'تم تشغيل صوت الغرفة', true);
    return roomAudioMuted;
  }

  function setParticipantMuted(identity, shouldMute) {
    if (!identity) return false;
    if (shouldMute) mutedParticipants.add(identity); else mutedParticipants.delete(identity);
    for (const item of audioElements.values()) {
      if (item.element.dataset.livekitParticipant === identity) item.element.muted = roomAudioMuted || shouldMute;
    }
    return true;
  }

  async function leave() {
    disposed = true;
    // If the user leaves while the initial join is still pending, wait for that
    // attempt to settle so it cannot reconnect after cleanup has completed.
    if (joining) {
      try { await joining; } catch (_) {}
    }
    joined = false;
    if (seatChannel) {
      try { await supabase.removeChannel(seatChannel); } catch (_) {}
      seatChannel = null;
    }
    if (room) {
      try { await room.disconnect(); } catch (_) {}
      room = null;
    }
    for (const { track, element } of audioElements.values()) {
      try { track.detach(element); } catch (_) {}
      element.remove();
    }
    audioElements.clear();
    muted = false;
    canPublish = false;
    activeSpeakerIds = [];
    const root = document.getElementById('voice-audio');
    if (root) root.querySelectorAll('[data-livekit-participant]').forEach(el => el.remove());
    roomAudioMuted = false;
    stateHandler({ message: 'تم إيقاف الصوت', connected: false, muted: false, roomAudioMuted: false, activeSpeakers: [] });
  }

  return { join, leave, toggleMute, setMuted, toggleRoomAudioMute, enableAudio, refreshPermissions, setParticipantMuted, setStateHandler, get muted() { return muted; }, get roomAudioMuted() { return roomAudioMuted; }, get canPublish() { return canPublish; } };
}
