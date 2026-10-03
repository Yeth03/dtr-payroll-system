// ==========================================
// RGSERVE DTR & PAYROLL SYSTEM - SCRIPT.JS
// ==========================================

// DAILY RATE CONFIGURATION (₱755 per day)
const DAILY_RATE = 755; 
const REGULAR_HOURS = 8; 
const HOURLY_RATE = DAILY_RATE / REGULAR_HOURS; // ₱94.375 per hour
const OT_RATE = HOURLY_RATE * 1.25; // 125% Overtime rate (₱117.97 per OT hour)

const STORAGE_KEY = 'rgserve_dtr_logs';

// INITIALIZATION ON PAGE LOAD
document.addEventListener('DOMContentLoaded', () => {
  initClock();
  setDefaultTimestamp();
  loadLogs();

  const form = document.getElementById('dtrForm');
  if (form) {
    form.addEventListener('submit', handleFormSubmit);
  }
});

// LIVE CLOCK FUNCTION
function initClock() {
  const clockEl = document.getElementById('liveClock');
  setInterval(() => {
    const now = new Date();
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US');
    }
  }, 1000);
}

// DEFAULT TIMESTAMP TO NOW
function setDefaultTimestamp() {
  const input = document.getElementById('logTimestamp');
  if (input) {
    const now = new Date();
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
  }
}

// PRESET TIME BUTTONS
function setPresetTime(type) {
  const input = document.getElementById('logTimestamp');
  const shiftSelect = document.getElementById('workShift');
  if (!input) return;

  const now = new Date();
  if (type === 'now') {
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
  } else if (type === 'am') {
    now.setHours(6, 0, 0, 0); // 06:00 AM Shift
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
    if (shiftSelect) shiftSelect.value = 'AM';
  } else if (type === 'pm') {
    now.setHours(18, 0, 0, 0); // 06:00 PM Shift
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
    if (shiftSelect) shiftSelect.value = 'PM';
  }
}

// LOAD LOGS (LOCAL STORAGE + API FALLBACK)
async function loadLogs() {
  let logs = [];

  try {
    const res = await fetch('/api/dtr');
    if (res.ok) {
      const result = await res.json();
      if (result.ok && Array.isArray(result.data)) {
        logs = result.data;
      }
    }
  } catch (err) {
    console.warn('Server offline, using local storage.');
  }

  if (!logs || logs.length === 0) {
    const localData = localStorage.getItem(STORAGE_KEY);
    logs = localData ? JSON.parse(localData) : [];
  }

  window.dtrLogsData = logs;
  renderCompletedShiftsTable(window.dtrLogsData);
  updateDashboard(window.dtrLogsData);
}

// PROCESS SHIFTS: MATCH TIME IN AND TIME OUT
function processCompletedShifts(logs) {
  const grouped = {};

  logs.forEach(log => {
    const dateStr = new Date(log.created_at).toLocaleDateString();
    const shift = log.shift || 'AM';
    const key = `${log.name.trim().toLowerCase()}_${dateStr}_${shift}`;

    if (!grouped[key]) {
      grouped[key] = {
        id: log.id,
        name: log.name,
        shift: shift,
        date: dateStr,
        inLog: null,
        outLog: null
      };
    }

    if (log.type === 'IN') {
      if (!grouped[key].inLog || new Date(log.created_at) < new Date(grouped[key].inLog.created_at)) {
        grouped[key].inLog = log;
      }
    } else if (log.type === 'OUT') {
      if (!grouped[key].outLog || new Date(log.created_at) > new Date(grouped[key].outLog.created_at)) {
        grouped[key].outLog = log;
      }
    }
  });

  const completedShifts = [];
  let globalTotalHours = 0;
  let globalTotalPay = 0;

  Object.keys(grouped).forEach(key => {
    const shiftGroup = grouped[key];

    if (shiftGroup.inLog && shiftGroup.outLog) {
      const inTime = new Date(shiftGroup.inLog.created_at);
      let outTime = new Date(shiftGroup.outLog.created_at);

      let diffMs = outTime - inTime;
      let rawTotalHours = Math.max(0, diffMs / (1000 * 60 * 60));

      // Automatic 1-hour break deduction if work > 5 hours
      if (rawTotalHours > 5) {
        rawTotalHours -= 1;
      }

      const regHours = Math.min(REGULAR_HOURS, rawTotalHours);
      let rawOtHours = Math.max(0, rawTotalHours - REGULAR_HOURS);

      // EKS AKTONG 6:30 OT RULE FOR SHIFTING:
      // Kukunin ang base OT hours (e.g., sa 12 hrs shift, base OT ay 3.0 hrs).
      // Ang excess minutes ay ang minuto lagpas sa 6:00 PM/AM.
      let baseOtHours = Math.floor(rawOtHours); 
      let excessMinutes = (rawOtHours - baseOtHours) * 60;

      let payableOtHours = baseOtHours;

      // KAPAG DUMATING/LUMAMPAS NG 30 MINUTES (6:30 PM/AM PATAAS):
      // Saka lang isasama at idadagdag sa sahod ang mga minuto lagpas ng 6:00.
      if (excessMinutes >= 30) {
        payableOtHours = rawOtHours;
      }

      const computedTotalHours = regHours + payableOtHours;
      const regularPay = (regHours / REGULAR_HOURS) * DAILY_RATE;
      const otPay = payableOtHours * OT_RATE;
      const totalPay = regularPay + otPay;

      completedShifts.push({
        id: shiftGroup.id,
        inId: shiftGroup.inLog.id,
        outId: shiftGroup.outLog.id,
        name: shiftGroup.name,
        shift: shiftGroup.shift,
        date: shiftGroup.date,
        timeInFormatted: inTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        timeOutFormatted: outTime.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
        totalHours: computedTotalHours.toFixed(2),
        otHours: payableOtHours.toFixed(2),
        otPay: otPay.toFixed(2),
        totalPay: totalPay.toFixed(2)
      });

      globalTotalHours += computedTotalHours;
      globalTotalPay += totalPay;
    }
  });

  return { completedShifts, globalTotalHours, globalTotalPay };
}

// RENDER COMPLETED SHIFTS TABLE
function renderCompletedShiftsTable(logs) {
  const tbody = document.getElementById('dtrTableBody');
  if (!tbody) return;

  const { completedShifts } = processCompletedShifts(logs);

  if (completedShifts.length === 0) {
    tbody.innerHTML = `
      <tr>
        <td colspan="7" style="text-align: center; color: #d0d7de; padding: 20px;">
          <i>No completed shift records found. Records will appear here after TIME OUT.</i>
        </td>
      </tr>`;
    return;
  }

  tbody.innerHTML = completedShifts.map(shift => {
    const shiftBadge = shift.shift === 'PM' 
      ? `<span class="badge-shift badge-pm">PM SHIFT</span>`
      : `<span class="badge-shift badge-am">AM SHIFT</span>`;

    return `
      <tr>
        <td><strong>${shift.name}</strong></td>
        <td>${shiftBadge}</td>
        <td>${shift.date}</td>
        <td><span style="color: #00ff87; font-weight: 600;">IN: ${shift.timeInFormatted}</span></td>
        <td><span style="color: #ff5f56; font-weight: 600;">OUT: ${shift.timeOutFormatted}</span></td>
        <td><strong>${shift.totalHours} hrs</strong> <small style="color: #00f2fe;">(OT: ${shift.otHours} hrs)</small></td>
        <td style="color: #00f2fe; font-weight: 700; font-size: 15px;">
          ₱${shift.totalPay} 
          <button style="background: rgba(255, 95, 86, 0.25); color: #ff5f56; border: 1px solid #ff5f56; padding: 3px 8px; border-radius: 4px; cursor: pointer; font-size: 11px; margin-left: 10px;" onclick="deleteShift('${shift.inId}', '${shift.outId}')">Delete</button>
        </td>
      </tr>
    `;
  }).join('');
}

// UPDATE DASHBOARD OVERVIEW
function updateDashboard(logs) {
  const totalLogs = document.getElementById('totalLogs');
  const timeInCount = document.getElementById('timeInCount');
  const timeOutCount = document.getElementById('timeOutCount');
  const payrollOverview = document.getElementById('payrollOverview');

  const todayStr = new Date().toLocaleDateString();
  const todayLogs = logs.filter(l => new Date(l.created_at).toLocaleDateString() === todayStr);

  if (totalLogs) totalLogs.textContent = todayLogs.length;
  if (timeInCount) timeInCount.textContent = todayLogs.filter(l => l.type === 'IN').length;
  if (timeOutCount) timeOutCount.textContent = todayLogs.filter(l => l.type === 'OUT').length;

  const { globalTotalHours, globalTotalPay } = processCompletedShifts(logs);
  if (payrollOverview) {
    payrollOverview.textContent = `Est. Total Work: ${globalTotalHours.toFixed(1)} hrs | Total Computed Pay: ₱${globalTotalPay.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  }
}

// FORM SUBMISSION HANDLER
async function handleFormSubmit(e) {
  e.preventDefault();

  const nameInput = document.getElementById('employeeName');
  const shiftInput = document.getElementById('workShift');
  const typeInput = document.getElementById('logType');
  const timestampInput = document.getElementById('logTimestamp');
  const alertBox = document.getElementById('statusAlert');
  const submitBtn = e.target.querySelector('button[type="submit"]');

  const name = nameInput.value.trim();
  const shift = shiftInput ? shiftInput.value : 'AM';
  const type = typeInput.value;
  const created_at = timestampInput.value ? new Date(timestampInput.value).toISOString() : new Date().toISOString();

  if (!name || !type) return;

  const originalBtnText = submitBtn ? submitBtn.innerHTML : 'Submit Log';
  if (submitBtn) {
    submitBtn.classList.add('btn-saving');
    submitBtn.innerHTML = `<span class="btn-spinner"></span> ⚡ Saving Entry...`;
  }

  const newLog = {
    id: Date.now().toString(),
    name: name,
    shift: shift,
    type: type,
    created_at: created_at
  };

  await new Promise(resolve => setTimeout(resolve, 300));

  try {
    await fetch('/api/dtr', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newLog)
    });
  } catch (err) {
    console.warn('Server offline. Saving log locally.');
  }

  const localLogs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  localLogs.unshift(newLog);
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localLogs));

  if (submitBtn) {
    submitBtn.classList.remove('btn-saving');
    submitBtn.innerHTML = `✨ Saved Successfully!`;
    setTimeout(() => {
      submitBtn.innerHTML = originalBtnText;
    }, 1200);
  }

  if (alertBox) {
    alertBox.className = 'status-alert-cyber'; 
    alertBox.style.display = 'block';

    if (type === 'IN') {
      alertBox.classList.add('glow-success');
      alertBox.innerHTML = `⚡ <strong>TIME IN RECORDED</strong><br>Welcome <strong>${name}</strong> (${shift} Shift). Payroll active upon OUT.`;
    } else {
      alertBox.classList.add('glow-info');
      alertBox.innerHTML = `🚀 <strong>SHIFT COMPLETED</strong><br>Nice work <strong>${name}</strong> (${shift} Shift)! Computed pay updated.`;
    }

    setTimeout(() => {
      alertBox.style.display = 'none';
    }, 4500);
  }

  nameInput.value = '';
  setDefaultTimestamp();
  loadLogs();
}

// DELETE SHIFT PAIR
async function deleteShift(inId, outId) {
  if (!confirm('Are you sure you want to delete this completed shift record?')) return;

  let localLogs = JSON.parse(localStorage.getItem(STORAGE_KEY) || '[]');
  localLogs = localLogs.filter(log => log.id.toString() !== inId.toString() && log.id.toString() !== outId.toString());
  localStorage.setItem(STORAGE_KEY, JSON.stringify(localLogs));

  loadLogs();
}

// EXPORT TABLE TO CSV FILE
function exportDTR() {
  const { completedShifts } = processCompletedShifts(window.dtrLogsData || []);

  if (completedShifts.length === 0) {
    alert('No completed shift records to export.');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Employee Name,Shift,Date,Time In,Time Out,Total Hours,OT Hours,Total Pay (PHP)\n";

  completedShifts.forEach(s => {
    csvContent += `"${s.name}","${s.shift} Shift","${s.date}","${s.timeInFormatted}","${s.timeOutFormatted}","${s.totalHours}","${s.otHours}","${s.totalPay}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `DTR_Payroll_Summary_${new Date().toISOString().slice(0,10)}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

// END OF SCRIPT.JS
