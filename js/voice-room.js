import { supabase } from './supabase-auth.js';
import { AUDIO_PROVIDER } from '../supabase/config.js';
import { createLiveKitVoiceRoom } from './livekit-room.js?v=20261122-room-audio-v5';

// STUN is sufficient for some peer-to-peer networks. Reliable mobile/carrier
// connectivity still requires a TURN relay or an SFU with server credentials.
const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

function createPeerVoiceRoom({ roomId, userId, onState = () => {} }) {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل.');
  if (!roomId || !userId) throw new Error('تعذّر تحديد الغرفة أو حساب المستخدم.');
  if (!navigator.mediaDevices?.getUserMedia || !window.RTCPeerConnection) {
    throw new Error('هذا المتصفح لا يدعم الاتصال الصوتي. افتحي همسات عبر Chrome أو Safari مع اتصال آمن HTTPS.');
  }

  let channel = null;
  let localStream = null;
  let joined = false;
  let muted = false;
  let roomAudioMuted = false;
  let audioUnlocked = false;
  let joining = null;
  let stateHandler = onState;
  const peers = new Map();
  const audioNodes = new Map();
  const pendingIce = new Map();
  const mutedParticipants = new Set();

  const status = (message, connected = false) => stateHandler({ message, connected, muted, roomAudioMuted });
  function setStateHandler(handler) { stateHandler = typeof handler === 'function' ? handler : () => {}; status(joined ? 'الصوت المباشر متصل' : 'الصوت غير متصل', joined); }

  async function send(to, kind, data = {}) {
    if (!channel) return;
    const result = await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { from: userId, to, kind, ...data }
    });
    if (result && result !== 'ok') throw new Error('تعذّر إرسال إشارة الاتصال الصوتي.');
  }

  function playRemoteAudio(remoteId) {
    const audio = audioNodes.get(remoteId);
    if (!audio || !audio.srcObject) return Promise.resolve(false);
    audio.muted = roomAudioMuted || mutedParticipants.has(remoteId);
    return audio.play().then(() => true).catch(() => {
      status('اضغطي «سماع الآخرين» للسماح بتشغيل الصوت على هاتفك', true);
      return false;
    });
  }

  async function enableAudio() {
    audioUnlocked = true;
    const nodes = [...audioNodes.keys()];
    if (!nodes.length) {
      status('تم السماح بالصوت. سيعمل عند اتصال أول مشارك.', true);
      return true;
    }
    const results = await Promise.all(nodes.map(playRemoteAudio));
    if (results.some(Boolean)) status('تم تفعيل سماع المشاركين', true);
    else throw new Error('لم يبدأ تشغيل الصوت. تحققي من مستوى الصوت ثم أعيدي الضغط.');
    return true;
  }

  function makePeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(remoteId, pc);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
      if (event.candidate) {
        send(remoteId, 'ice', { candidate: event.candidate.toJSON() })
          .catch(error => status('تعذّر تبادل بيانات الاتصال: ' + error.message));
      }
    };
    pc.ontrack = event => {
      let audio = audioNodes.get(remoteId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.setAttribute('playsinline', '');
        audio.setAttribute('aria-label', 'صوت مشارك في الغرفة');
        audio.dataset.voicePeer = remoteId;
        audio.muted = roomAudioMuted || mutedParticipants.has(remoteId);
        const root = document.getElementById('voice-audio');
        if (root) root.appendChild(audio);
        audioNodes.set(remoteId, audio);
      }
      const stream = event.streams?.[0] || new MediaStream([event.track]);
      audio.srcObject = stream;
      if (audioUnlocked) playRemoteAudio(remoteId);
      else status('وصل مشارك. اضغطي «سماع الآخرين» لتفعيل الصوت', true);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'connected') status('الصوت المباشر متصل', true);
      if (pc.connectionState === 'failed') {
        dropPeer(remoteId);
        status('تعذّر ربط أحد المشاركين. قد تحتاج الشبكة إلى TURN.', false);
      }
    };
    return pc;
  }

  async function offerTo(remoteId) {
    // Deterministic initiator: only the lexicographically smaller user ID offers.
    if (!joined || !remoteId || userId.localeCompare(remoteId) >= 0 || peers.has(remoteId)) return;
    const pc = makePeer(remoteId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send(remoteId, 'offer', { description: pc.localDescription.toJSON() });
    } catch (error) {
      dropPeer(remoteId);
      status('تعذّر بدء الاتصال مع مشارك: ' + error.message);
    }
  }

  async function flushIce(remoteId, pc) {
    const queued = pendingIce.get(remoteId) || [];
    pendingIce.delete(remoteId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); }
      catch (error) { console.warn('Ignored invalid queued ICE candidate', error); }
    }
  }

  async function handleSignal(payload) {
    if (!payload || (payload.to !== userId && payload.to !== '*') || payload.from === userId) return;
    const remoteId = payload.from;
    if (payload.kind === 'leave') {
      dropPeer(remoteId);
      return;
    }
    if (payload.kind === 'hello') {
      await offerTo(remoteId);
      return;
    }
    const pc = makePeer(remoteId);
    if (payload.kind === 'offer') {
      await pc.setRemoteDescription(payload.description);
      await flushIce(remoteId, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await send(remoteId, 'answer', { description: pc.localDescription.toJSON() });
    } else if (payload.kind === 'answer') {
      if (pc.signalingState === 'have-local-offer') {
        await pc.setRemoteDescription(payload.description);
        await flushIce(remoteId, pc);
      }
    } else if (payload.kind === 'ice' && payload.candidate) {
      if (pc.remoteDescription) {
        try { await pc.addIceCandidate(payload.candidate); }
        catch (error) { console.warn('Ignored invalid ICE candidate', error); }
      } else {
        const queued = pendingIce.get(remoteId) || [];
        queued.push(payload.candidate);
        pendingIce.set(remoteId, queued);
      }
    }
  }

  function dropPeer(remoteId) {
    const pc = peers.get(remoteId);
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
      peers.delete(remoteId);
    }
    pendingIce.delete(remoteId);
    const audio = audioNodes.get(remoteId);
    if (audio) {
      audio.pause();
      audio.srcObject = null;
      audio.remove();
      audioNodes.delete(remoteId);
    }
  }

  async function join() {
    if (joined) return;
    if (joining) return joining;
    joining = (async () => {
      status('نطلب إذن الميكروفون...');
      localStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false
      });
      channel = supabase.channel('hamsat-live-audio-' + roomId, {
        config: { broadcast: { self: false }, presence: { key: userId } }
      });
      channel
        .on('broadcast', { event: 'signal' }, ({ payload }) => {
          handleSignal(payload).catch(error => status('تعذّر إنشاء اتصال صوتي: ' + error.message));
        })
        .on('presence', { event: 'sync' }, () => {
          const present = channel.presenceState();
          Object.values(present).flat().forEach(entry => {
            const remoteId = entry?.user_id;
            if (remoteId && remoteId !== userId) offerTo(remoteId);
          });
        });

      await new Promise((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error('انتهت مهلة الاتصال بخدمة الغرف الصوتية.')), 15000);
        channel.subscribe(async state => {
          if (state === 'SUBSCRIBED') {
            clearTimeout(timeout);
            try {
              await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
              joined = true;
              const present = channel.presenceState();
              Object.values(present).flat().forEach(entry => {
                const remoteId = entry?.user_id;
                if (remoteId && remoteId !== userId) offerTo(remoteId);
              });
              await send('*', 'hello');
              status('الميكروفون يعمل، جارٍ ربط المشاركين', true);
              resolve();
            } catch (error) {
              clearTimeout(timeout);
              reject(error);
            }
          } else if (state === 'CHANNEL_ERROR' || state === 'TIMED_OUT' || state === 'CLOSED') {
            clearTimeout(timeout);
            reject(new Error('تعذّر الاتصال بقناة الصوت. تحققي من إعدادات Realtime في Supabase.'));
          }
        });
      });
    })();
    try { await joining; }
    finally { joining = null; }
  }

  async function setMuted(shouldMute) {
    if (!localStream) throw new Error('ابدئي الاتصال الصوتي أولاً.');
    muted = Boolean(shouldMute);
    localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    status(muted ? 'الميكروفون مكتوم' : 'الميكروفون يعمل', true);
    return muted;
  }
  async function toggleMute() { return setMuted(!muted); }

  function toggleRoomAudioMute() {
    roomAudioMuted = !roomAudioMuted;
    for (const [identity, audio] of audioNodes) audio.muted = roomAudioMuted || mutedParticipants.has(identity);
    status(roomAudioMuted ? 'تم كتم صوت الغرفة على جهازك' : 'تم تشغيل صوت الغرفة', true);
    return roomAudioMuted;
  }

  function setParticipantMuted(identity, shouldMute) {
    if (!identity) return false;
    if (shouldMute) mutedParticipants.add(identity); else mutedParticipants.delete(identity);
    const audio = audioNodes.get(identity);
    if (audio) audio.muted = roomAudioMuted || shouldMute;
    return true;
  }

  async function leave() {
    joined = false;
    if (channel) {
      try { await send('*', 'leave'); } catch (_) {}
      try { await channel.untrack(); } catch (_) {}
      try { await supabase.removeChannel(channel); } catch (_) {}
      channel = null;
    }
    for (const id of [...peers.keys()]) dropPeer(id);
    if (localStream) {
      localStream.getTracks().forEach(track => track.stop());
      localStream = null;
    }
    muted = false;
    roomAudioMuted = false;
    audioUnlocked = false;
    const root = document.getElementById('voice-audio');
    if (root) root.innerHTML = '';
    status('تم إيقاف الصوت');
  }

  return { join, leave, toggleMute, setMuted, toggleRoomAudioMute, enableAudio, setParticipantMuted, setStateHandler, get muted() { return muted; }, get roomAudioMuted() { return roomAudioMuted; }, get canPublish() { return Boolean(localStream); } };
}


// Switch to the SFU only after LiveKit credentials and the token function are deployed.
export function createVoiceRoom(options) {
  if (AUDIO_PROVIDER === 'livekit') return createLiveKitVoiceRoom(options);
  return createPeerVoiceRoom(options);
}
