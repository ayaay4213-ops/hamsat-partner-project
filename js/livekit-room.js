import { supabase } from './supabase-auth.js';

const LIVEKIT_CLIENT_URL = 'https://cdn.jsdelivr.net/npm/livekit-client@2.24.1/+esm';

export function createLiveKitVoiceRoom({ roomId, onState = () => {} }) {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل.');
  if (!roomId) throw new Error('تعذّر تحديد الغرفة.');

  let room = null;
  let joined = false;
  let muted = false;
  let canPublish = false;
  let joining = null;
  let disposed = false;
  const audioElements = new Map();

  const status = (message, connected = joined) => {
    if (!disposed) onState({ message, connected, muted });
  };

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

      room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
        if (track.kind !== Track.Kind.Audio) return;
        const element = track.attach();
        element.autoplay = true;
        element.playsInline = true;
        element.setAttribute('playsinline', '');
        element.dataset.livekitParticipant = participant.identity;
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
      room.on(RoomEvent.Reconnected, () => status('عاد الاتصال الصوتي', true));
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
      await room.connect(credentials.url, credentials.token);
      canPublish = Boolean(credentials.can_publish);
      if (canPublish) {
        await room.localParticipant.setMicrophoneEnabled(true);
      }
      joined = true;
      muted = false;
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

  function toggleMute() {
    if (!room || !joined || !canPublish) return muted;
    muted = !muted;
    room.localParticipant.setMicrophoneEnabled(!muted).catch((error) => {
      muted = !muted;
      status('تعذّر تغيير حالة الميكروفون: ' + error.message, true);
    });
    status(muted ? 'الميكروفون مكتوم' : 'الميكروفون يعمل', true);
    return muted;
  }

  async function leave() {
    disposed = true;
    joined = false;
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
    const root = document.getElementById('voice-audio');
    if (root) root.querySelectorAll('[data-livekit-participant]').forEach(el => el.remove());
    onState({ message: 'تم إيقاف الصوت', connected: false, muted: false });
  }

  return { join, leave, toggleMute, enableAudio, get muted() { return muted; }, get canPublish() { return canPublish; } };
}
