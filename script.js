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
    totalDuration: 20, // Total duration in seconds
    animationId: null,
    highlightedBars: new Set([5]),
    logoImages: {},
    logoSettings: { region: '', mono: false, labels: [] },
    easingPoints: { cp1x: 0.90, cp1y: 0.00, cp2x: 0.30, cp2y: 1.00 }
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

        // Import
        importArea: document.getElementById('importArea'),
        dataFileInput: document.getElementById('dataFileInput'),
        importFileDisplay: document.getElementById('importFileDisplay'),
        importFileName: document.getElementById('importFileName'),
        importFileDelete: document.getElementById('importFileDelete'),

        // Upload file display
        uploadFileDisplay: document.getElementById('uploadFileDisplay'),
        uploadFileName: document.getElementById('uploadFileName'),
        uploadFileDelete: document.getElementById('uploadFileDelete'),

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
                    grid: { color: '#c0c0c0', lineWidth: 1 },
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

async function handleTextLogoToggle(e) {
    const checkbox = e.target;
    const isTextCheckbox = checkbox.id === 'showText';
    const isLogosCheckbox = checkbox.id === 'showLogos';

    if (isTextCheckbox && checkbox.checked) {
        // Text enabled - disable logos
        elements.showLogos.checked = false;
        elements.logoOptions.style.display = 'none';
        if (state.chart) {
            state.chart.options.scales.x.ticks.display = true;
            if (state.chart.options.layout?.padding) {
                state.chart.options.layout.padding.bottom = 0;
            }
            state.chart.update();
        }
        removeLogos();
    } else if (isLogosCheckbox && checkbox.checked) {
        // Logos enabled - disable text, load and show logos
        elements.showText.checked = false;
        elements.logoOptions.style.display = 'block';

        // Load logos first
        await loadLogos();

        // Update chart layout
        if (state.chart) {
            const logoPadding = 225 * state.scaleFactor;
            state.chart.options.scales.x.ticks.display = false;
            state.chart.options.layout = state.chart.options.layout || {};
            state.chart.options.layout.padding = state.chart.options.layout.padding || {};
            state.chart.options.layout.padding.bottom = logoPadding;
            state.chart.update();

            // Wait for chart to fully render, then position logos
            setTimeout(() => {
                updateLogoPositions();
            }, 100);
        }
    } else if (isLogosCheckbox && !checkbox.checked) {
        // Logos disabled - show text labels
        elements.logoOptions.style.display = 'none';
        if (state.chart) {
            state.chart.options.scales.x.ticks.display = true;
            if (state.chart.options.layout?.padding) {
                state.chart.options.layout.padding.bottom = 0;
            }
            state.chart.update();
        }
        removeLogos();
    }
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

// Maximum file size: 100MB
const MAX_FILE_SIZE = 100 * 1024 * 1024;

function handleFileUpload(file) {
    if (!file) return;

    // Check file size
    if (file.size > MAX_FILE_SIZE) {
        alert(`Bestand is te groot. Maximum grootte is 100MB. Uw bestand is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
        return;
    }

    const isVideo = file.type.startsWith('video/') ||
                    ['.mp4', '.mov', '.avi', '.mxf'].some(ext => file.name.toLowerCase().endsWith(ext));

    // Clear previous content
    elements.previewBackground.style.backgroundImage = '';
    elements.previewBackground.innerHTML = '';

    if (isVideo) {
        // Handle video files
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.autoplay = false;
        video.loop = false;
        video.muted = true;
        video.playsInline = true;

        // Update total duration when video metadata is loaded
        video.addEventListener('loadedmetadata', () => {
            if (video.duration && isFinite(video.duration)) {
                state.totalDuration = video.duration;
                state.currentFrame = 0;
                updateTotalTimeDisplay();
                updateTimelineDisplay();
                animateChart();
            }
        });

        elements.previewBackground.appendChild(video);
    } else {
        // Handle image files - reset to default duration
        state.totalDuration = 20;
        state.currentFrame = 0;
        updateTotalTimeDisplay();
        updateTimelineDisplay();

        const reader = new FileReader();
        reader.onload = e => {
            elements.previewBackground.style.backgroundImage = `url(${e.target.result})`;
        };
        reader.readAsDataURL(file);
    }

    // Show file name and delete button
    elements.uploadFileName.textContent = file.name;
    elements.uploadFileDisplay.style.display = 'flex';
    elements.uploadArea.style.display = 'none';
}

function clearUploadedFile() {
    elements.previewBackground.style.backgroundImage = '';
    elements.previewBackground.innerHTML = '';
    elements.fileInput.value = '';
    elements.uploadFileDisplay.style.display = 'none';
    elements.uploadArea.style.display = 'flex';
    state.totalDuration = 20;
    state.currentFrame = 0;
    updateTotalTimeDisplay();
    updateTimelineDisplay();
}

function updateTotalTimeDisplay() {
    const minutes = Math.floor(state.totalDuration / 60);
    const seconds = Math.floor(state.totalDuration % 60);
    elements.totalTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// ============================================
// DATA FILE IMPORT
// ============================================

function handleDataFileImport(file) {
    if (!file) return;

    const originalFileName = file.name;
    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    const showFileDisplay = () => {
        elements.importFileName.textContent = originalFileName;
        elements.importFileDisplay.style.display = 'flex';
        elements.importArea.style.display = 'none';
    };

    if (fileName.endsWith('.json')) {
        reader.onload = e => {
            try {
                const data = JSON.parse(e.target.result);
                applyImportedData(data);
                showFileDisplay();
            } catch (error) {
                alert('Ongeldig JSON bestand: ' + error.message);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.csv')) {
        reader.onload = e => {
            try {
                const data = parseCSV(e.target.result);
                applyImportedData(data);
                showFileDisplay();
            } catch (error) {
                alert('Ongeldig CSV bestand: ' + error.message);
            }
        };
        reader.readAsText(file);
    } else if (fileName.endsWith('.xls') || fileName.endsWith('.xlsx')) {
        reader.onload = e => {
            try {
                if (typeof XLSX === 'undefined') {
                    alert('Excel library niet geladen');
                    return;
                }
                const data = new Uint8Array(e.target.result);
                const workbook = XLSX.read(data, { type: 'array' });
                const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
                const jsonData = XLSX.utils.sheet_to_json(firstSheet, { header: 1 });
                const parsedData = parseExcelData(jsonData);
                applyImportedData(parsedData);
                showFileDisplay();
            } catch (error) {
                alert('Ongeldig Excel bestand: ' + error.message);
            }
        };
        reader.readAsArrayBuffer(file);
    }
}

function clearImportedFile() {
    elements.dataFileInput.value = '';
    elements.importFileDisplay.style.display = 'none';
    elements.importArea.style.display = 'flex';
    // Optionally clear the data - uncomment if desired:
    // elements.xAxisInput.value = '';
    // elements.yAxisInput.value = '';
    // updateChart();
}

function parseCSV(csvText) {
    const lines = csvText.trim().split('\n');
    if (lines.length < 2) {
        throw new Error('CSV moet minstens 2 rijen hebben (labels en waarden)');
    }

    // Try to detect delimiter
    const delimiter = csvText.includes(';') ? ';' : ',';

    const labels = lines[0].split(delimiter).map(s => s.trim().replace(/^["']|["']$/g, ''));
    const values = lines[1].split(delimiter).map(s => parseFloat(s.trim()) || 0);

    return { labels, values };
}

function parseExcelData(jsonData) {
    if (jsonData.length < 2) {
        throw new Error('Excel moet minstens 2 rijen hebben (labels en waarden)');
    }

    const labels = jsonData[0].map(cell => String(cell || '').trim());
    const values = jsonData[1].map(cell => parseFloat(cell) || 0);

    return { labels, values };
}

function applyImportedData(data) {
    // Support different data formats
    let labels = [];
    let values = [];

    if (Array.isArray(data)) {
        // Array of objects: [{label: 'A', value: 10}, ...]
        if (data.length > 0 && typeof data[0] === 'object') {
            const firstItem = data[0];
            const labelKey = Object.keys(firstItem).find(k =>
                ['label', 'name', 'x', 'category', 'jaar', 'year'].includes(k.toLowerCase())
            ) || Object.keys(firstItem)[0];
            const valueKey = Object.keys(firstItem).find(k =>
                ['value', 'y', 'data', 'waarde', 'aantal', 'count'].includes(k.toLowerCase())
            ) || Object.keys(firstItem)[1];

            labels = data.map(item => String(item[labelKey] || ''));
            values = data.map(item => parseFloat(item[valueKey]) || 0);
        }
    } else if (data.labels && data.values) {
        // Direct format: {labels: [...], values: [...]}
        labels = data.labels;
        values = data.values;
    } else if (data.x && data.y) {
        // Alternative format: {x: [...], y: [...]}
        labels = data.x;
        values = data.y;
    }

    if (labels.length > 0 && values.length > 0) {
        elements.xAxisInput.value = labels.join(',');
        elements.yAxisInput.value = values.join(',');
        updateChart();
    } else {
        alert('Kon geen geldige data vinden in het bestand');
    }
}

// ============================================
// EASING CANVAS
// ============================================

let easingDragging = null; // 'cp1' or 'cp2' or null

function initEasingCanvas() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');

    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    // Add mouse interaction - mousedown on canvas, move/up on document for dragging outside
    canvas.addEventListener('mousedown', handleEasingMouseDown);
    canvas.addEventListener('mousemove', handleEasingCanvasHover);
    document.addEventListener('mousemove', handleEasingMouseMove);
    document.addEventListener('mouseup', handleEasingMouseUp);

    // Touch support
    canvas.addEventListener('touchstart', handleEasingTouchStart, { passive: false });
    document.addEventListener('touchmove', handleEasingTouchMove, { passive: false });
    document.addEventListener('touchend', handleEasingMouseUp);

    drawEasingCurve();
}

function getEasingCanvasCoords(e) {
    const canvas = elements.easingCanvas;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = 1 - (e.clientY - rect.top) / rect.height; // Flip Y axis
    return { x: Math.max(0, Math.min(1, x)), y: Math.max(0, Math.min(1, y)) };
}

function handleEasingMouseDown(e) {
    const coords = getEasingCanvasCoords(e);
    const { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;

    // Check which control point is closest
    const dist1 = Math.hypot(coords.x - cp1x, coords.y - cp1y);
    const dist2 = Math.hypot(coords.x - cp2x, coords.y - cp2y);

    const threshold = 0.15; // Click tolerance

    if (dist1 < threshold && dist1 <= dist2) {
        easingDragging = 'cp1';
        elements.easingCanvas.style.cursor = 'grabbing';
    } else if (dist2 < threshold) {
        easingDragging = 'cp2';
        elements.easingCanvas.style.cursor = 'grabbing';
    }
}

function handleEasingMouseMove(e) {
    if (!easingDragging) return;

    const coords = getEasingCanvasCoords(e);

    if (easingDragging === 'cp1') {
        state.easingPoints.cp1x = Math.max(0, Math.min(1, coords.x));
        state.easingPoints.cp1y = coords.y; // Allow Y to go outside 0-1 for overshoot
    } else if (easingDragging === 'cp2') {
        state.easingPoints.cp2x = Math.max(0, Math.min(1, coords.x));
        state.easingPoints.cp2y = coords.y; // Allow Y to go outside 0-1 for overshoot
    }
    drawEasingCurve();
}

function handleEasingCanvasHover(e) {
    if (easingDragging) return;

    const coords = getEasingCanvasCoords(e);
    const { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;
    const dist1 = Math.hypot(coords.x - cp1x, coords.y - cp1y);
    const dist2 = Math.hypot(coords.x - cp2x, coords.y - cp2y);

    if (dist1 < 0.15 || dist2 < 0.15) {
        elements.easingCanvas.style.cursor = 'grab';
    } else {
        elements.easingCanvas.style.cursor = 'default';
    }
}

function handleEasingMouseUp() {
    easingDragging = null;
    elements.easingCanvas.style.cursor = 'default';
}

function handleEasingTouchStart(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handleEasingMouseDown({ clientX: touch.clientX, clientY: touch.clientY });
}

function handleEasingTouchMove(e) {
    e.preventDefault();
    const touch = e.touches[0];
    handleEasingMouseMove({ clientX: touch.clientX, clientY: touch.clientY });
}

function drawEasingCurve() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;
    const { cp1x, cp1y, cp2x, cp2y } = state.easingPoints;

    ctx.clearRect(0, 0, width, height);

    // 4x4 Grid
    ctx.strokeStyle = '#C9C2F844';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
        ctx.beginPath();
        ctx.moveTo(i * width / 4, 0);
        ctx.lineTo(i * width / 4, height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * height / 4);
        ctx.lineTo(width, i * height / 4);
        ctx.stroke();
    }

    // Diagonal reference (linear easing)
    ctx.strokeStyle = '#C9C2F866';
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();
    ctx.setLineDash([]);

    // Control point lines (beziers)
    ctx.strokeStyle = '#C9C2F8';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(cp1x * width, height - cp1y * height);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(cp2x * width, height - cp2y * height);
    ctx.stroke();

    // Bezier curve
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.bezierCurveTo(
        cp1x * width, height - cp1y * height,
        cp2x * width, height - cp2y * height,
        width, 0
    );
    ctx.stroke();

    // Control points (draggable) - no start/end dots
    ctx.fillStyle = '#C9C2F8';
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;

    // CP1
    ctx.beginPath();
    ctx.arc(cp1x * width, height - cp1y * height, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // CP2
    ctx.beginPath();
    ctx.arc(cp2x * width, height - cp2y * height, 8, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Update values display
    elements.easingValues.textContent = `${cp1x.toFixed(2)}, ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)}, ${cp2y.toFixed(2)}`;
}

// ============================================
// ANIMATION / PLAYBACK
// ============================================

function togglePlayback() {
    state.isPlaying = !state.isPlaying;

    const bgVideo = elements.previewBackground.querySelector('video');

    if (state.isPlaying) {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';

        // Sync and play background video
        if (bgVideo) {
            const totalFrames = getTotalFrames();
            const currentTime = (state.currentFrame / totalFrames) * state.totalDuration;
            bgVideo.currentTime = currentTime;
            bgVideo.play();
        }

        animate();
    } else {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        cancelAnimationFrame(state.animationId);

        // Pause background video
        if (bgVideo) {
            bgVideo.pause();
        }
    }
}

function animate() {
    if (!state.isPlaying) return;

    const totalFrames = getTotalFrames();
    const bgVideo = elements.previewBackground.querySelector('video');

    // If background video exists, sync timeline to video time for accurate playback
    if (bgVideo && !bgVideo.paused) {
        const videoTime = bgVideo.currentTime;
        state.currentFrame = Math.floor((videoTime / state.totalDuration) * totalFrames);

        // Check if video ended
        if (bgVideo.ended || videoTime >= state.totalDuration) {
            state.currentFrame = 0;
            bgVideo.currentTime = 0;
            bgVideo.play();
        }
    } else {
        state.currentFrame = (state.currentFrame + 1) % totalFrames;
    }

    updateTimelineDisplay();
    animateChart();

    state.animationId = requestAnimationFrame(animate);
}

function getTotalFrames() {
    // 60fps for preview animation
    return Math.floor(state.totalDuration * 60);
}

function updateTimelineDisplay() {
    const totalFrames = getTotalFrames();
    const percent = (state.currentFrame / totalFrames) * 100;
    elements.timelineProgress.style.width = `${percent}%`;
    elements.timelineThumb.style.left = `${percent}%`;

    const currentSeconds = (state.currentFrame / totalFrames) * state.totalDuration;
    const minutes = Math.floor(currentSeconds / 60);
    const seconds = Math.floor(currentSeconds % 60);
    elements.currentTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Panel swipe animation easing (fixed)
const PANEL_EASING = { cp1x: 0.00, cp1y: 0.90, cp2x: 0.30, cp2y: 1.00 };
const PANEL_ANIMATION_DURATION = 0.5; // 0.5 seconds

function animateChart() {
    if (!state.chart) return;

    const totalFrames = getTotalFrames();
    const graphInTime = parseInt(elements.graphIn.value) || 1;
    const graphOutTime = parseInt(elements.graphOut.value) || 10;
    const currentTime = (state.currentFrame / totalFrames) * state.totalDuration;

    // Panel swipe animation (reveals from bottom)
    let panelProgress = 0;
    const panelInStart = graphInTime;
    const panelInEnd = graphInTime + PANEL_ANIMATION_DURATION;
    const panelOutStart = graphOutTime;
    const panelOutEnd = graphOutTime + PANEL_ANIMATION_DURATION;

    if (currentTime < panelInStart) {
        // Before animation starts - panel hidden
        panelProgress = 0;
    } else if (currentTime < panelInEnd) {
        // Swipe in animation
        const t = (currentTime - panelInStart) / PANEL_ANIMATION_DURATION;
        panelProgress = cubicBezier(t, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
    } else if (currentTime < panelOutStart) {
        // Fully visible
        panelProgress = 1;
    } else if (currentTime < panelOutEnd) {
        // Swipe out animation
        const t = (currentTime - panelOutStart) / PANEL_ANIMATION_DURATION;
        panelProgress = 1 - cubicBezier(t, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
    } else {
        // After animation ends - panel hidden
        panelProgress = 0;
    }

    panelProgress = Math.max(0, Math.min(1, panelProgress));

    // Apply clip-path to reveal panel from bottom (grows upward)
    // inset(top right bottom left) - we animate the top inset from 100% to 0%
    const clipTop = (1 - panelProgress) * 100;
    elements.chartContainer.style.clipPath = `inset(${clipTop}% 0 0 0 round 12px)`;

    // Animate title - delayed by 0.2 seconds, start 50px lower (in animation only)
    const titleDelay = 0.2;
    const titleInStart = graphInTime + titleDelay;
    const titleInEnd = titleInStart + PANEL_ANIMATION_DURATION;

    let titleProgress = 0;
    if (currentTime < titleInStart) {
        titleProgress = 0;
    } else if (currentTime < titleInEnd) {
        const t = (currentTime - titleInStart) / PANEL_ANIMATION_DURATION;
        titleProgress = cubicBezier(t, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
    } else {
        titleProgress = 1;
    }
    titleProgress = Math.max(0, Math.min(1, titleProgress));

    const titleOffset = (1 - titleProgress) * 50;
    elements.chartTitle.style.transform = `translateY(${titleOffset}px)`;

    // Animate subtitle - delayed by 0.4 seconds (0.2 + 0.2), start 50px lower (in animation only)
    const subtitleDelay = 0.4;
    const subtitleInStart = graphInTime + subtitleDelay;
    const subtitleInEnd = subtitleInStart + PANEL_ANIMATION_DURATION;

    let subtitleProgress = 0;
    if (currentTime < subtitleInStart) {
        subtitleProgress = 0;
    } else if (currentTime < subtitleInEnd) {
        const t = (currentTime - subtitleInStart) / PANEL_ANIMATION_DURATION;
        subtitleProgress = cubicBezier(t, PANEL_EASING.cp1x, PANEL_EASING.cp1y, PANEL_EASING.cp2x, PANEL_EASING.cp2y);
    } else {
        subtitleProgress = 1;
    }
    subtitleProgress = Math.max(0, Math.min(1, subtitleProgress));

    const subtitleOffset = (1 - subtitleProgress) * 50;
    elements.chartSubtitle.style.transform = `translateY(${subtitleOffset}px)`;

    // Bar animation (uses user-defined easing from the curve editor)
    // Bars animate 0.5 seconds after graphInTime
    const barAnimationDelay = 0.5; // 0.5 seconds after graphInTime
    const barInStart = graphInTime + barAnimationDelay;
    const barAnimationDuration = 1; // 1 second for bar animation

    let barProgress = 0;
    if (currentTime < barInStart) {
        barProgress = 0;
    } else if (currentTime < barInStart + barAnimationDuration) {
        barProgress = (currentTime - barInStart) / barAnimationDuration;
    } else if (currentTime < graphOutTime) {
        barProgress = 1;
    } else {
        barProgress = 1 - ((currentTime - graphOutTime) / (state.totalDuration - graphOutTime));
    }

    barProgress = Math.max(0, Math.min(1, barProgress));
    barProgress = cubicBezier(barProgress, state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);

    const originalData = getYAxisData();
    state.chart.data.datasets[0].data = originalData.map(val => val * barProgress);
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

let isExporting = false;

// Show export progress
function showExportProgress(message, percent = null) {
    let progressEl = document.getElementById('exportProgress');

    if (!progressEl) {
        progressEl = document.createElement('div');
        progressEl.id = 'exportProgress';
        progressEl.style.cssText = `
            position: fixed;
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            background: rgba(3, 16, 55, 0.95);
            color: white;
            padding: 30px 50px;
            border-radius: 12px;
            z-index: 10000;
            text-align: center;
            font-family: 'Roobert VRT', sans-serif;
            min-width: 300px;
        `;
        document.body.appendChild(progressEl);
    }

    let html = `<div style="margin-bottom: 15px; font-size: 16px;">${message}</div>`;
    if (percent !== null) {
        html += `
            <div style="background: rgba(255,255,255,0.2); border-radius: 10px; height: 20px; overflow: hidden;">
                <div style="background: #5541F0; height: 100%; width: ${percent}%; transition: width 0.3s;"></div>
            </div>
            <div style="margin-top: 10px; font-size: 14px;">${Math.round(percent)}%</div>
        `;
    }
    progressEl.innerHTML = html;
}

function hideExportProgress() {
    const progressEl = document.getElementById('exportProgress');
    if (progressEl) {
        progressEl.remove();
    }
}

// Capture single frame with proper glass effect
async function captureFrame(withAlpha = false) {
    try {
        if (typeof html2canvas === 'undefined') {
            return elements.chartCanvas;
        }

        const containerRect = elements.chartContainer.getBoundingClientRect();
        const previewRect = elements.previewArea.getBoundingClientRect();
        const scaleX = 1920 / previewRect.width;
        const scaleY = 1080 / previewRect.height;
        const panelX = (containerRect.left - previewRect.left) * scaleX;
        const panelY = (containerRect.top - previewRect.top) * scaleY;
        const panelWidth = containerRect.width * scaleX;
        const panelHeight = containerRect.height * scaleY;
        const borderRadius = 12 * scaleX;

        if (withAlpha) {
            // MOV + alpha: transparent background with glass panel
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1920;
            canvas.height = 1080;

            // Draw semi-transparent white panel
            ctx.beginPath();
            ctx.roundRect(panelX, panelY, panelWidth, panelHeight, borderRadius);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();

            // Capture and draw chart content
            const chartCanvas = await html2canvas(elements.chartContainer, {
                scale: 1920 / elements.chartContainer.offsetWidth,
                backgroundColor: null,
                useCORS: true,
                allowTaint: true
            });

            ctx.drawImage(chartCanvas, panelX, panelY, panelWidth, panelHeight);
            return canvas;
        } else {
            // MP4: full frame with background and glass effect
            const bgCanvas = await captureBackground();
            const { canvas: glassCanvas } = await createGlassEffect(bgCanvas, containerRect, previewRect);

            // Capture chart content
            const chartCanvas = await html2canvas(elements.chartContainer, {
                scale: 1920 / elements.chartContainer.offsetWidth,
                backgroundColor: null,
                useCORS: true,
                allowTaint: true
            });

            // Draw chart on glass
            const ctx = glassCanvas.getContext('2d');
            ctx.drawImage(chartCanvas, panelX, panelY, panelWidth, panelHeight);

            return glassCanvas;
        }
    } catch (error) {
        console.error('Frame capture failed:', error);
        return elements.chartCanvas;
    }
}

// Export video with WebCodecs + mp4-muxer
async function exportVideo(format) {
    if (isExporting) {
        alert('Export is al bezig. Even geduld.');
        return;
    }

    // Check WebCodecs support
    if (typeof VideoEncoder === 'undefined') {
        alert('Je browser ondersteunt geen video encoding. Gebruik Chrome of Edge.');
        return;
    }

    // MOV+alpha not supported with WebCodecs (no ProRes encoder)
    if (format === 'mov-alpha') {
        alert('MOV + alpha export is niet beschikbaar in de browser. Gebruik MP4 of PNG export.');
        return;
    }

    isExporting = true;
    showExportProgress('Video voorbereiden...', 0);

    try {
        const fps = 25;
        const totalSeconds = state.totalDuration;
        const totalFrames = Math.floor(fps * totalSeconds);
        const videoWidth = 1920;
        const videoHeight = 1080;

        // Save current state
        const savedFrame = state.currentFrame;
        const wasPlaying = state.isPlaying;
        if (wasPlaying) {
            togglePlayback();
        }

        // Initialize mp4-muxer
        const { Muxer, ArrayBufferTarget } = Mp4Muxer;
        const target = new ArrayBufferTarget();
        const muxer = new Muxer({
            target,
            video: {
                codec: 'avc',
                width: videoWidth,
                height: videoHeight
            },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset'
        });

        // Initialize VideoEncoder
        let encodedFrames = 0;
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => {
                muxer.addVideoChunk(chunk, meta);
                encodedFrames++;
            },
            error: e => {
                console.error('Encoder error:', e);
                throw e;
            }
        });

        videoEncoder.configure({
            codec: 'avc1.640033',
            width: videoWidth,
            height: videoHeight,
            bitrate: 15_000_000,
            framerate: fps
        });

        showExportProgress('Frames opnemen en encoderen...', 0);

        // Create offscreen canvas for rendering
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoWidth;
        tempCanvas.height = videoHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Capture and encode frames
        for (let i = 0; i < totalFrames; i++) {
            // Update animation state
            state.currentFrame = Math.floor((i / totalFrames) * getTotalFrames());
            updateTimelineDisplay();
            animateChart();

            // Wait for render
            await new Promise(r => requestAnimationFrame(r));

            // Capture frame
            const frameCanvas = await captureFrame(false);

            // Draw to temp canvas at exact output size
            tempCtx.drawImage(frameCanvas, 0, 0, videoWidth, videoHeight);

            // Create VideoFrame and encode
            const frame = new VideoFrame(tempCanvas, {
                timestamp: (i * 1_000_000) / fps
            });

            const keyFrame = i % 60 === 0; // Keyframe every 60 frames
            videoEncoder.encode(frame, { keyFrame });
            frame.close();

            // Update progress
            const percent = (i / totalFrames) * 90;
            showExportProgress(`Frames verwerken... (${i + 1}/${totalFrames})`, percent);
        }

        // Wait for encoder to finish
        await videoEncoder.flush();
        videoEncoder.close();

        showExportProgress('Video finaliseren...', 95);

        // Finalize muxer
        muxer.finalize();

        // Create download
        const videoBlob = new Blob([target.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(videoBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vrt-graphic.mp4';
        link.click();

        // Cleanup
        URL.revokeObjectURL(url);

        // Restore state
        state.currentFrame = savedFrame;
        updateTimelineDisplay();
        animateChart();

        hideExportProgress();

        if (wasPlaying) {
            togglePlayback();
        }

    } catch (error) {
        console.error('Export failed:', error);
        alert(`Export mislukt: ${error.message}`);
        hideExportProgress();
    }

    isExporting = false;
}

// Capture background (image or video frame) to canvas
async function captureBackground() {
    return new Promise((resolve) => {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = 1920;
        canvas.height = 1080;

        // Check for video background
        const bgVideo = elements.previewBackground.querySelector('video');
        if (bgVideo && bgVideo.readyState >= 2) {
            // Draw video frame
            ctx.drawImage(bgVideo, 0, 0, 1920, 1080);
            resolve(canvas);
            return;
        }

        // Check for image background
        const bgStyle = elements.previewBackground.style.backgroundImage;
        if (bgStyle && bgStyle !== 'none' && bgStyle !== '') {
            const urlMatch = bgStyle.match(/url\(["']?([^"']+)["']?\)/);
            if (urlMatch) {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => {
                    ctx.drawImage(img, 0, 0, 1920, 1080);
                    resolve(canvas);
                };
                img.onerror = () => {
                    ctx.fillStyle = '#000000';
                    ctx.fillRect(0, 0, 1920, 1080);
                    resolve(canvas);
                };
                img.src = urlMatch[1];
                return;
            }
        }

        // No background - fill with black
        ctx.fillStyle = '#000000';
        ctx.fillRect(0, 0, 1920, 1080);
        resolve(canvas);
    });
}

// Create blurred glass panel effect manually
async function createGlassEffect(backgroundCanvas, containerRect, previewRect) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    // Calculate panel position in 1920x1080 space
    const scaleX = 1920 / previewRect.width;
    const scaleY = 1080 / previewRect.height;
    const panelX = (containerRect.left - previewRect.left) * scaleX;
    const panelY = (containerRect.top - previewRect.top) * scaleY;
    const panelWidth = containerRect.width * scaleX;
    const panelHeight = containerRect.height * scaleY;
    const borderRadius = 12 * scaleX;

    // Draw background
    ctx.drawImage(backgroundCanvas, 0, 0);

    // Create clipping path for rounded rectangle
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, borderRadius);
    ctx.clip();

    // Draw blurred background in panel area
    ctx.filter = 'blur(20px)';
    ctx.drawImage(backgroundCanvas, 0, 0);
    ctx.filter = 'none';

    // Draw semi-transparent white overlay
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.restore();

    return { canvas, panelX, panelY, panelWidth, panelHeight };
}

// Main export handler
async function handleExport(format) {
    // Video formats use WebCodecs + mp4-muxer
    if (['mp4-audio', 'mp4-noaudio', 'mov-alpha'].includes(format)) {
        await exportVideo(format);
        return;
    }

    // Image formats
    if (typeof html2canvas === 'undefined') {
        const link = document.createElement('a');
        link.download = 'vrt-chart.png';
        link.href = elements.chartCanvas.toDataURL('image/png');
        link.click();
        return;
    }

    const containerRect = elements.chartContainer.getBoundingClientRect();
    const previewRect = elements.previewArea.getBoundingClientRect();

    if (format === 'jpg') {
        try {
            // Capture background
            const bgCanvas = await captureBackground();

            // Create glass effect
            const { canvas: glassCanvas, panelX, panelY, panelWidth, panelHeight } =
                await createGlassEffect(bgCanvas, containerRect, previewRect);

            // Capture chart content (without background)
            const chartCanvas = await html2canvas(elements.chartContainer, {
                scale: 1920 / elements.chartContainer.offsetWidth,
                backgroundColor: null,
                useCORS: true,
                allowTaint: true
            });

            // Draw chart content on top of glass effect
            const ctx = glassCanvas.getContext('2d');
            ctx.drawImage(chartCanvas, panelX, panelY, panelWidth, panelHeight);

            const link = document.createElement('a');
            link.download = 'vrt-graphic.jpg';
            link.href = glassCanvas.toDataURL('image/jpeg', 0.95);
            link.click();
        } catch (error) {
            console.error('JPG export failed:', error);
            alert('JPG export mislukt: ' + error.message);
        }
    } else if (format === 'png') {
        try {
            // PNG: Chart with glass effect but transparent outside the panel
            const canvas = document.createElement('canvas');
            const ctx = canvas.getContext('2d');
            canvas.width = 1920;
            canvas.height = 1080;

            const scaleX = 1920 / previewRect.width;
            const scaleY = 1080 / previewRect.height;
            const panelX = (containerRect.left - previewRect.left) * scaleX;
            const panelY = (containerRect.top - previewRect.top) * scaleY;
            const panelWidth = containerRect.width * scaleX;
            const panelHeight = containerRect.height * scaleY;
            const borderRadius = 12 * scaleX;

            // Draw semi-transparent white panel with rounded corners
            ctx.beginPath();
            ctx.roundRect(panelX, panelY, panelWidth, panelHeight, borderRadius);
            ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
            ctx.fill();

            // Capture and draw chart content
            const chartCanvas = await html2canvas(elements.chartContainer, {
                scale: 1920 / elements.chartContainer.offsetWidth,
                backgroundColor: null,
                useCORS: true,
                allowTaint: true
            });

            ctx.drawImage(chartCanvas, panelX, panelY, panelWidth, panelHeight);

            const link = document.createElement('a');
            link.download = 'vrt-graphic.png';
            link.href = canvas.toDataURL('image/png');
            link.click();
        } catch (error) {
            console.error('PNG export failed:', error);
            alert('PNG export mislukt: ' + error.message);
        }
    }
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

    // Region/Mono changes - force logo reload
    elements.partyRegion.addEventListener('change', async () => {
        await loadLogos();
        state.chart?.update();
        updateLogoPositions();
    });
    elements.monoLogos.addEventListener('change', async () => {
        await loadLogos();
        state.chart?.update();
        updateLogoPositions();
    });

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

    // Data file import
    elements.importArea.addEventListener('click', () => elements.dataFileInput.click());
    elements.dataFileInput.addEventListener('change', e => handleDataFileImport(e.target.files[0]));

    // Drag and drop for import
    elements.importArea.addEventListener('dragover', e => {
        e.preventDefault();
        elements.importArea.style.opacity = '0.5';
    });
    elements.importArea.addEventListener('dragleave', () => {
        elements.importArea.style.opacity = '1';
    });
    elements.importArea.addEventListener('drop', e => {
        e.preventDefault();
        elements.importArea.style.opacity = '1';
        handleDataFileImport(e.dataTransfer.files[0]);
    });

    // Delete buttons for uploaded files
    elements.uploadFileDelete.addEventListener('click', clearUploadedFile);
    elements.importFileDelete.addEventListener('click', clearImportedFile);

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
    let timelineDragging = false;

    function updateTimelinePosition(e) {
        const rect = timelineTrack.getBoundingClientRect();
        const percent = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
        state.currentFrame = Math.floor(percent * getTotalFrames());
        updateTimelineDisplay();
        animateChart();

        // Sync background video position
        const bgVideo = elements.previewBackground.querySelector('video');
        if (bgVideo) {
            bgVideo.currentTime = percent * state.totalDuration;
        }
    }

    timelineTrack.addEventListener('mousedown', e => {
        timelineDragging = true;
        updateTimelinePosition(e);
        elements.timelineThumb.style.cursor = 'grabbing';
    });

    document.addEventListener('mousemove', e => {
        if (timelineDragging) {
            updateTimelinePosition(e);
        }
    });

    document.addEventListener('mouseup', () => {
        if (timelineDragging) {
            timelineDragging = false;
            elements.timelineThumb.style.cursor = 'grab';
        }
    });

    // Touch support for timeline
    timelineTrack.addEventListener('touchstart', e => {
        timelineDragging = true;
        updateTimelinePosition({ clientX: e.touches[0].clientX });
    }, { passive: true });

    document.addEventListener('touchmove', e => {
        if (timelineDragging) {
            updateTimelinePosition({ clientX: e.touches[0].clientX });
        }
    }, { passive: true });

    document.addEventListener('touchend', () => {
        timelineDragging = false;
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
    updateTotalTimeDisplay();
    updateTimelineDisplay();
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', () => {
    state.chart?.resize();
    initEasingCanvas();
});
