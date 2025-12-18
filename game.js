(() => {
  // =========================
  // Canvas / helpers
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
    buildPatterns();
  }
  window.addEventListener("resize", resize);

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const CX = (p) => W() * (p / 100);
  const CY = (p) => H() * (p / 100);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const rand = (a, b) => a + Math.random() * (b - a);

  // roundRect polyfill
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
  // UI
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
  const hudClean = el("hudClean");
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
  const chkWeather = el("chkWeather");

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
  // Fullscreen
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
  // Audio (simple, clean)
  // =========================
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const audio = { ctx: AudioContextClass ? new AudioContextClass() : null, master: null, muted: false };
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
    if (name === "click") tone({ type: "square", f0: 220, t: 0.06, g: 0.08 });
    if (name === "hit") tone({ type: "sawtooth", f0: 140, f1: 45, t: 0.18, g: 0.12 });
    if (name === "ok") tone({ type: "sine", f0: 520, f1: 820, t: 0.14, g: 0.12 });
    if (name === "green") tone({ type: "sine", f0: 660, f1: 900, t: 0.12, g: 0.12 });
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
  function vib(ms = 25) {
    if (!chkVibrate.checked) return;
    if (navigator.vibrate) navigator.vibrate(ms);
  }

  // =========================
  // Patterns (asphalt texture + grass)
  // =========================
  let asphaltPattern = null;
  let grassPattern = null;

  function buildPatterns() {
    // asphalt
    const a = document.createElement("canvas");
    a.width = 80; a.height = 80;
    const ac = a.getContext("2d");
    ac.fillStyle = "#3b3d42";
    ac.fillRect(0,0,80,80);
    for (let i=0;i<420;i++){
      const v = Math.random() > 0.5 ? 50 : 70;
      ac.fillStyle = `rgba(${v},${v+2},${v+6},0.35)`;
      ac.fillRect(Math.random()*80, Math.random()*80, 2, 2);
    }
    for (let i=0;i<20;i++){
      ac.fillStyle = "rgba(0,0,0,0.10)";
      ac.fillRect(Math.random()*80, Math.random()*80, Math.random()*18, 1);
    }
    asphaltPattern = ctx.createPattern(a, "repeat");

    // grass
    const g = document.createElement("canvas");
    g.width = 80; g.height = 80;
    const gc = g.getContext("2d");
    gc.fillStyle = "#2f6f3a";
    gc.fillRect(0,0,80,80);
    for (let i=0;i<240;i++){
      gc.strokeStyle = `rgba(${40+Math.random()*40},${110+Math.random()*70},${45+Math.random()*40},0.35)`;
      gc.beginPath();
      const x = Math.random()*80, y=Math.random()*80;
      gc.moveTo(x,y);
      gc.lineTo(x+Math.random()*6-3, y-6-Math.random()*4);
      gc.stroke();
    }
    grassPattern = ctx.createPattern(g, "repeat");
  }

  // =========================
  // Game state
  // =========================
  let state = "MENU"; // MENU | PLAY | TRANSITION | FINISHED
  let mode = "CONTEST"; // CONTEST | PRACTICE
  let easyMode = false;

  let playerName = "";
  let lastName = "";

  // Timer (starts at green or movement)
  let startTimeMs = null;
  let penalty = 0;

  // Clean run (addictive)
  let cleanRun = true;

  // Shake
  let shake = 0;

  // Mission
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
    cleanRun = true;
    startTimeMs = null;
    hudPen.textContent = "0";
    hudClean.textContent = "Clean";
  }

  function ensureTimerStarted() {
    if (startTimeMs === null) startTimeMs = performance.now();
  }

  function elapsed() {
    if (startTimeMs === null) return 0;
    return ((performance.now() - startTimeMs) / 1000) + penalty;
  }

  function setMsg(t) { hudMsg.textContent = t; }

  function showToast(title, text, ms = 900) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  }

  function addPenalty(sec, reason, kind = "wall") {
    const factor = easyMode ? 0.6 : 1.0;
    const p = sec * factor;

    penalty += p;
    hudPen.textContent = Math.round(penalty);

    cleanRun = false;
    hudClean.textContent = "Non";
    shake = Math.min(12, shake + 7);

    if (kind === "cone") stats.coneHits++;
    if (kind === "wall") stats.wallHits++;
    if (kind === "false") stats.falseStart++;
    if (kind === "precision") stats.precisionPen += p;

    sfx("hit");
    vib(25);
    if (reason) showToast("PÉNALITÉ", `+${p.toFixed(1)}s • ${reason}`, 1100);
  }

  // =========================
  // World / Entities
  // =========================
  let levelIndex = 0;
  let cones = [];
  let walls = [];
  let parked = [];
  let target = null;
  let meta = {};
  let winHold = 0;

  function resetWorld() {
    cones = [];
    walls = [];
    parked = [];
    target = null;
    meta = {};
    winHold = 0;
  }

  // =========================
  // Car (feel)
  // =========================
  const CAR = {
    x: 0, y: 0,
    a: 0,
    v: 0,
    steer: 0,
    gear: 1,
    inputs: { gas: false, brake: false, steerTarget: 0 },
  };

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
  // Levels (Route NC)
  // =========================
  const LEVELS = [
    // 1) Feu tricolore
    {
      title: "1) FEU TRICOLORE",
      intro: "Attends le vert. Chrono démarre au vert (ou au mouvement si départ trop tôt).",
      setup() {
        resetWorld();

        const roadY = CY(62);

        walls.push({ x: CX(50), y: roadY - 102, w: CX(100), h: 18, type:"curb" });
        walls.push({ x: CX(50), y: roadY + 102, w: CX(100), h: 18, type:"curb" });

        CAR.x = CX(12);
        CAR.y = roadY + 38;
        CAR.a = 0;
        CAR.v = 0;
        CAR.steer = 0;
        CAR.gear = 1;
        updateGearUI();

        meta.light = "RED";
        meta.greenAt = performance.now() + rand(1200, 2800);
        meta.falseDone = false;
        meta.lightX = CX(46);
        meta.lightY = roadY - 135;

        target = { x: CX(72), y: roadY + 38, w: 110, h: 80, a: 0 };
        meta.stopLineX = CX(64);

        setMsg("Attends le vert. Reste prêt.");
      },
      update() {
        if (meta.light === "RED" && performance.now() >= meta.greenAt) {
          meta.light = "GREEN";
          sfx("green");
          ensureTimerStarted();
          setMsg("Vert. Démarre.");
          showToast("VERT", "Démarre", 650);
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

    // 2) Slalom (V3.2 : plots alternés = slalom obligatoire mais jouable)
    {
      title: "2) SLALOM",
      intro: "Slalom obligatoire : plots alternés. Tout droit = tu touches !",
      setup() {
        resetWorld();

        // Couloir un peu resserré (anti-contournement), mais pas étouffant
        const roadTop = CY(26);
        const roadBot = CY(78);
        walls.push({ x: CX(50), y: roadTop - 8, w: CX(100), h: 16, type:"curb" });
        walls.push({ x: CX(50), y: roadBot + 8, w: CX(100), h: 16, type:"curb" });

        CAR.x = CX(12);
        CAR.y = CY(52);
        CAR.a = 0;
        CAR.v = 0;
        CAR.steer = 0;
        CAR.gear = 1;
        updateGearUI();

        // ✅ Le vrai truc : une ligne de plots "blocage" alternés
        // - Assez espacés pour être fun au clavier
        // - Mais impossible de passer en ligne droite sans toucher
        const n = 7; // moins qu'avant
        const xStart = CX(28);
        const xEnd = CX(74);
        const centerY = CY(52);

        // difficulté réglable
        const offset = easyMode ? 56 : 68;     // amplitude haut/bas (plus grand = plus de slalom)
        const spacingJitter = easyMode ? 6 : 10;
        const r = easyMode ? 15 : 16;          // plots un poil plus gros en normal

        // Pour éviter une trajectoire “au millimètre”, on met un léger bruit
        for (let i = 0; i < n; i++) {
          const t = i / (n - 1);
          const x = lerp(xStart, xEnd, t) + rand(-spacingJitter, spacingJitter);

          const dir = (i % 2 === 0) ? -1 : 1;
          const y = centerY + dir * offset + rand(-10, 10);

          cones.push({ x, y, r, hit: false });
        }

        // Deux plots bonus proches du centre (anti “corridor tout droit”)
        // mais pas trop proches pour rester jouable
        if (!easyMode) {
          cones.push({ x: CX(46), y: centerY + rand(-14, 14), r: 14, hit: false });
          cones.push({ x: CX(58), y: centerY + rand(-14, 14), r: 14, hit: false });
        }

        target = { x: CX(88), y: CY(52), w: 150, h: 120, a: 0 };

        meta.slalomHintShown = false;
        setMsg("Enchaîne le slalom. Petits coups de volant.");
        showToast("SLALOM", "Obligatoire, mais jouable", 850);
      },
      update() {
        // petit rappel si le joueur fonce plein gaz trop tôt
        if (!meta.slalomHintShown && elapsed() > 2 && Math.abs(CAR.v) > 220) {
          meta.slalomHintShown = true;
          setMsg("Conseil : lève le gaz entre deux plots 😉");
        }
      }
    },

    // 3) Créneau
    {
      title: "3) CRÉNEAU",
      intro: "Marche arrière obligatoire. Précision = meilleur chrono.",
      setup() {
        resetWorld();

        const roadY = CY(64);

        walls.push({ x: CX(50), y: roadY - 98, w: CX(100), h: 16, type:"curb" });
        walls.push({ x: CX(50), y: roadY + 98, w: CX(100), h: 16, type:"curb" });

        walls.push({ x: CX(82), y: roadY - 4, w: 14, h: 260, type:"curb" });

        const px = CX(56);
        const py = roadY - 40;
        parked.push({ x: px - 120, y: py, w: 40, h: 78, color:"#c23b3b" });
        parked.push({ x: px + 120, y: py, w: 40, h: 78, color:"#d2a43a" });
        walls.push({ x: px - 120, y: py, w: 40, h: 78, type:"car" });
        walls.push({ x: px + 120, y: py, w: 40, h: 78, type:"car" });

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

        setMsg("Passe en R et rentre dans la zone.");
      },
      update() {
        if (CAR.gear === -1 && Math.abs(CAR.v) > 12) meta.reversed = true;
      }
    }
  ];

  // =========================
  // Mission
  // =========================
  function pickMission() {
    mission = missionPool[Math.floor(Math.random() * missionPool.length)];
    hudMission.textContent = `🎯 Mission : ${mission.label}`;
  }

  // =========================
  // Input
  // =========================
  const keys = { up:false, down:false, left:false, right:false };

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Shift","z","q","s","d"].includes(e.key)) e.preventDefault();
    switch (e.key) {
      case "ArrowLeft": case "q": keys.left = true; break;
      case "ArrowRight": case "d": keys.right = true; break;
      case "ArrowUp": case "z": keys.up = true; break;
      case "ArrowDown": case "s": keys.down = true; break;
      case " ": case "Shift": toggleGear(); break;
    }
  }, { passive:false });

  window.addEventListener("keyup", (e) => {
    switch (e.key) {
      case "ArrowLeft": case "q": keys.left = false; break;
      case "ArrowRight": case "d": keys.right = false; break;
      case "ArrowUp": case "z": keys.up = false; break;
      case "ArrowDown": case "s": keys.down = false; break;
    }
  });

  function bindHold(btn, down, up) {
    btn.addEventListener("touchstart", (e)=>{ e.preventDefault(); down(); }, { passive:false });
    btn.addEventListener("touchend", (e)=>{ e.preventDefault(); up(); }, { passive:false });
    btn.addEventListener("touchcancel", (e)=>{ e.preventDefault(); up(); }, { passive:false });
    btn.addEventListener("mousedown", (e)=>{ e.preventDefault(); down(); });
    window.addEventListener("mouseup", up);
  }

  bindHold(btnGas, ()=> (CAR.inputs.gas = true), ()=> (CAR.inputs.gas = false));
  bindHold(btnBrake, ()=> (CAR.inputs.brake = true), ()=> (CAR.inputs.brake = false));

  btnGear.addEventListener("touchstart", (e)=>{ e.preventDefault(); toggleGear(); }, { passive:false });
  btnGear.addEventListener("mousedown", (e)=>{ e.preventDefault(); toggleGear(); });

  // Steering wheel
  let isSteering = false;
  let wheelTouchId = null;

  function steerFromPoint(clientX, clientY) {
    const rect = wheelZone.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let angle = Math.atan2(dy, dx) * (180/Math.PI);
    angle += 90;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;

    const maxAngle = 120;
    angle = clamp(angle, -maxAngle, maxAngle);

    wheelVisual.style.transform = `rotate(${angle}deg)`;
    CAR.inputs.steerTarget = angle / maxAngle;
  }

  wheelZone.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    wheelTouchId = t.identifier;
    isSteering = true;
    steerFromPoint(t.clientX, t.clientY);
  }, { passive:false });

  wheelZone.addEventListener("touchmove", (e)=>{
    e.preventDefault();
    if (!isSteering) return;
    for (const t of e.changedTouches) {
      if (t.identifier === wheelTouchId) steerFromPoint(t.clientX, t.clientY);
    }
  }, { passive:false });

  function endSteer(e){
    for (const t of e.changedTouches) {
      if (t.identifier === wheelTouchId) {
        isSteering = false;
        wheelTouchId = null;
        if (!keys.left && !keys.right) CAR.inputs.steerTarget = 0;
      }
    }
  }
  wheelZone.addEventListener("touchend", endSteer, { passive:false });
  wheelZone.addEventListener("touchcancel", endSteer, { passive:false });

  // Mouse fallback
  wheelZone.addEventListener("mousedown", (e)=>{ isSteering = true; steerFromPoint(e.clientX, e.clientY); });
  window.addEventListener("mousemove", (e)=>{ if (isSteering) steerFromPoint(e.clientX, e.clientY); });
  window.addEventListener("mouseup", ()=>{ isSteering = false; if (!keys.left && !keys.right) CAR.inputs.steerTarget = 0; });

  // =========================
  // Start / End UI
  // =========================
  function setModeButtons() {
    btnModeContest.classList.toggle("active", mode === "CONTEST");
    btnModePractice.classList.toggle("active", mode === "PRACTICE");
  }
  btnModeContest.addEventListener("click", ()=>{ mode="CONTEST"; setModeButtons(); sfx("click"); });
  btnModePractice.addEventListener("click", ()=>{ mode="PRACTICE"; setModeButtons(); sfx("click"); });

  btnStart.addEventListener("click", ()=>{
    const name = inpName.value.trim();
    if (!name) return alert("Entre un pseudo 😉");
    startRun(name);
  });

  btnQuit.addEventListener("click", ()=>{
    if (!confirm("Retour au menu ?")) return;
    toMenu();
  });

  btnReplay.addEventListener("click", ()=>{
    if (!lastName) return toMenu();
    startRun(lastName);
  });

  btnMenu.addEventListener("click", toMenu);

  btnCopy.addEventListener("click", async ()=>{
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

  function toMenu(){
    state="MENU";
    hud.classList.add("hidden");
    screenEnd.classList.add("hidden");
    screenStart.classList.remove("hidden");
  }

  function startRun(name){
    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();

    playerName = name;
    lastName = name;

    easyMode = chkEasy.checked;

    resetRunStats();
    pickMission();

    screenStart.classList.add("hidden");
    screenEnd.classList.add("hidden");
    hud.classList.remove("hidden");
    state="PLAY";

    hudTime.textContent = "00.00";
    hudPen.textContent = "0";
    hudClean.textContent = "Clean";

    levelIndex = 0;
    loadLevel(levelIndex);
  }

  function loadLevel(i){
    levelIndex = i;
    const lvl = LEVELS[i];
    hudLevel.textContent = lvl.title;
    setMsg(lvl.intro);
    showToast("ÉPREUVE", lvl.title, 750);

    CAR.inputs.gas = false;
    CAR.inputs.brake = false;
    CAR.inputs.steerTarget = 0;
    wheelVisual.style.transform = "rotate(0deg)";

    lvl.setup();
  }

  // =========================
  // Collisions / win
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

  function handleCollisions(){
    if (CAR.x < -10 || CAR.x > W()+10 || CAR.y < -10 || CAR.y > H()+10) {
      addPenalty(4, "Sortie de zone", "wall");
      CAR.x = clamp(CAR.x, 20, W()-20);
      CAR.y = clamp(CAR.y, 20, H()-20);
      CAR.v *= -0.35;
      return;
    }

    const corners = getCarCorners(CAR.x, CAR.y, CAR.a);

    for (const w of walls) {
      const L = w.x - w.w/2, R = w.x + w.w/2, T = w.y - w.h/2, B = w.y + w.h/2;
      for (const p of corners) {
        if (p.x > L && p.x < R && p.y > T && p.y < B) {
          addPenalty(4, "Collision", "wall");
          CAR.x -= Math.cos(CAR.a) * 18;
          CAR.y -= Math.sin(CAR.a) * 18;
          CAR.v *= -0.35;
          return;
        }
      }
    }

    for (const c of cones) {
      if (c.hit) continue;
      for (const p of corners) {
        if (Math.hypot(p.x - c.x, p.y - c.y) < c.r + 8) {
          c.hit = true;
          addPenalty(2, "Plot touché", "cone");
          return;
        }
      }
    }
  }

  function checkWin(dt){
    if (!target) return;

    const near = Math.hypot(CAR.x - target.x, CAR.y - target.y) < Math.max(target.w, target.h) * 0.85;
    const stopped = Math.abs(CAR.v) < 14;

    if (levelIndex === 2 && meta.mustReverse && !meta.reversed) {
      if (near) setMsg("Marche arrière obligatoire (R).");
      winHold = 0;
      return;
    }

    if (near && stopped) {
      winHold += dt * 1000;
      if (winHold > 850) {
        const corners = getCarCorners(CAR.x, CAR.y, CAR.a);
        let inside = 0;
        for (const p of corners) if (pointInTarget(p.x, p.y, target)) inside++;

        if (inside !== 4) {
          const extra = (4 - inside) * 1.0;
          addPenalty(extra, "Précision", "precision");
        } else {
          sfx("ok");
          showToast("VALIDÉ", "Précis", 700);
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

  function nextLevel(){
    state="TRANSITION";
    setTimeout(()=>{
      if (levelIndex + 1 >= LEVELS.length) finish();
      else {
        loadLevel(levelIndex + 1);
        state="PLAY";
      }
    }, 520);
  }

  // =========================
  // Finish / scoring
  // =========================
  function medalAndGrade(finalTime, pen) {
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

  function finish(){
    state="FINISHED";

    const cleanBonus = cleanRun ? 1.0 : 0.0;
    const raw = elapsed();
    const finalTime = Math.max(0, raw - cleanBonus);
    stats.finalTime = finalTime;

    const { medal, grade } = medalAndGrade(finalTime, penalty);
    const missionOk = mission ? mission.check(stats) : false;

    resName.textContent = playerName;
    resTime.textContent = `${finalTime.toFixed(2)}s`;
    resPen.textContent = `+${Math.round(penalty)}s`;
    resMedal.textContent = medal;
    resGrade.textContent = `NOTE ${grade}`;
    resMission.textContent = mission ? (missionOk ? `✅ ${mission.label}` : `❌ ${mission.label}`) : "—";
    resClean.textContent = cleanRun ? "✅ Oui (-1s)" : "❌ Non";

    const tips = [];
    if (stats.falseStart) tips.push("Conseil : attendre le vert à l’épreuve 1.");
    if (stats.coneHits) tips.push("Conseil : slalom = petits mouvements de volant.");
    if (stats.wallHits) tips.push("Conseil : freine avant de tourner, puis ré-accélère.");
    if (stats.precisionPen) tips.push("Conseil : au créneau, immobilise la voiture avant validation.");
    resTip.textContent = tips.length ? tips.join(" ") : "Très bon résultat. Rejoue pour améliorer ton chrono.";

    hud.classList.add("hidden");
    screenEnd.classList.remove("hidden");
  }

  function buildShareText(){
    const txtMission = mission ? mission.label : "—";
    const ok = mission ? (mission.check(stats) ? "OK" : "NON") : "—";
    const clean = cleanRun ? "OUI (-1s)" : "NON";
    return `LE DÉFI BOULARI — V3 ROUTE NC 🚗
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
  function update(dt){
    if (state !== "PLAY") return;

    if (!isSteering) {
      if (keys.left) CAR.inputs.steerTarget = -1;
      else if (keys.right) CAR.inputs.steerTarget = 1;
      else CAR.inputs.steerTarget = 0;
    }

    wheelVisual.style.transform = `rotate(${CAR.inputs.steerTarget * 120}deg)`;

    const steerTarget = CAR.inputs.steerTarget * MAX_STEER;
    CAR.steer = lerp(CAR.steer, steerTarget, clamp(dt * 10.5, 0, 1));

    const gas = CAR.inputs.gas || keys.up;
    const brake = CAR.inputs.brake || keys.down;

    if (startTimeMs === null) {
      const moving = gas || brake || Math.abs(CAR.v) > 12;
      if (moving) ensureTimerStarted();
    }

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

    CAR.v = clamp(CAR.v, -MAX_V_REV, MAX_V_FWD);

    if (Math.abs(CAR.v) > 0.5) {
      const angVel = (CAR.v / WHEELBASE) * Math.tan(CAR.steer);
      CAR.a += angVel * dt;
      CAR.x += Math.cos(CAR.a) * CAR.v * dt;
      CAR.y += Math.sin(CAR.a) * CAR.v * dt;
    }

    const lvl = LEVELS[levelIndex];
    lvl.update && lvl.update(dt);

    handleCollisions();
    checkWin(dt);

    hudTime.textContent = elapsed().toFixed(2);
  }

  // =========================
  // Draw (Road NC)
  // =========================
  function draw(){
    const w = W(), h = H();
    ctx.clearRect(0,0,w,h);

    let ox = 0, oy = 0;
    if (shake > 0.2) {
      ox = (Math.random()*2-1) * shake;
      oy = (Math.random()*2-1) * shake;
      shake *= 0.86;
    } else shake = 0;

    ctx.save();
    ctx.translate(ox, oy);

    if (chkWeather.checked) drawEnvironment();
    drawRoadBand();

    if (levelIndex === 0 && state === "PLAY") drawStopLineAndLight();

    if (target) drawTarget(target);

    for (const w of walls) drawWall(w);
    for (const p of parked) drawParkedCar(p);
    for (const c of cones) drawCone(c);

    drawCar();

    ctx.restore();
  }

  function drawEnvironment(){
    ctx.fillStyle = grassPattern || "#2f6f3a";
    ctx.fillRect(0,0,W(), H());
  }

  function drawRoadBand(){
    const roadTop = CY(22);
    const roadBot = CY(82);

    ctx.fillStyle = asphaltPattern || "#3d3f44";
    ctx.fillRect(0, roadTop, W(), roadBot-roadTop);

    const g = ctx.createRadialGradient(W()*0.5, H()*0.5, 100, W()*0.5, H()*0.5, Math.max(W(),H())*0.7);
    g.addColorStop(0, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0.45)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W(),H());

    ctx.strokeStyle = "rgba(241,245,249,0.85)";
    ctx.lineWidth = 4;
    ctx.setLineDash([20, 18]);
    ctx.beginPath();
    ctx.moveTo(0, (roadTop+roadBot)/2);
    ctx.lineTo(W(), (roadTop+roadBot)/2);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = "rgba(241,245,249,0.60)";
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, roadTop+6);
    ctx.lineTo(W(), roadTop+6);
    ctx.moveTo(0, roadBot-6);
    ctx.lineTo(W(), roadBot-6);
    ctx.stroke();
  }

  function drawStopLineAndLight(){
    ctx.strokeStyle = "rgba(241,245,249,0.92)";
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.moveTo(meta.stopLineX, CY(55));
    ctx.lineTo(meta.stopLineX, CY(78));
    ctx.stroke();

    drawLight(meta.lightX, meta.lightY, meta.light);
  }

  function drawLight(x,y,state){
    ctx.fillStyle = "rgba(0,0,0,0.5)";
    ctx.fillRect(x-7,y,14,92);

    ctx.fillStyle = "rgba(10,12,16,0.75)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x-34, y-74, 68, 74, 14);
    ctx.fill();
    ctx.stroke();

    const redOn = state === "RED";
    const greenOn = state === "GREEN";

    drawDot(x, y-48, 12, redOn ? "rgba(255,80,80,1)" : "rgba(255,80,80,0.20)", redOn);
    drawDot(x, y-20, 12, greenOn ? "rgba(59,214,107,1)" : "rgba(59,214,107,0.20)", greenOn);
  }

  function drawDot(x,y,r,color,on){
    ctx.save();
    if (on) { ctx.shadowColor = color; ctx.shadowBlur = 18; }
    ctx.fillStyle = color;
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawTarget(t){
    ctx.save();
    ctx.translate(t.x,t.y);

    ctx.strokeStyle = "rgba(59,214,107,0.95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10,10]);
    ctx.strokeRect(-t.w/2, -t.h/2, t.w, t.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(59,214,107,0.12)";
    ctx.fillRect(-t.w/2, -t.h/2, t.w, t.h);

    ctx.fillStyle = "rgba(255,255,255,0.65)";
    ctx.beginPath();
    ctx.moveTo(0, -t.h/2 - 14);
    ctx.lineTo(-10, -t.h/2);
    ctx.lineTo(10, -t.h/2);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawWall(w){
    ctx.save();
    if (w.type === "curb") {
      ctx.fillStyle = "rgba(207,214,223,0.75)";
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
    } else if (w.type === "car") {
      ctx.fillStyle = "rgba(180,190,205,0.35)";
      ctx.strokeStyle = "rgba(255,255,255,0.18)";
    } else {
      ctx.fillStyle = "rgba(200,210,220,0.55)";
      ctx.strokeStyle = "rgba(0,0,0,0.25)";
    }
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(w.x - w.w/2, w.y - w.h/2, w.w, w.h, 10);
    ctx.fill();
    ctx.stroke();

    if (w.type === "curb") {
      ctx.strokeStyle = "rgba(255,255,255,0.25)";
      ctx.beginPath();
      ctx.moveTo(w.x - w.w/2, w.y - w.h/2);
      ctx.lineTo(w.x + w.w/2, w.y + w.h/2);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawParkedCar(p){
    ctx.save();
    ctx.translate(p.x,p.y);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(0, 6, p.w*0.55, p.h*0.55, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = p.color;
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-p.w/2, -p.h/2, p.w, p.h, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(10,20,40,0.55)";
    ctx.beginPath();
    ctx.roundRect(-p.w*0.30, -p.h*0.25, p.w*0.60, p.h*0.28, 8);
    ctx.fill();

    ctx.restore();
  }

  function drawCone(c){
    ctx.save();
    ctx.translate(c.x,c.y);
    ctx.globalAlpha = c.hit ? 0.25 : 1;

    ctx.fillStyle = "rgba(246,195,67,0.95)";
    ctx.beginPath(); ctx.arc(0,0,c.r,0,Math.PI*2); ctx.fill();
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2; ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.70)";
    ctx.beginPath(); ctx.arc(0,0,c.r*0.45,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawCar(){
    ctx.save();
    ctx.translate(CAR.x, CAR.y);
    ctx.rotate(CAR.a + Math.PI/2);

    ctx.globalAlpha = 0.28;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(0, 8, 18, 28, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.92)";
    ctx.strokeStyle = "rgba(0,0,0,0.25)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-18, -34, 36, 68, 12);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(10,20,40,0.70)";
    ctx.beginPath(); ctx.roundRect(-13, -22, 26, 14, 7); ctx.fill();
    ctx.beginPath(); ctx.roundRect(-13, 8, 26, 14, 7); ctx.fill();

    ctx.fillStyle = "rgba(246,195,67,0.9)";
    ctx.fillRect(-12, -2, 24, 4);

    const braking = (CAR.inputs.brake || keys.down) && Math.abs(CAR.v) > 5;
    if (braking) {
      ctx.shadowColor = "rgba(255,80,80,0.8)";
      ctx.shadowBlur = 18;
      ctx.fillStyle = "rgba(255,80,80,0.8)";
      ctx.fillRect(-13, 26, 8, 4);
      ctx.fillRect(5, 26, 8, 4);
      ctx.shadowBlur = 0;
    }
    if (CAR.gear === -1) {
      ctx.fillStyle = "rgba(255,255,255,0.85)";
      ctx.fillRect(-2, 26, 4, 4);
    }

    ctx.restore();
  }

  // =========================
  // Main loop
  // =========================
  let lastT = 0;
  function frame(t){
    requestAnimationFrame(frame);
    if (!lastT) { lastT = t; return; }
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.033);

    update(dt);
    draw();
  }

  // =========================
  // Init / defaults
  // =========================
  function setModeButtons() {
    btnModeContest.classList.toggle("active", mode === "CONTEST");
    btnModePractice.classList.toggle("active", mode === "PRACTICE");
  }
  setModeButtons();
  updateGearUI();
  hud.classList.add("hidden");
  screenEnd.classList.add("hidden");
  screenStart.classList.remove("hidden");

  btnModeContest.addEventListener("click", ()=> sfx("click"));
  btnModePractice.addEventListener("click", ()=> sfx("click"));
  btnStart.addEventListener("click", ()=> sfx("click"));
  btnQuit.addEventListener("click", ()=> sfx("click"));
  btnReplay.addEventListener("click", ()=> sfx("click"));
  btnMenu.addEventListener("click", ()=> sfx("click"));

  resize();
  requestAnimationFrame(frame);
})();
