'use strict';
/* TS.MOTION_PRESETS — ワンタップ適用のモーション組み合わせプリセット（仕様書9章）
   各エントリの motion は scene.motion をまるごと置換する（hold含む。Undo可）。
   in/out/loop の各プリセットidは TS.motion.PRESETS のものを参照する。 */
(function () {
  var g = (typeof window !== 'undefined') ? window : globalThis;
  g.TS = g.TS || {};

  g.TS.MOTION_PRESETS = [
    // ---- 基本 ----
    { id: 'mp_simple', name: 'シンプル', desc: 'フェードのみの控えめ演出', cat: '基本',
      motion: { in: { preset: 'fade', duration: 0.4, easing: 'easeOut' },
                out: { preset: 'fadeOut', duration: 0.35, easing: 'easeIn' },
                loop: [], stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.5 } },
    { id: 'mp_classic', name: '定番テロップ', desc: 'ふわっと登場＋照りの定番', cat: '基本',
      motion: { in: { preset: 'fadeScale', duration: 0.45, easing: 'easeOut', intensity: 1 },
                out: null, loop: [{ preset: 'shine', period: 3 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.55 } },
    { id: 'mp_slideup', name: 'スライドアップ', desc: '下から入って上へ抜ける', cat: '基本',
      motion: { in: { preset: 'slide', duration: 0.5, direction: 'up', easing: 'easeOut', intensity: 1 },
                out: { preset: 'slideOut', duration: 0.4, direction: 'up', easing: 'easeIn', intensity: 1 },
                loop: [], stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.4 } },

    // ---- 強調（YouTube/実況向け） ----
    { id: 'mp_pop', name: 'ポップ強調', desc: '弾んで登場・弾んで退場', cat: '強調',
      motion: { in: { preset: 'pop', duration: 0.42, easing: 'backOut', intensity: 1 },
                out: { preset: 'popOut', duration: 0.3, easing: 'backIn', intensity: 1 },
                loop: [{ preset: 'shine', period: 3 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.2 } },
    { id: 'mp_stamp', name: 'スタンプ', desc: '叩きつけて着地', cat: '強調',
      motion: { in: { preset: 'stamp', duration: 0.55, easing: 'easeOut', intensity: 1.2 },
                out: { preset: 'fadeOut', duration: 0.3, easing: 'easeIn' },
                loop: [], stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.3 } },
    { id: 'mp_punch', name: 'パンチイン', desc: '大→決めて鼓動', cat: '強調',
      motion: { in: { preset: 'punchIn', duration: 0.35, easing: 'easeOut', intensity: 1.2 },
                out: { preset: 'zoomOut', duration: 0.3, easing: 'easeIn', intensity: 1 },
                loop: [{ preset: 'pulse', period: 1.2, intensity: 0.7 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.2 } },
    { id: 'mp_shake', name: 'シェイク', desc: '震えながら登場', cat: '強調',
      motion: { in: { preset: 'shake', duration: 0.7, easing: 'linear', intensity: 1.2 },
                out: { preset: 'fadeOut', duration: 0.3, easing: 'easeIn' },
                loop: [], stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.2 } },

    // ---- パチンコ演出 ----
    { id: 'mp_dodon', name: 'ドドン！', desc: '極大→着地＋発光＋高速照り', cat: 'パチンコ',
      motion: { in: { preset: 'dodon', duration: 0.7, easing: 'linear', intensity: 1.4 },
                out: null,
                loop: [{ preset: 'shine', period: 1.6 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.6 } },
    { id: 'mp_kakutei', name: '確定パカッ', desc: '中央から開閉＋グロー', cat: 'パチンコ',
      motion: { in: { preset: 'pakka', duration: 0.38, easing: 'easeInOut' },
                out: { preset: 'pakkaOut', duration: 0.35, easing: 'easeInOut' },
                loop: [{ preset: 'shine', period: 2 }, { preset: 'glowPulse', period: 1.2, intensity: 1 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.6 } },
    { id: 'mp_rainbow', name: '虹色明滅', desc: '色相サイクル＋明滅＋発光', cat: 'パチンコ',
      motion: { in: { preset: 'pop', duration: 0.4, easing: 'backOut', intensity: 1 },
                out: null,
                loop: [{ preset: 'rainbow', period: 1.1 }, { preset: 'flicker', period: 1.7, intensity: 0.6 },
                       { preset: 'glowPulse', period: 0.9, intensity: 1.2 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.8 } },
    { id: 'mp_yokoku', name: '予告フェード', desc: 'ゆっくり浮かび上がる', cat: 'パチンコ',
      motion: { in: { preset: 'fade', duration: 1.9, easing: 'easeInOut' },
                out: null,
                loop: [{ preset: 'glowPulse', period: 2.4, intensity: 0.8 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.6 } },
    { id: 'mp_shine_rush', name: 'シャイン連打', desc: '照りを高速で連打', cat: 'パチンコ',
      motion: { in: { preset: 'fadeScale', duration: 0.4, easing: 'easeOut', intensity: 1 },
                out: null,
                loop: [{ preset: 'shine', period: 0.75 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.6 } },

    // ---- デジタル/サイバー ----
    { id: 'mp_glitch', name: 'グリッチ登場', desc: '乱れて出現・時々明滅', cat: 'サイバー',
      motion: { in: { preset: 'glitch', duration: 0.55, easing: 'linear', intensity: 1 },
                out: { preset: 'blurOut', duration: 0.3, easing: 'easeIn', intensity: 1 },
                loop: [{ preset: 'flicker', period: 2.3, intensity: 0.4 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.4 } },
    { id: 'mp_type', name: 'タイプライター', desc: '1字ずつ打刻して表示', cat: 'サイバー',
      motion: { in: { preset: 'typewriter', duration: 0.05, easing: 'linear' },
                out: { preset: 'fadeOut', duration: 0.35, easing: 'easeIn' },
                loop: [],
                stagger: { enabled: true, per: 'char', amount: 0.09 }, hold: 2.5 } },

    // ---- TikTok/ショート字幕 ----
    { id: 'mp_caption', name: 'キャプションポップ', desc: '単語ごとにポンポン', cat: 'TikTok',
      motion: { in: { preset: 'pop', duration: 0.3, easing: 'backOut', intensity: 1 },
                out: { preset: 'fadeOut', duration: 0.25, easing: 'easeIn' },
                loop: [],
                stagger: { enabled: true, per: 'word', amount: 0.14 }, hold: 2.2 } },
    { id: 'mp_wordbounce', name: 'ワードバウンス', desc: '文字が落ちて弾む', cat: 'TikTok',
      motion: { in: { preset: 'bound', duration: 0.5, easing: 'bounceOut', intensity: 1 },
                out: { preset: 'slideOut', duration: 0.3, direction: 'down', easing: 'easeIn', intensity: 0.8 },
                loop: [],
                stagger: { enabled: true, per: 'char', amount: 0.05 }, hold: 2.3 } },
    { id: 'mp_wave_ride', name: '波乗り', desc: '波打ちながら漂う', cat: 'TikTok',
      motion: { in: { preset: 'slide', duration: 0.45, direction: 'up', easing: 'backOut', intensity: 0.8 },
                out: { preset: 'fadeOut', duration: 0.3, easing: 'easeIn' },
                loop: [{ preset: 'wave', period: 1.6, intensity: 1 }],
                stagger: { enabled: true, per: 'char', amount: 0.05 }, hold: 2.5 } },
    { id: 'mp_fuwafuwa', name: 'ふわふわ浮遊', desc: 'ボケ出現＋ずっと浮遊', cat: 'TikTok',
      motion: { in: { preset: 'blurIn', duration: 0.6, easing: 'easeOut', intensity: 1 },
                out: { preset: 'blurOut', duration: 0.45, easing: 'easeIn', intensity: 1 },
                loop: [{ preset: 'float', period: 2.6, intensity: 1 }],
                stagger: { enabled: false, per: 'char', amount: 0.04 }, hold: 2.6 } },
    { id: 'mp_flip3d', name: 'フリップ3D', desc: '文字が順にめくれる', cat: 'TikTok',
      motion: { in: { preset: 'flip', duration: 0.5, easing: 'backOut', intensity: 1 },
                out: { preset: 'flipOut', duration: 0.35, easing: 'backIn', intensity: 1 },
                loop: [],
                stagger: { enabled: true, per: 'char', amount: 0.06 }, hold: 2.4 } }
  ];

  g.TS.MOTION_PRESET_CATS = ['基本', '強調', 'パチンコ', 'サイバー', 'TikTok'];
})();
