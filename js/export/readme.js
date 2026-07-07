'use strict';
/* TS.exportReadme — 書き出しREADMEの人間可読テキスト生成（§3-9）。
   Scene値を「UIと同じ日本語ラベル」でタブ構成（テキスト/デザイン/モーション）別に記録する。
   機械用語（fontWeight/stroke/fill 等）は使わない。 */
(function () {
  window.TS = window.TS || {};

  // ウェイト → 太さラベル（Noto Sans JP 等の一般的な段階）
  function weightLabel(w) {
    var t = { 100: '極細', 200: '極細', 300: '細字', 400: '標準', 500: '中字',
              600: '中太', 700: '太字', 800: '極太', 900: '最太' };
    return (t[w] || ('太さ' + w)) + '（' + w + '）';
  }
  // 縁取りの付き方
  function strokeAlignLabel(a) {
    return a === 'outside' ? '外側' : a === 'inside' ? '内側' : '中央';
  }
  // 整列
  function alignLabel(a) { return a === 'left' ? '左寄せ' : a === 'right' ? '右寄せ' : '中央'; }

  // 色オブジェクト → 読み文字列
  function colorLabel(c) {
    if (!c) return '—';
    if (typeof c === 'string') return c;
    if (c.type === 'solid') return '単色 ' + (c.value || '');
    if (c.type === 'linear') return '線形グラデーション（角度' + (c.angle == null ? 0 : c.angle) + '°・' + ((c.stops && c.stops.length) || 0) + '色）';
    if (c.type === 'conic') return '円錐グラデーション（' + ((c.stops && c.stops.length) || 0) + '色）';
    if (c.type === 'radial') return '放射グラデーション';
    return c.type;
  }

  // モーションプリセットid → 日本語名（TS.motion.PRESETS から動的に引く）
  function motionLabel(kind, id) {
    if (!id) return 'なし';
    try {
      var arr = TS.motion && TS.motion.PRESETS && TS.motion.PRESETS[kind];
      if (arr) {
        for (var i = 0; i < arr.length; i++) if (arr[i].id === id) return arr[i].name + '（' + id + '）';
      }
    } catch (e) { /* noop */ }
    return id;
  }

  // buildReadme(scene) -> string（タブ別: 【テキスト】【デザイン】【モーション】）
  function buildReadme(scene) {
    var L = [];
    var t = scene.text || {};
    L.push('Telopra 書き出しメモ（このテロップの編集内容）');
    L.push('※ 画面のタブ構成（テキスト / デザイン / モーション）と同じ並びで記録しています。');
    L.push('');

    L.push('― テキスト ―');
    L.push('文言: ' + String(t.content || '').replace(/\n/g, ' ⏎ '));
    L.push('フォント: ' + (t.font || '') + ' ／ 太さ: ' + weightLabel(t.weight));
    L.push('サイズ: ' + t.size + 'px ／ 字間: ' + t.letterSpacing + ' ／ 行間: ' + t.lineHeight + ' ／ 揃え: ' + alignLabel(t.align));
    if (t.italicSkew) L.push('傾き（斜体）: ' + t.italicSkew + '°');
    if (t.runs && t.runs.length) L.push('ジャンプ率（一部の文字だけ大小）: ' + t.runs.length + '箇所');
    L.push('');

    L.push('― デザイン ―');
    var layers = scene.layers || [];
    var any = false;
    // 見た目の重なりは配列順（下→上）。ユーザーに分かりやすいラベルで。
    layers.forEach(function (ly) {
      if (!ly || ly.visible === false) return;
      any = true;
      if (ly.type === 'fill') L.push('塗り: ' + colorLabel(ly.color));
      else if (ly.type === 'stroke') L.push('縁取り: ' + colorLabel(ly.color) + '（太さ ' + ly.width + '・位置 ' + strokeAlignLabel(ly.align) + '）');
      else if (ly.type === 'extrude') L.push('立体（ドロップシャドウ状の押し出し）: ' + ly.steps + '段・色 ' + ly.color + (ly.contact && ly.contact.enabled ? '・接地影あり' : ''));
      else if (ly.type === 'shine') L.push('照り（光沢が横切る）: あり');
    });
    if (!any) L.push('（デザインレイヤーなし）');
    (scene.shadows || []).forEach(function (s) {
      L.push('ドロップシャドウ: 色 ' + s.color + '・ずれ(' + (s.x || 0) + ',' + (s.y || 0) + ')・ぼかし ' + (s.blur || 0) + '・濃さ ' + (s.opacity == null ? 1 : s.opacity));
    });
    L.push('');

    L.push('― モーション ―');
    var m = scene.motion || {};
    L.push('登場: ' + (m['in'] ? motionLabel('in', m['in'].preset) + '・' + (m['in'].duration) + '秒' : 'なし'));
    if (m.loop && m.loop.length) {
      L.push('繰り返し: ' + m.loop.map(function (l) { return motionLabel('loop', l.preset) + '（周期' + (l.period) + '秒）'; }).join(' / '));
    } else {
      L.push('繰り返し: なし');
    }
    L.push('退場: ' + (m.out ? motionLabel('out', m.out.preset) + '・' + (m.out.duration) + '秒' : 'なし'));
    if (m.stagger && m.stagger.enabled) {
      var per = m.stagger.per === 'word' ? '単語' : m.stagger.per === 'line' ? '行' : '文字';
      L.push('文字ずらし（' + per + 'ごとに時間差）: あり・間隔' + m.stagger.amount + '秒');
    }
    L.push('表示時間: ' + (m.hold == null ? 2.55 : m.hold) + '秒');
    L.push('');
    return L.join('\n');
  }

  TS.exportReadme = {
    buildReadme: buildReadme,
    weightLabel: weightLabel,
    colorLabel: colorLabel,
    motionLabel: motionLabel
  };
})();
