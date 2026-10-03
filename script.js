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

  // Attach Form Submit Listener
  const dtrForm = document.getElementById('dtrForm');
  if (dtrForm) {
    dtrForm.addEventListener('submit', function(e) {
      e.preventDefault();
      
      const name = document.getElementById('employeeName').value.trim();
      const shift = document.getElementById('workShift').value;
      const type = document.getElementById('logType').value;
      const timestamp = document.getElementById('logTimestamp').value;

      if (!name || !timestamp) {
        alert('Paki-punan ang pangalan at petsa/oras!');
        return;
      }

      const logs = getLogs();
      logs.push({
        id: Date.now(),
        name: name,
        shift: shift,
        type: type,
        timestamp: timestamp
      });

      saveLogs(logs);
      showAlert('Na-save nang matagumpay!');
      renderTable();
    });
  }
});

// 3. Preset Time Buttons (Now, 6 AM, 6 PM)
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

// 5. Notification Alert Popup
function showAlert(msg) {
  const alertBox = document.getElementById('statusAlert');
  if (alertBox) {
    alertBox.style.display = 'block';
    alertBox.style.background = 'rgba(0, 255, 135, 0.2)';
    alertBox.style.color = '#00ff87';
    alertBox.textContent = msg;
    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
  }
}

// 6. Pag-oorganisa ng Time IN at Time OUT para sa Hours & Pay Computation
function processLogs() {
  const rawLogs = getLogs();
  const paired = [];
  const inMap = {};

  // Sort ayon sa oras
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
      
      const hourlyRate = 80; // Baguhin ang hourly rate dito kung kailangan
      const computedPay = (hoursWorked * hourlyRate).toFixed(2);

      paired.push({
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

// 7. Table Rendering na may Filter ng Cut-off Period (1-15 / 16-31)
function renderTable() {
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

  // Filter batay sa Buwan at Cut-off
  const filtered = allPaired.filter(item => {
    if (!item.date) return false;
    const [year, month, day] = item.date.split('-').map(Number);
    const itemMonthStr = `${year}-${String(month).padStart(2, '0')}`;

    if (selectedMonth && itemMonthStr !== selectedMonth) {
      return false;
    }

    if (cutoff === '1-15') {
      return day >= 1 && day <= 15;
    } else if (cutoff === '16-31') {
      return day >= 16 && day <= 31;
    }

    return true;
  });

  if (filtered.length === 0) {
    tbody.innerHTML = `<tr><td colspan="7" style="text-align: center; color: #b0bac5; padding: 15px;">Walang logs para sa napiling cut-off.</td></tr>`;
  } else {
    filtered.forEach(log => {
      totalHoursSum += parseFloat(log.hoursWorked);
      totalPaySum += parseFloat(log.computedPay);

      const row = document.createElement('tr');
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
    alert('Walang data na pwedeng i-export!');
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
