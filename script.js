// 1. Live Clock Display sa Header
function updateClock() {
  const clockElem = document.getElementById('liveClock');
  if (clockElem) {
    const now = new Date();
    clockElem.textContent = now.toLocaleTimeString();
  }
}
setInterval(updateClock, 1000);

// 2. Initial Setup upon Page Load
document.addEventListener('DOMContentLoaded', () => {
  updateClock();
  
  // Set Current Month sa Filter
  const today = new Date();
  const currentMonthStr = today.toISOString().slice(0, 7); // YYYY-MM
  const monthFilter = document.getElementById('filterMonth');
  if (monthFilter) {
    monthFilter.value = currentMonthStr;
  }
  
  setPresetTime('now');
  renderTable();

  // Attach Form Submit Listener with Smooth Save Animation
  const dtrForm = document.getElementById('dtrForm');
  if (dtrForm) {
    dtrForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const btn = document.getElementById('btnSubmit');
      const btnText = document.getElementById('btnText');
      const name = document.getElementById('employeeName').value.trim();
      const shift = document.getElementById('workShift').value;
      const type = document.getElementById('logType').value;
      const timestamp = document.getElementById('logTimestamp').value;

      if (!name || !timestamp) {
        showToast('Please fill out all fields!', 'error');
        return;
      }

      // Smooth Button Loading Effect
      btn.style.pointerEvents = 'none';
      btn.style.opacity = '0.7';
      if (btnText) btnText.textContent = 'Saving...';

      setTimeout(() => {
        const logs = getLogs();
        logs.push({
          id: Date.now(),
          name: name,
          shift: shift,
          type: type,
          timestamp: timestamp
        });

        saveLogs(logs);

        // Reset Button State Smoothly
        btn.style.pointerEvents = 'auto';
        btn.style.opacity = '1';
        if (btnText) btnText.textContent = 'Save Log';

        // Clean Toast Notification Popup
        showToast(`Log saved successfully for ${name}!`, 'success');
        if (navigator.vibrate) navigator.vibrate(30);

        renderTable(true); // Re-render table and highlight
      }, 200);
    });
  }
});

// 3. Preset Time Buttons
function setPresetTime(type) {
  const now = new Date();
  const input = document.getElementById('logTimestamp');
  if (!input) return;

  if (type === 'now') {
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
  } else if (type === 'am') {
    now.setHours(6, 0, 0, 0);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
  } else if (type === 'pm') {
    now.setHours(18, 0, 0, 0);
    now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
    input.value = now.toISOString().slice(0, 16);
  }
}

// 4. LocalStorage Helpers
function getLogs() {
  return JSON.parse(localStorage.getItem('rgserve_dtr_logs') || '[]');
}

function saveLogs(logs) {
  localStorage.setItem('rgserve_dtr_logs', JSON.stringify(logs));
}

// 5. Clean Toast Popup Notification
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') {
    toast.style.borderLeftColor = '#ff4d4f';
  }

  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : '⚠️'}</span>
    <span>${msg}</span>
  `;

  container.appendChild(toast);

  setTimeout(() => toast.classList.add('show'), 10);

  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 200);
  }, 2000);
}

// 6. LOG PROCESSING (MAY BAWAS NA 1 HOUR UNPAID BREAKTIME)
function processLogs() {
  const rawLogs = getLogs();
  const paired = [];
  
  // Sort logs chronologically
  rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  // Group logs per employee
  const employeeLogs = {};
  rawLogs.forEach(log => {
    const key = log.name.toLowerCase().trim();
    if (!employeeLogs[key]) employeeLogs[key] = [];
    employeeLogs[key].push(log);
  });

  // Pair IN and OUT per employee
  Object.keys(employeeLogs).forEach(emp => {
    const logs = employeeLogs[emp];
    let currentIn = null;

    logs.forEach(log => {
      if (log.type === 'IN') {
        currentIn = log;
      } else if (log.type === 'OUT' && currentIn) {
        const timeIn = new Date(currentIn.timestamp);
        const timeOut = new Date(log.timestamp);
        
        const diffMs = timeOut - timeIn;
        let totalHours = diffMs > 0 ? (diffMs / (1000 * 60 * 60)) : 0;
        
        // UNPAID BREAKTIME LOGIC:
        // Kung lumagpas sa 5 oras ang rendering, magbabawas ng 1 hr para sa break.
        let paidHours = totalHours;
        if (totalHours >= 5) {
          paidHours = Math.max(0, totalHours - 1);
        }

        const hoursWorkedStr = paidHours.toFixed(2);

        // BASIC RATE CONFIGURATION (₱755/day = ₱94.375/hr)
        const dailyRate = 755;
        const hourlyRate = dailyRate / 8;
        const computedPay = (paidHours * hourlyRate).toFixed(2);

        const dateStr = currentIn.timestamp.split('T')[0];

        paired.push({
          id: log.id,
          name: currentIn.name,
          shift: currentIn.shift,
          date: dateStr,
          timeIn: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          timeOut: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          hoursWorked: hoursWorkedStr,
          computedPay: computedPay
        });

        currentIn = null; // Reset
      }
    });
  });

  return paired;
}

// 7. Table Rendering
function renderTable(highlightLatest = false) {
  const selectedMonthElem = document.getElementById('filterMonth');
  const cutoffElem = document.getElementById('filterCutoff');
  const tbody = document.getElementById('dtrTableBody');
  
  if (!tbody) return;

  const selectedMonth = selectedMonthElem ? selectedMonthElem.value : ''; 
  const cutoff = cutoffElem ? cutoffElem.value : 'ALL'; 
  
  tbody.innerHTML = '';

  const allPaired = processLogs();
  let totalHoursSum = 0;
  let totalPaySum = 0;
  let totalInToday = 0;
  let totalOutToday = 0;

  const todayStr = new Date().toISOString().split('T')[0];
  const rawLogs = getLogs();

  rawLogs.forEach(l => {
    if (l.timestamp && l.timestamp.startsWith(todayStr)) {
      if (l.type === 'IN') totalInToday++;
      if (l.type === 'OUT') totalOutToday++;
    }
  });

  const totalLogsElem = document.getElementById('totalLogs');
  const timeInElem = document.getElementById('timeInCount');
  const timeOutElem = document.getElementById('timeOutCount');

  if (totalLogsElem) totalLogsElem.textContent = rawLogs.filter(l => l.timestamp && l.timestamp.startsWith(todayStr)).length;
  if (timeInElem) timeInElem.textContent = totalInToday;
  if (timeOutElem) timeOutElem.textContent = totalOutToday;

  const filtered = allPaired.filter(item => {
    if (!item.date) return false;
    const [year, month, day] = item.date.split('-').map(Number);
    const itemMonthStr = `${year}-${String(month).padStart(2, '0')}`;

    if (selectedMonth && itemMonthStr !== selectedMonth) return false;
    if (cutoff === '1-15') return day >= 1 && day <= 15;
    if (cutoff === '16-31') return day >= 16 && day <= 31;

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #b0bac5; padding: 15px;">No matched IN/OUT logs found for the selected cut-off.</td></tr>`;
  } else {
    filtered.forEach((log, index) => {
      totalHoursSum += parseFloat(log.hoursWorked);
      totalPaySum += parseFloat(log.computedPay);

      const row = document.createElement('tr');
      
      if (highlightLatest && index === filtered.length - 1) {
        row.classList.add('row-highlight');
      }

      row.innerHTML = `
        <td><strong>${log.name}</strong></td>
        <td><span class="badge-shift ${log.shift === 'AM' ? 'badge-am' : 'badge-pm'}">${log.shift}</span></td>
        <td>${log.date}</td>
        <td>${log.timeIn}</td>
        <td>${log.timeOut}</td>
        <td>${log.hoursWorked} hrs</td>
        <td style="color: #00ff87; font-weight: bold;">₱${parseFloat(log.computedPay).toLocaleString('en-US', {minimumFractionDigits: 2})}</td>
      `;
      tbody.appendChild(row);
    });
  }

  const payrollOverview = document.getElementById('payrollOverview');
  if (payrollOverview) {
    payrollOverview.textContent = 
      `Est. Work: ${totalHoursSum.toFixed(2)} hrs | Pay: ₱${totalPaySum.toLocaleString('en-US', {minimumFractionDigits: 2})}`;
  }
}

// 8. Export Filtered Logs to CSV
function exportDTR() {
  const allPaired = processLogs();
  if (allPaired.length === 0) {
    showToast('No data available to export!', 'error');
    return;
  }

  let csvContent = "data:text/csv;charset=utf-8,Employee,Shift,Date,Time In,Time Out,Hours Worked,Computed Pay\n";
  allPaired.forEach(r => {
    csvContent += `"${r.name}","${r.shift}","${r.date}","${r.timeIn}","${r.timeOut}","${r.hoursWorked}","${r.computedPay}"\n`;
  });

  const encodedUri = encodeURI(csvContent);
  const link = document.createElement("a");
  link.setAttribute("href", encodedUri);
  link.setAttribute("download", `RGSERVE_DTR_Export.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
