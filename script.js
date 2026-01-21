// VRT Data Graphics Generator

const MAX_BARS = 30, BASE_WIDTH = 1920, BASE_HEIGHT = 1080, BASE_PANEL_WIDTH = 88, DEBOUNCE_DELAY = 150;

function debounce(func, wait) {
    let timeout;
    return (...args) => {
        clearTimeout(timeout);
        timeout = setTimeout(() => func(...args), wait);
    };
}

function scheduleUpdate(callback) {
    requestAnimationFrame(() => requestAnimationFrame(callback));
}

const state = {
    chart: null, scaleFactor: 1, isPlaying: false, currentFrame: 0, totalDuration: 20,
    animationId: null, highlightedBars: new Set([5]), logoImages: {}, uploadedFile: null,
    logoSettings: { region: '', mono: false, labels: [] },
    easingPoints: { cp1x: 0.90, cp1y: 0.00, cp2x: 0.30, cp2y: 1.00 },
    barTimings: [], lastGraphInTime: 1
};

let elements = null;

function cacheElements() {
    const $ = id => document.getElementById(id);
    elements = {
        chartType: $('chartType'), position: $('position'), panelWidth: $('panelWidth'), barWidth: $('barWidth'),
        primaryColor: $('primaryColor'), secondaryColor: $('secondaryColor'), highlightColor: $('highlightColor'),
        showText: $('showText'), showLogos: $('showLogos'), logoOptions: $('logoOptions'),
        partyRegion: $('partyRegion'), monoLogos: $('monoLogos'),
        uploadArea: $('uploadArea'), fileInput: $('fileInput'),
        graphIn: $('graphIn'), graphOut: $('graphOut'),
        previewArea: $('previewArea'), previewBackground: $('previewBackground'),
        chartCanvas: $('chartCanvas'), chartTitle: $('chartTitle'),
        chartSubtitle: $('chartSubtitle'), chartSource: $('chartSource'),
        chartContainer: null, chartWrapper: null,
        titleInput: $('titleInput'), subtitleInput: $('subtitleInput'),
        sourceInput: $('sourceInput'), xAxisInput: $('xAxisInput'), yAxisInput: $('yAxisInput'),
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

function getXAxisLabels() {
    return elements.xAxisInput.value.split(',').map(s => s.trim()).filter(Boolean).slice(0, MAX_BARS);
}

function getYAxisData() {
    return elements.yAxisInput.value.split(',').map(s => parseFloat(s.trim()) || 0).slice(0, MAX_BARS);
}

function getBarColors() {
    const primary = elements.primaryColor.dataset.color;
    const highlight = elements.highlightColor.dataset.color;
    return getXAxisLabels().map((_, i) => state.highlightedBars.has(i) ? highlight : primary);
}

function updateScaleFactor() {
    const rect = elements.previewArea.getBoundingClientRect();
    state.scaleFactor = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
}

function applyScaling() {
    const s = state.scaleFactor, c = elements.chartContainer;
    const scale = (v) => `${Math.round(v * s)}px`;
    c.style.setProperty('--title-size', scale(70));
    c.style.setProperty('--subtitle-size', scale(50));
    c.style.setProperty('--source-size', scale(24));
    c.style.setProperty('--padding-v', scale(30));
    c.style.setProperty('--padding-h', scale(50));
    c.style.setProperty('--spacing-sm', scale(8));
    if (state.chart) {
        const tickSize = Math.round(30 * s), barRadius = Math.round(12 * s), tickPadding = Math.round(15 * s);
        state.chart.options.scales.x.ticks.font.size = state.chart.options.scales.y.ticks.font.size = tickSize;
        state.chart.options.scales.x.ticks.padding = state.chart.options.scales.y.ticks.padding = tickPadding;
        state.chart.data.datasets[0].borderRadius = { topLeft: barRadius, topRight: barRadius, bottomLeft: 0, bottomRight: 0 };
    }
}

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
                borderRadius: { topLeft: 12, topRight: 12, bottomLeft: 0, bottomRight: 0 },
                borderSkipped: false,
                barPercentage: 0.35,
                categoryPercentage: 0.9
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: { duration: 0 },
            layout: {
                padding: {
                    left: 20,
                    right: 40,
                    top: 20,
                    bottom: 10
                }
            },
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
                        color: '#000000',
                        font: { size: 18, family: 'Roobert VRT', weight: '400' },
                        padding: 15
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 50,
                    border: { display: false },
                    grid: {
                        color: 'rgba(0, 0, 0, 0.15)',
                        lineWidth: 1,
                        drawTicks: false
                    },
                    ticks: {
                        color: '#000000',
                        font: { size: 18, family: 'Roobert VRT', weight: '400' },
                        padding: 15,
                        count: 6,
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

    chart.data.labels = getXAxisLabels();
    chart.data.datasets[0].data = getYAxisData();
    chart.data.datasets[0].backgroundColor = getBarColors();

    const maxValue = Math.max(...getYAxisData(), 0);
    if (chart.options.scales?.y) {
        // Calculate nice step size (10, 20, 50, 100, 200, 500...) for 6 ticks
        const rawStep = (maxValue * 1.1) / 5;
        const magnitude = Math.pow(10, Math.floor(Math.log10(rawStep || 1)));
        const residual = rawStep / magnitude;
        const niceStep = residual <= 1 ? magnitude : residual <= 2 ? 2 * magnitude : residual <= 5 ? 5 * magnitude : 10 * magnitude;
        chart.options.scales.y.max = Math.max(niceStep * 5, 50);
    }

    chart.update(mode === 'none' ? 'none' : undefined);
    if (!skipLogoUpdate && elements.showLogos.checked) scheduleUpdate(updateLogoPositions);
    updateBarTimingMarkers();
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

    state.logoSettings = { region: elements.partyRegion.value, mono: elements.monoLogos.checked, labels: labels.join(',') };
    state.logoImages = {};
    await Promise.all(labels.map(label =>
        new Promise(resolve => {
            const img = new Image();
            img.crossOrigin = 'anonymous';
            img.onload = () => {
                try {
                    const tempCanvas = document.createElement('canvas');
                    tempCanvas.width = img.naturalWidth;
                    tempCanvas.height = img.naturalHeight;
                    const ctx = tempCanvas.getContext('2d');
                    ctx.drawImage(img, 0, 0);
                    const dataUrl = tempCanvas.toDataURL('image/png');

                    // Create new image from data URL
                    const safeImg = new Image();
                    safeImg.onload = () => {
                        state.logoImages[label] = safeImg;
                        resolve();
                    };
                    safeImg.src = dataUrl;
                } catch (e) { state.logoImages[label] = img; resolve(); }
            };
            img.onerror = () => {
                const imgLocal = new Image();
                imgLocal.onload = () => { state.logoImages[label] = imgLocal; resolve(); };
                imgLocal.onerror = () => { state.logoImages[label] = null; resolve(); };
                imgLocal.src = getLogoPath(label);
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
    const canvasOffset = elements.chartCanvas.offsetLeft;

    const container = document.createElement('div');
    container.id = 'xAxisLogos';
    container.style.cssText = `position:absolute;left:0;right:0;top:${chartArea.bottom + 10 * scaleFactor}px;height:${logoSize}px;pointer-events:none;z-index:10`;

    labels.forEach((label, index) => {
        const xPos = xScale.getPixelForValue(index) + canvasOffset;
        const wrapper = document.createElement('div');
        wrapper.style.cssText = `position:absolute;left:${xPos}px;top:0;transform:translateX(-50%);display:flex;justify-content:center;align-items:center;width:${logoSize}px;height:${logoSize}px`;

        if (state.logoImages[label]) {
            const img = document.createElement('img');
            img.src = state.logoImages[label].src;
            img.style.cssText = `max-height:${logoSize}px;max-width:${logoSize}px;object-fit:contain`;
            wrapper.appendChild(img);
        } else {
            const text = document.createElement('span');
            text.textContent = label;
            text.style.cssText = `font-size:${12 * scaleFactor}px;color:#666;font-family:'Roobert VRT',sans-serif;text-align:center`;
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

function updateTitles() {
    elements.chartTitle.textContent = elements.titleInput.value || 'Titel';
    elements.chartSubtitle.textContent = elements.subtitleInput.value || 'Subtitel';
    elements.chartSource.textContent = elements.sourceInput.value
        ? 'bron: ' + elements.sourceInput.value
        : '';
}

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

const MAX_FILE_SIZE = 100 * 1024 * 1024;

function handleFileUpload(file) {
    if (!file) return;
    if (file.size > MAX_FILE_SIZE) {
        alert(`Bestand is te groot. Maximum grootte is 100MB. Uw bestand is ${(file.size / (1024 * 1024)).toFixed(1)}MB.`);
        return;
    }

    const isVideo = file.type.startsWith('video/') || ['.mp4', '.mov', '.avi', '.mxf'].some(ext => file.name.toLowerCase().endsWith(ext));
    state.uploadedFile = isVideo ? file : null;
    elements.previewBackground.style.backgroundImage = '';
    elements.previewBackground.innerHTML = '';

    if (isVideo) {
        const video = document.createElement('video');
        video.src = URL.createObjectURL(file);
        video.autoplay = video.loop = false;
        video.muted = video.playsInline = true;
        video.addEventListener('loadedmetadata', () => {
            if (video.duration && isFinite(video.duration)) {
                state.totalDuration = video.duration;
                state.currentFrame = 0;
                updateTotalTimeDisplay();
                updateTimelineDisplay();
                initializeBarTimings();
                animateChart();
            }
        });
        elements.previewBackground.appendChild(video);
    } else {
        state.totalDuration = 20;
        state.currentFrame = 0;
        updateTotalTimeDisplay();
        updateTimelineDisplay();
        initializeBarTimings();
        const reader = new FileReader();
        reader.onload = e => { elements.previewBackground.style.backgroundImage = `url(${e.target.result})`; };
        reader.readAsDataURL(file);
    }

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
    state.uploadedFile = null;
    state.totalDuration = 20;
    state.currentFrame = 0;
    updateTotalTimeDisplay();
    updateTimelineDisplay();
    initializeBarTimings();
}

function updateTotalTimeDisplay() {
    const minutes = Math.floor(state.totalDuration / 60);
    const seconds = Math.floor(state.totalDuration % 60);
    elements.totalTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

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

let easingDragging = null;

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

    // Easing input field - allow manual value entry
    elements.easingValues.addEventListener('input', handleEasingInput);
    elements.easingValues.addEventListener('blur', () => {
        // On blur, reformat the value and redraw
        const parsed = parseEasingInput(elements.easingValues.value);
        if (parsed) {
            state.easingPoints = parsed;
        }
        drawEasingCurve();
    });

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

    // Update values display (only if not focused, to avoid overwriting user input)
    if (document.activeElement !== elements.easingValues) {
        elements.easingValues.value = `${cp1x.toFixed(2)}, ${cp1y.toFixed(2)}, ${cp2x.toFixed(2)}, ${cp2y.toFixed(2)}`;
    }
}

function parseEasingInput(value) {
    const parts = value.replace(/\s/g, '').split(',');
    if (parts.length !== 4) return null;
    const nums = parts.map(p => parseFloat(p));
    if (nums.some(isNaN)) return null;
    return { cp1x: Math.max(0, Math.min(1, nums[0])), cp1y: nums[1], cp2x: Math.max(0, Math.min(1, nums[2])), cp2y: nums[3] };
}

function handleEasingInput(e) {
    const parsed = parseEasingInput(e.target.value);
    if (parsed) {
        state.easingPoints = parsed;
        drawEasingCurve();
    }
}

function togglePlayback() {
    state.isPlaying = !state.isPlaying;
    const bgVideo = elements.previewBackground.querySelector('video');

    if (state.isPlaying) {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        if (bgVideo) {
            bgVideo.currentTime = (state.currentFrame / getTotalFrames()) * state.totalDuration;
            bgVideo.play();
        }
        animate();
    } else {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        cancelAnimationFrame(state.animationId);
        if (bgVideo) bgVideo.pause();
    }
}

function animate() {
    if (!state.isPlaying) return;
    const totalFrames = getTotalFrames();
    const bgVideo = elements.previewBackground.querySelector('video');

    if (bgVideo && !bgVideo.paused) {
        state.currentFrame = Math.floor((bgVideo.currentTime / state.totalDuration) * totalFrames);
        if (bgVideo.ended || bgVideo.currentTime >= state.totalDuration) {
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

function getTotalFrames() { return Math.floor(state.totalDuration * 60); }

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

const BAR_ANIMATION_DURATION = 0.5;
const DEFAULT_STAGGER = 0.15;

function initializeBarTimings() {
    const labels = getXAxisLabels();
    const graphInTime = parseFloat(elements.graphIn.value) || 1;
    state.lastGraphInTime = graphInTime;
    state.barTimings = labels.map((_, i) => graphInTime + 0.5 + i * DEFAULT_STAGGER);
    updateBarTimingMarkers();
}

function updateBarTimingMarkers() {
    if (!elements.barTimingMarkers) return;

    const labels = getXAxisLabels();
    const colors = getBarColors();

    // Ensure barTimings array matches data length
    while (state.barTimings.length < labels.length) {
        const lastTiming = state.barTimings.length > 0
            ? state.barTimings[state.barTimings.length - 1] + DEFAULT_STAGGER
            : (parseInt(elements.graphIn.value) || 1) + 0.5;
        state.barTimings.push(lastTiming);
    }
    state.barTimings = state.barTimings.slice(0, labels.length);

    // Clear existing markers
    elements.barTimingMarkers.innerHTML = '';

    // Create markers for each bar
    labels.forEach((label, index) => {
        const marker = document.createElement('div');
        marker.className = 'bar-timing-marker';
        marker.dataset.index = index;

        // Position based on timing
        const percent = (state.barTimings[index] / state.totalDuration) * 100;
        marker.style.left = `${Math.max(0, Math.min(100, percent))}%`;

        // Color to match bar (if available)
        const color = colors[index] || '#00BEAA';
        marker.style.backgroundColor = color;

        // Tooltip
        const tooltip = document.createElement('div');
        tooltip.className = 'bar-timing-marker-tooltip';
        tooltip.textContent = `${label}: ${state.barTimings[index].toFixed(2)}s`;
        marker.appendChild(tooltip);

        // Make draggable
        setupMarkerDrag(marker, index);

        elements.barTimingMarkers.appendChild(marker);
    });
}

function handleGraphInChange() {
    const newGraphInTime = parseFloat(elements.graphIn.value) || 1;
    const delta = newGraphInTime - state.lastGraphInTime;
    if (delta !== 0 && state.barTimings.length > 0) {
        state.barTimings = state.barTimings.map(t => t + delta);
        updateBarTimingMarkers();
    }
    state.lastGraphInTime = newGraphInTime;
}

function setupMarkerDrag(marker, index) {
    let isDragging = false;
    let startX = 0;
    let startLeft = 0;

    const onMouseDown = (e) => {
        e.preventDefault();
        e.stopPropagation();
        isDragging = true;
        startX = e.clientX;
        startLeft = parseFloat(marker.style.left) || 0;
        marker.style.cursor = 'grabbing';
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    };

    const onMouseMove = (e) => {
        if (!isDragging) return;

        const trackRect = elements.timelineTrack.getBoundingClientRect();
        const deltaX = e.clientX - startX;
        const deltaPercent = (deltaX / trackRect.width) * 100;
        let newLeft = startLeft + deltaPercent;

        // Clamp to valid range
        newLeft = Math.max(0, Math.min(100, newLeft));

        marker.style.left = `${newLeft}%`;

        // Update timing
        const newTiming = (newLeft / 100) * state.totalDuration;
        state.barTimings[index] = newTiming;

        // Update tooltip
        const tooltip = marker.querySelector('.bar-timing-marker-tooltip');
        const labels = getXAxisLabels();
        if (tooltip && labels[index]) {
            tooltip.textContent = `${labels[index]}: ${newTiming.toFixed(2)}s`;
        }
    };

    const onMouseUp = () => {
        isDragging = false;
        marker.style.cursor = 'grab';
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    };

    marker.addEventListener('mousedown', onMouseDown);

    // Touch support
    marker.addEventListener('touchstart', (e) => {
        e.preventDefault();
        const touch = e.touches[0];
        startX = touch.clientX;
        startLeft = parseFloat(marker.style.left) || 0;
        isDragging = true;

        const onTouchMove = (e) => {
            if (!isDragging) return;
            const touch = e.touches[0];
            const trackRect = elements.timelineTrack.getBoundingClientRect();
            const deltaX = touch.clientX - startX;
            const deltaPercent = (deltaX / trackRect.width) * 100;
            let newLeft = startLeft + deltaPercent;
            newLeft = Math.max(0, Math.min(100, newLeft));
            marker.style.left = `${newLeft}%`;
            state.barTimings[index] = (newLeft / 100) * state.totalDuration;

            const tooltip = marker.querySelector('.bar-timing-marker-tooltip');
            const labels = getXAxisLabels();
            if (tooltip && labels[index]) {
                tooltip.textContent = `${labels[index]}: ${state.barTimings[index].toFixed(2)}s`;
            }
        };

        const onTouchEnd = () => {
            isDragging = false;
            document.removeEventListener('touchmove', onTouchMove);
            document.removeEventListener('touchend', onTouchEnd);
        };

        document.addEventListener('touchmove', onTouchMove);
        document.addEventListener('touchend', onTouchEnd);
    });
}

const PANEL_EASING = { cp1x: 0.00, cp1y: 0.90, cp2x: 0.30, cp2y: 1.00 };
const PANEL_ANIMATION_DURATION = 0.5;

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
    // Each bar has its own timing from state.barTimings
    const originalData = getYAxisData();

    // Ensure barTimings array is initialized
    if (state.barTimings.length === 0 || state.barTimings.length !== originalData.length) {
        initializeBarTimings();
    }

    // Calculate progress for each bar individually
    const animatedData = originalData.map((val, index) => {
        const barStartTime = state.barTimings[index] || (graphInTime + 0.5 + index * DEFAULT_STAGGER);

        let barProgress = 0;
        if (currentTime < barStartTime) {
            // Before this bar starts
            barProgress = 0;
        } else if (currentTime < barStartTime + BAR_ANIMATION_DURATION) {
            // During this bar's animation
            barProgress = (currentTime - barStartTime) / BAR_ANIMATION_DURATION;
        } else if (currentTime < graphOutTime) {
            // Fully visible
            barProgress = 1;
        } else {
            // After graphOut - all bars animate out together
            barProgress = 1 - ((currentTime - graphOutTime) / PANEL_ANIMATION_DURATION);
        }

        barProgress = Math.max(0, Math.min(1, barProgress));
        barProgress = cubicBezier(barProgress, state.easingPoints.cp1x, state.easingPoints.cp1y, state.easingPoints.cp2x, state.easingPoints.cp2y);

        return val * barProgress;
    });

    state.chart.data.datasets[0].data = animatedData;
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

let isExporting = false;

function showExportProgress(message, percent = null) {
    let progressEl = document.getElementById('exportProgress');
    if (!progressEl) {
        progressEl = document.createElement('div');
        progressEl.id = 'exportProgress';
        progressEl.style.cssText = 'position:fixed;top:50%;left:50%;transform:translate(-50%,-50%);background:rgba(3,16,55,0.95);color:white;padding:30px 50px;border-radius:12px;z-index:10000;text-align:center;font-family:"Roobert VRT",sans-serif;min-width:300px';
        document.body.appendChild(progressEl);
    }
    let html = `<div style="margin-bottom:15px;font-size:16px">${message}</div>`;
    if (percent !== null) html += `<div style="background:rgba(255,255,255,0.2);border-radius:10px;height:20px;overflow:hidden"><div style="background:#5541F0;height:100%;width:${percent}%;transition:width 0.3s"></div></div><div style="margin-top:10px;font-size:14px">${Math.round(percent)}%</div>`;
    progressEl.innerHTML = html;
}

function hideExportProgress() {
    document.getElementById('exportProgress')?.remove();
}

async function captureFrame(withAlpha = false) {
    try {
        const outputWidth = 1920, outputHeight = 1080;
        const previewRect = elements.previewArea.getBoundingClientRect();
        const scaleX = outputWidth / previewRect.width, scaleY = outputHeight / previewRect.height;
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        canvas.width = outputWidth;
        canvas.height = outputHeight;

        const bgCanvas = !withAlpha ? await captureBackground() : null;
        if (bgCanvas) ctx.drawImage(bgCanvas, 0, 0);

        const containerRect = elements.chartContainer.getBoundingClientRect();
        const panelX = (containerRect.left - previewRect.left) * scaleX;
        const panelY = (containerRect.top - previewRect.top) * scaleY;
        const panelWidth = containerRect.width * scaleX;
        const panelHeight = containerRect.height * scaleY;

        const clipMatch = (elements.chartContainer.style.clipPath || '').match(/inset\(([0-9.]+)%/);
        const clipTopPercent = clipMatch ? parseFloat(clipMatch[1]) : 0;
        if (clipTopPercent >= 100) return canvas;

        const clipTopPx = (clipTopPercent / 100) * panelHeight;
        const clippedPanelY = panelY + clipTopPx;
        const clippedPanelHeight = panelHeight - clipTopPx;
        const borderRadius = 12 * scaleX;
        if (clippedPanelHeight < 1) return canvas;

        if (bgCanvas) {
            ctx.save();
            ctx.beginPath();
            ctx.roundRect(panelX, clippedPanelY, panelWidth, clippedPanelHeight, borderRadius);
            ctx.clip();
            ctx.filter = 'blur(20px)';
            ctx.drawImage(bgCanvas, 0, 0);
            ctx.filter = 'none';
            ctx.restore();
        }

        const containerCanvas = await html2canvas(elements.chartContainer, {
            backgroundColor: null,
            scale: 2,
            useCORS: true,
            allowTaint: false,
            logging: false,
            onclone: (clonedDoc, clonedElement) => {
                clonedElement.style.clipPath = elements.chartContainer.style.clipPath;
                const clonedTitle = clonedDoc.getElementById('chartTitle');
                const clonedSubtitle = clonedDoc.getElementById('chartSubtitle');
                if (clonedTitle) clonedTitle.style.transform = elements.chartTitle.style.transform;
                if (clonedSubtitle) clonedSubtitle.style.transform = elements.chartSubtitle.style.transform;
            }
        });

        ctx.save();
        ctx.beginPath();
        ctx.roundRect(panelX, clippedPanelY, panelWidth, clippedPanelHeight, borderRadius);
        ctx.clip();
        ctx.drawImage(containerCanvas, panelX, panelY, panelWidth, panelHeight);
        ctx.restore();
        return canvas;
    } catch (error) {
        console.error('Frame capture failed:', error);
        const fallbackCanvas = document.createElement('canvas');
        fallbackCanvas.width = 1920;
        fallbackCanvas.height = 1080;
        const ctx = fallbackCanvas.getContext('2d');
        ctx.fillStyle = '#000';
        ctx.fillRect(0, 0, 1920, 1080);
        ctx.drawImage(elements.chartCanvas, 0, 0, 1920, 1080);
        return fallbackCanvas;
    }
}

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
        const videoWidth = 1920;
        const videoHeight = 1080;

        // Get export range (start/end in seconds)
        const exportStartTime = parseFloat(elements.exportStart.value) || 0;
        const exportEndTime = parseFloat(elements.exportEnd.value) || state.totalDuration;
        const exportDuration = Math.max(0, exportEndTime - exportStartTime);
        const totalFrames = Math.floor(fps * exportDuration);

        if (totalFrames <= 0) {
            alert('Ongeldige export range. Controleer start en einde tijd.');
            isExporting = false;
            hideExportProgress();
            return;
        }

        // Save current state
        const savedFrame = state.currentFrame;
        const wasPlaying = state.isPlaying;
        if (wasPlaying) {
            togglePlayback();
        }

        // Check for audio support
        const includeAudio = format === 'mp4-audio';
        const bgVideo = elements.previewBackground.querySelector('video');
        let audioContext = null;
        let audioBuffer = null;

        // Extract audio from video if needed
        if (includeAudio && state.uploadedFile) {
            showExportProgress('Audio extraheren...', 0);
            try {
                audioContext = new (window.AudioContext || window.webkitAudioContext)();
                const arrayBuffer = await state.uploadedFile.arrayBuffer();
                audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
            } catch (e) { audioBuffer = null; }
        }

        const { Muxer, ArrayBufferTarget } = Mp4Muxer;
        const target = new ArrayBufferTarget();
        const muxerConfig = {
            target,
            video: { codec: 'avc', width: videoWidth, height: videoHeight },
            fastStart: 'in-memory',
            firstTimestampBehavior: 'offset'
        };
        if (audioBuffer) {
            muxerConfig.audio = { codec: 'aac', numberOfChannels: audioBuffer.numberOfChannels, sampleRate: audioBuffer.sampleRate };
        }
        const muxer = new Muxer(muxerConfig);

        let encodedFrames = 0;
        const videoEncoder = new VideoEncoder({
            output: (chunk, meta) => { muxer.addVideoChunk(chunk, meta); encodedFrames++; },
            error: e => { throw e; }
        });
        videoEncoder.configure({ codec: 'avc1.640033', width: videoWidth, height: videoHeight, bitrate: 15_000_000, framerate: fps });

        let audioEncoder = null, audioChunksEncoded = 0, audioCodecUsed = null;
        if (audioBuffer && typeof AudioEncoder !== 'undefined') {
            try {
                const codecsToTry = ['mp4a.40.2', 'aac', 'opus'];
                let supportedConfig = null;
                for (const codec of codecsToTry) {
                    try {
                        const support = await AudioEncoder.isConfigSupported({
                            codec, numberOfChannels: audioBuffer.numberOfChannels,
                            sampleRate: audioBuffer.sampleRate, bitrate: 128000
                        });
                        if (support.supported) {
                            supportedConfig = support.config;
                            audioCodecUsed = codec;
                            break;
                        }
                    } catch (e) {}
                }
                if (supportedConfig) {
                    if (audioCodecUsed === 'opus') supportedConfig = null;
                }
                if (supportedConfig) {
                    audioEncoder = new AudioEncoder({
                        output: (chunk, meta) => { muxer.addAudioChunk(chunk, meta); audioChunksEncoded++; },
                        error: () => {}
                    });
                    audioEncoder.configure(supportedConfig);
                }
            } catch (e) { audioEncoder = null; }
        }

        showExportProgress('Frames opnemen en encoderen...', 0);

        // Create offscreen canvas for rendering
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = videoWidth;
        tempCanvas.height = videoHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Pause video for manual seeking
        if (bgVideo) {
            bgVideo.pause();
        }

        // Capture and encode frames
        for (let i = 0; i < totalFrames; i++) {
            // Update animation state - account for export start time
            const currentExportTime = exportStartTime + (i / fps);
            state.currentFrame = Math.floor((currentExportTime / state.totalDuration) * getTotalFrames());

            // Sync background video to current export time
            if (bgVideo) {
                // Set the time
                bgVideo.currentTime = currentExportTime;

                // Wait for seek to complete AND video to be ready
                await new Promise(resolve => {
                    let resolved = false;
                    const done = () => {
                        if (!resolved) {
                            resolved = true;
                            bgVideo.removeEventListener('seeked', onSeeked);
                            bgVideo.removeEventListener('canplay', onCanPlay);
                            resolve();
                        }
                    };
                    const onSeeked = () => {
                        // After seek, ensure video data is available
                        if (bgVideo.readyState >= 2) {
                            done();
                        }
                    };
                    const onCanPlay = () => done();

                    bgVideo.addEventListener('seeked', onSeeked);
                    bgVideo.addEventListener('canplay', onCanPlay);

                    // If already ready, resolve immediately
                    if (bgVideo.readyState >= 3) {
                        done();
                    }

                    // Timeout fallback
                    setTimeout(done, 150);
                });
            }

            updateTimelineDisplay();
            animateChart();

            // Force chart to render and update DOM
            if (state.chart) {
                state.chart.render();
            }

            // Force layout recalculation
            void elements.chartContainer.offsetHeight;
            void elements.chartTitle.offsetHeight;
            void elements.chartCanvas.offsetHeight;

            // Wait for paint
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

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

        // Wait for video encoder to finish
        await videoEncoder.flush();
        videoEncoder.close();

        // Encode audio if available
        if (audioEncoder && audioBuffer && audioEncoder.state === 'configured') {
            showExportProgress('Audio encoderen...', 92);

            try {
                const sampleRate = audioBuffer.sampleRate;
                const numberOfChannels = audioBuffer.numberOfChannels;

                // Calculate sample range for export
                const startSample = Math.floor(exportStartTime * sampleRate);
                const endSample = Math.min(
                    Math.floor(exportEndTime * sampleRate),
                    audioBuffer.length
                );
                const totalSamples = endSample - startSample;

                console.log('Audio encoding:', totalSamples, 'samples from', startSample, 'to', endSample);

                if (totalSamples > 0) {
                    // Process audio in larger chunks for better performance
                    const chunkSize = 4096;
                    const numChunks = Math.ceil(totalSamples / chunkSize);

                    for (let chunkIndex = 0; chunkIndex < numChunks; chunkIndex++) {
                        if (audioEncoder.state !== 'configured') break;
                        const chunkStart = startSample + (chunkIndex * chunkSize);
                        const chunkEnd = Math.min(chunkStart + chunkSize, endSample);
                        const actualChunkSize = chunkEnd - chunkStart;
                        const audioData = new Float32Array(actualChunkSize * numberOfChannels);
                        for (let channel = 0; channel < numberOfChannels; channel++) {
                            const channelData = audioBuffer.getChannelData(channel);
                            const offset = channel * actualChunkSize;
                            for (let i = 0; i < actualChunkSize; i++) audioData[offset + i] = channelData[chunkStart + i];
                        }
                        const audioDataObj = new AudioData({
                            format: 'f32-planar', sampleRate, numberOfFrames: actualChunkSize,
                            numberOfChannels, timestamp: ((chunkIndex * chunkSize) * 1_000_000) / sampleRate, data: audioData
                        });
                        audioEncoder.encode(audioDataObj);
                        audioDataObj.close();
                        if (chunkIndex % 100 === 0) await new Promise(r => setTimeout(r, 0));
                    }
                    if (audioEncoder.state === 'configured') await audioEncoder.flush();
                }
                if (audioEncoder.state !== 'closed') audioEncoder.close();
            } catch (e) {}
        }

        showExportProgress('Video finaliseren...', 95);
        if (audioContext) audioContext.close();
        muxer.finalize();

        const videoBlob = new Blob([target.buffer], { type: 'video/mp4' });
        const url = URL.createObjectURL(videoBlob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vrt-graphic.mp4';
        link.click();
        URL.revokeObjectURL(url);

        state.currentFrame = savedFrame;
        updateTimelineDisplay();
        animateChart();
        if (bgVideo) bgVideo.currentTime = (savedFrame / getTotalFrames()) * state.totalDuration;
        hideExportProgress();
        if (wasPlaying) togglePlayback();
    } catch (error) {
        alert(`Export mislukt: ${error.message}`);
        hideExportProgress();
    }
    isExporting = false;
}

async function exportVideoWithMediaRecorder(format) {
    if (isExporting) {
        alert('Export is al bezig. Even geduld.');
        return;
    }

    isExporting = true;
    showExportProgress('Video met audio voorbereiden...', 0);

    try {
        const fps = 25;
        const exportStartTime = parseFloat(elements.exportStart.value) || 0;
        const exportEndTime = parseFloat(elements.exportEnd.value) || state.totalDuration;
        const exportDuration = Math.max(0, exportEndTime - exportStartTime);

        if (exportDuration <= 0) {
            alert('Ongeldige export range.');
            isExporting = false;
            hideExportProgress();
            return;
        }

        // Save current state
        const savedFrame = state.currentFrame;
        const wasPlaying = state.isPlaying;
        if (wasPlaying) {
            togglePlayback();
        }

        // Create offscreen canvas for recording
        const recordCanvas = document.createElement('canvas');
        recordCanvas.width = 1920;
        recordCanvas.height = 1080;
        const recordCtx = recordCanvas.getContext('2d');

        // Get canvas stream
        const canvasStream = recordCanvas.captureStream(fps);

        // Get audio from video if available
        const bgVideo = elements.previewBackground.querySelector('video');
        let combinedStream = canvasStream;

        if (bgVideo && state.uploadedFile) {
            // Create a new video element for audio capture
            const audioVideo = document.createElement('video');
            audioVideo.src = URL.createObjectURL(state.uploadedFile);
            audioVideo.muted = false;
            audioVideo.volume = 1;

            await new Promise((resolve, reject) => {
                audioVideo.onloadedmetadata = resolve;
                audioVideo.onerror = reject;
                setTimeout(reject, 5000);
            });

            let audioStream = null;
            if (audioVideo.captureStream) {
                const audioTracks = audioVideo.captureStream().getAudioTracks();
                if (audioTracks.length > 0) audioStream = new MediaStream(audioTracks);
            }
            if (audioStream) {
                combinedStream = new MediaStream([...canvasStream.getVideoTracks(), ...audioStream.getAudioTracks()]);
            }
            audioVideo.currentTime = exportStartTime;
            await new Promise(r => { audioVideo.onseeked = r; });
            recordCanvas._audioVideo = audioVideo;
        }

        const mimeType = MediaRecorder.isTypeSupported('video/webm;codecs=vp9,opus')
            ? 'video/webm;codecs=vp9,opus'
            : MediaRecorder.isTypeSupported('video/webm;codecs=vp8,opus')
            ? 'video/webm;codecs=vp8,opus' : 'video/webm';

        const mediaRecorder = new MediaRecorder(combinedStream, {
            mimeType,
            videoBitsPerSecond: 8000000
        });

        const chunks = [];
        mediaRecorder.ondataavailable = e => {
            if (e.data.size > 0) chunks.push(e.data);
        };

        // Promise for recording completion
        const recordingComplete = new Promise(resolve => {
            mediaRecorder.onstop = resolve;
        });

        // Start recording
        mediaRecorder.start(100); // Collect data every 100ms

        // Start audio playback if available
        const audioVideo = recordCanvas._audioVideo;
        if (audioVideo) {
            audioVideo.play();
        }

        showExportProgress('Opnemen... (real-time)', 5);

        const startRealTime = performance.now();
        const animate = async () => {
            const elapsed = (performance.now() - startRealTime) / 1000;
            const currentExportTime = exportStartTime + elapsed;

            if (currentExportTime >= exportEndTime) {
                // Stop recording
                mediaRecorder.stop();
                if (audioVideo) {
                    audioVideo.pause();
                    URL.revokeObjectURL(audioVideo.src);
                }
                return;
            }

            // Update animation state
            state.currentFrame = Math.floor((currentExportTime / state.totalDuration) * getTotalFrames());
            updateTimelineDisplay();
            animateChart();

            // Sync background video
            if (bgVideo) {
                bgVideo.currentTime = currentExportTime;
            }

            // Wait for any async operations
            await new Promise(r => requestAnimationFrame(r));

            // Capture frame to record canvas
            const frameCanvas = await captureFrame(false);
            recordCtx.drawImage(frameCanvas, 0, 0, 1920, 1080);

            // Update progress
            const progress = 5 + (elapsed / exportDuration) * 90;
            showExportProgress(`Opnemen... ${Math.floor(elapsed)}/${Math.floor(exportDuration)} sec`, progress);

            // Continue animation
            requestAnimationFrame(animate);
        };

        // Start animation loop
        animate();

        // Wait for recording to complete
        await recordingComplete;

        showExportProgress('Video verwerken...', 95);

        // Create blob and download
        const blob = new Blob(chunks, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = 'vrt-graphic.webm'; // WebM format for MediaRecorder
        link.click();

        URL.revokeObjectURL(url);

        // Restore state
        state.currentFrame = savedFrame;
        updateTimelineDisplay();
        animateChart();

        if (bgVideo) {
            bgVideo.currentTime = (savedFrame / getTotalFrames()) * state.totalDuration;
        }

        hideExportProgress();

        if (wasPlaying) {
            togglePlayback();
        }

        // Inform user about format
        alert('Video geëxporteerd als WebM formaat (met audio). Voor MP4 conversie, gebruik een video converter.');

    } catch (error) {
        console.error('MediaRecorder export failed:', error);
        alert(`Export mislukt: ${error.message}`);
        hideExportProgress();
    }

    isExporting = false;
}

let lastVideoFrameCanvas = null;

async function captureBackground() {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;

    const bgVideo = elements.previewBackground.querySelector('video');
    if (bgVideo) {
        if (bgVideo.readyState < 2) {
            await new Promise(resolve => {
                const checkReady = () => bgVideo.readyState >= 2 ? resolve() : requestAnimationFrame(checkReady);
                checkReady();
                setTimeout(resolve, 200);
            });
        }
        try {
            ctx.drawImage(bgVideo, 0, 0, 1920, 1080);
            lastVideoFrameCanvas = canvas;
            return canvas;
        } catch (e) {
            if (lastVideoFrameCanvas) { ctx.drawImage(lastVideoFrameCanvas, 0, 0); return canvas; }
        }
    }

    const bgStyle = elements.previewBackground.style.backgroundImage;
    if (bgStyle && bgStyle !== 'none' && bgStyle !== '') {
        const urlMatch = bgStyle.match(/url\(["']?([^"']+)["']?\)/);
        if (urlMatch) {
            return new Promise(resolve => {
                const img = new Image();
                img.crossOrigin = 'anonymous';
                img.onload = () => { ctx.drawImage(img, 0, 0, 1920, 1080); resolve(canvas); };
                img.onerror = () => { ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, 1920, 1080); resolve(canvas); };
                img.src = urlMatch[1];
            });
        }
    }

    const gradient = ctx.createLinearGradient(0, 0, 1920, 1080);
    gradient.addColorStop(0, '#1a1a2e');
    gradient.addColorStop(1, '#16213e');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 1920, 1080);
    return canvas;
}

async function createGlassEffect(backgroundCanvas, containerRect, previewRect) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = 1920;
    canvas.height = 1080;
    const scaleX = 1920 / previewRect.width, scaleY = 1080 / previewRect.height;
    const panelX = (containerRect.left - previewRect.left) * scaleX;
    const panelY = (containerRect.top - previewRect.top) * scaleY;
    const panelWidth = containerRect.width * scaleX, panelHeight = containerRect.height * scaleY;
    const borderRadius = 12 * scaleX;

    ctx.drawImage(backgroundCanvas, 0, 0);
    ctx.save();
    ctx.beginPath();
    ctx.roundRect(panelX, panelY, panelWidth, panelHeight, borderRadius);
    ctx.clip();
    ctx.filter = 'blur(20px)';
    ctx.drawImage(backgroundCanvas, 0, 0);
    ctx.filter = 'none';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.5)';
    ctx.fillRect(panelX, panelY, panelWidth, panelHeight);
    ctx.restore();
    return { canvas, panelX, panelY, panelWidth, panelHeight };
}

async function handleExport(format) {
    if (format === 'mp4-audio') { await exportVideoWithMediaRecorder(format); return; }
    if (['mp4-noaudio', 'mov-alpha'].includes(format)) { await exportVideo(format); return; }

    if (format === 'jpg') {
        try {
            const canvas = await captureFrame(false); // with background
            const link = document.createElement('a');
            link.download = 'vrt-graphic.jpg';
            link.href = canvas.toDataURL('image/jpeg', 0.95);
            link.click();
        } catch (error) {
            console.error('JPG export failed:', error);
            alert('JPG export mislukt: ' + error.message);
        }
    } else if (format === 'png') {
        try {
            const canvas = await captureFrame(true); // transparent background
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

function initEventListeners() {
    const debouncedChartUpdate = debounce(() => updateChart(), DEBOUNCE_DELAY);
    const debouncedTitleUpdate = debounce(() => updateTitles(), DEBOUNCE_DELAY);
    const debouncedAxisUpdate = debounce(() => { updateChart(); if (elements.showLogos.checked) updateXAxisDisplay(); }, DEBOUNCE_DELAY);

    elements.chartType.addEventListener('change', () => updateChart());
    elements.position.addEventListener('change', () => updateChart());
    elements.panelWidth.addEventListener('input', updatePanelWidth);
    elements.barWidth.addEventListener('input', updateBarWidth);
    elements.graphIn.addEventListener('input', handleGraphInChange);

    initColorSelectors();

    elements.showText.addEventListener('change', handleTextLogoToggle);
    elements.showLogos.addEventListener('change', handleTextLogoToggle);
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

    elements.titleInput.addEventListener('input', debouncedTitleUpdate);
    elements.subtitleInput.addEventListener('input', debouncedTitleUpdate);
    elements.sourceInput.addEventListener('input', debouncedTitleUpdate);
    elements.xAxisInput.addEventListener('input', () => { elements.showLogos.checked ? (updateChart(), updateXAxisDisplay()) : debouncedAxisUpdate(); });
    elements.yAxisInput.addEventListener('input', debouncedChartUpdate);

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
    initializeBarTimings();
    updateTotalTimeDisplay();
    updateTimelineDisplay();
}

document.addEventListener('DOMContentLoaded', init);

window.addEventListener('resize', () => {
    state.chart?.resize();
    initEasingCanvas();
});
