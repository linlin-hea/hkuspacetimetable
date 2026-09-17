const DAYS = { Mon: "星期一", Tue: "星期二", Wed: "星期三", Thu: "星期四", Fri: "星期五" };
const CHINESE_PERIODS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const PAUSE_NAMES = { "1st Recess": "第一個小息", "2nd Recess": "第二個小息", "3rd Recess": "第三個小息", Lunch: "午膳" };
const SEASON_STORAGE_KEY = "cwgc-selected-season";
const SUMMER_AUTO_DATE_KEY = "cwgc-summer-auto-date";

const seasonChoice = document.querySelector("#season-choice");
const daySelect = document.querySelector("#combined-day-select");
const todayReminder = document.querySelector("#today-reminder");
const status = document.querySelector("#combined-data-status");
const classForm = document.querySelector("#combined-class-form");
const teacherForm = document.querySelector("#combined-teacher-form");
const classResult = document.querySelector("#combined-class-result");
const teacherResult = document.querySelector("#combined-teacher-result");
const teacherCodes = document.querySelector("#combined-teacher-codes");
let timetable;
let classDirectory;
let teacherData;
let teacherDirectory;

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function saveSeason(season) {
  try {
    localStorage.setItem(SEASON_STORAGE_KEY, season);
  } catch {
    // 儲存空間不可用時仍可正常使用本頁查詢。
  }
}

function savedSeason() {
  try {
    const season = localStorage.getItem(SEASON_STORAGE_KEY);
    return season === "winter" || season === "summer" ? season : null;
  } catch {
    return null;
  }
}

function todayKey() {
  const date = new Date();
  return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
}

function summerWasAutoSetToday() {
  try {
    return localStorage.getItem(SUMMER_AUTO_DATE_KEY) === todayKey();
  } catch {
    return false;
  }
}

function markSummerAutoSetToday() {
  try {
    localStorage.setItem(SUMMER_AUTO_DATE_KEY, todayKey());
  } catch {
    // 儲存空間不可用時仍可正常使用本頁查詢。
  }
}

function setSeason(season) {
  const option = seasonChoice.querySelector(`input[name="season"][value="${season}"]`);
  if (option) option.checked = true;
}

function selectedSeason() {
  return seasonChoice.querySelector('input[name="season"]:checked').value;
}

function setTodayReminder() {
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  if (!DAYS[today]) {
    const label = today === "Sat" ? "星期六" : "星期日";
    todayReminder.innerHTML = `今天是<strong>${label}</strong>，請手動選擇上課日。`;
    return;
  }
  daySelect.value = today;
  if (today === "Wed" && !summerWasAutoSetToday()) {
    setSeason("summer");
    saveSeason("summer");
    markSummerAutoSetToday();
    todayReminder.innerHTML = `今天是<strong>星期三</strong>，走<strong>夏令時間</strong>，已自動設定。`;
    return;
  }
  const season = savedSeason();
  if (season) setSeason(season);
  if (today === "Wed") {
    todayReminder.innerHTML = `今天是<strong>星期三</strong>，已保留你選擇的時間制度。`;
    return;
  }
  todayReminder.innerHTML = `今天是<strong>${DAYS[today]}</strong>，已自動選取。`;
}

function displayClassRooms(rooms) {
  return rooms.split(",").map((room) => /^\d+$/.test(room) ? `${room}室` : room).join("、");
}

function displayTeacherRooms(rooms) {
  return rooms.split("/").map((room) => /^\d+$/.test(room) ? `${room}室` : room).join("、");
}

function showResult(element, content, state = "") {
  element.hidden = false;
  element.className = `result-panel ${state}`.trim();
  element.innerHTML = content;
}

function errorResult(element, type) {
  showResult(element, `
    <p class="result-label">無法搜尋</p>
    <h3 class="result-title">輸入錯誤資料無法搜索</h3>
    <p class="result-note">請檢查${type}、時間或節次後再試一次。</p>
  `, "error");
}

function parseClassPeriod(value, schedule) {
  const text = value.trim().replaceAll(" ", "");
  if (/^[1-9]$/.test(text)) return { period: Number(text) };
  const chinese = text.match(/^第?([一二三四五六七八九])節?$/);
  if (chinese) return { period: CHINESE_PERIODS[chinese[1]] };
  const time = text.match(/^(\d{1,2}):?(\d{2})$/);
  if (!time) return null;
  const hour = Number(time[1]);
  const minute = Number(time[2]);
  if (hour > 23 || minute > 59) return null;
  const normalized = `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
  const lesson = schedule.periods.find((item) => item.start <= normalized && normalized < item.end);
  if (lesson) return { period: lesson.period, time: normalized };
  const pause = schedule.non_lesson_periods.find((item) => item.start <= normalized && normalized < item.end);
  return pause ? { pause, time: normalized } : { outside: true, time: normalized };
}

function parseTeacherPeriod(value, schedule) {
  const parsed = parseClassPeriod(value, schedule);
  if (!parsed || parsed.period || parsed.pause) return parsed;
  const firstStart = schedule.periods[0].start;
  const lastEnd = schedule.periods[schedule.periods.length - 1].end;
  return parsed.time >= firstStart && parsed.time < lastEnd ? { transition: true, time: parsed.time } : parsed;
}

function classProfileBlock(className) {
  const profile = classDirectory.classes[className];
  const formCoordinators = classDirectory.forms[className[0]];
  const coordinatorItems = Object.entries(formCoordinators).map(([role, teachers]) => `
    <div>
      <span>${escapeHtml(role)}：</span>
      <ol class="teacher-name-list">${teachers.map((teacher) => `<li>${escapeHtml(teacher)}</li>`).join("")}</ol>
    </div>
  `).join("");
  return `
    <section class="class-profile" aria-label="${escapeHtml(className)} 班別資料">
      <p class="profile-label">班別資料</p>
      <div class="class-profile-grid">
        <div><span>班別：</span><strong>${escapeHtml(className)}</strong></div>
        <div><span>班課室：</span><strong>${escapeHtml(profile.room)}室</strong></div>
        <div class="class-teacher-detail"><span>班主任：</span><strong>${profile.class_teachers.map(escapeHtml).join("、")}</strong></div>
      </div>
      <p class="coordinator-heading">級別統籌</p>
      <div class="coordinator-grid">${coordinatorItems}</div>
    </section>
  `;
}

function classDailyLessonsBlock(className, day, schedule, highlightPeriod) {
  const entries = timetable.entries.filter((item) => item.class === className && item.day === day).sort((a, b) => a.period - b.period);
  const rows = entries.map((entry) => {
    const periodTime = schedule.periods.find((item) => item.period === entry.period);
    const highlight = entry.period === highlightPeriod ? " daily-lessons__current" : "";
    return `<li class="${highlight.trim()}"><strong>第 ${entry.period} 節 · ${periodTime.start}–${periodTime.end}</strong><p><span>課堂</span>${escapeHtml(entry.subject)}</p><p><span>教師</span>${escapeHtml(entry.teachers)}</p><p><span>課室</span>${escapeHtml(displayClassRooms(entry.rooms))}</p></li>`;
  }).join("");
  return `<section class="daily-lessons" aria-label="${escapeHtml(className)} ${DAYS[day]} 時間表"><h3>${escapeHtml(className)} · ${DAYS[day]} 的時間表</h3><ul>${rows}</ul></section>`;
}

function searchClass(event) {
  event.preventDefault();
  if (!timetable || !classDirectory) return;
  const values = new FormData(classForm);
  const className = String(values.get("className")).trim().toUpperCase();
  const timeOrPeriod = String(values.get("timeOrPeriod")).trim();
  const day = daySelect.value;
  const schedule = timetable.schedules[selectedSeason()];
  const parsed = timeOrPeriod ? parseClassPeriod(timeOrPeriod, schedule) : null;
  if (!/^[1-6][A-D]$/.test(className) || !classDirectory.classes[className] || !DAYS[day] || (timeOrPeriod && !parsed)) {
    errorResult(classResult, "班別");
    return;
  }
  if (!parsed) {
    showResult(classResult, `${classProfileBlock(className)}${classDailyLessonsBlock(className, day, schedule)}`);
    return;
  }
  if (parsed.pause || parsed.outside) {
    const title = parsed.pause ? `目前是 ${parsed.pause.kind}` : "目前是非上課時段";
    const note = parsed.pause ? `${parsed.pause.start}–${parsed.pause.end}，此時段沒有課堂。` : "請輸入上課時間、休息時間，或直接輸入第 1–9 節。";
    showResult(classResult, `${classProfileBlock(className)}<p class="result-label">${schedule.label} · ${DAYS[day]} · ${parsed.time}</p><h3 class="result-title">${title}</h3><p class="result-note">${note}</p>${classDailyLessonsBlock(className, day, schedule)}`, "break");
    return;
  }
  const entry = timetable.entries.find((item) => item.class === className && item.day === day && item.period === parsed.period);
  const periodTime = schedule.periods.find((item) => item.period === parsed.period);
  if (!entry || !periodTime) {
    errorResult(classResult, "班別");
    return;
  }
  showResult(classResult, `${classProfileBlock(className)}<p class="result-label">${schedule.label} · ${escapeHtml(className)} · ${DAYS[day]}</p><h3 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h3><div class="detail-grid"><div class="detail"><span>課堂</span><strong>${escapeHtml(entry.subject)}</strong></div><div class="detail"><span>教師</span><strong>${escapeHtml(entry.teachers)}</strong></div><div class="detail"><span>課室</span><strong>${escapeHtml(displayClassRooms(entry.rooms))}</strong></div></div><p class="result-note">PDF 來源：第 ${entry.source_page} 頁 · 原格跨第 ${entry.period_span[0]}–${entry.period_span[1]} 節</p>${classDailyLessonsBlock(className, day, schedule, parsed.period)}`);
}

function teacherProfileBlock(teacher) {
  const profile = teacherDirectory.teachers[teacher];
  return `<section class="teacher-profile" aria-label="教師資料"><p class="profile-label">教師資料</p><div class="teacher-profile-grid"><div><span>教師代碼：</span><strong>${escapeHtml(teacher)}</strong></div><div><span>中文姓名：</span><strong>${escapeHtml(profile.chinese_name || "未提供")}</strong></div><div><span>英文姓名：</span><strong>${escapeHtml(profile.english_name)}</strong></div><div><span>教員室座位：</span><strong>${escapeHtml(profile.seat)}</strong></div></div></section>`;
}

function teacherPeriodLabel(span) {
  return span[0] === span[1] ? `第 ${span[0]} 節` : `第 ${span[0]}–${span[1]} 節`;
}

function teacherDailyLessonsBlock(teacher, day, schedule) {
  const rendered = new Set();
  const rows = teacherData.entries
    .filter((item) => item.teacher === teacher && item.day === day && item.status === "lesson")
    .filter((item) => {
      const key = `${item.period_span.join("-")}|${item.subject}|${item.classes}|${item.rooms}`;
      if (rendered.has(key)) return false;
      rendered.add(key);
      return true;
    })
    .sort((a, b) => a.period_span[0] - b.period_span[0])
    .map((item) => {
      const start = schedule.periods.find((period) => period.period === item.period_span[0]).start;
      const end = schedule.periods.find((period) => period.period === item.period_span[1]).end;
      return `<li><strong>${teacherPeriodLabel(item.period_span)} · ${start}–${end}</strong><p><span>科目：</span>${escapeHtml(item.subject)}</p><p><span>班別：</span>${escapeHtml(item.classes || "未列明")}</p><p><span>課室：</span>${escapeHtml(displayTeacherRooms(item.rooms))}</p></li>`;
    }).join("");
  return `<section class="daily-lessons daily-lessons--comparison" aria-label="${escapeHtml(teacher)} ${DAYS[day]} 授課節次"><h3>${escapeHtml(teacher)} 在${DAYS[day]}的授課節次</h3><ul>${rows || "<li>當天沒有已排定課堂。</li>"}</ul></section>`;
}

function showTeacherResult(content, state = "") {
  showResult(teacherResult, content, state);
}

function searchTeacher(event) {
  event.preventDefault();
  if (!teacherData || !teacherDirectory) return;
  const values = new FormData(teacherForm);
  const teacher = String(values.get("teacher")).trim().toUpperCase();
  const timeOrPeriod = String(values.get("timeOrPeriod")).trim();
  const day = daySelect.value;
  const schedule = teacherData.schedules[selectedSeason()];
  if (!teacherData.teachers.includes(teacher) || !DAYS[day]) {
    errorResult(teacherResult, "教師代碼");
    return;
  }
  if (!timeOrPeriod) {
    showTeacherResult(`${teacherProfileBlock(teacher)}<p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p><h3 class="result-title">${escapeHtml(teacher)} 當天的授課節次</h3><p class="result-note">未輸入時間或節次，以下列出當天所有已排定課堂。</p>${teacherDailyLessonsBlock(teacher, day, schedule)}`);
    return;
  }
  const parsed = parseTeacherPeriod(timeOrPeriod, schedule);
  if (!parsed || parsed.outside) {
    errorResult(teacherResult, "教師代碼");
    return;
  }
  if (parsed.pause || parsed.transition) {
    const title = parsed.pause ? `目前是 ${PAUSE_NAMES[parsed.pause.kind] || parsed.pause.kind}` : "目前沒有課堂安排";
    const note = parsed.pause ? `${parsed.pause.start}–${parsed.pause.end}，目前沒有課堂。` : "此時間位於課節與休息時段之間。";
    showTeacherResult(`${teacherProfileBlock(teacher)}<p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]} · ${parsed.time}</p><h3 class="result-title">${title}</h3><p class="result-note">${note}</p>${teacherDailyLessonsBlock(teacher, day, schedule)}`, "break");
    return;
  }
  const entry = teacherData.entries.find((item) => item.teacher === teacher && item.day === day && item.period === parsed.period);
  const periodTime = schedule.periods.find((item) => item.period === parsed.period);
  if (!entry || !periodTime) {
    errorResult(teacherResult, "教師代碼");
    return;
  }
  if (entry.status === "empty") {
    showTeacherResult(`${teacherProfileBlock(teacher)}<p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p><h3 class="result-title">${escapeHtml(teacher)} 目前是空堂</h3><p class="result-note">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</p>${teacherDailyLessonsBlock(teacher, day, schedule)}`, "break");
    return;
  }
  showTeacherResult(`${teacherProfileBlock(teacher)}<p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p><h3 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h3><div class="detail-grid"><div class="detail"><span>課堂</span><strong>${escapeHtml(entry.subject)}</strong></div><div class="detail"><span>班別</span><strong>${escapeHtml(entry.classes || "未列明")}</strong></div><div class="detail"><span>課室</span><strong>${escapeHtml(displayTeacherRooms(entry.rooms))}</strong></div></div><p class="result-note">合作教師：${escapeHtml(entry.teachers)} · PDF 來源：第 ${entry.source_page} 頁 · 原格跨第 ${entry.period_span[0]}–${entry.period_span[1]} 節</p>${teacherDailyLessonsBlock(teacher, day, schedule)}`);
}

async function loadData() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const [timetableResponse, classDirectoryResponse, teacherResponse, teacherDirectoryResponse] = await Promise.all([
      fetch("./timetable-data.json", { cache: "no-store", signal: controller.signal }),
      fetch("./class-directory.json", { cache: "no-store", signal: controller.signal }),
      fetch("./teacher-timetable-data.json", { cache: "no-store", signal: controller.signal }),
      fetch("./teacher-directory.json", { cache: "no-store", signal: controller.signal }),
    ]);
    if (!timetableResponse.ok || !classDirectoryResponse.ok || !teacherResponse.ok || !teacherDirectoryResponse.ok) throw new Error("data load failed");
    [timetable, classDirectory, teacherData, teacherDirectory] = await Promise.all([timetableResponse.json(), classDirectoryResponse.json(), teacherResponse.json(), teacherDirectoryResponse.json()]);
    teacherCodes.innerHTML = teacherData.teachers.map((teacher) => `<option value="${escapeHtml(teacher)}"></option>`).join("");
    status.textContent = `已載入班別及教師課表資料。`;
    classForm.querySelector("button").disabled = false;
    teacherForm.querySelector("button").disabled = false;
  } catch {
    status.textContent = "未能載入課表資料，請確認本機網站伺服器正在執行。";
  } finally {
    window.clearTimeout(timeout);
  }
}

seasonChoice.addEventListener("change", (event) => {
  if (event.target.name === "season") saveSeason(event.target.value);
});
classForm.addEventListener("submit", searchClass);
teacherForm.addEventListener("submit", searchTeacher);
classForm.querySelector("button").disabled = true;
teacherForm.querySelector("button").disabled = true;
setTodayReminder();
loadData();
