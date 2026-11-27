// Pedalboard UI. Audio stays in engine.js; this file only holds state and DOM.

let state = loadState();
let saveTimer = 0;
let taps = [];
let drag = null;

function loadState() {
  try {
    const raw = localStorage.getItem(storageKeyFor(APP_CONFIG.name));
    if (!raw) return initialState();
    return hydrate(JSON.parse(raw));
  } catch (err) {
    return initialState();
  }
}

function saveNow() {
  clearTimeout(saveTimer);
  try {
    localStorage.setItem(storageKeyFor(APP_CONFIG.name), JSON.stringify(serialize(state)));
  } catch (err) { /* private mode */ }
}

function scheduleSave() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 40);
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
}

function setStatus(text) {
  document.getElementById("status").textContent = text || "";
}

function readKnob(pedal, param) {
  if (pedal === "global") return param === "input" ? state.inputGain / INPUT_GAIN_MAX : state.master;
  return state.pedals[pedal].params[param];
}

function knobText(pedal, param, knob) {
  if (pedal === "global") return param === "input" ? formatGainDb(state.inputGain) : Math.round(state.master * 100) + "%";
  return formatParam(pedal, param, knob, state.pedals[pedal].type);
}

function knobLabel(pedal, param) {
  if (pedal === "global") return param === "input" ? "Input" : "Master";
  return paramLabel(pedal, param, state.pedals[pedal].type);
}

function paintFromState() {
  const knobs = document.querySelectorAll(".knob");
  for (let i = 0; i < knobs.length; i++) {
    const el = knobs[i];
    const pedal = el.dataset.pedal;
    const param = el.dataset.param;
    const knob = readKnob(pedal, param);
    const text = knobText(pedal, param, knob);
    const label = knobLabel(pedal, param);
    el.style.setProperty("--p", String(clamp01(knob)));
    const valueEl = el.querySelector(".knob-value");
    const labelEl = el.querySelector(".knob-label");
    if (valueEl) valueEl.textContent = text;
    if (labelEl) labelEl.textContent = label;
  }
}

let meterHold = 0;

function paintMeter(rms) {
  const pct = Math.round(meterPercent(rms) * 100);
  meterHold = Math.max(pct, meterHold * 0.97);
  const shown = Math.round(meterHold);
  const fill = document.getElementById("meterFill");
  fill.style.width = shown + "%";
  fill.dataset.hot = shown > 92 ? "hot" : shown > 75 ? "warm" : "";
  document.getElementById("meter").setAttribute("aria-valuenow", String(shown));
}

function highlightPreset() {
  const buttons = document.querySelectorAll("[data-preset]");
  for (let i = 0; i < buttons.length; i++) {
    const on = buttons[i].dataset.preset === state.preset;
    buttons[i].setAttribute("aria-pressed", String(on));
    buttons[i].classList.toggle("on", on);
  }
}

function playerSpec() {
  return {
    sound: state.player.sound,
    note: state.player.note,
    octave: state.player.octave,
    repeat: state.player.repeat,
  };
}

let nowPlaying = "";
let noteOpen = false;
let currentTake = null;

function looping(id) {
  if (!state.looping || state.looping[id] === undefined) return true;
  return !!state.looping[id];
}

function clock(seconds) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 60) return s.toFixed(1) + "s";
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return m + ":" + (r < 10 ? "0" : "") + r;
}

function paintPlayer() {
  const player = state.player;
  document.getElementById("noteReadout").textContent = player.note + player.octave;
  document.getElementById("octaveDown").disabled = player.octave <= 2;
  document.getElementById("octaveUp").disabled = player.octave >= 5;
  const notes = document.querySelectorAll("#notes button");
  for (let i = 0; i < notes.length; i++) {
    const on = notes[i].dataset.note === player.note;
    notes[i].classList.toggle("on", on);
    notes[i].setAttribute("aria-pressed", String(on));
  }
  const sounds = document.querySelectorAll("#sounds button");
  for (let i = 0; i < sounds.length; i++) {
    const on = sounds[i].dataset.sound === player.sound;
    sounds[i].classList.toggle("on", on);
    sounds[i].setAttribute("aria-pressed", String(on));
  }
  const repeat = document.getElementById("repeat");
  repeat.classList.toggle("on", player.repeat);
  repeat.setAttribute("aria-pressed", String(player.repeat));
  if (engine.repeatSpec) engine.updateRepeat(playerSpec());
  paintLibrary();
}

function renderPlayer() {
  document.getElementById("notes").innerHTML = NOTE_NAMES.map((name) =>
    '<button type="button" data-note="' + name + '">' + name + "</button>"
  ).join("");
  document.getElementById("sounds").innerHTML = TEST_SOUNDS.map((id) =>
    '<button type="button" data-sound="' + id + '">' + choiceInner(TEST_SOUND_COPY[id]) + "</button>"
  ).join("");
  document.getElementById("repeat").innerHTML = choiceInner(REPEAT_COPY);
  paintPlayer();
}

function renderLibrary() {
  document.getElementById("loopList").innerHTML = LOOPS.map((loop) =>
    '<article class="loop" data-loop="' + loop.id + '">'
    + "<h3>" + esc(loop.name) + "</h3>"
    + "<p>" + esc(loop.hint) + "</p>"
    + '<div class="loop-actions">'
    + '<button type="button" data-act="play">Play</button>'
    + '<button type="button" data-act="stop">Stop</button>'
    + '<button type="button" data-act="loop" aria-pressed="true">Loop on</button>'
    + "</div></article>"
  ).join("");
  renderPlayer();
}

function paintLibrary() {
  const cards = document.querySelectorAll("#loopList .loop");
  for (let i = 0; i < cards.length; i++) {
    const card = cards[i];
    const id = card.dataset.loop;
    const on = nowPlaying === id;
    card.classList.toggle("playing", on);
    const loopOn = id === "notes" ? !!state.player.repeat : looping(id);
    const toggle = card.querySelector('[data-act="loop"]');
    toggle.setAttribute("aria-pressed", String(loopOn));
    toggle.textContent = loopOn ? "Loop on" : "Loop off";
    const play = card.querySelector('[data-act="play"]');
    play.classList.toggle("on", on);
    play.disabled = !!engine.recording;
  }
  const notes = document.getElementById("notePlayer");
  if (notes) notes.hidden = !(noteOpen || nowPlaying === "notes");
  paintRecord();
}

function paintRecord() {
  const recording = !!engine.recording;
  document.getElementById("recordBtn").hidden = recording;
  document.getElementById("recordingBar").hidden = !recording;
  const card = document.getElementById("takeCard");
  card.hidden = !currentTake;
  if (!currentTake) return;
  const seconds = currentTake.samples.length / currentTake.sampleRate;
  const loopOn = currentTake.loop !== false;
  document.getElementById("takeHint").textContent = clock(seconds) + " recorded. It loops through the pedals. + and − change the sound while it plays.";
  document.getElementById("playTake").classList.toggle("on", nowPlaying === "take");
  document.getElementById("playTake").disabled = seconds < 0.05;
  const loopBtn = document.getElementById("takeLoop");
  loopBtn.setAttribute("aria-pressed", String(loopOn));
  loopBtn.textContent = loopOn ? "Loop on" : "Loop off";
  const start = currentTake.trimStart || 0;
  const end = currentTake.trimEnd > 0 ? currentTake.trimEnd : seconds;
  document.getElementById("trimStart").value = String(Math.round(1000 * start / Math.max(seconds, 0.01)));
  document.getElementById("trimEnd").value = String(Math.round(1000 * end / Math.max(seconds, 0.01)));
  document.getElementById("trimStartLabel").textContent = clock(start);
  document.getElementById("trimEndLabel").textContent = clock(end);
}

function choiceInner(copy) {
  return '<span class="choice-name">' + esc(copy.label) + "</span>"
    + '<span class="choice-hint">' + esc(copy.hint) + "</span>";
}

function chainLabel() {
  document.getElementById("chainLabel").textContent = chainText(state);
}

function nudgeGlyphs() {
  const board = document.getElementById("board");
  if (!board) return;
  board.classList.toggle("horizontal", window.matchMedia("(min-width: 900px)").matches);
}

function knobMarkup(pedal, param, extra) {
  const knob = clamp01(readKnob(pedal, param));
  const label = knobLabel(pedal, param);
  const text = knobText(pedal, param, knob);
  return '<div class="knob" data-pedal="' + pedal + '" data-param="' + param + '" style="--p:' + knob + '">'
    + '<div class="knob-ring" aria-hidden="true"><div class="knob-dial"><span class="pointer"></span></div></div>'
    + '<div class="knob-label">' + esc(label) + "</div>"
    + '<div class="knob-value">' + esc(text) + "</div>"
    + '<div class="knob-steps">'
    + '<button type="button" data-step="-1" aria-label="Decrease ' + esc(label) + '">−</button>'
    + '<button type="button" data-step="0" aria-label="Reset ' + esc(label) + ' to default">=</button>'
    + '<button type="button" data-step="1" aria-label="Increase ' + esc(label) + '">+</button>'
    + "</div>"
    + (extra || "")
    + "</div>";
}

function renderBoard() {
  const board = document.getElementById("board");
  if (!state.order.length) {
    board.innerHTML = '<p class="empty">Add a pedal to the chain.</p>';
    return;
  }
  const html = [];
  for (let i = 0; i < state.order.length; i++) {
    const id = state.order[i];
    const spec = PEDALS[id];
    const pedal = state.pedals[id];
    const chips = spec.types ? '<div class="chips" role="group" aria-label="' + esc(spec.name) + ' type">' + spec.types.map((t) => {
      const on = t.id === pedal.type;
      return '<button type="button" class="chip' + (on ? " on" : "") + '" data-type="' + t.id + '" aria-pressed="' + on + '">' + esc(t.label) + "</button>";
    }).join("") + "</div>" : "";
    const main = spec.main.map((param) => knobMarkup(id, param, spec.tap && param === "time" ? '<button type="button" class="tap">Tap</button>' : "")).join("");
    const more = spec.more.map((param) => knobMarkup(id, param)).join("");
    html.push(
      '<article class="pedal c-' + id + (pedal.enabled ? " engaged" : "") + '" data-id="' + id + '">'
      + '<i class="screw s1"></i><i class="screw s2"></i><i class="screw s3"></i>'
      + '<header class="pedal-top">'
      + '<span class="drag" aria-hidden="true">⋮⋮</span>'
      + "<h2>" + esc(spec.name) + "</h2>"
      + '<button type="button" class="stomp' + (pedal.enabled ? " on" : "") + '" aria-pressed="' + pedal.enabled + '" aria-label="' + esc(spec.name) + (pedal.enabled ? " on" : " off") + '"><span class="led"></span></button>'
      + "</header>"
      + '<div class="face">' + chips
      + '<div class="knobs knobs-' + spec.main.length + '">' + main + "</div>"
      + '<div class="more-panel"' + (pedal.more ? "" : " hidden") + '><div class="knobs knobs-' + spec.more.length + '">' + more + "</div></div>"
      + "</div>"
      + '<footer class="pedal-foot">'
      + '<button type="button" class="more-btn" aria-expanded="' + pedal.more + '">' + (pedal.more ? "Less" : "More") + "</button>"
      + '<div class="nudges">'
      + '<button type="button" class="nudge" data-dir="-1" aria-label="Move ' + esc(spec.name) + ' earlier"' + (i === 0 ? " disabled" : "") + '><span class="chev"></span></button>'
      + '<button type="button" class="nudge" data-dir="1" aria-label="Move ' + esc(spec.name) + ' later"' + (i === state.order.length - 1 ? " disabled" : "") + '><span class="chev"></span></button>'
      + "</div>"
      + '<button type="button" class="remove">Remove</button>'
      + "</footer></article>"
    );
  }
  board.innerHTML = html.join("");
  nudgeGlyphs();
  paintFromState();
}

function renderAdd() {
  const row = document.getElementById("addRow");
  const missing = PEDAL_IDS.filter((id) => state.order.indexOf(id) === -1);
  if (!missing.length) {
    row.innerHTML = '<span class="add-all">All pedals are on the board.</span>';
    return;
  }
  row.innerHTML = missing.map((id) => '<button type="button" data-add="' + id + '">Add ' + esc(PEDALS[id].name) + "</button>").join("");
}

function renderPresets() {
  document.getElementById("presets").innerHTML = PRESETS.map((p) =>
    '<button type="button" data-preset="' + p.id + '" aria-pressed="false">' + esc(p.name) + "</button>"
  ).join("");
  highlightPreset();
}

function resetKnob(pedal, param, el) {
  writeKnob(pedal, param, defaultKnobPosition(pedal, param));
  const node = el || document.querySelector('.knob[data-pedal="' + pedal + '"][data-param="' + param + '"]');
  if (!node) return;
  node.classList.remove("flash");
  void node.offsetWidth;
  node.classList.add("flash");
  clearTimeout(node._flash);
  node._flash = setTimeout(() => node.classList.remove("flash"), 700);
}

let holdTimer = 0;

function stopHold() {
  clearTimeout(holdTimer);
  holdTimer = 0;
}

function startHold(btn) {
  stopHold();
  const el = btn.closest(".knob");
  if (!el) return;
  const pedal = el.dataset.pedal;
  const param = el.dataset.param;
  const dir = Number(btn.dataset.step);
  if (dir === 0) {
    resetKnob(pedal, param, el);
    return;
  }
  let ticks = 0;
  const fire = () => {
    writeKnob(pedal, param, knobNudge(readKnob(pedal, param), pedal, param, dir, ticks));
    ticks += 1;
  };
  fire();
  const arm = (index) => {
    holdTimer = setTimeout(() => {
      fire();
      arm(index + 1);
    }, knobRepeatDelay(index));
  };
  arm(0);
}

function writeKnob(pedal, param, value) {
  const v = clamp01(value);
  if (pedal === "global") {
    if (param === "input") {
      state.inputGain = v * INPUT_GAIN_MAX;
      if (engine.ctx) engine.setInputGain(state.inputGain);
    } else {
      state.master = v;
      if (engine.ctx) engine.setMaster(state.master);
    }
  } else {
    state.pedals[pedal].params[param] = v;
    state.preset = null;
    highlightPreset();
    if (engine.ctx) engine.setPedal(pedal, state.pedals[pedal], false);
  }
  paintFromState();
  scheduleSave();
}

function commitOrder(next) {
  if (next.join("|") === state.order.join("|")) return;
  state.order = next;
  for (let i = 0; i < PEDAL_IDS.length; i++) {
    state.pedals[PEDAL_IDS[i]].onBoard = next.indexOf(PEDAL_IDS[i]) !== -1;
  }
  state.preset = null;
  highlightPreset();
  const board = document.getElementById("board");
  const have = [];
  const cards = board.querySelectorAll(".pedal");
  for (let i = 0; i < cards.length; i++) have.push(cards[i].dataset.id);
  const same = have.length === next.length && next.every((id) => have.indexOf(id) !== -1);
  if (same) {
    for (let i = 0; i < next.length; i++) {
      const el = board.querySelector('.pedal[data-id="' + next[i] + '"]');
      if (el) board.appendChild(el);
    }
    const ordered = board.querySelectorAll(".pedal");
    for (let i = 0; i < ordered.length; i++) {
      const prev = ordered[i].querySelector('[data-dir="-1"]');
      const nxt = ordered[i].querySelector('[data-dir="1"]');
      if (prev) prev.disabled = i === 0;
      if (nxt) nxt.disabled = i === ordered.length - 1;
    }
  } else {
    renderBoard();
  }
  chainLabel();
  if (engine.ctx) engine.setOrder(next);
  scheduleSave();
}

let playDownAt = 0;
let noteHeld = false;
let pressId = 0;

async function playDown() {
  const id = ++pressId;
  noteHeld = true;
  nowPlaying = "notes";
  noteOpen = true;
  playDownAt = performance.now();
  engine.ensureContext();
  try {
    await engine.prepare(state);
    if (id !== pressId) return;
    if (state.player.sound === "tone" && !noteHeld) engine.playOnce(playerSpec());
    else engine.playDown(playerSpec());
    setStatus("");
  } catch (err) {
    setStatus("Audio didn't start. Tap Play note again.");
  }
}

function playUp() {
  noteHeld = false;
  if (!engine.tone || state.player.sound !== "tone") return;
  engine.playUp(playerSpec(), performance.now() - playDownAt);
}

async function playLibrary(id) {
  if (engine.recording) {
    setStatus("Stop recording first.");
    return;
  }
  if (id === "notes") {
    noteOpen = true;
    nowPlaying = "notes";
    if (engine.ctx) engine.stopPlayback();
    paintLibrary();
    playDown();
    return;
  }
  noteOpen = false;
  engine.ensureContext();
  try {
    await engine.prepare(state);
    engine.playBuffer(engine.libraryBuffer(id), { loop: looping(id), id });
    nowPlaying = id;
    setStatus("");
  } catch (err) {
    setStatus("Audio didn't start. Tap Play again.");
  }
  paintLibrary();
}

function stopLibrary(id) {
  if (id === "notes") {
    nowPlaying = "";
    engine.stopRepeat();
    engine.stopTest();
    engine.releaseTone(0.05);
    engine.stopVoices();
  } else if (engine.playingId === id) {
    engine.stopPlayback();
    nowPlaying = "";
  }
  paintLibrary();
}

function toggleLoop(id) {
  if (id === "notes") {
    state.player.repeat = !state.player.repeat;
    if (!state.player.repeat) engine.stopRepeat();
    scheduleSave();
    paintPlayer();
    return;
  }
  if (!state.looping) state.looping = {};
  state.looping[id] = !looping(id);
  scheduleSave();
  if (nowPlaying === id && engine.ctx) {
    engine.playBuffer(engine.libraryBuffer(id), { loop: looping(id), id });
  }
  paintLibrary();
}

async function startRecord() {
  if (engine.recording) return;
  nowPlaying = "";
  if (engine.ctx) engine.stopPlayback();
  engine.ensureContext();
  setStatus("");
  try {
    await engine.beginRecord();
  } catch (err) {
    setStatus("The browser didn't allow the microphone. You can still play loops.");
  }
  paintLibrary();
}

async function playCurrentTake() {
  if (!currentTake || engine.recording) return;
  const seconds = currentTake.samples.length / currentTake.sampleRate;
  if (seconds < 0.05) return;
  engine.ensureContext();
  try {
    await engine.prepare(state);
    const start = currentTake.trimStart || 0;
    const end = currentTake.trimEnd > 0 ? currentTake.trimEnd : seconds;
    const buffer = engine.bufferFromSamples(currentTake.samples, currentTake.sampleRate);
    engine.playBuffer(buffer, {
      loop: currentTake.loop !== false,
      offset: start,
      duration: Math.max(0.05, end - start),
      id: "take",
    });
    nowPlaying = "take";
    noteOpen = false;
    setStatus("");
  } catch (err) {
    setStatus("Audio didn't start. Tap Play again.");
  }
  paintLibrary();
}

function readTrim() {
  if (!currentTake) return;
  const seconds = currentTake.samples.length / currentTake.sampleRate;
  let start = Number(document.getElementById("trimStart").value) / 1000 * seconds;
  let end = Number(document.getElementById("trimEnd").value) / 1000 * seconds;
  if (end < start + 0.05) end = Math.min(seconds, start + 0.05);
  currentTake.trimStart = start;
  currentTake.trimEnd = end;
  document.getElementById("trimStartLabel").textContent = clock(start);
  document.getElementById("trimEndLabel").textContent = clock(end);
}

function openTakes() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open("effects-lab-takes", 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("takes")) db.createObjectStore("takes");
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function persistTake() {
  if (!currentTake || !currentTake.samples) return;
  try {
    const db = await openTakes();
    await new Promise((resolve, reject) => {
      const tx = db.transaction("takes", "readwrite");
      tx.objectStore("takes").put({
        sampleRate: currentTake.sampleRate,
        samples: currentTake.samples,
        trimStart: currentTake.trimStart || 0,
        trimEnd: currentTake.trimEnd || 0,
        loop: currentTake.loop !== false,
      }, "last");
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch (err) { /* private mode */ }
}

async function loadTake() {
  try {
    const db = await openTakes();
    const row = await new Promise((resolve, reject) => {
      const tx = db.transaction("takes", "readonly");
      const req = tx.objectStore("takes").get("last");
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    if (!row || !row.samples || row.samples.length < 8) return;
    currentTake = row;
    paintRecord();
  } catch (err) { /* first visit */ }
}

function choosePreset(id) {
  state = applyPreset(state, id);
  if (engine.ctx) engine.sync(state, true);
  renderBoard();
  renderAdd();
  chainLabel();
  highlightPreset();
  paintFromState();
  saveNow();
}

function addPedal(id) {
  if (state.order.indexOf(id) !== -1) return;
  state.order = state.order.concat(id);
  state.pedals[id].onBoard = true;
  state.pedals[id].enabled = true;
  state.preset = null;
  if (engine.ctx) {
    engine.setPedal(id, state.pedals[id], false);
    engine.setOrder(state.order);
  }
  renderBoard();
  renderAdd();
  chainLabel();
  highlightPreset();
  scheduleSave();
}

function removePedal(id) {
  state.order = state.order.filter((x) => x !== id);
  state.pedals[id].onBoard = false;
  state.pedals[id].enabled = false;
  state.preset = null;
  if (engine.ctx) {
    engine.setPedal(id, state.pedals[id], false);
    engine.setOrder(state.order);
  }
  renderBoard();
  renderAdd();
  chainLabel();
  highlightPreset();
  scheduleSave();
}

function setType(id, type) {
  if (!validType(id, type) || state.pedals[id].type === type) return;
  state.pedals[id].type = type;
  state.preset = null;
  if (engine.ctx) engine.setPedal(id, state.pedals[id], true);
  renderBoard();
  chainLabel();
  highlightPreset();
  scheduleSave();
}

function doTap() {
  const now = performance.now();
  if (!taps.length || now - taps[taps.length - 1] > 2000) taps = [];
  taps.push(now);
  if (taps.length > 4) taps.shift();
  if (taps.length < 2) return;
  let sum = 0;
  for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
  writeKnob("delay", "time", knobFromDelaySeconds(sum / (taps.length - 1) / 1000));
}

function dropIndex(id, x, y) {
  const board = document.getElementById("board");
  const cards = [...board.querySelectorAll(".pedal")].filter((el) => el.dataset.id !== id);
  const horizontal = getComputedStyle(board).flexDirection === "row";
  const pos = horizontal ? x : y;
  for (let i = 0; i < cards.length; i++) {
    const r = cards[i].getBoundingClientRect();
    const mid = horizontal ? r.left + r.width / 2 : r.top + r.height / 2;
    if (pos < mid) return i;
  }
  return cards.length;
}

function init() {
  document.title = APP_CONFIG.name;
  const title = document.getElementById("appTitle");
  title.textContent = APP_CONFIG.name;
  const apple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (apple) apple.setAttribute("content", APP_CONFIG.name);

  document.getElementById("inputSlot").innerHTML = knobMarkup("global", "input");
  document.getElementById("masterSlot").innerHTML = knobMarkup("global", "master");
  renderPresets();
  renderBoard();
  renderAdd();
  chainLabel();
  renderLibrary();
  paintFromState();
  loadTake();

  engine.onMeter = paintMeter;
  engine.onPlayEnd = () => {
    if (nowPlaying !== "notes") nowPlaying = "";
    paintLibrary();
  };
  engine.onRecordState = () => paintLibrary();
  engine.onTake = (take) => {
    currentTake = take;
    nowPlaying = "";
    paintLibrary();
    persistTake();
    if (take.heard && take.samples.length > take.sampleRate * 0.05) playCurrentTake();
    else setStatus("That take was quiet. Trim it, or record again.");
  };
  engine.onRunaway = (on) => {
    document.getElementById("runaway").hidden = !on;
    if (on) setStatus("");
  };
  document.getElementById("unmute").addEventListener("click", () => engine.unmute());

  const playNote = document.getElementById("playNote");
  playNote.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    e.preventDefault();
    playNote.classList.add("is-down");
    try { playNote.setPointerCapture(e.pointerId); } catch (err) { /* keyboard */ }
    playDown();
  });
  playNote.addEventListener("pointerup", () => {
    playNote.classList.remove("is-down");
    playUp();
  });
  playNote.addEventListener("pointercancel", () => {
    playNote.classList.remove("is-down");
    playUp();
  });
  playNote.addEventListener("keydown", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    if (e.repeat) return;
    e.preventDefault();
    playNote.classList.add("is-down");
    playDown();
  });
  playNote.addEventListener("keyup", (e) => {
    if (e.key !== "Enter" && e.key !== " ") return;
    playNote.classList.remove("is-down");
    playUp();
  });

  document.getElementById("notes").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-note]");
    if (!btn) return;
    state.player.note = btn.dataset.note;
    paintPlayer();
    scheduleSave();
  });
  document.getElementById("octaveDown").addEventListener("click", () => {
    state.player.octave = Math.max(2, state.player.octave - 1);
    paintPlayer();
    scheduleSave();
  });
  document.getElementById("octaveUp").addEventListener("click", () => {
    state.player.octave = Math.min(5, state.player.octave + 1);
    paintPlayer();
    scheduleSave();
  });
  document.getElementById("sounds").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-sound]");
    if (!btn) return;
    state.player.sound = btn.dataset.sound;
    engine.stopRepeat();
    engine.stopTest();
    paintPlayer();
    scheduleSave();
  });
  document.getElementById("repeat").addEventListener("click", () => {
    state.player.repeat = !state.player.repeat;
    if (!state.player.repeat) engine.stopRepeat();
    paintPlayer();
    scheduleSave();
  });
  document.getElementById("loopList").addEventListener("click", (e) => {
    const card = e.target.closest("[data-loop]");
    const btn = e.target.closest("[data-act]");
    if (!card || !btn) return;
    const id = card.dataset.loop;
    if (btn.dataset.act === "play") playLibrary(id);
    else if (btn.dataset.act === "stop") stopLibrary(id);
    else toggleLoop(id);
  });
  document.getElementById("recordBtn").addEventListener("click", startRecord);
  document.getElementById("stopRecord").addEventListener("click", () => engine.stopRecord());
  document.getElementById("reRecord").addEventListener("click", startRecord);
  document.getElementById("playTake").addEventListener("click", playCurrentTake);
  document.getElementById("stopTake").addEventListener("click", () => {
    engine.stopPlayback();
    nowPlaying = "";
    paintLibrary();
  });
  document.getElementById("takeLoop").addEventListener("click", () => {
    if (!currentTake) return;
    currentTake.loop = !(currentTake.loop !== false);
    persistTake();
    if (nowPlaying === "take") playCurrentTake();
    else paintRecord();
  });
  document.getElementById("trimStart").addEventListener("input", readTrim);
  document.getElementById("trimEnd").addEventListener("input", readTrim);
  const applyTrim = () => {
    readTrim();
    persistTake();
    if (nowPlaying === "take") playCurrentTake();
  };
  document.getElementById("trimStart").addEventListener("change", applyTrim);
  document.getElementById("trimEnd").addEventListener("change", applyTrim);
  document.getElementById("presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (btn) choosePreset(btn.dataset.preset);
  });
  document.getElementById("addRow").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-add]");
    if (btn) addPedal(btn.dataset.add);
  });

  const board = document.getElementById("board");
  board.addEventListener("click", (e) => {
    const card = e.target.closest(".pedal");
    if (!card) return;
    const id = card.dataset.id;
    if (e.target.closest(".stomp")) {
      const pedal = state.pedals[id];
      pedal.enabled = !pedal.enabled;
      state.preset = null;
      card.classList.toggle("engaged", pedal.enabled);
      const stomp = card.querySelector(".stomp");
      stomp.classList.toggle("on", pedal.enabled);
      stomp.setAttribute("aria-pressed", String(pedal.enabled));
      stomp.setAttribute("aria-label", PEDALS[id].name + (pedal.enabled ? " on" : " off"));
      highlightPreset();
      if (engine.ctx) engine.setPedal(id, pedal, false);
      scheduleSave();
      return;
    }
    const chip = e.target.closest(".chip");
    if (chip) { setType(id, chip.dataset.type); return; }
    if (e.target.closest(".more-btn")) {
      state.pedals[id].more = !state.pedals[id].more;
      renderBoard();
      scheduleSave();
      return;
    }
    const nudge = e.target.closest(".nudge");
    if (nudge && !nudge.disabled) {
      const index = state.order.indexOf(id);
      commitOrder(moveItem(state.order, index, Number(nudge.dataset.dir)));
      return;
    }
    if (e.target.closest(".remove")) removePedal(id);
    if (e.target.closest(".tap")) doTap();
  });

  board.addEventListener("pointerdown", (e) => {
    if (e.button != null && e.button !== 0) return;
    const top = e.target.closest(".pedal-top");
    if (!top || e.target.closest("button")) return;
    const card = top.closest(".pedal");
    drag = { id: card.dataset.id, pointer: e.pointerId };
    top.setPointerCapture(e.pointerId);
  });
  board.addEventListener("pointermove", (e) => {
    if (!drag || e.pointerId !== drag.pointer) return;
    const target = dropIndex(drag.id, e.clientX, e.clientY);
    const next = reorder(state.order, drag.id, target);
    if (next.join("|") !== state.order.join("|")) commitOrder(next);
  });
  board.addEventListener("pointerup", (e) => {
    if (drag && e.pointerId === drag.pointer) drag = null;
  });
  board.addEventListener("pointercancel", () => { drag = null; });

  document.addEventListener("pointerdown", (e) => {
    const btn = e.target.closest && e.target.closest(".knob-steps button");
    if (!btn || (e.button != null && e.button !== 0)) return;
    e.preventDefault();
    try { btn.setPointerCapture(e.pointerId); } catch (err) { /* already */ }
    startHold(btn);
  });
  document.addEventListener("pointerup", stopHold);
  document.addEventListener("pointercancel", stopHold);
  document.addEventListener("contextmenu", (e) => {
    if (e.target.closest && e.target.closest(".knob-steps")) e.preventDefault();
  });

  window.matchMedia("(min-width: 900px)").addEventListener("change", nudgeGlyphs);
  window.addEventListener("pagehide", saveNow);

  window.__lab = {
    get state() { return state; },
    get meter() { return engine.meter; },
    get peakMeter() { return engine.peakMeter; },
    get running() { return engine.running; },
    get contextState() { return engine.ctx ? engine.ctx.state : "none"; },
    get constraints() { return engine.constraints; },
    get attempts() { return engine.attempts; },
    get reverbMode() { return engine.reverbMode; },
    get outputConnected() { return !!engine.outputConnected; },
    get recording() { return !!engine.recording; },
    get recordedSamples() { return engine.recorder ? engine.recorder.samples : 0; },
    get micLive() { return !!(engine.micStream && engine.micStream.getTracks().some((track) => track.readyState === "live")); },
    loops: LOOPS,
    preview(id, loopId) {
      const base = initialState();
      const next = id ? applyPreset(base, id) : base;
      return renderPreview(next, loopId || "chords");
    },
    defaultKnob(pedal, param) { return defaultKnobPosition(pedal, param); },
    APP_CONFIG,
  };
}

if (typeof document !== "undefined") init();
