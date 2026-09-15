const DAYS = { Mon: "星期一", Tue: "星期二", Wed: "星期三", Thu: "星期四", Fri: "星期五" };
const CHINESE_PERIODS = { "一": 1, "二": 2, "三": 3, "四": 4, "五": 5, "六": 6, "七": 7, "八": 8, "九": 9 };

const form = document.querySelector("#classroom-query-form");
const submitButton = form.querySelector('button[type="submit"]');
const status = document.querySelector("#classroom-data-status");
const result = document.querySelector("#classroom-result");
const todayReminder = document.querySelector("#today-reminder");
const classroomInput = document.querySelector("#classroom-input");
const suggestions = document.querySelector("#classroom-suggestions");
const directoryBody = document.querySelector("#room-directory-body");
let classroomData;

function setTodayReminder() {
  const today = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][new Date().getDay()];
  if (!DAYS[today]) {
    const label = today === "Sat" ? "星期六" : "星期日";
    todayReminder.innerHTML = `今天是<strong>${label}</strong>，請手動選擇上課日。`;
    return;
  }
  form.querySelector("#classroom-day-select").value = today;
  todayReminder.innerHTML = `今天是<strong>${DAYS[today]}</strong>，已自動選取。`;
}

function escapeHtml(value) {
  return String(value).replace(/[&<>'"]/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "'": "&#39;", '"': "&quot;" }[character]));
}

function searchKey(value) {
  return String(value).replace(/[\s._()\-]/g, "").toUpperCase();
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
    <p class="result-note">請檢查課室、時間或節次後再試一次。</p>
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

function matchingRooms(value, exact = false) {
  const key = searchKey(value);
  if (!key) return [];
  return classroomData.classrooms.filter((room) => room.aliases.some((alias) => {
    const aliasKey = searchKey(alias);
    return exact ? aliasKey === key : aliasKey.startsWith(key);
  }));
}

function renderSuggestions() {
  if (!classroomData) return;
  const rooms = matchingRooms(classroomInput.value).slice(0, 8);
  suggestions.hidden = rooms.length === 0;
  suggestions.innerHTML = rooms.map((room) => {
    const aliases = room.aliases.filter((alias) => alias !== room.classroom_code && alias !== room.classroom_id).join("／");
    return `<li role="option"><button type="button" data-room="${escapeHtml(room.classroom_id)}"><strong>${escapeHtml(room.classroom_code)}</strong><span>${escapeHtml(room.display_name)}${aliases ? ` · ${escapeHtml(aliases)}` : ""}</span></button></li>`;
  }).join("");
}

function renderDirectory() {
  directoryBody.innerHTML = classroomData.classrooms.map((room) => {
    const aliases = room.aliases.filter((alias) => alias !== room.classroom_code && alias !== room.classroom_id).join("／") || "—";
    return `<tr><td>${escapeHtml(room.classroom_code)}</td><td>${escapeHtml(room.display_name)}</td><td>${escapeHtml(aliases)}</td></tr>`;
  }).join("");
}

function search(event) {
  event.preventDefault();
  if (!classroomData) return;
  const values = new FormData(form);
  const season = String(values.get("season"));
  const day = String(values.get("day"));
  const schedule = classroomData.schedules[season];
  const parsed = parsePeriod(String(values.get("timeOrPeriod")), schedule);
  const rooms = matchingRooms(String(values.get("classroom")), true);

  if (rooms.length !== 1 || !DAYS[day] || !parsed) {
    errorResult();
    return;
  }
  const room = rooms[0];
  if (parsed.pause) {
    showResult(`<p class="result-label">${schedule.label} · ${escapeHtml(room.display_name)} · ${DAYS[day]} · ${parsed.time}</p><h2 class="result-title">目前是 ${parsed.pause.kind}</h2><p class="result-note">${parsed.pause.start}–${parsed.pause.end}，此時段沒有課堂。</p>`, "break");
    return;
  }
  if (parsed.outside) {
    showResult(`<p class="result-label">${schedule.label} · ${escapeHtml(room.display_name)} · ${DAYS[day]} · ${parsed.time}</p><h2 class="result-title">目前是非上課時段</h2><p class="result-note">請輸入上課時間、休息時間，或直接輸入第 1–9 節。</p>`, "break");
    return;
  }
  const entry = classroomData.entries.find((item) => item.classroom_id === room.classroom_id && item.day === day && item.period === parsed.period);
  const periodTime = schedule.periods.find((item) => item.period === parsed.period);
  if (!entry || !periodTime) {
    errorResult();
    return;
  }
  if (entry.status === "empty") {
    showResult(`<p class="result-label">${schedule.label} · ${escapeHtml(room.display_name)} · ${DAYS[day]}</p><h2 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h2><p class="result-note">此課室沒有班別上課。</p>`, "break");
    return;
  }
  showResult(`
    <p class="result-label">${schedule.label} · ${escapeHtml(room.display_name)} · ${DAYS[day]}</p>
    <h2 class="result-title">第 ${parsed.period} 節 · ${periodTime.start}–${periodTime.end}</h2>
    <div class="detail-grid">
      <div class="detail"><span>班別</span><strong>${escapeHtml(entry.classes)}</strong></div>
      <div class="detail"><span>教師</span><strong>${escapeHtml(entry.teachers)}</strong></div>
      <div class="detail"><span>課堂</span><strong>${escapeHtml(entry.subject)}</strong></div>
    </div>
    <p class="result-note">PDF 來源：第 ${entry.source_page} 頁 · 原格跨第 ${entry.period_span[0]}–${entry.period_span[1]} 節</p>
  `);
}

async function loadData() {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch("./classroom-timetable-data.json", { cache: "no-store", signal: controller.signal });
    if (!response.ok) throw new Error("classroom data load failed");
    classroomData = await response.json();
    renderDirectory();
    status.textContent = `已載入 ${classroomData.entries.length.toLocaleString()} 個已核對課室時段資料。`;
    submitButton.disabled = false;
  } catch {
    status.textContent = "未能載入課室資料，請確認本機網站伺服器正在執行。";
    showResult("<h2 class=\"result-title\">未能載入課室資料</h2>", "error");
  } finally {
    window.clearTimeout(timeout);
  }
}

classroomInput.addEventListener("input", renderSuggestions);
classroomInput.addEventListener("focus", renderSuggestions);
suggestions.addEventListener("click", (event) => {
  const button = event.target.closest("button[data-room]");
  if (!button) return;
  classroomInput.value = button.dataset.room;
  suggestions.hidden = true;
  classroomInput.focus();
});
document.addEventListener("click", (event) => {
  if (!event.target.closest(".suggestion-field")) suggestions.hidden = true;
});
form.addEventListener("submit", search);
submitButton.disabled = true;
setTodayReminder();
loadData();
