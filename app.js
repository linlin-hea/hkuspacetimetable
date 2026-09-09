const DAYS = ['一', '二', '三', '四', '五', '六'];
const DAY_NAMES = {1:'週一',2:'週二',3:'週三',4:'週四',5:'週五',6:'週六'};
const CAMPUS_GROUPS = [
  new Set(['KEC', 'KED', 'KEE', 'KEK', 'CIT']),
  new Set(['ADC', 'UNC'])
];
const NON_MIXABLE_CLASS_TYPES = new Set(['AL', 'BL', 'CL']);
const TIME_START = 8 * 60 + 30;
const SLOT_HEIGHT = 108;

let dataset = [
  {code:'CCAH3003', no:'CL01', name:'The Process of Design', day:5, time:'14:30 - 15:50', room:'KEC201'},
  {code:'CCAH3003', no:'CL01', name:'The Process of Design', day:5, time:'16:00 - 17:20', room:'KEC201'},
  {code:'CCAH3003', no:'CL02', name:'The Process of Design', day:5, time:'10:00 - 11:20', room:'KEC201'},
  {code:'CCAH3003', no:'CL02', name:'The Process of Design', day:5, time:'11:30 - 12:50', room:'KEC201'},
  {code:'CCAH3003', no:'CL03', name:'The Process of Design', day:3, time:'08:30 - 09:50', room:'KEC201'},
  {code:'CCAH3003', no:'CL03', name:'The Process of Design', day:3, time:'10:00 - 11:20', room:'KEC201'},
  {code:'CCAH3003', no:'CL04', name:'The Process of Design', day:2, time:'08:30 - 09:50', room:'KEC201'},
  {code:'CCAH3003', no:'CL04', name:'The Process of Design', day:2, time:'10:00 - 11:20', room:'KEC201'},
  {code:'CCAH3003', no:'CL05', name:'The Process of Design', day:4, time:'10:00 - 11:20', room:'ADC302'},
  {code:'CCAH3003', no:'CL05', name:'The Process of Design', day:4, time:'11:30 - 12:50', room:'ADC302'},
  {code:'CCAH4005', no:'CL01', name:'Aesthetics: Art, Beauty, and Contemporary Life', day:6, time:'08:30 - 09:50', room:'KEK603'},
  {code:'CCAH4005', no:'CL01', name:'Aesthetics: Art, Beauty, and Contemporary Life', day:6, time:'10:00 - 11:20', room:'KEK603'},
  {code:'CCAH4005', no:'CL02', name:'Aesthetics: Art, Beauty, and Contemporary Life', day:1, time:'13:00 - 14:20', room:'KEK702'},
  {code:'CCAH4005', no:'CL02', name:'Aesthetics: Art, Beauty, and Contemporary Life', day:1, time:'14:30 - 15:50', room:'KEK702'},
  {code:'CCAH4012', no:'CL01', name:'Arts and Life - A Journey of Appreciation and Creation', day:6, time:'08:30 - 09:50', room:'KEC1002'},
  {code:'CCAH4012', no:'CL01', name:'Arts and Life - A Journey of Appreciation and Creation', day:6, time:'10:00 - 11:20', room:'KEC1002'}
];
let selected = [];
let alternativeKey = null;
let alternativeKeys = [];
let alternativeOriginalKey = null;
let currentUser = '';
try { currentUser = localStorage.getItem('spacePlannerCurrentUser') || ''; } catch { currentUser = ''; }
let savedPlans = [];
let editingPlanId = null;
let dataReady = false;
let remoteHydrated = false;
let authMode = 'login';
let isAdmin = false;

const $ = (id) => document.getElementById(id);
const uniqueClasses = () => [...new Map(dataset.map(item => [`${item.code}|${item.no}`, item])).values()];
const parseTime = (time) => { const [a,b] = time.split('-').map(v => v.trim()); const toMin = s => { const [h,m] = s.split(':').map(Number); return h*60+m; }; return {start:toMin(a), end:toMin(b)}; };
const campusOf = room => room.slice(0, 3).toUpperCase();
const classTypeOf = classNo => (classNo.match(/^[A-Z]+/) || [''])[0];
function normalizeDataset(items) { return (Array.isArray(items) ? items : []).filter(item => item && typeof item.code === 'string' && typeof item.no === 'string' && typeof item.name === 'string' && Number.isInteger(Number(item.day)) && Number(item.day) >= 1 && Number(item.day) <= 6 && typeof item.time === 'string' && /^\d{2}:\d{2} - \d{2}:\d{2}$/.test(item.time) && typeof item.room === 'string' && item.room.trim()).map(item => ({ code: item.code.trim().toUpperCase(), no: item.no.trim().toUpperCase(), name: item.name.trim(), day: Number(item.day), time: item.time.trim(), room: item.room.trim() })); }
function validPlans(value) { return Array.isArray(value) ? value.filter(plan => plan && typeof plan.id === 'string' && typeof plan.name === 'string' && Array.isArray(plan.selected) && typeof plan.originalKey === 'string' && typeof plan.replacementKey === 'string') : []; }
function userStorageKey(name) { return `spacePlannerUser:${encodeURIComponent(name.trim().toLowerCase())}`; }
function loadUserState(name, migrateLegacy = false) { try { const stored = localStorage.getItem(userStorageKey(name)); if (!stored && migrateLegacy && !localStorage.getItem('spacePlannerLegacyMigrated')) { const legacyPlans = validPlans(JSON.parse(localStorage.getItem('spacePlannerPlans') || '[]')); localStorage.setItem('spacePlannerLegacyMigrated', '1'); if (legacyPlans.length) return {selected: [], savedPlans: legacyPlans}; } const value = JSON.parse(stored || '{}'); return {selected: Array.isArray(value.selected) ? value.selected.filter(key => typeof key === 'string') : [], savedPlans: validPlans(value.savedPlans)}; } catch { return {selected: [], savedPlans: []}; } }
function syncUserState() { if (!currentUser || !remoteHydrated) return; fetch('/api/profile', {method:'PUT', headers:{'Content-Type':'application/json'}, body:JSON.stringify({selected, savedPlans})}).then(response => { if (response.status === 401) throw new Error('session expired'); if (!response.ok) throw new Error('sync failed'); }).catch(() => toast('伺服器同步失敗，已保留本機資料。', true)); }
function persistUserState() { if (!currentUser) return true; try { localStorage.setItem(userStorageKey(currentUser), JSON.stringify({selected, savedPlans})); localStorage.setItem('spacePlannerCurrentUser', currentUser); syncUserState(); return true; } catch { toast('個人資料未能儲存，請檢查瀏覽器儲存空間。', true); return false; } }
async function fetchUserState(name) { try { const response=await fetch('/api/profile'); if (response.status === 401) return null; if (!response.ok) throw new Error('profile unavailable'); const value=await response.json(); return {selected:Array.isArray(value.selected) ? value.selected.filter(key => typeof key === 'string') : [], savedPlans:validPlans(value.savedPlans), isAdmin:Boolean(value.isAdmin)}; } catch { return loadUserState(name); } }
function persistSavedPlans() { return persistUserState(); }
function escapeHtml(value) { return String(value).replace(/[&<>'"]/g, ch => ({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[ch])); }

function courseKey(item) { return `${item.code}|${item.no}`; }
function classSessions(key) { return dataset.filter(item => courseKey(item) === key); }
function displayClass(key) { const item = uniqueClasses().find(x => courseKey(x) === key); return item ? `${item.code} ${item.no}` : key; }
function campusesCompatible(from, to) { return from === to || CAMPUS_GROUPS.some(group => group.has(from) && group.has(to)); }

function renderSavedPlans() {
  const el = $('savedPlans');
  if (!savedPlans.length) { el.innerHTML = '<div class="saved-empty">完成一次替換查詢後，可在這裡儲存計劃。</div>'; return; }
  el.innerHTML = savedPlans.map(plan => `<div class="saved-plan"><div class="saved-plan-name">${escapeHtml(plan.name)}</div><div class="saved-plan-route">${escapeHtml(displayClass(plan.originalKey))} → ${escapeHtml(displayClass(plan.replacementKey))}</div><div class="saved-plan-actions"><button data-plan-load="${escapeHtml(plan.id)}">載入</button><button data-plan-edit="${escapeHtml(plan.id)}">編輯</button><button data-plan-delete="${escapeHtml(plan.id)}">刪除</button></div></div>`).join('');
  el.querySelectorAll('[data-plan-load]').forEach(button => button.addEventListener('click', () => loadPlan(button.dataset.planLoad)));
  el.querySelectorAll('[data-plan-edit]').forEach(button => button.addEventListener('click', () => openPlanModal(button.dataset.planEdit)));
  el.querySelectorAll('[data-plan-delete]').forEach(button => button.addEventListener('click', () => deletePlan(button.dataset.planDelete)));
}
function renderSidebar() {
  const el = $('selectedCourses');
  el.innerHTML = selected.length ? selected.map(key => `<div class="course-chip"><div>${escapeHtml(displayClass(key))}<span>${escapeHtml(classSessions(key)[0]?.name || '')}</span></div><button class="remove-course" data-remove="${escapeHtml(key)}" title="移除">×</button></div>`).join('') : '<div class="helper-text">尚未加入課堂</div>';
  el.querySelectorAll('[data-remove]').forEach(btn => btn.addEventListener('click', () => { selected = selected.filter(key => key !== btn.dataset.remove); alternativeOriginalKey = null; alternativeKey = null; alternativeKeys = []; renderAll(); }));
  renderSavedPlans();
}

function renderTimetable() {
  const grid = $('timetable');
  const header = `<div class="time-column"><div class="day-header">時間</div>${['08:30','10:00','11:30','13:00','14:30','16:00','17:30'].map(t => `<div class="time-label">${t}</div>`).join('')}</div>`;
  const columns = DAYS.map((day, index) => `<div class="day-column"><div class="day-header ${index === 0 ? 'active':''}">週${day}</div><div class="day-body" data-day="${index+1}"></div></div>`).join('');
  grid.innerHTML = header + columns;
  const visibleSelected = alternativeKeys.length && alternativeOriginalKey ? selected.filter(key => key !== alternativeOriginalKey) : selected;
  const sessions = visibleSelected.flatMap(key => classSessions(key).map(item => ({...item, isAlternative: false})));
  if (alternativeKeys.length) sessions.push(...alternativeKeys.flatMap(key => classSessions(key).map(item => ({...item, isAlternative: true}))));
  sessions.forEach(item => {
    const body = grid.querySelector(`[data-day="${item.day}"]`); if (!body) return;
    const {start, end} = parseTime(item.time); const top = ((start - TIME_START) / 90) * SLOT_HEIGHT; const height = Math.max(71, ((end-start)/90) * SLOT_HEIGHT - 4);
    const color = item.isAlternative ? 'alternative' : (item.code.endsWith('05') ? 'teal' : item.code.endsWith('12') ? 'orange' : '');
    const displayHeight = Math.max(107, height);
    body.insertAdjacentHTML('beforeend', `<div class="session ${color}" style="top:${top}px;height:${displayHeight}px"><div class="session-code">${escapeHtml(item.code)} · ${escapeHtml(item.no)}${item.isAlternative ? ' · 替換' : ''}</div><div class="session-name">${escapeHtml(item.name)}</div><div class="session-time">${escapeHtml(item.time)}<br><span class="session-room">${escapeHtml(item.room)}</span></div></div>`);
  });
  if (!sessions.length) grid.insertAdjacentHTML('beforeend', '<div class="empty-state">從左側加入課堂，開始建立你的時間表</div>');
}

function analyze(keys = selected) {
  const sessions = keys.flatMap(key => classSessions(key));
  const byDay = new Map(); for (let day=1; day<=6; day++) byDay.set(day, sessions.filter(x => x.day === day).sort((a,b) => parseTime(a.time).start - parseTime(b.time).start));
  let maxStreak = 0; let dailyMax = 0;
  for (const daySessions of byDay.values()) { dailyMax = Math.max(dailyMax, daySessions.length); let streak = 0; let previousEnd = null; for (const item of daySessions) { const t = parseTime(item.time); streak = previousEnd !== null && t.start - previousEnd <= 10 ? streak + 1 : 1; maxStreak = Math.max(maxStreak, streak); previousEnd = t.end; } }
  return {sessions, maxStreak, dailyMax};
}

function updateStats() { const info = analyze(); $('courseCount').textContent = selected.length; $('weeklySessions').textContent = info.sessions.length; $('maxStreak').textContent = info.maxStreak; const status = $('statusCard'); const text = $('statusText'); if (!selected.length) { text.textContent = '尚未加入課堂'; status.classList.remove('ok'); } else if (info.maxStreak > 3 || info.dailyMax > 4) { text.textContent = '需要調整'; status.classList.add('bad'); } else { text.textContent = '安排有效'; status.classList.add('ok'); } }
function renderAll() { renderSidebar(); renderTimetable(); updateStats(); persistUserState(); }
function toast(message, error = false) { const el=$('toast'); el.textContent=message; el.className=`toast show${error?' error':''}`; clearTimeout(window.toastTimer); window.toastTimer=setTimeout(()=>el.className='toast', 4200); }
function updateUserBar() { const name=currentUser || '未登入'; $('currentUserLabel').textContent=name; $('userAvatar').textContent=currentUser ? name.trim().charAt(0).toUpperCase() : '?'; $('switchUserBtn').textContent=currentUser ? '切換' : '登入'; $('logoutBtn').hidden=!currentUser; $('adminBtn').hidden=!isAdmin; }
function setAuthMode(mode) { authMode=mode; const register=mode==='register'; $('loginModeBtn').classList.toggle('active', !register); $('registerModeBtn').classList.toggle('active', register); $('loginTitle').textContent=register ? '建立你的時間表' : '登入你的時間表'; $('loginBtn').innerHTML=register ? '<span>→</span> 建立帳戶' : '<span>→</span> 登入'; $('passwordInput').autocomplete=register ? 'new-password' : 'current-password'; }
function openLogin() { setAuthMode('login'); $('loginNameInput').value=currentUser; $('passwordInput').value=''; $('loginBackdrop').hidden=false; $('loginNameInput').focus(); }
async function loginUser() { const name=$('loginNameInput').value.trim(); const password=$('passwordInput').value; if (!name) { toast('請先輸入名稱。', true); return; } if (password && password.length < 8) { toast('密碼最少需要 8 個字元。', true); return; } persistUserState(); const button=$('loginBtn'); button.disabled=true; button.innerHTML='<span>↻</span> 處理中'; try { const endpoint=authMode==='register' ? '/api/auth/register' : '/api/auth/login'; const response=await fetch(endpoint, {method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({name,password})}); const result=await response.json(); if (!response.ok) throw new Error(result.error || '登入失敗'); currentUser=result.name || name; isAdmin=Boolean(result.isAdmin); remoteHydrated=false; const state=await fetchUserState(currentUser); if (!state) throw new Error('登入 session 未能建立，請重試。'); selected=state.selected; savedPlans=state.savedPlans; isAdmin=state.isAdmin || isAdmin; alternativeOriginalKey=null; alternativeKey=null; alternativeKeys=[]; remoteHydrated=true; localStorage.setItem('spacePlannerCurrentUser', currentUser); updateUserBar(); $('loginBackdrop').hidden=true; renderAll(); toast(authMode==='register' ? `帳戶已建立：${currentUser}` : `已登入：${currentUser}`); } catch (error) { toast(error.message || '登入失敗，請重試。', true); } finally { button.disabled=false; setAuthMode(authMode); } }
async function logoutUser() { persistUserState(); await fetch('/api/auth/logout', {method:'POST'}).catch(() => {}); currentUser=''; isAdmin=false; selected=[]; savedPlans=[]; alternativeOriginalKey=null; alternativeKey=null; alternativeKeys=[]; remoteHydrated=false; localStorage.removeItem('spacePlannerCurrentUser'); updateUserBar(); renderAll(); openLogin(); }
async function openAdminPanel() { if (!isAdmin) { toast('沒有管理員權限。', true); return; } $('adminBackdrop').hidden=false; $('adminUsersList').innerHTML='<div class="admin-empty">讀取中...</div>'; try { const response=await fetch('/api/admin/users'); const result=await response.json(); if (!response.ok) throw new Error(result.error || '讀取失敗'); const users=result.users || []; $('adminSummary').textContent=`共 ${users.length} 個帳戶`; $('adminUsersList').innerHTML=users.length ? users.map(user => `<article class="admin-user"><div class="admin-user-head"><strong>${escapeHtml(user.name)}</strong><span class="admin-role">${user.role === 'admin' ? '管理員' : '用戶'}</span></div><div class="admin-user-meta">已選課堂 ${user.selected.length} 門 · 儲存計劃 ${user.savedPlans.length} 個</div><div class="admin-user-courses">${user.selected.length ? user.selected.map(escapeHtml).join('、') : '尚未加入課堂'}</div></article>`).join('') : '<div class="admin-empty">目前沒有用戶資料。</div>'; } catch (error) { $('adminSummary').textContent=''; $('adminUsersList').innerHTML=`<div class="admin-empty">${escapeHtml(error.message || '讀取失敗')}</div>`; } }

function validateReplacement(originalKey, replacementKey) {
  const original = classSessions(originalKey); const replacement = classSessions(replacementKey); if (!replacement.length) return '找不到這個替換班別。';
  const originalTypes = new Set(original.map(x => classTypeOf(x.no))); const replacementTypes = new Set(replacement.map(x => classTypeOf(x.no)));
  const typeConflict = [...originalTypes].some(from => NON_MIXABLE_CLASS_TYPES.has(from) && [...replacementTypes].some(to => NON_MIXABLE_CLASS_TYPES.has(to) && from !== to));
  if (typeConflict) return `班別類型限制：${[...originalTypes].join('、')} 不能替換成 ${[...replacementTypes].join('、')}。查詢已終止。`;
  const oldCampus = new Set(original.map(x => campusOf(x.room))); const newCampus = new Set(replacement.map(x => campusOf(x.room)));
  const campusCompatible = [...oldCampus].every(old => [...newCampus].every(next => campusesCompatible(old, next)));
  if (!campusCompatible) return `校區限制：${[...oldCampus].join('、')} 不能跨往 ${[...newCampus].join('、')}。查詢已終止。`;
  const otherKeys = selected.filter(k => k !== originalKey); const check = analyze([...otherKeys, replacementKey]);
  if (hasScheduleConflict([...otherKeys, replacementKey])) return '由於課堂時間衝突，無法替換。';
  if (check.maxStreak > 3) return '連堂限制：替換後會出現超過 3 堂連續課堂（4.5 小時）。查詢已終止。';
  if (check.dailyMax > 4) return '每日限制：替換後會超過 4 堂課（6 小時）。查詢已終止。';
  return null;
}

function hasScheduleConflict(keys) { const sessions = keys.flatMap(key => classSessions(key)); for (let i=0; i<sessions.length; i++) { const a=parseTime(sessions[i].time); for (let j=i+1; j<sessions.length; j++) { if (sessions[i].day !== sessions[j].day) continue; const b=parseTime(sessions[j].time); if (a.start < b.end && b.start < a.end) return true; } } return false; }

function fillReplacementOptions() { const originalKey = $('originalSelect').value; const item = uniqueClasses().find(x => courseKey(x) === originalKey); const options = uniqueClasses().filter(x => x.code === item?.code); $('replacementSelect').innerHTML = options.map(x => `<option value="${escapeHtml(courseKey(x))}">${escapeHtml(x.code)} ${escapeHtml(x.no)}</option>`).join(''); updatePreview(); }
function updatePreview() { const replacements = [...$('replacementSelect').selectedOptions].map(option => option.value); const previews = replacements.flatMap(replacement => classSessions(replacement).map(x => `<strong>${escapeHtml(displayClass(replacement))}</strong> · ${escapeHtml(DAY_NAMES[x.day])} · ${escapeHtml(x.time)} · ${escapeHtml(x.room)}`)); $('replacementPreview').innerHTML = previews.length ? previews.join('<br>') : '請選擇一個或多個替換班別。'; }
function openModal() { if (!selected.length) { toast('請先加入至少一個課堂。', true); return; } $('originalSelect').innerHTML = selected.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(displayClass(key))}</option>`).join(''); fillReplacementOptions(); $('modalBackdrop').hidden=false; }
function closeModal() { $('modalBackdrop').hidden=true; }
function populatePlanReplacementOptions() { const originalKey = $('planOriginalSelect').value; const item = uniqueClasses().find(x => courseKey(x) === originalKey); const options = uniqueClasses().filter(x => x.code === item?.code); $('planReplacementSelect').innerHTML = options.map(x => `<option value="${escapeHtml(courseKey(x))}">${escapeHtml(x.code)} ${escapeHtml(x.no)}</option>`).join(''); updatePlanPreview(); }
function updatePlanPreview() { const replacement = $('planReplacementSelect').value; const sessions = classSessions(replacement); $('planPreview').innerHTML = sessions.length ? `<strong>${escapeHtml(displayClass(replacement))}</strong><br>${sessions.map(x => `${escapeHtml(DAY_NAMES[x.day])} · ${escapeHtml(x.time)} · ${escapeHtml(x.room)}`).join('<br>')}` : '請先選擇替換班別。'; }
function openPlanModal(planId = null) { if (!alternativeKey || !alternativeOriginalKey || alternativeKeys.length !== 1) { toast('儲存計劃目前需要只選擇一個替換班別。', true); return; } editingPlanId = planId; const plan = savedPlans.find(item => item.id === planId); $('planModalTitle').textContent = plan ? '編輯儲存計劃' : '儲存計劃課堂'; $('planNameInput').value = plan?.name || `${displayClass(alternativeOriginalKey)} → ${displayClass(alternativeKey)}`; const planKeys = plan?.selected || selected; $('planOriginalSelect').innerHTML = planKeys.map(key => `<option value="${escapeHtml(key)}">${escapeHtml(displayClass(key))}</option>`).join(''); $('planOriginalSelect').value = plan?.originalKey || alternativeOriginalKey; populatePlanReplacementOptions(); $('planReplacementSelect').value = plan?.replacementKey || alternativeKey; updatePlanPreview(); $('planModalBackdrop').hidden=false; $('planNameInput').focus(); }
function closePlanModal() { $('planModalBackdrop').hidden=true; editingPlanId=null; }
function savePlan() { const originalKey=$('planOriginalSelect').value; const replacementKey=$('planReplacementSelect').value; const error=validateReplacement(originalKey,replacementKey); if (error) { closePlanModal(); toast(error, true); return; } const name=$('planNameInput').value.trim() || `${displayClass(originalKey)} → ${displayClass(replacementKey)}`; const record={id:editingPlanId || `plan-${Date.now()}`,name,selected:editingPlanId ? (savedPlans.find(x=>x.id===editingPlanId)?.selected || selected) : [...selected],originalKey,replacementKey,updatedAt:new Date().toISOString()}; if (editingPlanId) savedPlans=savedPlans.map(plan=>plan.id===editingPlanId?record:plan); else savedPlans=[record,...savedPlans]; persistSavedPlans(); selected=[...record.selected]; alternativeOriginalKey=record.originalKey; alternativeKey=record.replacementKey; closePlanModal(); renderAll(); toast(`已儲存計劃：${name}`); }
function loadPlan(planId) { const plan=savedPlans.find(item=>item.id===planId); if (!plan) return; selected=[...plan.selected]; alternativeOriginalKey=plan.originalKey; alternativeKey=plan.replacementKey; alternativeKeys=[plan.replacementKey]; renderAll(); toast(`已載入計劃：${plan.name}`); }
function deletePlan(planId) { const plan=savedPlans.find(item=>item.id===planId); if (!plan) return; savedPlans=savedPlans.filter(item=>item.id!==planId); persistSavedPlans(); renderSavedPlans(); toast(`已刪除計劃：${plan.name}`); }
function searchSlotsForCode(code) { return [...new Map(dataset.filter(item => item.code === code).map(item => [`${item.day}|${item.time}`, item])).values()].sort((a,b) => a.day - b.day || parseTime(a.time).start - parseTime(b.time).start); }
function updateSearchTimeOptions() { const code=$('searchCourseCodeInput').value.trim().toUpperCase(); const options=searchSlotsForCode(code); const container=$('searchTimeOptions'); $('searchTimeHint').textContent=options.length ? `${options.length} 個可選時段` : (code ? '找不到此 Course Code' : '先輸入 Course Code'); $('searchResults').textContent='請選擇時間後按「搜尋班別」。'; if (!options.length) { container.innerHTML='<div class="helper-text">找不到此 Course Code，請檢查輸入是否正確。</div>'; return; } container.innerHTML=options.map(item => `<label class="search-time-option"><input type="checkbox" value="${escapeHtml(`${item.day}|${item.time}`)}"><span>${escapeHtml(DAY_NAMES[item.day])} · ${escapeHtml(item.time)}</span></label>`).join(''); }
function runClassSearch() { const code=$('searchCourseCodeInput').value.trim().toUpperCase(); const requested=[...$('searchTimeOptions').querySelectorAll('input:checked')].map(input => input.value); if (!code) { toast('請先輸入 Course Code。', true); return; } if (!requested.length) { toast('請至少選擇一個上課時間。', true); return; } const requestedSet=new Set(requested); const grouped=new Map(); dataset.filter(item => item.code === code).forEach(item => { const key=courseKey(item); if (!grouped.has(key)) grouped.set(key, []); grouped.get(key).push(item); }); const matches=[...grouped.entries()].filter(([,sessions]) => { const slots=new Set(sessions.map(item => `${item.day}|${item.time}`)); return [...requestedSet].every(slot => slots.has(slot)); }).sort(([a],[b]) => a.localeCompare(b)); $('searchResults').innerHTML=matches.length ? matches.map(([,sessions]) => `<div class="search-result"><strong>${escapeHtml(sessions[0].no)}</strong><span class="search-result-name">${escapeHtml(sessions[0].name)}</span><div class="search-result-sessions">${sessions.sort((a,b) => a.day - b.day || parseTime(a.time).start - parseTime(b.time).start).map(item => `${escapeHtml(DAY_NAMES[item.day])} · ${escapeHtml(item.time)} · ${escapeHtml(item.room)}`).join('<br>')}</div></div>`).join('') : '沒有班別同時符合所選的全部時段。'; }
function openSearchModal() { $('searchCourseCodeInput').value=''; $('searchTimeOptions').innerHTML='<div class="helper-text">輸入課程編號後，這裡會列出可選時段。</div>'; $('searchTimeHint').textContent='先輸入 Course Code'; $('searchResults').textContent='請輸入課程編號並選擇時間。'; $('searchModalBackdrop').hidden=false; $('searchCourseCodeInput').focus(); }
function closeSearchModal() { $('searchModalBackdrop').hidden=true; }
function openAddModal() { $('courseCodeInput').value=''; $('classNoInput').value=''; $('courseMatchPreview').textContent='輸入課程資料後，系統會顯示可加入的班別。'; $('addModalBackdrop').hidden=false; $('courseCodeInput').focus(); }
function closeAddModal() { $('addModalBackdrop').hidden=true; }
function updateCourseMatch() { const code=$('courseCodeInput').value.trim().toUpperCase(); const no=$('classNoInput').value.trim().toUpperCase(); const match=dataset.filter(x=>x.code===code && x.no===no); $('courseMatchPreview').innerHTML=match.length ? `<strong>${escapeHtml(code)} ${escapeHtml(no)}</strong><br>${match.length} 節課堂 · ${match.map(x => `${escapeHtml(DAY_NAMES[x.day])} ${escapeHtml(x.time)}`).join('、')}` : '找不到完全相符的 Course Code 及 Class No。'; }
function parseCsvLine(line) { const cells=[]; let value='', quoted=false; for (let i=0;i<line.length;i++) { const ch=line[i]; if (ch==='"' && line[i+1]==='"') { value+='"'; i++; } else if (ch==='"') quoted=!quoted; else if (ch===',' && !quoted) { cells.push(value.trim()); value=''; } else value+=ch; } cells.push(value.trim()); return cells; }
function arrayBufferToBase64(buffer) { let binary=''; const bytes=new Uint8Array(buffer); const chunkSize=0x8000; for (let i=0;i<bytes.length;i+=chunkSize) binary+=String.fromCharCode(...bytes.subarray(i,i+chunkSize)); return btoa(binary); }

$('addCourseBtn').addEventListener('click', openAddModal); $('closeAddModal').addEventListener('click', closeAddModal); $('cancelAddCourse').addEventListener('click', closeAddModal); $('courseCodeInput').addEventListener('input', updateCourseMatch); $('classNoInput').addEventListener('input', updateCourseMatch); $('switchUserBtn').addEventListener('click', openLogin); $('logoutBtn').addEventListener('click', logoutUser); $('adminBtn').addEventListener('click', openAdminPanel); $('closeAdminModal').addEventListener('click', () => $('adminBackdrop').hidden=true); $('refreshAdmin').addEventListener('click', openAdminPanel); $('loginModeBtn').addEventListener('click', () => setAuthMode('login')); $('registerModeBtn').addEventListener('click', () => setAuthMode('register')); $('loginBtn').addEventListener('click', loginUser); $('loginNameInput').addEventListener('keydown', event => { if (event.key === 'Enter') loginUser(); }); $('passwordInput').addEventListener('keydown', event => { if (event.key === 'Enter') loginUser(); });
$('confirmAddCourse').addEventListener('click', () => { const code=$('courseCodeInput').value.trim().toUpperCase(); const no=$('classNoInput').value.trim().toUpperCase(); const key=`${code}|${no}`; if (!classSessions(key).length) { toast('找不到這個 Course Code / Class No 組合。', true); return; } if (selected.includes(key)) { toast('這個課堂已經在你的時間表中。', true); return; } selected.push(key); closeAddModal(); renderAll(); toast(`已加入 ${code} ${no}。`); });
$('pdfInput').addEventListener('change', async event => { const file=event.target.files[0]; const button=document.querySelector('.pdf-upload-button'); if (!file) return; if (file.type !== 'application/pdf' && !file.name.toLowerCase().endsWith('.pdf')) { toast('請選擇 PDF 格式的 Master Timetable。', true); event.target.value=''; return; } if (file.size > 25 * 1024 * 1024) { toast('PDF 檔案不可大於 25 MB。', true); event.target.value=''; return; } const originalText=button.textContent; button.textContent='↻ 正在讀取 PDF...'; button.setAttribute('aria-busy','true'); try { const response=await fetch('/api/import-pdf',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({fileName:file.name,data:arrayBufferToBase64(await file.arrayBuffer())})}); const result=await response.json(); if (!response.ok || !Array.isArray(result.rows)) throw new Error(result.error || 'import failed'); const imported=normalizeDataset(result.rows); if (!imported.length) throw new Error('empty dataset'); dataset=imported; dataReady=true; selected=[]; alternativeOriginalKey=null; alternativeKey=null; alternativeKeys=[]; renderAll(); toast(`已由 ${file.name} 更新 ${imported.length} 節課堂資料。`); } catch { toast('PDF 匯入失敗，請確認是 Master Timetable PDF，或重啟本地網站服務。', true); } finally { button.textContent=originalText; button.removeAttribute('aria-busy'); event.target.value=''; } });
$('replaceBtn').addEventListener('click', openModal); $('closeModal').addEventListener('click', closeModal); $('cancelReplace').addEventListener('click', closeModal); $('originalSelect').addEventListener('change', fillReplacementOptions); $('replacementSelect').addEventListener('change', updatePreview);
$('confirmReplace').addEventListener('click', () => { const original=$('originalSelect').value; const replacements=[...$('replacementSelect').selectedOptions].map(option => option.value); if (!replacements.length) { toast('請至少選擇一個替換班別。', true); return; } const otherKeys=selected.filter(key => key !== original); const error=replacements.map(replacement => validateReplacement(original,replacement)).find(Boolean) || (hasScheduleConflict([...otherKeys, ...replacements]) ? '由於課堂時間衝突，無法替換。' : null); if (error) { closeModal(); toast(error, true); return; } alternativeOriginalKey=original; alternativeKeys=replacements; alternativeKey=replacements.length === 1 ? replacements[0] : null; closeModal(); renderAll(); toast(`已顯示 ${replacements.length} 個替換班別預覽。`); });
$('resetBtn').addEventListener('click', () => { alternativeOriginalKey=null; alternativeKey=null; alternativeKeys=[]; renderTimetable(); toast('已清除替換預覽。'); });
$('savePlanBtn').addEventListener('click', () => openPlanModal()); $('closePlanModal').addEventListener('click', closePlanModal); $('cancelPlan').addEventListener('click', closePlanModal); $('planOriginalSelect').addEventListener('change', populatePlanReplacementOptions); $('planReplacementSelect').addEventListener('change', updatePlanPreview); $('confirmPlan').addEventListener('click', savePlan);
$('csvInput').addEventListener('change', async event => { const file=event.target.files[0]; if (!file) return; try { const text=await file.text(); const rows=text.trim() ? text.trim().split(/\r?\n/).map(parseCsvLine) : []; const headers=(rows.shift() || []).map(h=>h.toLowerCase()); const get=(row, names) => row[headers.findIndex(h=>names.includes(h))]; const imported=normalizeDataset(rows.map(row => ({code:get(row,['course code','coursecode']),no:get(row,['class no','classno']),name:get(row,['course name','coursename'])||'',day:Number(get(row,['weekday','day'])),time:get(row,['time'])||'',room:get(row,['room'])||''}))); if (!imported.length) { toast('CSV 欄位未能辨識或沒有有效課堂資料。', true); return; } dataset=imported; dataReady=true; selected=[]; alternativeOriginalKey=null; alternativeKey=null; alternativeKeys=[]; renderAll(); toast(`已匯入 ${imported.length} 筆課堂資料。`); } catch { toast('CSV 讀取失敗，請確認檔案格式。', true); } finally { event.target.value=''; } });

$('searchClassBtn').addEventListener('click', openSearchModal); $('closeSearchModal').addEventListener('click', closeSearchModal); $('cancelSearch').addEventListener('click', closeSearchModal); $('searchCourseCodeInput').addEventListener('input', updateSearchTimeOptions); $('runClassSearch').addEventListener('click', runClassSearch);
if (currentUser) { const state=loadUserState(currentUser); selected=state.selected; savedPlans=state.savedPlans; }
updateUserBar();
renderAll();
if (!currentUser) openLogin();
else fetchUserState(currentUser).then(state => { if (!state) { currentUser=''; isAdmin=false; selected=[]; savedPlans=[]; localStorage.removeItem('spacePlannerCurrentUser'); updateUserBar(); renderAll(); openLogin(); return; } selected=state.selected; savedPlans=state.savedPlans; isAdmin=state.isAdmin; remoteHydrated=true; updateUserBar(); renderAll(); });
const dataController = new AbortController();
const dataTimeout = setTimeout(() => dataController.abort(), 8000);
fetch('timetable-data.json', {signal: dataController.signal})
  .then(response => { if (!response.ok) throw new Error('data unavailable'); return response.json(); })
  .then(fullDataset => { const normalized = normalizeDataset(fullDataset); if (!normalized.length) throw new Error('empty dataset'); dataset = normalized; dataReady = true; renderAll(); })
  .catch(() => toast('完整課堂資料載入失敗，現正使用示範資料。', true))
  .finally(() => clearTimeout(dataTimeout));
