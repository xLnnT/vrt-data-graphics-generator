// VRT Data Graphics Generator
// Optimized and refactored version

// ============================================
// UTILITIES
// ============================================

// Debounce function to limit rapid updates
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Schedule update on next animation frame (replaces setTimeout)
function scheduleUpdate(callback) {
    requestAnimationFrame(() => {
        requestAnimationFrame(callback);
    });
}

// ============================================
// CONSTANTS
// ============================================

const MAX_BARS = 30;
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
const BASE_PANEL_WIDTH = 88;
const DEBOUNCE_DELAY = 150;

// ============================================
// STATE
// ============================================

const state = {
    chart: null,
    scaleFactor: 1,
    isPlaying: false,
    currentFrame: 0,
    totalFrames: 1200,
    animationId: null,
    highlightedBars: new Set([5]),
    logoImages: {},
    logoSettings: { region: '', mono: false, labels: [] },
    easingPoints: { cp1x: 0.25, cp1y: 0.25, cp2x: 0.75, cp2y: 0.75 },
    pendingUpdates: new Set()
};

// ============================================
// DOM ELEMENTS (cached)
// ============================================

let elements = null;

function cacheElements() {
    elements = {
        // Chart settings
        chartType: document.getElementById('chartType'),
        position: document.getElementById('position'),
        panelWidth: document.getElementById('panelWidth'),
        barWidth: document.getElementById('barWidth'),

        // Colors
        primaryColor: document.getElementById('primaryColor'),
        secondaryColor: document.getElementById('secondaryColor'),
        highlightColor: document.getElementById('highlightColor'),

        // X-axis options
        showText: document.getElementById('showText'),
        showLogos: document.getElementById('showLogos'),
        logoOptions: document.getElementById('logoOptions'),
        partyRegion: document.getElementById('partyRegion'),
        monoLogos: document.getElementById('monoLogos'),

        // Upload
        uploadArea: document.getElementById('uploadArea'),
        fileInput: document.getElementById('fileInput'),

        // Motion
        graphIn: document.getElementById('graphIn'),
        graphOut: document.getElementById('graphOut'),

        // Preview
        previewArea: document.getElementById('previewArea'),
        previewBackground: document.getElementById('previewBackground'),
        chartCanvas: document.getElementById('chartCanvas'),
        chartTitle: document.getElementById('chartTitle'),
        chartSubtitle: document.getElementById('chartSubtitle'),
        chartSource: document.getElementById('chartSource'),
        chartContainer: null, // Set after DOM ready
        chartWrapper: null,   // Set after DOM ready

        // Inputs
        titleInput: document.getElementById('titleInput'),
        subtitleInput: document.getElementById('subtitleInput'),
        sourceInput: document.getElementById('sourceInput'),
        xAxisInput: document.getElementById('xAxisInput'),
        yAxisInput: document.getElementById('yAxisInput'),
        dataInput: document.getElementById('dataInput'),

        // Easing
        easingCanvas: document.getElementById('easingCanvas'),
        easingValues: document.getElementById('easingValues'),

        // Timeline
        playBtn: document.getElementById('playBtn'),
        currentTime: document.getElementById('currentTime'),
        totalTime: document.getElementById('totalTime'),
        timelineProgress: document.getElementById('timelineProgress'),
        timelineThumb: document.getElementById('timelineThumb'),

        // Output
        outputBtns: document.querySelectorAll('.output-btn')
    };

    // Cache derived elements
    elements.chartContainer = elements.previewArea.querySelector('.chart-container');
    elements.chartWrapper = elements.chartCanvas.parentElement;
}

// ============================================
// DATA GETTERS
// ============================================

function getXAxisLabels() {
    const input = elements.xAxisInput.value;
    return input.split(',').map(s => s.trim()).filter(s => s !== '').slice(0, MAX_BARS);
}

function getYAxisData() {
    const input = elements.yAxisInput.value;
    return input.split(',').map(s => s.trim()).filter(s => s !== '').map(s => parseFloat(s) || 0).slice(0, MAX_BARS);
}

function getBarColors() {
    const labels = getXAxisLabels();
    const primary = elements.primaryColor.dataset.color;
    const highlight = elements.highlightColor.dataset.color;

    return labels.map((_, index) =>
        state.highlightedBars.has(index) ? highlight : primary
    );
}

// ============================================
// SCALING
// ============================================

function updateScaleFactor() {
    const rect = elements.previewArea.getBoundingClientRect();
    state.scaleFactor = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
}

function applyScaling() {
    const { scaleFactor } = state;
    const container = elements.chartContainer;

    // Scale CSS custom properties
    container.style.setProperty('--title-size', `${Math.round(42 * scaleFactor)}px`);
    container.style.setProperty('--subtitle-size', `${Math.round(24 * scaleFactor)}px`);
    container.style.setProperty('--source-size', `${Math.round(16 * scaleFactor)}px`);
    container.style.setProperty('--padding-v', `${Math.round(25 * scaleFactor)}px`);
    container.style.setProperty('--padding-h', `${Math.round(35 * scaleFactor)}px`);
    container.style.setProperty('--spacing-sm', `${Math.round(6 * scaleFactor)}px`);

    // Scale chart elements
    if (state.chart) {
        const tickSize = Math.round(14 * scaleFactor);
        const barRadius = Math.round(8 * scaleFactor);

        state.chart.options.scales.x.ticks.font.size = tickSize;
        state.chart.options.scales.y.ticks.font.size = tickSize;
        state.chart.options.scales.x.ticks.padding = Math.round(10 * scaleFactor);
        state.chart.options.scales.y.ticks.padding = Math.round(10 * scaleFactor);

        state.chart.data.datasets[0].borderRadius = {
            topLeft: barRadius,
            topRight: barRadius,
            bottomLeft: 0,
            bottomRight: 0
        };
    }
}

// ============================================
// CHART MANAGEMENT
// ============================================

function initChart() {
    const ctx = elements.chartCanvas.getContext('2d');

    state.chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: getXAxisLabels(),
            datasets: [{
                label: 'Data',
                data: getYAxisData(),
                backgroundColor: getBarColors(),
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: { topLeft: 6, topRight: 6, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false,
                barPercentage: 0.5,
                categoryPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: '#15103A',
                    titleColor: '#EFEDFD',
                    bodyColor: '#C9C2F8',
                    cornerRadius: 8,
                    padding: 12
                }
            },
            scales: {
                x: {
                    grid: { display: false },
                    border: { display: false },
                    ticks: {
                        color: '#666',
                        font: { size: 13, family: 'Roobert VRT' },
                        padding: 8
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 60,
                    border: { display: false },
                    grid: { color: '#e0e0e0', lineWidth: 1 },
                    ticks: {
                        color: '#666',
                        font: { size: 13, family: 'Roobert VRT' },
                        padding: 8,
                        callback: value => value + '%'
                    }
                }
            },
            onClick: handleChartClick
        }
    });
}

function updateChart(options = {}) {
    if (!state.chart) return;

    const { skipLogoUpdate = false, mode = 'default' } = options;
    const chart = state.chart;

    // Update chart type if needed
    const chartType = elements.chartType.value;
    switch (chartType) {
        case 'bar-vertical':
            chart.config.type = 'bar';
            chart.options.indexAxis = 'x';
            break;
        case 'bar-horizontal':
            chart.config.type = 'bar';
            chart.options.indexAxis = 'y';
            break;
        case 'line':
            chart.config.type = 'line';
            chart.data.datasets[0].fill = false;
            chart.data.datasets[0].borderColor = elements.primaryColor.dataset.color;
            chart.data.datasets[0].borderWidth = 3;
            chart.data.datasets[0].tension = 0.4;
            break;
        case 'pie':
            chart.config.type = 'pie';
            break;
        case 'donut':
            chart.config.type = 'doughnut';
            break;
    }

    // Update data
    chart.data.labels = getXAxisLabels();
    chart.data.datasets[0].data = getYAxisData();
    chart.data.datasets[0].backgroundColor = getBarColors();

    // Update Y-axis max
    const maxValue = Math.max(...getYAxisData(), 0);
    if (chart.options.scales?.y) {
        chart.options.scales.y.max = Math.ceil(maxValue / 10) * 10 + 10;
    }

    // Apply update
    chart.update(mode === 'none' ? 'none' : undefined);

    // Update logos if enabled and not skipped
    if (!skipLogoUpdate && elements.showLogos.checked) {
        scheduleUpdate(updateLogoPositions);
    }
}

function handleChartClick(event, clickedElements) {
    if (clickedElements.length > 0) {
        const barIndex = clickedElements[0].index;

        if (state.highlightedBars.has(barIndex)) {
            state.highlightedBars.delete(barIndex);
        } else {
            state.highlightedBars.add(barIndex);
        }

        updateChart({ skipLogoUpdate: true });
    }
}

// ============================================
// LOGO MANAGEMENT
// ============================================

function getLogoPath(partyName) {
    const region = elements.partyRegion.value === 'vlaamse' ? 'Vlaamse partijen' : 'Waalse partijen';
    const colorMode = elements.monoLogos.checked ? 'mono' : 'kleur';
    return encodeURI(`assets/Logo's politieke partijen/${region}/${colorMode}/${partyName}.png`);
}

function needsLogoReload() {
    const currentSettings = {
        region: elements.partyRegion.value,
        mono: elements.monoLogos.checked,
        labels: getXAxisLabels().join(',')
    };

    return currentSettings.region !== state.logoSettings.region ||
           currentSettings.mono !== state.logoSettings.mono ||
           currentSettings.labels !== state.logoSettings.labels;
}

async function loadLogos() {
    const labels = getXAxisLabels();

    // Update settings cache
    state.logoSettings = {
        region: elements.partyRegion.value,
        mono: elements.monoLogos.checked,
        labels: labels.join(',')
    };

    // Clear old images
    state.logoImages = {};

    // Load all logos in parallel
    await Promise.all(labels.map(label =>
        new Promise(resolve => {
            const img = new Image();
            img.onload = () => {
                state.logoImages[label] = img;
                resolve();
            };
            img.onerror = () => {
                state.logoImages[label] = null;
                resolve();
            };
            img.src = getLogoPath(label);
        })
    ));
}

function updateLogoPositions() {
    removeLogos();

    if (!state.chart || !elements.showLogos.checked) return;

    const { scaleFactor } = state;
    const chartArea = state.chart.chartArea;
    const xScale = state.chart.scales.x;
    const labels = getXAxisLabels();
    const logoSize = 80 * scaleFactor;
    const topPosition = chartArea.bottom + (10 * scaleFactor);

    // Get canvas offset relative to wrapper (accounts for padding/centering)
    const canvas = elements.chartCanvas;
    const canvasOffset = canvas.offsetLeft;

    // Create container
    const container = document.createElement('div');
    container.id = 'xAxisLogos';
    container.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        top: ${topPosition}px;
        height: ${logoSize}px;
        pointer-events: none;
        z-index: 10;
    `;

    // Add logos
    labels.forEach((label, index) => {
        // Add canvas offset to account for wrapper padding/centering
        const xPos = xScale.getPixelForValue(index) + canvasOffset;

        const wrapper = document.createElement('div');
        wrapper.style.cssText = `
            position: absolute;
            left: ${xPos}px;
            top: 0;
            transform: translateX(-50%);
            display: flex;
            justify-content: center;
            align-items: center;
            width: ${logoSize}px;
            height: ${logoSize}px;
        `;

        if (state.logoImages[label]) {
            const img = document.createElement('img');
            img.src = state.logoImages[label].src;
            img.style.cssText = `
                max-height: ${logoSize}px;
                max-width: ${logoSize}px;
                object-fit: contain;
            `;
            wrapper.appendChild(img);
        } else {
            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = `
                font-size: ${12 * scaleFactor}px;
                color: #666;
                font-family: 'Roobert VRT', sans-serif;
                text-align: center;
            `;
            wrapper.appendChild(text);
        }

        container.appendChild(wrapper);
    });

    elements.chartWrapper.style.position = 'relative';
    elements.chartWrapper.style.overflow = 'visible';
    elements.chartWrapper.appendChild(container);
}

function removeLogos() {
    document.getElementById('xAxisLogos')?.remove();
}

async function updateXAxisDisplay() {
    if (!state.chart) return;

    const showLogos = elements.showLogos.checked;
    const logoPadding = 225 * state.scaleFactor;

    if (showLogos) {
        // Load logos if settings changed
        if (needsLogoReload()) {
            await loadLogos();
        }

        state.chart.options.scales.x.ticks.display = false;
        state.chart.options.layout = state.chart.options.layout || {};
        state.chart.options.layout.padding = state.chart.options.layout.padding || {};
        state.chart.options.layout.padding.bottom = logoPadding;
        state.chart.update();

        scheduleUpdate(updateLogoPositions);
    } else {
        state.chart.options.scales.x.ticks.display = true;
        if (state.chart.options.layout?.padding) {
            state.chart.options.layout.padding.bottom = 0;
        }
        state.chart.update();
        removeLogos();
    }
}

// ============================================
// PANEL & BAR WIDTH
// ============================================

function updatePanelWidth() {
    const width = elements.panelWidth.value;
    const horizontalInset = (100 - width) / 2;

    elements.chartContainer.style.left = `${horizontalInset}%`;
    elements.chartContainer.style.right = `${horizontalInset}%`;

    updateBarWidth();

    if (elements.showLogos.checked) {
        scheduleUpdate(() => {
            state.chart?.update();
            updateLogoPositions();
        });
    }
}

function updateBarWidth() {
    if (!state.chart) return;

    const barWidthSetting = elements.barWidth.value / 100;
    const panelWidth = elements.panelWidth.value;
    const compensatedBarWidth = barWidthSetting * (BASE_PANEL_WIDTH / panelWidth);

    state.chart.data.datasets[0].barPercentage = Math.min(1, Math.max(0.1, compensatedBarWidth));
    state.chart.update('none');
}

// ============================================
// TITLES
// ============================================

function updateTitles() {
    elements.chartTitle.textContent = elements.titleInput.value || 'Titel';
    elements.chartSubtitle.textContent = elements.subtitleInput.value || 'Subtitel';
    elements.chartSource.textContent = elements.sourceInput.value
        ? 'bron: ' + elements.sourceInput.value
        : '';
}

// ============================================
// TEXT/LOGO TOGGLE
// ============================================

function handleTextLogoToggle(e) {
    const checkbox = e.target;

    if (checkbox === elements.showText && checkbox.checked) {
        elements.showLogos.checked = false;
        elements.logoOptions.style.display = 'none';
    } else if (checkbox === elements.showLogos && checkbox.checked) {
        elements.showText.checked = false;
        elements.logoOptions.style.display = 'block';
    } else if (checkbox === elements.showLogos && !checkbox.checked) {
        elements.logoOptions.style.display = 'none';
    }

    updateXAxisDisplay();
}

// ============================================
// COLOR SELECTORS
// ============================================

function initColorSelectors() {
    const selectors = document.querySelectorAll('.color-selector');

    selectors.forEach(selector => {
        const indicator = selector.querySelector('.color-indicator');
        const options = selector.querySelectorAll('.color-option');

        indicator.addEventListener('click', e => {
            e.stopPropagation();
            selectors.forEach(s => s !== selector && s.classList.remove('open'));
            selector.classList.toggle('open');
        });

        options.forEach(option => {
            option.addEventListener('click', e => {
                e.stopPropagation();
                const color = option.dataset.color;
                selector.dataset.color = color;
                indicator.style.backgroundColor = color;
                options.forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');
                selector.classList.remove('open');
                updateChart({ skipLogoUpdate: true });
            });

            if (option.dataset.color === selector.dataset.color) {
                option.classList.add('selected');
            }
        });
    });

    document.addEventListener('click', () => {
        selectors.forEach(s => s.classList.remove('open'));
    });
}

// ============================================
// FILE UPLOAD
// ============================================

function handleFileUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = e => {
        elements.previewBackground.style.backgroundImage = `url(${e.target.result})`;
    };
    reader.readAsDataURL(file);
}

// ============================================
// EASING CANVAS
// ============================================

function initEasingCanvas() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    drawEasingCurve();
}

function drawEasingCurve() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;

    ctx.clearRect(0, 0, width, height);

    // Grid
    ctx.strokeStyle = '#C9C2F833';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * width / 10, 0);
        ctx.lineTo(i * width / 10, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * height / 10);
        ctx.lineTo(width, i * height / 10);
        ctx.stroke();
    }

    // Diagonal reference
    ctx.strokeStyle = '#C9C2F866';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();

    // Bezier curve
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.bezierCurveTo(
        cp1x * width, height - cp1y * height,
        cp2x * width, height - cp2y * height,
        width, 0
    );
    ctx.stroke();

    // Control points
    ctx.fillStyle = '#5541F0';
    ctx.beginPath();
    ctx.arc(cp1x * width, height - cp1y * height, 6, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.arc(cp2x * width, height - cp2y * height, 6, 0, Math.PI * 2);
    ctx.fill();

    // Control point lines
    ctx.strokeStyle = '#5541F066';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(cp1x * width, height - cp1y * height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(cp2x * width, height - cp2y * height);
    ctx.stroke();

    elements.easingValues.textContent = `${cp1x.toFixed(2)},${cp1y.toFixed(2)},${cp2x.toFixed(2)},${cp2y.toFixed(2)}`;
}

// ============================================
// ANIMATION / PLAYBACK
// ============================================

function togglePlayback() {
    state.isPlaying = !state.isPlaying;

    if (state.isPlaying) {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        animate();
    } else {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        cancelAnimationFrame(state.animationId);
    }
}

function animate() {
    if (!state.isPlaying) return;

    state.currentFrame = (state.currentFrame + 1) % state.totalFrames;
    updateTimelineDisplay();
    animateChart();

    state.animationId = requestAnimationFrame(animate);
}

function updateTimelineDisplay() {
    const percent = (state.currentFrame / state.totalFrames) * 100;
    elements.timelineProgress.style.width = `${percent}%`;
    elements.timelineThumb.style.left = `${percent}%`;

    const currentSeconds = (state.currentFrame / state.totalFrames) * 20;
    const minutes = Math.floor(currentSeconds / 60);
    const seconds = Math.floor(currentSeconds % 60);
    elements.currentTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

function animateChart() {
    if (!state.chart) return;

    const graphInTime = parseInt(elements.graphIn.value) || 5;
    const graphOutTime = parseInt(elements.graphOut.value) || 15;
    const currentTime = (state.currentFrame / state.totalFrames) * 20;

    let progress = 0;
    if (currentTime < graphInTime) {
        progress = currentTime / graphInTime;
    } else if (currentTime < graphOutTime) {
        progress = 1;
    } else {
        progress = 1 - ((currentTime - graphOutTime) / (20 - graphOutTime));
    }

    progress = Math.max(0, Math.min(1, progress));
    progress = cubicBezier(progress, state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);

    const originalData = getYAxisData();
    state.chart.data.datasets[0].data = originalData.map(val => val * progress);
    state.chart.update('none');
}

function cubicBezier(t, x1, y1, x2, y2) {
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;
    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    return ((ay * t + by) * t + cy) * t;
}

// ============================================
// EXPORT
// ============================================

function handleExport(format) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    if (typeof html2canvas === 'undefined') {
        // Fallback
        const link = document.createElement('a');
        link.download = 'vrt-chart.png';
        link.href = elements.chartCanvas.toDataURL('image/png');
        link.click();
        return;
    }

    html2canvas(elements.previewArea).then(capturedCanvas => {
        ctx.drawImage(capturedCanvas, 0, 0, 1920, 1080);

        let mimeType, extension;
        switch (format) {
            case 'png':
                mimeType = 'image/png';
                extension = 'png';
                break;
            case 'jpg':
                mimeType = 'image/jpeg';
                extension = 'jpg';
                break;
            default:
                alert(`Video export (${format}) requires server-side processing.`);
                return;
        }

        const link = document.createElement('a');
        link.download = `vrt-graphic.${extension}`;
        link.href = canvas.toDataURL(mimeType);
        link.click();
    }).catch(() => {
        const link = document.createElement('a');
        link.download = 'vrt-chart.png';
        link.href = elements.chartCanvas.toDataURL('image/png');
        link.click();
    });
}

// ============================================
// EVENT LISTENERS
// ============================================

function initEventListeners() {
    // Debounced handlers for text inputs
    const debouncedChartUpdate = debounce(() => updateChart(), DEBOUNCE_DELAY);
    const debouncedTitleUpdate = debounce(() => updateTitles(), DEBOUNCE_DELAY);
    const debouncedAxisUpdate = debounce(() => {
        updateChart();
        if (elements.showLogos.checked) {
            updateXAxisDisplay();
        }
    }, DEBOUNCE_DELAY);

    // Chart settings (immediate)
    elements.chartType.addEventListener('change', () => updateChart());
    elements.position.addEventListener('change', () => updateChart());
    elements.panelWidth.addEventListener('input', updatePanelWidth);
    elements.barWidth.addEventListener('input', updateBarWidth);

    // Colors
    initColorSelectors();

    // Text/Logos toggle (immediate)
    elements.showText.addEventListener('change', handleTextLogoToggle);
    elements.showLogos.addEventListener('change', handleTextLogoToggle);
    elements.partyRegion.addEventListener('change', () => updateXAxisDisplay());
    elements.monoLogos.addEventListener('change', () => updateXAxisDisplay());

    // Upload
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', e => handleFileUpload(e.target.files[0]));

    // Drag and drop
    elements.uploadArea.addEventListener('dragover', e => {
        e.preventDefault();
        elements.uploadArea.style.opacity = '0.5';
    });
    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.style.opacity = '1';
    });
    elements.uploadArea.addEventListener('drop', e => {
        e.preventDefault();
        elements.uploadArea.style.opacity = '1';
        handleFileUpload(e.dataTransfer.files[0]);
    });

    // Title inputs (debounced)
    elements.titleInput.addEventListener('input', debouncedTitleUpdate);
    elements.subtitleInput.addEventListener('input', debouncedTitleUpdate);
    elements.sourceInput.addEventListener('input', debouncedTitleUpdate);

    // Axis inputs
    // X-axis: immediate update when logos enabled (to load logos as you type), debounced otherwise
    elements.xAxisInput.addEventListener('input', () => {
        if (elements.showLogos.checked) {
            updateChart();
            updateXAxisDisplay();
        } else {
            debouncedAxisUpdate();
        }
    });
    elements.yAxisInput.addEventListener('input', debouncedChartUpdate);

    // Timeline
    elements.playBtn.addEventListener('click', togglePlayback);

    const timelineTrack = elements.timelineProgress.parentElement;
    timelineTrack.addEventListener('click', e => {
        const rect = timelineTrack.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        state.currentFrame = Math.floor(percent * state.totalFrames);
        updateTimelineDisplay();
    });

    // Output buttons
    elements.outputBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            elements.outputBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            handleExport(btn.dataset.format);
        });
    });
}

// ============================================
// RESIZE HANDLING
// ============================================

function initResizeObserver() {
    const resizeObserver = new ResizeObserver(() => {
        updateScaleFactor();
        applyScaling();

        if (state.chart) {
            state.chart.update('none');
        }

        if (elements.showLogos.checked) {
            scheduleUpdate(updateLogoPositions);
        }
    });

    resizeObserver.observe(elements.previewArea);
}

// ============================================
// INITIALIZATION
// ============================================

function init() {
    cacheElements();
    updateScaleFactor();
    initChart();
    applyScaling();
    initEventListeners();
    initEasingCanvas();
    initResizeObserver();
    updateChart();
    updateTitles();
    updatePanelWidth();
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', () => {
    state.chart?.resize();
    initEasingCanvas();
});
