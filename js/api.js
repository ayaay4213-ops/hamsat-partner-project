const BASE = 'https://hamsat-api.puter.work';

async function call(path, { method = 'GET', body } = {}) {
  const opts = { method, headers: {} };
  if (body !== undefined) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  let res;
  try {
    if (!globalThis.puter?.workers?.exec) {
      throw new Error('خدمة Puter Workers غير متاحة في هذه الصفحة');
    }
    res = await globalThis.puter.workers.exec(BASE + path, opts);
  } catch (e) {
    const error = new Error(e?.message || 'تعذّر الاتصال بخادم همسات. تحققي من الإنترنت ونشر Hamsat API.');
    error.cause = e;
    throw error;
  }
  if (!res || typeof res.json !== 'function' || typeof res.ok !== 'boolean') {
    throw new Error('استجابة غير صالحة من خادم همسات؛ تحققي من إعداد نشر Worker.');
  }
  let data = null;
  try { data = await res.json(); } catch (e) {}
  if (!res.ok) {
    const err = new Error((data && data.error) || 'حدث خطأ غير متوقع');
    err.status = res.status;
    throw err;
  }
  return data;
}

export const api = {
  me: () => call('/me'),
  saveProfile: (p) => call('/profile', { method: 'POST', body: p }),
  users: () => call('/users'),
  user: (handle) => call('/users/' + encodeURIComponent(handle)),
  wallet: () => call('/wallet'),
  claimDaily: () => call('/wallet/daily', { method: 'POST', body: {} }),
  rooms: () => call('/rooms'),
  createRoom: (r) => call('/rooms', { method: 'POST', body: r }),
  deleteRoom: (id) => call('/rooms/' + encodeURIComponent(id), { method: 'DELETE' }),
  gifts: () => call('/gifts')
};
