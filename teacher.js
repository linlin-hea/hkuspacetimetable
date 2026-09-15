const DAYS = { Mon: "星期一", Tue: "星期二", Wed: "星期三", Thu: "星期四", Fri: "星期五" };
const CHINESE_PERIODS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const PAUSE_NAMES = { "1st Recess": "第一個小息", "2nd Recess": "第二個小息", "3rd Recess": "第三個小息", Lunch: "午膳" };

const form = document.querySelector("#teacher-query-form");
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector("#teacher-data-status");
const result = document.querySelector("#teacher-result");
const teacherInput = document.querySelector("#teacher-input");
const suggestions = document.querySelector("#teacher-suggestions");
const todayReminder = document.querySelector("#today-reminder");
let teacherData;
let teacherDirectory;

function setTodayReminder() {
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  if (!DAYS[today]) {
    const label = today === "Sat" ? "星期六" : "星期日";
    todayReminder.innerHTML = `今天是<strong>${label}</strong>，請手動選擇上課日。`;
    return;
  }
  form.querySelector("#teacher-day-select").value = today;
  todayReminder.innerHTML = `今天是<strong>${DAYS[today]}</strong>，已自動選取。`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function displayRooms(rooms) {
  return rooms.split("/").map((room) => /^\d+$/.test(room) ? `${room}室` : room).join("、");
}

function pauseName(pause) {
  return PAUSE_NAMES[pause.kind] || pause.kind;
}

function periodLabel(span) {
  return span[0] === span[1] ? `第 ${span[0]} 節` : `第 ${span[0]}–${span[1]} 節`;
}

function showResult(content, state = "") {
  result.hidden = false;
  result.className = `result-panel ${state}`.trim();
  result.innerHTML = content;
}

function teacherProfileBlock(teacher) {
  const profile = teacherDirectory.teachers[teacher];
  const chineseName = profile.chinese_name || "未提供";
  return `
    <section class="teacher-profile" aria-label="教師資料">
      <p class="profile-label">教師資料</p>
      <div class="teacher-profile-grid">
        <div><span>教師代碼：</span><strong>${escapeHtml(teacher)}</strong></div>
        <div><span>中文姓名：</span><strong>${escapeHtml(chineseName)}</strong></div>
        <div><span>英文姓名：</span><strong>${escapeHtml(profile.english_name)}</strong></div>
        <div><span>教員室座位：</span><strong>${escapeHtml(profile.seat)}</strong></div>
      </div>
    </section>
  `;
}

function showTeacherResult(teacher, content, state = "") {
  showResult(`${teacherProfileBlock(teacher)}${content}`, state);
}

function errorResult() {
  showResult(`
    <p class="result-label">無法搜尋</p>
    <h2 class="result-title">輸入錯誤資料無法搜索</h2>
    <p class="result-note">請檢查教師代碼、時間或節次後再試一次。</p>
  `, "error");
}

function parsePeriod(value, schedule) {
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
  const firstStart = schedule.periods[0].start;
  const lastEnd = schedule.periods[schedule.periods.length - 1].end;
  if (normalized < firstStart || normalized >= lastEnd) return { outside: true, time: normalized };
  const lesson = schedule.periods.find((item) => item.start <= normalized && normalized < item.end);
  if (lesson) return { period: lesson.period, time: normalized };
  const pause = schedule.non_lesson_periods.find((item) => item.start <= normalized && normalized < item.end);
  if (pause) return { pause, time: normalized };
  return { transition: true, time: normalized };
}

function renderSuggestions() {
  if (!teacherData) return;
  const prefix = teacherInput.value.trim().toUpperCase();
  const matches = prefix ? teacherData.teachers.filter((teacher) => teacher.startsWith(prefix)).slice(0, 10) : [];
  suggestions.hidden = matches.length === 0;
  suggestions.innerHTML = matches.map((teacher) => (
    `<li role="option"><button type="button" data-teacher="${escapeHtml(teacher)}"><strong>${escapeHtml(teacher)}</strong></button></li>`
  )).join("");
}

function dailyLessons(teacher, day, schedule) {
  const rendered = new Set();
  return teacherData.entries
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
      return `
        <li>
          <strong>${periodLabel(item.period_span)} · ${start}–${end}</strong>
          <p><span>科目：</span>${escapeHtml(item.subject)}</p>
          <p><span>班別：</span>${escapeHtml(item.classes || "未列明")}</p>
          <p><span>課室：</span>${escapeHtml(displayRooms(item.rooms))}</p>
        </li>
      `;
    }).join("");
}

function referenceBlock(teacher, day, schedule, variant = "daily") {
  return `<div class="daily-lessons daily-lessons--${variant}"><h3>${escapeHtml(teacher)} 在${DAYS[day]}的授課節次</h3><ul>${dailyLessons(teacher, day, schedule) || "<li>當天沒有已排定課堂。</li>"}</ul></div>`;
}

function search(event) {
  event.preventDefault();
  if (!teacherData) return;
  const values = new FormData(form);
  const teacher = String(values.get("teacher")).trim().toUpperCase();
  const day = String(values.get("day"));
  const season = String(values.get("season"));
  const schedule = teacherData.schedules[season];
  const timeOrPeriod = String(values.get("timeOrPeriod")).trim();

  if (!teacherData.teachers.includes(teacher) || !DAYS[day]) {
    errorResult();
    return;
  }
  if (!timeOrPeriod) {
    showTeacherResult(teacher, `
      <p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p>
      <h2 class="result-title">${escapeHtml(teacher)} 當天的授課節次</h2>
      <p class="result-note">未輸入時間或節次，以下列出當天所有已排定課堂。</p>
      ${referenceBlock(teacher, day, schedule)}
    `);
    return;
  }

  const parsed = parsePeriod(timeOrPeriod, schedule);
  if (!parsed || parsed.outside) {
    errorResult();
    return;
  }
  if (parsed.pause) {
    showTeacherResult(teacher, `
      <p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]} · ${parsed.time}</p>
      <h2 class="result-title">目前是 ${pauseName(parsed.pause)}</h2>
      <p class="result-note">${parsed.pause.start}–${parsed.pause.end}，目前沒有課堂。</p>
      ${referenceBlock(teacher, day, schedule, "comparison")}
    `, "break");
    return;
  }
  if (parsed.transition) {
    showTeacherResult(teacher, `
      <p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]} · ${parsed.time}</p>
      <h2 class="result-title">目前沒有課堂安排</h2>
      <p class="result-note">此時間位於課節與休息時段之間。</p>
      ${referenceBlock(teacher, day, schedule, "comparison")}
    `, "break");
    return;
  }

  const entry = teacherData.entries.find((item) => item.teacher === teacher && item.day === day && item.period === parsed.period);
  const periodTime = schedule.periods.find((item) => item.period === parsed.period);
  if (!entry || !periodTime) {
    errorResult();
    return;
  }
  if (entry.status === "empty") {
    showTeacherResult(teacher, `
      <p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p>
      <h2 class="result-title">${escapeHtml(teacher)} 目前是空堂</h2>
      <p class="result-note">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</p>
      ${referenceBlock(teacher, day, schedule, "comparison")}
    `, "break");
    return;
  }
  showTeacherResult(teacher, `
    <p class="result-label">${schedule.label} · ${escapeHtml(teacher)} · ${DAYS[day]}</p>
    <h2 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h2>
    <div class="detail-grid">
      <div class="detail"><span>課堂</span><strong>${escapeHtml(entry.subject)}</strong></div>
      <div class="detail"><span>班別</span><strong>${escapeHtml(entry.classes || "未列明")}</strong></div>
      <div class="detail"><span>課室</span><strong>${escapeHtml(displayRooms(entry.rooms))}</strong></div>
    </div>
    <p class="result-note">合作教師：${escapeHtml(entry.teachers)} · PDF 來源：第 ${entry.source_page} 頁 · 原格跨第 ${entry.period_span[0]}–${entry.period_span[1]} 節</p>
    ${referenceBlock(teacher, day, schedule, "comparison")}
  `);
}

async function loadData() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const [response, directoryResponse] = await Promise.all([
      fetch("./teacher-timetable-data.json", { cache: "no-store", signal: controller.signal }),
      fetch("./teacher-directory.json", { cache: "no-store", signal: controller.signal }),
    ]);
    if (!response.ok || !directoryResponse.ok) throw new Error("teacher data load failed");
    [teacherData, teacherDirectory] = await Promise.all([response.json(), directoryResponse.json()]);
    status.textContent = `已載入 ${teacherData.entries.length.toLocaleString()} 個已核對教師時段資料。`;
    submitButton.disabled = false;
  } catch {
    status.textContent = "未能載入教師資料，請確認本機網站伺服器正在執行。";
    showResult("<h2 class=\"result-title\">未能載入教師資料</h2>", "error");
  } finally {
    window.clearTimeout(timeout);
  }
}

form.addEventListener("submit", search);
teacherInput.addEventListener("input", renderSuggestions);
teacherInput.addEventListener("focus", renderSuggestions);
suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-teacher]");
  if (!button) return;
  teacherInput.value = button.dataset.teacher;
  suggestions.hidden = true;
  teacherInput.focus();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".suggestion-field")) suggestions.hidden = true;
});
submitButton.disabled = true;
setTodayReminder();
loadData();
