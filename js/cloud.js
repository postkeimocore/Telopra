'use strict';
/* TS.cloud — 匿名ID方式のクラウド保存クライアント（§7・B方式）
   - 初回アクセスで匿名IDを自動発行し localStorage に保存。IDごとに保存領域。
   - Cloudflare Worker + KV（無料枠）へ save/list/load/delete。150件超はサーバ側で最古削除（FIFO）。
   - ★ Worker 未デプロイ時（API_BASE 空）は「この端末だけのローカル保存」で動作する（すぐ使える）。
     worker/README.md の手順で Worker をデプロイし、下の API_BASE を設定するとクラウド共有になる。 */
(function () {
  window.TS = window.TS || {};

  // ★ デプロイした Worker の URL をここに設定（例: 'https://telopra-cloud.xxxx.workers.dev'）。空ならローカル保存。
  var API_BASE = '';

  var ID_KEY = 'tsAnonId';
  var LOCAL_KEY = 'tsHistoryLocal';
  var LIMIT = 150;

  function configured() { return !!API_BASE; }
  function mode() { return configured() ? 'cloud' : 'local'; }

  function anonId() {
    var id = null;
    try { id = localStorage.getItem(ID_KEY); } catch (e) { /* noop */ }
    if (!id) {
      id = 'u_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
      try { localStorage.setItem(ID_KEY, id); } catch (e) { /* noop */ }
    }
    return id;
  }

  // ---- ローカル保存（未設定時のフォールバック。この端末のみ） ----
  function localLoadAll() {
    try { var a = JSON.parse(localStorage.getItem(LOCAL_KEY) || '[]'); return Array.isArray(a) ? a : []; }
    catch (e) { return []; }
  }
  function localSaveAll(a) { localStorage.setItem(LOCAL_KEY, JSON.stringify(a)); }

  // ---- サーバAPI ----
  function req(action, body) {
    body = body || {};
    body.id = anonId();
    return fetch(API_BASE.replace(/\/$/, '') + '/' + action, {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
    }).then(function (r) {
      if (!r.ok) throw new Error('クラウドとの通信に失敗しました（' + r.status + '）');
      return r.json();
    });
  }

  // record: { name, scene, thumb(dataURL), savedAt }
  function save(record) {
    if (!configured()) {
      return new Promise(function (res, rej) {
        try {
          var arr = localLoadAll();
          var item = {
            key: 'h_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
            name: record.name, savedAt: record.savedAt, thumb: record.thumb, scene: record.scene
          };
          arr.unshift(item);
          while (arr.length > LIMIT) arr.pop();   // 最古(末尾)を削除＝FIFO
          localSaveAll(arr);
          res({ key: item.key });
        } catch (e) { rej(new Error('保存に失敗しました（ブラウザの容量上限）。古い履歴を削除してください。')); }
      });
    }
    return req('save', { name: record.name, scene: record.scene, thumb: record.thumb, savedAt: record.savedAt });
  }
  function list() {
    if (!configured()) {
      return Promise.resolve(localLoadAll().map(function (it) {
        return { key: it.key, name: it.name, savedAt: it.savedAt, thumb: it.thumb };
      }));
    }
    return req('list', {}).then(function (r) { return r.items || []; });
  }
  function load(key) {
    if (!configured()) {
      var it = localLoadAll().filter(function (x) { return x.key === key; })[0];
      return Promise.resolve(it ? { scene: it.scene } : null);
    }
    return req('load', { key: key });
  }
  function del(key) {
    if (!configured()) {
      return new Promise(function (res, rej) {
        try { localSaveAll(localLoadAll().filter(function (x) { return x.key !== key; })); res({ ok: true }); }
        catch (e) { rej(new Error('削除に失敗しました（ブラウザの保存領域）')); }
      });
    }
    return req('delete', { key: key });
  }

  TS.cloud = {
    configured: configured, mode: mode, anonId: anonId, LIMIT: LIMIT,
    save: save, list: list, load: load, del: del
  };
})();
