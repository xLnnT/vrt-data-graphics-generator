// VRT Data Graphics Generator

const MAX_BARS = 30, BASE_WIDTH = 1920, BASE_HEIGHT = 1080, DEBOUNCE_DELAY = 150;
const BAR_ANIMATION_DURATION = 0.5, DEFAULT_STAGGER = 0.15;
const PANEL_EASING = { cp1x: 0.00, cp1y: 0.90, cp2x: 0.30, cp2y: 1.00 };
const PANEL_ANIMATION_DURATION = 0.5, MAX_FILE_SIZE = 100 * 1024 * 1024;

const debounce = (func, wait) => { let timeout; return (...args) => { clearTimeout(timeout); timeout = setTimeout(() => func(...args), wait); }; };
const scheduleUpdate = (callback) => requestAnimationFrame(() => requestAnimationFrame(callback));

const state = {
    chart: null, scaleFactor: 1, isPlaying: false, currentFrame: 0, totalDuration: 20,
    animationId: null, highlightedBars: new Set([5]), logoImages: {}, uploadedFile: null,
    logoSettings: { region: '', mono: false, labels: [] },
    easingPoints: { cp1x: 0.00, cp1y: 0.90, cp2x: 0.30, cp2y: 1.00 },
    barTimings: [], lastGraphInTime: 1, isUpdatingChart: false,
    lineClipProgress: 1
};

// Chart.js plugin for line trim path animation
const lineClipPlugin = {
    id: 'lineClip',
    beforeDatasetDraw(chart, args) {
        if (chart.config.type !== 'line' || state.lineClipProgress >= 1) return;
        const { ctx, chartArea } = chart;
        const clipWidth = chartArea.width * state.lineClipProgress;
        ctx.save();
        ctx.beginPath();
        ctx.rect(chartArea.left, chartArea.top, clipWidth, chartArea.height);
        ctx.clip();
    },
    afterDatasetDraw(chart) {
        if (chart.config.type !== 'line' || state.lineClipProgress >= 1) return;
        chart.ctx.restore();
    }
};

let elements = null, easingDragging = null, isExporting = false, lastVideoFrameCanvas = null;

function cacheElements() {
    const $ = id => document.getElementById(id);
    elements = {
        chartType: $('chartType'), position: $('position'), panelWidth: $('panelWidth'), barWidth: $('barWidth'),
        primaryColor: $('primaryColor'), highlightColor: $('highlightColor'),
        showText: $('showText'), showLogos: $('showLogos'), showValues: $('showValues'), logoOptions: $('logoOptions'),
        partyRegion: $('partyRegion'), monoLogos: $('monoLogos'),
        uploadArea: $('uploadArea'), fileInput: $('fileInput'),
        graphIn: $('graphIn'), graphOut: $('graphOut'),
        previewArea: $('previewArea'), previewBackground: $('previewBackground'),
        chartCanvas: $('chartCanvas'), chartTitle: $('chartTitle'),
        chartSubtitle: $('chartSubtitle'), chartSource: $('chartSource'),
        chartContainer: null, chartWrapper: null,
        titleInput: $('titleInput'), subtitleInput: $('subtitleInput'),
        sourceInput: $('sourceInput'), xAxisInput: $('xAxisInput'), yAxisInput: $('yAxisInput'), suffixInput: $('suffixInput'),
        importArea: $('importArea'), dataFileInput: $('dataFileInput'),
        importFileDisplay: $('importFileDisplay'), importFileName: $('importFileName'), importFileDelete: $('importFileDelete'),
        uploadFileDisplay: $('uploadFileDisplay'), uploadFileName: $('uploadFileName'), uploadFileDelete: $('uploadFileDelete'),
        easingCanvas: $('easingCanvas'), easingValues: $('easingValues'),
        playBtn: $('playBtn'), currentTime: $('currentTime'), totalTime: $('totalTime'),
        timelineProgress: $('timelineProgress'), timelineThumb: $('timelineThumb'),
        barTimingMarkers: $('barTimingMarkers'), timelineTrack: document.querySelector('.timeline-track'),
        exportStart: $('exportStart'), exportEnd: $('exportEnd'),
        outputBtns: document.querySelectorAll('.output-btn')
    };
    elements.chartContainer = elements.previewArea.querySelector('.chart-container');
    elements.chartWrapper = elements.chartCanvas.parentElement;
}

const getMaxBars = () => (elements.position.value === 'left' || elements.position.value === 'right') ? 2 : MAX_BARS;
const getXAxisLabels = () => elements.xAxisInput.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, getMaxBars());
const getYAxisData = () => elements.yAxisInput.value.split(',').map(s => parseFloat(s.trim()) || 0).slice(0, getMaxBars());
const getBarColors = () => { const p = elements.primaryColor.dataset.color, h = elements.highlightColor.dataset.color; return getXAxisLabels().map((_, i) => state.highlightedBars.has(i) ? h : p); };
const isCompact = () => elements.position.value === 'left' || elements.position.value === 'right';
function calcNiceYScale(maxValue) {
    if (maxValue <= 0) return { max: 50, step: 10 };
    const rawStep = maxValue / 6;
    const mag = Math.pow(10, Math.floor(Math.log10(rawStep)));
    const norm = rawStep / mag;
    let step = norm <= 1 ? mag : norm <= 2 ? 2 * mag : norm <= 5 ? 5 * mag : 10 * mag;
    let max = Math.ceil(maxValue / step) * step;
    if (max <= maxValue) max += step;
    return { max, step };
}
const formatNumber = v => { const s = String(v); return Math.abs(v) >= 1000 ? s.replace(/\B(?=(\d{3})+(?!\d))/g, '.') : s; };
const getTotalFrames = () => Math.floor(state.totalDuration * 60);

function updateScaleFactor() {
    const rect = elements.previewArea.getBoundingClientRect();
    state.scaleFactor = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
}

function applyScaling() {
    const s = state.scaleFactor, c = elements.chartContainer, compact = isCompact();
    const scale = v => `${Math.round(v * s)}px`;
    c.style.setProperty('--title-size', scale(compact ? 60 : 70));
    c.style.setProperty('--subtitle-size', scale(compact ? 40 : 50));
    c.style.setProperty('--source-size', scale(24));
    c.style.setProperty('--padding-v', scale(30));
    c.style.setProperty('--padding-h', scale(50));
    c.style.setProperty('--spacing-sm', scale(8));
    if (state.chart) {
        const tickSize = Math.round(30 * s), barRadius = Math.round(12 * s), tickPadding = Math.round(15 * s);
        state.chart.options.scales.x.ticks.font.size = tickSize;
        state.chart.options.scales.y.ticks.font.size = tickSize;
        state.chart.options.scales.x.ticks.padding = state.chart.options.scales.y.ticks.padding = tickPadding;
        state.chart.data.datasets[0].borderRadius = isCompact()
            ? { topLeft: barRadius, topRight: barRadius, bottomLeft: barRadius, bottomRight: barRadius }
            : { topLeft: barRadius, topRight: barRadius, bottomLeft: 0, bottomRight: 0 };
    }
}

function initChart() {
    Chart.register(lineClipPlugin);
    state.chart = new Chart(elements.chartCanvas.getContext('2d'), {
        type: 'bar',
        data: {
            labels: getXAxisLabels(),
            datasets: [{
                label: 'Data', data: getYAxisData(), backgroundColor: getBarColors(),
                borderColor: 'transparent', borderWidth: 0,
                borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false, barPercentage: 0.35, categoryPercentage: 0.9
            }]
        },
        options: {
            responsive: true, maintainAspectRatio: false, animation: { duration: 0 },
            layout: { padding: { left: 20, right: 40, top: 20, bottom: 10 } },
            plugins: {
                legend: { display: false },
                tooltip: { backgroundColor: '#15103A', titleColor: '#EFEDFD', bodyColor: '#C9C2F8', cornerRadius: 8, padding: 12 }
            },
            scales: {
                x: { grid: { display: false }, border: { display: false }, ticks: { color: '#000000', font: { size: 18, family: 'Roobert VRT', weight: '400' }, padding: 15, maxRotation: 0, minRotation: 0 } },
                y: (() => { const { max, step } = calcNiceYScale(Math.max(...getYAxisData(), 1)); return { beginAtZero: true, max, border: { display: false }, grid: { color: '#6E6E74', lineWidth: 1, drawTicks: false }, ticks: { color: '#6E6E74', font: { size: 18, family: 'Roobert VRT', weight: '400' }, padding: 15, stepSize: step, callback: v => formatNumber(v) + (elements?.suffixInput?.value ?? '%') } }; })()
            },
            onClick: handleChartClick
        }
    });
}

function updateChart(options = {}) {
    if (!state.chart || state.isUpdatingChart) return;
    state.isUpdatingChart = true;
    const { skipLogoUpdate = false, mode = 'default' } = options;
    const chart = state.chart, compact = isCompact();

    if (elements.chartType.value === 'line') {
        chart.config.type = 'line';
        chart.data.datasets[0].fill = false;
        chart.data.datasets[0].borderColor = '#5541F0';
        chart.data.datasets[0].borderWidth = Math.round(10 * state.scaleFactor);
        chart.data.datasets[0].tension = 0;
        chart.data.datasets[0].pointRadius = 0;
        chart.data.datasets[0].pointHoverRadius = 0;
        chart.data.datasets[0].borderCapStyle = 'round';
        chart.data.datasets[0].borderJoinStyle = 'round';
    } else {
        chart.config.type = 'bar';
        chart.options.indexAxis = 'x';
        chart.data.datasets[0].borderColor = 'transparent';
        chart.data.datasets[0].borderWidth = 0;
    }

    chart.data.labels = getXAxisLabels();
    chart.data.datasets[0].data = getYAxisData();
    chart.data.datasets[0].backgroundColor = getBarColors();

    const maxValue = Math.max(...getYAxisData(), 1);
    if (chart.options.scales?.y) {
        const { max: yMax, step: yStep } = calcNiceYScale(maxValue);
        chart.options.scales.y.max = yMax;
        chart.options.scales.y.ticks.stepSize = yStep;
        const s = state.scaleFactor;

        if (compact) {
            chart.options.scales.y.display = false;
            chart.options.scales.y.grid.display = false;
            const panelSlider = parseFloat(elements.panelWidth.value) / 100;
            const sidePadding = 30 + panelSlider * 50;
            chart.options.layout.padding = { left: Math.round(sidePadding * s), right: Math.round(sidePadding * s), top: Math.round(39 * s), bottom: Math.round(60 * s) };
        } else {
            chart.options.scales.y.display = true;
            chart.options.scales.y.grid.display = true;
            chart.options.layout.padding = { left: Math.round(20 * s), right: Math.round(40 * s), top: Math.round(20 * s), bottom: Math.round(10 * s) };
        }
    }

    chart.update(mode === 'none' ? 'none' : undefined);
    if (!skipLogoUpdate && elements.showLogos.checked) scheduleUpdate(updateLogoPositions);
    if (elements.showValues.checked) { updateValueLabels(); animateChart(); }
    updateBarTimingMarkers();
    state.isUpdatingChart = false;
}

function handleChartClick(event, clickedElements) {
    if (clickedElements.length > 0) {
        const idx = clickedElements[0].index;
        state.highlightedBars.has(idx) ? state.highlightedBars.delete(idx) : state.highlightedBars.add(idx);
        updateChart({ skipLogoUpdate: true });
    }
}

const getLogoPath = (partyName) => encodeURI(`assets/Logo's politieke partijen/${elements.partyRegion.value === 'vlaamse' ? 'Vlaamse partijen' : 'Waalse partijen'}/${elements.monoLogos.checked ? 'mono' : 'kleur'}/${partyName}.png`);

function needsLogoReload() {
    const curr = { region: elements.partyRegion.value, mono: elements.monoLogos.checked, labels: getXAxisLabels().join(',') };
    return curr.region !== state.logoSettings.region || curr.mono !== state.logoSettings.mono || curr.labels !== state.logoSettings.labels;
}

async function loadLogos() {
    const labels = getXAxisLabels();
    state.logoSettings = { region: elements.partyRegion.value, mono: elements.monoLogos.checked, labels: labels.join(',') };
    state.logoImages = {};
    await Promise.all(labels.map(label => new Promise(resolve => {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = () => {
            try {
                const c = document.createElement('canvas'); c.width = img.naturalWidth; c.height = img.naturalHeight;
                c.getContext('2d').drawImage(img, 0, 0);
                const safeImg = new Image();
                safeImg.onload = () => { state.logoImages[label] = safeImg; resolve(); };
                safeImg.src = c.toDataURL('image/png');
            } catch { state.logoImages[label] = img; resolve(); }
        };
        img.onerror = () => {
            const imgLocal = new Image();
            imgLocal.onload = () => { state.logoImages[label] = imgLocal; resolve(); };
            imgLocal.onerror = () => { state.logoImages[label] = null; resolve(); };
            imgLocal.src = getLogoPath(label);
        };
        img.src = getLogoPath(label);
    })));
}

function updateLogoPositions() {
    removeLogos();
    if (!state.chart || !elements.showLogos.checked) return;
    const { scaleFactor } = state, xScale = state.chart.scales.x, chartArea = state.chart.chartArea;
    const labels = getXAxisLabels(), logoSize = 70 * scaleFactor, canvasOffset = elements.chartCanvas.offsetLeft;
    // Position logos centered on where the x-axis tick labels are
    const tickY = chartArea.bottom + (25 * scaleFactor);
    const container = document.createElement('div');
    container.id = 'xAxisLogos';
    container.style.cssText = `position:absolute;left:0;right:0;top:${tickY}px;height:${logoSize}px;pointer-events:none;z-index:10`;
    labels.forEach((label, i) => {
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position:absolute;left:${xScale.getPixelForValue(i) + canvasOffset}px;top:0;transform:translate(-50%, 0);display:flex;justify-content:center;align-items:center;width:${logoSize}px;height:${logoSize}px`;
        if (state.logoImages[label]) {
            const img = document.createElement('img');
            img.src = state.logoImages[label].src;
            img.style.cssText = `max-height:${logoSize}px;max-width:${logoSize}px;object-fit:contain`;
            wrapper.appendChild(img);
        } else {
            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = `font-size:${18 * scaleFactor}px;color:#000;font-family:'Roobert VRT',sans-serif;text-align:center`;
            wrapper.appendChild(text);
        }
        container.appendChild(wrapper);
    });
    elements.chartWrapper.style.position = 'relative';
    elements.chartWrapper.style.overflow = 'visible';
    elements.chartWrapper.appendChild(container);
}

const removeLogos = () => document.getElementById('xAxisLogos')?.remove();
const removeValueLabels = () => document.getElementById('barValueLabels')?.remove();

function updateValueLabels() {
    removeValueLabels();
    if (!state.chart || !elements.showValues.checked) return;
    const { scaleFactor } = state, yScale = state.chart.scales.y, data = state.chart.data.datasets[0].data;
    const labels = getXAxisLabels(), originalData = getYAxisData(), canvasOffset = elements.chartCanvas.offsetLeft;
    const compact = isCompact(), meta = state.chart.getDatasetMeta(0);
    const panelWidth = parseFloat(elements.panelWidth.value);
    const compactValueSize = panelWidth < 50 ? 45 : 50;
    const container = document.createElement('div');
    container.id = 'barValueLabels';
    container.style.cssText = 'position:absolute;left:0;right:0;top:0;bottom:0;pointer-events:none;z-index:15';
    labels.forEach((_, i) => {
        const bar = meta.data[i], barX = bar ? bar.x + canvasOffset : canvasOffset, barY = bar ? bar.y : yScale.getPixelForValue(data[i] || 0);
        const lbl = document.createElement('div');
        lbl.className = 'bar-value-label';
        lbl.dataset.index = i;
        lbl.textContent = formatNumber(originalData[i]) + (elements?.suffixInput?.value ?? '%');
        lbl.style.cssText = compact
            ? `position:absolute;left:${barX}px;top:${barY + 50 * scaleFactor}px;transform:translate(-50%, 0);opacity:0;font-size:${compactValueSize * scaleFactor}px;font-weight:600;color:#FFFFFF;font-family:'Roobert VRT',sans-serif;text-align:center;white-space:nowrap`
            : `position:absolute;left:${barX}px;top:${barY - 10 * scaleFactor}px;transform:translate(-50%,-100%);opacity:0;font-size:${44 * scaleFactor}px;font-weight:600;color:#031037;font-family:'Roobert VRT',sans-serif;text-align:center;white-space:nowrap`;
        container.appendChild(lbl);
    });
    elements.chartWrapper.style.position = 'relative';
    elements.chartWrapper.appendChild(container);
}

function updateValueLabelPositions(animatedData) {
    let container = document.getElementById('barValueLabels');
    if (!container) { updateValueLabels(); container = document.getElementById('barValueLabels'); if (!container) return; }
    const { scaleFactor } = state, yScale = state.chart.scales.y, canvasOffset = elements.chartCanvas.offsetLeft;
    const compact = isCompact(), meta = state.chart.getDatasetMeta(0);
    container.querySelectorAll('.bar-value-label').forEach((lbl, i) => {
        const bar = meta.data[i], barY = bar ? bar.y : yScale.getPixelForValue(animatedData[i] || 0);
        lbl.style.left = `${bar ? bar.x + canvasOffset : canvasOffset}px`;
        lbl.style.top = compact ? `${barY + 50 * scaleFactor}px` : `${barY - 10 * scaleFactor}px`;
    });
}

function animateValueLabels(barProgresses, graphOutTime, currentTime) {
    const container = document.getElementById('barValueLabels');
    if (!container) return;
    const compact = isCompact(), labelDelay = 0.4;
    container.querySelectorAll('.bar-value-label').forEach((lbl, i) => {
        const barStart = state.barTimings[i] || 0, lblStart = barStart + labelDelay, lblEnd = lblStart + PANEL_ANIMATION_DURATION;
        let p = currentTime < lblStart ? 0 : currentTime < lblEnd ? cubicBezier((currentTime - lblStart) / PANEL_ANIMATION_DURATION, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y) : currentTime < graphOutTime ? 1 : 1 - ((currentTime - graphOutTime) / PANEL_ANIMATION_DURATION);
        p = Math.max(0, Math.min(1, p));
        const offset = (1 - p) * 30;
        lbl.style.transform = compact ? `translate(-50%, ${offset}px)` : `translate(-50%, calc(-100% + ${offset}px))`;
        lbl.style.opacity = p >= 0.5 ? 1 : 0;
    });
}

async function updateXAxisDisplay() {
    if (!state.chart) return;
    if (elements.showLogos.checked) {
        if (needsLogoReload()) await loadLogos();
        state.chart.options.scales.x.ticks.color = 'transparent';
        state.chart.update();
        scheduleUpdate(updateLogoPositions);
    } else {
        state.chart.options.scales.x.ticks.color = '#000000';
        state.chart.update();
        removeLogos();
    }
}

function updatePanelWidth() {
    const pos = elements.position.value, slider = parseFloat(elements.panelWidth.value) / 100;
    const c = elements.chartContainer;

    if (pos === 'left' || pos === 'right') {
        const edge = 5.48, top = 12.44, maxW = 37.04, minW = 25, h = 77.82;
        const w = minW + slider * (maxW - minW);
        if (pos === 'left') { c.style.left = `${edge}%`; c.style.right = `${100 - edge - w}%`; }
        else { c.style.right = `${edge}%`; c.style.left = `${100 - edge - w}%`; }
        c.style.width = ''; c.style.top = `${top}%`; c.style.bottom = ''; c.style.height = `${h}%`;
    } else {
        const margin = 5.417, top = 8.38, maxW = 89.17, minW = 30, h = 83.24;
        const w = minW + slider * (maxW - minW), inset = (100 - w) / 2;
        c.style.left = `${inset}%`; c.style.right = `${inset}%`; c.style.width = '';
        c.style.top = `${top}%`; c.style.bottom = ''; c.style.height = `${h}%`;
    }
    updateBarWidth();
    updateChart({ skipLogoUpdate: true, mode: 'none' });
    if (elements.showLogos.checked) scheduleUpdate(() => { state.chart?.update(); updateLogoPositions(); });
}

function updateBarWidth() {
    if (!state.chart) return;
    const barW = elements.barWidth.value / 100;
    if (isCompact()) {
        state.chart.data.datasets[0].barPercentage = 0.55 + barW * 0.3;
        state.chart.data.datasets[0].categoryPercentage = 0.92;
    } else {
        state.chart.data.datasets[0].barPercentage = Math.min(1, Math.max(0.1, barW * (88 / elements.panelWidth.value)));
        state.chart.data.datasets[0].categoryPercentage = 0.9;
    }
    state.chart.update('none');
}

function updateTitles() {
    elements.chartTitle.textContent = elements.titleInput.value || 'Titel';
    const sub = elements.subtitleInput.value.trim();
    const src = elements.sourceInput.value;
    const compact = isCompact();
    elements.chartSubtitle.textContent = sub;
    elements.chartSource.textContent = src ? 'bron: ' + src : '';
    elements.chartSubtitle.style.display = sub ? 'block' : 'none';
    elements.chartSource.style.display = src ? 'block' : 'none';
    if (compact && sub) {
        const subtitleHeight = elements.chartSubtitle.offsetHeight;
        elements.chartSubtitle.style.marginBottom = `-${subtitleHeight}px`;
    } else {
        elements.chartSubtitle.style.marginBottom = '';
    }
}

async function handleTextLogoToggle(e) {
    const cb = e.target, isText = cb.id === 'showText', isLogos = cb.id === 'showLogos';
    if (isText && cb.checked) {
        elements.showLogos.checked = false; elements.logoOptions.style.display = 'none'; removeLogos();
        if (state.chart) { state.chart.options.scales.x.ticks.color = '#000000'; state.chart.update(); }
    } else if (isLogos && cb.checked) {
        elements.showText.checked = false; elements.logoOptions.style.display = 'block';
        await loadLogos();
        if (state.chart) { state.chart.options.scales.x.ticks.color = 'transparent'; state.chart.update(); setTimeout(updateLogoPositions, 100); }
    } else if (isLogos && !cb.checked) {
        elements.showText.checked = true; elements.logoOptions.style.display = 'none'; removeLogos();
        if (state.chart) { state.chart.options.scales.x.ticks.color = '#000000'; state.chart.update(); }
    }
}

function initColorSelectors() {
    const selectors = document.querySelectorAll('.color-selector');
    selectors.forEach(sel => {
        const ind = sel.querySelector('.color-indicator'), opts = sel.querySelectorAll('.color-option');
        ind.addEventListener('click', e => { e.stopPropagation(); selectors.forEach(s => s !== sel && s.classList.remove('open')); sel.classList.toggle('open'); });
        opts.forEach(opt => {
            opt.addEventListener('click', e => { e.stopPropagation(); sel.dataset.color = opt.dataset.color; ind.style.backgroundColor = opt.dataset.color; opts.forEach(o => o.classList.remove('selected')); opt.classList.add('selected'); sel.classList.remove('open'); updateChart({ skipLogoUpdate: true }); });
            if (opt.dataset.color === sel.dataset.color) opt.classList.add('selected');
        });
    });
    document.addEventListener('click', () => selectors.forEach(s => s.classList.remove('open')));
}

function handleFileUpload(file) {
    if (!file || file.size > MAX_FILE_SIZE) { if (file) alert(`Bestand is te groot. Maximum grootte is 100MB.`); return; }
    const isVideo = file.type.startsWith('video/') || ['.mp4', '.mov', '.avi', '.mxf'].some(ext => file.name.toLowerCase().endsWith(ext));
    state.uploadedFile = isVideo ? file : null;
    elements.previewBackground.style.backgroundImage = ''; elements.previewBackground.innerHTML = '';
    if (isVideo) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file); video.autoplay = video.loop = false; video.muted = video.playsInline = true;
        video.addEventListener('loadedmetadata', () => { if (video.duration && isFinite(video.duration)) { state.totalDuration = video.duration; state.currentFrame = 0; updateTotalTimeDisplay(); updateTimelineDisplay(); initializeBarTimings(); animateChart(); } });
        elements.previewBackground.appendChild(video);
    } else {
        state.totalDuration = 20; state.currentFrame = 0; updateTotalTimeDisplay(); updateTimelineDisplay(); initializeBarTimings();
        const reader = new FileReader(); reader.onload = e => { elements.previewBackground.style.backgroundImage = `url(${e.target.result})`; }; reader.readAsDataURL(file);
    }
    elements.uploadFileName.textContent = file.name; elements.uploadFileDisplay.style.display = 'flex'; elements.uploadArea.style.display = 'none';
}

function clearUploadedFile() {
    elements.previewBackground.style.backgroundImage = ''; elements.previewBackground.innerHTML = ''; elements.fileInput.value = '';
    elements.uploadFileDisplay.style.display = 'none'; elements.uploadArea.style.display = 'flex';
    state.uploadedFile = null; state.totalDuration = 20; state.currentFrame = 0;
    updateTotalTimeDisplay(); updateTimelineDisplay(); initializeBarTimings();
}

const updateTotalTimeDisplay = () => { const m = Math.floor(state.totalDuration / 60), s = Math.floor(state.totalDuration % 60); elements.totalTime.textContent = `${m}:${s.toString().padStart(2, '0')}`; };

function handleDataFileImport(file) {
    if (!file) return;
    const name = file.name, nameLower = name.toLowerCase(), reader = new FileReader();
    const showFile = () => { elements.importFileName.textContent = name; elements.importFileDisplay.style.display = 'flex'; elements.importArea.style.display = 'none'; };
    if (nameLower.endsWith('.json')) { reader.onload = e => { try { applyImportedData(JSON.parse(e.target.result)); showFile(); } catch (err) { alert('Ongeldig JSON bestand: ' + err.message); } }; reader.readAsText(file); }
    else if (nameLower.endsWith('.csv')) { reader.onload = e => { try { applyImportedData(parseCSV(e.target.result)); showFile(); } catch (err) { alert('Ongeldig CSV bestand: ' + err.message); } }; reader.readAsText(file); }
    else if (nameLower.endsWith('.xls') || nameLower.endsWith('.xlsx')) {
        reader.onload = e => { try { if (typeof XLSX === 'undefined') { alert('Excel library niet geladen'); return; } const wb = XLSX.read(new Uint8Array(e.target.result), { type: 'array' }); applyImportedData(parseExcelData(XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1 }))); showFile(); } catch (err) { alert('Ongeldig Excel bestand: ' + err.message); } };
        reader.readAsArrayBuffer(file);
    }
}

const clearImportedFile = () => { elements.dataFileInput.value = ''; elements.importFileDisplay.style.display = 'none'; elements.importArea.style.display = 'flex'; };

function parseCSV(text) {
    const lines = text.trim().split('\n');
    if (lines.length < 2) throw new Error('CSV moet minstens 2 rijen hebben');
    const delim = text.includes(';') ? ';' : ',';
    return { labels: lines[0].split(delim).map(s => s.trim().replace(/^["']|["']$/g, '')), values: lines[1].split(delim).map(s => parseFloat(s.trim()) || 0) };
}

function parseExcelData(data) {
    if (data.length < 2) throw new Error('Excel moet minstens 2 rijen hebben');
    return { labels: data[0].map(c => String(c || '').trim()), values: data[1].map(c => parseFloat(c) || 0) };
}

function applyImportedData(data) {
    let labels = [], values = [];
    if (Array.isArray(data) && data.length > 0 && typeof data[0] === 'object') {
        const lk = Object.keys(data[0]).find(k => ['label', 'name', 'x', 'category', 'jaar', 'year'].includes(k.toLowerCase())) || Object.keys(data[0])[0];
        const vk = Object.keys(data[0]).find(k => ['value', 'y', 'data', 'waarde', 'aantal', 'count'].includes(k.toLowerCase())) || Object.keys(data[0])[1];
        labels = data.map(d => String(d[lk] || '')); values = data.map(d => parseFloat(d[vk]) || 0);
    } else if (data.labels && data.values) { labels = data.labels; values = data.values; }
    else if (data.x && data.y) { labels = data.x; values = data.y; }
    if (labels.length && values.length) { elements.xAxisInput.value = labels.join(','); elements.yAxisInput.value = values.join(','); updateChart(); }
    else alert('Kon geen geldige data vinden');
}

function initEasingCanvas() {
    const canvas = elements.easingCanvas, ctx = canvas.getContext('2d');
    canvas.width = canvas.offsetWidth * 2; canvas.height = canvas.offsetHeight * 2; ctx.scale(2, 2);
    canvas.addEventListener('mousedown', handleEasingMouseDown);
    canvas.addEventListener('mousemove', handleEasingCanvasHover);
    document.addEventListener('mousemove', handleEasingMouseMove);
    document.addEventListener('mouseup', handleEasingMouseUp);
    canvas.addEventListener('touchstart', e => { e.preventDefault(); handleEasingMouseDown({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }, { passive: false });
    document.addEventListener('touchmove', e => { e.preventDefault(); handleEasingMouseMove({ clientX: e.touches[0].clientX, clientY: e.touches[0].clientY }); }, { passive: false });
    document.addEventListener('touchend', handleEasingMouseUp);
    elements.easingValues.addEventListener('input', e => { const p = parseEasingInput(e.target.value); if (p) { state.easingPoints = p; drawEasingCurve(); } });
    elements.easingValues.addEventListener('blur', () => { const p = parseEasingInput(elements.easingValues.value); if (p) state.easingPoints = p; drawEasingCurve(); });
    drawEasingCurve();
}

function getEasingCanvasCoords(e) {
    const rect = elements.easingCanvas.getBoundingClientRect();
    return { x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)), y: Math.max(0, Math.min(1, 1 - (e.clientY - rect.top) / rect.height)) };
}

function handleEasingMouseDown(e) {
    const c = getEasingCanvasCoords(e), { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;
    const d1 = Math.hypot(c.x - cp1x, c.y - cp1y), d2 = Math.hypot(c.x - cp2x, c.y - cp2y);
    if (d1 < 0.15 && d1 <= d2) { easingDragging = 'cp1'; elements.easingCanvas.style.cursor = 'grabbing'; }
    else if (d2 < 0.15) { easingDragging = 'cp2'; elements.easingCanvas.style.cursor = 'grabbing'; }
}

function handleEasingMouseMove(e) {
    if (!easingDragging) return;
    const c = getEasingCanvasCoords(e);
    if (easingDragging === 'cp1') { state.easingPoints.cp1x = Math.max(0, Math.min(1, c.x)); state.easingPoints.cp1y = c.y; }
    else { state.easingPoints.cp2x = Math.max(0, Math.min(1, c.x)); state.easingPoints.cp2y = c.y; }
    drawEasingCurve();
}

function handleEasingCanvasHover(e) {
    if (easingDragging) return;
    const c = getEasingCanvasCoords(e), { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;
    elements.easingCanvas.style.cursor = Math.hypot(c.x - cp1x, c.y - cp1y) < 0.15 || Math.hypot(c.x - cp2x, c.y - cp2y) < 0.15 ? 'grab' : 'default';
}

const handleEasingMouseUp = () => { easingDragging = null; elements.easingCanvas.style.cursor = 'default'; };

function drawEasingCurve() {
    const canvas = elements.easingCanvas, ctx = canvas.getContext('2d'), w = canvas.offsetWidth, h = canvas.offsetHeight;
    const { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;
    ctx.clearRect(0, 0, w, h);
    ctx.strokeStyle = '#C9C2F844'; ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) { ctx.beginPath(); ctx.moveTo(i * w / 4, 0); ctx.lineTo(i * w / 4, h); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0, i * h / 4); ctx.lineTo(w, i * h / 4); ctx.stroke(); }
    ctx.strokeStyle = '#C9C2F866'; ctx.setLineDash([4, 4]); ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(w, 0); ctx.stroke(); ctx.setLineDash([]);
    ctx.strokeStyle = '#C9C2F8'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.lineTo(cp1x * w, h - cp1y * h); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(w, 0); ctx.lineTo(cp2x * w, h - cp2y * h); ctx.stroke();
    ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2.5;
    ctx.beginPath(); ctx.moveTo(0, h); ctx.bezierCurveTo(cp1x * w, h - cp1y * h, cp2x * w, h - cp2y * h, w, 0); ctx.stroke();
    ctx.fillStyle = '#C9C2F8'; ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.arc(cp1x * w, h - cp1y * h, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    ctx.beginPath(); ctx.arc(cp2x * w, h - cp2y * h, 8, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
    if (document.activeElement !== elements.easingValues) elements.easingValues.value = `${cp1x.toFixed(2)}, ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)}, ${cp2y.toFixed(2)}`;
}

function parseEasingInput(v) {
    const parts = v.replace(/\s/g, '').split(',');
    if (parts.length !== 4) return null;
    const nums = parts.map(p => parseFloat(p));
    if (nums.some(isNaN)) return null;
    return { cp1x: Math.max(0, Math.min(1, nums[0])), cp1y: nums[1], cp2x: Math.max(0, Math.min(1, nums[2])), cp2y: nums[3] };
}

function togglePlayback() {
    state.isPlaying = !state.isPlaying;
    const bgVideo = elements.previewBackground.querySelector('video');
    if (state.isPlaying) {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        if (bgVideo) { bgVideo.currentTime = (state.currentFrame / getTotalFrames()) * state.totalDuration; bgVideo.play(); }
        animate();
    } else {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        cancelAnimationFrame(state.animationId);
        if (bgVideo) bgVideo.pause();
    }
}

function animate() {
    if (!state.isPlaying) return;
    const total = getTotalFrames(), bgVideo = elements.previewBackground.querySelector('video');
    if (bgVideo && !bgVideo.paused) {
        state.currentFrame = Math.floor((bgVideo.currentTime / state.totalDuration) * total);
        if (bgVideo.ended || bgVideo.currentTime >= state.totalDuration) { state.currentFrame = 0; bgVideo.currentTime = 0; bgVideo.play(); }
    } else { state.currentFrame = (state.currentFrame + 1) % total; }
    updateTimelineDisplay(); animateChart();
    state.animationId = requestAnimationFrame(animate);
}

function updateTimelineDisplay() {
    const total = getTotalFrames(), pct = (state.currentFrame / total) * 100;
    elements.timelineProgress.style.width = `${pct}%`; elements.timelineThumb.style.left = `${pct}%`;
    const sec = (state.currentFrame / total) * state.totalDuration;
    elements.currentTime.textContent = `${Math.floor(sec / 60)}:${Math.floor(sec % 60).toString().padStart(2, '0')}`;
}

function initializeBarTimings() {
    const labels = getXAxisLabels(), graphIn = parseFloat(elements.graphIn.value) || 1;
    state.lastGraphInTime = graphIn;
    state.barTimings = labels.map((_, i) => graphIn + 0.5 + i * DEFAULT_STAGGER);
    updateBarTimingMarkers();
}

function updateBarTimingMarkers() {
    if (!elements.barTimingMarkers) return;
    const labels = getXAxisLabels(), colors = getBarColors();
    while (state.barTimings.length < labels.length) state.barTimings.push(state.barTimings.length > 0 ? state.barTimings[state.barTimings.length - 1] + DEFAULT_STAGGER : (parseInt(elements.graphIn.value) || 1) + 0.5);
    state.barTimings = state.barTimings.slice(0, labels.length);
    elements.barTimingMarkers.innerHTML = '';
    labels.forEach((label, i) => {
        const marker = document.createElement('div');
        marker.className = 'bar-timing-marker'; marker.dataset.index = i;
        marker.style.left = `${Math.max(0, Math.min(100, (state.barTimings[i] / state.totalDuration) * 100))}%`;
        marker.style.backgroundColor = colors[i] || '#00BEAA';
        const tip = document.createElement('div'); tip.className = 'bar-timing-marker-tooltip'; tip.textContent = `${label}: ${state.barTimings[i].toFixed(2)}s`;
        marker.appendChild(tip); setupMarkerDrag(marker, i);
        elements.barTimingMarkers.appendChild(marker);
    });
}

function handleGraphInChange() {
    const newTime = parseFloat(elements.graphIn.value) || 1, delta = newTime - state.lastGraphInTime;
    if (delta !== 0 && state.barTimings.length > 0) { state.barTimings = state.barTimings.map(t => t + delta); updateBarTimingMarkers(); }
    state.lastGraphInTime = newTime;
}

function setupMarkerDrag(marker, index) {
    let dragging = false, startX = 0, startLeft = 0;
    const onMove = (x) => {
        if (!dragging) return;
        const delta = (x - startX) / elements.timelineTrack.getBoundingClientRect().width * 100;
        const newLeft = Math.max(0, Math.min(100, startLeft + delta));
        marker.style.left = `${newLeft}%`;
        state.barTimings[index] = (newLeft / 100) * state.totalDuration;
        const tip = marker.querySelector('.bar-timing-marker-tooltip'), labels = getXAxisLabels();
        if (tip && labels[index]) tip.textContent = `${labels[index]}: ${state.barTimings[index].toFixed(2)}s`;
    };
    marker.addEventListener('mousedown', e => { e.preventDefault(); e.stopPropagation(); dragging = true; startX = e.clientX; startLeft = parseFloat(marker.style.left) || 0; marker.style.cursor = 'grabbing'; document.addEventListener('mousemove', m => onMove(m.clientX)); document.addEventListener('mouseup', () => { dragging = false; marker.style.cursor = 'grab'; }, { once: true }); });
    marker.addEventListener('touchstart', e => { e.preventDefault(); dragging = true; startX = e.touches[0].clientX; startLeft = parseFloat(marker.style.left) || 0; document.addEventListener('touchmove', m => onMove(m.touches[0].clientX)); document.addEventListener('touchend', () => { dragging = false; }, { once: true }); });
}

function animateChart() {
    if (!state.chart) return;
    const total = getTotalFrames(), graphIn = parseInt(elements.graphIn.value) || 1, graphOut = parseInt(elements.graphOut.value) || 10;
    const time = (state.currentFrame / total) * state.totalDuration;

    let clipPath;
    if (time < graphIn) {
        clipPath = 'inset(100% 0% 0% 0% round 12px)';
    } else if (time < graphIn + PANEL_ANIMATION_DURATION) {
        const p = cubicBezier((time - graphIn) / PANEL_ANIMATION_DURATION, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
        clipPath = `inset(${(1 - p) * 100}% 0% 0% 0% round 12px)`;
    } else if (time < graphOut) {
        clipPath = 'inset(0% 0% 0% 0% round 12px)';
    } else if (time < graphOut + PANEL_ANIMATION_DURATION) {
        const p = cubicBezier((time - graphOut) / PANEL_ANIMATION_DURATION, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
        clipPath = `inset(0% 0% ${p * 100}% 0% round 12px)`;
    } else {
        clipPath = 'inset(0% 0% 100% 0% round 12px)';
    }
    elements.chartContainer.style.clipPath = clipPath;

    const calcProgress = (start) => { let p = time < start ? 0 : time < start + PANEL_ANIMATION_DURATION ? cubicBezier((time - start) / PANEL_ANIMATION_DURATION, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y) : 1; return Math.max(0, Math.min(1, p)); };
    elements.chartTitle.style.transform = `translateY(${(1 - calcProgress(graphIn + 0.2)) * 50}px)`;
    elements.chartSubtitle.style.transform = `translateY(${(1 - calcProgress(graphIn + 0.4)) * 50}px)`;

    const origData = getYAxisData();
    const isLine = elements.chartType.value === 'line';

    if (isLine) {
        // Line chart: trim path animation from left to right
        const lineStart = graphIn + 0.5;
        const lineDuration = origData.length * 0.15 + 0.5;
        let lineProgress = 0;
        if (time < lineStart) {
            lineProgress = 0;
        } else if (time < lineStart + lineDuration) {
            const t = (time - lineStart) / lineDuration;
            lineProgress = cubicBezier(t, state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);
        } else if (time < graphOut) {
            lineProgress = 1;
        } else if (time < graphOut + PANEL_ANIMATION_DURATION) {
            const t = (time - graphOut) / PANEL_ANIMATION_DURATION;
            lineProgress = 1 - cubicBezier(t, state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);
        } else {
            lineProgress = 0;
        }
        state.lineClipProgress = Math.max(0, Math.min(1, lineProgress));

        // Show full data for line chart, plugin handles clipping
        state.chart.data.datasets[0].data = origData;
        state.chart.update('none');

        // Handle value labels for line chart
        if (elements.showValues.checked) {
            updateValueLabelPositions(origData);
            // Animate value labels based on line progress
            const container = document.getElementById('barValueLabels');
            if (container) {
                container.querySelectorAll('.bar-value-label').forEach((lbl, i) => {
                    const pointProgress = (i + 1) / origData.length;
                    const lblVisible = lineProgress >= pointProgress;
                    const lblStart = lineStart + (lineDuration * (i / origData.length));
                    const lblEnd = lblStart + PANEL_ANIMATION_DURATION;
                    let p = time < lblStart ? 0 : time < lblEnd ? cubicBezier((time - lblStart) / PANEL_ANIMATION_DURATION, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y) : time < graphOut ? 1 : 1 - ((time - graphOut) / PANEL_ANIMATION_DURATION);
                    p = Math.max(0, Math.min(1, p));
                    const offset = (1 - p) * 30;
                    lbl.style.transform = `translate(-50%, calc(-100% + ${offset}px))`;
                    lbl.style.opacity = p >= 0.5 ? 1 : 0;
                });
            }
        }
    } else {
        // Bar chart: staggered bar animation
        state.lineClipProgress = 1; // No line clipping for bar charts
        if (!state.barTimings.length || state.barTimings.length !== origData.length) initializeBarTimings();
        const barProgs = [], animData = origData.map((val, i) => {
            const start = state.barTimings[i] || (graphIn + 0.5 + i * DEFAULT_STAGGER);
            let p = time < start ? 0 : time < start + BAR_ANIMATION_DURATION ? (time - start) / BAR_ANIMATION_DURATION : time < graphOut ? 1 : 1 - ((time - graphOut) / PANEL_ANIMATION_DURATION);
            p = cubicBezier(Math.max(0, Math.min(1, p)), state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);
            barProgs.push(p);
            return val * p;
        });
        state.chart.data.datasets[0].data = animData; state.chart.update('none');
        if (elements.showValues.checked) { updateValueLabelPositions(animData); animateValueLabels(barProgs, graphOut, time); }
    }
}

function cubicBezier(t, x1, y1, x2, y2) {
    const cx = 3 * x1, bx = 3 * (x2 - x1) - cx, ax = 1 - cx - bx;
    const cy = 3 * y1, by = 3 * (y2 - y1) - cy, ay = 1 - cy - by;
    return ((ay * t + by) * t + cy) * t;
}

function showExportProgress(msg, pct = null) {
    let el = document.getElementById('exportProgress');
    if (!el) { el = document.createElement('div'); el.id = 'exportProgress'; el.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(3,16,55,0.95);color:white;padding:30px 50px;border-radius:12px;z-index:10000;text-align:center;font-family:"Roobert VRT",sans-serif;min-width:300px'; document.body.appendChild(el); }
    el.innerHTML = `<div style="margin-bottom:15px;font-size:16px">${msg}</div>` + (pct !== null ? `<div style="background:rgba(255,255,255,0.2);border-radius:10px;height:20px;overflow:hidden"><div style="background:#5541F0;height:100%;width:${pct}%;transition:width 0.3s"></div></div><div style="margin-top:10px;font-size:14px">${Math.round(pct)}%</div>` : '');
}

const hideExportProgress = () => document.getElementById('exportProgress')?.remove();

function lockUIForExport() {
    // Disable chart interactions
    if (state.chart) {
        state.chart.options.events = [];
        state.chart.options.hover = { mode: null };
        state.chart.update('none');
    }
    // Disable all inputs
    document.querySelectorAll('input, select, button, textarea').forEach(el => {
        el.dataset.wasDisabled = el.disabled;
        el.disabled = true;
    });
    // Add overlay to prevent any clicks on preview
    const overlay = document.createElement('div');
    overlay.id = 'exportLockOverlay';
    overlay.style.cssText = 'position:fixed;top:0;left:0;right:0;bottom:0;z-index:9999;cursor:not-allowed;';
    document.body.appendChild(overlay);
}

function unlockUIAfterExport() {
    // Restore chart interactions
    if (state.chart) {
        state.chart.options.events = ['mousemove', 'mouseout', 'click', 'touchstart', 'touchmove'];
        state.chart.options.hover = { mode: 'nearest', intersect: true };
        state.chart.update('none');
    }
    // Re-enable inputs
    document.querySelectorAll('input, select, button, textarea').forEach(el => {
        el.disabled = el.dataset.wasDisabled === 'true';
        delete el.dataset.wasDisabled;
    });
    // Remove overlay
    document.getElementById('exportLockOverlay')?.remove();
}

async function captureFrame(withAlpha = false) {
    try {
        const outW = 1920, outH = 1080, previewRect = elements.previewArea.getBoundingClientRect();
        const scaleX = outW / previewRect.width, scaleY = outH / previewRect.height;
        const canvas = document.createElement('canvas'); canvas.width = outW; canvas.height = outH;
        const ctx = canvas.getContext('2d');
        const bgCanvas = !withAlpha ? await captureBackground() : null;
        if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);
        const containerRect = elements.chartContainer.getBoundingClientRect();
        const pX = (containerRect.left - previewRect.left) * scaleX, pY = (containerRect.top - previewRect.top) * scaleY;
        const pW = containerRect.width * scaleX, pH = containerRect.height * scaleY;
        const clipPath = elements.chartContainer.style.clipPath || '';
        const clipValues = clipPath.match(/inset\(([0-9.]+)%\s+[0-9.]+%\s+([0-9.]+)%/);
        const clipTop = clipValues ? parseFloat(clipValues[1]) : 0;
        const clipBottom = clipValues ? parseFloat(clipValues[2]) : 0;
        if (clipTop >= 100 || clipBottom >= 100) return canvas;
        const clipTopPx = (clipTop / 100) * pH, clipBottomPx = (clipBottom / 100) * pH;
        const clippedY = pY + clipTopPx, clippedH = pH - clipTopPx - clipBottomPx, radius = 12 * scaleX;
        if (clippedH < 1) return canvas;
        if (bgCanvas) { ctx.save(); ctx.beginPath(); ctx.roundRect(pX, clippedY, pW, clippedH, radius); ctx.clip(); ctx.filter = 'blur(20px)'; ctx.drawImage(bgCanvas, 0, 0); ctx.filter = 'none'; ctx.restore(); }

        // Temporarily increase chart resolution for sharp export
        const originalRatio = state.chart?.options?.devicePixelRatio;
        if (state.chart) {
            state.chart.options.devicePixelRatio = 4;
            state.chart.resize();
        }

        const containerCanvas = await html2canvas(elements.chartContainer, { backgroundColor: null, scale: 4, useCORS: true, allowTaint: false, logging: false, onclone: (doc, el) => { el.style.clipPath = elements.chartContainer.style.clipPath; const t = doc.getElementById('chartTitle'), s = doc.getElementById('chartSubtitle'); if (t) t.style.transform = elements.chartTitle.style.transform; if (s) s.style.transform = elements.chartSubtitle.style.transform; } });

        // Restore original chart resolution
        if (state.chart) {
            state.chart.options.devicePixelRatio = originalRatio || window.devicePixelRatio || 1;
            state.chart.resize();
        }

        ctx.save(); ctx.beginPath(); ctx.roundRect(pX, clippedY, pW, clippedH, radius); ctx.clip(); ctx.drawImage(containerCanvas, pX, pY, pW, pH); ctx.restore();
        return canvas;
    } catch (e) {
        console.error('Frame capture failed:', e);
        const fb = document.createElement('canvas'); fb.width = 1920; fb.height = 1080;
        const ctx = fb.getContext('2d'); ctx.fillStyle = '#000'; ctx.fillRect(0, 0, 1920, 1080); ctx.drawImage(elements.chartCanvas, 0, 0, 1920, 1080);
        return fb;
    }
}

async function exportVideo(format) {
    if (isExporting) { alert('Export is al bezig.'); return; }
    if (typeof VideoEncoder === 'undefined') { alert('Je browser ondersteunt geen video encoding. Gebruik Chrome of Edge.'); return; }
    if (format === 'mov-alpha') { alert('MOV + alpha export is niet beschikbaar in de browser.'); return; }
    isExporting = true; showExportProgress('Video voorbereiden...', 0);
    lockUIForExport();
    try {
        const fps = 25, vW = 1920, vH = 1080;
        const startT = parseFloat(elements.exportStart.value) || 0, endT = parseFloat(elements.exportEnd.value) || state.totalDuration;
        const dur = Math.max(0, endT - startT), totalFrames = Math.floor(fps * dur);
        if (totalFrames <= 0) { alert('Ongeldige export range.'); isExporting = false; hideExportProgress(); unlockUIAfterExport(); return; }
        const savedFrame = state.currentFrame, wasPlaying = state.isPlaying;
        if (wasPlaying) togglePlayback();
        const includeAudio = format === 'mp4-audio', bgVideo = elements.previewBackground.querySelector('video');
        let audioCtx = null, audioBuf = null;
        if (includeAudio && state.uploadedFile) { showExportProgress('Audio extraheren...', 0); try { audioCtx = new (window.AudioContext || window.webkitAudioContext)(); audioBuf = await audioCtx.decodeAudioData(await state.uploadedFile.arrayBuffer()); } catch { audioBuf = null; } }
        const { Muxer, ArrayBufferTarget } = Mp4Muxer, target = new ArrayBufferTarget();
        const muxCfg = { target, video: { codec: 'avc', width: vW, height: vH }, fastStart: 'in-memory', firstTimestampBehavior: 'offset' };
        if (audioBuf) muxCfg.audio = { codec: 'aac', numberOfChannels: audioBuf.numberOfChannels, sampleRate: audioBuf.sampleRate };
        const muxer = new Muxer(muxCfg);
        let encFrames = 0;
        const vidEnc = new VideoEncoder({ output: (c, m) => { muxer.addVideoChunk(c, m); encFrames++; }, error: e => { throw e; } });
        vidEnc.configure({ codec: 'avc1.640033', width: vW, height: vH, bitrate: 15_000_000, framerate: fps });
        let audEnc = null, audChunks = 0, audCodec = null;
        if (audioBuf && typeof AudioEncoder !== 'undefined') {
            for (const codec of ['mp4a.40.2', 'aac']) {
                try { const sup = await AudioEncoder.isConfigSupported({ codec, numberOfChannels: audioBuf.numberOfChannels, sampleRate: audioBuf.sampleRate, bitrate: 128000 }); if (sup.supported) { audEnc = new AudioEncoder({ output: (c, m) => { muxer.addAudioChunk(c, m); audChunks++; }, error: () => {} }); audEnc.configure(sup.config); audCodec = codec; break; } } catch {}
            }
        }
        showExportProgress('Frames opnemen...', 0);
        const tmpCanvas = document.createElement('canvas'); tmpCanvas.width = vW; tmpCanvas.height = vH; const tmpCtx = tmpCanvas.getContext('2d');
        if (bgVideo) bgVideo.pause();
        for (let i = 0; i < totalFrames; i++) {
            const curT = startT + (i / fps);
            state.currentFrame = Math.floor((curT / state.totalDuration) * getTotalFrames());
            if (bgVideo) { bgVideo.currentTime = curT; await new Promise(r => { let done = false; const finish = () => { if (!done) { done = true; r(); } }; bgVideo.addEventListener('seeked', () => { if (bgVideo.readyState >= 2) finish(); }, { once: true }); bgVideo.addEventListener('canplay', finish, { once: true }); if (bgVideo.readyState >= 3) finish(); setTimeout(finish, 150); }); }
            updateTimelineDisplay(); animateChart();
            if (state.chart) state.chart.render();
            void elements.chartContainer.offsetHeight;
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            tmpCtx.drawImage(await captureFrame(false), 0, 0, vW, vH);
            const frame = new VideoFrame(tmpCanvas, { timestamp: (i * 1_000_000) / fps });
            vidEnc.encode(frame, { keyFrame: i % 60 === 0 }); frame.close();
            showExportProgress(`Frames verwerken... (${i + 1}/${totalFrames})`, (i / totalFrames) * 90);
        }
        await vidEnc.flush(); vidEnc.close();
        if (audEnc && audioBuf && audEnc.state === 'configured') {
            showExportProgress('Audio encoderen...', 92);
            try {
                const sr = audioBuf.sampleRate, nc = audioBuf.numberOfChannels;
                const startS = Math.floor(startT * sr), endS = Math.min(Math.floor(endT * sr), audioBuf.length), totalS = endS - startS;
                if (totalS > 0) {
                    const cs = 4096, numC = Math.ceil(totalS / cs);
                    for (let ci = 0; ci < numC; ci++) {
                        if (audEnc.state !== 'configured') break;
                        const cStart = startS + ci * cs, cEnd = Math.min(cStart + cs, endS), cSize = cEnd - cStart;
                        const data = new Float32Array(cSize * nc);
                        for (let ch = 0; ch < nc; ch++) { const chData = audioBuf.getChannelData(ch); for (let j = 0; j < cSize; j++) data[ch * cSize + j] = chData[cStart + j]; }
                        const ad = new AudioData({ format: 'f32-planar', sampleRate: sr, numberOfFrames: cSize, numberOfChannels: nc, timestamp: (ci * cs * 1_000_000) / sr, data });
                        audEnc.encode(ad); ad.close();
                        if (ci % 100 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                    if (audEnc.state === 'configured') await audEnc.flush();
                }
                if (audEnc.state !== 'closed') audEnc.close();
            } catch {}
        }
        showExportProgress('Video finaliseren...', 95);
        if (audioCtx) audioCtx.close();
        muxer.finalize();
        const blob = new Blob([target.buffer], { type: 'video/mp4' }), url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'vrt-graphic.mp4'; link.click(); URL.revokeObjectURL(url);
        state.currentFrame = savedFrame; updateTimelineDisplay(); animateChart();
        if (bgVideo) bgVideo.currentTime = (savedFrame / getTotalFrames()) * state.totalDuration;
        hideExportProgress();
        unlockUIAfterExport();
        if (wasPlaying) togglePlayback();
    } catch (e) { alert(`Export mislukt: ${e.message}`); hideExportProgress(); unlockUIAfterExport(); }
    isExporting = false;
}

async function exportVideoWithMediaRecorder(format) {
    if (isExporting) { alert('Export is al bezig.'); return; }
    isExporting = true; showExportProgress('Video met audio voorbereiden...', 0);
    try {
        const fps = 25, startT = parseFloat(elements.exportStart.value) || 0, endT = parseFloat(elements.exportEnd.value) || state.totalDuration, dur = Math.max(0, endT - startT);
        if (dur <= 0) { alert('Ongeldige export range.'); isExporting = false; hideExportProgress(); return; }
        const savedFrame = state.currentFrame, wasPlaying = state.isPlaying;
        if (wasPlaying) togglePlayback();
        const recCanvas = document.createElement('canvas'); recCanvas.width = 1920; recCanvas.height = 1080; const recCtx = recCanvas.getContext('2d');
        const canvasStream = recCanvas.captureStream(fps), bgVideo = elements.previewBackground.querySelector('video');
        let combined = canvasStream;
        if (bgVideo && state.uploadedFile) {
            const audVid = document.createElement('video'); audVid.src = URL.createObjectURL(state.uploadedFile); audVid.muted = false; audVid.volume = 1;
            await new Promise((res, rej) => { audVid.onloadedmetadata = res; audVid.onerror = rej; setTimeout(rej, 5000); });
            if (audVid.captureStream) { const tracks = audVid.captureStream().getAudioTracks(); if (tracks.length) combined = new MediaStream([...canvasStream.getVideoTracks(), ...tracks]); }
            audVid.currentTime = startT; await new Promise(r => { audVid.onseeked = r; });
            recCanvas._audioVideo = audVid;
        }
        const mime = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus') ? 'video/webm;codecs=vp9,opus' : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus') ? 'video/webm;codecs=vp8,opus' : 'video/webm';
        const recorder = new MediaRecorder(combined, { mimeType: mime, videoBitsPerSecond: 8000000 });
        const chunks = []; recorder.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
        const done = new Promise(r => { recorder.onstop = r; });
        recorder.start(100);
        const audVid = recCanvas._audioVideo; if (audVid) audVid.play();
        showExportProgress('Opnemen... (real-time)', 5);
        const startReal = performance.now();
        const anim = async () => {
            const elapsed = (performance.now() - startReal) / 1000, curT = startT + elapsed;
            if (curT >= endT) { recorder.stop(); if (audVid) { audVid.pause(); URL.revokeObjectURL(audVid.src); } return; }
            state.currentFrame = Math.floor((curT / state.totalDuration) * getTotalFrames());
            updateTimelineDisplay(); animateChart();
            if (bgVideo) bgVideo.currentTime = curT;
            await new Promise(r => requestAnimationFrame(r));
            recCtx.drawImage(await captureFrame(false), 0, 0, 1920, 1080);
            showExportProgress(`Opnemen... ${Math.floor(elapsed)}/${Math.floor(dur)} sec`, 5 + (elapsed / dur) * 90);
            requestAnimationFrame(anim);
        };
        anim(); await done;
        showExportProgress('Video verwerken...', 95);
        const blob = new Blob(chunks, { type: mime }), url = URL.createObjectURL(blob);
        const link = document.createElement('a'); link.href = url; link.download = 'vrt-graphic.webm'; link.click(); URL.revokeObjectURL(url);
        state.currentFrame = savedFrame; updateTimelineDisplay(); animateChart();
        if (bgVideo) bgVideo.currentTime = (savedFrame / getTotalFrames()) * state.totalDuration;
        hideExportProgress();
        if (wasPlaying) togglePlayback();
        alert('Video geëxporteerd als WebM formaat (met audio).');
    } catch (e) { console.error(e); alert(`Export mislukt: ${e.message}`); hideExportProgress(); }
    isExporting = false;
}

async function captureBackground() {
    const canvas = document.createElement('canvas'); canvas.width = 1920; canvas.height = 1080; const ctx = canvas.getContext('2d');
    const bgVideo = elements.previewBackground.querySelector('video');
    if (bgVideo) {
        if (bgVideo.readyState < 2) await new Promise(r => { const check = () => bgVideo.readyState >= 2 ? r() : requestAnimationFrame(check); check(); setTimeout(r, 200); });
        try { ctx.drawImage(bgVideo, 0, 0, 1920, 1080); lastVideoFrameCanvas = canvas; return canvas; } catch { if (lastVideoFrameCanvas) { ctx.drawImage(lastVideoFrameCanvas, 0, 0); return canvas; } }
    }
    const bgStyle = elements.previewBackground.style.backgroundImage;
    if (bgStyle && bgStyle !== 'none') {
        const match = bgStyle.match(/url\(["']?([^"']+)["']?\)/);
        if (match) return new Promise(r => { const img = new Image(); img.crossOrigin = 'anonymous'; img.onload = () => { ctx.drawImage(img, 0, 0, 1920, 1080); r(canvas); }; img.onerror = () => { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 1920, 1080); r(canvas); }; img.src = match[1]; });
    }
    const grad = ctx.createLinearGradient(0, 0, 1920, 1080); grad.addColorStop(0, '#1a1a2e'); grad.addColorStop(1, '#16213e'); ctx.fillStyle = grad; ctx.fillRect(0, 0, 1920, 1080);
    return canvas;
}

async function handleExport(format) {
    if (['mp4-audio', 'mp4-noaudio', 'mov-alpha'].includes(format)) { await exportVideo(format); return; }
    try {
        const canvas = await captureFrame(format === 'png'), link = document.createElement('a');
        link.download = `vrt-graphic.${format}`; link.href = canvas.toDataURL(format === 'jpg' ? 'image/jpeg' : 'image/png', 0.95); link.click();
    } catch (e) { console.error(e); alert(`${format.toUpperCase()} export mislukt: ${e.message}`); }
}

function updatePositionState() {
    const isLine = elements.chartType.value === 'line';
    // Disable position dropdown
    elements.position.disabled = isLine;
    elements.position.style.opacity = isLine ? '0.5' : '1';
    elements.position.style.cursor = isLine ? 'not-allowed' : 'pointer';
    // Disable bar width slider
    elements.barWidth.disabled = isLine;
    elements.barWidth.style.opacity = isLine ? '0.5' : '1';
    elements.barWidth.style.cursor = isLine ? 'not-allowed' : 'pointer';
    elements.barWidth.parentElement.style.opacity = isLine ? '0.5' : '1';
    // Disable color palette
    const colorSelectors = document.querySelectorAll('.color-selector');
    colorSelectors.forEach(sel => {
        sel.style.opacity = isLine ? '0.5' : '1';
        sel.style.pointerEvents = isLine ? 'none' : 'auto';
    });
    document.querySelectorAll('.color-row').forEach(row => row.style.opacity = isLine ? '0.5' : '1');
    // Reset to center position if line chart
    if (isLine && elements.position.value !== 'center') {
        elements.position.value = 'center';
        elements.panelWidth.value = 100;
        elements.barWidth.value = 75;
        updatePanelWidth();
        applyScaling();
    }
}

function initEventListeners() {
    const debouncedChart = debounce(() => updateChart(), DEBOUNCE_DELAY);
    const debouncedTitle = debounce(() => updateTitles(), DEBOUNCE_DELAY);
    elements.chartType.addEventListener('change', () => { updatePositionState(); updateChart(); });
    elements.position.addEventListener('change', () => {
        const compact = isCompact();
        elements.panelWidth.value = 100; elements.barWidth.value = compact ? 100 : 75;
        if (compact) { elements.subtitleInput.value = ''; elements.sourceInput.value = ''; }
        updateChart(); updatePanelWidth(); applyScaling(); updateTitles(); initializeBarTimings(); updateBarTimingMarkers();
        if (elements.showValues.checked) { updateValueLabels(); animateChart(); }
    });
    elements.panelWidth.addEventListener('input', updatePanelWidth);
    elements.barWidth.addEventListener('input', () => { updateBarWidth(); if (elements.showValues.checked) animateChart(); });
    elements.graphIn.addEventListener('input', handleGraphInChange);
    initColorSelectors();
    elements.showText.addEventListener('change', handleTextLogoToggle);
    elements.showLogos.addEventListener('change', handleTextLogoToggle);
    elements.showValues.addEventListener('change', () => { elements.showValues.checked ? updateValueLabels() : removeValueLabels(); animateChart(); });
    elements.partyRegion.addEventListener('change', async () => { await loadLogos(); state.chart?.update(); updateLogoPositions(); });
    elements.monoLogos.addEventListener('change', async () => { await loadLogos(); state.chart?.update(); updateLogoPositions(); });
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', e => handleFileUpload(e.target.files[0]));
    elements.uploadArea.addEventListener('dragover', e => { e.preventDefault(); elements.uploadArea.style.opacity = '0.5'; });
    elements.uploadArea.addEventListener('dragleave', () => { elements.uploadArea.style.opacity = '1'; });
    elements.uploadArea.addEventListener('drop', e => { e.preventDefault(); elements.uploadArea.style.opacity = '1'; handleFileUpload(e.dataTransfer.files[0]); });
    elements.importArea.addEventListener('click', () => elements.dataFileInput.click());
    elements.dataFileInput.addEventListener('change', e => handleDataFileImport(e.target.files[0]));
    elements.importArea.addEventListener('dragover', e => { e.preventDefault(); elements.importArea.style.opacity = '0.5'; });
    elements.importArea.addEventListener('dragleave', () => { elements.importArea.style.opacity = '1'; });
    elements.importArea.addEventListener('drop', e => { e.preventDefault(); elements.importArea.style.opacity = '1'; handleDataFileImport(e.dataTransfer.files[0]); });
    elements.uploadFileDelete.addEventListener('click', clearUploadedFile);
    elements.importFileDelete.addEventListener('click', clearImportedFile);
    elements.titleInput.addEventListener('input', debouncedTitle);
    elements.subtitleInput.addEventListener('input', debouncedTitle);
    elements.sourceInput.addEventListener('input', debouncedTitle);
    elements.xAxisInput.addEventListener('input', debounce(async () => { updateChart({ skipLogoUpdate: true }); initializeBarTimings(); if (elements.showLogos.checked) { await loadLogos(); setTimeout(() => { state.chart?.update(); updateLogoPositions(); }, 50); } }, 100));
    elements.yAxisInput.addEventListener('input', debouncedChart);
    elements.suffixInput.addEventListener('input', debouncedChart);
    elements.playBtn.addEventListener('click', togglePlayback);
    const track = elements.timelineProgress.parentElement;
    let dragging = false;
    const updatePos = e => { const r = track.getBoundingClientRect(), p = Math.max(0, Math.min(1, (e.clientX - r.left) / r.width)); state.currentFrame = Math.floor(p * getTotalFrames()); updateTimelineDisplay(); animateChart(); const v = elements.previewBackground.querySelector('video'); if (v) v.currentTime = p * state.totalDuration; };
    track.addEventListener('mousedown', e => { dragging = true; updatePos(e); elements.timelineThumb.style.cursor = 'grabbing'; });
    document.addEventListener('mousemove', e => { if (dragging) updatePos(e); });
    document.addEventListener('mouseup', () => { if (dragging) { dragging = false; elements.timelineThumb.style.cursor = 'grab'; } });
    track.addEventListener('touchstart', e => { dragging = true; updatePos({ clientX: e.touches[0].clientX }); }, { passive: true });
    document.addEventListener('touchmove', e => { if (dragging) updatePos({ clientX: e.touches[0].clientX }); }, { passive: true });
    document.addEventListener('touchend', () => { dragging = false; });
    elements.outputBtns.forEach(btn => { btn.addEventListener('click', () => { elements.outputBtns.forEach(b => b.classList.remove('active')); btn.classList.add('active'); handleExport(btn.dataset.format); }); });
}

function initResizeObserver() {
    new ResizeObserver(() => { updateScaleFactor(); applyScaling(); updatePanelWidth(); if (state.chart) state.chart.update('none'); if (elements.showLogos.checked) scheduleUpdate(updateLogoPositions); }).observe(elements.previewArea);
}

function init() {
    cacheElements(); updateScaleFactor(); initChart(); applyScaling(); initEventListeners(); initEasingCanvas(); initResizeObserver();
    updatePositionState(); updateChart(); updateTitles(); updatePanelWidth(); initializeBarTimings(); updateTotalTimeDisplay(); updateTimelineDisplay();
}

document.addEventListener('DOMContentLoaded', init);
window.addEventListener('resize', () => { state.chart?.resize(); initEasingCanvas(); });
