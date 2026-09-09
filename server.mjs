import http from 'node:http';
import https from 'node:https';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const siteDir = path.dirname(fileURLToPath(import.meta.url));
const projectDir = path.dirname(siteDir);
const bundledPdfjsPath = path.join(siteDir, 'node_modules', 'pdfjs-dist', 'legacy', 'build', 'pdf.mjs');
const localPdfjsPath = 'C:/Users/ad953/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/pdfjs-dist/legacy/build/pdf.mjs';
const pdfjsPath = process.env.PDFJS_PATH || (fs.existsSync(bundledPdfjsPath) ? bundledPdfjsPath : localPdfjsPath);
const profilesPath = path.join(siteDir, 'profiles.json');
const usersPath = path.join(siteDir, 'users.json');
const authSecretPath = path.join(siteDir, 'auth-secret.txt');
if (!fs.existsSync(profilesPath)) fs.writeFileSync(profilesPath, '{}', 'utf8');
if (!fs.existsSync(usersPath)) fs.writeFileSync(usersPath, '{}', 'utf8');
const authSecret = process.env.SPACE_PLANNER_AUTH_SECRET || (() => { if (fs.existsSync(authSecretPath)) return fs.readFileSync(authSecretPath, 'utf8').trim(); const value = crypto.randomBytes(32).toString('hex'); fs.writeFileSync(authSecretPath, value, {encoding: 'utf8', mode: 0o600}); return value; })();
const sessionMaxAge = 7 * 24 * 60 * 60;
const adminUsers = new Set((process.env.SPACE_PLANNER_ADMIN_USERS || 'lyu').split(',').map(user => userKey(user)).filter(Boolean));
const secureCookies = process.env.SPACE_PLANNER_SECURE_COOKIES === '1';

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store'});
  res.end(body);
}

function parsePdfRows(pdf) {
  return (async () => {
    const rows = [];
    for (let pageNo = 1; pageNo <= pdf.numPages; pageNo++) {
      const page = await pdf.getPage(pageNo);
      const content = await page.getTextContent();
      const tokens = content.items.map(item => String(item.str).trim()).filter(Boolean);
      const header = tokens.indexOf('Course Code');
      if (header < 0) continue;
      const body = tokens.slice(header + 1);
      for (let i = 0; i < body.length; i++) {
        if (!/^[A-Z]{4}\d{4}$/.test(body[i])) continue;
        const code = body[i];
        const no = body[i + 1];
        if (!no || !/^[A-Z]{2}\d+$/.test(no)) continue;
        let timeIndex = -1;
        for (let j = i + 2; j < Math.min(i + 12, body.length); j++) {
          if (/^\d{2}:\d{2} - \d{2}:\d{2}$/.test(body[j])) { timeIndex = j; break; }
        }
        if (timeIndex < 0) continue;
        const name = body.slice(i + 2, timeIndex - 2).join(' ').trim();
        const day = Number(body[timeIndex - 1]);
        const time = body[timeIndex];
        const room = body[timeIndex + 1];
        if (name && day >= 1 && day <= 6 && room) rows.push({code, no, name, day, time, room});
        i = timeIndex;
      }
    }
    return rows;
  })();
}

async function importPdf(base64) {
  const pdfjs = await import(pathToFileURL(pdfjsPath).href);
  const data = Uint8Array.from(Buffer.from(base64, 'base64'));
  const pdf = await pdfjs.getDocument({data, disableWorker: true}).promise;
  return parsePdfRows(pdf);
}

function readRequestBody(req, maxBytes = 35 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => { size += chunk.length; if (size > maxBytes) { reject(new Error('request too large')); req.destroy(); return; } chunks.push(chunk); });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

function profileKey(name) { return String(name || '').trim().toLowerCase(); }
function readProfiles() { try { return JSON.parse(fs.readFileSync(profilesPath, 'utf8')) || {}; } catch { return {}; } }
function writeProfiles(profiles) { fs.writeFileSync(profilesPath, JSON.stringify(profiles), 'utf8'); }
function readUsers() { try { return JSON.parse(fs.readFileSync(usersPath, 'utf8')) || {}; } catch { return {}; } }
function writeUsers(users) { fs.writeFileSync(usersPath, JSON.stringify(users), 'utf8'); }
function userKey(name) { return String(name || '').trim().toLowerCase(); }
function isAdminUser(name) { return adminUsers.has(userKey(name)); }
function base64Url(value) { return Buffer.from(value).toString('base64url'); }
function sign(value) { return crypto.createHmac('sha256', authSecret).update(value).digest('base64url'); }
function sessionCookie(name) { const payload = base64Url(JSON.stringify({u: userKey(name), exp: Math.floor(Date.now() / 1000) + sessionMaxAge})); return `${payload}.${sign(payload)}`; }
function sessionUser(req) { const cookieHeader = req.headers.cookie || ''; const match = cookieHeader.match(/(?:^|;\s*)sp_session=([^;]+)/); if (!match) return null; const [payload, signature] = match[1].split('.'); if (!payload || !signature) return null; const actual = Buffer.from(signature); const expected = Buffer.from(sign(payload)); if (actual.length !== expected.length || !crypto.timingSafeEqual(actual, expected)) return null; try { const data = JSON.parse(Buffer.from(payload, 'base64url').toString('utf8')); return data.exp > Math.floor(Date.now() / 1000) ? data.u : null; } catch { return null; } }
function sessionHeaders(name) { return {'Set-Cookie': `sp_session=${sessionCookie(name)}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${sessionMaxAge}${useHttps || secureCookies ? '; Secure' : ''}`}; }
function clearSessionHeaders() { return {'Set-Cookie': 'sp_session=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0'}; }
function hashPassword(password) { return new Promise((resolve, reject) => crypto.scrypt(password, authSecret, 64, (error, derived) => error ? reject(error) : resolve(derived.toString('hex')))); }
async function verifyPassword(password, stored) { const hashed = await hashPassword(password); return crypto.timingSafeEqual(Buffer.from(hashed, 'hex'), Buffer.from(stored, 'hex')); }
function authError(res) { return sendJson(res, 401, {error: '請先登入'}); }

function contentType(filePath) {
  return {'.html':'text/html; charset=utf-8','.css':'text/css; charset=utf-8','.js':'application/javascript; charset=utf-8','.json':'application/json; charset=utf-8'}[path.extname(filePath)] || 'application/octet-stream';
}

const useHttps = Boolean(process.env.HTTPS_CERT_FILE && process.env.HTTPS_KEY_FILE);
const requestHandler = async (req, res) => {
  try {
    const requestUrl = new URL(req.url, 'http://127.0.0.1');
    if (requestUrl.pathname === '/api/import-pdf' && req.method === 'POST') {
      const payload = JSON.parse(await readRequestBody(req));
      if (typeof payload.data !== 'string' || !payload.data) return sendJson(res, 400, {error: 'PDF data is missing'});
      const rows = await importPdf(payload.data);
      if (!rows.length) return sendJson(res, 422, {error: 'No timetable rows found'});
      return sendJson(res, 200, {fileName: payload.fileName || 'timetable.pdf', rows});
    }
    if (requestUrl.pathname === '/api/auth/register' && req.method === 'POST') {
      const payload = JSON.parse(await readRequestBody(req, 100 * 1024)); const name = String(payload.name || '').trim(); const password = String(payload.password || '');
      if (name.length < 1 || name.length > 40 || password.length < 8) return sendJson(res, 400, {error: '名稱不可為空，密碼最少 8 個字元'});
      const users = readUsers(); const key = userKey(name); if (users[key]) return sendJson(res, 409, {error: '此名稱已經註冊'}); users[key] = {name, role: isAdminUser(key) ? 'admin' : 'user', passwordHash: await hashPassword(password)}; writeUsers(users); res.writeHead(201, {'Content-Type': 'application/json; charset=utf-8', ...sessionHeaders(name)}); return res.end(JSON.stringify({name, isAdmin: isAdminUser(key)}));
    }
    if (requestUrl.pathname === '/api/auth/login' && req.method === 'POST') {
      const payload = JSON.parse(await readRequestBody(req, 100 * 1024)); const name = String(payload.name || '').trim(); const password = String(payload.password || ''); const user = readUsers()[userKey(name)];
      if (!user || !(await verifyPassword(password, user.passwordHash))) return sendJson(res, 401, {error: '名稱或密碼不正確'});
      res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', ...sessionHeaders(user.name)}); return res.end(JSON.stringify({name:user.name, isAdmin: isAdminUser(name)}));
    }
    if (requestUrl.pathname === '/api/auth/logout' && req.method === 'POST') { res.writeHead(200, {'Content-Type': 'application/json; charset=utf-8', ...clearSessionHeaders()}); return res.end(JSON.stringify({ok:true})); }
    if (requestUrl.pathname === '/api/profile' && (req.method === 'GET' || req.method === 'PUT')) {
      const name = sessionUser(req); if (!name) return authError(res);
      const displayName = readUsers()[name]?.name || name;
      const profiles = readProfiles();
      if (req.method === 'GET') return sendJson(res, 200, {name: profiles[name]?.name || displayName, isAdmin: isAdminUser(name), ...(profiles[name] || {selected: [], savedPlans: []})});
      const payload = JSON.parse(await readRequestBody(req, 2 * 1024 * 1024)); profiles[name] = {name: profiles[name]?.name || displayName, selected: Array.isArray(payload.selected) ? payload.selected.filter(item => typeof item === 'string') : [], savedPlans: Array.isArray(payload.savedPlans) ? payload.savedPlans : []}; writeProfiles(profiles); return sendJson(res, 200, {ok:true});
    }
    if (requestUrl.pathname === '/api/admin/users' && req.method === 'GET') {
      const name = sessionUser(req); if (!name) return authError(res); if (!isAdminUser(name)) return sendJson(res, 403, {error: '沒有管理員權限'});
      const users = readUsers(); const profiles = readProfiles();
      const result = Object.entries(users).map(([key, user]) => { const profile = profiles[key] || {}; return {name: user.name, role: isAdminUser(key) ? 'admin' : 'user', selected: Array.isArray(profile.selected) ? profile.selected : [], savedPlans: Array.isArray(profile.savedPlans) ? profile.savedPlans : []}; });
      return sendJson(res, 200, {users: result});
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') return sendJson(res, 405, {error: 'Method not allowed'});
    const relative = requestUrl.pathname === '/' ? '/timetable-site/index.html' : requestUrl.pathname;
    const filePath = path.resolve(projectDir, `.${relative}`);
    if (!filePath.startsWith(projectDir) || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) return sendJson(res, 404, {error: 'Not found'});
    res.writeHead(200, {'Content-Type': contentType(filePath), 'Cache-Control': 'no-store'});
    if (req.method === 'HEAD') return res.end();
    fs.createReadStream(filePath).pipe(res);
  } catch (error) {
    sendJson(res, 500, {error: error.message || 'Server error'});
  }
};

const server = useHttps ? https.createServer({key: fs.readFileSync(process.env.HTTPS_KEY_FILE), cert: fs.readFileSync(process.env.HTTPS_CERT_FILE)}, requestHandler) : http.createServer(requestHandler);
const port = Number(process.env.PORT || 4173);
server.listen(port, '0.0.0.0', () => console.log(`SPACE Planner running at ${useHttps ? 'https' : 'http'}://0.0.0.0:${port}/timetable-site/index.html`));
