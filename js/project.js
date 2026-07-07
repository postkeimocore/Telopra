'use strict';
/* TS.project — 「まとめて作る」プロジェクト状態（IA_fix §3）
   単発＝テロップ1件 / まとめて＝複数件 を同じ制作UIに統合するための状態管理。
   状態 = 「Sceneの配列（プロジェクト）＋編集中インデックス」。
   編集中テロップは常に TS.store.current に載せる → メインの制作UI（プレビュー＋テキスト/デザイン/
   モーションの各パネル）がそのまま "編集中のテロップ" をフル編集できる（縁/グラデ/シャドウ/モーション
   パラメータ/ジャンプ率まで単発と同一）。テロップ切替時に編集中Sceneを保存＆ロードする。 */
(function () {
  window.TS = window.TS || {};

  var scenes = [];      // プロジェクト内の全テロップ Scene
  var index = 0;        // 編集中インデックス
  var active = false;   // プロジェクトモードか
  var subs = [];

  function notify() { subs.slice().forEach(function (fn) { try { fn(); } catch (e) { console.error(e); } }); }
  function clone(s) { return TS.scene.clone(s); }

  // 編集中の store.current をプロジェクトへ保存
  function saveCurrent() {
    if (active && scenes.length && TS.store && TS.store.get) scenes[index] = clone(TS.store.get());
  }
  // scenes[i] を store へロード。TS.store.load は履歴をそのテロップで作り直すため、テロップを跨いだ
  // undo（別テロップ内容の混入→saveCurrent誤上書き＝データ喪失）を防ぐ。各パネルは store 購読で追従。
  function loadInto(i) {
    TS.store.load(clone(scenes[i]));
  }

  function start(list) {
    if (!list || !list.length) return;
    scenes = list.map(function (s) { return TS.scene.normalize(clone(s)); });
    index = 0;
    active = true;
    loadInto(0);
    notify();
  }
  // 終了して単発へ戻す（編集中テロップを現在のSceneとして残す）
  function stop() {
    saveCurrent();
    active = false;
    scenes = [];
    index = 0;
    notify();
  }
  function select(i) {
    if (!active || i < 0 || i >= scenes.length || i === index) return;
    saveCurrent();
    index = i;
    loadInto(i);
    notify();
  }
  // 新規テロップを編集中の直後に追加（現在の見た目を引き継ぎ、文言だけ空に）
  function add() {
    if (!active) return;
    saveCurrent();
    var s = TS.scene.normalize(clone(TS.store.get()));
    s.text.content = '新しいテロップ';
    s.text.runs = [];
    scenes.splice(index + 1, 0, s);
    index = index + 1;
    loadInto(index);
    notify();
  }
  function duplicate(i) {
    if (!active || i < 0 || i >= scenes.length) return;
    saveCurrent();
    var s = TS.scene.normalize(clone(scenes[i]));
    scenes.splice(i + 1, 0, s);
    index = i + 1;
    loadInto(index);
    notify();
  }
  function remove(i) {
    if (!active || scenes.length <= 1 || i < 0 || i >= scenes.length) return;
    saveCurrent();
    scenes.splice(i, 1);
    if (index >= scenes.length) index = scenes.length - 1;
    else if (i < index) index -= 1;
    loadInto(index);
    notify();
  }
  function move(i, dir) {
    var j = i + dir;
    if (!active || i < 0 || i >= scenes.length || j < 0 || j >= scenes.length) return;
    saveCurrent();
    var t = scenes[i]; scenes[i] = scenes[j]; scenes[j] = t;
    if (index === i) index = j; else if (index === j) index = i;
    notify();
  }

  // items配列 → Scene配列（手入力/台本AIの共通ビルダー）
  // item: { text, designId?, motionId? }。base=見た目の起点（既定=現在のScene）。
  function sceneFromItem(item, base) {
    var b = clone(base || TS.store.get());
    b.text.content = String((item && item.text) || '');
    b.text.runs = [];
    if (item && item.designId) {
      var p = (TS.PRESETS || []).filter(function (x) { return x.id === item.designId; })[0];
      if (p) { b.layers = clone(p.layers || []); b.shadows = clone(p.shadows || []); }
    }
    if (item && item.motionId) {
      var mp = (TS.MOTION_PRESETS || []).filter(function (x) { return x.id === item.motionId; })[0];
      if (mp && mp.motion) b.motion = clone(mp.motion);
    }
    b.transform = { x: 0, y: 0, scale: 1, rotate: 0 };
    return TS.scene.normalize(b);
  }
  // items配列からプロジェクト開始（起点は現在のScene＝現在の見た目を引き継ぐ）
  function startFromItems(items) {
    if (!items || !items.length) return;
    var base = clone(TS.store.get());
    start(items.map(function (it) { return sceneFromItem(it, base); }));
  }

  TS.project = {
    active: function () { return active; },
    scenes: function () { return scenes; },
    index: function () { return index; },
    count: function () { return scenes.length; },
    subscribe: function (fn) { subs.push(fn); return function () { var i = subs.indexOf(fn); if (i >= 0) subs.splice(i, 1); }; },
    start: start, startFromItems: startFromItems, sceneFromItem: sceneFromItem,
    stop: stop, select: select, add: add, duplicate: duplicate, remove: remove, move: move, saveCurrent: saveCurrent
  };
})();
