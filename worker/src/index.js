/* Telopra クラウド保存 Worker（§7・B方式）
   匿名IDごとに Scene JSON ＋ サムネを保存。150件超は最古を自動削除（FIFO）。
   KV レイアウト:
     idx:<id>        … メタ一覧 [{key,name,savedAt,thumb}]（新しい順・list/一覧表示用。thumb込み）
     rec:<id>:<key>  … 本体 {scene}（load時のみ読む）
   エンドポイント（すべて POST・JSON body {id, ...}）: /save /list /load /delete
   セキュリティ割り切り: IDを知られると他人がそのデータを見られる（知り合い配布用途で許容）。個人情報は載せない前提。 */

const LIMIT = 150;

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'content-type',
  'Access-Control-Max-Age': '86400',
};

function json(obj, status) {
  return new Response(JSON.stringify(obj), {
    status: status || 200,
    headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS),
  });
}

export default {
  async fetch(request, env) {
    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (request.method !== 'POST') return json({ error: 'POST only' }, 405);

    const KV = env.TELOPRA_KV;
    if (!KV) return json({ error: 'KV binding TELOPRA_KV 未設定' }, 500);

    const action = new URL(request.url).pathname.replace(/^\/+/, '').replace(/\/.*$/, '');
    let body;
    try { body = await request.json(); } catch (e) { return json({ error: 'JSON不正' }, 400); }

    const id = String(body.id || '');
    if (!/^u_[a-z0-9]{4,40}$/i.test(id)) return json({ error: '匿名IDが不正' }, 400);

    const idxKey = 'idx:' + id;
    const recKey = (k) => 'rec:' + id + ':' + k;
    const getIdx = async () => {
      const s = await KV.get(idxKey);
      try { return s ? JSON.parse(s) : []; } catch (e) { return []; }
    };

    if (action === 'save') {
      if (!body.scene || typeof body.scene !== 'object') return json({ error: 'sceneがありません' }, 400);
      const key = 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
      const meta = {
        key,
        name: String(body.name || '').slice(0, 60),
        savedAt: String(body.savedAt || '').slice(0, 32),
        thumb: String(body.thumb || '').slice(0, 400000), // dataURL上限（安全側）
      };
      await KV.put(recKey(key), JSON.stringify({ scene: body.scene }));
      let idx = await getIdx();
      idx.unshift(meta);
      const removed = idx.slice(LIMIT);   // 151件目以降＝最古
      idx = idx.slice(0, LIMIT);
      await KV.put(idxKey, JSON.stringify(idx));
      for (const m of removed) { try { await KV.delete(recKey(m.key)); } catch (e) { /* noop */ } }
      return json({ key });
    }

    if (action === 'list') {
      return json({ items: await getIdx() });
    }

    if (action === 'load') {
      const key = String(body.key || '');
      const s = await KV.get(recKey(key));
      if (!s) return json({ error: '見つかりません' }, 404);
      return new Response(s, { headers: Object.assign({ 'content-type': 'application/json; charset=utf-8' }, CORS) });
    }

    if (action === 'delete') {
      const key = String(body.key || '');
      const idx = (await getIdx()).filter((m) => m.key !== key);
      await KV.put(idxKey, JSON.stringify(idx));
      try { await KV.delete(recKey(key)); } catch (e) { /* noop */ }
      return json({ ok: true });
    }

    return json({ error: '不明なアクション: ' + action }, 404);
  },
};
