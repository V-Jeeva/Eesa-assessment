let chartInstance = null;

const queryForm = document.getElementById('query-form');
const questionInput = document.getElementById('question-input');
const loadingDiv = document.getElementById('loading');
const messageBox = document.getElementById('message-box');
const resultsContainer = document.getElementById('results-container');
const sqlDisplay = document.getElementById('sql-display');
const tableContainer = document.getElementById('table-container');
const chartWrapper = document.getElementById('chart-wrapper');
const chartCanvas = document.getElementById('result-chart');

queryForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const question = questionInput.value.trim();
    if (!question) return;

    // Reset UI state
    loadingDiv.classList.remove('hidden');
    messageBox.classList.add('hidden');
    resultsContainer.classList.add('hidden');
    chartWrapper.classList.add('hidden');
    if (chartInstance) chartInstance.destroy();

    try {
        const response = await fetch('/ask', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ question })
        });
        const result = await response.json();
        loadingDiv.classList.add('hidden');

        if (result.status === 'refused') {
            messageBox.className = 'state-card refusal-msg';
            messageBox.innerHTML = `<h3>Honest Refusal</h3><p>${result.message || 'This question cannot be answered from the available data.'}</p>`;
            messageBox.classList.remove('hidden');
        } else if (result.status === 'error') {
            messageBox.className = 'state-card error-msg';
            messageBox.innerHTML = `<h3>Query Execution Error</h3><p>${result.message}</p>`;
            if (result.sql) {
                sqlDisplay.textContent = result.sql;
                resultsContainer.classList.remove('hidden');
            }
            messageBox.classList.remove('hidden');
        } else if (result.status === 'success') {
            sqlDisplay.textContent = result.sql;
            renderTable(result.columns, result.data);
            determineAndRenderChart(result.columns, result.data);
            resultsContainer.classList.remove('hidden');
        }
    } catch (err) {
        loadingDiv.classList.add('hidden');
        messageBox.className = 'state-card error-msg';
        messageBox.innerHTML = `<h3>Network Error</h3><p>${err.message}</p>`;
        messageBox.classList.remove('hidden');
    }
});

function renderTable(columns, data) {
    if (!data || data.length === 0) {
        tableContainer.innerHTML = '<p style="color:#94a3b8; padding: 1rem 0;">No matching records found.</p>';
        return;
    }

    let html = '<table><thead><tr>';
    columns.forEach(col => html += `<th>${col}</th>`);
    html += '</tr></thead><tbody>';

    data.forEach(row => {
        html += '<tr>';
        row.forEach(val => html += `<td>${val !== null ? val : '<em>null</em>'}</td>`);
        html += '</tr>';
    });

    html += '</tbody></table>';
    tableContainer.innerHTML = html;
}

// DETERMINISTIC CHART RULE:
// 1. If result has 2 columns: Column 0 is categorical/date label, Column 1 is numeric -> render Bar or Line chart.
// 2. If row count <= 1 or columns != 2 -> do not render chart.
function determineAndRenderChart(columns, data) {
    if (!data || data.length <= 1 || columns.length !== 2) {
        chartWrapper.classList.add('hidden');
        return;
    }

    const labels = data.map(row => String(row[0]));
    const rawValues = data.map(row => Number(row[1]));

    // Check if the second column is strictly numeric
    const isNumeric = rawValues.every(val => !isNaN(val) && val !== null);
    if (!isNumeric) {
        chartWrapper.classList.add('hidden');
        return;
    }

    // Rule: Check if label represents a date/month for line chart, otherwise bar chart
    const isDate = labels.some(l => l.includes('-') || l.includes('/') || ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'].some(m => l.toLowerCase().includes(m)));
    const chartType = isDate ? 'line' : 'bar';

    chartWrapper.classList.remove('hidden');
    const ctx = chartCanvas.getContext('2d');

    chartInstance = new Chart(ctx, {
        type: chartType,
        data: {
            labels: labels,
            datasets: [{
                label: columns[1],
                data: rawValues,
                backgroundColor: 'rgba(56, 189, 248, 0.6)',
                borderColor: '#38bdf8',
                borderWidth: 2,
                fill: isDate
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: { labels: { color: '#f8fafc' } }
            },
            scales: {
                x: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } },
                y: { ticks: { color: '#94a3b8' }, grid: { color: '#334155' } }
            }
        }
    });
}