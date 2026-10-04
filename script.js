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

  document.getElementById('dtrForm').addEventListener('submit', handleFormSubmit);
});

function initLiveClock() {
  setInterval(() => {
    const now = new Date();
    document.getElementById('liveClock').textContent = now.toLocaleTimeString('en-US', { hour12: true });
  }, 1000);
}

function setDefaultTimestamp() {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  document.getElementById('logTimestamp').value = now.toISOString().slice(0, 16);
}

function setDefaultFilterMonth() {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  document.getElementById('filterMonth').value = `${year}-${month}`;
}

function setPresetTime(type) {
  const timestampInput = document.getElementById('logTimestamp');
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
  
  const empName = document.getElementById('employeeName').value.trim();
  const shift = document.getElementById('workShift').value;
  const dayType = document.getElementById('dayType').value;
  const logType = document.getElementById('logType').value;
  const timestamp = document.getElementById('logTimestamp').value;

  if (!empName || !timestamp) return;

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
  renderTable();
}

function showToast(msg) {
  const container = document.getElementById('toastContainer');
  const toast = document.createElement('div');
  toast.className = 'toast';
  toast.innerHTML = `<span class="toast-icon">✓</span> <span>${msg}</span>`;
  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 3000);
}

// PAIRING IN & OUT LOGS & COMPUTING PAY
function processDTRPairs() {
  const pairedData = [];
  const sortedLogs = [...dtrLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  const pendingIns = {};

  sortedLogs.forEach(log => {
    const key = `${log.employee}_${log.shift}`;

    if (log.logType === 'IN') {
      pendingIns[key] = log;
    } else if (log.logType === 'OUT' && pendingIns[key]) {
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

      // Base Hourly Rate adjusted by Day Type (e.g., Double pay = 2.0x)
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
    }
  });

  return pairedData;
}

function renderTable() {
  const tbody = document.getElementById('dtrTableBody');
  tbody.innerHTML = '';

  const selectedMonth = document.getElementById('filterMonth').value; // YYYY-MM
  const selectedCutoff = document.getElementById('filterCutoff').value; // ALL, 1-15, 16-31

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

  document.getElementById('totalLogs').textContent = dtrLogs.length;
  document.getElementById('timeInCount').textContent = timeInTodayCount;
  document.getElementById('timeOutCount').textContent = timeOutTodayCount;

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
    let dayBadge = '<span class="badge-day day-reg">REG</span>';
    if (pair.dayType === 'REST_DAY') dayBadge = '<span class="badge-day day-rest">REST</span>';
    if (pair.dayType === 'SPECIAL_HOLIDAY') dayBadge = '<span class="badge-day day-spl">SPL HOL</span>';
    if (pair.dayType === 'REGULAR_HOLIDAY') dayBadge = '<span class="badge-day day-reghol">REG HOL</span>';
    if (pair.dayType === 'REST_SPECIAL') dayBadge = '<span class="badge-day day-spl">REST+SPL</span>';
    if (pair.dayType === 'REST_REGULAR') dayBadge = '<span class="badge-day day-reghol">REST+REG</span>';

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

  // Update Summary Cards
  document.getElementById('payrollOverview').textContent = 
    `Est. Work: ${totalHoursCutoff.toFixed(1)} hrs | Pay: ₱${totalPayCutoff.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
