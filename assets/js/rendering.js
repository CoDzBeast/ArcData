import { escapeHtml } from './utils.js';

export function renderChart(list, metric, existingChart) {
  const ctx = document.getElementById('mainChart').getContext('2d');
  const chartData = list.slice(0, 15);

  if (existingChart) existingChart.destroy();

  const labels = chartData.map(d => d.Name);

  let data, label;
  if (metric === "SCORE") {
    label = "Composite Score (Higher is Better)";
    data = chartData.map(d => d.Score);
  } else {
    label = "Time to Kill (Lower is Better)";
    data = chartData.map(d => (d.TTK ?? null));
  }

  return new Chart(ctx, {
    type: 'bar',
    data: {
      labels,
      datasets: [{
        label,
        data,
        backgroundColor: '#00d2ff',
        borderColor: '#00d2ff',
        borderWidth: 1
      }]
    },
    options: {
      responsive: true,
      scales: {
        y: { beginAtZero: true, grid: { color: '#1e293b' }, ticks: { color: '#fff' } },
        x: { ticks: { color: '#fff', font: { size: 10 } } }
      },
      plugins: { legend: { labels: { color: '#fff' } } }
    }
  });
}

export function renderTable(list, onRowClick) {
  const tbody = document.querySelector('#weaponTable tbody');

  tbody.innerHTML = list.map(d => {
    const ttkTxt = d.TTK ? d.TTK.toFixed(2) + "s" : "-";
    const scoreTxt = (typeof d.Score === "number") ? d.Score.toFixed(1) : "-";
    const dpsTxt = d.DPS ? d.DPS : "-";
    const susTxt = (typeof d.Sustain === "number") ? d.Sustain.toFixed(1) : "-";
    const relTxt = d.Reload ? d.Reload.toFixed(2) + "s" : "-";
    const rngTxt = d.Range ? d.Range + "m" : "-";
    const armTxt = (typeof d.ArmorCons === "number") ? Math.round(d.ArmorCons * 100) + "%" : "-";
    const volTxt = (typeof d.Vol === "number") ? d.Vol.toFixed(2) : "-";
    const bpTxt = (typeof d.ArmorBreakpointScore === "number") ? Math.round(d.ArmorBreakpointScore * 100) / 100 : "-";

    return `
      <tr data-name="${escapeHtml(d.Name || '')}">
        <td class="stat-val">${d.Name}</td>
        <td class="highlight">${scoreTxt}</td>
        <td>${ttkTxt}</td>
        <td>${dpsTxt}</td>
        <td>${susTxt}</td>
        <td>${relTxt}</td>
        <td>${rngTxt}</td>
        <td>${armTxt}</td>
        <td>${bpTxt}</td>
        <td>${volTxt}</td>
      </tr>
    `;
  }).join('');

  tbody.querySelectorAll('tr').forEach(row => {
    row.addEventListener('click', () => onRowClick(row.getAttribute('data-name')));
  });
}

export function renderDetailPanel(viewModel) {
  const { name, categoryText, statsHtml } = viewModel;
  document.getElementById('dName').innerText = name;
  document.getElementById('dCat').innerText = categoryText;
  document.getElementById('dStats').innerHTML = statsHtml;

  if (window.innerWidth < 1100) {
    document.getElementById('detailPanel').scrollIntoView({ behavior: 'smooth' });
  }
}
