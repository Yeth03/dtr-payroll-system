// 1. Live Clock Display sa Header
function updateClock() {
  const clockElem = document.getElementById('liveClock');
  if (clockElem) {
    const now = new Date();
    clockElem.textContent = now.toLocaleTimeString();
  }
}
setInterval(updateClock, 1000);

// 2. Initial Setup pagka-load ng Page
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

  // Attach Form Submit Listener na may Animation Effects
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
        showToast('Paki-punan ang lahat ng detalye!', 'error');
        return;
      }

      // Visual Effect 1: Button Loading State
      btn.style.pointerEvents = 'none';
      btnText.textContent = 'Saving... ⏳';

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

        // Reset Button State
        btn.style.pointerEvents = 'auto';
        btnText.textContent = 'Save Log';

        // Visual Effect 2: Toast Notification Popup & Sound/Vibration
        showToast(`✔ Saved log for ${name}!`, 'success');
        if (navigator.vibrate) navigator.vibrate(50); // Mabilis na haptic vibration sa CP

        renderTable(true); // Highlighting new entry
      }, 300);
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

// 5. Animated Toast Popup Notification
function showToast(msg, type = 'success') {
  const container = document.getElementById('toastContainer');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = 'toast';
  if (type === 'error') {
    toast.style.borderLeftColor = '#ff5f56';
  }

  toast.innerHTML = `
    <span class="toast-icon">${type === 'success' ? '✓' : '⚠️'}</span>
    <span>${msg}</span>
  `;

  container.appendChild(toast);

  // Trigger animation
  setTimeout(() => toast.classList.add('show'), 10);

  // Auto remove pagkatapos ng 2.5 seconds
  setTimeout(() => {
    toast.classList.remove('show');
    setTimeout(() => toast.remove(), 300);
  }, 2500);
}

// 6. Processing of IN/OUT Logs
function processLogs() {
  const rawLogs = getLogs();
  const paired = [];
  const inMap = {};

  rawLogs.sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp));

  rawLogs.forEach(log => {
    const dateStr = log.timestamp.split('T')[0];
    const key = `${log.name}_${log.shift}_${dateStr}`;

    if (log.type === 'IN') {
      inMap[key] = log;
    } else if (log.type === 'OUT' && inMap[key]) {
      const timeIn = new Date(inMap[key].timestamp);
      const timeOut = new Date(log.timestamp);
      const diffMs = timeOut - timeIn;
      const hoursWorked = diffMs > 0 ? (diffMs / (1000 * 60 * 60)).toFixed(2) : 0;
      
      const hourlyRate = 80;
      const computedPay = (hoursWorked * hourlyRate).toFixed(2);

      paired.push({
        id: log.id,
        name: log.name,
        shift: log.shift,
        date: dateStr,
        timeIn: timeIn.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        timeOut: timeOut.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        hoursWorked: hoursWorked,
        computedPay: computedPay
      });

      delete inMap[key];
    }
  });

  return paired;
}

// 7. Table Rendering with Highlight Animation
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
    if (l.timestamp.startsWith(todayStr)) {
      if (l.type === 'IN') totalInToday++;
      if (l.type === 'OUT') totalOutToday++;
    }
  });

  const totalLogsElem = document.getElementById('totalLogs');
  const timeInElem = document.getElementById('timeInCount');
  const timeOutElem = document.getElementById('timeOutCount');

  if (totalLogsElem) totalLogsElem.textContent = rawLogs.filter(l => l.timestamp.startsWith(todayStr)).length;
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
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #b0bac5; padding: 15px;">Walang logs para sa napiling cut-off.</td></tr>`;
  } else {
    filtered.forEach((log, index) => {
      totalHoursSum += parseFloat(log.hoursWorked);
      totalPaySum += parseFloat(log.computedPay);

      const row = document.createElement('tr');
      
      // Visual Effect 3: Green Glow Effect sa pinakabagong nai-save na row
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

// 8. Export filtered logs to CSV
function exportDTR() {
  const allPaired = processLogs();
  if (allPaired.length === 0) {
    showToast('Walang data na pwedeng i-export!', 'error');
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
