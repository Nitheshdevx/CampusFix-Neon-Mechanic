const express = require('express'), jwt = require('jsonwebtoken'), bcrypt = require('bcryptjs');
const fs = require('fs'), path = require('path'), http = require('http');
const { WebSocketServer } = require('ws');

const app = express(), SECRET = process.env.JWT_SECRET || 'campusfix-dev-secret';
const DB = path.join(__dirname, 'db.json');

app.use(express.json({ limit: '4mb' }));

// index.html is served only by the '/' route below, so db.json is NOT publicly downloadable

const load = () => JSON.parse(fs.readFileSync(DB));
const save = d => fs.writeFileSync(DB, JSON.stringify(d, null, 1));

if (!fs.existsSync(DB)) {
  const h = p => bcrypt.hashSync(p, 8), locations = [];
  let id = 1;

  const campusBlocks = [
    ['Main Block', [1, 2, 3]],
    ['Additional Block', [1, 2, 3]],
    ['Library', [1]],
    ['Science Block', [1, 2]],
    ['Hostel Block', [1, 2, 3]],
    ['Admin Block', [1, 2]],
    ['Canteen Block', [0, 1]],
    ['Sports Complex', [0, 1]]
  ];
  campusBlocks.forEach(([b, fl]) => fl.forEach(f => {
    const rooms = f === 0 ? ['Ground-01', 'Ground-02', 'Ground-03'] : [`${f}01`, `${f}02`, `${f}03`];
    rooms.forEach(room => locations.push({ id: id++, building: b, floor: f, room }));
  }));
  [['Transport Yard', ['Bus Bay', 'Driver Room', 'Parking']], ['Maintenance Bay', ['Workshop', 'Tool Room', 'Storage']], ['Main Gate', ['Security Desk', 'Visitor Area', 'Parking Gate']], ['Medical Center', ['Reception', 'Treatment Room', 'Pharmacy']]]
    .forEach(([b, rooms]) => rooms.forEach(room => locations.push({ id: id++, building: b, floor: 0, room })));

  save({
    users: [
      {
        id: 1,
        name: 'Admin',
        email: 'admin@campus.com',
        password: h('admin123'),
        role: 'admin'
      },
      {
        id: 2,
        name: 'Arun Kumar',
        email: 'staff@campus.com',
        password: h('staff123'),
        role: 'staff',
        department: 'Electrical'
      },
      {
        id: 3,
        name: 'Priya S',
        email: 'student@campus.com',
        password: h('student123'),
        role: 'student',
        department: 'CSE'
      },
      {
        id: 4,
        name: 'Meena R',
        email: 'plumber@campus.com',
        password: h('staff123'),
        role: 'staff',
        department: 'Plumbing'
      },
      { id: 5, name: 'Ravi Mechanic', email: 'mechanic@campus.com', password: h('staff123'), role: 'staff', department: 'Mechanical' },
      { id: 6, name: 'Karthik Driver', email: 'driver@campus.com', password: h('staff123'), role: 'staff', department: 'Driver / Transport' },
      { id: 7, name: 'Anitha Canteen', email: 'canteen@campus.com', password: h('staff123'), role: 'staff', department: 'Canteen' },
      { id: 8, name: 'Suresh Bathroom', email: 'bathroom@campus.com', password: h('staff123'), role: 'staff', department: 'Bathroom' },
      { id: 10, name: 'Vijay Security', email: 'security@campus.com', password: h('staff123'), role: 'staff', department: 'Security' },
      { id: 11, name: 'Mohan Grounds', email: 'grounds@campus.com', password: h('staff123'), role: 'staff', department: 'Grounds / Garden' }
    ],

    categories: ['Electrical', 'IT', 'Plumbing', 'Furniture', 'Cleaning', 'Mechanical', 'Transport', 'Canteen', 'Bathroom', 'Security', 'Grounds & Garden', 'Air Cooler / AC Technician', 'Medical / First Aid']
      .map((name, i) => ({
        id: i + 1,
        name
      })),

    locations,
    complaints: [],
    seq: 0
  });
}

const auth = (...roles) => (req, res, next) => {
  try {
    req.user = jwt.verify(
      (req.headers.authorization || '').slice(7),
      SECRET
    );
  } catch {
    return res.status(401).json({
      error: 'Please log in'
    });
  }

  if (roles.length && !roles.includes(req.user.role)) {
    return res.status(403).json({
      error: 'Not allowed'
    });
  }

  next();
};

const sign = u => ({
  token: jwt.sign(
    {
      id: u.id,
      role: u.role,
      name: u.name
    },
    SECRET,
    {
      expiresIn: '7d'
    }
  ),

  user: {
    id: u.id,
    name: u.name,
    role: u.role,
    email: u.email
  }
});

const loc = (d, id) =>
  d.locations.find(l => l.id == id);

const impactOf = n => n >= 50 ? 'Critical' : n >= 10 ? 'Important' : 'Normal';

const en = (d, c, u) => {
  const l = loc(d, c.locationId), aff = c.affected || [];
  const canRead = !!u && (u.role === 'admin' || c.userId === u.id || (u.role === 'staff' && c.assignedTo === u.id));

  return {
    ...c,
    affected: undefined,
    afterImage: c.afterImage || null,
    affectedCount: 1 + aff.length,
    impact: impactOf(1 + aff.length),
    iAffected: !!u && aff.includes(u.id),
    canChat: canRead && c.status !== 'Closed',
    messages: canRead ? (c.messages || []) : [],
    category: d.categories.find(x => x.id == c.categoryId)?.name,
    building: l?.building,
    location: l
      ? `${l.building}, Floor ${l.floor}, Room ${l.room}`
      : '',
    student: d.users.find(u => u.id == c.userId)?.name,
    staff: d.users.find(u => u.id == c.assignedTo)?.name,
    staffDept: d.users.find(u => u.id == c.assignedTo)?.department
  };
};

const canSee = (u, c) =>
  u.role === 'admin' ||
  (u.role === 'student' && (c.userId === u.id || (c.affected || []).includes(u.id))) ||
  (u.role === 'staff' && c.assignedTo === u.id);

const log = (c, status, by, comment) => {
  c.history.push({ status, by, comment: comment || '', at: new Date().toISOString() });
  // real-time push to the student, the assigned staff and every admin
  send(u => u.role === 'admin' || u.id === c.userId || u.id === c.assignedTo,
       { type: 'update', id: c.id, status, by, comment: comment || '' });
};

// only accept real base64 image data-URLs (also keeps <img src> safe)
const cleanImg = v =>
  typeof v === 'string' && v.length < 2.2e6 &&
  /^data:image\/(png|jpe?g|gif|webp);base64,[A-Za-z0-9+/=]+$/.test(v) ? v : null;

const wrap = fn => (req, res) => {
  try {
    fn(req, res);
  } catch (e) {
    res.status(500).json({
      error: e.message
    });
  }
};


// ---------------- AUTH ----------------

app.post('/api/auth/register', wrap((req, res) => {
  const {
    name,
    email,
    password,
    department
  } = req.body;

  const d = load();

  if (!name || !email || !password || password.length < 6) {
    return res.status(400).json({
      error: 'Name, email and 6+ char password required'
    });
  }

  if (d.users.some(u => u.email === email.toLowerCase())) {
    return res.status(400).json({
      error: 'Email already registered'
    });
  }

  const u = {
    id: Date.now(),
    name,
    email: email.toLowerCase(),
    password: bcrypt.hashSync(password, 8),
    role: 'student',
    department: department || ''
  };

  d.users.push(u);
  save(d);

  res.json(sign(u));
}));


app.post('/api/auth/login', wrap((req, res) => {
  const d = load();

  const u = d.users.find(
    x => x.email === (req.body.email || '').toLowerCase()
  );

  if (!u || !bcrypt.compareSync(
    req.body.password || '',
    u.password
  )) {
    return res.status(401).json({
      error: 'Wrong email or password'
    });
  }

  res.json(sign(u));
}));


// ---------------- META ----------------

app.get('/api/meta', auth(), wrap((req, res) => {
  const d = load();

  res.json({
    categories: d.categories,
    locations: d.locations
  });
}));


app.get('/api/staff', auth(), wrap((req, res) => {
  const d = load(), open = c => !['Resolved', 'Closed'].includes(c.status);
  res.json(d.users.filter(u => u.role === 'staff').map(({ id, name, department }) => ({
    id, name, department, online: isOnline(id),
    active: d.complaints.filter(c => c.assignedTo === id && open(c)).length,
    done: d.complaints.filter(c => c.assignedTo === id && !open(c)).length
  })));
}));

// ---------------- ADMIN: USER MANAGEMENT ----------------
app.get('/api/users', auth('admin'), wrap((req, res) =>
  res.json(load().users.map(({ password, ...u }) => u))));

app.post('/api/users', auth('admin'), wrap((req, res) => {
  const { name, email, password, role, department } = req.body, d = load();
  if (!name || !email || !password || password.length < 6 || !['student', 'staff'].includes(role))
    return res.status(400).json({ error: 'Name, email, 6+ char password and role (student/staff) required' });
  if (d.users.some(u => u.email === email.toLowerCase()))
    return res.status(400).json({ error: 'Email already registered' });
  const u = { id: Date.now(), name, email: email.toLowerCase(), password: bcrypt.hashSync(password, 8), role, department: department || '' };
  d.users.push(u); save(d);
  const { password: _, ...safe } = u; res.json(safe);
}));

app.delete('/api/users/:id', auth('admin'), wrap((req, res) => {
  const d = load(), u = d.users.find(x => x.id == req.params.id);
  if (!u || u.role === 'admin') return res.status(400).json({ error: 'Cannot remove this user' });
  if (d.complaints.some(c => c.assignedTo == u.id && !['Resolved', 'Closed'].includes(c.status)))
    return res.status(400).json({ error: 'Staff has open tasks - reassign them first' });
  d.users = d.users.filter(x => x !== u); save(d); res.json({ ok: true });
}));


// ---------------- COMPLAINTS ----------------

app.post('/api/complaints', auth('student', 'admin'), wrap((req, res) => {
  const d = load();

  const {
    categoryId,
    locationId,
    title,
    description,
    priority,
    image
  } = req.body;

  if (!categoryId || !locationId || !title || !description) {
    return res.status(400).json({
      error: 'Category, location, title and description required'
    });
  }

  d.seq++;

  const c = {
    id: `CF-2026-${String(d.seq).padStart(5, '0')}`,
    userId: req.user.id,
    categoryId: +categoryId,
    locationId: +locationId,
    title,
    description,

    priority: ['Low', 'Medium', 'High'].includes(priority)
      ? priority
      : 'Medium',

    image: cleanImg(image),
    afterImage: null,
    affected: [],
    messages: [],
    status: 'Submitted',
    assignedTo: null,
    expected: null,
    history: [],
    feedback: null,
    createdAt: new Date().toISOString(),
    resolvedAt: null
  };

  log(
    c,
    'Submitted',
    req.user.name,
    'Complaint created'
  );

  d.complaints.push(c);
  save(d);

  res.json(en(d, c, req.user));
}));


app.get('/api/complaints', auth(), wrap((req, res) => {
  const d = load();
  const active = d.complaints.filter(c => canSee(req.user, c) && !['Resolved', 'Closed'].includes(c.status));

  res.json(
    active
      .map(c => en(d, {
        ...c,
        image: null,
        afterImage: null,
        messages: []
      }, req.user))
      .reverse()
  );
}));

// ---------------- COMPLAINT HISTORY ----------------
// Resolved/closed complaints are intentionally kept out of the active list.
app.get('/api/history', auth(), wrap((req, res) => {
  const d = load();
  res.json(
    d.complaints
      .filter(c => canSee(req.user, c) && ['Resolved', 'Closed'].includes(c.status))
      .map(c => en(d, { ...c, image: null, messages: [] }, req.user))
      .reverse()
  );
}));

// Admin can permanently remove a resolved/closed complaint from history.
app.delete('/api/history/:id', auth('admin'), wrap((req, res) => {
  const d = load();
  const c = d.complaints.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'History item not found' });
  if (!['Resolved', 'Closed'].includes(c.status)) {
    return res.status(400).json({ error: 'Only resolved/closed complaints can be deleted from history' });
  }
  d.complaints = d.complaints.filter(x => x.id !== c.id);
  save(d);
  send(() => true, { type: 'historyDeleted', id: c.id });
  res.json({ ok: true });
}));



// ---------------- AI-STYLE SUGGESTION (rule based, no external service) ----------------

const RULES = {
  Electrical: ['fan', 'light', 'bulb', 'tube', 'tubelight', 'switch', 'socket', 'wire', 'wiring', 'spark', 'sparks', 'sparking', 'short circuit', 'power', 'electric', 'electrical', 'ac', 'air conditioner', 'mcb', 'fuse', 'plug', 'shock', 'voltage', 'regulator', 'cooler'],
  IT: ['projector', 'computer', 'pc', 'wifi', 'wi-fi', 'internet', 'network', 'lan', 'printer', 'monitor', 'keyboard', 'mouse', 'router', 'software', 'screen', 'laptop', 'smart board', 'speaker', 'mic', 'cpu'],
  Plumbing: ['water', 'leak', 'leaking', 'leakage', 'tap', 'pipe', 'drain', 'drainage', 'toilet', 'flush', 'washroom', 'bathroom', 'sink', 'tank', 'overflow', 'flood', 'flooding', 'seepage', 'urinal', 'blocked', 'clog'],
  Furniture: ['bench', 'desk', 'chair', 'table', 'door', 'window', 'lock', 'hinge', 'blackboard', 'whiteboard', 'cupboard', 'locker', 'almirah', 'furniture', 'handle', 'stair', 'staircase', 'railing'],
  Cleaning: ['dirty', 'clean', 'garbage', 'dustbin', 'trash', 'smell', 'stink', 'cobweb', 'dust', 'sweep', 'mop', 'waste', 'litter', 'insects', 'mosquito', 'cockroach', 'rats']
};
const has = (text, term) => new RegExp('(^|[^a-z])' + term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '($|[^a-z])').test(text);

function suggest(d, title, description) {
  const text = `${title || ''} ${description || ''}`.toLowerCase();
  const scores = {}, found = {};
  Object.entries(RULES).forEach(([cat, words]) => {
    words.forEach(w => { if (has(text, w)) { scores[cat] = (scores[cat] || 0) + 1; (found[cat] = found[cat] || []).push(w); } });
  });
  const best = Object.keys(scores).sort((a, b) => scores[b] - scores[a])[0] || null;
  const catRow = best && d.categories.find(c => c.name === best);

  const water = /water|leak|flood|seep|overflow|wet/.test(text);
  const elec = /electric|wire|wiring|socket|switch|panel|mcb|fuse|spark|short circuit|plug|board/.test(text);
  let priority = 'Medium', reason = 'Standard maintenance request.';
  if (water && elec) { priority = 'High'; reason = 'Possible electrical + water safety issue.'; }
  else if (/spark|short.?circuit|shock|electrocut|smoke|burning|fire|gas|exposed wire/.test(text)) { priority = 'High'; reason = 'Possible fire or electric-shock hazard.'; }
  else if (/flood|burst|collapse|falling|fell down|broken stair|unsafe|danger|injur|crack(ed)? ceiling/.test(text)) { priority = 'High'; reason = 'Possible safety risk to students.'; }
  else if (/not working|stopped|dead|broken|no power|leak|blocked|overflow/.test(text)) { priority = 'Medium'; reason = 'Equipment or facility is out of use.'; }
  else if (/paint|scratch|stain|cobweb|dust|minor|small|slightly|noise|sound/.test(text) && best !== 'Electrical') { priority = 'Low'; reason = 'Looks cosmetic or minor.'; }

  return {
    category: best,
    categoryId: catRow ? catRow.id : null,
    priority,
    reason,
    keywords: best ? found[best].slice(0, 4) : []
  };
}

app.post('/api/suggest', auth('student', 'admin'), wrap((req, res) => {
  const { title, description } = req.body || {};
  res.json(suggest(load(), String(title || '').slice(0, 200), String(description || '').slice(0, 1000)));
}));


// ---------------- DUPLICATE DETECTION ----------------

const STOP = new Set('the and for not with this that has have was are its near room working work issue problem please from very some only into there their when then than been being also just more most much any all our out off but can cant dont'.split(' '));
const words = t => (String(t || '').toLowerCase().match(/[a-z]{3,}/g) || []).filter(w => !STOP.has(w));

app.get('/api/complaints/similar', auth('student', 'admin'), wrap((req, res) => {
  const d = load(), l = loc(d, req.query.locationId), cat = +req.query.categoryId;
  const mine = new Set(words(req.query.title));
  if (!l || !mine.size) return res.json([]);

  const out = d.complaints
    .filter(c => !['Resolved', 'Closed'].includes(c.status) && c.categoryId === cat)
    .map(c => {
      const cl = loc(d, c.locationId);
      const overlap = words(c.title).filter(w => mine.has(w)).length;
      const sameRoom = c.locationId === l.id, sameBuilding = cl && cl.building === l.building;
      const hit = (sameRoom && overlap >= 1) || (sameBuilding && overlap >= 2);
      return { c, hit, score: (sameRoom ? 2 : 0) + overlap };
    })
    .filter(x => x.hit)
    .sort((a, b) => b.score - a.score)
    .slice(0, 3)
    .map(({ c }) => {
      const e = en(d, c, req.user);
      return {
        id: c.id, title: c.title, status: c.status, location: e.location,
        affectedCount: e.affectedCount, isMine: c.userId === req.user.id, iAffected: e.iAffected
      };
    });
  res.json(out);
}));


app.get('/api/complaints/:id', auth(), wrap((req, res) => {
  const d = load();

  const c = d.complaints.find(
    x => x.id === req.params.id
  );

  if (!c || !canSee(req.user, c)) {
    return res.status(404).json({
      error: 'Not found'
    });
  }

  res.json(en(d, c, req.user));
}));


app.post('/api/complaints/:id/assign', auth('admin'), wrap((req, res) => {
  const d = load();

  const c = d.complaints.find(
    x => x.id === req.params.id
  );

  const s = d.users.find(
    u => u.id == req.body.staffId &&
      u.role === 'staff'
  );

  if (!c || !s) {
    return res.status(400).json({
      error: 'Complaint or staff not found'
    });
  }

  if (['Resolved', 'Closed'].includes(c.status)) {
    return res.status(400).json({
      error: 'Already resolved'
    });
  }

  if (['Low', 'Medium', 'High'].includes(req.body.priority)) {
    c.priority = req.body.priority;
  }

  if (c.status === 'Submitted') {
    log(
      c,
      'Reviewed',
      req.user.name,
      'Verified by admin'
    );
  }

  c.assignedTo = s.id;
  c.expected = req.body.expected || null;
  c.status = 'Assigned';

  log(
    c,
    'Assigned',
    req.user.name,
    `Assigned to ${s.name}`
  );

  save(d);

  res.json(en(d, c, req.user));
}));


app.post('/api/complaints/:id/status', auth('staff', 'admin'), wrap((req, res) => {
  const d = load();

  const c = d.complaints.find(
    x => x.id === req.params.id
  );

  const {
    status,
    comment
  } = req.body;

  if (!c || !canSee(req.user, c)) {
    return res.status(404).json({
      error: 'Not found'
    });
  }

  if (!['In Progress', 'Resolved'].includes(status)) {
    return res.status(400).json({
      error: 'Invalid status'
    });
  }

  if (status === 'Resolved') {
    const after = cleanImg(req.body.afterImage);
    if (!after) {
      return res.status(400).json({
        error: 'After-repair photo is required before marking a complaint as resolved'
      });
    }
    c.afterImage = after;
    c.resolvedAt = new Date().toISOString();
  }

  c.status = status;

  log(
    c,
    status,
    req.user.name,
    comment
  );

  save(d);

  res.json(en(d, c, req.user));
}));


app.post('/api/complaints/:id/feedback', auth('student'), wrap((req, res) => {
  const d = load();

  const c = d.complaints.find(
    x => x.id === req.params.id
  );

  const r = +req.body.rating;

  if (
    !c ||
    c.userId !== req.user.id ||
    c.status !== 'Resolved'
  ) {
    return res.status(400).json({
      error: 'Not ready for feedback'
    });
  }

  if (!(r >= 1 && r <= 5)) {
    return res.status(400).json({
      error: 'Rating 1-5 required'
    });
  }

  c.feedback = {
    rating: r,
    comment: req.body.comment || ''
  };

  c.status = 'Closed';

  log(
    c,
    'Closed',
    req.user.name,
    `Rated ${r}/5`
  );

  save(d);

  res.json(en(d, c, req.user));
}));


// ---------------- AFFECTED STUDENTS ("me too") ----------------

const notifyAffected = (d, c) =>
  send(u => u.role === 'admin' || u.id === c.userId || u.id === c.assignedTo,
       { type: 'affected', id: c.id, count: 1 + (c.affected || []).length });

app.post('/api/complaints/:id/affected', auth('student'), wrap((req, res) => {
  const d = load(), c = d.complaints.find(x => x.id === req.params.id);
  if (!c || ['Resolved', 'Closed'].includes(c.status)) return res.status(400).json({ error: 'Complaint not open' });
  if (c.userId === req.user.id) return res.status(400).json({ error: 'You reported this one already' });
  c.affected = c.affected || [];
  if (!c.affected.includes(req.user.id)) c.affected.push(req.user.id);
  save(d); notifyAffected(d, c);
  res.json(en(d, c, req.user));
}));

app.delete('/api/complaints/:id/affected', auth('student'), wrap((req, res) => {
  const d = load(), c = d.complaints.find(x => x.id === req.params.id);
  if (!c) return res.status(404).json({ error: 'Not found' });
  c.affected = (c.affected || []).filter(id => id !== req.user.id);
  save(d); notifyAffected(d, c);
  res.json({ ok: true });
}));


// ---------------- COMPLAINT CHAT ----------------

app.post('/api/complaints/:id/messages', auth(), wrap((req, res) => {
  const d = load(), c = d.complaints.find(x => x.id === req.params.id);
  const u = req.user;
  const allowed = c && (u.role === 'admin' || c.userId === u.id || (u.role === 'staff' && c.assignedTo === u.id));
  if (!allowed) return res.status(404).json({ error: 'Not found' });
  if (c.status === 'Closed') return res.status(400).json({ error: 'Complaint is closed' });

  const text = String((req.body || {}).text || '').trim().slice(0, 500);
  if (!text) return res.status(400).json({ error: 'Message is empty' });

  const m = { userId: u.id, name: u.name, role: u.role, text, at: new Date().toISOString() };
  (c.messages = c.messages || []).push(m);
  save(d);

  send(x => x.role === 'admin' || x.id === c.userId || x.id === c.assignedTo,
       { type: 'chat', id: c.id, userId: u.id, name: u.name, text });
  res.json(m);
}));


// ---------------- ANALYTICS ----------------

function analytics(d, cs) {
  const DAY = 864e5, now = Date.now();
  const isOpen = c => !['Resolved', 'Closed'].includes(c.status);
  const days = (a, b) => (new Date(b) - new Date(a)) / DAY;

  const overdue = cs
    .filter(c => isOpen(c) && c.expected && new Date(c.expected + 'T23:59:59') < now)
    .map(c => ({
      id: c.id, title: c.title, location: c.location, staff: c.staff,
      daysLate: Math.max(1, Math.ceil((now - new Date(c.expected + 'T23:59:59')) / DAY))
    }));

  // group by building + category
  const groups = {};
  cs.forEach(c => {
    const k = `${c.building}|${c.category}`;
    const g = groups[k] = groups[k] || { building: c.building, category: c.category, total: 0, last30: 0, prev30: 0, rooms: new Set() };
    const age = now - new Date(c.createdAt);
    g.total++;
    if (age <= 30 * DAY) { g.last30++; g.rooms.add(c.locationId); }
    else if (age <= 60 * DAY) g.prev30++;
  });
  const G = Object.values(groups);

  const recurring = G.filter(g => g.last30 >= 3).sort((a, b) => b.last30 - a.last30).slice(0, 5).map(g => {
    const rooms = g.rooms.size;
    const growth = g.prev30 ? Math.round((g.last30 - g.prev30) / g.prev30 * 100) : null;
    return {
      building: g.building, category: g.category, count: g.last30, rooms, growth,
      message: rooms > 1
        ? `${g.last30} ${g.category} complaints across ${rooms} rooms - possible infrastructure problem.`
        : `${g.last30} repeat ${g.category} complaints from the same room.`,
      recommendation: g.last30 >= 5 || (growth !== null && growth >= 35)
        ? 'Schedule a preventive inspection.' : 'Investigate the underlying cause instead of patching each complaint.'
    };
  });

  const hotspots = G.sort((a, b) => b.total - a.total).slice(0, 5)
    .map(g => ({ label: `${g.building} - ${g.category}`, count: g.total }));

  const trend = [];
  for (let i = 5; i >= 0; i--) {
    const t = new Date(); t.setDate(1); t.setMonth(t.getMonth() - i);
    const key = `${t.getFullYear()}-${String(t.getMonth() + 1).padStart(2, '0')}`;
    const n = cs.filter(c => { const x = new Date(c.createdAt); return `${x.getFullYear()}-${String(x.getMonth() + 1).padStart(2, '0')}` === key; }).length;
    trend.push([key, n]);
  }

  const cat = {};
  cs.filter(c => c.resolvedAt).forEach(c => { (cat[c.category] = cat[c.category] || []).push(days(c.createdAt, c.resolvedAt)); });
  const avgByCategory = Object.entries(cat).map(([k, v]) => [k, +(v.reduce((a, b) => a + b, 0) / v.length).toFixed(1)]);

  const staffPerf = d.users.filter(u => u.role === 'staff').map(u => {
    const mine = cs.filter(c => c.assignedTo === u.id), done = mine.filter(c => c.resolvedAt);
    const rated = mine.filter(c => c.feedback);
    return {
      name: u.name, department: u.department || '', assigned: mine.length, resolved: done.length,
      avgDays: done.length ? +(done.reduce((s, c) => s + days(c.createdAt, c.resolvedAt), 0) / done.length).toFixed(1) : null,
      rating: rated.length ? +(rated.reduce((s, c) => s + c.feedback.rating, 0) / rated.length).toFixed(1) : null,
      overdue: overdue.filter(o => o.staff === u.name).length
    };
  });

  return { overdue, recurring, hotspots, trend, avgByCategory, staffPerf };
}

app.get('/api/stats', auth('admin'), wrap((req, res) => {
  const d = load();

  const cs = d.complaints.map(
    c => en(d, c)
  );

  const count = k =>
    Object.entries(
      cs.reduce(
        (a, c) => {
          a[c[k]] = (a[c[k]] || 0) + 1;
          return a;
        },
        {}
      )
    );

  const done = cs.filter(
    c => c.resolvedAt
  );

  const avg = done.length
    ? done.reduce(
        (s, c) =>
          s +
          (
            new Date(c.resolvedAt) -
            new Date(c.createdAt)
          ),
        0
      ) / done.length / 864e5
    : 0;

  res.json({
    ...analytics(d, cs),
    total: cs.length,

    pending: cs.filter(
      c => !['Resolved', 'Closed'].includes(c.status)
    ).length,

    resolved: done.length,

    high: cs.filter(
      c =>
        c.priority === 'High' &&
        !c.resolvedAt
    ).length,

    avgDays: avg.toFixed(1),

    byCategory: count('category'),

    byBuilding: count('building')
  });
}));


// ---------------- HOME PAGE ----------------

// FIXED: Serve index.html directly
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'index.html'));
});


// ---------------- START SERVER ----------------

// ---------------- REAL-TIME (WebSocket) ----------------
const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

function send(pred, msg) {
  const m = JSON.stringify(msg);
  wss.clients.forEach(w => w.readyState === 1 && w.user && pred(w.user) && w.send(m));
}
function isOnline(id) {
  return [...wss.clients].some(w => w.user && w.user.id == id && w.readyState === 1);
}
wss.on('connection', (w, req) => {
  try { w.user = jwt.verify(new URL(req.url, 'http://x').searchParams.get('token'), SECRET); }
  catch { return w.close(); }
  send(() => true, { type: 'presence' });
  w.on('close', () => setTimeout(() => send(() => true, { type: 'presence' }), 300));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => console.log(`CampusFix running -> http://localhost:${PORT}`));