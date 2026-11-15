import { supabase } from './supabase-auth.js';

const ICE_SERVERS = [{ urls: 'stun:stun.l.google.com:19302' }];

export function createVoiceRoom({ roomId, userId, onState = () => {} }) {
  if (!supabase) throw new Error('إعداد Supabase غير مكتمل.');
  if (!roomId || !userId) throw new Error('تعذّر تحديد الغرفة أو حساب المستخدم.');

  let channel = null;
  let localStream = null;
  let joined = false;
  let muted = false;
  const peers = new Map();
  const audioNodes = new Map();
  const pendingIce = new Map();

  const status = (message, connected = false) => onState({ message, connected, muted });

  async function send(to, kind, data = {}) {
    if (!channel) return;
    await channel.send({
      type: 'broadcast',
      event: 'signal',
      payload: { from: userId, to, kind, ...data }
    });
  }

  function makePeer(remoteId) {
    if (peers.has(remoteId)) return peers.get(remoteId);
    const pc = new RTCPeerConnection({ iceServers: ICE_SERVERS });
    peers.set(remoteId, pc);
    localStream.getTracks().forEach(track => pc.addTrack(track, localStream));

    pc.onicecandidate = event => {
      if (event.candidate) send(remoteId, 'ice', { candidate: event.candidate.toJSON() }).catch(() => {});
    };
    pc.ontrack = event => {
      let audio = audioNodes.get(remoteId);
      if (!audio) {
        audio = document.createElement('audio');
        audio.autoplay = true;
        audio.playsInline = true;
        audio.dataset.voicePeer = remoteId;
        const root = document.getElementById('voice-audio');
        if (root) root.appendChild(audio);
        audioNodes.set(remoteId, audio);
      }
      audio.srcObject = event.streams[0];
      audio.play().catch(() => status('اضغطي بدء الصوت للسماح بتشغيل صوت الآخرين', true));
      status('الصوت المباشر متصل', true);
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === 'failed' || pc.connectionState === 'disconnected' || pc.connectionState === 'closed') {
        dropPeer(remoteId);
      }
    };
    return pc;
  }

  async function offerTo(remoteId) {
    if (!joined || !remoteId || userId.localeCompare(remoteId) >= 0 || peers.has(remoteId)) return;
    const pc = makePeer(remoteId);
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      await send(remoteId, 'offer', { description: pc.localDescription.toJSON() });
    } catch (error) {
      dropPeer(remoteId);
      throw error;
    }
  }

  async function flushIce(remoteId, pc) {
    const queued = pendingIce.get(remoteId) || [];
    pendingIce.delete(remoteId);
    for (const candidate of queued) {
      try { await pc.addIceCandidate(candidate); } catch (_) {}
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
        try { await pc.addIceCandidate(payload.candidate); } catch (_) {}
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
          if (remoteId && remoteId !== userId) offerTo(remoteId).catch(error => status(error.message));
        });
      });

    await new Promise((resolve, reject) => {
      const timeout = setTimeout(() => reject(new Error('انتهت مهلة الاتصال بخدمة الغرف الصوتية.')), 12000);
      channel.subscribe(async state => {
        if (state === 'SUBSCRIBED') {
          clearTimeout(timeout);
          try {
            await channel.track({ user_id: userId, joined_at: new Date().toISOString() });
            joined = true;
            // Re-check presence after tracking: the initial presence sync may have
            // happened before joined became true, leaving one side without an offer.
            const present = channel.presenceState();
            Object.values(present).flat().forEach(entry => {
              const remoteId = entry?.user_id;
              if (remoteId && remoteId !== userId) {
                offerTo(remoteId).catch(error => status('تعذّر بدء الاتصال مع أحد المشاركين: ' + error.message));
              }
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
  }

  function toggleMute() {
    if (!localStream) return muted;
    muted = !muted;
    localStream.getAudioTracks().forEach(track => { track.enabled = !muted; });
    status(muted ? 'الميكروفون مكتوم' : 'الميكروفون يعمل', true);
    return muted;
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
    const root = document.getElementById('voice-audio');
    if (root) root.innerHTML = '';
    status('تم إيقاف الصوت');
  }

  return { join, leave, toggleMute, get muted() { return muted; } };
}
