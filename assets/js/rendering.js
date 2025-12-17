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
    const exposureTxt = (typeof d.ExposureTime === "number") ? d.ExposureTime.toFixed(2) + "s" : "-";
    const exposureNormTxt = (typeof d.ExposureTimeNorm === "number") ? Math.round(d.ExposureTimeNorm * 100) / 100 : "-";
    const mobilityCostTxt = (typeof d.MobilityCost === "number") ? d.MobilityCost.toFixed(2) + "s" : "-";
    const mobilityCostNormTxt = (typeof d.MobilityCostNorm === "number") ? Math.round(d.MobilityCostNorm * 100) / 100 : "-";
    const scoreTxt = (typeof d.Score === "number") ? d.Score.toFixed(1) : "-";
    const dpsTxt = d.DPS ? d.DPS : "-";
    const dpcRawTxt = (typeof d.DamagePerCycle === "number") ? Math.round(d.DamagePerCycle) : "-";
    const dpcNormTxt = (typeof d.DamagePerCycleNorm === "number") ? Math.round(d.DamagePerCycleNorm * 100) / 100 : "-";
    const dpcCell = `${dpcRawTxt}${dpcNormTxt !== "-" ? `<div class="subtle">${dpcNormTxt} norm</div>` : ""}`;
    const susTxt = (typeof d.Sustain === "number") ? d.Sustain.toFixed(1) : "-";
    const engageTxt = (typeof d.EngagementCapacity === "number") ? d.EngagementCapacity : "-";
    const engageWarn = d.ReloadEveryKill ? "⚠️" : "";
    const engageCell = `${engageTxt}${engageWarn ? `<div class="subtle">Reload each kill</div>` : ""}`;
    const relTxt = d.Reload ? d.Reload.toFixed(2) + "s" : "-";
    const relTaxTxt = (typeof d.ReloadTax === "number") ? (d.ReloadTax * 100).toFixed(1) + "%" : "-";
    const relPenaltyTxt = (typeof d.nReloadPenalty === "number") ? Math.round(d.nReloadPenalty * 100) / 100 : "-";
    const relCell = `${relTxt}${relTaxTxt !== "-" ? `<div class="subtle">${relTaxTxt} tax / ${relPenaltyTxt} norm</div>` : ""}`;
    const handlingTxt = (typeof d.HandlingIndex === "number") ? Math.round(d.HandlingIndex * 10) / 10 : "-";
    const handlingNormTxt = (typeof d.HandlingIndexNorm === "number") ? Math.round(d.HandlingIndexNorm * 100) / 100 : "-";
    const handlingCell = `${handlingTxt}${handlingNormTxt !== "-" ? `<div class="subtle">${handlingNormTxt} norm</div>` : ""}`;
    const rngTxt = d.Range ? d.Range + "m" : "-";
    const headDepTxt = (typeof d.HeadDep === "number") ? d.HeadDep.toFixed(2) : "-";
    const headDepNormTxt = (typeof d.HeadDepNorm === "number") ? Math.round(d.HeadDepNorm * 100) / 100 : "-";
    const headDepBadge = d.HeadDepHigh ? " 🔺" : "";
    const armTxt = (typeof d.ArmorCons === "number") ? Math.round(d.ArmorCons * 100) + "%" : "-";
    const volTxt = (typeof d.Vol === "number") ? d.Vol.toFixed(2) : "-";
    const consTxt = (typeof d.ConsistencyScore === "number") ? Math.round(d.ConsistencyScore * 100) / 100 : "-";
    const bpTxt = (typeof d.ArmorBreakpointScore === "number") ? Math.round(d.ArmorBreakpointScore * 100) / 100 : "-";

    return `
      <tr data-name="${escapeHtml(d.Name || '')}">
        <td class="stat-val">${d.Name}</td>
        <td class="highlight">${scoreTxt}</td>
        <td>${ttkTxt}</td>
        <td>${exposureTxt}${exposureNormTxt !== "-" ? `<div class="subtle">${exposureNormTxt} norm</div>` : ""}</td>
        <td>${mobilityCostTxt}${mobilityCostNormTxt !== "-" ? `<div class="subtle">${mobilityCostNormTxt} norm</div>` : ""}</td>
        <td>${dpsTxt}</td>
        <td>${dpcCell}</td>
        <td>${susTxt}</td>
        <td>${engageCell}</td>
        <td>${relCell}</td>
        <td>${handlingCell}</td>
        <td>${rngTxt}</td>
        <td>${headDepTxt}${headDepBadge}${headDepNormTxt !== "-" ? `<div class="subtle">${headDepNormTxt}</div>` : ""}</td>
        <td>${armTxt}</td>
        <td>${bpTxt}</td>
        <td>${consTxt}</td>
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
