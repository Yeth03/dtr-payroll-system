// CONFIGURATION
const BASIC_DAILY_RATE = 755.00;
const REGULAR_HOURS_PER_DAY = 8;
const BASIC_HOURLY_RATE = BASIC_DAILY_RATE / REGULAR_HOURS_PER_DAY; // ₱94.375/hr
const OVERTIME_MULTIPLIER = 1.25; // 25% OT Premium

// PREMIUM RATES ACCORDING TO LABOR CODE
const DAY_MULTIPLIERS = {
  "REGULAR": 1.00,        // 100%
  "REST_DAY": 1.30,       // 130%
  "SPECIAL_HOLIDAY": 1.30,// 130%
  "REGULAR_HOLIDAY": 2.00,// 200%
  "REST_SPECIAL": 1.50,   // 150%
  "REST_REGULAR": 2.60    // 260%
};

let dtrLogs = JSON.parse(localStorage.getItem('rgserve_dtr_logs')) || [];

document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  setDefaultTimestamp();
  setDefaultFilterMonth();
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

function setPresetTime(type) {
  const timestampInput = document.getElementById('logTimestamp');
  if (!timestampInput) return;

  const now = new Date();
  
  if (type === 'am') {
    now.setHours(6, 0, 0, 0);
  } else if (type === 'pm') {
    now.setHours(18, 0, 0, 0);
  }
  
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  timestampInput.value = now.toISOString().slice(0, 16);
}

function handleFormSubmit(e) {
  e.preventDefault();
  
  const empNameInput = document.getElementById('employeeName');
  const empName = empNameInput ? empNameInput.value.trim() : '';
  const shift = document.getElementById('workShift') ? document.getElementById('workShift').value : 'AM';
  const dayType = document.getElementById('dayType') ? document.getElementById('dayType').value : 'REGULAR';
  const logType = document.getElementById('logType') ? document.getElementById('logType').value : 'IN';
  const timestamp = document.getElementById('logTimestamp') ? document.getElementById('logTimestamp').value : '';

  if (!empName || !timestamp) {
    alert("Pakilagay ang pangalan ng employee at ang date/time!");
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

  showToast(`Log saved for ${empName} (${logType})`);
  
  if (empNameInput) empNameInput.value = '';
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
  toast.className = 'toast';
  toast.style.cssText = 'background: rgba(0, 242, 254, 0.9); color: #000; padding: 8px 12px; border-radius: 4px; margin-top: 5px; font-weight: bold; font-size: 11px; box-shadow: 0 2px 8px rgba(0,0,0,0.3);';
  toast.innerHTML = `<span>✓ ${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transition = 'opacity 0.3s';
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// PAIRING IN & OUT LOGS & COMPUTING PAY
function processDTRPairs() {
  const pairedData = [];
  const sortedLogs = [...dtrLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const pendingIns = {};

  sortedLogs.forEach(log => {
    const key = `${log.employee}_${log.shift}`;

    if (log.logType === 'IN') {
      // Kung may umiiral nang pending IN, i-push muna natin bilang partial/unpaired
      if (pendingIns[key]) {
        const prevIn = pendingIns[key];
        const prevTimeIn = new Date(prevIn.timestamp);
        pairedData.push({
          id: prevIn.id,
          employee: prevIn.employee,
          shift: prevIn.shift,
          dayType: prevIn.dayType,
          date: prevTimeIn.toLocaleDateString(),
          timeInStr: prevTimeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeOutStr: '--:--',
          rawDate: prevTimeIn,
          workHrs: 0,
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

        // Compute total hours
        let diffMs = timeOut - timeIn;
        let totalHrs = diffMs / (1000 * 60 * 60);

        // Subtract 1-hour unpaid break for shifts 5 hrs or longer
        let actualWorkHrs = totalHrs > 5 ? totalHrs - 1 : totalHrs;
        if (actualWorkHrs < 0) actualWorkHrs = 0;

        // Regular vs Overtime hours
        let regHrs = Math.min(actualWorkHrs, REGULAR_HOURS_PER_DAY);
        let otHrs = Math.max(0, actualWorkHrs - REGULAR_HOURS_PER_DAY);

        // Day Type Rate Multiplier
        const dayMultiplier = DAY_MULTIPLIERS[inLog.dayType] || 1.00;

        // Base Hourly Rate adjusted by Day Type
        const effectiveHourlyRate = BASIC_HOURLY_RATE * dayMultiplier;
        
        // Pay Computations
        const regPay = regHrs * effectiveHourlyRate;
        const otPay = otHrs * (effectiveHourlyRate * OVERTIME_MULTIPLIER);
        const totalPay = regPay + otPay;

        pairedData.push({
          id: inLog.id,
          employee: inLog.employee,
          shift: inLog.shift,
          dayType: inLog.dayType,
          date: timeIn.toLocaleDateString(),
          timeInStr: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeOutStr: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawDate: timeIn,
          workHrs: actualWorkHrs,
          computedPay: totalPay
        });
      } else {
        // TIME OUT nang walang ka-pair na TIME IN
        const timeOut = new Date(log.timestamp);
        pairedData.push({
          id: log.id,
          employee: log.employee,
          shift: log.shift,
          dayType: log.dayType,
          date: timeOut.toLocaleDateString(),
          timeInStr: '--:--',
          timeOutStr: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          rawDate: timeOut,
          workHrs: 0,
          computedPay: 0
        });
      }
    }
  });

  // Isama ang natitirang pending IN logs (pumasok pa lang pero wala pang OUT)
  Object.keys(pendingIns).forEach(key => {
    const inLog = pendingIns[key];
    const timeIn = new Date(inLog.timestamp);
    pairedData.push({
      id: inLog.id,
      employee: inLog.employee,
      shift: inLog.shift,
      dayType: inLog.dayType,
      date: timeIn.toLocaleDateString(),
      timeInStr: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      timeOutStr: 'Pending OUT',
      rawDate: timeIn,
      workHrs: 0,
      computedPay: 0
    });
  });

  return pairedData;
}

function renderTable() {
  const tbody = document.getElementById('dtrTableBody');
  if (!tbody) return;

  tbody.innerHTML = '';

  const filterMonthEl = document.getElementById('filterMonth');
  const filterCutoffEl = document.getElementById('filterCutoff');

  const selectedMonth = filterMonthEl ? filterMonthEl.value : '';
  const selectedCutoff = filterCutoffEl ? filterCutoffEl.value : 'ALL';

  const pairs = processDTRPairs();
  
  let totalHoursCutoff = 0;
  let totalPayCutoff = 0;
  let timeInTodayCount = 0;
  let timeOutTodayCount = 0;

  const todayStr = new Date().toLocaleDateString();

  // Count Today's Logs for Summary Cards
  dtrLogs.forEach(l => {
    if (new Date(l.timestamp).toLocaleDateString() === todayStr) {
      if (l.logType === 'IN') timeInTodayCount++;
      if (l.logType === 'OUT') timeOutTodayCount++;
    }
  });

  const totalLogsEl = document.getElementById('totalLogs');
  const timeInCountEl = document.getElementById('timeInCount');
  const timeOutCountEl = document.getElementById('timeOutCount');

  if (totalLogsEl) totalLogsEl.textContent = dtrLogs.length;
  if (timeInCountEl) timeInCountEl.textContent = timeInTodayCount;
  if (timeOutCountEl) timeOutCountEl.textContent = timeOutTodayCount;

  if (pairs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="8" style="text-align:center; padding: 10px; color: #b0bac5;">Walang data na nakita.</td></tr>`;
  }

  pairs.forEach(pair => {
    const pairYearMonth = `${pair.rawDate.getFullYear()}-${String(pair.rawDate.getMonth() + 1).padStart(2, '0')}`;
    const dayOfMonth = pair.rawDate.getDate();

    // Month Filter
    if (selectedMonth && pairYearMonth !== selectedMonth) return;

    // Cut-off Filter
    if (selectedCutoff === '1-15' && dayOfMonth > 15) return;
    if (selectedCutoff === '16-31' && dayOfMonth < 16) return;

    totalHoursCutoff += pair.workHrs;
    totalPayCutoff += pair.computedPay;

    // Day Type Badge Generator
    let dayBadge = '<span class="badge-day day-reg" style="color: #00f2fe;">REG</span>';
    if (pair.dayType === 'REST_DAY') dayBadge = '<span class="badge-day day-rest" style="color: #ffbd2e;">REST</span>';
    if (pair.dayType === 'SPECIAL_HOLIDAY') dayBadge = '<span class="badge-day day-spl" style="color: #ff5f56;">SPL HOL</span>';
    if (pair.dayType === 'REGULAR_HOLIDAY') dayBadge = '<span class="badge-day day-reghol" style="color: #00ff87;">REG HOL</span>';
    if (pair.dayType === 'REST_SPECIAL') dayBadge = '<span class="badge-day day-spl" style="color: #ff5f56;">REST+SPL</span>';
    if (pair.dayType === 'REST_REGULAR') dayBadge = '<span class="badge-day day-reghol" style="color: #00ff87;">REST+REG</span>';

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${pair.employee}</td>
      <td><span class="badge-shift ${pair.shift === 'AM' ? 'badge-am' : 'badge-pm'}">${pair.shift}</span></td>
      <td>${dayBadge}</td>
      <td>${pair.date}</td>
      <td>${pair.timeInStr}</td>
      <td>${pair.timeOutStr}</td>
      <td>${pair.workHrs.toFixed(1)} hrs</td>
      <td>₱${pair.computedPay.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</td>
    `;
    tbody.appendChild(tr);
  });

  // Update Summary Overview
  const payrollOverviewEl = document.getElementById('payrollOverview');
  if (payrollOverviewEl) {
    payrollOverviewEl.textContent = 
      `Est. Work: ${totalHoursCutoff.toFixed(1)} hrs | Pay: ₱${totalPayCutoff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
}

function exportDTR() {
  const pairs = processDTRPairs();
  if (pairs.length === 0) {
    alert('No completed logs to export.');
    return;
  }

  let csv = 'Employee,Shift,Day Type,Date,Time In,Time Out,Work Hours,Computed Pay\n';
  pairs.forEach(p => {
    csv += `"${p.employee}","${p.shift}","${p.dayType}","${p.date}","${p.timeInStr}","${p.timeOutStr}",${p.workHrs.toFixed(2)},${p.computedPay.toFixed(2)}\n`;
  });

  const blob = new Blob([csv], { type: 'text/csv' });
  const url = window.URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.setAttribute('href', url);
  a.setAttribute('download', `DTR_Payroll_Export_${new Date().toISOString().slice(0, 10)}.csv`);
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
}
