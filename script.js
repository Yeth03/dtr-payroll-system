// CONFIGURATION
const BASIC_DAILY_RATE = 755.00;
const REGULAR_HOURS_PER_DAY = 8;

const BASIC_HOURLY_RATE = BASIC_DAILY_RATE / REGULAR_HOURS_PER_DAY; // 94.375
const OVERTIME_MULTIPLIER = 1.25;
const NIGHT_DIFF_MULTIPLIER = 0.10; 

const DAY_MULTIPLIERS = {
  "REGULAR": 1.00,
  "REST_DAY": 1.30,
  "SPECIAL_HOLIDAY": 1.30,
  "REGULAR_HOLIDAY": 2.00,
  "REST_SPECIAL": 1.50,
  "REST_REGULAR": 2.60
};

let dtrLogs = JSON.parse(localStorage.getItem('rgserve_dtr_logs')) || [];

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  setDefaultTimestamp();
  setDefaultFilterMonth();
  setDefaultEmployeeName();
  renderTable();

  const dtrForm = document.getElementById('dtrForm');
  if (dtrForm) {
    dtrForm.addEventListener('submit', handleFormSubmit);
  }
});

function initLiveClock() {
  setInterval(() => {
    const now = new Date();
    const clockEl = document.getElementById('liveClock');
    if (clockEl) {
      clockEl.textContent = now.toLocaleTimeString('en-US', { hour12: true });
    }
  }, 1000);
}

function setDefaultEmployeeName() {
  const empNameInput = document.getElementById('employeeName');
  if (empNameInput && !empNameInput.value) {
    empNameInput.value = "Yeth Awayan";
  }
}

function setDefaultTimestamp() {
  const logTimestamp = document.getElementById('logTimestamp');
  if (!logTimestamp) return;

  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  logTimestamp.value = now.toISOString().slice(0, 16);
}

function setDefaultFilterMonth() {
  const filterMonth = document.getElementById('filterMonth');
  if (!filterMonth) return;

  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  filterMonth.value = `${year}-${month}`;
}

function handleFormSubmit(e) {
  e.preventDefault();
  
  const empNameInput = document.getElementById('employeeName');
  const empName = empNameInput ? empNameInput.value.trim() : '';
  const shift = document.getElementById('workShift') ? document.getElementById('workShift').value : 'AM';
  const dayType = document.getElementById('dayType') ? document.getElementById('dayType').value : 'REGULAR';
  const logTypeSelect = document.getElementById('logType');
  const logType = logTypeSelect ? logTypeSelect.value : 'IN';
  const timestamp = document.getElementById('logTimestamp') ? document.getElementById('logTimestamp').value : '';

  if (!empName || !timestamp) {
    alert("Pakilagay ang pangalan ng employee at date/time.");
    return;
  }

  const logEntry = {
    id: Date.now(),
    employee: empName,
    shift: shift,
    dayType: dayType,
    logType: logType,
    timestamp: timestamp
  };

  dtrLogs.push(logEntry);
  localStorage.setItem('rgserve_dtr_logs', JSON.stringify(dtrLogs));

  showToast(`${logType} Saved for ${empName}`);

  if (logType === 'IN' && logTypeSelect) {
    logTypeSelect.value = 'OUT';
  } else if (logType === 'OUT' && logTypeSelect) {
    logTypeSelect.value = 'IN';
  }

  setDefaultEmployeeName();
  setDefaultTimestamp();
  
  renderTable();
}

function showToast(msg) {
  let container = document.getElementById('toastContainer');
  if (!container) {
    container = document.createElement('div');
    container.id = 'toastContainer';
    container.style.cssText = 'position: fixed; bottom: 20px; right: 20px; z-index: 9999;';
    document.body.appendChild(container);
  }

  const toast = document.createElement('div');
  toast.style.cssText = 'background: #00f2fe; color: #000; padding: 8px 12px; border-radius: 4px; margin-top: 5px; font-weight: bold; font-size: 11px;';
  toast.innerHTML = `✓ ${msg}`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 2500);
}

function deleteSingleLog(id) {
  if (confirm("Gusto mo bang burahin ang log na ito?")) {
    dtrLogs = dtrLogs.filter(log => log.id !== id);
    localStorage.setItem('rgserve_dtr_logs', JSON.stringify(dtrLogs));
    renderTable();
  }
}

function deletePairLogs(inId, outId) {
  if (confirm("Gusto mo bang burahin ang buong record (IN at OUT)?")) {
    dtrLogs = dtrLogs.filter(log => log.id !== inId && log.id !== outId);
    localStorage.setItem('rgserve_dtr_logs', JSON.stringify(dtrLogs));
    renderTable();
  }
}

// Night Differential Calculation (10:00 PM to 6:00 AM)
function calculateNightDiffHours(timeIn, timeOut) {
  let ndMinutes = 0;
  let current = new Date(timeIn.getTime());

  while (current < timeOut) {
    let hour = current.getHours();
    // Pagitan ng 10:00 PM (22:00) at 6:00 AM (06:00)
    if (hour >= 22 || hour < 6) {
      ndMinutes += 1;
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  // Bawas 1 hr break sa ND kapag sumakop sa buong gabi
  let totalND = ndMinutes / 60;
  if (totalND > 5) {
    totalND -= 1; // 1 hr break deduction
  }

  return Math.max(0, totalND);
}

function processDTRPairs() {
  const pairedData = [];
  const sortedLogs = [...dtrLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const pendingIns = {};

  sortedLogs.forEach(log => {
    const key = `${log.employee}_${log.shift}`;

    if (log.logType === 'IN') {
      if (pendingIns[key]) {
        const prevIn = pendingIns[key];
        const prevTime = new Date(prevIn.timestamp);
        pairedData.push({
          inId: prevIn.id,
          outId: null,
          employee: prevIn.employee,
          shift: prevIn.shift,
          dayType: prevIn.dayType,
          date: prevTime.toLocaleDateString(),
          timeInStr: prevTime.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeOutStr: '--:--',
          rawDate: prevTime,
          workHrs: 0,
          otHrs: 0,
          computedPay: 0
        });
      }
      pendingIns[key] = log;
    } else if (log.logType === 'OUT') {
      if (pendingIns[key]) {
        const inLog = pendingIns[key];
        delete pendingIns[key];

        const timeIn = new Date(inLog.timestamp);
        const timeOut = new Date(log.timestamp);

        // Total hours pagitan ng IN at OUT
        let totalElapsedHrs = (timeOut - timeIn) / (1000 * 60 * 60);
        
        // Bawas 1 hour unpaid break kapag higit 5 hours ang rendering
        let actualWorkHrs = totalElapsedHrs > 5 ? totalElapsedHrs - 1 : totalElapsedHrs;
        if (actualWorkHrs < 0) actualWorkHrs = 0;

        // Regular Work Hours (Maximum 8 hrs)
        let regHrs = Math.min(actualWorkHrs, REGULAR_HOURS_PER_DAY);
        
        // Overtime Hours (Sobra sa 8 hrs)
        let rawOtHrs = Math.max(0, actualWorkHrs - REGULAR_HOURS_PER_DAY);

        // ROUND DOWN TO NEAREST 0.5 HOUR (e.g. 3.4 -> 3.0, 3.8 -> 3.5, 4.1 -> 4.0)
        let paidOtHrs = Math.floor(rawOtHrs * 2) / 2;

        const dayMultiplier = DAY_MULTIPLIERS[inLog.dayType] || 1.00;
        const effectiveHourlyRate = BASIC_HOURLY_RATE * dayMultiplier;

        // 1. Basic / Regular Pay
        let regPay = regHrs >= REGULAR_HOURS_PER_DAY ? (BASIC_DAILY_RATE * dayMultiplier) : (regHrs * effectiveHourlyRate);
        
        // 2. Overtime Pay (125% rate)
        let otPay = paidOtHrs * (effectiveHourlyRate * OVERTIME_MULTIPLIER);

        // 3. Night Differential Pay (+10% dagdag rate kapag pumatak ng 10 PM - 6 AM)
        let ndHrs = calculateNightDiffHours(timeIn, timeOut);
        let ndPay = ndHrs * (effectiveHourlyRate * NIGHT_DIFF_MULTIPLIER);

        const exactPay = regPay + otPay + ndPay;

        // Credited Work Hours (8 hrs regular + OT)
        let creditedWorkHrs = regHrs + paidOtHrs;

        pairedData.push({
          inId: inLog.id,
          outId: log.id,
          employee: inLog.employee,
          shift: inLog.shift,
          dayType: inLog.dayType,
          date: timeIn.toLocaleDateString(),
          timeInStr: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeOutStr: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawDate: timeIn,
          workHrs: creditedWorkHrs,
          otHrs: paidOtHrs,
          computedPay: exactPay
        });
      } else {
        const timeOut = new Date(log.timestamp);
        pairedData.push({
          inId: null,
          outId: log.id,
          employee: log.employee,
          shift: log.shift,
          dayType: log.dayType,
          date: timeOut.toLocaleDateString(),
          timeInStr: '--:--',
          timeOutStr: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawDate: timeOut,
          workHrs: 0,
          otHrs: 0,
          computedPay: 0
        });
      }
    }
  });

  Object.keys(pendingIns).forEach(key => {
    const inLog = pendingIns[key];
    const timeIn = new Date(inLog.timestamp);
    pairedData.push({
      inId: inLog.id,
      outId: null,
      employee: inLog.employee,
      shift: inLog.shift,
      dayType: inLog.dayType,
      date: timeIn.toLocaleDateString(),
      timeInStr: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timeOutStr: 'Pending OUT',
      rawDate: timeIn,
      workHrs: 0,
      otHrs: 0,
      computedPay: 0
    });
  });

  return pairedData;
}

function renderTable() {
  const tbody = document.getElementById('dtrTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const filterMonth = document.getElementById('filterMonth')?.value;
  const filterCutoff = document.getElementById('filterCutoff')?.value || 'ALL';

  const pairs = processDTRPairs();

  let totalHours = 0;
  let totalPay = 0;
  let inCount = 0;
  let outCount = 0;
  const todayStr = new Date().toLocaleDateString();

  dtrLogs.forEach(l => {
    if (new Date(l.timestamp).toLocaleDateString() === todayStr) {
      if (l.logType === 'IN') inCount++;
      if (l.logType === 'OUT') outCount++;
    }
  });

  if (document.getElementById('totalLogs')) document.getElementById('totalLogs').textContent = dtrLogs.length;
  if (document.getElementById('timeInCount')) document.getElementById('timeInCount').textContent = inCount;
  if (document.getElementById('timeOutCount')) document.getElementById('timeOutCount').textContent = outCount;

  if (pairs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 12px; color: #b0bac5;">Walang logs na nakita. Mag-add ng bago sa form sa itaas.</td></tr>`;
    return;
  }

  pairs.forEach(pair => {
    const pairYM = `${pair.rawDate.getFullYear()}-${String(pair.rawDate.getMonth() + 1).padStart(2, '0')}`;
    const day = pair.rawDate.getDate();

    if (filterMonth && pairYM !== filterMonth) return;
    if (filterCutoff === '1-15' && day > 15) return;
    if (filterCutoff === '16-31' && day < 16) return;

    totalHours += pair.workHrs;
    totalPay += pair.computedPay;

    let deleteBtnHTML = '';
    if (pair.inId && pair.outId) {
      deleteBtnHTML = `<button class="del-btn" onclick="deletePairLogs(${pair.inId}, ${pair.outId})">DEL</button>`;
    } else if (pair.inId) {
      deleteBtnHTML = `<button class="del-btn" onclick="deleteSingleLog(${pair.inId})">DEL</button>`;
    } else if (pair.outId) {
      deleteBtnHTML = `<button class="del-btn" onclick="deleteSingleLog(${pair.outId})">DEL</button>`;
    }

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${pair.employee}</td>
      <td>${pair.shift}</td>
      <td>${pair.dayType}</td>
      <td>${pair.date}</td>
      <td>${pair.timeInStr}</td>
      <td>${pair.timeOutStr}</td>
      <td>${pair.workHrs.toFixed(1)} hrs (${pair.otHrs.toFixed(1)} OT)</td>
      <td>₱${pair.computedPay.toFixed(2)}</td>
      <td style="text-align: center;">${deleteBtnHTML}</td>
    `;
    tbody.appendChild(tr);
  });

  const overview = document.getElementById('payrollOverview');
  if (overview) {
    overview.textContent = `Est. Work: ${totalHours.toFixed(1)} hrs | Pay: ₱${totalPay.toFixed(2)}`;
  }
}

function exportDTR() {
  const pairs = processDTRPairs();
  if (pairs.length === 0) return alert('Walang logs para i-export.');

  let csv = 'Employee,Shift,Day Type,Date,Time In,Time Out,Credited Work Hours,Paid OT Hours,Pay\n';
  pairs.forEach(p => {
    csv += `"${p.employee}","${p.shift}","${p.dayType}","${p.date}","${p.timeInStr}","${p.timeOutStr}",${p.workHrs.toFixed(1)},${p.otHrs.toFixed(1)},${p.computedPay.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `DTR_Export.csv`;
  a.click();
}
