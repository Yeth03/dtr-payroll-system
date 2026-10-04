// =========================================================
// DTR PAYROLL CONFIGURATION (EXPLICIT 755.00 DAILY RATE)
// =========================================================
const BASIC_DAILY_RATE = 755.00;
const REGULAR_HOURS_PER_DAY = 8;

const BASIC_HOURLY_RATE = BASIC_DAILY_RATE / REGULAR_HOURS_PER_DAY; // 94.375
const OVERTIME_MULTIPLIER = 1.25;
const NIGHT_DIFF_MULTIPLIER = 0.10; 

const GRACE_PERIOD_MINUTES = 15; 

const DAY_MULTIPLIERS = {
  "REGULAR": 1.00,
  "REST_DAY": 1.30,
  "SPECIAL_HOLIDAY": 1.30,
  "REGULAR_HOLIDAY": 2.00,
  "REST_SPECIAL": 1.50,
  "REST_REGULAR": 2.60
};

let dtrLogs = JSON.parse(localStorage.getItem('rgserve_dtr_logs')) || [];
let isSalaryHidden = JSON.parse(localStorage.getItem('rgserve_hide_salary')) || false;

// =========================================================
// INITIALIZATION
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  initLiveClock();
  setDefaultTimestamp();
  setDefaultFilterMonth();
  setDefaultEmployeeName();
  initSalaryToggleBtn();
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

function initSalaryToggleBtn() {
  let btn = document.getElementById('toggleSalaryBtn');
  if (!btn) {
    const overview = document.getElementById('payrollOverview');
    if (overview && overview.parentNode) {
      btn = document.createElement('button');
      btn.id = 'toggleSalaryBtn';
      btn.type = 'button';
      btn.style.cssText = 'margin-left: 10px; padding: 4px 10px; cursor: pointer; border-radius: 4px; border: 1px solid #4a5568; background: #2d3748; color: #fff; font-size: 12px; font-weight: bold;';
      overview.parentNode.insertBefore(btn, overview.nextSibling);
    }
  }

  if (btn) {
    updateSalaryBtnLabel(btn);
    btn.onclick = () => {
      isSalaryHidden = !isSalaryHidden;
      localStorage.setItem('rgserve_hide_salary', JSON.stringify(isSalaryHidden));
      updateSalaryBtnLabel(btn);
      renderTable();
    };
  }
}

function updateSalaryBtnLabel(btn) {
  if (btn) {
    btn.textContent = isSalaryHidden ? '👁️ Show Salary' : '🙈 Hide Salary';
  }
}

// =========================================================
// FORM HANDLING
// =========================================================
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

  setTimeout(() => { toast.remove(); }, 2500);
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

function clearAllLogs() {
  if (confirm("Sigurado ka bang gusto mong burahin LAHAT ng nakatagong logs sa system?")) {
    dtrLogs = [];
    localStorage.removeItem('rgserve_dtr_logs');
    renderTable();
    showToast("Lahat ng logs ay nabura na!");
  }
}

// =========================================================
// NIGHT DIFFERENTIAL & COMPUTATION
// =========================================================
function calculateNightDiffHours(timeIn, timeOut) {
  let ndMinutes = 0;
  let current = new Date(timeIn.getTime());

  while (current < timeOut) {
    let hour = current.getHours();
    if (hour >= 22 || hour < 6) {
      ndMinutes += 1;
    }
    current.setMinutes(current.getMinutes() + 1);
  }

  let totalND = ndMinutes / 60;
  if (totalND > 5) totalND -= 1;

  return Math.max(0, totalND);
}

function processDTRPairs() {
  const pairedData = [];
  const sortedLogs = [...dtrLogs].sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));
  const pendingIns = {};

  sortedLogs.forEach(log => {
    const key = `${log.employee}`;

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

        let timeIn = new Date(inLog.timestamp);
        const timeOut = new Date(log.timestamp);

        // Grace period computation for TIME IN (15 mins tolerance)
        let scheduledIn = new Date(timeIn.getTime());
        if (inLog.shift === 'AM') {
          scheduledIn.setHours(8, 0, 0, 0);
        } else if (inLog.shift === 'PM') {
          scheduledIn.setHours(20, 0, 0, 0);
        }

        let diffInMins = (timeIn - scheduledIn) / (1000 * 60);
        if (diffInMins > 0 && diffInMins <= GRACE_PERIOD_MINUTES) {
          timeIn = scheduledIn;
        }

        // Total Elapsed Time
        let totalElapsedHrs = (timeOut - timeIn) / (1000 * 60 * 60);
        if (totalElapsedHrs < 0) totalElapsedHrs = 0;

        // Bawas 1 hour meal break kapag lampas 5 hours
        let actualWorkHrs = totalElapsedHrs > 5 ? totalElapsedHrs - 1 : totalElapsedHrs;

        // STRICT CAPPING: Regular work hours is capped at exactly 8 hours
        let regHrs = Math.min(actualWorkHrs, REGULAR_HOURS_PER_DAY);
        
        // Excess hours above 8 hours
        let excessHrs = Math.max(0, actualWorkHrs - REGULAR_HOURS_PER_DAY);

        // =========================================================
        // STRICT 30-MINUTE / 1-HOUR OVERTIME STEP RULE
        // (0-29 mins excess = DISCARDED / 0 hr OT)
        // (30-59 mins excess = 0.5 hr OT)
        // (60 mins excess = 1.0 hr OT)
        // =========================================================
        let paidOtHrs = 0;
        if (excessHrs >= 0.5) { 
          paidOtHrs = Math.floor(excessHrs * 2) / 2; // Rounds down to nearest 0.5 hr (30 mins)
        }

        const dayMultiplier = DAY_MULTIPLIERS[inLog.dayType] || 1.00;
        const effectiveHourlyRate = BASIC_HOURLY_RATE * dayMultiplier;

        // REGULAR PAY: Fixed sa ₱755.00 * Day Multiplier kapag nakakumpleto ng 8 hrs
        let regPay = 0;
        if (actualWorkHrs >= REGULAR_HOURS_PER_DAY) {
          regPay = BASIC_DAILY_RATE * dayMultiplier;
        } else {
          regPay = regHrs * effectiveHourlyRate; // Pro-rated kapag kulang sa 8 hrs (undertime)
        }

        // OVERTIME PAY: Dagdag bayad kapag paidOtHrs > 0
        let otPay = paidOtHrs * (effectiveHourlyRate * OVERTIME_MULTIPLIER);

        // Night Differential Computation
        let ndHrs = 0;
        if (paidOtHrs > 0 || regHrs > 0) {
          let creditedEndMs = timeIn.getTime() + ((regHrs + (regHrs >= 8 ? 1 : 0) + paidOtHrs) * 60 * 60 * 1000);
          let validNDTimeOut = new Date(Math.min(timeOut.getTime(), creditedEndMs));
          ndHrs = calculateNightDiffHours(timeIn, validNDTimeOut);
        }

        let ndPay = ndHrs * (effectiveHourlyRate * NIGHT_DIFF_MULTIPLIER);

        const exactPay = regPay + otPay + ndPay;
        let creditedWorkHrs = regHrs + paidOtHrs;

        pairedData.push({
          inId: inLog.id,
          outId: log.id,
          employee: inLog.employee,
          shift: inLog.shift,
          dayType: inLog.dayType,
          date: timeIn.toLocaleDateString(),
          timeInStr: new Date(inLog.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
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

// =========================================================
// TABLE RENDER & EXPORT
// =========================================================
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

  const now = new Date();
  const todayStr = `${now.getMonth() + 1}/${now.getDate()}/${now.getFullYear()}`;

  dtrLogs.forEach(l => {
    const logDate = new Date(l.timestamp);
    const logDateStr = `${logDate.getMonth() + 1}/${logDate.getDate()}/${logDate.getFullYear()}`;
    if (logDateStr === todayStr) {
      if (l.logType === 'IN') inCount++;
      if (l.logType === 'OUT') outCount++;
    }
  });

  if (document.getElementById('totalLogs')) document.getElementById('totalLogs').textContent = dtrLogs.length;
  if (document.getElementById('timeInCount')) document.getElementById('timeInCount').textContent = inCount;
  if (document.getElementById('timeOutCount')) document.getElementById('timeOutCount').textContent = outCount;

  if (pairs.length === 0) {
    tbody.innerHTML = `<tr><td colspan="9" style="text-align:center; padding: 12px; color: #b0bac5;">Walang logs na nakita. Mag-add ng bago sa form sa itaas.</td></tr>`;
    
    const overview = document.getElementById('payrollOverview');
    if (overview) {
      const payText = isSalaryHidden ? '••••••' : '₱0.00';
      overview.textContent = `Est. Work: 0.0 hrs | Pay: ${payText}`;
    }
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

    const displayPay = isSalaryHidden ? '••••••' : `₱${pair.computedPay.toFixed(2)}`;

    const tr = document.createElement('tr');
    tr.innerHTML = `
      <td>${pair.employee}</td>
      <td>${pair.shift}</td>
      <td>${pair.dayType}</td>
      <td>${pair.date}</td>
      <td>${pair.timeInStr}</td>
      <td>${pair.timeOutStr}</td>
      <td>${pair.workHrs.toFixed(1)} hrs (${pair.otHrs.toFixed(1)} OT)</td>
      <td>${displayPay}</td>
      <td style="text-align: center;">${deleteBtnHTML}</td>
    `;
    tbody.appendChild(tr);
  });

  const overview = document.getElementById('payrollOverview');
  if (overview) {
    const totalPayDisplay = isSalaryHidden ? '••••••' : `₱${totalPay.toFixed(2)}`;
    overview.textContent = `Est. Work: ${totalHours.toFixed(1)} hrs | Pay: ${totalPayDisplay}`;
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
