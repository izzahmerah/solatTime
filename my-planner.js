function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

const today = new Date();
let currentDateStr = getLocalDateStr(today);

const DEFAULT_SUNNAH = ['Tahajjud', 'Dhuha', 'Witir'];
const ALL_SUNNAH = ['Tahajjud', 'Dhuha', 'Witir', 'Tarawih', 'Hajat', 'Istikharah', 'Taubat', 'Syukur', 'Awwabin', 'Other'];
const ALL_RAWATIB = [
  { name: 'Fajr', before: true, after: false },
  { name: 'Dhuhr', before: true, after: true },
  { name: 'Asr', before: true, after: false },
  { name: 'Maghrib', before: true, after: true },
  { name: 'Isha', before: true, after: true }
];
const FASTING_TYPES = [
  'Monday', 'Thursday', 'Ayyamul Bidh', 'Ramadan', 
  'Qada Ramadan', 'Six Days of Shawwal', 'Arafah', 'Ashura', 'Nazar'
];
const DHIKR_OPTIONS = ['Subhanallah', 'Alhamdulillah', 'Allahu Akbar', 'Astaghfirullah', 'La ilaha illallah', 'Selawat', 'Others'];

let currentDhikr = 'Subhanallah';
let currentCount = 0;
let currentTarget = 0;

/// local storage
function getStorage(key, defaultVal) {
  const val = localStorage.getItem(key);
  if (!val) return defaultVal;
  try {
    return JSON.parse(val);
  } catch (e) {
    return defaultVal;
  }
}

function setStorage(key, val) {
  localStorage.setItem(key, JSON.stringify(val));
}

function getDailyData(dateStr) {
  const key = `solattime_data_${dateStr}`;
  let data = getStorage(key, {});
  
  if (!data.sunnahCompleted || !Array.isArray(data.sunnahCompleted)) data.sunnahCompleted = [];
  if (!data.fasting || !Array.isArray(data.fasting)) data.fasting = [];
  if (!data.zikirSessions || !Array.isArray(data.zikirSessions)) data.zikirSessions = [];
  
  return data;
}

function saveDailyData(dateStr, data) {
  setStorage(`solattime_data_${dateStr}`, data);
}

function renderWeeklySelector() {
  const container = document.getElementById('weeklySelector');
  container.innerHTML = '';
  
  const now = new Date(); 
  const todayStr = getLocalDateStr(now);

  for (let i = 0; i < 7; i++) {
    const d = new Date(now);
    d.setDate(now.getDate() - now.getDay() + i); 
    const dStr = getLocalDateStr(d); 
    
    const isFuture = dStr > todayStr; 
    const isActive = dStr === currentDateStr;

    const pill = document.createElement('div');
    
    pill.className = `date-pill ${isActive ? 'active' : ''} ${isFuture ? 'disabled' : ''}`;
    
    pill.innerHTML = `
      <div class="day-name">${d.toLocaleDateString('en-US', { weekday: 'short' })}</div>
      <div class="day-num">${d.getDate()}</div>
    `;

    if (!isFuture) {
      pill.onclick = () => {
        currentDateStr = dStr;
        renderWeeklySelector();
        renderAll();
      };
    } else {
      
      pill.title = "Tidak boleh edit tarikh masa hadapan"; 
    }

    container.appendChild(pill);
  }
  
  const displayDate = new Date(currentDateStr + 'T12:00:00').toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' });
  document.getElementById('currentDisplayDate').textContent = displayDate;
}

/// sunnah checklist
function renderSunnah(dayData) {
  const list = document.getElementById('sunnahList');
  list.innerHTML = '';
  
  let prefs = getStorage('solattime_prefs_sunnah', DEFAULT_SUNNAH);
  if (!Array.isArray(prefs)) prefs = DEFAULT_SUNNAH;
  
  let rawatibPrefs = getStorage('solattime_prefs_rawatib', []);
  if (!Array.isArray(rawatibPrefs)) rawatibPrefs = [];

  const activeItems = [...prefs, ...rawatibPrefs];

  if (activeItems.length === 0) {
    list.innerHTML = '<li class="section-desc">No prayers selected. Click settings to add.</li>';
    return;
  }

  activeItems.forEach(prayer => {
    const isCompleted = dayData.sunnahCompleted.includes(prayer);
    const li = document.createElement('li');
    li.className = `check-item ${isCompleted ? 'completed' : ''}`;
    
    li.innerHTML = `
      <label>
        <input type="checkbox" class="sunnah-cb-main" ${isCompleted ? 'checked' : ''}>
        ${prayer}
      </label>
    `;
    
    const cb = li.querySelector('.sunnah-cb-main');
    cb.addEventListener('change', (e) => {
      window.toggleSunnah(prayer, e.target.checked);
    });

    list.appendChild(li);
  });
}

window.toggleSunnah = function(prayer, isChecked) {
  let dayData = getDailyData(currentDateStr);
  if (isChecked && !dayData.sunnahCompleted.includes(prayer)) {
    dayData.sunnahCompleted.push(prayer);
  } else if (!isChecked) {
    dayData.sunnahCompleted = dayData.sunnahCompleted.filter(p => p !== prayer);
  }
  saveDailyData(currentDateStr, dayData);
  renderAll();
};

/// fasting tracker
function renderFasting(dayData) {
  const list = document.getElementById('fastingList');
  const select = document.getElementById('fastingTypeSelect');
  
  list.innerHTML = '';
  select.innerHTML = ''; 
  
  const dateObj = new Date(currentDateStr + 'T12:00:00');
  const dayOfWeek = dateObj.getDay(); 

  const availableFasts = FASTING_TYPES.filter(type => {
    if (type === 'Monday' && dayOfWeek !== 1) return false; 
    if (type === 'Thursday' && dayOfWeek !== 4) return false; 
    return true;
  });

  availableFasts.forEach(type => {
    const opt = document.createElement('option');
    opt.value = type;
    opt.textContent = type;
    select.appendChild(opt);
  });

  if (!dayData.fasting || dayData.fasting.length === 0) {
    list.innerHTML = '<li class="section-desc" style="margin-top: 1rem;">No fasting scheduled for this day.</li>';
    return;
  }

  dayData.fasting.forEach(item => {
    let statusClass = 'status-planned';
    if (item.status === 'Completed') statusClass = 'status-completed';
    if (item.status === 'Not Completed') statusClass = 'status-missed';
    if (item.status === 'Delete') statusClass = 'status-delete';

    const li = document.createElement('li');
    li.className = 'fasting-item';
    
    const nameSpan = document.createElement('span');
    nameSpan.textContent = item.type;

    const statusSpan = document.createElement('span');
    statusSpan.className = `status-pill ${statusClass}`;
    statusSpan.textContent = item.status;
    
    statusSpan.addEventListener('click', () => {
      window.cycleFastingStatus(item.id);
    });

    li.appendChild(nameSpan);
    li.appendChild(statusSpan);
    list.appendChild(li);
  });
}

document.getElementById('addFastingBtn').onclick = () => {
  const select = document.getElementById('fastingTypeSelect');
  const type = select.value;
  
  if (!type) return;

  let dayData = getDailyData(currentDateStr);
  dayData.fasting.push({
    id: Date.now().toString(),
    type: type,
    status: 'Planned'
  });
  
  saveDailyData(currentDateStr, dayData);
  renderAll();
};

window.cycleFastingStatus = function(id) {
  let dayData = getDailyData(currentDateStr);
  const itemIndex = dayData.fasting.findIndex(f => f.id === id);
  if (itemIndex === -1) return;
  
  const item = dayData.fasting[itemIndex];
  const statuses = ['Planned', 'Completed', 'Not Completed', 'Delete'];
  
  let currentIndex = statuses.indexOf(item.status);
  if (currentIndex === -1) currentIndex = 0;

  let nextIndex = (currentIndex + 1) % statuses.length;
  let nextStatus = statuses[nextIndex];

  if (nextStatus === 'Delete') {
    dayData.fasting.splice(itemIndex, 1);
  } else {
    item.status = nextStatus;
  }
  
  saveDailyData(currentDateStr, dayData);
  renderAll();
};

/// dhikr counter
function renderZikir(dayData) {
  const scroll = document.getElementById('dhikrScroll');
  scroll.innerHTML = '';
  DHIKR_OPTIONS.forEach(dhikr => {
    const btn = document.createElement('button');
    btn.className = `dhikr-btn ${dhikr === currentDhikr ? 'active' : ''}`;
    btn.textContent = dhikr;
    btn.onclick = () => { currentDhikr = dhikr; renderZikir(dayData); };
    scroll.appendChild(btn);
  });

  document.getElementById('zikirCount').textContent = currentCount;
  
  const targetText = document.getElementById('zikirProgressText');
  if (currentTarget > 0) {
    targetText.style.display = 'block';
    targetText.textContent = `Target: ${currentCount} / ${currentTarget}`;
    targetText.style.color = currentCount >= currentTarget ? '#5cb85c' : 'inherit';
  } else {
    targetText.style.display = 'none';
  }

  const sessionsList = document.getElementById('zikirSessionsList');
  sessionsList.innerHTML = '';
  if (dayData.zikirSessions.length === 0) {
    sessionsList.innerHTML = '<li class="section-desc">No sessions saved today.</li>';
  } else {
    dayData.zikirSessions.forEach(session => {
      const li = document.createElement('li');
      li.className = 'session-item';
      
      li.innerHTML = `
        <div>
          <strong>${session.dhikr}</strong> - ${session.count} times 
          ${session.target ? `(Target: ${session.target})` : ''}
          <br><small>${session.time}</small>
        </div>
        <button class="btn-icon-delete" title="Delete Session">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
        </button>
      `;
    
      const deleteBtn = li.querySelector('.btn-icon-delete');
      deleteBtn.addEventListener('click', () => {
        window.deleteZikirSession(session.id);
      });

      sessionsList.appendChild(li);
    });
  }
}

document.getElementById('zikirPlus').onclick = () => { currentCount++; renderZikir(getDailyData(currentDateStr)); };
document.getElementById('zikirMinus').onclick = () => { if (currentCount > 0) currentCount--; renderZikir(getDailyData(currentDateStr)); };
document.getElementById('zikirReset').onclick = () => { currentCount = 0; renderZikir(getDailyData(currentDateStr)); };

document.querySelectorAll('.target-btn').forEach(btn => {
  btn.onclick = () => {
    const target = parseInt(btn.dataset.target);
    currentTarget = currentTarget === target ? 0 : target;
    document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
    if (currentTarget > 0) btn.classList.add('active');
    renderZikir(getDailyData(currentDateStr));
  };
});

document.getElementById('saveZikirSession').onclick = () => {
  if (currentCount === 0) return alert('Counter is at 0.');
  
  let dayData = getDailyData(currentDateStr);
  const timeStr = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
  
  dayData.zikirSessions.push({
    id: Date.now().toString(),
    dhikr: currentDhikr,
    count: currentCount,
    target: currentTarget > 0 ? currentTarget : null,
    time: timeStr
  });
  
  saveDailyData(currentDateStr, dayData);
  currentCount = 0;
  currentTarget = 0;
  document.querySelectorAll('.target-btn').forEach(b => b.classList.remove('active'));
  renderAll();
};

window.deleteZikirSession = function(id) {
  let dayData = getDailyData(currentDateStr);
  dayData.zikirSessions = dayData.zikirSessions.filter(s => s.id !== id);
  saveDailyData(currentDateStr, dayData);
  renderAll();
};

/// weekly overview calculation
function updateWeeklyOverview() {
  let weekSunnahTotal = 0;
  let weekSunnahCompleted = 0;
  let weekFastingTotal = 0;
  let weekFastingCompleted = 0;
  let weekDhikrTotal = 0;
  
  const currentDate = new Date(currentDateStr + 'T12:00:00');
  const startOfWeek = new Date(currentDate);
  startOfWeek.setDate(currentDate.getDate() - currentDate.getDay());

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dStr = getLocalDateStr(d);
      const dayData = getDailyData(dStr);
      
      let prefs = getStorage('solattime_prefs_sunnah', DEFAULT_SUNNAH);
      if (!Array.isArray(prefs)) prefs = DEFAULT_SUNNAH;
      let rawatib = getStorage('solattime_prefs_rawatib', []);
      if (!Array.isArray(rawatib)) rawatib = [];

      const activeSunnah = [...prefs, ...rawatib];

      weekSunnahTotal += activeSunnah.length;
      
      const validCompleted = dayData.sunnahCompleted.filter(p => activeSunnah.includes(p));
      weekSunnahCompleted += validCompleted.length;
      
      weekFastingTotal += dayData.fasting.length;
      weekFastingCompleted += dayData.fasting.filter(f => f.status === 'Completed').length;
      
      weekDhikrTotal += dayData.zikirSessions.reduce((sum, s) => sum + s.count, 0);
  }

  document.getElementById('weeklySunnah').textContent = `${weekSunnahCompleted}/${weekSunnahTotal}`;
  document.getElementById('weeklyFasting').textContent = `${weekFastingCompleted}/${weekFastingTotal}`;
  document.getElementById('weeklyDhikr').textContent = weekDhikrTotal;
}

const modal = document.getElementById('settingsModal');

document.getElementById('openSunnahSettings').onclick = () => {
  modal.classList.remove('hidden');
  
  const sunnahBox = document.getElementById('sunnahOptionsList');
  sunnahBox.innerHTML = '';
  let currentPrefs = getStorage('solattime_prefs_sunnah', DEFAULT_SUNNAH);
  if (!Array.isArray(currentPrefs)) currentPrefs = DEFAULT_SUNNAH;
  
  ALL_SUNNAH.forEach(prayer => {
    const checked = currentPrefs.includes(prayer) ? 'checked' : '';
    sunnahBox.innerHTML += `
      <label class="round-label">
        <input type="checkbox" value="${prayer}" class="round-cb sunnah-cb" ${checked}>
        <span>${prayer}</span>
      </label>
    `;
  });

  const rawatibBox = document.getElementById('rawatibOptionsList');
  const currentRawatib = getStorage('solattime_prefs_rawatib', []);
  
  let rawatibHTML = `
    <div></div>
    <div class="rawatib-header">before</div>
    <div class="rawatib-header">after</div>
  `;

  ALL_RAWATIB.forEach(slot => {
    rawatibHTML += `<div class="rawatib-row-label">${slot.name}</div>`;

    if (slot.before) {
      const val = `${slot.name} (Before)`;
      const checked = currentRawatib.includes(val) ? 'checked' : '';
      rawatibHTML += `<div class="rawatib-cell"><input type="checkbox" value="${val}" class="round-cb rawatib-cb" ${checked}></div>`;
    } else {
      rawatibHTML += `<div class="rawatib-cell"><span class="empty-cell">-</span></div>`;
    }

    if (slot.after) {
      const val = `${slot.name} (After)`;
      const checked = currentRawatib.includes(val) ? 'checked' : '';
      rawatibHTML += `<div class="rawatib-cell"><input type="checkbox" value="${val}" class="round-cb rawatib-cb" ${checked}></div>`;
    } else {
      rawatibHTML += `<div class="rawatib-cell"><span class="empty-cell">-</span></div>`;
    }
  });

  rawatibBox.innerHTML = rawatibHTML;
};

document.getElementById('closeSettings').onclick = () => modal.classList.add('hidden');

document.getElementById('saveSettingsBtn').onclick = () => {
  const selectedSunnah = Array.from(document.querySelectorAll('.sunnah-cb:checked')).map(cb => cb.value);
  const selectedRawatib = Array.from(document.querySelectorAll('.rawatib-cb:checked')).map(cb => cb.value);
  
  setStorage('solattime_prefs_sunnah', selectedSunnah);
  setStorage('solattime_prefs_rawatib', selectedRawatib);
  
  modal.classList.add('hidden');
  renderAll();
};

function renderAll() {
  const dayData = getDailyData(currentDateStr);
  renderSunnah(dayData);
  renderFasting(dayData);
  renderZikir(dayData);
  updateWeeklyOverview();
}

renderWeeklySelector();
renderAll();