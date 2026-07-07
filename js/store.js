'use strict';
// TS.store — 状態・履歴（契約書 §6.7）。履歴はシーンJSONの深いスナップショット、上限100
(function () {
  window.TS = window.TS || {};

  var MAX_HISTORY = 100;

  var current = null;        // 現在のシーン（get() で参照。外部からの直接変更は禁止）
  var history = [];          // スナップショット列
  var index = -1;            // 現在位置
  var transientActive = false; // 未確定の transient 変更があるか（スライダードラッグ中）
  var subs = [];

  function clone(s) { return TS.scene.clone(s); }

  function notify(meta) {
    subs.slice().forEach(function (fn) {
      try { fn(current, meta); } catch (e) { console.error(e); }
    });
  }

  // 現在状態をスナップショットとして積む（redo 枝は破棄、上限100）
  function pushHistory() {
    history = history.slice(0, index + 1);
    history.push(clone(current));
    if (history.length > MAX_HISTORY) history.shift();
    index = history.length - 1;
  }

  function init(scene) {
    current = TS.scene.normalize(scene || TS.scene.create());
    history = [clone(current)];
    index = 0;
    transientActive = false;
  }

  function get() { return current; }

  // mutator(draft) がクローンを書き換える。transient:true は履歴を積まない（commit で確定）
  function set(mutator, opts) {
    var transient = !!(opts && opts.transient);
    var draft = clone(current);
    mutator(draft);
    current = draft;
    if (transient) {
      transientActive = true;
    } else {
      transientActive = false;
      pushHistory();
    }
    notify({ transient: transient });
  }

  // シーンを載せ替え、履歴をそのシーンで作り直す（プロジェクトのテロップ切替用）。
  // 通常の set と違い履歴を積まずリセットするため、テロップを跨いだ undo（=別テロップの内容が
  // 現テロップに混入し saveCurrent で誤上書き＝データ喪失）を構造的に防ぐ。notify で全UI再描画。
  function load(scene) {
    current = TS.scene.normalize(scene || TS.scene.create());
    history = [clone(current)];
    index = 0;
    transientActive = false;
    notify({ transient: false });
  }

  // transient 連続変更を1履歴に確定（label は将来のUI表示用。現状未使用）
  function commit(label) {
    void label;
    if (!transientActive) return;
    transientActive = false;
    pushHistory();
  }

  function subscribe(fn) {
    subs.push(fn);
    return function () {
      var i = subs.indexOf(fn);
      if (i >= 0) subs.splice(i, 1);
    };
  }

  function canUndo() { return index > 0 || transientActive; }
  function canRedo() { return index < history.length - 1; }

  function undo() {
    if (transientActive) commit(); // ドラッグ途中の undo はまず確定してから1つ戻す
    if (index <= 0) return;
    index--;
    current = clone(history[index]);
    notify({ transient: false });
  }

  function redo() {
    if (index >= history.length - 1) return;
    index++;
    current = clone(history[index]);
    notify({ transient: false });
  }

  // プリセット適用: layers / shadows を置換（text / canvas は維持）。履歴1件
  function applyPreset(preset) {
    set(function (draft) {
      draft.layers = clone(preset.layers || []);
      draft.shadows = clone(preset.shadows || []);
    });
  }

  TS.store = {
    init: init,
    get: get,
    set: set,
    load: load,
    commit: commit,
    subscribe: subscribe,
    undo: undo,
    redo: redo,
    canUndo: canUndo,
    canRedo: canRedo,
    applyPreset: applyPreset
  };
})();
