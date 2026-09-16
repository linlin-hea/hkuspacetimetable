const DAYS = { Mon: "星期一", Tue: "星期二", Wed: "星期三", Thu: "星期四", Fri: "星期五" };
const CHINESE_PERIODS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };
const SEASON_STORAGE_KEY = "cwgc-selected-season";
const SUMMER_AUTO_DATE_KEY = "cwgc-summer-auto-date";

const form = document.querySelector("#query-form");
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector("#data-status");
const result = document.querySelector("#result");
const todayReminder = document.querySelector("#today-reminder");
let timetable;
let classDirectory;

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
  const option = form.querySelector(`input[name="season"][value="${season}"]`);
  if (option) option.checked = true;
}

function setTodayReminder() {
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  if (!DAYS[today]) {
    const label = today === "Sat" ? "星期六" : "星期日";
    todayReminder.innerHTML = `今天是<strong>${label}</strong>，請手動選擇上課日。`;
    return;
  }
  form.querySelector("#day-select").value = today;
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

function displayRooms(rooms) {
  return rooms.split(",").map((room) => /^\d+$/.test(room) ? `${room}室` : room).join("、");
}

function classProfileBlock(className) {
  const profile = classDirectory.classes[className];
  const formCoordinators = classDirectory.forms[className[0]];
  const coordinatorItems = Object.entries(formCoordinators).map(([role, teachers]) => `
    <div>
      <span>${role}：</span>
      <ol class="teacher-name-list">${teachers.map((teacher) => `<li>${teacher}</li>`).join("")}</ol>
    </div>
  `).join("");

  return `
    <section class="class-profile" aria-label="${className} 班別資料">
      <p class="profile-label">班別資料</p>
      <div class="class-profile-grid">
        <div><span>班別：</span><strong>${className}</strong></div>
        <div><span>班課室：</span><strong>${profile.room}室</strong></div>
        <div class="class-teacher-detail"><span>班主任：</span><strong>${profile.class_teachers.join("、")}</strong></div>
      </div>
      <p class="coordinator-heading">級別統籌</p>
      <div class="coordinator-grid">${coordinatorItems}</div>
    </section>
  `;
}

function dailyLessonsBlock(className, day, schedule, highlightPeriod) {
  const entries = timetable.entries
    .filter((item) => item.class === className && item.day === day)
    .sort((a, b) => a.period - b.period);
  const rows = entries.map((entry) => {
    const periodTime = schedule.periods.find((item) => item.period === entry.period);
    const highlight = entry.period === highlightPeriod ? " daily-lessons__current" : "";
    return `
      <li class="${highlight.trim()}">
        <strong>第 ${entry.period} 節 · ${periodTime.start}–${periodTime.end}</strong>
        <p><span>課堂</span>${entry.subject}</p>
        <p><span>教師</span>${entry.teachers}</p>
        <p><span>課室</span>${displayRooms(entry.rooms)}</p>
      </li>
    `;
  }).join("");
  return `
    <section class="daily-lessons" aria-label="${className} ${DAYS[day]} 時間表">
      <h3>${className} · ${DAYS[day]} 的時間表</h3>
      <ul>${rows}</ul>
    </section>
  `;
}

function showResult(content, state = "") {
  result.hidden = false;
  result.className = `result-panel ${state}`.trim();
  result.innerHTML = content;
}

function errorResult() {
  showResult(`
    <p class="result-label">無法搜尋</p>
    <h2 class="result-title">輸入錯誤資料無法搜索</h2>
    <p class="result-note">請檢查班別、時間或節次後再試一次。</p>
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
  const lesson = schedule.periods.find((item) => item.start <= normalized && normalized < item.end);
  if (lesson) return { period: lesson.period, time: normalized };
  const pause = schedule.non_lesson_periods.find((item) => item.start <= normalized && normalized < item.end);
  return pause ? { pause, time: normalized } : { outside: true, time: normalized };
}

function search(event) {
  event.preventDefault();
  if (!timetable) return;

  const values = new FormData(form);
  const className = String(values.get("className")).trim().toUpperCase();
  const day = String(values.get("day"));
  const season = String(values.get("season"));
  const schedule = timetable.schedules[season];
  const timeOrPeriod = String(values.get("timeOrPeriod")).trim();
  const parsed = timeOrPeriod ? parsePeriod(timeOrPeriod, schedule) : null;

  if (!/^[1-6][A-D]$/.test(className) || !DAYS[day] || !classDirectory.classes[className] || !timetable.entries.some((entry) => entry.class === className) || (timeOrPeriod && !parsed)) {
    errorResult();
    return;
  }

  if (!parsed) {
    showResult(`${classProfileBlock(className)}${dailyLessonsBlock(className, day, schedule)}`);
    return;
  }

  if (parsed.pause) {
    showResult(`${classProfileBlock(className)}
      <p class="result-label">${schedule.label} · ${DAYS[day]} · ${parsed.time}</p>
      <h2 class="result-title">目前是 ${parsed.pause.kind}</h2>
      <p class="result-note">${parsed.pause.start}–${parsed.pause.end}，此時段沒有課堂。</p>
      ${dailyLessonsBlock(className, day, schedule)}
    `, "break");
    return;
  }

  if (parsed.outside) {
    showResult(`${classProfileBlock(className)}
      <p class="result-label">${schedule.label} · ${DAYS[day]} · ${parsed.time}</p>
      <h2 class="result-title">目前是非上課時段</h2>
      <p class="result-note">請輸入上課時間、休息時間，或直接輸入第 1–9 節。</p>
      ${dailyLessonsBlock(className, day, schedule)}
    `, "break");
    return;
  }

  const entry = timetable.entries.find((item) => item.class === className && item.day === day && item.period === parsed.period);
  if (!entry) {
    errorResult();
    return;
  }
  const periodTime = schedule.periods.find((item) => item.period === parsed.period);
  showResult(`${classProfileBlock(className)}
    <p class="result-label">${schedule.label} · ${className} · ${DAYS[day]}</p>
    <h2 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h2>
    <div class="detail-grid">
      <div class="detail"><span>課堂</span><strong>${entry.subject}</strong></div>
      <div class="detail"><span>教師</span><strong>${entry.teachers}</strong></div>
      <div class="detail"><span>課室</span><strong>${displayRooms(entry.rooms)}</strong></div>
    </div>
    <p class="result-note">PDF 來源：第 ${entry.source_page} 頁 · 原格跨第 ${entry.period_span[0]}–${entry.period_span[1]} 節</p>
    ${dailyLessonsBlock(className, day, schedule, parsed.period)}
  `);
}

async function loadData() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const [timetableResponse, directoryResponse] = await Promise.all([
      fetch("./timetable-data.json", {
        cache: "no-store",
        signal: controller.signal,
      }),
      fetch("./class-directory.json", {
        cache: "no-store",
        signal: controller.signal,
      }),
    ]);
    if (!timetableResponse.ok || !directoryResponse.ok) throw new Error("data load failed");
    timetable = await timetableResponse.json();
    classDirectory = await directoryResponse.json();
    status.textContent = `已載入 ${timetable.entries.length.toLocaleString()} 筆已核對課表資料。`;
    submitButton.disabled = false;
  } catch {
    status.textContent = "未能載入課表資料，請確認本機網站伺服器正在執行。";
    showResult("<h2 class=\"result-title\">未能載入課表資料</h2>", "error");
  } finally {
    window.clearTimeout(timeout);
  }
}

form.addEventListener("submit", search);
form.addEventListener("change", (event) => {
  if (event.target.name === "season") saveSeason(event.target.value);
});
submitButton.disabled = true;
setTodayReminder();
loadData();
