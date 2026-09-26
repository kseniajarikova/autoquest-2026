(() => {
  const cfg = () => window.QUEST_CONFIG;
  const quests = () => window.QUESTS;
  const photos = () => window.PHOTO_QUEST || [];

  /** v6: слайд фотоквеста + адрес на Норд + марка на старте */
  const STORE_ROOT = "autoquest2026_v6";
  const STORE_LEGACY = "autoquest2026_v5_unused";

  const $ = (sel) => document.querySelector(sel);

  function normalize(s) {
    return String(s || "")
      .trim()
      .toLowerCase()
      .replace(/ё/g, "е")
      .replace(/\s+/g, " ");
  }

  /** Смягчённое сравнение адресов: без знаков препинания и кавычек */
  function normalizeLoose(s) {
    return normalize(s)
      .replace(/[«»"'„“]/g, "")
      .replace(/[.,;:!?()/\\-]/g, " ")
      .replace(/\bд\b/g, " ")
      .replace(/\bдом\b/g, " ")
      .replace(/\s+/g, " ")
      .trim();
  }

  function teamKey(name) {
    return normalize(name);
  }

  function formatDuration(totalSec) {
    const s = Math.max(0, Math.floor(totalSec));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) {
      return `${h}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
    }
    return `${m}:${String(sec).padStart(2, "0")}`;
  }

  function emptyStore() {
    return { activeKey: null, sessions: {} };
  }

  function readStore() {
    try {
      const raw = localStorage.getItem(STORE_ROOT);
      if (raw) {
        const data = JSON.parse(raw);
        if (data && typeof data === "object" && data.sessions) return data;
      }
    } catch {
      /* ignore */
    }
    // миграция со старого одиночного ключа
    try {
      const legacy = localStorage.getItem(STORE_LEGACY);
      if (legacy) {
        const s = JSON.parse(legacy);
        if (s && s.teamName) {
          const store = emptyStore();
          const key = teamKey(s.teamName);
          store.sessions[key] = s;
          store.activeKey = key;
          writeStore(store);
          localStorage.removeItem(STORE_LEGACY);
          return store;
        }
      }
    } catch {
      /* ignore */
    }
    return emptyStore();
  }

  function writeStore(store) {
    localStorage.setItem(STORE_ROOT, JSON.stringify(store));
  }

  function persist(state) {
    if (!state || !state.teamName) return;
    const store = readStore();
    const key = teamKey(state.teamName);
    store.sessions[key] = state;
    store.activeKey = key;
    writeStore(store);
  }

  function removeSession(stateOrKey) {
    const store = readStore();
    const key =
      typeof stateOrKey === "string"
        ? stateOrKey
        : teamKey(stateOrKey && stateOrKey.teamName);
    if (key && store.sessions[key]) delete store.sessions[key];
    if (store.activeKey === key) store.activeKey = null;
    writeStore(store);
  }

  function getActiveState() {
    const store = readStore();
    if (!store.activeKey) return null;
    return store.sessions[store.activeKey] || null;
  }

  function findByTeamName(name) {
    const key = teamKey(name);
    const store = readStore();
    return store.sessions[key] || null;
  }

  function newState(teamName) {
    return {
      version: 6,
      teamName: teamName.trim(),
      teamId: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      registeredAt: Date.now(),
      photoReady: false,
      currentIndex: 0,
      arrivedForIndex: -1,
      arrivals: [],
      penaltySeconds: 0,
      finished: false,
      finishedAt: null,
      answers: [],
      questCount: quests().length,
    };
  }

  function needsArrivalGate(q) {
    if (!q || q.type !== "task") return false;
    return q.needsArrival !== false;
  }

  function stepBadgeLabel(q) {
    if (!q) return "Шаг";
    if (q.id === "s0") return "Старт";
    if (q.id === "finale") return "Финал";
    if (q.type === "quiz") return "Куда ехать";
    return "На месте";
  }

  function scoredSeconds(st, now = Date.now()) {
    const end = st.finished && st.finishedAt ? st.finishedAt : now;
    const raw = Math.floor((end - st.registeredAt) / 1000);
    return Math.max(0, raw) + (st.penaltySeconds || 0);
  }

  function photoListText() {
    const penaltyMin = Math.round((cfg().photoPenaltySeconds || 300) / 60);
    const lines = [
      `${cfg().title} — ФОТОКВЕСТ`,
      `Фото в командный чат с номером пункта. За каждое отсутствующее фото: +${penaltyMin} мин.`,
      "",
    ];
    photos().forEach((p, i) => {
      const who = p.team ? "вся команда" : "1 человек";
      lines.push(`${i + 1}. [${who}] ${p.text}`);
    });
    return lines.join("\n");
  }

  function fillPhotoLists() {
    ["#photoListRegister", "#photoListQuest"].forEach((sel) => {
      const ol = $(sel);
      if (!ol) return;
      ol.innerHTML = "";
      photos().forEach((p) => {
        const li = document.createElement("li");
        const tag = document.createElement("span");
        tag.className = p.team ? "tag team" : "tag solo";
        tag.textContent = p.team ? "вся команда" : "1 чел.";
        li.appendChild(tag);
        li.appendChild(document.createTextNode(" " + p.text));
        ol.appendChild(li);
      });
    });
  }

  function answersMatch(quest, userText) {
    const variants = [quest.answer, ...(quest.aliases || [])];
    const n = normalize(userText);
    const nl = normalizeLoose(userText);
    return variants.some((v) => {
      const a = normalize(v);
      const al = normalizeLoose(v);
      return n === a || nl === al;
    });
  }

  async function postEvent(payload) {
    const endpoint = cfg().saveEndpoint;
    if (!endpoint) return { ok: false, skipped: true };
    const body = JSON.stringify({ secret: cfg().saveSecret, ...payload });
    // Apps Script: text/plain без preflight; no-cors — запись доходит даже при редиректе GAS
    try {
      await fetch(endpoint, {
        method: "POST",
        mode: "no-cors",
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body,
        keepalive: true,
      });
      return { ok: true, opaque: true };
    } catch (err) {
      console.warn("save failed", err);
      return { ok: false, error: String(err) };
    }
  }

  // --- UI ---

  let state = null;
  let timerId = null;
  let submitting = false;

  function show(screenId) {
    document.querySelectorAll("[data-screen]").forEach((el) => {
      el.hidden = el.dataset.screen !== screenId;
    });
  }

  function setSaveHint(text) {
    const el = $("#saveHint");
    if (el) el.textContent = text || "";
  }

  function renderChrome() {
    $("#questTitle").textContent = cfg().title;
    $("#questSubtitle").textContent = cfg().subtitle;
    const timerWrap = $("#timerWrap");
    if (!cfg().showLiveTimer || !state || state.finished) {
      timerWrap.hidden = true;
      return;
    }
    timerWrap.hidden = false;
    $("#liveTimer").textContent = formatDuration(scoredSeconds(state));
    $("#penaltyBadge").textContent = state.penaltySeconds
      ? `штраф +${formatDuration(state.penaltySeconds)}`
      : "";
  }

  function startTimerLoop() {
    stopTimerLoop();
    timerId = setInterval(() => {
      if (!state || state.finished) return;
      renderChrome();
    }, 1000);
  }

  function stopTimerLoop() {
    if (timerId) clearInterval(timerId);
    timerId = null;
  }

  function renderProgress() {
    const total = quests().length;
    const done = Math.min(state.currentIndex, total);
    $("#progressText").textContent = state.finished
      ? `Готово · ${total}/${total}`
      : `Шаг ${done + 1} из ${total}`;
    $("#progressBar").style.width = `${(done / total) * 100}%`;
    $("#teamLabel").textContent = state.teamName;
  }

  function enterQuestSession(st, opts = {}) {
    state = st;
    persist(state);
    if (state.finished) {
      renderFinish();
      return;
    }
    if (!state.photoReady) {
      renderPhotoScreen();
      return;
    }
    if (state.currentIndex >= quests().length) {
      state.finished = true;
      state.finishedAt = state.finishedAt || Date.now();
      persist(state);
      renderFinish();
      return;
    }
    startTimerLoop();
    renderQuest();
    if (opts.resumed) {
      setSaveHint("Прогресс восстановлен. Таймер шёл с момента регистрации.");
    }
  }

  function renderPhotoScreen() {
    stopTimerLoop();
    show("photo");
    fillPhotoLists();
    renderChrome();
    setSaveHint("Сохраните список фотоквеста в чат, затем нажмите «Готовы?».");
  }

  function confirmPhotoReady() {
    if (!state) return;
    state.photoReady = true;
    persist(state);
    postEvent({
      event: "photo_ready",
      teamName: state.teamName,
      teamId: state.teamId,
      registeredAt: state.registeredAt,
      at: Date.now(),
    });
    enterQuestSession(state);
  }

  function renderArrive(q) {
    show("arrive");
    const total = quests().length;
    const done = Math.min(state.currentIndex, total);
    $("#arriveProgress").textContent = `Шаг ${done + 1} из ${total}`;
    $("#arriveProgressBar").style.width = `${(done / total) * 100}%`;
    $("#arriveTeam").textContent = state.teamName;
    $("#arrivePlace").textContent = q.placeName || q.title || "точка маршрута";
    renderChrome();
    setSaveHint("Подтвердите прибытие — тогда откроется задание на месте.");
  }

  function confirmArrive() {
    if (!state || state.finished) return;
    const list = quests();
    const q = list[state.currentIndex];
    if (!needsArrivalGate(q)) {
      renderQuest();
      return;
    }
    const now = Date.now();
    const arrivedAtIso = new Date(now).toISOString();
    const elapsed = scoredSeconds(state, now);
    state.arrivedForIndex = state.currentIndex;
    if (!Array.isArray(state.arrivals)) state.arrivals = [];
    state.arrivals.push({
      at: now,
      arrivedAt: arrivedAtIso,
      stepIndex: state.currentIndex,
      stepId: q.id,
      placeName: q.placeName || q.title,
      scoredSeconds: elapsed,
      scoredFormatted: formatDuration(elapsed),
    });
    persist(state);
    postEvent({
      event: "arrive",
      teamName: state.teamName,
      teamId: state.teamId,
      stepIndex: state.currentIndex,
      stepId: q.id,
      placeName: q.placeName || q.title,
      title: q.title,
      type: "arrive",
      arrivedAt: arrivedAtIso,
      scoredSeconds: elapsed,
      totalFormatted: formatDuration(elapsed),
    });
    renderQuest();
  }

  function renderQuest() {
    const list = quests();
    if (state.currentIndex >= list.length) {
      renderFinish();
      return;
    }

    const q = list[state.currentIndex];

    // После верной загадки «куда ехать» — сначала спросить, на точке ли команда
    if (needsArrivalGate(q) && state.arrivedForIndex !== state.currentIndex) {
      renderArrive(q);
      return;
    }

    show("quest");
    $("#stepBadge").textContent = stepBadgeLabel(q);
    $("#stepTitle").textContent = q.title || `Шаг ${state.currentIndex + 1}`;
    $("#stepQuestion").innerHTML = String(q.question || "").replace(/\n/g, "<br>");
    $("#stepHint").textContent = q.hint || "";
    $("#stepHint").hidden = !q.hint;
    $("#answerInput").value = "";
    $("#feedback").textContent = "";
    $("#feedback").className = "feedback";
    $("#answerSubmit").disabled = false;
    submitting = false;
    renderProgress();
    renderChrome();
    setSaveHint("Ответы и время сохраняются на этом телефоне автоматически.");
    try {
      $("#answerInput").focus();
    } catch {
      /* mobile */
    }
  }

  function renderFinish() {
    stopTimerLoop();
    show("finish");
    const total = scoredSeconds(state);
    $("#finishBody").innerHTML = cfg().finishHtml;
    $("#finalTime").textContent = formatDuration(total);
    $("#finalTeam").textContent = state.teamName;
    $("#finalPenalty").textContent = state.penaltySeconds
      ? `из них штраф за ответы: ${formatDuration(state.penaltySeconds)}`
      : "штрафов за ответы нет";
    const photoMin = Math.round((cfg().photoPenaltySeconds || 300) / 60);
    const photoNote = $("#photoFinishNote");
    if (photoNote) {
      photoNote.innerHTML = `Фотоквест ещё не в этом числе: организаторы проверят чат и добавят <strong>+${photoMin} мин</strong> за каждое отсутствующее фото (${photos().length} пунктов).`;
    }
    $("#exportBox").value = JSON.stringify(
      {
        team: state.teamName,
        teamId: state.teamId,
        registeredAt: new Date(state.registeredAt).toISOString(),
        finishedAt: state.finishedAt
          ? new Date(state.finishedAt).toISOString()
          : null,
        penaltySeconds: state.penaltySeconds,
        totalSeconds: total,
        totalFormatted: formatDuration(total),
        arrivals: state.arrivals || [],
        answers: state.answers,
      },
      null,
      2
    );
    renderProgress();
    renderChrome();
    setSaveHint("");
  }

  async function registerTeam(name) {
    const existing = findByTeamName(name);
    const store = readStore();
    const active = getActiveState();

    // Уже идёт другая незавершённая сессия на этом телефоне — нельзя начать «с чистого листа»
    if (
      active &&
      !active.finished &&
      teamKey(active.teamName) !== teamKey(name)
    ) {
      enterQuestSession(active, { resumed: true });
      setSaveHint(
        `На этом телефоне уже идёт команда «${active.teamName}». Сброс и смена команды недоступны.`
      );
      return;
    }

    if (existing && !existing.finished) {
      enterQuestSession(existing, { resumed: true });
      return;
    }

    if (existing && existing.finished) {
      enterQuestSession(existing);
      setSaveHint("Эта команда уже финишировала. Новый старт с этого телефона недоступен.");
      return;
    }

    // Если на устройстве уже есть завершённая сессия — тоже не даём завести новую команду
    const anyFinished = Object.values(store.sessions || {}).some((s) => s && s.finished);
    if (anyFinished && !existing) {
      const finished = Object.values(store.sessions).find((s) => s && s.finished);
      enterQuestSession(finished);
      setSaveHint("На этом телефоне квест уже пройден. Новая регистрация недоступна.");
      return;
    }

    state = newState(name);
    persist(state);
    await postEvent({
      event: "register",
      teamName: state.teamName,
      teamId: state.teamId,
      registeredAt: state.registeredAt,
      totalSteps: quests().length,
    });
    enterQuestSession(state);
  }

  async function submitAnswer() {
    if (!state || state.finished || submitting) return;
    const list = quests();
    const idx = state.currentIndex;
    if (idx >= list.length) return;

    const raw = $("#answerInput").value;
    if (!String(raw).trim()) return;

    submitting = true;
    $("#answerSubmit").disabled = true;

    const q = list[idx];
    const ok = answersMatch(q, raw);
    const now = Date.now();

    const entry = {
      at: now,
      stepIndex: idx,
      stepId: q.id,
      type: q.type,
      title: q.title,
      answerGiven: raw,
      correct: ok,
      elapsedRawSec: Math.floor((now - state.registeredAt) / 1000),
      penaltyBefore: state.penaltySeconds,
    };
    state.answers.push(entry);

    if (!ok) {
      state.penaltySeconds += cfg().penaltySeconds;
      entry.penaltyAdded = cfg().penaltySeconds;
      persist(state);
      $("#feedback").textContent = `Неверно. +${formatDuration(cfg().penaltySeconds)} к итоговому времени. Попробуйте ещё раз.`;
      $("#feedback").className = "feedback bad";
      renderChrome();
      setSaveHint("Штраф сохранён. Можно вводить снова.");
      await postEvent({
        event: "answer",
        teamName: state.teamName,
        teamId: state.teamId,
        ...entry,
        penaltySeconds: state.penaltySeconds,
        scoredSeconds: scoredSeconds(state),
      });
      submitting = false;
      $("#answerSubmit").disabled = false;
      $("#answerInput").select();
      return;
    }

    entry.penaltyAdded = 0;
    state.currentIndex += 1;
    persist(state);

    await postEvent({
      event: "answer",
      teamName: state.teamName,
      teamId: state.teamId,
      ...entry,
      penaltySeconds: state.penaltySeconds,
      scoredSeconds: scoredSeconds(state),
    });

    if (state.currentIndex >= list.length) {
      state.finished = true;
      state.finishedAt = now;
      persist(state);
      await postEvent({
        event: "finish",
        teamName: state.teamName,
        teamId: state.teamId,
        registeredAt: state.registeredAt,
        finishedAt: state.finishedAt,
        penaltySeconds: state.penaltySeconds,
        totalSeconds: scoredSeconds(state),
        totalFormatted: formatDuration(scoredSeconds(state)),
        answers: state.answers,
      });
      submitting = false;
      renderFinish();
      return;
    }

    const next = list[state.currentIndex];
    const msg = needsArrivalGate(next)
      ? "Верно! Когда будете на точке — подтвердите прибытие."
      : "Верно! Следующее задание…";
    $("#feedback").textContent = msg;
    $("#feedback").className = "feedback good";
    setTimeout(() => {
      submitting = false;
      renderQuest();
    }, 450);
  }

  function showRegister() {
    stopTimerLoop();
    state = null;
    show("register");
    renderChrome();
    setSaveHint("");
    const input = $("#teamName");
    if (input) input.focus();
  }

  function bind() {
    bindAntiExfil();

    $("#registerForm").addEventListener("submit", (e) => {
      e.preventDefault();
      const name = $("#teamName").value.trim();
      if (!name) return;
      registerTeam(name);
    });

    $("#answerForm").addEventListener("submit", (e) => {
      e.preventDefault();
      submitAnswer();
    });

    const arriveBtn = $("#arriveConfirm");
    if (arriveBtn) {
      arriveBtn.addEventListener("click", () => confirmArrive());
    }

    const photoReadyBtn = $("#photoReadyBtn");
    if (photoReadyBtn) {
      photoReadyBtn.addEventListener("click", () => confirmPhotoReady());
    }

    $("#copyExport").addEventListener("click", async () => {
      const text = $("#exportBox").value;
      try {
        await navigator.clipboard.writeText(text);
        $("#copyExport").textContent = "Скопировано";
        setTimeout(() => {
          $("#copyExport").textContent = "Скопировать итог";
        }, 1500);
      } catch {
        $("#exportBox").select();
      }
    });

    const copyPhotoBtn = $("#copyPhotoList");
    if (copyPhotoBtn) {
      copyPhotoBtn.addEventListener("click", async () => {
        const status = $("#copyPhotoStatus");
        try {
          await navigator.clipboard.writeText(photoListText());
          if (status) {
            status.hidden = false;
            status.textContent =
              "Список скопирован — вставьте в командный чат и не потеряйте.";
          }
          copyPhotoBtn.textContent = "Скопировано";
          setTimeout(() => {
            copyPhotoBtn.textContent = "Скопировать список";
          }, 2000);
        } catch {
          if (status) {
            status.hidden = false;
            status.textContent =
              "Не удалось скопировать — перепишите список вручную в чат.";
          }
        }
      });
    }

    $("#resumeBtn").addEventListener("click", () => {
      const active = getActiveState();
      if (!active) {
        showRegister();
        return;
      }
      enterQuestSession(active, { resumed: true });
    });

    // сброс прогресса и «другая команда» намеренно недоступны —
    // иначе команды обнулят таймер и штрафы.

    document.addEventListener("visibilitychange", () => {
      if (state) persist(state);
      setPrivacyShield(document.visibilityState !== "visible");
    });
    window.addEventListener("pagehide", () => {
      if (state) persist(state);
      setPrivacyShield(true);
    });
    window.addEventListener("blur", () => {
      if (document.visibilityState !== "visible") setPrivacyShield(true);
    });
    window.addEventListener("focus", () => {
      if (document.visibilityState === "visible") setPrivacyShield(false);
    });
    window.addEventListener("pageshow", () => {
      setPrivacyShield(document.visibilityState !== "visible");
    });
  }

  /**
   * Защита от копирования текста — да.
   * Полный запрет скриншота с телефона из веб-страницы — невозможен (ОС не даёт).
   * Щит при уходе с вкладки мешает превью в мультизадачности и части записи экрана.
   */
  function setPrivacyShield(on) {
    const shield = $("#privacyShield");
    if (!shield) return;
    document.body.classList.toggle("privacy-on", !!on);
    shield.hidden = !on;
    shield.setAttribute("aria-hidden", on ? "false" : "true");
  }

  function bindAntiExfil() {
    const block = (e) => {
      const t = e.target;
      if (t && (t.closest("input, textarea, .allow-select"))) return;
      e.preventDefault();
    };

    ["copy", "cut", "paste", "selectstart", "dragstart"].forEach((type) => {
      document.addEventListener(type, block, { capture: true });
    });

    document.addEventListener(
      "contextmenu",
      (e) => {
        if (e.target && e.target.closest("input, textarea, .allow-select")) return;
        e.preventDefault();
      },
      { capture: true }
    );

    // горячие клавиши копирования / печати / «сохранить как» (десктоп)
    document.addEventListener(
      "keydown",
      (e) => {
        const key = (e.key || "").toLowerCase();
        const ctrl = e.ctrlKey || e.metaKey;
        if (ctrl && ["c", "x", "a", "s", "p", "u"].includes(key)) {
          const t = e.target;
          if (t && t.closest("input, textarea, .allow-select")) {
            if (key === "a" || key === "c" || key === "x") return;
          }
          e.preventDefault();
        }
        if (e.key === "PrintScreen") {
          setPrivacyShield(true);
          setTimeout(() => {
            if (document.visibilityState === "visible") setPrivacyShield(false);
          }, 800);
        }
      },
      { capture: true }
    );
  }

  function init() {
    bind();
    fillPhotoLists();
    $("#questTitle").textContent = cfg().title;
    $("#questSubtitle").textContent = cfg().subtitle;

    const active = getActiveState();
    if (active && !active.finished) {
      // страница «вылетела» — сразу на то же задание
      enterQuestSession(active, { resumed: true });
    } else if (active && active.finished) {
      enterQuestSession(active);
    } else {
      showRegister();
    }
    renderChrome();
  }

  document.addEventListener("DOMContentLoaded", init);
})();
