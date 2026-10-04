import { createServer } from 'node:http';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto';
import { mkdirSync } from 'node:fs';
import { dirname, resolve } from 'node:path';

const hash = value => createHash('sha256').update(value).digest('hex');
const now = () => new Date().toISOString();
const fail = (status, message) => { throw Object.assign(new Error(message), { status }); };
const roles = ['Resident', 'Collector', 'Admin'];
const kinds = ['General Waste', 'Recyclables', 'Illegal Dumping', 'Others'];
function text(value, label, max = 200, required = true) {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) fail(400, `${label} is required and must be under ${max} characters.`);
  return value.trim();
}
function email(value) { const v = text(value, 'Email', 254).toLowerCase(); if (!/^\S+@\S+\.\S+$/.test(v)) fail(400, 'Enter a valid email address.'); return v; }
function password(value) { if (typeof value !== 'string' || value.length < 10 || value.length > 128) fail(400, 'Use a password between 10 and 128 characters.'); return value; }
function passwordHash(value) { const salt = randomBytes(16).toString('hex'); return `${salt}:${scryptSync(value, salt, 64).toString('hex')}`; }
function matches(value, encoded) { if (typeof value !== 'string' || value.length > 128 || !encoded) return false; const [salt, digest] = encoded.split(':'); return timingSafeEqual(scryptSync(value, salt, 64), Buffer.from(digest, 'hex')); }
const publicUser = u => ({ id: u.id, name: u.name, email: u.email, phone: u.phone, role: u.role, active: !!u.active, notificationsEnabled: !!u.notifications_enabled });
const recovery = () => randomBytes(18).toString('hex').match(/.{1,6}/g).join('-');

export function createApp(options = {}) {
  const databasePath = options.databasePath ?? resolve('server/data/cleantrack.sqlite');
  if (databasePath !== ':memory:') mkdirSync(dirname(databasePath), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON; PRAGMA busy_timeout=5000;
    CREATE TABLE IF NOT EXISTS users(id TEXT PRIMARY KEY,name TEXT NOT NULL,email TEXT NOT NULL UNIQUE,phone TEXT NOT NULL DEFAULT '',role TEXT NOT NULL,password_hash TEXT NOT NULL,recovery_hash TEXT NOT NULL,active INTEGER NOT NULL DEFAULT 1,notifications_enabled INTEGER NOT NULL DEFAULT 1);
    CREATE TABLE IF NOT EXISTS sessions(hash TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),expires INTEGER NOT NULL);
    CREATE TABLE IF NOT EXISTS reports(id TEXT PRIMARY KEY,resident TEXT REFERENCES users(id),collector TEXT REFERENCES users(id),status TEXT NOT NULL,revision INTEGER NOT NULL DEFAULT 1,created TEXT NOT NULL,body TEXT NOT NULL);
    CREATE INDEX IF NOT EXISTS report_owner ON reports(resident);
    CREATE INDEX IF NOT EXISTS report_assignee ON reports(collector);
    CREATE TABLE IF NOT EXISTS media(id TEXT PRIMARY KEY,owner TEXT REFERENCES users(id),mime TEXT NOT NULL,content BLOB NOT NULL,created TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS notifications(id TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id),report_id TEXT REFERENCES reports(id),title TEXT NOT NULL,body TEXT NOT NULL,created TEXT NOT NULL,is_read INTEGER NOT NULL DEFAULT 0);
    CREATE TABLE IF NOT EXISTS devices(token TEXT PRIMARY KEY,user_id TEXT REFERENCES users(id));
  `);
  const query = (sql, ...args) => db.prepare(sql).get(...args);
  const all = (sql, ...args) => db.prepare(sql).all(...args);
  const run = (sql, ...args) => db.prepare(sql).run(...args);
  function transaction(fn) { db.exec('BEGIN IMMEDIATE'); try { const result = fn(); db.exec('COMMIT'); return result; } catch (e) { db.exec('ROLLBACK'); throw e; } }
  function createUser(body, role) {
    const address = email(body.email);
    if (query('SELECT id FROM users WHERE email=?', address)) fail(409, 'That email address is already registered.');
    const code = recovery();
    const u = { id: randomUUID(), name: text(body.name, 'Full name', 100), email: address, phone: text(body.phone ?? '', 'Phone', 30, false), role, password: passwordHash(password(body.password)) };
    run('INSERT INTO users(id,name,email,phone,role,password_hash,recovery_hash) VALUES(?,?,?,?,?,?,?)', u.id, u.name, u.email, u.phone, role, u.password, hash(code));
    return { user: publicUser(query('SELECT * FROM users WHERE id=?', u.id)), recoveryCode: code };
  }
  // Provision administrators only through an explicit server-side bootstrap command/config.
  if (options.admin && !query("SELECT id FROM users WHERE role='Admin'")) createUser(options.admin, 'Admin');
  const secret = options.mediaSecret ?? randomBytes(32).toString('hex');
  const mediaSignature = (id, expires) => hash(`${secret}:${id}:${expires}`);
  function reportValue(row) {
    const r = { ...JSON.parse(row.body), id: row.id, resident: row.resident, collector: row.collector ?? undefined, status: row.status, revision: row.revision, created: row.created };
    if (r.photoId) { const expires = Date.now() + 3600000; r.photo = `/media/${r.photoId}?expires=${expires}&signature=${mediaSignature(r.photoId, expires)}`; }
    return r;
  }
  const permitted = (u,r) => u.role === 'Admin' || (u.role === 'Resident' ? r.resident === u.id : r.collector === u.id);
  function state(u) {
    const rows = u.role === 'Admin' ? all('SELECT * FROM reports ORDER BY created DESC') : all(`SELECT * FROM reports WHERE ${u.role === 'Resident' ? 'resident' : 'collector'}=? ORDER BY created DESC`, u.id);
    const people = u.role === 'Admin' ? all('SELECT * FROM users ORDER BY name').map(publicUser) : [publicUser(u), ...all("SELECT id,name,role FROM users WHERE role='Collector'").filter(p => rows.some(r => r.collector === p.id) && p.id !== u.id).map(p => ({ ...p, email: '', phone: '', active: true }))];
    return { user: publicUser(u), users: people, reports: rows.map(reportValue), notifications: all('SELECT id,report_id AS reportId,title,body,created,is_read AS isRead FROM notifications WHERE user_id=? ORDER BY created DESC LIMIT 200', u.id) };
  }
  function notify(userId, reportId, title, body) {
    run('INSERT INTO notifications(id,user_id,report_id,title,body,created) VALUES(?,?,?,?,?,?)', randomUUID(), userId, reportId, title, body, now());
  }
  async function pushUpdates(userIds, reportId, title, body) {
    if (options.disablePush) return;
    const messages = [...new Set(userIds)].flatMap(id => all('SELECT token FROM devices WHERE user_id=? AND EXISTS(SELECT 1 FROM users WHERE id=? AND notifications_enabled=1 AND active=1)', id,id).map(d => ({ to: d.token, title, body, data: { reportId }, sound: 'default', channelId: 'reports' })));
    if (!messages.length) return;
    try {
      const response = await fetch('https://exp.host/--/api/v2/push/send', { method: 'POST', headers: { 'Content-Type': 'application/json', ...(process.env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${process.env.EXPO_ACCESS_TOKEN}` } : {}) }, body: JSON.stringify(messages.slice(0,100)), signal: AbortSignal.timeout(10000) });
      const result = await response.json();
      if (!response.ok) throw Error('Push provider rejected request');
      for (const [i,ticket] of (result.data ?? []).entries()) if (ticket.details?.error === 'DeviceNotRegistered') run('DELETE FROM devices WHERE token=?', messages[i].to);
    } catch { console.warn('Push delivery unavailable; updates remain in the notification inbox.'); }
  }
  const attempts = new Map();
  function rateLimit(req, kind, limit = 20) {
    const key = `${req.socket.remoteAddress}:${kind}`;
    const entry = attempts.get(key);
    if (!entry || entry.until < Date.now()) { if(attempts.size>10000) attempts.clear(); attempts.set(key,{ count:1, until:Date.now()+60000 }); return; }
    if (++entry.count > limit) fail(429,'Too many requests. Try again in a minute.');
  }
  const cookie = token => `cleantrack_session=${token}; HttpOnly; Path=/; SameSite=Lax; Max-Age=${token ? 604800 : 0}${options.secureCookies ? '; Secure' : ''}`;
  const session = userId => { const token = randomBytes(32).toString('hex'); run('DELETE FROM sessions WHERE expires<?', Date.now()); run('INSERT INTO sessions VALUES(?,?,?)',hash(token),userId,Date.now()+604800000); return token; };
  function authenticate(req) {
    const token = req.headers.authorization?.replace(/^Bearer /,'') ?? req.headers.cookie?.match(/(?:^|; )cleantrack_session=([^;]+)/)?.[1];
    const u = token && query('SELECT users.* FROM users JOIN sessions ON sessions.user_id=users.id WHERE sessions.hash=? AND sessions.expires>? AND users.active=1',hash(token),Date.now());
    if (!u) fail(401,'Please log in to continue.');
    return { u, token };
  }
  const server = createServer(async (req,res) => {
    const json = (status, body) => { res.writeHead(status, {'Content-Type':'application/json','Cache-Control':'no-store'}); res.end(JSON.stringify(body)); };
    try {
      res.setHeader('X-Content-Type-Options','nosniff');
      const origin = req.headers.origin;
      if (origin) {
        const allowed = options.origins ?? [];
        let local = false;
        try { const o = new URL(origin); local = !options.production && o.host === `${req.headers.host?.split(':')[0]}:8081`; } catch { /* Invalid origin is denied. */ }
        if (!allowed.includes(origin) && !local) fail(403,'This website is not allowed to access the server.');
        res.setHeader('Access-Control-Allow-Origin',origin); res.setHeader('Vary','Origin'); res.setHeader('Access-Control-Allow-Credentials','true');
        res.setHeader('Access-Control-Allow-Headers','Content-Type, Authorization'); res.setHeader('Access-Control-Allow-Methods','GET, POST, PATCH, OPTIONS');
      }
      if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
      const url = new URL(req.url,'http://localhost'); const path = url.pathname;
      if (req.method === 'GET' && path === '/health') return json(200,{ok:true});
      if (req.method === 'GET' && path.startsWith('/media/')) {
        const id = path.slice(7), expires = Number(url.searchParams.get('expires')), signature = url.searchParams.get('signature') ?? '';
        const expected = mediaSignature(id,expires);
        if (!Number.isFinite(expires) || expires < Date.now() || signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature),Buffer.from(expected))) fail(403,'Photo link expired. Refresh the report.');
        const media = query('SELECT * FROM media WHERE id=?',id); if(!media) fail(404,'Photo unavailable.');
        res.writeHead(200,{'Content-Type':media.mime,'Cache-Control':'private, max-age=300'}); res.end(Buffer.from(media.content)); return;
      }
      let body = {};
      if (['POST','PATCH'].includes(req.method)) {
        if (!req.headers['content-type']?.startsWith('application/json')) fail(415,'JSON request required.');
        let size=0; const chunks=[]; for await (const chunk of req) { size+=chunk.length; if(size>8*1024*1024) fail(413,'Photo is too large. Use an image under 5 MB.'); chunks.push(chunk); }
        try { body=JSON.parse(Buffer.concat(chunks).toString()||'{}'); } catch { fail(400,'Invalid JSON.'); }
        if (!body || Array.isArray(body) || typeof body !== 'object') fail(400,'Invalid request.');
      }
      if (req.method==='POST' && path==='/auth/register') { rateLimit(req,'register',5); const result=createUser(body,'Resident'); const token=session(result.user.id); res.setHeader('Set-Cookie',cookie(token)); return json(201,{...result,token}); }
      if (req.method==='POST' && path==='/auth/login') {
        rateLimit(req,'login'); const u=query('SELECT * FROM users WHERE email=?',email(body.email));
        if(!u || !matches(body.password,u.password_hash) || !u.active || (body.role && body.role!==u.role)) fail(401,'Email, password, or selected role is incorrect.');
        const token=session(u.id); res.setHeader('Set-Cookie',cookie(token)); return json(200,{user:publicUser(u),token});
      }
      if (req.method==='POST' && path==='/auth/recover') {
        rateLimit(req,'recover',5); const u=query('SELECT * FROM users WHERE email=?',email(body.email)); const supplied=hash(text(body.recoveryCode,'Recovery code',100));
        if(!u || !u.active || !timingSafeEqual(Buffer.from(supplied),Buffer.from(u.recovery_hash))) fail(400,'Email or recovery code is incorrect.');
        const next=recovery(); const encoded=passwordHash(password(body.password));
        transaction(()=>{ run('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?',encoded,hash(next),u.id); run('DELETE FROM sessions WHERE user_id=?',u.id); });
        return json(200,{recoveryCode:next});
      }
      const {u,token}=authenticate(req);
      if(req.method==='GET' && path==='/state') return json(200,state(u));
      if(req.method==='POST' && path==='/auth/logout') { run('DELETE FROM sessions WHERE hash=?',hash(token)); res.setHeader('Set-Cookie',cookie('')); return json(200,{ok:true}); }
      if(req.method==='PATCH' && path==='/profile') {
        const address=email(body.email); const exists=query('SELECT id FROM users WHERE email=? AND id<>?',address,u.id); if(exists) fail(409,'Email already registered.');
        run('UPDATE users SET name=?,email=?,phone=?,notifications_enabled=? WHERE id=?',text(body.name,'Name',100),address,text(body.phone??'','Phone',30,false),body.notificationsEnabled===false?0:1,u.id);
        return json(200,state(query('SELECT * FROM users WHERE id=?',u.id)));
      }
      if(req.method==='POST' && path==='/auth/password') {
        rateLimit(req,'password',10); if(!matches(body.currentPassword,u.password_hash)) fail(400,'Current password is incorrect.');
        const code=recovery(); const encoded=passwordHash(password(body.password));
        transaction(()=>{run('UPDATE users SET password_hash=?,recovery_hash=? WHERE id=?',encoded,hash(code),u.id);run('DELETE FROM sessions WHERE user_id=? AND hash<>?',u.id,hash(token));});
        return json(200,{recoveryCode:code});
      }
      if(req.method==='POST' && path==='/devices') {
        const device=text(body.token,'Push token',200); if(!/^(ExponentPushToken|ExpoPushToken)\[[A-Za-z0-9_-]+\]$/.test(device)) fail(400,'Invalid notification token.');
        run('INSERT INTO devices(token,user_id) VALUES(?,?) ON CONFLICT(token) DO UPDATE SET user_id=excluded.user_id',device,u.id); return json(200,{ok:true});
      }
      if(req.method==='POST' && path==='/notifications/read') { if(body.id) run('UPDATE notifications SET is_read=1 WHERE id=? AND user_id=?',body.id,u.id); else run('UPDATE notifications SET is_read=1 WHERE user_id=?',u.id); return json(200,{ok:true}); }
      if(req.method==='POST' && path==='/users') { if(u.role!=='Admin') fail(403,'Administrator access required.'); if(!roles.includes(body.role)) fail(400,'Invalid role.'); const result=createUser(body,body.role); return json(201,result); }
      if(req.method==='PATCH' && path.startsWith('/users/')) {
        if(u.role!=='Admin') fail(403,'Administrator access required.'); const id=path.slice(7); const target=query('SELECT * FROM users WHERE id=?',id); if(!target) fail(404,'User not found.');
        if(typeof body.active!=='boolean') fail(400,'Choose an account status.'); if(id===u.id) fail(400,'You cannot disable your own account.');
        if(!body.active && query("SELECT id FROM reports WHERE collector=? AND status IN ('Assigned','In Progress')",id)) fail(409,'Reassign or complete this collector’s active tasks first.');
        transaction(()=>{run('UPDATE users SET active=? WHERE id=?',body.active?1:0,id);if(!body.active)run('DELETE FROM sessions WHERE user_id=?',id);});return json(200,state(u));
      }
      if(req.method==='POST' && path==='/media') {
        if(u.role!=='Resident') fail(403,'Only residents can upload report evidence.'); rateLimit(req,'upload',15);
        const mime=body.mime; if(!['image/jpeg','image/png','image/webp'].includes(mime)) fail(400,'Use a JPG, PNG, or WebP photo.');
        if(typeof body.base64!=='string' || !/^[A-Za-z0-9+/]*={0,2}$/.test(body.base64)) fail(400,'Invalid image data.');
        const content=Buffer.from(body.base64,'base64'); if(content.length>5*1024*1024 || content.length<12) fail(400,'Photo must be between 12 bytes and 5 MB.');
        const valid=mime==='image/jpeg'?content[0]===255&&content[1]===216: mime==='image/png'?content.subarray(0,8).equals(Buffer.from([137,80,78,71,13,10,26,10])):content.toString('ascii',0,4)==='RIFF'&&content.toString('ascii',8,12)==='WEBP';
        if(!valid)fail(400,'Photo format does not match its contents.');const id=randomUUID();run('INSERT INTO media VALUES(?,?,?,?,?)',id,u.id,mime,content,now());return json(201,{id});
      }
      if(req.method==='POST' && path==='/reports') {
        if(u.role!=='Resident')fail(403,'Only residents can submit reports.');rateLimit(req,'report',20);
        const clientId=text(body.id,'Report reference',100); if(!/^[A-Za-z0-9-]+$/.test(clientId))fail(400,'Invalid reference.');
        const existing=query('SELECT * FROM reports WHERE id=?',clientId);if(existing){if(existing.resident!==u.id)fail(409,'Reference already used.');return json(200,{report:reportValue(existing)});}
        const photo=query('SELECT id FROM media WHERE id=? AND owner=?',body.photoId??'',u.id);if(!photo)fail(400,'Upload a photo first.');
        if(!kinds.includes(body.type))fail(400,'Choose a garbage type.');
        const hasCoords=body.latitude!==undefined||body.longitude!==undefined;
        if(hasCoords&&(!Number.isFinite(body.latitude)||Math.abs(body.latitude)>90||!Number.isFinite(body.longitude)||Math.abs(body.longitude)>180))fail(400,'Invalid coordinates.');
        const created=now();const r={title:text(body.title,'Title',80),description:text(body.description,'Description',500),address:text(body.address,'Address',500),type:body.type,photoId:photo.id,...(hasCoords?{latitude:body.latitude,longitude:body.longitude}:{}),history:[{status:'Submitted',date:created,note:'Report received. Waiting for barangay review.'}]};
        const admins=all("SELECT id FROM users WHERE role='Admin' AND active=1");
        transaction(()=>{run('INSERT INTO reports(id,resident,status,created,body) VALUES(?,?,?,?,?)',clientId,u.id,'Submitted',created,JSON.stringify(r));notify(u.id,clientId,'Report submitted',r.title);admins.forEach(a=>notify(a.id,clientId,'New report',r.title));});
        void pushUpdates(admins.map(a=>a.id),clientId,'New report',r.title);return json(201,{report:reportValue(query('SELECT * FROM reports WHERE id=?',clientId))});
      }
      if(req.method==='PATCH' && path.startsWith('/reports/')) {
        const id=path.slice(9);const r=query('SELECT * FROM reports WHERE id=?',id);if(!r||!permitted(u,r))fail(404,'Report not found.');
        if(body.revision!==r.revision)fail(409,'This report changed. Refresh and try again.');
        const status=body.status; const note=text(body.note??'','Note',1000,false);
        const allowed=u.role==='Admin'? (status==='Under Review'&&r.status==='Submitted') || (status==='Assigned'&&['Submitted','Under Review','Assigned'].includes(r.status)) || (status==='Rejected'&&['Submitted','Under Review'].includes(r.status)):u.role==='Collector'&&r.collector===u.id&&((r.status==='Assigned'&&status==='In Progress')||(r.status==='In Progress'&&status==='Resolved'));
        if(!allowed)fail(403,'This status change is not allowed.');
        if(status==='Rejected'&&!note)fail(400,'Add a rejection reason.');
        const collector=status==='Assigned'?body.collector:r.collector;
        if(status==='Assigned'&&!query("SELECT id FROM users WHERE id=? AND role='Collector' AND active=1",collector??''))fail(400,'Choose an active collector.');
        const value=JSON.parse(r.body);value.history.push({status,date:now(),note:note||`Status updated to ${status}.`});
        const recipients=[r.resident,...all("SELECT id FROM users WHERE role='Admin' AND active=1").map(a=>a.id),...(collector?[collector]:[]),...(r.collector&&r.collector!==collector?[r.collector]:[])];
        transaction(()=>{run('UPDATE reports SET status=?,collector=?,revision=revision+1,body=? WHERE id=?',status,collector??null,JSON.stringify(value),id);[...new Set(recipients)].forEach(id2=>notify(id2,id,`Report ${status.toLowerCase()}`,value.title));});
        void pushUpdates(recipients,id,`Report ${status.toLowerCase()}`,value.title);return json(200,{report:reportValue(query('SELECT * FROM reports WHERE id=?',id))});
      }
      fail(404,'Endpoint not found.');
    } catch(e) { if(!res.headersSent)json(e.status??500,{error:e.status?e.message:'The server could not complete the request. Please retry.'}); else res.end(); if(!e.status)console.error('Request failed:',e.message); }
  });
  return {server,db,createUser,close:()=>new Promise(resolve=>{server.close(()=>{db.close();resolve();});server.closeIdleConnections();})};
}
