(() => {
  // =========================
  // Canvas / Utils
  // =========================
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  const DPR = () => Math.max(1, Math.min(2.5, window.devicePixelRatio || 1));

  function resize() {
    const dpr = DPR();
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.scale(dpr, dpr);
  }
  window.addEventListener("resize", resize);
  resize();

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const CX = (p) => W() * (p / 100);
  const CY = (p) => H() * (p / 100);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);
  const now = () => performance.now();

  // roundRect polyfill for older browsers
  if (!CanvasRenderingContext2D.prototype.roundRect) {
    CanvasRenderingContext2D.prototype.roundRect = function (x, y, w, h, r) {
      r = Math.min(r, w / 2, h / 2);
      this.beginPath();
      this.moveTo(x + r, y);
      this.arcTo(x + w, y, x + w, y + h, r);
      this.arcTo(x + w, y + h, x, y + h, r);
      this.arcTo(x, y + h, x, y, r);
      this.arcTo(x, y, x + w, y, r);
      this.closePath();
      return this;
    };
  }

  // =========================
  // UI refs
  // =========================
  const el = (id) => document.getElementById(id);

  const btnMute = el("btnMute");
  const btnFS = el("btnFS");
  const btnQuit = el("btnQuit");

  const hud = el("hud");
  const hudLevel = el("hudLevel");
  const hudMission = el("hudMission");
  const hudTime = el("hudTime");
  const hudPen = el("hudPen");
  const hudCombo = el("hudCombo");
  const hudMsg = el("hudMsg");

  const toast = el("toast");
  const toastTitle = el("toastTitle");
  const toastText = el("toastText");

  const screenStart = el("screenStart");
  const screenEnd = el("screenEnd");

  const inpName = el("inpName");
  const btnStart = el("btnStart");

  const btnModeContest = el("btnModeContest");
  const btnModePractice = el("btnModePractice");
  const chkEasy = el("chkEasy");
  const chkVibrate = el("chkVibrate");

  const btnGear = el("btnGear");
  const btnBrake = el("btnBrake");
  const btnGas = el("btnGas");
  const wheelZone = el("wheelZone");
  const wheelVisual = el("wheelVisual");

  const resName = el("resName");
  const resMedal = el("resMedal");
  const resGrade = el("resGrade");
  const resTime = el("resTime");
  const resPen = el("resPen");
  const resMission = el("resMission");
  const resClean = el("resClean");
  const resTip = el("resTip");

  const btnReplay = el("btnReplay");
  const btnCopy = el("btnCopy");
  const btnMenu = el("btnMenu");

  // =========================
  // Fullscreen / Mute
  // =========================
  function toggleFullScreen() {
    const doc = document;
    const docEl = document.documentElement;
    const request =
      docEl.requestFullscreen ||
      docEl.webkitRequestFullscreen ||
      docEl.mozRequestFullScreen ||
      docEl.msRequestFullscreen;
    const exit =
      doc.exitFullscreen ||
      doc.webkitExitFullscreen ||
      doc.mozCancelFullScreen ||
      doc.msExitFullscreen;
    const isFs =
      doc.fullscreenElement ||
      doc.webkitFullscreenElement ||
      doc.mozFullScreenElement ||
      doc.msFullscreenElement;

    if (!isFs) request && request.call(docEl);
    else exit && exit.call(doc);
  }
  btnFS.addEventListener("click", (e) => {
    e.preventDefault();
    toggleFullScreen();
    btnFS.blur();
  });

  // =========================
  // Audio engine (neon UI sounds)
  // =========================
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audio = {
    ctx: AudioContextClass ? new AudioContextClass() : null,
    master: null,
    muted: false,
  };
  if (audio.ctx) {
    audio.master = audio.ctx.createGain();
    audio.master.gain.value = 0.9;
    audio.master.connect(audio.ctx.destination);
  }

  function tone({ type = "sine", f0 = 440, f1 = null, t = 0.12, g = 0.12 }) {
    if (!audio.ctx || audio.muted) return;
    const n = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const ga = audio.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, n);
    if (f1 !== null) o.frequency.linearRampToValueAtTime(f1, n + t);
    ga.gain.setValueAtTime(g, n);
    ga.gain.exponentialRampToValueAtTime(0.0001, n + t);
    o.connect(ga);
    ga.connect(audio.master);
    o.start(n);
    o.stop(n + t);
  }

  function sfx(name) {
    switch (name) {
      case "click":
        tone({ type: "square", f0: 240, t: 0.06, g: 0.08 });
        break;
      case "hit":
        tone({ type: "sawtooth", f0: 150, f1: 45, t: 0.18, g: 0.12 });
        break;
      case "ok":
        tone({ type: "sine", f0: 520, f1: 880, t: 0.14, g: 0.12 });
        break;
      case "green":
        tone({ type: "sine", f0: 660, f1: 960, t: 0.12, g: 0.12 });
        break;
      case "perfect":
        tone({ type: "triangle", f0: 740, f1: 1200, t: 0.16, g: 0.12 });
        break;
      case "medal":
        tone({ type: "sine", f0: 880, f1: 660, t: 0.18, g: 0.12 });
        break;
    }
  }

  function toggleMute() {
    audio.muted = !audio.muted;
    btnMute.textContent = audio.muted ? "🔇" : "🔊";
    if (audio.master) audio.master.gain.value = audio.muted ? 0 : 0.9;
  }
  btnMute.addEventListener("click", (e) => {
    e.preventDefault();
    toggleMute();
    btnMute.blur();
  });

  // =========================
  // Vibration helper
  // =========================
  function vib(ms = 30) {
    if (!chkVibrate.checked) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // =========================
  // Game State
  // =========================
  let state = "MENU"; // MENU | PLAY | TRANSITION | FINISHED
  let mode = "CONTEST"; // CONTEST | PRACTICE
  let easyMode = false;

  let playerName = "";
  let lastName = "";

  // Timer: starts on green (lvl1) or first movement
  let startTimeMs = null;
  let penalty = 0;

  // Addictive layer: combo multiplier + clean run bonus
  let combo = 1.0;          // grows with clean driving
  let comboDecay = 0;       // time since last perfect
  let cleanRun = true;      // no cone/wall hits

  // Screen shake
  let shake = 0;

  // Missions (random per run)
  const missionPool = [
    { id: "clean", label: "Aucune collision", check: (s) => s.wallHits === 0 && s.coneHits === 0 },
    { id: "noCone", label: "0 cône touché", check: (s) => s.coneHits === 0 },
    { id: "noWall", label: "0 collision", check: (s) => s.wallHits === 0 },
    { id: "fast", label: "Moins de 70s", check: (s) => s.finalTime < 70 },
    { id: "precision", label: "Créneau précis (≤2s)", check: (s) => s.precisionPen <= 2 },
    { id: "noFalse", label: "Pas de départ trop tôt", check: (s) => s.falseStart === 0 },
  ];
  let mission = null;

  const stats = {
    coneHits: 0,
    wallHits: 0,
    falseStart: 0,
    precisionPen: 0,
    finalTime: 0,
  };

  function resetRunStats() {
    stats.coneHits = 0;
    stats.wallHits = 0;
    stats.falseStart = 0;
    stats.precisionPen = 0;
    stats.finalTime = 0;
    penalty = 0;
    combo = 1.0;
    comboDecay = 0;
    cleanRun = true;
    startTimeMs = null;
  }

  function ensureTimerStarted() {
    if (startTimeMs === null) startTimeMs = performance.now();
  }

  function elapsed() {
    if (startTimeMs === null) return 0;
    return ((performance.now() - startTimeMs) / 1000) + penalty;
  }

  function setMsg(t) {
    hudMsg.textContent = t;
  }

  function showToast(title, text, ms = 900) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  }

  function addPenalty(sec, reason, kind = "wall") {
    // Practice mode: reduce penalty impact to encourage learning
    const factor = easyMode ? 0.6 : 1.0;
    const p = sec * factor;

    penalty += p;
    hudPen.textContent = Math.round(penalty);

    cleanRun = false;
    shake = Math.min(12, shake + 7);
    combo = 1.0; // reset combo on mistake
    comboDecay = 0;

    if (kind === "cone") stats.coneHits++;
    if (kind === "wall") stats.wallHits++;
    if (kind === "false") stats.falseStart++;
    if (kind === "precision") stats.precisionPen += p;

    sfx("hit");
    vib(25);
    if (reason) showToast("PÉNALITÉ", `+${p.toFixed(1)}s • ${reason}`, 1100);
  }

  function rewardPerfect(label = "Parfait") {
    combo = Math.min(2.0, combo + 0.05);
    comboDecay = 0;
    hudCombo.textContent = combo.toFixed(1);
    sfx("perfect");
    showToast("PARFAIT", `${label} • combo x${combo.toFixed(1)}`, 750);
  }

  // =========================
  // World / Entities
  // =========================
  let levelIndex = 0;
  let cones = [];
  let walls = [];
  let target = null;
  let meta = {};
  let winHold = 0;

  // particles for neon vibe
  const particles = [];
  function spawnParticles(x, y, n = 10, color = "rgba(0,229,255,0.9)") {
    for (let i = 0; i < n; i++) {
      particles.push({
        x, y,
        vx: rand(-80, 80),
        vy: rand(-80, 80),
        life: rand(0.35, 0.7),
        t: 0,
        r: rand(1.5, 3.5),
        c: color,
      });
    }
  }

  function resetWorld() {
    cones = [];
    walls = [];
    target = null;
    meta = {};
    winHold = 0;
  }

  // =========================
  // Car (better feel)
  // =========================
  const CAR = {
    x: 0, y: 0,
    a: 0,
    v: 0,
    steer: 0,
    gear: 1,
    inputs: { gas: false, brake: false, steerTarget: 0 },
  };

  // Tunables (feel)
  const MAX_STEER = 0.68;
  const WHEELBASE = 46;
  const ACC_FWD = 560;
  const ACC_REV = 390;
  const MAX_V_FWD = 300;
  const MAX_V_REV = 170;
  const BRAKE = 680;
  const DRAG = 3.0;

  function updateGearUI() {
    if (CAR.gear === 1) {
      btnGear.textContent = "D";
      btnGear.className = "gear gear-d";
    } else {
      btnGear.textContent = "R";
      btnGear.className = "gear gear-r";
    }
  }

  function toggleGear() {
    CAR.gear *= -1;
    updateGearUI();
    sfx("click");
    vib(12);
  }

  // =========================
  // Levels (V3)
  // =========================
  const LEVELS = [
    // 1) Feu tricolore + gate
    {
      title: "1) FEU TRICOLORE",
      intro: "Attends le vert. Le chrono démarre au vert (ou au mouvement si départ trop tôt).",
      setup() {
        resetWorld();

        const roadY = CY(62);

        // borders
        walls.push({ x: CX(50), y: roadY - 100, w: CX(100), h: 18 });
        walls.push({ x: CX(50), y: roadY + 100, w: CX(100), h: 18 });

        CAR.x = CX(12);
        CAR.y = roadY + 38;
        CAR.a = 0;
        CAR.v = 0;
        CAR.steer = 0;
        CAR.gear = 1;
        updateGearUI();

        // light
        meta.light = "RED";
        meta.greenAt = now() + rand(1200, 2800);
        meta.falseDone = false;
        meta.lightX = CX(46);
        meta.lightY = roadY - 130;

        // gate target
        target = { x: CX(72), y: roadY + 38, w: 110, h: 80, a: 0 };

        setMsg("Reste prêt. Attends le vert.");
      },
      update(dt) {
        if (meta.light === "RED" && now() >= meta.greenAt) {
          meta.light = "GREEN";
          sfx("green");
          ensureTimerStarted();
          setMsg("Vert. Démarre.");
          showToast("VERT", "Démarre", 650);
          spawnParticles(meta.lightX, meta.lightY - 22, 14, "rgba(45,255,154,0.9)");
        }

        if (meta.light === "RED") {
          const moving = Math.abs(CAR.v) > 10 || CAR.inputs.gas || keys.up;
          if (moving) {
            ensureTimerStarted();
            if (!meta.falseDone) {
              meta.falseDone = true;
              addPenalty(5, "Départ trop tôt", "false");
            }
          }
        }
      }
    },

    // 2) Slalom néon (random each run) + combo for clean gates
    {
      title: "2) SLALOM NÉON",
      intro: "Traverse le slalom. Cône = pénalité. Passages propres = combo.",
      setup() {
        resetWorld();

        const topY = CY(18);
        const botY = CY(82);
        walls.push({ x: CX(50), y: topY, w: CX(100), h: 16 });
        walls.push({ x: CX(50), y: botY, w: CX(100), h: 16 });

        CAR.x = CX(12);
        CAR.y = CY(62);
        CAR.a = 0;
        CAR.v = 0;
        CAR.steer = 0;
        CAR.gear = 1;
        updateGearUI();

        // cones in pairs + a "gate" line to reward perfect
        meta.gates = [];
        const n = 8;
        const baseY = CY(50);
        for (let i = 0; i < n; i++) {
          const x = lerp(CX(22), CX(80), i/(n-1));
          const offset = (i % 2 === 0 ? -1 : 1) * rand(44, 78);
          const y = baseY + offset + rand(-10, 10);

          cones.push({ x, y, r: 14, hit: false });
          // Add a gate center slightly ahead of cone
          meta.gates.push({ x: x + 18, y: baseY, w: 70, passed: false });
        }

        target = { x: CX(88), y: CY(50), w: 130, h: 96, a: 0 };
        setMsg("Trajectoire douce. Petits mouvements de volant.");
      },
      update(dt) {
        // reward passing gates cleanly: if car crosses gate x and is near center line
        for (const g of meta.gates) {
          if (g.passed) continue;
          if (CAR.x > g.x) {
            g.passed = true;
            const dist = Math.abs(CAR.y - g.y);
            if (dist < 42 && stats.coneHits === 0 && stats.wallHits === 0) {
              rewardPerfect("Passage propre");
            } else if (dist < 42) {
              // small reward even after mistakes
              combo = Math.min(1.4, combo + 0.02);
              hudCombo.textContent = combo.toFixed(1);
            }
          }
        }
      }
    },

    // 3) Créneau néon (reverse required) + precision scoring
    {
      title: "3) CRÉNEAU CHALLENGE",
      intro: "Marche arrière obligatoire. Précision = meilleur résultat.",
      setup() {
        resetWorld();

        const roadY = CY(64);

        walls.push({ x: CX(50), y: roadY - 98, w: CX(100), h: 16 });
        walls.push({ x: CX(50), y: roadY + 98, w: CX(100), h: 16 });

        // sidewalk right
        walls.push({ x: CX(82), y: roadY - 4, w: 14, h: 260 });

        // parked blocks
        const px = CX(56);
        const py = roadY - 40;
        walls.push({ x: px - 120, y: py, w: 36, h: 76 });
        walls.push({ x: px + 120, y: py, w: 36, h: 76 });

        CAR.x = CX(14);
        CAR.y = roadY + 42;
        CAR.a = 0;
        CAR.v = 0;
        CAR.steer = 0;
        CAR.gear = 1;
        updateGearUI();

        target = { x: px, y: py, w: 100, h: 76, a: 0 };

        meta.mustReverse = true;
        meta.reversed = false;

        setMsg("Passe en R et gare-toi dans la zone.");
      },
      update(dt) {
        if (CAR.gear === -1 && Math.abs(CAR.v) > 12) meta.reversed = true;
      }
    }
  ];

  // =========================
  // Missions
  // =========================
  function pickMission() {
    // choose 1 mission, prioritize variety
    const candidates = missionPool.slice();
    mission = candidates[Math.floor(Math.random() * candidates.length)];
    hudMission.textContent = `🎯 Mission : ${mission.label}`;
  }

  // =========================
  // Controls
  // =========================
  const keys = { up: false, down: false, left: false, right: false };

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Shift","z","q","s","d"].includes(e.key)) e.preventDefault();
    switch (e.key) {
      case "ArrowLeft":
      case "q":
        keys.left = true;
        break;
      case "ArrowRight":
      case "d":
        keys.right = true;
        break;
      case "ArrowUp":
      case "z":
        keys.up = true;
        break;
      case "ArrowDown":
      case "s":
        keys.down = true;
        break;
      case " ":
      case "Shift":
        toggleGear();
        break;
    }
  }, { passive: false });

  window.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowLeft":
      case "q":
        keys.left = false;
        break;
      case "ArrowRight":
      case "d":
        keys.right = false;
        break;
      case "ArrowUp":
      case "z":
        keys.up = false;
        break;
      case "ArrowDown":
      case "s":
        keys.down = false;
        break;
    }
  });

  // Touch hold helpers
  function bindHold(btn, down, up) {
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); down(); }, { passive: false });
    btn.addEventListener("touchend", (e) => { e.preventDefault(); up(); }, { passive: false });
    btn.addEventListener("touchcancel", (e) => { e.preventDefault(); up(); }, { passive: false });
    btn.addEventListener("mousedown", (e) => { e.preventDefault(); down(); });
    window.addEventListener("mouseup", up);
  }

  bindHold(btnGas, () => (CAR.inputs.gas = true), () => (CAR.inputs.gas = false));
  bindHold(btnBrake, () => (CAR.inputs.brake = true), () => (CAR.inputs.brake = false));

  btnGear.addEventListener("touchstart", (e) => { e.preventDefault(); toggleGear(); }, { passive: false });
  btnGear.addEventListener("mousedown", (e) => { e.preventDefault(); toggleGear(); });

  // Steering wheel (smoother + spring return)
  let isSteering = false;
  let wheelTouchId = null;

  function steerFromPoint(clientX, clientY) {
    const rect = wheelZone.getBoundingClientRect();
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let angle = Math.atan2(dy, dx) * (180 / Math.PI);
    angle += 90;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;

    const maxAngle = 120;
    angle = clamp(angle, -maxAngle, maxAngle);

    wheelVisual.style.transform = `rotate(${angle}deg)`;
    CAR.inputs.steerTarget = angle / maxAngle;
  }

  wheelZone.addEventListener("touchstart", (e) => {
    e.preventDefault();
    const t = e.changedTouches[0];
    wheelTouchId = t.identifier;
    isSteering = true;
    steerFromPoint(t.clientX, t.clientY);
  }, { passive: false });

  wheelZone.addEventListener("touchmove", (e) => {
    e.preventDefault();
    if (!isSteering) return;
    for (const t of e.changedTouches) {
      if (t.identifier === wheelTouchId) steerFromPoint(t.clientX, t.clientY);
    }
  }, { passive: false });

  function endSteer(e) {
    for (const t of e.changedTouches) {
      if (t.identifier === wheelTouchId) {
        isSteering = false;
        wheelTouchId = null;
        if (!keys.left && !keys.right) CAR.inputs.steerTarget = 0;
      }
    }
  }
  wheelZone.addEventListener("touchend", endSteer, { passive: false });
  wheelZone.addEventListener("touchcancel", endSteer, { passive: false });

  // mouse fallback
  wheelZone.addEventListener("mousedown", (e) => { isSteering = true; steerFromPoint(e.clientX, e.clientY); });
  window.addEventListener("mousemove", (e) => { if (isSteering) steerFromPoint(e.clientX, e.clientY); });
  window.addEventListener("mouseup", () => { isSteering = false; if (!keys.left && !keys.right) CAR.inputs.steerTarget = 0; });

  // =========================
  // Start / End UI
  // =========================
  function setModeButtons() {
    btnModeContest.classList.toggle("active", mode === "CONTEST");
    btnModePractice.classList.toggle("active", mode === "PRACTICE");
  }
  btnModeContest.addEventListener("click", () => { mode = "CONTEST"; setModeButtons(); sfx("click"); });
  btnModePractice.addEventListener("click", () => { mode = "PRACTICE"; setModeButtons(); sfx("click"); });

  btnStart.addEventListener("click", () => {
    const name = inpName.value.trim();
    if (!name) return alert("Entre un pseudo 😉");
    startRun(name);
  });

  btnQuit.addEventListener("click", () => {
    if (!confirm("Retour au menu ?")) return;
    toMenu();
  });

  btnReplay.addEventListener("click", () => {
    if (!lastName) return toMenu();
    startRun(lastName);
  });

  btnMenu.addEventListener("click", toMenu);

  btnCopy.addEventListener("click", async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      showToast("COPIÉ", "Résultat copié 📋", 900);
      sfx("ok");
    } catch {
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      showToast("COPIÉ", "Résultat copié (fallback)", 900);
    }
  });

  function toMenu() {
    state = "MENU";
    hud.classList.add("hidden");
    screenEnd.classList.add("hidden");
    screenStart.classList.remove("hidden");
  }

  function startRun(name) {
    // audio resume on gesture
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();

    playerName = name;
    lastName = name;

    easyMode = chkEasy.checked;

    resetRunStats();
    pickMission();

    // show game
    screenStart.classList.add("hidden");
    screenEnd.classList.add("hidden");
    hud.classList.remove("hidden");
    state = "PLAY";

    // init world
    levelIndex = 0;
    loadLevel(levelIndex);

    // UI
    hudPen.textContent = "0";
    hudTime.textContent = "00.00";
    hudCombo.textContent = combo.toFixed(1);
  }

  function loadLevel(i) {
    levelIndex = i;
    const lvl = LEVELS[i];
    hudLevel.textContent = lvl.title;
    setMsg(lvl.intro);
    showToast("ÉPREUVE", lvl.title, 750);

    // reset car inputs
    CAR.inputs.gas = false;
    CAR.inputs.brake = false;
    CAR.inputs.steerTarget = 0;
    wheelVisual.style.transform = "rotate(0deg)";

    lvl.setup();
  }

  // =========================
  // Collisions / Win checks
  // =========================
  function getCarCorners(x, y, a) {
    const cos = Math.cos(a), sin = Math.sin(a);
    const front = 30, back = 30, side = 14;
    return [
      { x: x + cos * front - sin * side, y: y + sin * front + cos * side },
      { x: x + cos * front + sin * side, y: y + sin * front - cos * side },
      { x: x - cos * back + sin * side, y: y - sin * back - cos * side },
      { x: x - cos * back - sin * side, y: y - sin * back + cos * side },
    ];
  }

  function pointInTarget(px, py, t) {
    return (px > t.x - t.w / 2 && px < t.x + t.w / 2 && py > t.y - t.h / 2 && py < t.y + t.h / 2);
  }

  function handleCollisions() {
    // bounds soft
    if (CAR.x < -10 || CAR.x > W() + 10 || CAR.y < -10 || CAR.y > H() + 10) {
      addPenalty(4, "Sortie de zone", "wall");
      CAR.x = clamp(CAR.x, 20, W() - 20);
      CAR.y = clamp(CAR.y, 20, H() - 20);
      CAR.v *= -0.35;
      spawnParticles(CAR.x, CAR.y, 12, "rgba(255,59,92,0.9)");
      return;
    }

    const corners = getCarCorners(CAR.x, CAR.y, CAR.a);

    for (const w of walls) {
      const L = w.x - w.w / 2, R = w.x + w.w / 2, T = w.y - w.h / 2, B = w.y + w.h / 2;
      for (const p of corners) {
        if (p.x > L && p.x < R && p.y > T && p.y < B) {
          addPenalty(4, "Collision", "wall");
          CAR.x -= Math.cos(CAR.a) * 18;
          CAR.y -= Math.sin(CAR.a) * 18;
          CAR.v *= -0.35;
          spawnParticles(CAR.x, CAR.y, 12, "rgba(255,61,240,0.9)");
          return;
        }
      }
    }

    for (const c of cones) {
      if (c.hit) continue;
      for (const p of corners) {
        if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + 7) {
          c.hit = true;
          addPenalty(2, "Cône touché", "cone");
          spawnParticles(c.x, c.y, 10, "rgba(255,204,102,0.95)");
          return;
        }
      }
    }
  }

  function checkWin(dt) {
    if (!target) return;

    const near = Math.hypot(CAR.x - target.x, CAR.y - target.y) < Math.max(target.w, target.h) * 0.85;
    const stopped = Math.abs(CAR.v) < 14;

    // level 3 rule
    if (levelIndex === 2 && meta.mustReverse && !meta.reversed) {
      if (near) setMsg("Marche arrière obligatoire (R).");
      winHold = 0;
      return;
    }

    if (near && stopped) {
      winHold += dt * 1000;
      if (winHold > 850) {
        // precision scoring
        const corners = getCarCorners(CAR.x, CAR.y, CAR.a);
        let inside = 0;
        for (const p of corners) if (pointInTarget(p.x, p.y, target)) inside++;

        if (inside === 4) {
          rewardPerfect("Validation parfaite");
        } else {
          const extra = (4 - inside) * 1.0; // 1..4
          addPenalty(extra, "Précision", "precision");
        }

        nextLevel();
        winHold = 0;
      } else {
        setMsg("Validation…");
      }
    } else {
      winHold = 0;
    }
  }

  function nextLevel() {
    state = "TRANSITION";
    setTimeout(() => {
      if (levelIndex + 1 >= LEVELS.length) finish();
      else {
        loadLevel(levelIndex + 1);
        state = "PLAY";
      }
    }, 520);
  }

  // =========================
  // Finish / scoring
  // =========================
  function medalAndGrade(finalTime, pen) {
    // medal is generous but meaningful
    let medal = "🎯 PARTICIPATION";
    if (pen <= 3 && finalTime < 60) medal = "🥇 OR";
    else if (pen <= 8 && finalTime < 75) medal = "🥈 ARGENT";
    else if (finalTime < 95) medal = "🥉 BRONZE";

    let grade = "D";
    if (pen <= 3 && finalTime < 60) grade = "A";
    else if (pen <= 8 && finalTime < 75) grade = "B";
    else if (pen <= 14) grade = "C";

    return { medal, grade };
  }

  function finish() {
    state = "FINISHED";

    // clean bonus (encourage replay)
    const cleanBonus = cleanRun ? 1.0 : 0.0; // -1s if perfectly clean
    const raw = elapsed();
    const finalTime = Math.max(0, raw - cleanBonus);
    stats.finalTime = finalTime;

    const { medal, grade } = medalAndGrade(finalTime, penalty);
    const missionOk = mission ? mission.check(stats) : false;

    // UI
    resName.textContent = playerName;
    resTime.textContent = `${finalTime.toFixed(2)}s`;
    resPen.textContent = `+${Math.round(penalty)}s`;
    resMedal.textContent = medal;
    resGrade.textContent = `NOTE ${grade}`;
    resMission.textContent = mission ? (missionOk ? `✅ ${mission.label}` : `❌ ${mission.label}`) : "—";
    resClean.textContent = cleanRun ? "✅ Oui (-1s)" : "❌ Non";

    const tips = [];
    if (!missionOk && mission?.id === "fast") tips.push("Conseil : slalom = petits mouvements de volant, pas d’à-coups.");
    if (stats.falseStart) tips.push("Conseil : attendre le vert à l’épreuve 1.");
    if (stats.coneHits) tips.push("Conseil : regarde loin devant, pas le cône.");
    if (stats.wallHits) tips.push("Conseil : freine avant de tourner, puis ré-accélère.");
    if (stats.precisionPen) tips.push("Conseil : au créneau, immobilise la voiture avant validation.");

    resTip.textContent = tips.length ? tips.join(" ") : "Très bon résultat. Rejoue pour améliorer ton chrono.";

    sfx("medal");
    vib(40);

    // show end screen
    hud.classList.add("hidden");
    screenEnd.classList.remove("hidden");
  }

  function buildShareText() {
    const txtMission = (mission ? `${mission.label}` : "—");
    const ok = mission ? (mission.check(stats) ? "OK" : "NON") : "—";
    const clean = cleanRun ? "OUI (-1s)" : "NON";
    return `LE DÉFI BOULARI — V3 NÉON ⚡
Pilote : ${playerName}
Temps : ${stats.finalTime.toFixed(2)}s
Pénalités : +${Math.round(penalty)}s
Mission : ${txtMission} (${ok})
Run clean : ${clean}

À gagner : BON D’ACHAT 🏆`;
  }

  // =========================
  // Update loop
  // =========================
  function update(dt) {
    if (state !== "PLAY") return;

    // steering target from keyboard if not touch steering
    if (!isSteering) {
      if (keys.left) CAR.inputs.steerTarget = -1;
      else if (keys.right) CAR.inputs.steerTarget = 1;
      else CAR.inputs.steerTarget = 0;
    }

    // spring wheel UI return
    const wheelAngleDeg = CAR.inputs.steerTarget * 120;
    wheelVisual.style.transform = `rotate(${wheelAngleDeg}deg)`;

    // smooth steer
    const steerTarget = CAR.inputs.steerTarget * MAX_STEER;
    CAR.steer = lerp(CAR.steer, steerTarget, clamp(dt * 10.5, 0, 1));

    const gas = CAR.inputs.gas || keys.up;
    const brake = CAR.inputs.brake || keys.down;

    // timer starts on first movement (all levels)
    if (startTimeMs === null) {
      const moving = gas || brake || Math.abs(CAR.v) > 12;
      if (moving) ensureTimerStarted();
    }

    // accel/brake/drag
    if (gas) {
      const acc = (CAR.gear === 1) ? ACC_FWD : ACC_REV;
      CAR.v += acc * dt * CAR.gear;
    } else if (brake) {
      if (Math.abs(CAR.v) > 10) CAR.v -= Math.sign(CAR.v) * BRAKE * dt;
      else CAR.v = 0;
    } else {
      CAR.v -= CAR.v * DRAG * dt;
      if (Math.abs(CAR.v) < 2) CAR.v = 0;
    }

    // clamp speed
    CAR.v = clamp(CAR.v, -MAX_V_REV, MAX_V_FWD);

    // bicycle model
    if (Math.abs(CAR.v) > 0.5) {
      const angVel = (CAR.v / WHEELBASE) * Math.tan(CAR.steer);
      CAR.a += angVel * dt;
      CAR.x += Math.cos(CAR.a) * CAR.v * dt;
      CAR.y += Math.sin(CAR.a) * CAR.v * dt;
    }

    // level update
    const lvl = LEVELS[levelIndex];
    lvl.update && lvl.update(dt);

    // combo decay (keep it “alive”)
    comboDecay += dt;
    if (comboDecay > 2.0 && combo > 1.0) {
      combo = Math.max(1.0, combo - dt * 0.06);
      hudCombo.textContent = combo.toFixed(1);
    }

    // collisions
    handleCollisions();

    // win check
    checkWin(dt);

    // particles update
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.t += dt;
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= 0.92;
      p.vy *= 0.92;
      if (p.t > p.life) particles.splice(i, 1);
    }

    // HUD time
    hudTime.textContent = elapsed().toFixed(2);
  }

  // =========================
  // Draw (Neon world)
  // =========================
  function draw() {
    const w = W(), h = H();
    ctx.clearRect(0, 0, w, h);

    // camera shake
    let ox = 0, oy = 0;
    if (shake > 0.2) {
      ox = (Math.random() * 2 - 1) * shake;
      oy = (Math.random() * 2 - 1) * shake;
      shake *= 0.86;
    } else shake = 0;

    ctx.save();
    ctx.translate(ox, oy);

    // background grid
    drawNeonGrid();

    // road band based on level (simple but stylish)
    drawRoad();

    // target
    if (target) drawTarget(target);

    // walls
    for (const w of walls) drawWall(w);

    // cones
    for (const c of cones) drawCone(c);

    // traffic light
    if (levelIndex === 0 && state === "PLAY") drawLight();

    // car
    drawCar();

    // particles
    drawParticles();

    ctx.restore();
  }

  function drawNeonGrid() {
    const w = W(), h = H();
    ctx.save();
    ctx.globalAlpha = 0.22;

    // vignette
    const g = ctx.createRadialGradient(w * 0.5, h * 0.45, 80, w * 0.5, h * 0.45, Math.max(w, h) * 0.75);
    g.addColorStop(0, "rgba(255,255,255,0.04)");
    g.addColorStop(1, "rgba(0,0,0,0.55)");
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // grid lines
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(0,229,255,0.12)";
    const step = 34;
    for (let x = 0; x < w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y < h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawRoad() {
    const w = W(), h = H();
    ctx.save();

    // asphalt base
    ctx.fillStyle = "rgba(0,0,0,0.30)";
    ctx.fillRect(0, 0, w, h);

    // center neon lane (subtle)
    ctx.strokeStyle = "rgba(255,61,240,0.12)";
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 16]);
    ctx.beginPath();
    ctx.moveTo(0, h * 0.5);
    ctx.lineTo(w, h * 0.5);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.restore();
  }

  function drawTarget(t) {
    ctx.save();
    ctx.translate(t.x, t.y);

    // neon glow border
    ctx.shadowColor = "rgba(45,255,154,0.60)";
    ctx.shadowBlur = 22;

    ctx.strokeStyle = "rgba(45,255,154,0.95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 10]);
    ctx.strokeRect(-t.w / 2, -t.h / 2, t.w, t.h);
    ctx.setLineDash([]);

    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(45,255,154,0.12)";
    ctx.fillRect(-t.w / 2, -t.h / 2, t.w, t.h);

    // arrow
    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.moveTo(0, -t.h / 2 - 14);
    ctx.lineTo(-10, -t.h / 2);
    ctx.lineTo(10, -t.h / 2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawWall(w) {
    ctx.save();
    ctx.fillStyle = "rgba(220,235,255,0.40)";
    ctx.strokeStyle = "rgba(0,229,255,0.25)";
    ctx.lineWidth = 2;

    ctx.shadowColor = "rgba(0,229,255,0.18)";
    ctx.shadowBlur = 14;

    ctx.beginPath();
    ctx.roundRect(w.x - w.w / 2, w.y - w.h / 2, w.w, w.h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(255,255,255,0.22)";
    ctx.beginPath();
    ctx.moveTo(w.x - w.w / 2, w.y - w.h / 2);
    ctx.lineTo(w.x + w.w / 2, w.y + w.h / 2);
    ctx.stroke();

    ctx.restore();
  }

  function drawCone(c) {
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalAlpha = c.hit ? 0.28 : 1;

    ctx.shadowColor = "rgba(255,204,102,0.55)";
    ctx.shadowBlur = 18;

    ctx.fillStyle = "rgba(255,204,102,0.95)";
    ctx.beginPath();
    ctx.arc(0, 0, c.r, 0, Math.PI * 2);
    ctx.fill();

    ctx.shadowBlur = 0;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(0,0,0,0.25)";
    ctx.beginPath();
    ctx.arc(0, 0, c.r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawLight() {
    const x = meta.lightX, y = meta.lightY;

    ctx.save();
    // pole
    ctx.fillStyle = "rgba(0,0,0,0.45)";
    ctx.fillRect(x - 7, y, 14, 92);

    // box
    ctx.fillStyle = "rgba(0,0,0,0.60)";
    ctx.strokeStyle = "rgba(255,255,255,0.12)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x - 34, y - 74, 68, 74, 16);
    ctx.fill();
    ctx.stroke();

    const redOn = meta.light === "RED";
    const greenOn = meta.light === "GREEN";

    glowDot(x, y - 48, 12, redOn ? "rgba(255,59,92,1)" : "rgba(255,59,92,0.18)", redOn);
    glowDot(x, y - 20, 12, greenOn ? "rgba(45,255,154,1)" : "rgba(45,255,154,0.18)", greenOn);

    // optional “countdown shimmer” when red
    if (redOn) {
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = "rgba(0,229,255,0.10)";
      ctx.beginPath();
      ctx.roundRect(x - 26, y - 10, 52, 16, 8);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function glowDot(x, y, r, color, on) {
    ctx.save();
    if (on) {
      ctx.shadowColor = color;
      ctx.shadowBlur = 22;
    }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawCar() {
    ctx.save();
    ctx.translate(CAR.x, CAR.y);
    ctx.rotate(CAR.a + Math.PI / 2);

    // shadow
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(0, 8, 18, 28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // neon underglow
    ctx.shadowColor = "rgba(0,229,255,0.30)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "rgba(0,229,255,0.08)";
    ctx.beginPath();
    ctx.roundRect(-18, -36, 36, 72, 12);
    ctx.fill();

    // body
    ctx.shadowBlur = 0;
    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(0,229,255,0.22)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-18, -34, 36, 68, 12);
    ctx.fill();
    ctx.stroke();

    // windows
    ctx.fillStyle = "rgba(10,20,40,0.75)";
    ctx.beginPath();
    ctx.roundRect(-13, -22, 26, 14, 7);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-13, 8, 26, 14, 7);
    ctx.fill();

    // stripe
    ctx.strokeStyle = "rgba(255,61,240,0.45)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(-12, -2);
    ctx.lineTo(12, -2);
    ctx.stroke();

    // brake / reverse lights
    const braking = (CAR.inputs.brake || keys.down) && Math.abs(CAR.v) > 5;
    if (braking) {
      ctx.shadowColor = "rgba(255,59,92,0.7)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(255,59,92,0.8)";
      ctx.fillRect(-13, 26, 8, 4);
      ctx.fillRect(5, 26, 8, 4);
      ctx.shadowBlur = 0;
    }
    if (CAR.gear === -1) {
      ctx.shadowColor = "rgba(255,255,255,0.6)";
      ctx.shadowBlur = 10;
      ctx.fillStyle = "rgba(255,255,255,0.8)";
      ctx.fillRect(-2, 26, 4, 4);
      ctx.shadowBlur = 0;
    }

    ctx.restore();
  }

  function drawParticles() {
    for (const p of particles) {
      const t = p.t / p.life;
      const a = 1 - t;
      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = p.c;
      ctx.shadowColor = p.c;
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  // =========================
  // Main loop
  // =========================
  let lastT = 0;
  function frame(t) {
    requestAnimationFrame(frame);
    if (!lastT) { lastT = t; return; }
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.033);

    update(dt);
    draw();
  }
  requestAnimationFrame(frame);

  // =========================
  // Wire start state defaults
  // =========================
  setModeButtons();
  updateGearUI();
  hud.classList.add("hidden");
  screenEnd.classList.add("hidden");
  screenStart.classList.remove("hidden");

  // Gear and quit
  btnQuit.addEventListener("click", () => sfx("click"));

})();
