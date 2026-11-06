const API_BASE = 'https://api.aladhan.com/v1';

const PRAYER_DISPLAY = [
  { key: 'Fajr',    label: 'fajr' },
  { key: 'Sunrise', label: 'shurooq' },
  { key: 'Dhuhr',   label: 'dhuhr' },
  { key: 'Asr',     label: 'asr' },
  { key: 'Maghrib', label: 'maghrib' },
  { key: 'Isha',    label: 'isha' }
];

const nowClock        = document.getElementById('nowClock');
const placeLabel      = document.getElementById('placeLabel');
const currentName     = document.getElementById('currentName');
const countdown       = document.getElementById('countdown');
const timesGrid       = document.getElementById('timesGrid');

const state = { timings: null, timezone: null };
let ticker = null;

function showError(msg) {
  document.getElementById('errorMsg').textContent = msg;
  document.getElementById('errorBanner').classList.remove('hidden');
}

function hideError() {
  document.getElementById('errorBanner').classList.add('hidden');
}

function showToast(msg) {
  const toast = document.getElementById('toast');
  toast.textContent = msg;
  toast.classList.remove('hidden');
  
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => {
    toast.classList.add('hidden');
  }, 3000);
}

function sanitizeTime(raw) {
  if (typeof raw !== 'string') return '';
  const m = raw.match(/(\d{1,2}):(\d{2})/);
  return m ? `${m[1].padStart(2, '0')}:${m[2]}` : '';
}

const toMinutes = hhmm => {
  const [h, m] = hhmm.split(':').map(Number);
  return h * 60 + m;
};

function minutesToEnglish(mins) {
  const v = Math.max(0, Math.round(mins));
  const h = Math.floor(v / 60);
  const m = v % 60;
  if (h > 0) return `${h} hour${h > 1 ? 's' : ''} ${m} minute${m !== 1 ? 's' : ''}`;
  return `${m} minutes`;
}

function formatClock(mins) {
  const m = ((Math.round(mins) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, '0')} : ${String(m % 60).padStart(2, '0')}`;
}

function nowMinutesInZone(timeZone) {
  const now = new Date();
  if (timeZone) {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone, hour: '2-digit', minute: '2-digit', hourCycle: 'h23'
      }).formatToParts(now);
      const h = Number(parts.find(p => p.type === 'hour')?.value);
      const m = Number(parts.find(p => p.type === 'minute')?.value);
      if (Number.isFinite(h) && Number.isFinite(m)) return h * 60 + m;
    } catch {}
  }
  return now.getHours() * 60 + now.getMinutes();
}

function getCurrentPeriod(timings, nowMin) {
  const fajr    = toMinutes(timings.Fajr);
  const sunrise = toMinutes(timings.Sunrise);
  const dhuhr   = toMinutes(timings.Dhuhr);
  const asr     = toMinutes(timings.Asr);
  const maghrib = toMinutes(timings.Maghrib);
  const isha    = toMinutes(timings.Isha);

  if (nowMin < fajr) return { name: 'isha', end: fajr };
  if (nowMin < sunrise) return { name: 'fajr', end: sunrise };
  if (nowMin < dhuhr) return { name: 'dhuha', end: dhuhr };
  if (nowMin < asr) return { name: 'dhuhr', end: asr };
  if (nowMin < maghrib) return { name: 'asr', end: maghrib };
  if (nowMin < isha) return { name: 'maghrib', end: isha };

  return { name: 'isha', end: fajr + 1440 };
}

async function fetchByCoords(lat, lon) {
  hideError();
  
  const url = `${API_BASE}/timings?latitude=${lat}&longitude=${lon}&method=17`; 
  const res = await fetch(url);
  
  if (!res.ok) {
    throw new Error('Prayer times service is currently unavailable.');
  }
  const json = await res.json();
  if (!json || !json.data || !json.data.timings) {
    throw new Error('No prayer times found for this location.');
  }
  
  return json.data;
}

async function reverseGeocode(lat, lon) {
  try {
    const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lon}&zoom=14`);
    const data = await res.json();
    const addr = data.address || {};

    let area = addr.suburb || addr.neighbourhood || addr.residential || addr.village ||'';
    let city = addr.city || addr.town || addr.municipality || addr.county || '';
    let state = addr.state || '';

    const toLower = (str) => str.toLowerCase();
    if (area) area = toTitleCase(area);
    if (city) city = toTitleCase(city);
    if (state) state = toTitleCase(state);

    const parts = [area, city, state].filter((item, index, self) =>
      item && self.indexOf(item) === index
    );

    if (parts.length > 0) return parts.join(',');
    
    return 'current location';
  } catch (err) {
    return 'current location';
  }
}

function renderTimes(data, locationLabel) {
  const raw = data.timings || {};
  const timings = {};
  PRAYER_DISPLAY.forEach(p => { timings[p.key] = sanitizeTime(raw[p.key]); });

  state.timings = timings;
  state.timezone = data.meta?.timezone || null;
  
  placeLabel.textContent = locationLabel.toLowerCase();

  const todayDate = new Date().toISOString().split('T')[0];
  const storageData = {
    date: todayDate,
    location: locationLabel.toLowerCase(),
    timings: timings
  };
  localStorage.setItem('solattime.todayTimings', JSON.stringify(storageData));

  timesGrid.innerHTML = '';

  timesGrid.innerHTML = '';
  PRAYER_DISPLAY.forEach(p => {
    const card = document.createElement('div');
    card.className = 'time-card';
    card.dataset.key = p.key;

    const nameSpan = document.createElement('span');
    nameSpan.className = 'time-name';
    nameSpan.textContent = p.label;

    const valSpan = document.createElement('span');
    valSpan.className = 'time-value';
    valSpan.textContent = timings[p.key];

    card.append(nameSpan, valSpan);
    timesGrid.appendChild(card);
  });

  if (ticker) clearInterval(ticker);
  tick();
  ticker = setInterval(tick, 1000);
}

function tick() {
  if (!state.timings) return;

  const required = ['Fajr', 'Sunrise', 'Dhuhr', 'Asr', 'Maghrib', 'Isha'];
  const isValid = required.every(k => /^\d{2}:\d{2}$/.test(state.timings[k] || ''));
  if (!isValid) {
    currentName.textContent = 'unavailable';
    countdown.textContent   = 'Prayer times incomplete';
    return;
  }

  const nowMin = nowMinutesInZone(state.timezone);
  nowClock.textContent = formatClock(nowMin);

  const period = getCurrentPeriod(state.timings, nowMin);
  currentName.textContent = period.name;

    /// suggestion logic
  let suggestion = "";
  switch(period.name) {
    case 'fajr':
      suggestion = "Recite morning adhkar and read the Quran.";
      break;
    case 'dhuha':
      suggestion = "Perform Dhuha prayer (2 to 8 rak'ah).";
      break;
    case 'dhuhr':
      suggestion = "Take a short rest (Qailulah) and pray Dhuhr sunnah.";
      break;
    case 'asr':
      suggestion = "Recite evening adhkar and make du'a.";
      break;
    case 'maghrib':
      suggestion = "Perform Maghrib sunnah and spend time with family.";
      break;
    case 'isha':
      suggestion = "Perform Witr prayer before sleeping.";
      break;
    default:
      suggestion = "Take a moment for reflection and du'a.";
  }
  
  const suggestionEl = document.getElementById('suggestionText');
  if(suggestionEl) {
      suggestionEl.innerHTML = `<em>suggestion: ${suggestion}</em>`;
  }

  localStorage.setItem('solattime.lastSuggestion', JSON.stringify({
      time: period.name,
      text: suggestion,
      date: getLocalDateStr(new Date())
  }));
  
  const nextDiff = period.end - nowMin;
  countdown.textContent = `${minutesToEnglish(nextDiff)} left`;

  const currentKey = PRAYER_DISPLAY.find(p => p.label === period.name)?.key;
  document.querySelectorAll('.time-card').forEach(c => {
    c.classList.toggle('current', c.dataset.key === currentKey);
  });
}

/// auto detect location
async function initApp() {
  if (!navigator.geolocation) {
    fetchFallback();
    return;
  }

  navigator.geolocation.getCurrentPosition(
    async (position) => {
      const { latitude, longitude } = position.coords;
      let prayerData = null
      let placeName = 'current location';

      try {
        prayerData = await fetchByCoords(latitude, longitude);
      } catch (err) {
        console.warn("Aladhan API failed:", err);
        showError("Failed to get prayer times. Using default.");
        fetchFallback();
        return; 
      }

      try {
        placeName = await reverseGeocode(latitude, longitude);
      } catch (err) {
        console.warn("Nominatim API failed, using generic name.");
      }

      renderTimes(prayerData, placeName);
    },
    () => {
      
      console.warn("Location access denied or timed out.");
      fetchFallback();
    },
    { timeout: 15000, enableHighAccuracy: false } 
  );
}

async function fetchFallback() {
  try {
    const data = await fetchByCoords(3.8077, 103.3260);
    renderTimes(data, 'kuantan, pahang');
    showToast('Location unavailable. Showing default: Kuantan.'); 
  } catch (err) {
    showError('Failed to load fallback prayer times. Please check your internet connection.');
  }
}

const PRAYERS = ['Subuh', 'Zohor', 'Asar', 'Maghrib', 'Isyak'];

function getLocalDateStr(date = new Date()) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function getPrayerLogData(dateStr) {
  const data = localStorage.getItem(`solattime_prayerlog_${dateStr}`);
  if (data) {
    try {
      return JSON.parse(data);
    } catch(e) {
      return { status: 'pure', completed: [] };
    }
  }
  return { status: 'pure', completed: [] };
}

function savePrayerLogData(dateStr, data) {
  localStorage.setItem(`solattime_prayerlog_${dateStr}`, JSON.stringify(data));
}

function updatePrayerPercent(dateStr) {
  const logData = getPrayerLogData(dateStr);
  const percentText = document.getElementById('prayerLogPercent');
  
  if (logData.status === 'menstruating') {
    percentText.textContent = 'N/A';
  } else {
    const completedCount = logData.completed.length;
    const percent = Math.round((completedCount / PRAYERS.length) * 100);
    percentText.textContent = `${percent}%`;
  }
}

function renderPrayerLog() {
  const dateInput = document.getElementById('logDate');
  dateInput.max = getLocalDateStr();
  const statusSelect = document.getElementById('personalStatus');
  const list = document.getElementById('prayerLogList');
  const genderSelect = document.getElementById('userGender');
  const statusContainer = document.getElementById('statusContainer');

  let savedGender = localStorage.getItem('solattime_gender') || 'muslimin';
  genderSelect.value = savedGender;

  if (savedGender === 'muslimah' || savedGender === 'muslimah') {
    statusContainer.classList.remove('hidden');
  } else {
    statusContainer.classList.add('hidden');
  }

  if (!dateInput.value) dateInput.value = getLocalDateStr();

  const dateStr = dateInput.value;
  const logData = getPrayerLogData(dateStr);

  statusSelect.value = logData.status;
  list.innerHTML = '';

  const isMenstruating = logData.status === 'Menstruating' && savedGender === 'Muslimah';

  PRAYERS.forEach(prayer => {
    const isCompleted = logData.completed.includes(prayer);

    const li = document.createElement('li');
    li.className = 'check-item';

    const disabledAttr = isMenstruating ? 'disabled' : '';
    const checkedAttr = isCompleted ? 'checked' : '';
    const displayText = isMenstruating ? `${prayer} (N/A)` : prayer;
    const opacity = isMenstruating ? 'style="opacity: 0.5;"' : '';

    li.innerHTML = `
      <label ${opacity}>
        <input type="checkbox" class="prayer-cb" data-prayer="${prayer}" ${checkedAttr} ${disabledAttr}>
        ${displayText}
      </label>
    `;
    
    const cb = li.querySelector('.prayer-cb');
    cb.addEventListener('change', (e) => {
      const currentLogData = getPrayerLogData(dateStr);
      if (e.target.checked) {
        if (!currentLogData.completed.includes(prayer)) currentLogData.completed.push(prayer);
      } else {
        currentLogData.completed = currentLogData.completed.filter(p => p !== prayer);
      }
      savePrayerLogData(dateStr, currentLogData);
      updatePrayerPercent(dateStr);
    });

    list.appendChild(li);
  });

  updatePrayerPercent(dateStr);
}

document.getElementById('userGender').addEventListener('change', (e) => {
  const newGender = e.target.value;
  localStorage.setItem('solattime_gender', newGender); 

  const selectedDate = e.target.value;
  const todayStr = getLocalDateStr();

  if (selectedDate > todayStr) {
    showToast('Cannot select future dates.');
    e.target.value = todayStr;
  }
  
  renderPrayerLog(); 
});


document.getElementById('logDate').addEventListener('change', renderPrayerLog);


document.getElementById('personalStatus').addEventListener('change', (e) => {
  const dateStr = document.getElementById('logDate').value;
  const logData = getPrayerLogData(dateStr);
  logData.status = e.target.value;
  
  savePrayerLogData(dateStr, logData);
  renderPrayerLog(); 
});


renderPrayerLog();

/// search location function
async function searchCity() {
  const city = document.getElementById('cityInput').value.trim();
  if (!city) {
    showToast('Please enter a city name.');
    return;
  }

  const btn = document.getElementById('searchCityBtn');
  const originalText = btn.textContent;
  btn.textContent = '...'; 
  hideError();

  try {
    /// nominatim API
    const geoRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(city)}&limit=1`);
    const geoData = await geoRes.json();

    if (!geoData || geoData.length === 0) {
      throw new Error('City not found. Please try another name.');
    }

    const lat = geoData[0].lat;
    const lon = geoData[0].lon;

    /// full location
    const nameParts = geoData[0].display_name.split(',')
    .map(part => part.trim())
    .filter(part => isNaN(part)); 

    const displayName = nameParts.slice(0, 4).join(', ');

    const prayerData = await fetchByCoords(lat, lon);

    renderTimes(prayerData, displayName);
    showToast(`Showing prayer times for ${displayName}`);
    document.getElementById('cityInput').value = ''; 
    
  } catch (err) {
    showError(err.message || 'Failed to search location.');
  } finally {
    btn.textContent = originalText;
  }
}

document.getElementById('searchCityBtn').addEventListener('click', searchCity);

document.getElementById('cityInput').addEventListener('keypress', (e) => {
  if (e.key === 'Enter') searchCity();
});

window.addEventListener('DOMContentLoaded', initApp);

///retry button
document.getElementById('retryBtn').addEventListener('click', () => {
  hideError();
  initApp(); 
});