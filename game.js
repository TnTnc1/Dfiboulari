(() => {
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");

  // ---- Audio (stable: gain-based mute) ----
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

  function beep({ type="sine", f0=440, f1=null, t=0.12, gain=0.12 }) {
    if (!audio.ctx || audio.muted) return;
    const now = audio.ctx.currentTime;
    const o = audio.ctx.createOscillator();
    const g = audio.ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f0, now);
    if (f1 !== null) o.frequency.linearRampToValueAtTime(f1, now + t);
    g.gain.setValueAtTime(gain, now);
    g.gain.exponentialRampToValueAtTime(0.0001, now + t);
    o.connect(g); g.connect(audio.master);
    o.start(now); o.stop(now + t);
  }

  function sfx(name) {
    if (name === "click") beep({ type:"square", f0:220, t:0.06, gain:0.08 });
    if (name === "hit")   beep({ type:"sawtooth", f0:140, f1:40,  t:0.18, gain:0.12 });
    if (name === "ok")    beep({ type:"sine", f0:520, f1:820, t:0.14, gain:0.12 });
    if (name === "bad")   beep({ type:"triangle", f0:220, f1:120, t:0.18, gain:0.12 });
    if (name === "green") beep({ type:"sine", f0:660, f1:880, t:0.10, gain:0.12 });
  }

  // ---- UI refs ----
  const el = (id) => document.getElementById(id);
  const startScreen = el("startScreen");
  const endScreen = el("endScreen");
  const gameUI = el("gameUI");
  const overlay = el("gameOverlay");

  const levelNameEl = el("levelName");
  const timerEl = el("timerVal");
  const penaltyEl = el("penaltyVal");
  const msgEl = el("monitorMsg");

  const toast = el("toast");
  const toastTitle = el("toastTitle");
  const toastText = el("toastText");

  const muteBtn = el("globalMuteBtn");
  const fsBtn = el("fsToggleBtn");

  // ---- Fullscreen ----
  function toggleFullScreen() {
    const doc = document;
    const docEl = document.documentElement;
    const request = docEl.requestFullscreen || docEl.webkitRequestFullscreen || docEl.mozRequestFullScreen || docEl.msRequestFullscreen;
    const exit = doc.exitFullscreen || doc.webkitExitFullscreen || doc.mozCancelFullScreen || doc.msExitFullscreen;
    const isFs = doc.fullscreenElement || doc.webkitFullscreenElement || doc.mozFullScreenElement || doc.msFullscreenElement;
    if (!isFs) request && request.call(docEl);
    else exit && exit.call(doc);
  }
  fsBtn.addEventListener("click", (e) => { e.preventDefault(); toggleFullScreen(); fsBtn.blur(); });

  // ---- Mute ----
  function toggleMute() {
    audio.muted = !audio.muted;
    muteBtn.textContent = audio.muted ? "🔇" : "🔊";
    if (audio.master) audio.master.gain.value = audio.muted ? 0.0 : 0.9;
  }
  muteBtn.addEventListener("click", (e) => { e.preventDefault(); toggleMute(); muteBtn.blur(); });

  // ---- Resize ----
  function resize() {
    canvas.width = Math.floor(window.innerWidth * devicePixelRatio);
    canvas.height = Math.floor(window.innerHeight * devicePixelRatio);
    canvas.style.width = window.innerWidth + "px";
    canvas.style.height = window.innerHeight + "px";
    ctx.setTransform(1,0,0,1,0,0);
    ctx.scale(devicePixelRatio, devicePixelRatio);
  }
  window.addEventListener("resize", resize);
  resize();

  const W = () => window.innerWidth;
  const H = () => window.innerHeight;
  const CX = (p) => W() * (p/100);
  const CY = (p) => H() * (p/100);

  // ---- Game state ----
  let state = "MENU"; // MENU | PLAY | TRANSITION | FINISHED
  let playerName = "";
  let lastUsedName = "";
  let levelIndex = 0;

  // IMPORTANT: chrono démarre plus tard (au vert OU au premier mouvement)
  let startTimeMs = null;

  let penaltyTime = 0;

  // Stats (V2.1)
  const stats = {
    coneHits: 0,
    wallHits: 0,
    falseStart: 0,
    precisionPen: 0,
  };

  // Camera/FX
  let screenShake = 0;

  // Car physics (arcade-fun but controllable)
  const CAR = {
    x: 0, y: 0, a: 0,
    v: 0,
    steer: 0,
    gear: 1, // 1 or -1
    inputs: { gas:false, brake:false, steerTarget:0 },
  };

  // Tunables
  const MAX_STEER = 0.62;
  const WHEELBASE = 44;
  const ACC_FWD = 520;   // px/s²
  const ACC_REV = 360;
  const MAX_V_FWD = 280; // px/s
  const MAX_V_REV = 160;
  const BRAKE = 620;
  const DRAG = 2.7;

  // Entities
  let cones = [];
  let walls = [];
  let target = null;

  // Level-specific flags
  let levelMeta = {};
  let winHoldMs = 0;

  function resetWorld() {
    cones = [];
    walls = [];
    target = null;
    levelMeta = {};
    winHoldMs = 0;
  }

  // --- Helpers ---
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a,b,t) => a + (b-a)*t;

  function showToast(title, text, ms=900) {
    toastTitle.textContent = title;
    toastText.textContent = text;
    toast.classList.remove("hidden");
    setTimeout(() => toast.classList.add("hidden"), ms);
  }

  function setMsg(text) {
    msgEl.textContent = text;
  }

  function ensureTimerStarted() {
    if (startTimeMs === null) startTimeMs = Date.now();
  }

  function elapsedSeconds() {
    // Tant que le chrono n'a pas démarré : 0.00
    if (startTimeMs === null) return 0;
    return ((Date.now() - startTimeMs) / 1000) + penaltyTime;
  }

  function addPenalty(seconds, reason="", type="wall") {
    penaltyTime += seconds;
    penaltyEl.textContent = Math.round(penaltyTime);

    if (type === "cone") stats.coneHits++;
    if (type === "wall") stats.wallHits++;
    if (type === "false") stats.falseStart++;
    if (type === "precision") stats.precisionPen += seconds;

    screenShake = Math.min(10, screenShake + 6);
    sfx("hit");
    if (reason) {
      showToast("PÉNALITÉ", `+${seconds}s — ${reason}`, 1100);
      setMsg(`${reason} (+${seconds}s)`);
    } else {
      showToast("PÉNALITÉ", `+${seconds}s`, 900);
    }
  }

  // ---- Levels (V2.1) ----
  const LEVELS = [
    {
      title: "1) FEU TRICOLORE",
      intro: "Attends le VERT. Chrono démarre au vert (ou au mouvement si départ trop tôt).",
      setup() {
        resetWorld();

        const roadY = CY(60);
        walls.push({x: CX(50), y: roadY - 92, w: CX(100), h: 20});
        walls.push({x: CX(50), y: roadY + 92, w: CX(100), h: 20});

        CAR.x = CX(12); CAR.y = roadY + 40; CAR.a = 0; CAR.v = 0; CAR.steer = 0; CAR.gear = 1;
        updateGearUI();

        // "Light"
        levelMeta.lightState = "RED"; // RED -> GREEN
        levelMeta.lightX = CX(45);
        levelMeta.lightY = roadY - 120;
        levelMeta.greenAt = Date.now() + (1200 + Math.random()*1800); // 1.2–3.0s
        levelMeta.falseStartDone = false;

        target = { x: CX(68), y: roadY + 40, w: 92, h: 70, a: 0 };
        setMsg("Attente du VERT…");
      },
      update(dt) {
        // When green time reached
        if (levelMeta.lightState === "RED" && Date.now() >= levelMeta.greenAt) {
          levelMeta.lightState = "GREEN";
          sfx("green");
          ensureTimerStarted(); // ✅ Chrono démarre au vert si pas déjà parti
          setMsg("VERT : tu peux démarrer.");
          showToast("VERT", "Démarre", 650);
        }

        // False start: if you move before green -> chrono démarre au mouvement
        if (levelMeta.lightState === "RED") {
          const moving = Math.abs(CAR.v) > 8 || CAR.inputs.gas || keys.up;
          if (moving) {
            ensureTimerStarted(); // ✅ démarre chrono dès qu'il bouge (grille)
            if (!levelMeta.falseStartDone) {
              levelMeta.falseStartDone = true;
              addPenalty(5, "Départ trop tôt (feu rouge)", "false");
            }
          }
        }
      }
    },

    {
      title: "2) SLALOM CÔNES",
      intro: "Traverse le slalom sans toucher. Cône = +2s.",
      setup() {
        resetWorld();

        walls.push({x: CX(50), y: CY(22), w: CX(100), h: 18});
        walls.push({x: CX(50), y: CY(78), w: CX(100), h: 18});

        CAR.x = CX(12); CAR.y = CY(60); CAR.a = 0; CAR.v = 0; CAR.steer = 0; CAR.gear = 1;
        updateGearUI();

        // Slalom: random each run
        const baseY = CY(50);
        const n = 9;
        for (let i=0; i<n; i++) {
          const x = lerp(CX(22), CX(78), i/(n-1));
          const offset = (i%2===0 ? -1 : 1) * (40 + Math.random()*35);
          const y = baseY + offset + (Math.random()*12 - 6);
          cones.push({ x, y, r: 14, hit:false });
        }

        target = { x: CX(86), y: CY(50), w: 120, h: 90, a: 0 };
        setMsg("Contrôle et trajectoire.");
      },
      update(dt) {}
    },

    {
      title: "3) CRÉNEAU CHALLENGE",
      intro: "Marche arrière obligatoire. Précision = meilleure note.",
      setup() {
        resetWorld();

        const roadY = CY(62);
        walls.push({x: CX(50), y: roadY - 88, w: CX(100), h: 18});
        walls.push({x: CX(50), y: roadY + 88, w: CX(100), h: 18});

        // Side wall on right
        walls.push({x: CX(82), y: roadY - 10, w: 14, h: 240});

        // Parked cars
        const px = CX(55);
        const py = roadY - 35;
        walls.push({x: px - 120, y: py, w: 36, h: 76});
        walls.push({x: px + 120, y: py, w: 36, h: 76});

        CAR.x = CX(14); CAR.y = roadY + 42; CAR.a = 0; CAR.v = 0; CAR.steer = 0; CAR.gear = 1;
        updateGearUI();

        target = { x: px, y: py, w: 98, h: 74, a: 0 };

        levelMeta.mustReverse = true;
        levelMeta.hasReversed = false;
        setMsg("Passe en R (Espace) puis rentre dans la zone.");
      },
      update(dt) {
        if (CAR.gear === -1 && Math.abs(CAR.v) > 12) levelMeta.hasReversed = true;
      }
    }
  ];

  // ---- Controls ----
  const keys = { up:false, down:false, left:false, right:false };

  window.addEventListener("keydown", (e) => {
    if (["ArrowUp","ArrowDown","ArrowLeft","ArrowRight"," ","Shift","z","q","s","d"].includes(e.key)) e.preventDefault();
    switch(e.key){
      case "ArrowLeft": case "q": keys.left = true; break;
      case "ArrowRight": case "d": keys.right = true; break;
      case "ArrowUp": case "z": keys.up = true; break;
      case "ArrowDown": case "s": keys.down = true; break;
      case " ": case "Shift": toggleGear(); break;
    }
  }, { passive:false });

  window.addEventListener("keyup", (e) => {
    switch(e.key){
      case "ArrowLeft": case "q": keys.left = false; break;
      case "ArrowRight": case "d": keys.right = false; break;
      case "ArrowUp": case "z": keys.up = false; break;
      case "ArrowDown": case "s": keys.down = false; break;
    }
  });

  const gearStick = el("gearStick");
  const btnGas = el("btnGas");
  const btnBrake = el("btnBrake");
  const wheelZone = el("wheelZone");
  const wheelVisual = el("wheelVisual");

  function updateGearUI(){
    if (CAR.gear === 1) {
      gearStick.textContent = "D";
      gearStick.className = "gear-stick gear-d";
    } else {
      gearStick.textContent = "R";
      gearStick.className = "gear-stick gear-r";
    }
  }

  function toggleGear(){
    CAR.gear *= -1;
    updateGearUI();
    sfx("click");
    if (levelIndex === 2 && CAR.gear === -1) setMsg("R engagée. Manœuvre.");
  }

  // Touch/mouse pedals
  const setGas = (on) => CAR.inputs.gas = on;
  const setBrake = (on) => CAR.inputs.brake = on;

  function bindPressHold(elm, onDown, onUp){
    elm.addEventListener("touchstart", (e)=>{ e.preventDefault(); onDown(); }, { passive:false });
    elm.addEventListener("touchend", (e)=>{ e.preventDefault(); onUp(); }, { passive:false });
    elm.addEventListener("touchcancel", (e)=>{ e.preventDefault(); onUp(); }, { passive:false });
    elm.addEventListener("mousedown", (e)=>{ e.preventDefault(); onDown(); });
    window.addEventListener("mouseup", ()=> onUp());
  }
  bindPressHold(btnGas, ()=>setGas(true), ()=>setGas(false));
  bindPressHold(btnBrake, ()=>setBrake(true), ()=>setBrake(false));

  gearStick.addEventListener("touchstart", (e)=>{ e.preventDefault(); toggleGear(); }, { passive:false });
  gearStick.addEventListener("mousedown", (e)=>{ e.preventDefault(); toggleGear(); });

  // Steering wheel control
  let isSteering = false;
  let wheelTouchId = null;

  function handleSteer(clientX, clientY) {
    const rect = wheelZone.getBoundingClientRect();
    const cx = rect.left + rect.width/2;
    const cy = rect.top + rect.height/2;
    const dx = clientX - cx;
    const dy = clientY - cy;

    let angle = Math.atan2(dy, dx) * (180/Math.PI);
    angle += 90;
    if (angle > 180) angle -= 360;
    if (angle < -180) angle += 360;

    const maxAngle = 115;
    angle = clamp(angle, -maxAngle, maxAngle);
    wheelVisual.style.transform = `rotate(${angle}deg)`;
    CAR.inputs.steerTarget = angle / maxAngle;
  }

  wheelZone.addEventListener("touchstart", (e)=>{
    e.preventDefault();
    const t = e.changedTouches[0];
    wheelTouchId = t.identifier;
    isSteering = true;
    handleSteer(t.clientX, t.clientY);
  }, { passive:false });

  wheelZone.addEventListener("touchmove", (e)=>{
    e.preventDefault();
    if (!isSteering) return;
    for (const t of e.changedTouches){
      if (t.identifier === wheelTouchId) handleSteer(t.clientX, t.clientY);
    }
  }, { passive:false });

  function endSteer(e){
    for (const t of e.changedTouches){
      if (t.identifier === wheelTouchId){
        isSteering = false;
        wheelTouchId = null;
        if (!keys.left && !keys.right){
          CAR.inputs.steerTarget = 0;
          wheelVisual.style.transform = "rotate(0deg)";
        }
      }
    }
  }
  wheelZone.addEventListener("touchend", endSteer, { passive:false });
  wheelZone.addEventListener("touchcancel", endSteer, { passive:false });

  // Mouse fallback
  wheelZone.addEventListener("mousedown", (e)=>{ isSteering = true; handleSteer(e.clientX, e.clientY); });
  window.addEventListener("mousemove", (e)=>{ if (isSteering) handleSteer(e.clientX, e.clientY); });
  window.addEventListener("mouseup", ()=>{
    isSteering = false;
    if (!keys.left && !keys.right){
      CAR.inputs.steerTarget = 0;
      wheelVisual.style.transform = "rotate(0deg)";
    }
  });

  // ---- Start / Quit / Restart / Copy ----
  el("startBtn").addEventListener("click", startGame);
  el("quitBtn").addEventListener("click", quitGame);
  el("backMenuBtn").addEventListener("click", () => { endScreen.classList.add("hidden"); startScreen.classList.remove("hidden"); state="MENU"; });

  el("replayNowBtn").addEventListener("click", () => {
    // Rejouer direct avec le même nom (sans retaper)
    if (!lastUsedName) {
      endScreen.classList.add("hidden");
      startScreen.classList.remove("hidden");
      state="MENU";
      return;
    }
    endScreen.classList.add("hidden");
    startRunWithName(lastUsedName);
  });

  el("copyBtn").addEventListener("click", async () => {
    const text = buildShareText();
    try {
      await navigator.clipboard.writeText(text);
      showToast("COPIÉ", "Résultat copié dans le presse-papier", 900);
      sfx("ok");
    } catch {
      // fallback
      const ta = document.createElement("textarea");
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      try { document.execCommand("copy"); } catch {}
      document.body.removeChild(ta);
      showToast("COPIÉ", "Résultat copié (fallback)", 900);
    }
  });

  function startGame(){
    const input = el("playerNameInput");
    const name = input.value.trim();
    if (!name) { alert("Il faut un nom pour jouer 😉"); return; }
    startRunWithName(name);
  }

  function startRunWithName(name){
    playerName = name;
    lastUsedName = name;

    if (audio.ctx && audio.ctx.state === "suspended") audio.ctx.resume();

    // Reset run
    levelIndex = 0;
    penaltyTime = 0;
    penaltyEl.textContent = "0";

    stats.coneHits = 0;
    stats.wallHits = 0;
    stats.falseStart = 0;
    stats.precisionPen = 0;

    // Chrono démarre plus tard (au vert ou au mouvement)
    startTimeMs = null;
    timerEl.textContent = "00.00";

    startScreen.classList.add("hidden");
    endScreen.classList.add("hidden");
    gameUI.classList.remove("hidden");
    overlay.classList.remove("hidden");

    loadLevel(levelIndex);
    state = "PLAY";
  }

  function quitGame(){
    if (confirm("Quitter la partie ?")) {
      state = "MENU";
      gameUI.classList.add("hidden");
      overlay.classList.add("hidden");
      startScreen.classList.remove("hidden");
    }
  }

  function loadLevel(i){
    levelIndex = i;
    const lvl = LEVELS[i];
    levelNameEl.textContent = lvl.title;
    setMsg(lvl.intro);
    showToast("ÉPREUVE", lvl.title, 850);
    toast.classList.add("hidden");

    // reset car inputs
    CAR.inputs.gas = false;
    CAR.inputs.brake = false;
    CAR.inputs.steerTarget = 0;
    wheelVisual.style.transform = "rotate(0deg)";

    lvl.setup();
  }

  // ---- Physics update ----
  function update(dt){
    if (state !== "PLAY") return;

    // steering target from keyboard if not steering by touch
    if (!isSteering) {
      if (keys.left) CAR.inputs.steerTarget = -1;
      else if (keys.right) CAR.inputs.steerTarget = 1;
      else CAR.inputs.steerTarget = 0;

      wheelVisual.style.transform = `rotate(${CAR.inputs.steerTarget * 120}deg)`;
    }

    // smooth steer
    const targetSteer = CAR.inputs.steerTarget * MAX_STEER;
    CAR.steer = lerp(CAR.steer, targetSteer, clamp(dt*10, 0, 1));

    const gas = CAR.inputs.gas || keys.up;
    const brake = CAR.inputs.brake || keys.down;

    // IMPORTANT: si on bouge (n'importe quel niveau) et que chrono pas démarré -> démarrer
    // (Ça couvre le cas “je n’étais pas au feu / ou quelqu’un bouge direct”)
    if (startTimeMs === null) {
      const movingNow = gas || brake || Math.abs(CAR.v) > 10;
      if (movingNow) ensureTimerStarted();
    }

    // acceleration / braking
    if (gas) {
      const acc = (CAR.gear === 1) ? ACC_FWD : ACC_REV;
      CAR.v += acc * dt * CAR.gear;
    } else if (brake) {
      if (Math.abs(CAR.v) > 10) {
        CAR.v -= Math.sign(CAR.v) * BRAKE * dt;
      } else {
        CAR.v = 0;
      }
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

    LEVELS[levelIndex].update && LEVELS[levelIndex].update(dt);

    handleCollisions();
    checkWin();

    timerEl.textContent = elapsedSeconds().toFixed(2);
  }

  function handleCollisions(){
    if (CAR.x < 0 || CAR.x > W() || CAR.y < 0 || CAR.y > H()) {
      addPenalty(5, "Sortie de zone", "wall");
      CAR.x = clamp(CAR.x, 20, W()-20);
      CAR.y = clamp(CAR.y, 20, H()-20);
      CAR.v *= -0.35;
      return;
    }

    const corners = getCarCorners(CAR.x, CAR.y, CAR.a);

    for (const w of walls) {
      const left = w.x - w.w/2, right = w.x + w.w/2, top = w.y - w.h/2, bottom = w.y + w.h/2;
      for (const p of corners) {
        if (p.x > left && p.x < right && p.y > top && p.y < bottom) {
          addPenalty(5, "Collision", "wall");
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
        const d = Math.hypot(p.x - c.x, p.y - c.y);
        if (d < c.r + 6) {
          c.hit = true;
          addPenalty(2, "Cône touché", "cone");
          return;
        }
      }
    }
  }

  function getCarCorners(x,y,a){
    const cos = Math.cos(a), sin = Math.sin(a);
    const front = 28, back = 30, side = 14;
    return [
      { x: x + cos*front - sin*side, y: y + sin*front + cos*side },
      { x: x + cos*front + sin*side, y: y + sin*front - cos*side },
      { x: x - cos*back + sin*side,  y: y - sin*back - cos*side },
      { x: x - cos*back - sin*side,  y: y - sin*back + cos*side }
    ];
  }

  function pointInTarget(px, py, t){
    return (px > t.x - t.w/2 && px < t.x + t.w/2 && py > t.y - t.h/2 && py < t.y + t.h/2);
  }

  function checkWin(){
    if (!target) return;

    const near = Math.hypot(CAR.x - target.x, CAR.y - target.y) < Math.max(target.w, target.h) * 0.8;
    const stopped = Math.abs(CAR.v) < 12;

    if (levelIndex === 2 && levelMeta.mustReverse && !levelMeta.hasReversed) {
      if (near) setMsg("Marche arrière obligatoire (R).");
      winHoldMs = 0;
      return;
    }

    if (near && stopped) {
      winHoldMs += 16;
      if (winHoldMs > 900) {
        const corners = getCarCorners(CAR.x, CAR.y, CAR.a);
        let inside = 0;
        for (const p of corners) if (pointInTarget(p.x, p.y, target)) inside++;

        if (inside === 4) {
          sfx("ok");
          showToast("VALIDÉ", "Précision maximale", 900);
        } else {
          const extra = (4 - inside); // 1..4
          addPenalty(extra, "Précision", "precision");
        }

        nextLevel();
        winHoldMs = 0;
      } else {
        setMsg("Validation…");
      }
    } else {
      winHoldMs = 0;
    }
  }

  function nextLevel(){
    state = "TRANSITION";
    setTimeout(() => {
      if (levelIndex + 1 >= LEVELS.length) finishGame();
      else {
        loadLevel(levelIndex + 1);
        state = "PLAY";
      }
    }, 700);
  }

  function finishGame(){
    state = "FINISHED";

    // Bonus "run clean" : aucun cône + aucune collision mur
    const cleanBonus = (stats.coneHits === 0 && stats.wallHits === 0) ? 1 : 0;

    const rawFinal = elapsedSeconds();
    const final = Math.max(0, rawFinal - cleanBonus);

    const medal = computeMedal(final, penaltyTime);
    const grade = computeGrade(final, penaltyTime);

    el("certName").textContent = playerName.toUpperCase();
    el("certDate").textContent = new Date().toLocaleDateString();
    el("certPenalties").textContent = `+${Math.round(penaltyTime)}s`;
    el("certTime").textContent = `${final.toFixed(2)}s`;
    el("certId").textContent = "#" + String(Math.floor(Math.random()*9000)+1000);

    el("certMedal").textContent = medal.label;
    el("certGrade").textContent = grade.letter;

    const tipParts = [];
    if (cleanBonus) tipParts.push("Bonus run clean : -1s (aucun cône / aucune collision).");
    if (stats.falseStart) tipParts.push("Conseil : attendre le vert à l’épreuve 1.");
    if (stats.coneHits) tipParts.push("Conseil : slalom = petits mouvements de volant.");
    if (stats.precisionPen) tipParts.push("Conseil : créneau = arrêter la voiture puis valider.");

    el("certTip").textContent = tipParts.length ? tipParts.join(" ") : "Très bon résultat. Rejoue pour améliorer le chrono.";

    gameUI.classList.add("hidden");
    overlay.classList.add("hidden");
    endScreen.classList.remove("hidden");

    // mémorise le dernier texte de partage
    lastShareText = buildShareText(final, cleanBonus, medal.label, grade.letter);
  }

  function computeMedal(finalTime, pen){
    // Ajustable plus tard
    // + pénalités -> plus difficile d'avoir l'or
    if (pen <= 2 && finalTime < 55) return { label:"🥇 OR" };
    if (pen <= 6 && finalTime < 70) return { label:"🥈 ARGENT" };
    if (finalTime < 90) return { label:"🥉 BRONZE" };
    return { label:"🎯 PARTICIPATION" };
  }

  function computeGrade(finalTime, pen){
    if (pen <= 2 && finalTime < 55) return { letter:"A" };
    if (pen <= 6 && finalTime < 70) return { letter:"B" };
    if (pen <= 12) return { letter:"C" };
    return { letter:"D" };
  }

  // ---- Share text ----
  let lastShareText = "";
  function buildShareText(finalOverride=null, cleanBonus=0, medalLabel=null, gradeLetter=null){
    const final = finalOverride !== null ? finalOverride : parseFloat(el("certTime").textContent) || elapsedSeconds();
    const penalties = Math.round(penaltyTime);
    const medal = medalLabel || (el("certMedal")?.textContent || "");
    const grade = gradeLetter || (el("certGrade")?.textContent || "");
    const bonusLine = cleanBonus ? " (bonus run clean -1s)" : "";
    return `LE DÉFI BOULARI 🚗💨
Pilote : ${playerName}
Temps : ${final.toFixed(2)}s${bonusLine}
Pénalités : +${penalties}s
Médaille : ${medal}
Note : ${grade}

À gagner : BON D’ACHAT 🏆`;
  }

  // ---- Draw ----
  function draw(){
    ctx.clearRect(0,0,W(),H());
    drawBackdrop();

    let ox = 0, oy = 0;
    if (screenShake > 0.2) {
      ox = (Math.random()*2-1) * screenShake;
      oy = (Math.random()*2-1) * screenShake;
      screenShake *= 0.86;
    } else screenShake = 0;

    ctx.save();
    ctx.translate(ox, oy);

    drawRoadStyle();

    if (target) drawTarget(target);
    for (const w of walls) drawWall(w);
    for (const c of cones) drawCone(c);

    if (levelIndex === 0 && state === "PLAY") drawLight();
    drawCar();

    ctx.restore();
  }

  function drawBackdrop(){
    const g = ctx.createRadialGradient(W()*0.5, H()*0.45, 40, W()*0.5, H()*0.45, Math.max(W(),H())*0.8);
    g.addColorStop(0, "rgba(255,255,255,0.03)");
    g.addColorStop(1, "rgba(0,0,0,0.40)");
    ctx.fillStyle = g;
    ctx.fillRect(0,0,W(),H());
  }

  function drawRoadStyle(){
    ctx.fillStyle = "rgba(255,255,255,0.05)";
    ctx.fillRect(0,0,W(),H());

    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 4;
    ctx.setLineDash([18, 18]);
    ctx.beginPath();
    ctx.moveTo(0, H()*0.5);
    ctx.lineTo(W(), H()*0.5);
    ctx.stroke();
    ctx.setLineDash([]);
  }

  function drawTarget(t){
    ctx.save();
    ctx.translate(t.x, t.y);
    ctx.strokeStyle = "rgba(46,204,113,0.95)";
    ctx.lineWidth = 4;
    ctx.setLineDash([10,10]);
    ctx.strokeRect(-t.w/2, -t.h/2, t.w, t.h);
    ctx.setLineDash([]);
    ctx.fillStyle = "rgba(46,204,113,0.18)";
    ctx.fillRect(-t.w/2, -t.h/2, t.w, t.h);

    ctx.fillStyle = "rgba(255,255,255,0.6)";
    ctx.beginPath();
    ctx.moveTo(0, -t.h/2 - 14);
    ctx.lineTo(-10, -t.h/2);
    ctx.lineTo(10, -t.h/2);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawWall(w){
    ctx.fillStyle = "rgba(200,210,220,0.75)";
    ctx.strokeStyle = "rgba(60,70,80,0.55)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(w.x - w.w/2, w.y - w.h/2, w.w, w.h);
    ctx.fill();
    ctx.stroke();

    ctx.strokeStyle = "rgba(255,255,255,0.35)";
    ctx.beginPath();
    ctx.moveTo(w.x - w.w/2, w.y - w.h/2);
    ctx.lineTo(w.x + w.w/2, w.y + w.h/2);
    ctx.stroke();
  }

  function drawCone(c){
    ctx.save();
    ctx.translate(c.x, c.y);
    ctx.globalAlpha = c.hit ? 0.35 : 1.0;

    ctx.fillStyle = "rgba(230,126,34,0.95)";
    ctx.beginPath();
    ctx.arc(0,0,c.r,0,Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = "rgba(120,60,0,0.55)";
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,0.85)";
    ctx.beginPath();
    ctx.arc(0,0,c.r*0.45,0,Math.PI*2);
    ctx.fill();

    ctx.restore();
  }

  function drawLight(){
    const x = levelMeta.lightX, y = levelMeta.lightY;

    ctx.fillStyle = "rgba(30,30,35,0.85)";
    ctx.fillRect(x-8, y, 16, 90);

    ctx.fillStyle = "rgba(20,20,25,0.90)";
    ctx.strokeStyle = "rgba(255,255,255,0.18)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(x-32, y-70, 64, 70, 14);
    ctx.fill();
    ctx.stroke();

    const redOn = levelMeta.lightState === "RED";
    const greenOn = levelMeta.lightState === "GREEN";

    glowDot(x, y-46, 12, redOn ? "rgba(255,71,87,1)" : "rgba(255,71,87,0.22)", redOn);
    glowDot(x, y-18, 12, greenOn ? "rgba(46,204,113,1)" : "rgba(46,204,113,0.22)", greenOn);
  }

  function glowDot(x,y,r,color,on){
    ctx.save();
    if (on) { ctx.shadowColor = color; ctx.shadowBlur = 18; }
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.arc(x,y,r,0,Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawCar(){
    ctx.save();
    ctx.translate(CAR.x, CAR.y);
    ctx.rotate(CAR.a + Math.PI/2);

    ctx.globalAlpha = 0.25;
    ctx.fillStyle = "black";
    ctx.beginPath();
    ctx.ellipse(0, 6, 16, 26, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.fillStyle = "rgba(255,255,255,0.95)";
    ctx.strokeStyle = "rgba(40,50,60,0.5)";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.roundRect(-16, -32, 32, 64, 10);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(30,40,60,0.75)";
    ctx.beginPath();
    ctx.roundRect(-12, -22, 24, 14, 6);
    ctx.fill();
    ctx.beginPath();
    ctx.roundRect(-12, 10, 24, 12, 6);
    ctx.fill();

    ctx.fillStyle = "rgba(52,152,219,0.95)";
    ctx.font = "700 10px Roboto Condensed, sans-serif";
    ctx.textAlign = "center";
    ctx.fillText("BOULARI", 0, 2);

    const braking = (CAR.inputs.brake || keys.down) && Math.abs(CAR.v) > 5;
    if (braking) {
      ctx.fillStyle = "rgba(255,0,0,0.65)";
      ctx.shadowColor = "rgba(255,0,0,0.65)";
      ctx.shadowBlur = 16;
      ctx.fillRect(-12, 26, 7, 4);
      ctx.fillRect(5, 26, 7, 4);
      ctx.shadowBlur = 0;
    }

    if (CAR.gear === -1) {
      ctx.fillStyle = "rgba(255,255,255,0.75)";
      ctx.fillRect(-2, 26, 4, 4);
    }

    ctx.restore();
  }

  // ---- Main loop ----
  let lastT = 0;
  function loop(t){
    requestAnimationFrame(loop);
    if (!lastT) { lastT = t; return; }
    let dt = (t - lastT) / 1000;
    lastT = t;
    dt = Math.min(dt, 0.033);

    update(dt);
    draw();
  }
  requestAnimationFrame(loop);

  // ---- Start menu default ----
})();
