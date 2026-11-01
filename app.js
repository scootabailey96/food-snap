(() => {
  "use strict";
  const C = window.FOODSNAP_CONFIG;
  const $ = (id) => document.getElementById(id);
  const screens = { lock: $("s-lock"), cam: $("s-cam"), review: $("s-review"), done: $("s-done") };
  const show = (n) => Object.entries(screens).forEach(([k, el]) => el.classList.toggle("active", k === n));

  /* ---------------- passcode (kept only in this phone's localStorage) ---------------- */
  const PASS_KEY = "foodsnap.passcode";
  const getPass = () => { try { return localStorage.getItem(PASS_KEY) || ""; } catch (_) { return ""; } };
  let lockReturn = null; // screen to go back to when changing passcode
  function showLock(changing) {
    stopCamera();
    lockReturn = changing ? Object.keys(screens).find((k) => screens[k].classList.contains("active")) : null;
    $("lockTitle").textContent = changing ? "Change passcode" : "Set a passcode";
    $("lockInput").value = ""; $("lockCancel").hidden = !changing;
    show("lock"); setTimeout(() => $("lockInput").focus(), 50);
  }
  $("lockForm").addEventListener("submit", (e) => {
    e.preventDefault();
    const v = $("lockInput").value.trim(); if (!v) return;
    try { localStorage.setItem(PASS_KEY, v); } catch (_) { $("lockHint").textContent = "Could not save passcode (storage blocked)."; return; }
    $("lockInput").value = "";
    if (lockReturn && lockReturn !== "cam" && lockReturn !== "lock") show(lockReturn); else { show("cam"); startCamera(); }
    flushQueue();
  });
  $("lockCancel").addEventListener("click", () => { if (lockReturn && lockReturn !== "cam") show(lockReturn); else { show("cam"); startCamera(); } });
  ["changePass", "changePassCam"].forEach((id) => $(id).addEventListener("click", (e) => { e.preventDefault(); showLock(true); }));

  let stream = null, facing = "environment", current = null; // current = {photo:Blob, audio:Blob|null}
  let sending = false;

  /* ---------------- camera ---------------- */
  async function startCamera() {
    stopCamera();
    const msg = $("camMsg"), txt = $("camMsgText");
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      msg.hidden = false; txt.textContent = "Live preview not available. Use the System camera button."; return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: { ideal: facing }, width: { ideal: 2560 }, height: { ideal: 1920 } }, audio: false
      });
      const v = $("preview"); v.srcObject = stream; await v.play().catch(() => {});
      msg.hidden = true; $("enableCam").hidden = true;
    } catch (e) {
      msg.hidden = false;
      txt.textContent = "Camera preview blocked (" + (e.name || "error") + "). Tap System camera below, or allow camera access for this site.";
      $("enableCam").hidden = false;
      // Chrome only opens the native camera from a user tap, so this usually
      // does nothing on a cold start, but costs nothing to try.
      try { $("sysCam").click(); } catch (_) {}
    }
  }
  function stopCamera() { if (stream) { stream.getTracks().forEach((t) => t.stop()); stream = null; } }

  async function toJpeg(source, w, h) {
    const scale = Math.min(1, C.maxEdge / Math.max(w, h));
    const cw = Math.round(w * scale), ch = Math.round(h * scale);
    const cv = document.createElement("canvas"); cv.width = cw; cv.height = ch;
    cv.getContext("2d").drawImage(source, 0, 0, cw, ch);
    return await new Promise((res, rej) => cv.toBlob((b) => (b ? res(b) : rej(new Error("encode failed"))), "image/jpeg", C.jpegQuality));
  }
  async function takeFrame() {
    const v = $("preview");
    if (!stream || !v.videoWidth) return;
    const blob = await toJpeg(v, v.videoWidth, v.videoHeight);
    gotPhoto(blob);
  }
  async function fromFile(file) {
    if (!file) return;
    let bmp;
    try { bmp = await createImageBitmap(file, { imageOrientation: "from-image" }); }
    catch (_) { bmp = await createImageBitmap(file); }
    const blob = await toJpeg(bmp, bmp.width, bmp.height);
    if (bmp.close) bmp.close();
    gotPhoto(blob);
  }
  function gotPhoto(blob) {
    clearAudio();
    current = { photo: blob, audio: null, takenAt: new Date() };
    $("note").value = ""; setStatus("");
    if ($("shot").src) URL.revokeObjectURL($("shot").src);
    $("shot").src = URL.createObjectURL(blob);
    stopCamera(); show("review");
  }

  /* ---------------- voice note ---------------- */
  let rec = null, recChunks = [], recTimer = null, recStart = 0, micStream = null, audioUrl = null;
  function pickMime() {
    const c = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4", "audio/ogg;codecs=opus"];
    return c.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported(m)) || "";
  }
  async function toggleRec() {
    if (rec && rec.state === "recording") { rec.stop(); return; }
    if (!window.MediaRecorder) { setStatus("Voice notes not supported in this browser", "err"); return; }
    try { micStream = await navigator.mediaDevices.getUserMedia({ audio: true }); }
    catch (e) { setStatus("Microphone blocked: allow mic access for this site", "err"); return; }
    const mime = pickMime();
    rec = new MediaRecorder(micStream, mime ? { mimeType: mime, audioBitsPerSecond: 32000 } : undefined);
    recChunks = [];
    rec.ondataavailable = (e) => e.data.size && recChunks.push(e.data);
    rec.onstop = () => {
      clearInterval(recTimer);
      micStream.getTracks().forEach((t) => t.stop());
      const blob = new Blob(recChunks, { type: rec.mimeType || mime || "audio/webm" });
      $("rec").classList.remove("recording"); $("rec").textContent = "🎙️ Re-record"; $("recTime").hidden = true;
      if (blob.size > 0 && current) {
        current.audio = blob;
        if (audioUrl) URL.revokeObjectURL(audioUrl);
        audioUrl = URL.createObjectURL(blob);
        const a = $("audioPlayback"); a.src = audioUrl; a.hidden = false; $("recClear").hidden = false;
      }
    };
    rec.start();
    recStart = Date.now();
    $("rec").classList.add("recording"); $("rec").textContent = "⏹ Stop"; $("recTime").hidden = false;
    recTimer = setInterval(() => {
      const s = Math.floor((Date.now() - recStart) / 1000);
      $("recTime").textContent = Math.floor(s / 60) + ":" + String(s % 60).padStart(2, "0");
      if (s >= C.maxAudioSeconds) rec.stop();
    }, 250);
  }
  function clearAudio() {
    if (rec && rec.state === "recording") { rec.onstop = null; rec.stop(); clearInterval(recTimer); if (micStream) micStream.getTracks().forEach((t) => t.stop()); }
    if (current) current.audio = null;
    if (audioUrl) { URL.revokeObjectURL(audioUrl); audioUrl = null; }
    const a = $("audioPlayback"); a.removeAttribute("src"); a.hidden = true;
    $("recClear").hidden = true; $("rec").classList.remove("recording"); $("rec").textContent = "🎙️ Voice note"; $("recTime").hidden = true;
  }

  /* ---------------- sending + offline queue ---------------- */
  const pad = (n) => String(n).padStart(2, "0");
  const fmt = (d, tz) => new Intl.DateTimeFormat("en-AU", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", hour12: false, timeZoneName: "short" }).format(d);
  function buildItem(c, note) {
    const d = c.takenAt, deviceTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
    return {
      id: Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      stamp, note,
      iso: d.toISOString(), deviceTz,
      deviceLocal: fmt(d, deviceTz), home: fmt(d, C.homeTimeZone),
      photo: c.photo, audio: c.audio,
      audioExt: c.audio ? (c.audio.type.includes("mp4") ? "m4a" : c.audio.type.includes("ogg") ? "ogg" : "webm") : null
    };
  }
  function toFormData(it) {
    const f = new FormData();
    f.append("_subject", `${C.subjectPrefix} ${it.deviceLocal} (${it.deviceTz})`);
    f.append("_captcha", "false");
    f.append("passcode", getPass()); // read at send time, so queued retries use the current passcode
    f.append("_template", "table");
    f.append("timestamp_utc", it.iso);
    f.append("device_local_time", it.deviceLocal + " [" + it.deviceTz + "]");
    f.append("home_time_" + C.homeTimeZone.split("/").pop(), it.home);
    f.append("note", it.note || "(no note)");
    f.append("has_voice_note", it.audio ? "yes" : "no");
    f.append("photo", new File([it.photo], `food-${it.stamp}.jpg`, { type: "image/jpeg" }));
    if (it.audio) f.append("voice", new File([it.audio], `voice-${it.stamp}.${it.audioExt}`, { type: it.audio.type }));
    return f;
  }
  async function post(it) {
    if (!getPass()) throw new Error("no passcode set");
    const ctl = new AbortController(), t = setTimeout(() => ctl.abort(), 90000);
    try {
      const r = await fetch(C.endpoint, { method: "POST", body: toFormData(it), signal: ctl.signal });
      const html = await r.text();
      if (r.ok && /submitted successfully/i.test(html)) return;
      if (/needs activation/i.test(html)) throw new Error("form not activated for this site yet");
      throw new Error("HTTP " + r.status);
    } finally { clearTimeout(t); }
  }
  // IndexedDB queue
  const db = () => new Promise((res, rej) => { const o = indexedDB.open("foodsnap", 1); o.onupgradeneeded = () => o.result.createObjectStore("q", { keyPath: "id" }); o.onsuccess = () => res(o.result); o.onerror = () => rej(o.error); });
  const tx = async (mode, fn) => { const d = await db(); return new Promise((res, rej) => { const t = d.transaction("q", mode); const r = fn(t.objectStore("q")); t.oncomplete = () => res(r && r.result); t.onerror = () => rej(t.error); }); };
  const qPut = (it) => tx("readwrite", (s) => s.put(it));
  const qDel = (id) => tx("readwrite", (s) => s.delete(id));
  const qAll = () => tx("readonly", (s) => s.getAll());
  async function refreshQueueNote() {
    try { const n = (await qAll()).length; const el = $("queueNote"); el.hidden = !n; el.textContent = n ? `${n} photo${n > 1 ? "s" : ""} waiting to send (no signal?) — will retry automatically` : ""; } catch (_) {}
  }
  let flushing = false;
  async function flushQueue() {
    if (flushing || !navigator.onLine || !getPass()) return; flushing = true;
    try { for (const it of await qAll()) { try { await post(it); await qDel(it.id); } catch (_) { break; } } }
    finally { flushing = false; refreshQueueNote(); }
  }

  async function confirm() {
    if (sending || !current) return;
    sending = true; $("confirm").disabled = true; $("retake").disabled = true; setStatus("Sending…");
    const it = buildItem(current, $("note").value.trim());
    try {
      await post(it);
      finish("✅", "Sent!");
    } catch (e) {
      try { await qPut(it); finish("📥", "No connection / send failed — saved on phone, will retry automatically.\n(" + e.message + ")"); }
      catch (_) { setStatus("Send failed: " + e.message + ". Try again.", "err"); }
    } finally { sending = false; $("confirm").disabled = false; $("retake").disabled = false; refreshQueueNote(); }
  }
  function finish(icon, text) { $("doneIcon").textContent = icon; $("doneText").textContent = text; $("doneText").style.whiteSpace = "pre-line"; current = null; clearAudio(); show("done"); }
  function setStatus(t, cls) { const s = $("status"); s.textContent = t; s.className = "status " + (cls || ""); }

  function newShot() { if (!getPass()) { showLock(false); return; } show("cam"); startCamera(); }

  /* ---------------- wire up ---------------- */
  $("shutter").addEventListener("click", takeFrame);
  $("enableCam").addEventListener("click", startCamera);
  $("flip").addEventListener("click", () => { facing = facing === "environment" ? "user" : "environment"; startCamera(); });
  $("sysCam").addEventListener("change", (e) => { fromFile(e.target.files[0]); e.target.value = ""; });
  $("rec").addEventListener("click", toggleRec);
  $("recClear").addEventListener("click", clearAudio);
  $("confirm").addEventListener("click", confirm);
  $("retake").addEventListener("click", newShot);
  $("again").addEventListener("click", newShot);
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) { if (screens.cam.classList.contains("active")) stopCamera(); }
    else if (screens.cam.classList.contains("active")) startCamera();
  });
  window.addEventListener("online", flushQueue);

  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  if (getPass()) { show("cam"); startCamera(); flushQueue(); } else showLock(false);
  refreshQueueNote();
})();
