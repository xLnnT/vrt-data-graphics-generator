// VRT Data Graphics Generator
// Main application script

// DOM Elements
const elements = {
    // Chart type and settings
    chartType: document.getElementById('chartType'),
    position: document.getElementById('position'),
    width: document.getElementById('width'),

    // Colors
    primaryColor: document.getElementById('primaryColor'),
    secondaryColor: document.getElementById('secondaryColor'),
    highlightColor: document.getElementById('highlightColor'),

    // Checkboxes
    showText: document.getElementById('showText'),
    showLogos: document.getElementById('showLogos'),

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
    previewBadge: document.getElementById('previewBadge'),

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

// Initialize the application
function init() {
    initChart();
    initEventListeners();
    initEasingCanvas();
    updateChart();
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
                borderRadius: 4,
                barPercentage: 0.7,
                categoryPercentage: 0.8
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
                    ticks: {
                        color: '#333',
                        font: {
                            size: 12,
                            family: 'Roobert VRT'
                        }
                    }
                },
                y: {
                    beginAtZero: true,
                    max: 60,
                    grid: {
                        color: '#E5E5E5'
                    },
                    ticks: {
                        color: '#333',
                        font: {
                            size: 12,
                            family: 'Roobert VRT'
                        },
                        callback: function(value) {
                            return value + '%';
                        }
                    }
                }
            },
            animation: {
                duration: 0
            }
        }
    });
}

// Create gradient colors for bars
function createGradientColors() {
    const labels = getXAxisLabels();
    const primary = elements.primaryColor.value;
    const secondary = elements.secondaryColor.value;
    const highlight = elements.highlightColor.value;

    return labels.map((_, index) => {
        // Highlight specific bar (e.g., 2016 which shows corona crisis)
        if (index === 5) return highlight;
        // Alternate between primary and similar shades
        return primary;
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
}

// Update title and subtitle
function updateTitles() {
    elements.chartTitle.textContent = elements.titleInput.value || 'Titel';
    elements.chartSubtitle.textContent = elements.subtitleInput.value || 'Subtitel';

    if (elements.sourceInput.value) {
        elements.chartSource.textContent = 'Bron: ' + elements.sourceInput.value;
    } else {
        elements.chartSource.textContent = '';
    }

    // Toggle text visibility
    const showText = elements.showText.checked;
    elements.chartTitle.style.opacity = showText ? 1 : 0;
    elements.chartSubtitle.style.opacity = showText ? 1 : 0;
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
    elements.width.addEventListener('input', updateChart);

    // Colors
    elements.primaryColor.addEventListener('input', updateChart);
    elements.secondaryColor.addEventListener('input', updateChart);
    elements.highlightColor.addEventListener('input', updateChart);

    // Checkboxes
    elements.showText.addEventListener('change', updateTitles);
    elements.showLogos.addEventListener('change', updateTitles);

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
    elements.xAxisInput.addEventListener('input', updateChart);
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
});
