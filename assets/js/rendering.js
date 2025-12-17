import { escapeHtml, safeNum } from './utils.js';

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
    const ttkVal = safeNum(d.TTK);
    const ttkTxt = ttkVal !== null ? `${ttkVal.toFixed(2)}s` : "-";
    const exposureVal = safeNum(d.ExposureTime);
    const exposureTxt = exposureVal !== null ? `${exposureVal.toFixed(2)}s` : "-";
    const exposureNormTxt = (typeof d.ExposureTimeNorm === "number") ? Math.round(d.ExposureTimeNorm * 100) / 100 : "-";
    const mobilityCostVal = safeNum(d.MobilityCost);
    const mobilityCostTxt = mobilityCostVal !== null ? `${mobilityCostVal.toFixed(2)}s` : "-";
    const mobilityCostNormTxt = (typeof d.MobilityCostNorm === "number") ? Math.round(d.MobilityCostNorm * 100) / 100 : "-";
    const scoreVal = safeNum(d.Score);
    const scoreTxt = scoreVal !== null ? scoreVal.toFixed(1) : "-";
    const counterVal = safeNum(d.CounterScore);
    const counterTxt = counterVal !== null ? counterVal.toFixed(1) : "-";
    const counterRankVal = safeNum(d.CounterRank);
    const counterRankTxt = counterRankVal !== null ? `${counterRankVal.toFixed(1)}%` : "-";
    const counterBadge = d.CounterTop10 ? `<div class="subtle">🛡️ Meta counter</div>` : "";
    const counterCell = (counterTxt === "-") ? "-" : `${counterTxt}${counterRankTxt !== "-" ? `<div class="subtle">${counterRankTxt} rank</div>` : ""}${counterBadge}`;
    const outlierVal = safeNum(d.OutlierIndex);
    const outlierTxt = outlierVal !== null ? `${outlierVal.toFixed(2)}σ` : "-";
    const outlierBadge = d.OutlierWarning ? `<div class="warn-pill">⚠️ Spike</div>` : "";
    const outlierCell = (outlierTxt === "-") ? "-" : `${outlierTxt}${outlierBadge ? `<div class="subtle">${outlierBadge}</div>` : ""}`;
    const dominanceVal = safeNum(d.RoleDominanceIndex);
    const dominanceTxt = dominanceVal !== null ? `${dominanceVal.toFixed(1)}%` : "-";
    const dominanceCell = d.RoleDominanceTop10
      ? `${dominanceTxt}<div class="subtle">Top 10% role</div>`
      : dominanceTxt;
    const dpsTxt = d.DPS ? d.DPS : "-";
    const dpcRawTxt = (typeof d.DamagePerCycle === "number") ? Math.round(d.DamagePerCycle) : "-";
    const dpcNormTxt = (typeof d.DamagePerCycleNorm === "number") ? Math.round(d.DamagePerCycleNorm * 100) / 100 : "-";
    const dpcCell = `${dpcRawTxt}${dpcNormTxt !== "-" ? `<div class="subtle">${dpcNormTxt} norm</div>` : ""}`;
    const susVal = safeNum(d.Sustain);
    const susTxt = susVal !== null ? susVal.toFixed(1) : "-";
    const engageTxt = (typeof d.EngagementCapacity === "number") ? d.EngagementCapacity : "-";
    const engageWarn = d.ReloadEveryKill ? "⚠️" : "";
    const engageCell = `${engageTxt}${engageWarn ? `<div class="subtle">Reload each kill</div>` : ""}`;
    const relVal = safeNum(d.Reload);
    const relTxt = relVal !== null ? `${relVal.toFixed(2)}s` : "-";
    const relTaxTxt = (typeof d.ReloadTax === "number") ? (d.ReloadTax * 100).toFixed(1) + "%" : "-";
    const relPenaltyTxt = (typeof d.nReloadPenalty === "number") ? Math.round(d.nReloadPenalty * 100) / 100 : "-";
    const relCell = `${relTxt}${relTaxTxt !== "-" ? `<div class="subtle">${relTaxTxt} tax / ${relPenaltyTxt} norm</div>` : ""}`;
    const handlingTxt = (typeof d.HandlingIndex === "number") ? Math.round(d.HandlingIndex * 10) / 10 : "-";
    const handlingNormTxt = (typeof d.HandlingIndexNorm === "number") ? Math.round(d.HandlingIndexNorm * 100) / 100 : "-";
    const handlingCell = `${handlingTxt}${handlingNormTxt !== "-" ? `<div class="subtle">${handlingNormTxt} norm</div>` : ""}`;
    const rngVal = safeNum(d.Range);
    const rngTxt = rngVal !== null ? `${rngVal}m` : "-";
    const headDepVal = safeNum(d.HeadDep);
    const headDepTxt = headDepVal !== null ? headDepVal.toFixed(2) : "-";
    const headDepNormTxt = (typeof d.HeadDepNorm === "number") ? Math.round(d.HeadDepNorm * 100) / 100 : "-";
    const headDepBadge = d.HeadDepHigh ? " 🔺" : "";
    const critLevVal = safeNum(d.CritLeverage);
    const critLevTxt = critLevVal !== null ? `${critLevVal.toFixed(2)}s` : "-";
    const critLevNormTxt = (typeof d.CritLeverageNorm === "number") ? Math.round(d.CritLeverageNorm * 100) / 100 : "-";
    const armTxt = (typeof d.ArmorCons === "number") ? Math.round(d.ArmorCons * 100) + "%" : "-";
    const armorPenDeltaVal = safeNum(d.ArmorPenDelta);
    const armorPenDeltaTxt = armorPenDeltaVal !== null ? `${(armorPenDeltaVal * 100).toFixed(1)}%` : "-";
    const armorPenSecondsVal = safeNum(d.ArmorPenDeltaSeconds);
    const armorPenSecondsTxt = armorPenSecondsVal !== null ? `${armorPenSecondsVal.toFixed(2)}s` : "-";
    const armorPenNormTxt = (typeof d.ArmorPenScore === "number") ? Math.round(d.ArmorPenScore * 100) / 100 : "-";
    const armorPenCell = (armorPenDeltaTxt === "-")
      ? "-"
      : `${armorPenSecondsTxt}<div class="subtle">${armorPenDeltaTxt} / ${armorPenNormTxt} norm</div>`;
    const volVal = safeNum(d.Vol);
    const volTxt = volVal !== null ? volVal.toFixed(2) : "-";
    const consTxt = (typeof d.ConsistencyScore === "number") ? Math.round(d.ConsistencyScore * 100) / 100 : "-";
    const skillFloorVal = safeNum(d.SkillFloorScore);
    const skillFloorTxt = skillFloorVal !== null ? skillFloorVal.toFixed(1) : "-";
    const skillFloorCell = (skillFloorTxt === "-")
      ? "-"
      : `${skillFloorTxt}<div class="subtle">${typeof d.KillsPerMagNorm === "number" ? `K/Mag ${Math.round(d.KillsPerMagNorm * 100) / 100}` : "Head/Cons/K/Mag"}</div>`;
    const skillCeilingVal = safeNum(d.SkillCeilingScore);
    const skillCeilingTxt = skillCeilingVal !== null ? skillCeilingVal.toFixed(1) : "-";
    const skillCeilingCell = (skillCeilingTxt === "-")
      ? "-"
      : `${skillCeilingTxt}<div class="subtle">Crit/Handling/Head</div>`;
    const bpTxt = (typeof d.ArmorBreakpointScore === "number") ? Math.round(d.ArmorBreakpointScore * 100) / 100 : "-";

    return `
      <tr data-name="${escapeHtml(d.Name || '')}">
        <td class="stat-val">${d.Name}</td>
        <td class="highlight">${scoreTxt}</td>
        <td>${counterCell}</td>
        <td>${outlierCell}</td>
        <td>${dominanceCell}</td>
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
        <td>${critLevTxt}${critLevNormTxt !== "-" ? `<div class="subtle">${critLevNormTxt} norm</div>` : ""}</td>
        <td>${armTxt}</td>
        <td>${armorPenCell}</td>
        <td>${bpTxt}</td>
        <td>${skillCeilingCell}</td>
        <td>${skillFloorCell}</td>
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
