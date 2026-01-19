// VRT Data Graphics Generator
// Main application script

// DOM Elements
const elements = {
    // Chart type and settings
    chartType: document.getElementById('chartType'),
    position: document.getElementById('position'),
    panelWidth: document.getElementById('panelWidth'),
    barWidth: document.getElementById('barWidth'),

    // Colors
    primaryColor: document.getElementById('primaryColor'),
    secondaryColor: document.getElementById('secondaryColor'),
    highlightColor: document.getElementById('highlightColor'),

    // X-axis display options
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

    // Output buttons
    outputBtns: document.querySelectorAll('.output-btn')
};

// Chart instance
let chart = null;

// Animation state
let isPlaying = false;
let currentFrame = 0;
let totalFrames = 1200; // 20 seconds at 60fps
let animationId = null;

// Easing curve control points
let easingPoints = {
    cp1x: 0.25,
    cp1y: 0.25,
    cp2x: 0.75,
    cp2y: 0.75
};

// Highlighted bar indices (can select multiple)
let highlightedBars = new Set([5]); // Default: index 5 (2016)

// Logo images cache
let logoImages = {};

// Base dimensions for scaling (reference 1920x1080)
const BASE_WIDTH = 1920;
const BASE_HEIGHT = 1080;
let scaleFactor = 1;

// Initialize the application
function init() {
    initChart();
    initEventListeners();
    initEasingCanvas();
    initResizeObserver();
    updateChart();
    updateTitles();
    updatePanelWidth();
    updateBarWidth();
}

// Initialize resize observer for proportional scaling
function initResizeObserver() {
    const resizeObserver = new ResizeObserver(entries => {
        for (let entry of entries) {
            const { width, height } = entry.contentRect;
            scaleFactor = Math.min(width / BASE_WIDTH, height / BASE_HEIGHT);
            updateScaling();
        }
    });

    resizeObserver.observe(elements.previewArea);

    // Initial scaling
    const rect = elements.previewArea.getBoundingClientRect();
    scaleFactor = Math.min(rect.width / BASE_WIDTH, rect.height / BASE_HEIGHT);
    updateScaling();
}

// Update all scaled elements
function updateScaling() {
    const container = elements.previewArea.querySelector('.chart-container');

    // Scale text sizes
    container.style.setProperty('--title-size', `${Math.round(42 * scaleFactor)}px`);
    container.style.setProperty('--subtitle-size', `${Math.round(24 * scaleFactor)}px`);
    container.style.setProperty('--source-size', `${Math.round(16 * scaleFactor)}px`);

    // Scale padding and spacing (based on preview area, not container)
    container.style.setProperty('--padding-v', `${Math.round(25 * scaleFactor)}px`);
    container.style.setProperty('--padding-h', `${Math.round(35 * scaleFactor)}px`);
    container.style.setProperty('--spacing-sm', `${Math.round(6 * scaleFactor)}px`);

    // Update chart scaling
    if (chart) {
        const tickSize = Math.round(14 * scaleFactor);
        const barRadius = Math.round(8 * scaleFactor);

        chart.options.scales.x.ticks.font.size = tickSize;
        chart.options.scales.y.ticks.font.size = tickSize;
        chart.options.scales.x.ticks.padding = Math.round(10 * scaleFactor);
        chart.options.scales.y.ticks.padding = Math.round(10 * scaleFactor);

        chart.data.datasets[0].borderRadius = {
            topLeft: barRadius,
            topRight: barRadius,
            bottomLeft: 0,
            bottomRight: 0
        };

        chart.update('none');

        // Re-render logos if enabled
        if (elements.showLogos.checked) {
            setTimeout(() => renderXAxisLogos(), 50);
        }
    }
}

// Initialize Chart.js chart
function initChart() {
    const ctx = elements.chartCanvas.getContext('2d');

    chart = new Chart(ctx, {
        type: 'bar',
        data: {
            labels: getXAxisLabels(),
            datasets: [{
                label: 'Data',
                data: getYAxisData(),
                backgroundColor: createGradientColors(),
                borderColor: 'transparent',
                borderWidth: 0,
                borderRadius: {
                    topLeft: 6,
                    topRight: 6,
                    bottomLeft: 0,
                    bottomRight: 0
                },
                borderSkipped: false,
                barPercentage: 0.5,
                categoryPercentage: 0.7
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
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
                    grid: {
                        display: false
                    },
                    border: {
                        display: false
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 13,
                            family: 'Roobert VRT'
                        },
                        padding: 8
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 60,
                    border: {
                        display: false
                    },
                    grid: {
                        color: '#e0e0e0',
                        lineWidth: 1
                    },
                    ticks: {
                        color: '#666',
                        font: {
                            size: 13,
                            family: 'Roobert VRT'
                        },
                        padding: 8,
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            animation: {
                duration: 0
            },
            onClick: handleChartClick
        }
    });
}

// Handle click on chart bars to toggle highlight
function handleChartClick(event, elements) {
    if (elements.length > 0) {
        const barIndex = elements[0].index;

        // Toggle the bar in the highlighted set
        if (highlightedBars.has(barIndex)) {
            highlightedBars.delete(barIndex);
        } else {
            highlightedBars.add(barIndex);
        }

        // Update chart colors
        updateChart();
    }
}

// Create gradient colors for bars
function createGradientColors() {
    const labels = getXAxisLabels();
    const primary = elements.primaryColor.dataset.color;
    const highlight = elements.highlightColor.dataset.color;

    return labels.map((_, index) => {
        // Use highlight color for selected bars
        if (highlightedBars.has(index)) return highlight;
        return primary;
    });
}

// Initialize color selectors
function initColorSelectors() {
    const colorSelectors = document.querySelectorAll('.color-selector');

    colorSelectors.forEach(selector => {
        const indicator = selector.querySelector('.color-indicator');
        const dropdown = selector.querySelector('.color-dropdown');
        const options = selector.querySelectorAll('.color-option');

        // Toggle dropdown on click
        indicator.addEventListener('click', (e) => {
            e.stopPropagation();
            // Close other dropdowns
            colorSelectors.forEach(s => {
                if (s !== selector) s.classList.remove('open');
            });
            selector.classList.toggle('open');
        });

        // Handle color option selection
        options.forEach(option => {
            option.addEventListener('click', (e) => {
                e.stopPropagation();
                const color = option.dataset.color;
                selector.dataset.color = color;
                indicator.style.backgroundColor = color;

                // Update selected state
                options.forEach(o => o.classList.remove('selected'));
                option.classList.add('selected');

                selector.classList.remove('open');
                updateChart();
            });
        });

        // Mark initial selected color
        const currentColor = selector.dataset.color;
        options.forEach(option => {
            if (option.dataset.color === currentColor) {
                option.classList.add('selected');
            }
        });
    });

    // Close dropdowns when clicking outside
    document.addEventListener('click', () => {
        colorSelectors.forEach(s => s.classList.remove('open'));
    });
}

// Get X axis labels from input
function getXAxisLabels() {
    const input = elements.xAxisInput.value;
    return input.split(',').map(s => s.trim());
}

// Get Y axis data from input
function getYAxisData() {
    const input = elements.yAxisInput.value;
    return input.split(',').map(s => parseFloat(s.trim()) || 0);
}

// Update chart based on current settings
function updateChart() {
    if (!chart) return;

    // Update chart type
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
            chart.data.datasets[0].borderColor = elements.primaryColor.value;
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
    chart.data.datasets[0].backgroundColor = createGradientColors();

    // Update max value
    const maxValue = Math.max(...getYAxisData());
    if (chart.options.scales && chart.options.scales.y) {
        chart.options.scales.y.max = Math.ceil(maxValue / 10) * 10 + 10;
    }

    chart.update();

    // Update logos if enabled
    if (elements.showLogos.checked) {
        setTimeout(() => renderXAxisLogos(), 50);
    }
}

// Update title and subtitle
function updateTitles() {
    elements.chartTitle.textContent = elements.titleInput.value || 'Titel';
    elements.chartSubtitle.textContent = elements.subtitleInput.value || 'Subtitel';

    if (elements.sourceInput.value) {
        elements.chartSource.textContent = 'bron: ' + elements.sourceInput.value;
    } else {
        elements.chartSource.textContent = '';
    }
}

// Handle mutual exclusivity between text and logos checkboxes
function handleTextLogoToggle(e) {
    const checkbox = e.target;

    if (checkbox === elements.showText && checkbox.checked) {
        // Text enabled - disable logos
        elements.showLogos.checked = false;
        elements.logoOptions.style.display = 'none';
    } else if (checkbox === elements.showLogos && checkbox.checked) {
        // Logos enabled - disable text
        elements.showText.checked = false;
        elements.logoOptions.style.display = 'block';
    } else if (checkbox === elements.showLogos && !checkbox.checked) {
        // Logos disabled - hide options
        elements.logoOptions.style.display = 'none';
    }

    updateXAxisDisplay();
}

// Update X-axis display (text labels or logos)
function updateXAxisDisplay() {
    if (!chart) return;

    const showLogos = elements.showLogos.checked;
    const logoPadding = 60 * scaleFactor;

    if (showLogos) {
        // Load and display logos
        loadPartyLogos().then(() => {
            chart.options.scales.x.ticks.display = false;
            // Add bottom padding for logos
            chart.options.layout = chart.options.layout || {};
            chart.options.layout.padding = chart.options.layout.padding || {};
            chart.options.layout.padding.bottom = logoPadding;
            chart.update();
            renderXAxisLogos();
        });
    } else {
        // Show text labels
        chart.options.scales.x.ticks.display = true;
        // Remove extra bottom padding
        if (chart.options.layout && chart.options.layout.padding) {
            chart.options.layout.padding.bottom = 0;
        }
        chart.update();
        removeXAxisLogos();
    }
}

// Get logo path for a party name
function getLogoPath(partyName) {
    const region = elements.partyRegion.value === 'vlaamse' ? 'Vlaamse partijen' : 'Waalse partijen';
    const colorMode = elements.monoLogos.checked ? 'mono' : 'kleur';
    // Encode the path properly for special characters
    const path = `assets/Logo's politieke partijen/${region}/${colorMode}/${partyName}.png`;
    return encodeURI(path);
}

// Load party logos based on X-axis labels
async function loadPartyLogos() {
    const labels = getXAxisLabels();
    logoImages = {};

    const loadPromises = labels.map(label => {
        return new Promise((resolve) => {
            const img = new Image();
            const path = getLogoPath(label);
            img.onload = () => {
                logoImages[label] = img;
                resolve();
            };
            img.onerror = () => {
                // Logo not found, skip
                resolve();
            };
            img.src = path;
        });
    });

    await Promise.all(loadPromises);
}

// Render logos below X-axis
function renderXAxisLogos() {
    // Remove existing logos container
    removeXAxisLogos();

    if (!chart) return;

    const labels = getXAxisLabels();
    const chartArea = chart.chartArea;
    const xScale = chart.scales.x;
    const canvas = elements.chartCanvas;

    // Get canvas position relative to its parent
    const canvasRect = canvas.getBoundingClientRect();
    const wrapperRect = canvas.parentElement.getBoundingClientRect();
    const canvasOffsetLeft = canvasRect.left - wrapperRect.left;

    // Create container for logos
    const logosContainer = document.createElement('div');
    logosContainer.id = 'xAxisLogos';
    logosContainer.style.cssText = `
        position: absolute;
        left: 0;
        right: 0;
        bottom: 0;
        height: ${60 * scaleFactor}px;
        pointer-events: none;
        z-index: 10;
    `;

    const logoSize = 50 * scaleFactor;

    labels.forEach((label, index) => {
        // Get exact center position of this bar relative to canvas
        const xPos = xScale.getPixelForValue(index) + canvasOffsetLeft;

        const logoWrapper = document.createElement('div');
        logoWrapper.style.cssText = `
            position: absolute;
            left: ${xPos}px;
            top: 50%;
            transform: translate(-50%, -50%);
            display: flex;
            justify-content: center;
            align-items: center;
            width: ${logoSize}px;
            height: ${logoSize}px;
        `;

        if (logoImages[label]) {
            const logoEl = document.createElement('img');
            logoEl.src = logoImages[label].src;
            logoEl.style.cssText = `
                max-height: ${logoSize}px;
                max-width: ${logoSize}px;
                object-fit: contain;
            `;
            logoWrapper.appendChild(logoEl);
        } else {
            // Show label text as fallback if logo not found
            const textEl = document.createElement('span');
            textEl.textContent = label;
            textEl.style.cssText = `
                font-size: ${12 * scaleFactor}px;
                color: #666;
                font-family: 'Roobert VRT', sans-serif;
                text-align: center;
            `;
            logoWrapper.appendChild(textEl);
        }

        logosContainer.appendChild(logoWrapper);
    });

    // Append to chart wrapper
    const chartWrapper = elements.chartCanvas.parentElement;
    chartWrapper.style.position = 'relative';
    chartWrapper.style.overflow = 'visible';
    chartWrapper.appendChild(logosContainer);
}

// Remove X-axis logos
function removeXAxisLogos() {
    const existingLogos = document.getElementById('xAxisLogos');
    if (existingLogos) {
        existingLogos.remove();
    }
}

// Reference panel width for bar scaling (default value)
const BASE_PANEL_WIDTH = 88;

// Update panel width (glass container)
function updatePanelWidth() {
    const width = elements.panelWidth.value;
    const container = elements.previewArea.querySelector('.chart-container');
    const horizontalInset = (100 - width) / 2;
    container.style.left = `${horizontalInset}%`;
    container.style.right = `${horizontalInset}%`;

    // Recalculate bar width to maintain constant visual size
    updateBarWidth();
}

// Update bar width (compensated for panel width)
function updateBarWidth() {
    if (!chart) return;
    const barWidthSetting = elements.barWidth.value / 100;
    const panelWidth = elements.panelWidth.value;

    // Compensate bar percentage based on panel width
    // When panel is narrower, increase bar percentage to maintain visual width
    const compensatedBarWidth = barWidthSetting * (BASE_PANEL_WIDTH / panelWidth);

    // Clamp to valid range (0-1)
    const finalBarWidth = Math.min(1, Math.max(0.1, compensatedBarWidth));

    chart.data.datasets[0].barPercentage = finalBarWidth;
    chart.update('none');
}

// Handle file upload
function handleFileUpload(file) {
    if (!file) return;

    const reader = new FileReader();
    reader.onload = function(e) {
        elements.previewBackground.style.backgroundImage = `url(${e.target.result})`;
    };
    reader.readAsDataURL(file);
}

// Initialize event listeners
function initEventListeners() {
    // Chart settings
    elements.chartType.addEventListener('change', updateChart);
    elements.position.addEventListener('change', updateChart);
    elements.panelWidth.addEventListener('input', updatePanelWidth);
    elements.barWidth.addEventListener('input', updateBarWidth);

    // Colors - setup color selectors
    initColorSelectors();

    // Text/Logos mutual exclusivity
    elements.showText.addEventListener('change', handleTextLogoToggle);
    elements.showLogos.addEventListener('change', handleTextLogoToggle);
    elements.partyRegion.addEventListener('change', updateXAxisDisplay);
    elements.monoLogos.addEventListener('change', updateXAxisDisplay);

    // Upload
    elements.uploadArea.addEventListener('click', () => elements.fileInput.click());
    elements.fileInput.addEventListener('change', (e) => handleFileUpload(e.target.files[0]));

    // Drag and drop
    elements.uploadArea.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.uploadArea.style.opacity = '0.5';
    });
    elements.uploadArea.addEventListener('dragleave', () => {
        elements.uploadArea.style.opacity = '1';
    });
    elements.uploadArea.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.uploadArea.style.opacity = '1';
        handleFileUpload(e.dataTransfer.files[0]);
    });

    // Title inputs
    elements.titleInput.addEventListener('input', updateTitles);
    elements.subtitleInput.addEventListener('input', updateTitles);
    elements.sourceInput.addEventListener('input', updateTitles);

    // Axis inputs
    elements.xAxisInput.addEventListener('input', () => {
        updateChart();
        if (elements.showLogos.checked) {
            updateXAxisDisplay();
        }
    });
    elements.yAxisInput.addEventListener('input', updateChart);

    // Timeline
    elements.playBtn.addEventListener('click', togglePlayback);

    const timelineTrack = elements.timelineProgress.parentElement;
    timelineTrack.addEventListener('click', (e) => {
        const rect = timelineTrack.getBoundingClientRect();
        const percent = (e.clientX - rect.left) / rect.width;
        currentFrame = Math.floor(percent * totalFrames);
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

// Initialize easing canvas
function initEasingCanvas() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');

    // Set canvas size
    canvas.width = canvas.offsetWidth * 2;
    canvas.height = canvas.offsetHeight * 2;
    ctx.scale(2, 2);

    drawEasingCurve();
}

// Draw easing curve
function drawEasingCurve() {
    const canvas = elements.easingCanvas;
    const ctx = canvas.getContext('2d');
    const width = canvas.offsetWidth;
    const height = canvas.offsetHeight;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    // Draw grid
    ctx.strokeStyle = '#C9C2F833';
    ctx.lineWidth = 1;

    // Vertical lines
    for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(i * width / 10, 0);
        ctx.lineTo(i * width / 10, height);
        ctx.stroke();
    }

    // Horizontal lines
    for (let i = 0; i <= 10; i++) {
        ctx.beginPath();
        ctx.moveTo(0, i * height / 10);
        ctx.lineTo(width, i * height / 10);
        ctx.stroke();
    }

    // Draw diagonal reference line
    ctx.strokeStyle = '#C9C2F866';
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width, 0);
    ctx.stroke();

    // Draw bezier curve
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.bezierCurveTo(
        easingPoints.cp1x * width, height - easingPoints.cp1y * height,
        easingPoints.cp2x * width, height - easingPoints.cp2y * height,
        width, 0
    );
    ctx.stroke();

    // Draw control points
    ctx.fillStyle = '#5541F0';

    // Control point 1
    ctx.beginPath();
    ctx.arc(easingPoints.cp1x * width, height - easingPoints.cp1y * height, 6, 0, Math.PI * 2);
    ctx.fill();

    // Control point 2
    ctx.beginPath();
    ctx.arc(easingPoints.cp2x * width, height - easingPoints.cp2y * height, 6, 0, Math.PI * 2);
    ctx.fill();

    // Draw control point lines
    ctx.strokeStyle = '#5541F066';
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(easingPoints.cp1x * width, height - easingPoints.cp1y * height);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(width, 0);
    ctx.lineTo(easingPoints.cp2x * width, height - easingPoints.cp2y * height);
    ctx.stroke();

    // Update easing values display
    elements.easingValues.textContent = `${easingPoints.cp1x.toFixed(2)},${easingPoints.cp1y.toFixed(2)},${easingPoints.cp2x.toFixed(2)},${easingPoints.cp2y.toFixed(2)}`;
}

// Toggle playback
function togglePlayback() {
    isPlaying = !isPlaying;

    if (isPlaying) {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="4" width="4" height="16"></rect><rect x="14" y="4" width="4" height="16"></rect></svg>';
        animate();
    } else {
        elements.playBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="currentColor"><polygon points="5 3 19 12 5 21 5 3"></polygon></svg>';
        cancelAnimationFrame(animationId);
    }
}

// Animation loop
function animate() {
    if (!isPlaying) return;

    currentFrame++;
    if (currentFrame >= totalFrames) {
        currentFrame = 0;
    }

    updateTimelineDisplay();

    // Animate chart bars based on timeline position
    animateChart();

    animationId = requestAnimationFrame(animate);
}

// Update timeline display
function updateTimelineDisplay() {
    const percent = (currentFrame / totalFrames) * 100;
    elements.timelineProgress.style.width = `${percent}%`;
    elements.timelineThumb.style.left = `${percent}%`;

    // Update time display
    const totalSeconds = 20;
    const currentSeconds = (currentFrame / totalFrames) * totalSeconds;
    const minutes = Math.floor(currentSeconds / 60);
    const seconds = Math.floor(currentSeconds % 60);
    elements.currentTime.textContent = `${minutes}:${seconds.toString().padStart(2, '0')}`;
}

// Animate chart based on timeline
function animateChart() {
    if (!chart) return;

    const graphInTime = parseInt(elements.graphIn.value) || 5;
    const graphOutTime = parseInt(elements.graphOut.value) || 15;

    const currentTime = (currentFrame / totalFrames) * 20; // 20 seconds total

    let animProgress = 0;

    if (currentTime < graphInTime) {
        // Animation in
        animProgress = currentTime / graphInTime;
    } else if (currentTime < graphOutTime) {
        // Fully visible
        animProgress = 1;
    } else {
        // Animation out
        animProgress = 1 - ((currentTime - graphOutTime) / (20 - graphOutTime));
    }

    // Apply easing
    animProgress = Math.max(0, Math.min(1, animProgress));
    animProgress = cubicBezier(animProgress, easingPoints.cp1x, easingPoints.cp1y, easingPoints.cp2x, easingPoints.cp2y);

    // Update chart data with animation
    const originalData = getYAxisData();
    const animatedData = originalData.map(val => val * animProgress);

    chart.data.datasets[0].data = animatedData;
    chart.update('none');
}

// Cubic bezier easing function
function cubicBezier(t, x1, y1, x2, y2) {
    // Simple approximation
    const cx = 3 * x1;
    const bx = 3 * (x2 - x1) - cx;
    const ax = 1 - cx - bx;

    const cy = 3 * y1;
    const by = 3 * (y2 - y1) - cy;
    const ay = 1 - cy - by;

    function sampleCurveY(t) {
        return ((ay * t + by) * t + cy) * t;
    }

    return sampleCurveY(t);
}

// Handle export
function handleExport(format) {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');

    // Set export dimensions
    canvas.width = 1920;
    canvas.height = 1080;

    // Draw preview area content
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
                // For video formats, show a message
                alert(`Video export (${format}) requires server-side processing. Please use PNG or JPG for static exports.`);
                return;
        }

        // Create download link
        const link = document.createElement('a');
        link.download = `vrt-graphic.${extension}`;
        link.href = canvas.toDataURL(mimeType);
        link.click();
    }).catch(() => {
        // Fallback: just export the chart
        const chartCanvas = elements.chartCanvas;
        const link = document.createElement('a');
        link.download = `vrt-chart.png`;
        link.href = chartCanvas.toDataURL('image/png');
        link.click();
    });
}

// Simple fallback for html2canvas
if (typeof html2canvas === 'undefined') {
    window.html2canvas = function(element) {
        return Promise.reject('html2canvas not loaded');
    };
}

// Initialize on DOM ready
document.addEventListener('DOMContentLoaded', init);

// Handle window resize
window.addEventListener('resize', () => {
    if (chart) {
        chart.resize();
    }
    initEasingCanvas();
    // Re-render logos if enabled
    if (elements.showLogos.checked) {
        setTimeout(() => renderXAxisLogos(), 100);
    }
});
