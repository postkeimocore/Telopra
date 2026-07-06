'use strict';
// フォントカタログ（契約書§6.8）— telop_preview.html 実績の19書体＋ウェイト表
(function () {
  window.TS = window.TS || {};

  // { family, label, cat, weights }。weights は Google Fonts 提供の実ウェイト（昇順）
  TS.FONTS = [
    // ゴシック
    { family: 'Noto Sans JP',        label: 'Noto Sans JP',        cat: 'gothic',  weights: [300, 500, 700, 900] },
    { family: 'Zen Kaku Gothic New', label: 'Zen Kaku Gothic New', cat: 'gothic',  weights: [300, 500, 700, 900] },
    // 丸ゴシック
    { family: 'M PLUS Rounded 1c',   label: 'M PLUS Rounded 1c',   cat: 'maru',    weights: [300, 500, 700, 900] },
    { family: 'Zen Maru Gothic',     label: 'Zen Maru Gothic',     cat: 'maru',    weights: [300, 500, 700, 900] },
    // 明朝・セリフ
    { family: 'Noto Serif JP',       label: 'Noto Serif JP',       cat: 'mincho',  weights: [300, 500, 700, 900] },
    { family: 'Shippori Mincho B1',  label: 'Shippori Mincho B1',  cat: 'mincho',  weights: [400, 500, 700, 800] },
    { family: 'Zen Antique',         label: 'Zen Antique',         cat: 'mincho',  weights: [400] },
    { family: 'Kaisei Decol',        label: 'Kaisei Decol',        cat: 'mincho',  weights: [400, 500, 700] },
    // デザイン・インパクト
    { family: 'Dela Gothic One',     label: 'Dela Gothic One',     cat: 'design',  weights: [400] },
    { family: 'Train One',           label: 'Train One',           cat: 'design',  weights: [400] },
    { family: 'Reggae One',          label: 'Reggae One',          cat: 'design',  weights: [400] },
    { family: 'RocknRoll One',       label: 'RocknRoll One',       cat: 'design',  weights: [400] },
    { family: 'Rampart One',         label: 'Rampart One',         cat: 'design',  weights: [400] },
    // 特殊造形
    { family: 'DotGothic16',         label: 'DotGothic16',         cat: 'tokusyu', weights: [400] },
    { family: 'Stick',               label: 'Stick',               cat: 'tokusyu', weights: [400] },
    { family: 'Yuji Syuku',          label: 'Yuji Syuku',          cat: 'tokusyu', weights: [400] },
    // 手書き・ポップ
    { family: 'Mochiy Pop One',      label: 'Mochiy Pop One',      cat: 'hand',    weights: [400] },
    { family: 'Hachi Maru Pop',      label: 'Hachi Maru Pop',      cat: 'hand',    weights: [400] },
    { family: 'Yusei Magic',         label: 'Yusei Magic',         cat: 'hand',    weights: [400] }
  ];

  var LINK_ID = 'ts-fonts-css2';                 // 二重注入防止用
  var SAMPLE = '今なら無料体験金';               // ロード確認用サンプル文字列（契約書§6.8）

  // family 名からカタログエントリを引く
  function findFont(family) {
    for (var i = 0; i < TS.FONTS.length; i++) {
      if (TS.FONTS[i].family === family) return TS.FONTS[i];
    }
    return null;
  }

  // css2 の family= パラメータ。複数ウェイトは :wght@軸、単一ウェイト書体は軸指定なし
  function familyParam(f) {
    var name = f.family.replace(/ /g, '+');
    if (f.weights.length > 1) return 'family=' + name + ':wght@' + f.weights.join(';');
    return 'family=' + name;
  }

  TS.fonts = {
    // カテゴリ [id, 表示名]
    CATS: [
      ['gothic', 'ゴシック'],
      ['maru', '丸ゴシック'],
      ['mincho', '明朝・セリフ'],
      ['design', 'デザイン・インパクト'],
      ['tokusyu', '特殊造形'],
      ['hand', '手書き・ポップ']
    ],

    // 全ファミリを1本の Google Fonts css2 <link> として <head> に注入（冪等）
    injectLink: function () {
      var link = document.getElementById(LINK_ID);
      if (link) return link;
      var url = 'https://fonts.googleapis.com/css2?' +
        TS.FONTS.map(familyParam).join('&') + '&display=swap';
      link = document.createElement('link');
      link.id = LINK_ID;
      link.rel = 'stylesheet';
      link.href = url;
      document.head.appendChild(link);
      return link;
    },

    // 指定ファミリ・ウェイトのロード完了を待つ（計測前に await 必須）
    ensure: function (family, weight) {
      var w = TS.fonts.nearestWeight(family, weight);
      return document.fonts.load(w + ' 130px "' + family + '"', SAMPLE);
    },

    // カタログ内で希望ウェイトに最も近い実ウェイトを返す（同距離なら太い方）
    nearestWeight: function (family, w) {
      var f = findFont(family);
      var target = (typeof w === 'number' && isFinite(w)) ? w : 400;
      if (!f || !f.weights.length) return target;
      var best = f.weights[0];
      var bd = Math.abs(best - target);
      for (var i = 1; i < f.weights.length; i++) {
        var d = Math.abs(f.weights[i] - target);
        if (d < bd || (d === bd && f.weights[i] > best)) { best = f.weights[i]; bd = d; }
      }
      return best;
    }
  };
})();
