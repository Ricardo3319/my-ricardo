/* 声音：背景音乐和环境音，默认关着。右上角的小喇叭打开面板：开关、换曲子、两个音量、加自己的音乐。
   自带的四首曲子和鸟叫、虫鸣、风声，都是这里用 Web Audio 现合成的原创声音，不用音频文件，也不用游戏的音乐。
   站里另放的曲子列在 audio/tracks.json；自己加的存在这台设备浏览器的 IndexedDB 里，只在本机放，不上传。
   右上角面板换页时留着不动（js/nav.js），所以换页时音乐不断。 */
(function () {
  var Ctx = window.AudioContext || window.webkitAudioContext;
  var hud = document.querySelector(".hud");
  var toggle = document.querySelector("[data-sound]");
  var me = document.currentScript;
  if (!Ctx || !hud || !toggle || !me) return;
  var root = document.documentElement;
  var site = new URL("../", me.src);

  // ---------------------------------------------------------------- 设置：存在本机

  var local = (function () {
    try {
      return window.localStorage;
    } catch (error) {
      return null;
    }
  })();
  var settings = { on: false, music: 0.6, ambience: 0.5, track: "auto" };
  try {
    var kept = JSON.parse(local.getItem("sound.settings"));
    if (kept && typeof kept === "object") {
      settings.on = kept.on === true;
      if (typeof kept.music === "number") settings.music = Math.min(1, Math.max(0, kept.music));
      if (typeof kept.ambience === "number") settings.ambience = Math.min(1, Math.max(0, kept.ambience));
      if (typeof kept.track === "string") settings.track = kept.track;
    }
  } catch (error) {
    /* 没存过或读不到，用默认。 */
  }

  function keep() {
    try {
      if (local) local.setItem("sound.settings", JSON.stringify(settings));
    } catch (error) {
      /* 存不进时，这次照样能听。 */
    }
  }

  // ---------------------------------------------------------------- 曲子：四季各一首，原创

  // 旋律一个记号一个八分音符："-" 接着上一个音，"." 不出声，"|" 只是隔开小节好读。
  // 和弦一小节一个。低音、琶音、鼓各是一小节八格的样子，每小节重复。
  var SONGS = {
    spring: {
      name: "春 · 田埂",
      bpm: 100,
      lead: "reed",
      chords: "C G Am F C G F C Am Em F C Dm G C C",
      melody:
        "E5 - D5 C5 E5 - G5 - | D5 - - B4 D5 - G5 - | C5 - E5 - A5 - G5 E5 | F5 - E5 D5 C5 - - - |" +
        "E5 - D5 C5 E5 - G5 - | A5 - G5 - D5 - B4 - | A4 - C5 - F5 - E5 D5 | C5 - - - . . . . |" +
        "A4 - C5 - E5 - D5 C5 | B4 - E5 - G5 - E5 - | A5 - G5 F5 E5 - C5 - | G5 - E5 - C5 - E5 - |" +
        "F5 - E5 D5 A4 - D5 - | G5 - F5 - D5 - B4 - | C5 - E5 G5 C6 - G5 E5 | C5 - - - . . . .",
      bass: "R . . . F . . .",
      arp: "0 1 2 1 0 1 2 1",
      drums: "k . h . k . h .",
    },
    summer: {
      name: "夏 · 午后",
      bpm: 116,
      lead: "pulse",
      chords: "G C D G Em C D D G C D Em C D G G",
      melody:
        "B4 - D5 - G5 - D5 - | E5 - G5 - E5 D5 C5 - | D5 - F#5 - A5 - F#5 D5 | G5 - - - D5 - B4 - |" +
        "E5 - G5 - B5 - G5 E5 | C5 - E5 - G5 - E5 - | F#5 - E5 - D5 - A4 - | D5 - - - . . F#5 - |" +
        "G5 - A5 - B5 - G5 - | E5 - G5 - E5 - C5 - | D5 - F#5 - A5 - G5 F#5 | E5 - - - B4 - E5 - |" +
        "C5 - E5 - G5 - A5 G5 | F#5 - D5 - A4 - D5 - | G5 - D5 - B4 - D5 - | G4 - - - . . . .",
      bass: "R . R . F . R .",
      arp: "0 . 2 . 1 . 2 .",
      drums: "k . h h s . h .",
    },
    autumn: {
      name: "秋 · 收成",
      bpm: 88,
      lead: "flute",
      chords: "Am F C G Am F G G F G Am Am Dm Em Am Am",
      melody:
        "A4 - C5 - E5 - - - | F5 - E5 - C5 - A4 - | G4 - C5 - E5 - D5 C5 | D5 - - - B4 - G4 - |" +
        "A4 - C5 - E5 - A5 - | G5 - F5 - E5 - C5 - | D5 - E5 - D5 - B4 - | G4 - - - . . . . |" +
        "A4 - C5 - F5 - E5 - | D5 - B4 - G4 - B4 - | C5 - - - E5 - A5 - | G5 - E5 - . . . . |" +
        "F5 - E5 - D5 - A4 - | B4 - E5 - G5 - E5 - | A5 - G5 E5 C5 - B4 - | A4 - - - . . . .",
      bass: "R . . . F . R .",
      arp: "0 . 1 . 2 . 1 .",
      drums: "k . . h k . . h",
    },
    winter: {
      name: "冬 · 炉火",
      bpm: 72,
      lead: "bell",
      chords: "Em C G D Em C D D C D Em Em Am D Em Em",
      melody:
        "E5 - - - G5 - - - | E5 - - - C5 - - - | D5 - - - B4 - - - | A4 - - - . . . . |" +
        "B4 - E5 - G5 - - - | A5 - G5 - E5 - - - | F#5 - - - D5 - - - | . . . . . . . . |" +
        "G5 - - - E5 - C5 - | F#5 - - - A5 - - - | G5 - F#5 - E5 - - - | B4 - - - . . . . |" +
        "C5 - E5 - A5 - - - | F#5 - E5 - D5 - - - | E5 - - - B4 - - - | E5 - - - . . . .",
      bass: "R . . . . . . .",
      arp: "0 . . . 2 . . .",
      drums: ". . . . . . . .",
    },
  };
  var SEASONS = ["spring", "summer", "autumn", "winter"];

  var SEMI = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

  function midi(name) {
    var m = /^([A-G])(#|b)?(\d)$/.exec(name);
    return SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0) + 12 * (+m[3] + 1);
  }

  function hz(n) {
    return 440 * Math.pow(2, (n - 69) / 12);
  }

  function chord(sym) {
    var m = /^([A-G])(#|b)?(m)?(7)?$/.exec(sym);
    var tones = m[3] ? [0, 3, 7] : [0, 4, 7];
    if (m[4]) tones.push(10);
    return { root: SEMI[m[1]] + (m[2] === "#" ? 1 : m[2] === "b" ? -1 : 0), tones: tones };
  }

  // 把谱子读成一格一格的音：哪一格起音、响几格。
  function compile(song) {
    var tokens = song.melody.replace(/\|/g, " ").trim().split(/\s+/);
    var notes = [];
    tokens.forEach(function (t, i) {
      if (t === "-" || t === ".") return;
      var length = 1;
      while (tokens[i + length] === "-") length += 1;
      notes[i] = { freq: hz(midi(t)), steps: length };
    });
    return {
      name: song.name,
      lead: song.lead,
      step: 60 / song.bpm / 2,
      length: tokens.length,
      notes: notes,
      chords: song.chords.split(" ").map(chord),
      bass: song.bass.split(" "),
      arp: song.arp.split(" "),
      drums: song.drums.split(" "),
    };
  }

  // ---------------------------------------------------------------- 合成

  var ctx = null;
  var master, musicBus, ambienceBus, noise;

  function audio() {
    if (ctx) return ctx;
    ctx = new Ctx();
    master = ctx.createGain();
    master.gain.value = 1.8;
    master.connect(ctx.destination);
    musicBus = ctx.createGain();
    musicBus.connect(master);
    ambienceBus = ctx.createGain();
    ambienceBus.connect(master);
    noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    var data = noise.getChannelData(0);
    for (var i = 0; i < data.length; i += 1) data[i] = Math.random() * 2 - 1;
    levels();
    return ctx;
  }

  // 音量滑块是线性的，听感按平方走。
  function levels() {
    if (ctx) {
      musicBus.gain.setTargetAtTime(settings.music * settings.music, ctx.currentTime, 0.05);
      ambienceBus.gain.setTargetAtTime(settings.ambience * settings.ambience, ctx.currentTime, 0.05);
    }
    if (player) player.volume = settings.music;
  }

  // 一个音：起音、衰减到持续、松开后收尾。
  function tone(type, freq, t, dur, vol, out, shape) {
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(vol, t + shape[0]);
    g.gain.exponentialRampToValueAtTime(Math.max(vol * shape[2], 0.0001), t + shape[0] + shape[1]);
    g.gain.setTargetAtTime(0.0001, t + dur, shape[3]);
    o.connect(g);
    g.connect(out);
    o.start(t);
    o.stop(t + dur + shape[3] * 6);
  }

  function hit(kind, t) {
    if (kind === "k") {
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.frequency.setValueAtTime(120, t);
      o.frequency.exponentialRampToValueAtTime(45, t + 0.12);
      g.gain.setValueAtTime(0.22, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(g);
      g.connect(musicBus);
      o.start(t);
      o.stop(t + 0.2);
      return;
    }
    var src = ctx.createBufferSource();
    var filter = ctx.createBiquadFilter();
    var gain = ctx.createGain();
    src.buffer = noise;
    filter.type = kind === "h" ? "highpass" : "bandpass";
    filter.frequency.value = kind === "h" ? 7000 : 1800;
    var vol = kind === "h" ? 0.035 : 0.06;
    var len = kind === "h" ? 0.04 : 0.09;
    gain.gain.setValueAtTime(vol, t);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + len);
    src.connect(filter);
    filter.connect(gain);
    gain.connect(musicBus);
    src.start(t, Math.random());
    src.stop(t + len + 0.02);
  }

  // 四种领奏的音色：簧片（春）、方波（夏）、长笛（秋）、钟（冬）。
  var LEADS = {
    reed: { type: "square", vol: 0.06, cut: 1800, shape: [0.01, 0.12, 0.6, 0.08] },
    pulse: { type: "square", vol: 0.05, cut: 2600, shape: [0.005, 0.08, 0.5, 0.06] },
    flute: { type: "triangle", vol: 0.16, cut: 3000, shape: [0.03, 0.2, 0.7, 0.12] },
    bell: { type: "sine", vol: 0.12, cut: 6000, shape: [0.005, 0.6, 0.08, 0.4] },
  };

  var song = null;
  var playing = "";
  var leadOut = null;
  var step = 0;
  var nextAt = 0;
  var ticking = 0;

  function play(name) {
    stopMusic();
    audio();
    song = compile(SONGS[name]);
    var lead = LEADS[song.lead];
    leadOut = ctx.createBiquadFilter();
    leadOut.type = "lowpass";
    leadOut.frequency.value = lead.cut;
    leadOut.connect(musicBus);
    step = 0;
    nextAt = ctx.currentTime + 0.12;
    ticking = window.setInterval(schedule, 25);
    playing = song.name;
    paint();
  }

  // 往前排一小段：每 25 毫秒看一眼，把接下来 0.2 秒里该响的音排好。
  function schedule() {
    if (!song || ctx.state !== "running") return;
    if (nextAt < ctx.currentTime - 0.05) nextAt = ctx.currentTime + 0.05; // 停过一阵：从现在接着放，不补停着时的音
    var ahead = ctx.currentTime + (document.hidden ? 1.2 : 0.2);
    while (nextAt < ahead) {
      sound(step, nextAt);
      nextAt += song.step;
      step = (step + 1) % song.length;
    }
  }

  function sound(i, t) {
    var lead = LEADS[song.lead];
    var bar = Math.floor(i / 8);
    var pos = i % 8;
    var c = song.chords[bar % song.chords.length];
    var note = song.notes[i];
    if (note) {
      var dur = note.steps * song.step * 0.92;
      tone(lead.type, note.freq, t, dur, lead.vol, leadOut, lead.shape);
      if (song.lead === "bell") tone("sine", note.freq * 2.76, t, dur * 0.4, lead.vol * 0.25, leadOut, [0.002, 0.3, 0.05, 0.2]);
    }
    var b = song.bass[pos];
    if (b === "R" || b === "F") {
      var low = 36 + c.root + (b === "F" ? 7 : 0);
      tone("triangle", hz(low < 40 ? low + 12 : low), t, song.step * 1.8, 0.16, musicBus, [0.01, 0.15, 0.6, 0.08]);
    }
    var a = song.arp[pos];
    if (/^\d$/.test(a)) {
      var soft = song.lead === "bell" ? "sine" : song.lead === "flute" ? "triangle" : "square";
      tone(soft, hz(60 + c.root + c.tones[+a % c.tones.length]), t, song.step * 0.9, soft === "square" ? 0.022 : 0.05, leadOut, [0.01, 0.1, 0.4, 0.06]);
    }
    var d = song.drums[pos];
    if (d !== ".") hit(d, t);
  }

  function stopMusic() {
    window.clearInterval(ticking);
    ticking = 0;
    song = null;
    if (leadOut) {
      var old = leadOut;
      window.setTimeout(function () {
        old.disconnect();
      }, 1500);
      leadOut = null;
    }
    if (player) player.pause();
  }

  // ---------------------------------------------------------------- 环境音：风、鸟、虫，跟着季节和钟点

  var weather = [];

  function ambience() {
    stopAmbience();
    audio();
    var season = root.getAttribute("data-season");
    var phase = root.getAttribute("data-phase");
    var night = phase === "night";

    // 风：一段噪声过低通，隔几秒变一阵。
    var wind = ctx.createBufferSource();
    var lp = ctx.createBiquadFilter();
    var gust = ctx.createGain();
    var level = { spring: 0.03, summer: 0.025, autumn: 0.07, winter: 0.12 }[season] * (night ? 0.7 : 1);
    var pitch = season === "winter" ? 900 : 500;
    wind.buffer = noise;
    wind.loop = true;
    lp.type = "lowpass";
    lp.frequency.value = pitch;
    gust.gain.value = level;
    wind.connect(lp);
    lp.connect(gust);
    gust.connect(ambienceBus);
    wind.start();
    weather.push({ node: wind });
    every(function () {
      gust.gain.setTargetAtTime(level * (0.4 + Math.random()), ctx.currentTime, 1.2);
      lp.frequency.setTargetAtTime(pitch * (0.7 + Math.random() * 0.8), ctx.currentTime, 1.5);
      return 2000 + Math.random() * 3000;
    });

    if (!night && season !== "winter") {
      var busy = (phase === "dawn" ? 2 : 1) * (season === "autumn" ? 0.5 : 1);
      every(function () {
        birdsong();
        return (2500 + Math.random() * 5000) / busy;
      });
    }
    if (night && season !== "winter") {
      every(function () {
        cricket();
        return 450 + Math.random() * 900;
      });
    }
  }

  function every(fn) {
    var job = { stop: false, timer: 0 };
    (function next() {
      if (job.stop) return;
      job.timer = window.setTimeout(next, fn());
    })();
    weather.push(job);
  }

  function pan(out) {
    if (!ctx.createStereoPanner) return out;
    var p = ctx.createStereoPanner();
    p.pan.value = Math.random() * 1.4 - 0.7;
    p.connect(out);
    return p;
  }

  function birdsong() {
    if (ctx.state !== "running") return;
    var t = ctx.currentTime + 0.05;
    var base = 2600 + Math.random() * 1800;
    var out = pan(ambienceBus);
    var count = 2 + Math.floor(Math.random() * 4);
    for (var i = 0; i < count; i += 1) {
      var s = t + i * (0.09 + Math.random() * 0.05);
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = "sine";
      o.frequency.setValueAtTime(base * (0.9 + Math.random() * 0.2), s);
      o.frequency.exponentialRampToValueAtTime(base * (1.2 + Math.random() * 0.4), s + 0.06);
      g.gain.setValueAtTime(0.0001, s);
      g.gain.exponentialRampToValueAtTime(0.05, s + 0.01);
      g.gain.exponentialRampToValueAtTime(0.0001, s + 0.08);
      o.connect(g);
      g.connect(out);
      o.start(s);
      o.stop(s + 0.1);
    }
  }

  function cricket() {
    if (ctx.state !== "running") return;
    var t = ctx.currentTime + 0.05;
    var o = ctx.createOscillator();
    var g = ctx.createGain();
    o.type = "sine";
    o.frequency.value = 4200 + Math.random() * 600;
    g.gain.setValueAtTime(0, t);
    for (var i = 0; i < 3; i += 1) {
      var s = t + i * 0.06;
      g.gain.setValueAtTime(0, s);
      g.gain.linearRampToValueAtTime(0.018, s + 0.01);
      g.gain.linearRampToValueAtTime(0, s + 0.04);
    }
    o.connect(g);
    g.connect(pan(ambienceBus));
    o.start(t);
    o.stop(t + 0.25);
  }

  function stopAmbience() {
    weather.forEach(function (w) {
      if (w.node) {
        try {
          w.node.stop();
        } catch (error) {
          /* 已经停了。 */
        }
      } else {
        w.stop = true;
        window.clearTimeout(w.timer);
      }
    });
    weather = [];
  }

  // ---------------------------------------------------------------- 站里的曲子和自己加的曲子

  var player = null;
  var blobUrl = "";
  var siteTracks = [];

  function playFile(url, name) {
    stopMusic();
    if (!player) {
      player = new Audio();
      player.loop = true;
    }
    if (blobUrl && blobUrl !== url) URL.revokeObjectURL(blobUrl);
    blobUrl = url.indexOf("blob:") === 0 ? url : "";
    player.src = url;
    player.volume = settings.music;
    playing = name;
    paint();
    var started = player.play();
    if (started && started.catch) {
      started.catch(function () {
        waitForTap();
      });
    }
  }

  function siteList() {
    return fetch(new URL("audio/tracks.json", site).href, { credentials: "same-origin" })
      .then(function (res) {
        return res.ok ? res.json() : [];
      })
      .then(function (list) {
        siteTracks = (Array.isArray(list) ? list : []).filter(function (t) {
          return t && typeof t.file === "string" && typeof t.name === "string";
        });
      })
      .catch(function () {
        siteTracks = [];
      });
  }

  function db() {
    return new Promise(function (ok, fail) {
      if (!window.indexedDB) return fail(new Error("这个浏览器存不了"));
      var req = indexedDB.open("farm-sound", 1);
      req.onupgradeneeded = function () {
        req.result.createObjectStore("tracks", { keyPath: "id" });
      };
      req.onsuccess = function () {
        ok(req.result);
      };
      req.onerror = function () {
        fail(req.error);
      };
    });
  }

  function shelf(mode, fn) {
    return db().then(function (d) {
      return new Promise(function (ok, fail) {
        var tx = d.transaction("tracks", mode);
        var req = fn(tx.objectStore("tracks"));
        tx.oncomplete = function () {
          ok(req && req.result);
        };
        tx.onerror = tx.onabort = function () {
          fail(tx.error);
        };
      });
    });
  }

  var mine = [];
  function mineList() {
    return shelf("readonly", function (s) {
      return s.getAll();
    }).then(
      function (all) {
        mine = (all || []).map(function (t) {
          return { id: t.id, name: t.name };
        });
      },
      function () {
        mine = [];
      }
    );
  }

  // ---------------------------------------------------------------- 开、关、换曲子

  var waiting = false;

  function choose() {
    var pick = settings.track;
    if (SONGS[pick]) return play(pick);
    if (pick.indexOf("site:") === 0) {
      var wanted = pick.slice(5);
      var found = siteTracks.filter(function (t) {
        return t.file === wanted;
      })[0];
      if (found) return playFile(new URL("audio/" + found.file, site).href, found.name);
    }
    if (pick.indexOf("mine:") === 0) {
      var id = pick.slice(5);
      return shelf("readonly", function (s) {
        return s.get(id);
      }).then(
        function (t) {
          if (t && settings.on && settings.track === pick) playFile(URL.createObjectURL(t.blob), t.name);
          else if (!t) autoPlay();
        },
        autoPlay
      );
    }
    autoPlay();
  }

  function autoPlay() {
    var season = root.getAttribute("data-season");
    play(SONGS[season] ? season : "spring");
  }

  function start() {
    audio();
    choose();
    ambience();
    ctx.resume().then(paint, paint);
    window.setTimeout(function () {
      if (settings.on && ctx.state !== "running") waitForTap();
    }, 300);
    paint();
  }

  function stop() {
    stopMusic();
    stopAmbience();
    if (ctx) ctx.suspend();
    waiting = false;
    playing = "";
    paint();
  }

  // 浏览器不让网页自己出声：上次开着的话，等访客在页面上随便点一下或按个键再出声。
  function waitForTap() {
    if (waiting) return;
    waiting = true;
    function go() {
      document.removeEventListener("pointerdown", go, true);
      document.removeEventListener("keydown", go, true);
      waiting = false;
      if (!settings.on) return paint();
      ctx.resume().then(paint, paint);
      if (player && player.src && player.paused && !song) player.play().catch(function () {});
      paint();
    }
    document.addEventListener("pointerdown", go, true);
    document.addEventListener("keydown", go, true);
    paint();
  }

  // 季节、钟点真变了：环境音跟着换，「跟着季节」的话曲子也换。js/farm.js 每 30 秒重写一次天色，值没变就不管。
  var seen = root.getAttribute("data-season") + " " + root.getAttribute("data-phase");
  new MutationObserver(function () {
    var season = root.getAttribute("data-season");
    var mood = season + " " + root.getAttribute("data-phase");
    if (mood === seen) return;
    var seasonChanged = seen.split(" ")[0] !== season;
    seen = mood;
    if (!settings.on) return;
    if (seasonChanged && settings.track === "auto") autoPlay();
    ambience();
  }).observe(root, { attributes: true, attributeFilter: ["data-season", "data-phase"] });

  // ---------------------------------------------------------------- 面板

  function el(tag, cls, text) {
    var node = document.createElement(tag);
    if (cls) node.className = cls;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  var panel = el("div", "sound-panel");
  panel.id = "sound-panel";
  panel.hidden = true;
  panel.setAttribute("role", "group");
  panel.setAttribute("aria-label", "声音");

  var head = el("p", "sound-head");
  var power = el("button", "btn", "关着");
  power.type = "button";
  head.append(el("b", "", "声音"), power);

  var trackLabel = el("label", "sound-row");
  var trackPick = el("select", "field");
  trackLabel.append(el("span", "", "曲子"), trackPick);

  function slider(name, value) {
    var label = el("label", "sound-row");
    var input = el("input", "sound-slider");
    input.type = "range";
    input.min = "0";
    input.max = "100";
    input.value = String(Math.round(value * 100));
    label.append(el("span", "", name), input);
    return { label: label, input: input };
  }
  var musicVol = slider("音乐", settings.music);
  var ambVol = slider("环境音", settings.ambience);

  var mineHead = el("p", "sound-row");
  var add = el("label", "btn", "加一首");
  var file = el("input");
  file.type = "file";
  file.accept = "audio/*";
  file.multiple = true;
  file.className = "sr-only";
  add.append(file);
  mineHead.append(el("span", "", "我加的"), add);
  var mineBox = el("ul", "sound-mine");
  var note = el("p", "sound-note", "环境音是风、鸟叫、虫鸣，跟着季节和钟点变。自己加的音乐只存在这台设备的浏览器里，不会传到网站上。");
  var now = el("p", "sound-note");
  now.setAttribute("role", "status");

  panel.append(head, trackLabel, musicVol.label, ambVol.label, mineHead, mineBox, now, note);
  hud.append(panel);
  toggle.hidden = false; // 有脚本、浏览器能出声，才露出小喇叭

  function option(group, value, text) {
    var o = el("option", "", text);
    o.value = value;
    group.append(o);
  }

  function fillTracks() {
    trackPick.textContent = "";
    var own = el("optgroup");
    own.label = "自带（原创合成）";
    option(own, "auto", "跟着季节");
    SEASONS.forEach(function (s) {
      option(own, s, SONGS[s].name);
    });
    trackPick.append(own);
    if (siteTracks.length) {
      var shared = el("optgroup");
      shared.label = "站里的";
      siteTracks.forEach(function (t) {
        option(shared, "site:" + t.file, t.name);
      });
      trackPick.append(shared);
    }
    if (mine.length) {
      var my = el("optgroup");
      my.label = "我加的";
      mine.forEach(function (t) {
        option(my, "mine:" + t.id, t.name);
      });
      trackPick.append(my);
    }
    trackPick.value = settings.track;
    if (trackPick.value !== settings.track) trackPick.value = "auto";
    mineBox.textContent = "";
    mine.forEach(function (t) {
      var row = el("li");
      var drop = el("button", "", "删");
      drop.type = "button";
      drop.setAttribute("aria-label", "删掉：" + t.name);
      drop.addEventListener("click", function () {
        shelf("readwrite", function (s) {
          return s.delete(t.id);
        }).then(function () {
          if (settings.track === "mine:" + t.id) {
            settings.track = "auto";
            keep();
            if (settings.on) choose();
          }
          return mineList();
        }).then(fillTracks);
      });
      row.append(el("span", "", t.name), drop);
      mineBox.append(row);
    });
  }

  function paint() {
    var on = settings.on;
    power.textContent = on ? "开着" : "关着";
    power.setAttribute("aria-pressed", String(on));
    toggle.setAttribute("data-state", !on ? "off" : waiting ? "wait" : "on");
    toggle.setAttribute("aria-label", !on ? "声音关着，打开声音面板" : waiting ? "声音开着，点一下页面就出声" : "声音开着，打开声音面板");
    now.textContent = !on ? "" : waiting ? "点一下页面任意地方就出声。" : playing ? "正在放：" + playing : "";
  }

  function open(yes) {
    panel.hidden = !yes;
    toggle.setAttribute("aria-expanded", String(yes));
    if (yes) {
      Promise.all([siteList(), mineList()]).then(fillTracks);
    }
  }

  toggle.setAttribute("aria-controls", "sound-panel");
  toggle.setAttribute("aria-expanded", "false");
  toggle.addEventListener("click", function () {
    open(panel.hidden);
  });
  document.addEventListener("keydown", function (event) {
    if (event.key === "Escape" && !panel.hidden) {
      open(false);
      toggle.focus();
    }
  });
  document.addEventListener("pointerdown", function (event) {
    if (!panel.hidden && !panel.contains(event.target) && !toggle.contains(event.target)) open(false);
  });

  power.addEventListener("click", function () {
    settings.on = !settings.on;
    keep();
    if (settings.on) start();
    else stop();
  });

  trackPick.addEventListener("change", function () {
    settings.track = trackPick.value;
    keep();
    if (settings.on) choose();
  });

  musicVol.input.addEventListener("input", function () {
    settings.music = musicVol.input.value / 100;
    levels();
    keep();
  });
  ambVol.input.addEventListener("input", function () {
    settings.ambience = ambVol.input.value / 100;
    levels();
    keep();
  });

  file.addEventListener("change", function () {
    var files = Array.prototype.slice.call(file.files || []);
    file.value = "";
    if (!files.length) return;
    now.textContent = "正在存…";
    var first = "";
    shelf("readwrite", function (s) {
      files.forEach(function (f) {
        var id = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
        if (!first) first = id;
        s.put({ id: id, name: f.name.replace(/\.[^.]+$/, ""), type: f.type, blob: f, added: new Date().toISOString() });
      });
    })
      .then(function () {
        now.textContent = "存好了，在「曲子」里选它。";
        return mineList();
      })
      .then(fillTracks)
      .catch(function () {
        now.textContent = "没存进去，可能是浏览器空间不够或者不让存。";
      });
  });

  paint();
  if (settings.on) {
    siteList().then(start);
  }
})();
