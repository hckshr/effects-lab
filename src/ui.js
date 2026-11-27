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
    el.setAttribute("aria-valuenow", String(Math.round(clamp01(knob) * 100)));
    el.setAttribute("aria-valuetext", text);
    el.setAttribute("aria-label", label);
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

function paintPlayer() {
  const player = state.player;
  const guitar = state.source === "guitar";
  document.getElementById("player").hidden = guitar;
  document.getElementById("guitarBox").hidden = !guitar;
  document.getElementById("useGuitarNow").hidden = !!engine.micStream;
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
  return '<div class="knob" data-pedal="' + pedal + '" data-param="' + param + '" role="slider" tabindex="0" aria-valuemin="0" aria-valuemax="100" aria-valuenow="' + Math.round(knob * 100) + '" aria-valuetext="' + esc(text) + '" aria-label="' + esc(label) + '" style="--p:' + knob + '">'
    + '<div class="knob-ring"><div class="knob-dial"><span class="pointer"></span></div></div>'
    + '<div class="knob-value">' + esc(text) + "</div>"
    + '<div class="knob-label">' + esc(label) + "</div>"
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

let lastKnobTap = { key: "", t: 0 };

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

function fillDevices(list) {
  const sel = document.getElementById("device");
  const current = state.deviceId;
  sel.replaceChildren();
  const def = document.createElement("option");
  def.value = "";
  def.textContent = "Default microphone";
  sel.appendChild(def);
  const devices = list || [];
  for (let i = 0; i < devices.length; i++) {
    const o = document.createElement("option");
    o.value = devices[i].deviceId;
    o.textContent = devices[i].label || "Microphone";
    sel.appendChild(o);
  }
  const known = [...sel.options].some((o) => o.value === current);
  sel.value = known ? current : "";
}

let playDownAt = 0;
let noteHeld = false;
let pressId = 0;

async function playDown() {
  const id = ++pressId;
  noteHeld = true;
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

async function useGuitar() {
  engine.ensureContext();
  try {
    await engine.prepare(state);
    await engine.useGuitar(state.deviceId);
    state.source = "guitar";
    saveNow();
    paintPlayer();
    setStatus("Guitar is on.");
  } catch (err) {
    state.source = "test";
    if (engine.ctx) engine.leaveGuitar();
    paintPlayer();
    setStatus("The browser didn't allow the microphone. You can still play notes.");
  }
}

function showNotes() {
  state.source = "test";
  if (engine.ctx) engine.leaveGuitar();
  paintPlayer();
  saveNow();
  setStatus("");
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
  renderPlayer();
  paintFromState();
  fillDevices([]);

  engine.onMeter = paintMeter;
  engine.onRunaway = (on) => {
    document.getElementById("runaway").hidden = !on;
    if (on) setStatus("");
  };
  document.getElementById("unmute").addEventListener("click", () => engine.unmute());
  engine.onDevices = (list) => {
    fillDevices(list);
    paintPlayer();
  };

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
  document.getElementById("useGuitar").addEventListener("click", useGuitar);
  document.getElementById("useGuitarNow").addEventListener("click", useGuitar);
  document.getElementById("playNotes").addEventListener("click", showNotes);
  document.getElementById("presets").addEventListener("click", (e) => {
    const btn = e.target.closest("[data-preset]");
    if (btn) choosePreset(btn.dataset.preset);
  });
  document.getElementById("device").addEventListener("change", async (e) => {
    state.deviceId = e.target.value;
    scheduleSave();
    if (state.source === "guitar" && engine.micStream) {
      engine.ensureContext();
      try {
        await engine.prepare(state);
        await engine.openMic(state.deviceId);
        setStatus("Guitar is on.");
      } catch (err) {
        setStatus("Couldn't open that input.");
      }
    }
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
    if (e.target.closest && e.target.closest(".tap")) return;
    const el = e.target.closest && e.target.closest(".knob");
    if (!el) return;
    e.preventDefault();
    const pedal = el.dataset.pedal;
    const param = el.dataset.param;
    const key = pedal + ":" + param;
    const now = performance.now();
    if (lastKnobTap.key === key && isDoubleTap(lastKnobTap.t, now)) {
      lastKnobTap = { key: "", t: 0 };
      resetKnob(pedal, param, el);
      return;
    }
    const start = readKnob(pedal, param);
    const x0 = e.clientX;
    const y0 = e.clientY;
    let moved = false;
    const move = (ev) => {
      const dy = y0 - ev.clientY;
      const dx = ev.clientX - x0;
      if (Math.hypot(dx, dy) > 8) moved = true;
      const delta = Math.abs(dx) > Math.abs(dy) ? dx : dy;
      const scale = ev.shiftKey ? 1 / 420 : 1 / 150;
      writeKnob(pedal, param, start + delta * scale);
    };
    const up = (ev) => {
      const dist = Math.hypot((ev.clientX || x0) - x0, (ev.clientY || y0) - y0);
      if (!moved && dist < 8) lastKnobTap = { key, t: performance.now() };
      else lastKnobTap = { key: "", t: 0 };
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
  });
  document.addEventListener("dblclick", (e) => {
    const el = e.target.closest && e.target.closest(".knob");
    if (!el) return;
    e.preventDefault();
    resetKnob(el.dataset.pedal, el.dataset.param, el);
  });

  document.addEventListener("wheel", (e) => {
    const el = e.target.closest && e.target.closest(".knob");
    if (!el || (e.target.closest && e.target.closest(".tap"))) return;
    e.preventDefault();
    const dir = e.deltaY < 0 ? 1 : -1;
    writeKnob(el.dataset.pedal, el.dataset.param, readKnob(el.dataset.pedal, el.dataset.param) + dir * 0.03);
  }, { passive: false });

  document.addEventListener("keydown", (e) => {
    const el = e.target.closest && e.target.closest(".knob");
    if (!el) return;
    let delta = 0;
    if (e.key === "ArrowUp" || e.key === "ArrowRight") delta = e.shiftKey ? 0.01 : 0.02;
    else if (e.key === "ArrowDown" || e.key === "ArrowLeft") delta = e.shiftKey ? -0.01 : -0.02;
    else if (e.key === "PageUp") delta = 0.1;
    else if (e.key === "PageDown") delta = -0.1;
    else if (e.key === "Home") delta = -1;
    else if (e.key === "End") delta = 1;
    else return;
    e.preventDefault();
    const cur = readKnob(el.dataset.pedal, el.dataset.param);
    writeKnob(el.dataset.pedal, el.dataset.param, delta === 1 ? 1 : delta === -1 ? 0 : cur + delta);
  });

  window.matchMedia("(min-width: 900px)").addEventListener("change", nudgeGlyphs);
  window.addEventListener("pagehide", saveNow);
  if (navigator.mediaDevices && navigator.mediaDevices.addEventListener) {
    navigator.mediaDevices.addEventListener("devicechange", () => {
      if (!navigator.mediaDevices.enumerateDevices) return;
      navigator.mediaDevices.enumerateDevices().then((all) => {
        fillDevices(all.filter((d) => d.kind === "audioinput"));
      }).catch(() => {});
    });
  }

  window.__lab = {
    get state() { return state; },
    get meter() { return engine.meter; },
    get peakMeter() { return engine.peakMeter; },
    get running() { return engine.running; },
    get contextState() { return engine.ctx ? engine.ctx.state : "none"; },
    get constraints() { return engine.constraints; },
    get attempts() { return engine.attempts; },
    get reverbMode() { return engine.reverbMode; },
    preview(id, taps) {
      const base = initialState();
      const next = id ? applyPreset(base, id) : base;
      next.player = defaultPlayer();
      return renderPreview(next, taps);
    },
    defaultKnob(pedal, param) { return defaultKnobPosition(pedal, param); },
    APP_CONFIG,
  };
}

if (typeof document !== "undefined") init();
