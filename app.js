const LECTURE_DATA_URL =
  "https://raw.githubusercontent.com/yamrishraj/lecture-data/refs/heads/main/polity.json";
const TESTS_INDEX_URL =
  "https://raw.githubusercontent.com/yamrishraj/mock/main/tests_index.json";

const state = {
  subjects: [],
  cachedSubjectTests: null,
  currentScreen: "subjects",
  selectedSubject: null,
  selectedLecture: null,
  selectedLectureIndex: 1,
  currentQuizInfo: null,
  quizQuestions: [],
  quizIndex: 0,
  userAnswers: new Map()
};

const els = {
  views: {
    subjects: document.getElementById("view-subjects"),
    lectures: document.getElementById("view-lectures"),
    player: document.getElementById("view-player"),
    quiz: document.getElementById("view-quiz")
  },
  btnRefreshSubjects: document.getElementById("btnRefreshSubjects"),
  iosInstallHint: document.getElementById("iosInstallHint"),
  btnDismissIosHint: document.getElementById("btnDismissIosHint"),
  subjectsLoading: document.getElementById("subjectsLoading"),
  subjectsStatus: document.getElementById("subjectsStatus"),
  rvSubjects: document.getElementById("rvSubjects"),

  btnBackToSubjects: document.getElementById("btnBackToSubjects"),
  tvSubjectHeading: document.getElementById("tvSubjectHeading"),
  rvLectures: document.getElementById("rvLectures"),

  btnBackToLectures: document.getElementById("btnBackToLectures"),
  youtubePlayerFrame: document.getElementById("youtubePlayerFrame"),
  tvCurrentSubjectName: document.getElementById("tvCurrentSubjectName"),
  tvCurrentLectureTitle: document.getElementById("tvCurrentLectureTitle"),
  btnOpenNotes: document.getElementById("btnOpenNotes"),
  tvNotesLabel: document.getElementById("tvNotesLabel"),
  btnDownloadNotes: document.getElementById("btnDownloadNotes"),
  cardLectureQuiz: document.getElementById("cardLectureQuiz"),
  tvQuizTitle: document.getElementById("tvQuizTitle"),
  tvQuizSubtitle: document.getElementById("tvQuizSubtitle"),

  btnQuizBack: document.getElementById("btnQuizBack"),
  tvQuizHeaderTitle: document.getElementById("tvQuizHeaderTitle"),
  tvQuestionCounter: document.getElementById("tvQuestionCounter"),
  progressBarQuiz: document.getElementById("progressBarQuiz"),
  quizLoadingSpinner: document.getElementById("quizLoadingSpinner"),
  quizErrorBox: document.getElementById("quizErrorBox"),
  tvQuizErrorMessage: document.getElementById("tvQuizErrorMessage"),
  btnQuizRetry: document.getElementById("btnQuizRetry"),
  scrollQuizContent: document.getElementById("scrollQuizContent"),
  tvQuestionBadge: document.getElementById("tvQuestionBadge"),
  tvQuestionText: document.getElementById("tvQuestionText"),
  optionsContainer: document.getElementById("optionsContainer"),
  quizBottomBar: document.getElementById("quizBottomBar"),
  btnPreviousQuestion: document.getElementById("btnPreviousQuestion"),
  btnNextQuestion: document.getElementById("btnNextQuestion"),
  layoutResult: document.getElementById("layoutResult"),
  tvResultHeading: document.getElementById("tvResultHeading"),
  tvResultScore: document.getElementById("tvResultScore"),
  tvResultBreakdown: document.getElementById("tvResultBreakdown"),
  btnRestartQuiz: document.getElementById("btnRestartQuiz"),
  btnDoneQuiz: document.getElementById("btnDoneQuiz")
};

// =========================================================
// URL & Formatting Helpers (Mirroring Android App Logic)
// =========================================================

function isSafeHttpUrl(rawUrl) {
  if (typeof rawUrl !== "string") return false;
  const trimmed = rawUrl.trim();
  if (!trimmed) return false;
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

function extractCleanVideoId(rawInput) {
  const input = String(rawInput ?? "")
    .trim()
    .replace(/^["']+|["']+$/g, "")
    .replace(/\\/g, "");
  if (!input) return "";
  if (/^[a-zA-Z0-9_-]{11}$/.test(input)) return input;
  const match = input.match(/(?:v=|v\/|embed\/|youtu\.be\/|shorts\/|live\/)([a-zA-Z0-9_-]{11})/);
  return match ? match[1] : input;
}

function formattedNotesLabel(lectureName, indexOneBased) {
  const trimmed = String(lectureName ?? "").trim();
  if (!trimmed) return `Lecture ${indexOneBased} Notes`;
  if (/notes$/i.test(trimmed)) return trimmed;
  if (/^lecture/i.test(trimmed)) return `${trimmed} Notes`;
  return `Lecture ${indexOneBased} Notes (${trimmed})`;
}

function firstNonBlank(...values) {
  for (const v of values) {
    if (typeof v === "string" && v.trim().length > 0) {
      return v.trim();
    }
  }
  return "";
}

// =========================================================
// Data Parsing (Mirroring LectureRepository & QuizRepository)
// =========================================================

function parseLecturesList(lecturesArray) {
  if (!Array.isArray(lecturesArray)) return [];
  return lecturesArray
    .filter((item) => item && typeof item === "object")
    .map((item, idx) => {
      const lectureName =
        firstNonBlank(item.lecture_name, item.title, item.name) || `Lecture ${idx + 1}`;
      const videoId = firstNonBlank(
        item.video_id,
        item.videoId,
        item.youtube_id,
        item.youtubeId,
        item.video_url,
        item.videoUrl,
        item.youtube_url,
        item.url,
        item.link
      );
      const pdfViewUrl = firstNonBlank(
        item.pdf_view_url,
        item.pdfViewUrl,
        item.pdf_url,
        item.notes_url,
        item.pdf
      );
      const pdfDownloadUrl = firstNonBlank(
        item.pdf_download_url,
        item.pdfDownloadUrl,
        pdfViewUrl
      );
      return { lectureName, videoId, pdfViewUrl, pdfDownloadUrl };
    });
}

function parseJsonArraySubjects(arr) {
  if (!Array.isArray(arr) || arr.length === 0) return [];
  const firstObj = arr.find((item) => item && typeof item === "object");
  if (!firstObj) return [];

  if ("subject_name" in firstObj || "lectures" in firstObj) {
    return arr
      .filter((obj) => obj && typeof obj === "object")
      .map((obj, idx) => {
        const subjectName =
          firstNonBlank(obj.subject_name, obj.subject, obj.name) || `Subject ${idx + 1}`;
        const lectures = parseLecturesList(obj.lectures);
        return { subjectName, lectures };
      });
  }

  const flatLectures = parseLecturesList(arr);
  return flatLectures.length > 0 ? [{ subjectName: "Polity", lectures: flatLectures }] : [];
}

function parseLecturesPayload(payload) {
  if (Array.isArray(payload)) {
    return parseJsonArraySubjects(payload);
  }
  if (payload && typeof payload === "object") {
    if (Array.isArray(payload.subjects)) {
      return parseJsonArraySubjects(payload.subjects);
    }
    const subjectName = firstNonBlank(payload.subject_name, payload.subject) || "Polity";
    return [{ subjectName, lectures: parseLecturesList(payload.lectures) }];
  }
  return [];
}

function normalizeSubject(name) {
  const lower = String(name ?? "").toLowerCase().trim();
  if (lower.includes("polity") || lower.includes("राजव्यवस्था")) return "polity";
  if (lower.includes("history") || lower.includes("इतिहास")) return "history";
  if (lower.includes("geography") || lower.includes("भूगोल")) return "geography";
  if (lower.includes("police")) return "bihar_police";
  return lower;
}

function parseTestsIndex(rawArray) {
  const map = new Map();
  if (!Array.isArray(rawArray)) return map;

  for (const subjectObj of rawArray) {
    if (!subjectObj || typeof subjectObj !== "object") continue;
    const subject = String(subjectObj.subject ?? "").trim();
    const testsArray = subjectObj.tests;
    if (!Array.isArray(testsArray)) continue;

    const list = [];
    for (const tObj of testsArray) {
      if (!tObj || typeof tObj !== "object") continue;
      const testId = String(tObj.test_id ?? "");
      const title = String(tObj.title ?? "");
      const totalQuestions = Number.isFinite(Number(tObj.total_questions))
        ? Number(tObj.total_questions)
        : 0;
      const jsonUrl = String(tObj.json_url ?? "");
      if (jsonUrl.trim()) {
        list.push({ testId, title, totalQuestions, jsonUrl });
      }
    }

    const key = normalizeSubject(subject);
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(...list);
  }
  return map;
}

function parseQuestionsJson(rawArray) {
  if (!Array.isArray(rawArray)) return [];
  const list = [];
  for (const obj of rawArray) {
    if (!obj || typeof obj !== "object") continue;
    const question = firstNonBlank(obj.q, obj.question);
    const optArray = Array.isArray(obj.opt)
      ? obj.opt
      : Array.isArray(obj.options)
        ? obj.options
        : [];
    const options = optArray.map((o) => String(o ?? ""));
    const rawAns = obj.ans !== undefined ? obj.ans : obj.answer !== undefined ? obj.answer : 0;
    const answerIndex = Number.isFinite(Number(rawAns)) ? Number(rawAns) : 0;
    if (question && options.length > 0) {
      list.push({ question, options, answerIndex });
    }
  }
  return list;
}

async function fetchJson(url, forceRefresh = false) {
  const fetchUrl = forceRefresh
    ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}`
    : url;
  const response = await fetch(fetchUrl, {
    cache: forceRefresh ? "no-store" : "default"
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }
  return response.json();
}

async function getTestsForSubject(subjectName, forceRefresh = false) {
  const key = normalizeSubject(subjectName);
  if (!forceRefresh && state.cachedSubjectTests && state.cachedSubjectTests.has(key)) {
    return state.cachedSubjectTests.get(key);
  }
  try {
    const raw = await fetchJson(TESTS_INDEX_URL, forceRefresh);
    state.cachedSubjectTests = parseTestsIndex(raw);
    return state.cachedSubjectTests.get(key) ?? [];
  } catch {
    return state.cachedSubjectTests?.get(key) ?? [];
  }
}

async function findQuizForLecture(subjectName, lectureName, lectureIndex) {
  const tests = await getTestsForSubject(subjectName, false);
  if (tests.length === 0) return null;

  const numMatch =
    String(lectureName ?? "").match(/Lecture\s+(\d+(?:\.\d+)?)/i) ||
    String(lectureName ?? "").match(/\b(\d+(?:\.\d+)?)\b/);

  if (numMatch) {
    const lecNum = numMatch[1];
    const decMatch = lecNum.match(/^(\d+)\.(\d+)$/);

    if (decMatch) {
      const whole = parseInt(decMatch[1], 10) || 0;
      const dec = decMatch[2];
      const pat1 = `_${whole}_${dec}`;
      const pat2 = `_${String(whole).padStart(2, "0")}_${dec}`;
      const escapedNum = lecNum.replace(".", "\\.");
      const titlePat = new RegExp(`\\bPart\\s+${escapedNum}\\b`, "i");

      const decimalFound = tests.find((t) => {
        const id = t.testId.toLowerCase();
        return id.endsWith(pat1) || id.endsWith(pat2) || titlePat.test(t.title);
      });
      if (decimalFound) return decimalFound;
    } else {
      const intVal = parseInt(lecNum, 10);
      if (!Number.isNaN(intVal)) {
        const exactId1 = `_${String(intVal).padStart(2, "0")}`;
        const exactId2 = `_${intVal}`;
        const titlePat = new RegExp(`\\bPart\\s+${intVal}\\b`, "i");
        const decVar1 = new RegExp(`.*_${intVal}_\\d+.*`);
        const decVar2 = new RegExp(`.*_${String(intVal).padStart(2, "0")}_\\d+.*`);

        const intFound = tests.find((t) => {
          const id = t.testId.toLowerCase();
          const matchesId =
            id.endsWith(exactId1) || id.endsWith(exactId2) || titlePat.test(t.title);
          const isDecimalVariant = decVar1.test(id) || decVar2.test(id);
          return matchesId && !isDecimalVariant;
        });
        if (intFound) return intFound;
      }
    }
  }

  const indexZeroBased = lectureIndex - 1;
  if (indexZeroBased >= 0 && indexZeroBased < tests.length) {
    return tests[indexZeroBased];
  }
  return tests[0] ?? null;
}

// =========================================================
// Screen Navigation & History State
// =========================================================

function showScreen(screenName, pushHistory = true) {
  // Stop active YouTube playback cleanly when leaving the player screen
  if (state.currentScreen === "player" && screenName !== "player") {
    els.youtubePlayerFrame.src = "about:blank";
  }

  Object.entries(els.views).forEach(([name, el]) => {
    el.classList.toggle("hidden", name !== screenName);
  });

  state.currentScreen = screenName;
  window.scrollTo(0, 0);

  if (pushHistory) {
    history.pushState({ screen: screenName }, "", `#${screenName}`);
  }
}

function goBack(fallbackScreen) {
  if (history.state && history.state.screen && history.state.screen !== "subjects") {
    history.back();
  } else {
    showScreen(fallbackScreen, false);
  }
}

window.addEventListener("popstate", (event) => {
  const target = event.state?.screen;
  if (target && els.views[target]) {
    if (target === "player" && state.selectedLecture) {
      renderPlayerVideoOnly();
    }
    showScreen(target, false);
  } else {
    showScreen("subjects", false);
  }
});

// =========================================================
// Renderers
// =========================================================

function createChevronSvg() {
  const svgNS = "http://www.w3.org/2000/svg";
  const svg = document.createElementNS(svgNS, "svg");
  svg.setAttribute("viewBox", "0 0 24 24");
  svg.setAttribute("width", "24");
  svg.setAttribute("height", "24");
  svg.setAttribute("aria-hidden", "true");
  svg.classList.add("chevron-icon");
  const path = document.createElementNS(svgNS, "path");
  path.setAttribute("fill", "#94A3B8");
  path.setAttribute("d", "M10,6L8.59,7.41 13.17,12l-4.58,4.59L10,18l6,-6z");
  svg.appendChild(path);
  return svg;
}

function renderSubjects(subjects) {
  els.rvSubjects.innerHTML = "";
  if (!subjects || subjects.length === 0) {
    els.subjectsStatus.textContent = "No subjects available. Tap refresh to retry.";
    els.subjectsStatus.classList.remove("hidden");
    return;
  }
  els.subjectsStatus.classList.add("hidden");

  subjects.forEach((subject) => {
    const card = document.createElement("button");
    card.type = "button";
    card.className = "subject-card";

    const textCol = document.createElement("span");
    textCol.className = "subject-card-text";

    const nameEl = document.createElement("span");
    nameEl.className = "subject-name";
    nameEl.textContent = subject.subjectName;

    const count = subject.lectures.length;
    const countEl = document.createElement("span");
    countEl.className = "subject-count";
    countEl.textContent = count === 1 ? "1 Lecture" : `${count} Lectures`;

    textCol.appendChild(nameEl);
    textCol.appendChild(countEl);
    card.appendChild(textCol);
    card.appendChild(createChevronSvg());

    card.addEventListener("click", () => {
      openLectureList(subject);
    });
    els.rvSubjects.appendChild(card);
  });
}

function openLectureList(subject) {
  state.selectedSubject = subject;
  els.tvSubjectHeading.textContent = subject.subjectName || "Lectures";
  els.rvLectures.innerHTML = "";

  subject.lectures.forEach((lecture, idx) => {
    const indexOneBased = idx + 1;
    const card = document.createElement("button");
    card.type = "button";
    card.className = "lecture-card";
    card.textContent = lecture.lectureName;
    card.addEventListener("click", () => {
      openPlayer(subject.subjectName, lecture, indexOneBased);
    });
    els.rvLectures.appendChild(card);
  });

  showScreen("lectures", true);
}

function renderPlayerVideoOnly() {
  const lecture = state.selectedLecture;
  if (!lecture) return;
  const cleanId = extractCleanVideoId(lecture.videoId) || "YlfLpnt_chU";
  const safeId = encodeURIComponent(cleanId);
  els.youtubePlayerFrame.src =
    `https://www.youtube.com/embed/${safeId}?autoplay=1&playsinline=1&rel=0&fs=1`;
}

async function openPlayer(subjectName, lecture, lectureIndex) {
  state.selectedLecture = lecture;
  state.selectedLectureIndex = lectureIndex;

  els.tvCurrentSubjectName.textContent = subjectName;
  els.tvCurrentLectureTitle.textContent = lecture.lectureName || `Lecture ${lectureIndex}`;
  els.tvNotesLabel.textContent = formattedNotesLabel(lecture.lectureName, lectureIndex);

  renderPlayerVideoOnly();

  // Notes View link
  const viewUrl = lecture.pdfViewUrl.trim() || lecture.pdfDownloadUrl.trim();
  if (isSafeHttpUrl(viewUrl)) {
    els.btnOpenNotes.href = viewUrl;
    els.btnOpenNotes.classList.remove("is-disabled");
  } else {
    els.btnOpenNotes.removeAttribute("href");
    els.btnOpenNotes.classList.add("is-disabled");
  }

  // Notes Download link
  const downloadUrl = lecture.pdfDownloadUrl.trim() || lecture.pdfViewUrl.trim();
  if (isSafeHttpUrl(downloadUrl)) {
    els.btnDownloadNotes.href = downloadUrl;
    els.btnDownloadNotes.classList.remove("is-disabled");
  } else {
    els.btnDownloadNotes.removeAttribute("href");
    els.btnDownloadNotes.classList.add("is-disabled");
  }

  // Quiz card setup
  els.cardLectureQuiz.classList.add("hidden");
  state.currentQuizInfo = null;
  showScreen("player", true);

  const quizInfo = await findQuizForLecture(subjectName, lecture.lectureName, lectureIndex);
  // Ensure user is still looking at the same lecture
  if (
    state.selectedLecture === lecture &&
    state.selectedLectureIndex === lectureIndex &&
    quizInfo
  ) {
    state.currentQuizInfo = quizInfo;
    els.tvQuizTitle.textContent = quizInfo.title || "Lecture Quiz";
    const qCount = quizInfo.totalQuestions;
    els.tvQuizSubtitle.textContent =
      qCount > 0 ? `${qCount} Questions • Start Quiz` : "Start Practice Quiz";
    els.cardLectureQuiz.classList.remove("hidden");
  }
}

// =========================================================
// Quiz Logic (Mirroring QuizActivity.kt)
// =========================================================

async function openQuiz(quizInfo) {
  state.currentQuizInfo = quizInfo;
  state.quizQuestions = [];
  state.quizIndex = 0;
  state.userAnswers = new Map();

  els.tvQuizHeaderTitle.textContent = quizInfo.title || "Lecture Quiz";
  els.tvQuestionCounter.textContent = "";
  els.progressBarQuiz.style.width = "0%";
  showScreen("quiz", true);
  await loadQuizQuestions(quizInfo.jsonUrl);
}

async function loadQuizQuestions(jsonUrl) {
  if (!isSafeHttpUrl(jsonUrl)) {
    showQuizError("Quiz URL not available.");
    return;
  }

  els.quizLoadingSpinner.classList.remove("hidden");
  els.quizErrorBox.classList.add("hidden");
  els.scrollQuizContent.classList.add("hidden");
  els.quizBottomBar.classList.add("hidden");
  els.layoutResult.classList.add("hidden");

  try {
    const raw = await fetchJson(jsonUrl, false);
    const list = parseQuestionsJson(raw);
    els.quizLoadingSpinner.classList.add("hidden");

    if (list.length === 0) {
      showQuizError("No questions found for this quiz.");
      return;
    }

    state.quizQuestions = list;
    state.quizIndex = 0;
    state.userAnswers = new Map();
    els.scrollQuizContent.classList.remove("hidden");
    els.quizBottomBar.classList.remove("hidden");
    displayCurrentQuestion();
  } catch {
    els.quizLoadingSpinner.classList.add("hidden");
    showQuizError("Unable to load questions. Please check your internet connection.");
  }
}

function showQuizError(message) {
  els.tvQuizErrorMessage.textContent = message;
  els.quizErrorBox.classList.remove("hidden");
  els.scrollQuizContent.classList.add("hidden");
  els.quizBottomBar.classList.add("hidden");
}

function displayCurrentQuestion() {
  const total = state.quizQuestions.length;
  if (total === 0 || state.quizIndex < 0 || state.quizIndex >= total) return;

  const q = state.quizQuestions[state.quizIndex];
  els.tvQuestionCounter.textContent = `Question ${state.quizIndex + 1} of ${total}`;
  els.progressBarQuiz.style.width = `${Math.round(((state.quizIndex + 1) * 100) / total)}%`;
  els.tvQuestionBadge.textContent = `QUESTION ${state.quizIndex + 1}`;
  els.tvQuestionText.textContent = q.question;

  const labels = ["A", "B", "C", "D"];
  const selectedAns = state.userAnswers.has(state.quizIndex)
    ? state.userAnswers.get(state.quizIndex)
    : null;
  const isAnswered = selectedAns !== null;

  els.optionsContainer.innerHTML = "";
  q.options.slice(0, 4).forEach((optText, optionIndex) => {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "option-card";

    if (!isAnswered) {
      btn.classList.add("unanswered");
      btn.addEventListener("click", () => {
        state.userAnswers.set(state.quizIndex, optionIndex);
        displayCurrentQuestion();
      });
    } else if (optionIndex === q.answerIndex) {
      btn.classList.add("correct");
      btn.disabled = true;
    } else if (optionIndex === selectedAns) {
      btn.classList.add("wrong");
      btn.disabled = true;
    } else {
      btn.classList.add("dimmed");
      btn.disabled = true;
    }

    const badge = document.createElement("span");
    badge.className = "option-badge";
    badge.textContent = labels[optionIndex] || String(optionIndex + 1);

    const text = document.createElement("span");
    text.className = "option-text";
    text.textContent = optText;

    btn.appendChild(badge);
    btn.appendChild(text);
    els.optionsContainer.appendChild(btn);
  });

  els.btnPreviousQuestion.disabled = state.quizIndex === 0;
  els.btnNextQuestion.textContent = state.quizIndex === total - 1 ? "Finish" : "Next";
  els.scrollQuizContent.scrollTop = 0;
}

function showResultScreen() {
  const total = state.quizQuestions.length;
  let correctCount = 0;
  state.userAnswers.forEach((selected, idx) => {
    if (idx >= 0 && idx < total && state.quizQuestions[idx].answerIndex === selected) {
      correctCount++;
    }
  });
  const wrongCount = total - correctCount;
  const percent = total > 0 ? Math.floor((correctCount * 100) / total) : 0;

  els.scrollQuizContent.classList.add("hidden");
  els.quizBottomBar.classList.add("hidden");
  els.layoutResult.classList.remove("hidden");

  if (percent >= 80) {
    els.tvResultHeading.textContent = "उत्कृष्ट! 🎉 (Excellent!)";
  } else if (percent >= 50) {
    els.tvResultHeading.textContent = "बहुत बढ़िया! 👏 (Good Job!)";
  } else {
    els.tvResultHeading.textContent = "पुनः प्रयास करें 💪 (Keep Practicing!)";
  }
  els.tvResultScore.textContent = `${correctCount} / ${total} (${percent}%)`;
  els.tvResultBreakdown.textContent = `सही उत्तर: ${correctCount}  •  गलत उत्तर: ${wrongCount}`;
}

// =========================================================
// App Loading & Initialization
// =========================================================

async function loadSubjects(forceRefresh = false) {
  els.btnRefreshSubjects.classList.add("spinning");
  if (state.subjects.length === 0) {
    els.subjectsLoading.classList.remove("hidden");
    els.subjectsStatus.classList.add("hidden");
  }

  if (forceRefresh) {
    state.cachedSubjectTests = null;
  }

  try {
    const raw = await fetchJson(LECTURE_DATA_URL, forceRefresh);
    const parsed = parseLecturesPayload(raw);
    state.subjects = parsed;
    renderSubjects(parsed);

    if (forceRefresh) {
      // Pre-warm tests index cleanly in background on manual refresh
      getTestsForSubject("polity", true);
    }
  } catch {
    if (state.subjects.length === 0) {
      els.subjectsStatus.textContent = "Unable to load subjects. Tap refresh to retry.";
      els.subjectsStatus.classList.remove("hidden");
    }
  } finally {
    els.subjectsLoading.classList.add("hidden");
    els.btnRefreshSubjects.classList.remove("spinning");
  }
}

function setupIosInstallBanner() {
  const isIos = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const isStandalone =
    window.navigator.standalone === true ||
    window.matchMedia("(display-mode: standalone)").matches;
  const dismissed = localStorage.getItem("vidya_ios_hint_dismissed") === "1";

  if (isIos && !isStandalone && !dismissed) {
    els.iosInstallHint.classList.remove("hidden");
  }

  els.btnDismissIosHint.addEventListener("click", () => {
    els.iosInstallHint.classList.add("hidden");
    localStorage.setItem("vidya_ios_hint_dismissed", "1");
  });
}

function wireEvents() {
  els.btnRefreshSubjects.addEventListener("click", () => loadSubjects(true));
  els.btnBackToSubjects.addEventListener("click", () => goBack("subjects"));
  els.btnBackToLectures.addEventListener("click", () => goBack("lectures"));
  els.btnQuizBack.addEventListener("click", () => goBack("player"));

  els.cardLectureQuiz.addEventListener("click", () => {
    if (state.currentQuizInfo) {
      openQuiz(state.currentQuizInfo);
    }
  });

  els.btnQuizRetry.addEventListener("click", () => {
    if (state.currentQuizInfo) {
      loadQuizQuestions(state.currentQuizInfo.jsonUrl);
    }
  });

  els.btnPreviousQuestion.addEventListener("click", () => {
    if (state.quizIndex > 0) {
      state.quizIndex--;
      displayCurrentQuestion();
    }
  });

  els.btnNextQuestion.addEventListener("click", () => {
    if (state.quizIndex < state.quizQuestions.length - 1) {
      state.quizIndex++;
      displayCurrentQuestion();
    } else {
      showResultScreen();
    }
  });

  els.btnRestartQuiz.addEventListener("click", () => {
    state.userAnswers = new Map();
    state.quizIndex = 0;
    els.layoutResult.classList.add("hidden");
    els.scrollQuizContent.classList.remove("hidden");
    els.quizBottomBar.classList.remove("hidden");
    displayCurrentQuestion();
  });

  els.btnDoneQuiz.addEventListener("click", () => goBack("player"));
}

function registerServiceWorker() {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => {
      navigator.serviceWorker.register("./sw.js").catch(() => {});
    });
  }
}

function init() {
  history.replaceState({ screen: "subjects" }, "", "#subjects");
  setupIosInstallBanner();
  wireEvents();
  registerServiceWorker();
  loadSubjects(false);
}

init();
