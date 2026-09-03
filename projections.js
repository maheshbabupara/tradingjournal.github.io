(function(){
  // projections.js — Monte Carlo projections (bootstrapped daily returns) + EWMA fallback
  // PoC: reads global `entries` and `getNetValue`/helpers from the host page.

  // Guard: wait until DOM is ready
  function ready(fn){if(document.readyState!=='loading')fn();else document.addEventListener('DOMContentLoaded',fn)}

  ready(()=>{
    // Create projections screen UI if not present
    const mount = document.getElementById('screen-projections');
    if(!mount) return;

    // Controls HTML
    mount.innerHTML = `
      <div class="glass-card rounded-3xl p-4 space-y-3">
        <div class="flex items-center justify-between">
          <div>
            <p class="text-[10px] font-bold uppercase tracking-widest text-slate-400">Projections</p>
            <h3 class="text-sm font-bold text-slate-200">Monte Carlo projection (bootstrapped returns)</h3>
          </div>
          <div class="text-right text-[12px] text-slate-400">Illustrative — not financial advice</div>
        </div>

        <div class="grid grid-cols-2 gap-2">
          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase">Horizon</label>
            <div class="flex gap-2">
              <select id="proj-horizon-unit" class="w-1/2 bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10">
                <option value="days">Days</option>
                <option value="weeks">Weeks</option>
                <option value="months">Months</option>
              </select>
              <input id="proj-horizon" type="number" min="1" step="1" value="30" class="w-1/2 bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10" />
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase">MC Runs</label>
            <input id="proj-runs" type="number" min="100" max="10000" step="100" value="2000" class="w-full bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10" />
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase">Confidence band</label>
            <div class="flex gap-2">
              <input id="proj-low" type="number" min="1" max="49" value="10" class="w-1/2 bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10" />
              <input id="proj-high" type="number" min="51" max="99" value="90" class="w-1/2 bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10" />
            </div>
          </div>

          <div class="space-y-1">
            <label class="text-[10px] font-bold text-slate-400 uppercase">Method</label>
            <select id="proj-method" class="w-full bg-slate-900/90 text-xs text-slate-200 rounded-xl px-3 py-2.5 border border-white/10">
              <option value="mc">Monte Carlo (bootstrap)</option>
              <option value="ewma">EWMA fallback</option>
            </select>
          </div>
        </div>

        <div class="flex items-center gap-2">
          <button id="proj-run-btn" class="tap-active w-full py-3 rounded-2xl bg-emerald-500 text-slate-950 font-black text-sm">Run Projection</button>
          <div id="proj-status" class="text-xs text-slate-400 ml-2">Ready</div>
        </div>

        <div class="text-[11px] text-slate-400">Tip: Projections use your historical daily net P&L. More history => better results.</div>
      </div>

      <div class="glass-card rounded-3xl p-4 mt-3">
        <canvas id="proj-canvas" class="w-full" height="220"></canvas>
        <div class="flex items-center justify-between mt-3">
          <div class="text-xs text-slate-400" id="proj-summary">No projection run yet</div>
          <div class="text-xs text-slate-400">Median &bull; 10–90% band</div>
        </div>
      </div>
    `;

    // Helper utilities
    const $ = s => document.querySelector(s);

    function toDayKey(d){ return new Date(d).toISOString().slice(0,10); }

    function buildDailySeries(){
      // Use global `entries` if available; fallback to cached localStorage
      const all = (window.entries && Array.isArray(window.entries)) ? window.entries.slice() : (JSON.parse(localStorage.getItem('trade_ledger_cache')||'[]'));
      // Aggregate net per day
      const map = new Map();
      (all || []).forEach(e => {
        if(!e) return;
        const key = toDayKey(e.trade_on);
        const net = (window.getNetValue && typeof window.getNetValue==='function') ? window.getNetValue(e) : (function(){
          const p = Math.abs(Number(e.pl)||0), c = Math.abs(Number(e.charges)||0); return (e.trade_result==='WIN'?p:e.trade_result==='LOSS'?-p:0)-c;
        })();
        const cur = map.get(key) || 0;
        map.set(key, cur + net);
      });
      // produce sorted arrays
      const days = Array.from(map.entries()).map(([d,net])=>({d,net})).sort((a,b)=>new Date(a.d)-new Date(b.d));
      if(!days.length) return {dates:[], equity:[], daily:[]};
      const dates = days.map(x=>x.d);
      const daily = days.map(x=>x.net);
      const equity = [];
      let running = 0;
      daily.forEach(v=>{ running += v; equity.push(running); });
      return {dates, daily, equity};
    }

    function percentile(sortedArr, p){
      if(!sortedArr.length) return 0;
      const pos = (p/100) * (sortedArr.length - 1);
      const base = Math.floor(pos);
      const rest = pos - base;
      if(sortedArr[base+1] !== undefined){
        return sortedArr[base] + rest * (sortedArr[base+1] - sortedArr[base]);
      } else {
        return sortedArr[base];
      }
    }

    function ewmaForecast(daily, horizon){
      // alpha chosen based on data length
      const alpha = 0.25;
      let s = daily.length?daily[0]:0;
      for(let i=1;i<daily.length;i++) s = alpha*daily[i] + (1-alpha)*s;
      // produce horizon daily forecast equal to s
      const forecast = new Array(horizon).fill(s);
      return forecast;
    }

    // Monte Carlo bootstrap (batched to avoid blocking main thread when runs large)
    function monteCarloBootstrap(dailyChanges, runs, horizon, startEquity, onProgress){
      const simsPerDay = Array.from({length:horizon}, ()=>[]);
      const batch = 200; // runs per chunk
      let completed = 0;
      return new Promise((resolve)=>{
        function runBatch(){
          const toRun = Math.min(batch, runs - completed);
          for(let r=0;r<toRun;r++){
            let val = startEquity;
            for(let d=0; d<horizon; d++){
              // sample random daily change with replacement
              const sample = dailyChanges[Math.floor(Math.random()*dailyChanges.length)];
              val += sample;
              simsPerDay[d].push(val);
            }
          }
          completed += toRun;
          if(onProgress) onProgress(Math.round((completed / runs) * 100));
          if(completed < runs){
            // schedule next batch
            setTimeout(runBatch, 0);
          } else {
            resolve(simsPerDay);
          }
        }
        runBatch();
      });
    }

    // Chart management
    let chart = null;
    function renderChart(histDates, histEquity, futureDates, median, lower, upper){
      const labels = histDates.concat(futureDates);
      const histNullPadding = new Array(futureDates.length).fill(null);
      const nullPadding = new Array(histDates.length).fill(null);

      const histData = histEquity.concat(histNullPadding);
      const lowerData = nullPadding.concat(lower);
      const upperData = nullPadding.concat(upper);
      const medianData = nullPadding.concat(median);

      const ctx = document.getElementById('proj-canvas').getContext('2d');
      if(chart) chart.destroy();

      chart = new Chart(ctx, {
        type: 'line',
        data: {
          labels,
          datasets: [
            {
              label: 'Historical Equity',
              data: histData,
              borderColor: '#10b981',
              borderWidth: 2,
              tension: 0.25,
              pointRadius: 0,
              spanGaps: true
            },
            {
              label: 'Lower',
              data: lowerData,
              borderColor: 'rgba(0,0,0,0)',
              backgroundColor: 'rgba(56,189,248,0.08)',
              pointRadius: 0,
              fill: false
            },
            {
              label: 'Upper',
              data: upperData,
              borderColor: 'rgba(0,0,0,0)',
              backgroundColor: 'rgba(56,189,248,0.12)',
              pointRadius: 0,
              fill: '-1'
            },
            {
              label: 'Median projection',
              data: medianData,
              borderColor: '#38bdf8',
              borderWidth: 2,
              tension: 0.3,
              pointRadius: 0
            }
          ]
        },
        options: {
          responsive: true,
          maintainAspectRatio: false,
          interaction: {mode: 'index', intersect: false},
          plugins: {
            legend: { display: true, labels: { color: '#cbd5e1', boxWidth: 12, padding: 8 } },
            tooltip: { mode: 'index', intersect: false }
          },
          scales: {
            x: { ticks: { color: '#94a3b8', maxRotation: 0, autoSkip: true, maxTicksLimit: 8 } },
            y: { ticks: { color: '#94a3b8', callback: v=> formatCurrencyShort(v) } }
          }
        }
      });
    }

    function formatCurrencyShort(n){
      if(n===null||n===undefined) return '';
      const abs = Math.abs(n);
      const sign = n<0?'-':'';
      if(abs>=100000) return `${sign}₹${(abs/100000).toFixed(1)}L`;
      if(abs>=1000) return `${sign}₹${(abs/1000).toFixed(1)}k`;
      return `${sign}₹${Math.round(abs)}`;
    }

    // Main runner
    async function runProjection(){
      const status = $('#proj-status');
      const runs = Math.max(100, Math.min(10000, Number($('#proj-runs').value) || 2000));
      let horizon = Number($('#proj-horizon').value) || 30;
      const unit = $('#proj-horizon-unit').value || 'days';
      if(unit==='weeks') horizon *= 5; // approximate trading days
      if(unit==='months') horizon *= 21;
      const low = Math.max(1, Math.min(49, Number($('#proj-low').value)||10));
      const high = Math.max(51, Math.min(99, Number($('#proj-high').value)||90));
      const method = $('#proj-method').value || 'mc';

      status.textContent = 'Preparing data…';

      const {dates:histDates, daily:dailyChanges, equity:histEquity} = buildDailySeries();
      const lastEquity = histEquity.length ? histEquity[histEquity.length-1] : 0;

      if(!histDates.length){ status.textContent = 'No historical trades to project from'; return; }

      // If not enough samples, force EWMA fallback
      const useEWMA = method==='ewma' || dailyChanges.length < 6;
      const futureDates = [];
      // build future labels (YYYY-MM-DD) from last historical date
      const lastDate = new Date(histDates[histDates.length-1] + 'T12:00:00');
      for(let i=1;i<=horizon;i++){
        const d = new Date(lastDate);
        d.setDate(d.getDate() + i);
        futureDates.push(d.toISOString().slice(0,10));
      }

      if(useEWMA){
        status.textContent = 'Running EWMA fallback…';
        const forecastDaily = ewmaForecast(dailyChanges, horizon);
        let val = lastEquity;
        const median = [], lower = [], upper = [];
        // simple assumption: use historical std dev to build bands
        const std = Math.sqrt(dailyChanges.reduce((s,x)=>s+Math.pow(x - (dailyChanges.reduce((a,b)=>a+b,0)/dailyChanges.length),2),0) / Math.max(1,dailyChanges.length-1));
        for(let i=0;i<horizon;i++){
          val += forecastDaily[i];
          median.push(val);
          lower.push(val - 1.28 * std * Math.sqrt(i+1)); // approx 10th percentile
          upper.push(val + 1.28 * std * Math.sqrt(i+1));
        }
        renderChart(histDates, histEquity, futureDates, median, lower, upper);
        status.textContent = `EWMA forecast for ${horizon} days`;
        $('#proj-summary').textContent = `Start ${formatCurrencyShort(lastEquity)} • Median change ${formatCurrencyShort(median[median.length-1]-lastEquity)}`;
        return;
      }

      // Monte Carlo
      status.textContent = 'Simulating… 0%';
      const simsPerDay = await monteCarloBootstrap(dailyChanges, runs, horizon, lastEquity, pct=>{ status.textContent = `Simulating… ${pct}%`; });
      status.textContent = 'Finalizing…';

      // compute percentiles
      const median = [], lower = [], upper = [];
      for(let d=0; d<horizon; d++){
        const arr = simsPerDay[d].slice().sort((a,b)=>a-b);
        lower.push(percentile(arr, low));
        median.push(percentile(arr, 50));
        upper.push(percentile(arr, high));
      }

      renderChart(histDates, histEquity, futureDates, median, lower, upper);
      status.textContent = `MC ${runs} runs • ${horizon} days`;
      $('#proj-summary').textContent = `Start ${formatCurrencyShort(lastEquity)} • Median ${formatCurrencyShort(median.at(-1))}`;
    }

    // Wire up run button
    $('#proj-run-btn').addEventListener('click', ()=>{ runProjection().catch(err=>{ console.error(err); $('#proj-status').textContent = 'Projection failed'; }); });

    // Expose a convenience function to re-render (used by host page integration)
    window.renderProjections = function(){ try{ runProjection(); }catch(e){ console.warn('renderProjections failed', e); } };

    // If Chart is not available yet, show a gentle message
    if(typeof Chart === 'undefined'){
      document.getElementById('proj-status').textContent = 'Chart.js missing — install CDN first';
    }

    // If the app has a global renderAllViews function, call projections after initial render
    if(typeof window.renderAllViews === 'function'){
      const original = window.renderAllViews;
      window.renderAllViews = function(){
        original();
        window.renderProjections();
      };
    }

    // Also run once on load
    setTimeout(()=>{ try{ window.renderProjections && window.renderProjections(); }catch(_){} }, 1200);
  });
})();
