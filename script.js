// Particles move from random positions to their image pixels and report when settled.
class Particle {
    constructor(x, y, color, panelY, panelHeight) {
        this.originalX = x;
        this.originalY = y;
        this.x = Math.random() * canvas.width;
        this.y = panelY + Math.random() * panelHeight;
        this.color = color;
        this.speed = 0.05;
    }

    move() {
        const dx = this.originalX - this.x;
        const dy = this.originalY - this.y;

        if (Math.abs(dx) < 0.5 && Math.abs(dy) < 0.5) {
            this.x = this.originalX;
            this.y = this.originalY;
            return true;
        }

        this.x += dx * this.speed;
        this.y += dy * this.speed;
        return false;
    }
}

const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');

// Keep each image's particles separate so the panels can animate in sequence.
let particles = [[], []];
let activePanel = 0;
let isInitialized = false;
let canAdvance = false;
let isLoadingNextImage = false;
let hasShiftedForNextImage = false;
let imageSources = [];
let nextImageIndex = 0;
const preferredInitialImages = [
    './assets/images/smlThreeWay.png',
    './assets/images/Cake.jpg'
];

// Crop each image to fill its panel while preserving its aspect ratio.
function drawImageInPanel(image, y, panelHeight) {
    const panelRatio = canvas.width / panelHeight;
    const imageRatio = image.width / image.height;

    if (imageRatio > panelRatio) {
        const sourceWidth = image.height * panelRatio;
        const sourceX = (image.width - sourceWidth) / 2;
        ctx.drawImage(image, sourceX, 0, sourceWidth, image.height, 0, y, canvas.width, panelHeight);
    } else {
        const sourceHeight = image.width / panelRatio;
        const sourceY = (image.height - sourceHeight) / 2;
        ctx.drawImage(image, 0, sourceY, image.width, sourceHeight, 0, y, canvas.width, panelHeight);
    }
}

// Convert a panel's image pixels into particles, then clear the source image.
function createPanelParticles(image, panelIndex) {
    const panelHeight = canvas.height / 2;
    const panelY = panelIndex * panelHeight;
    drawImageInPanel(image, panelY, panelHeight);

    const imageData = ctx.getImageData(0, panelY, canvas.width, panelHeight);
    ctx.clearRect(0, panelY, canvas.width, panelHeight);
    const panelParticles = [];

    for (let y = 0; y < panelHeight; y++) {
        for (let x = 0; x < canvas.width; x++) {
            const index = (y * 4) * canvas.width + x * 4;
            const r = imageData.data[index];
            const g = imageData.data[index + 1];
            const b = imageData.data[index + 2];
            const a = imageData.data[index + 3];

            if (a > 128) {
                const particleColor = `rgba(${r}, ${g}, ${b}, ${a})`;
                panelParticles.push(new Particle(x, panelY + y, particleColor, panelY, panelHeight));
            }
        }
    }

    return panelParticles;
}

// Resolve when an image loads and reject with its path if loading fails.
function loadImage(src) {
    return new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error(`Failed to load ${src}`));
        image.src = src;
    });
}

// Discover supported images from the local server, keeping the current first pair when present.
async function loadImageSources() {
    const response = await fetch('/api/images');
    if (!response.ok) {
        throw new Error(`Failed to discover images (${response.status})`);
    }

    const discoveredSources = await response.json();
    if (!Array.isArray(discoveredSources) ||
        !discoveredSources.every((src) => typeof src === 'string')) {
        throw new Error('The image list returned by the server is invalid');
    }

    const preferredSources = preferredInitialImages.filter((src) => discoveredSources.includes(src));
    imageSources = [
        ...preferredSources,
        ...discoveredSources.filter((src) => !preferredSources.includes(src))
    ];

    if (imageSources.length === 0) {
        throw new Error('No supported images were found in assets/images');
    }
}

// Load the first pair into the top and bottom panels.
function initializeCanvas([firstImage, secondImage]) {
    canvas.width = 414;
    canvas.height = 896;
    particles = [
        createPanelParticles(firstImage, 0),
        createPanelParticles(secondImage, 1)
    ];
    isInitialized = true;
}

// Load the first two images; later images load only after scrolling.
async function initializeFromAssets() {
    await loadImageSources();
    nextImageIndex = 2 % imageSources.length;

    const [firstImage, secondImage] = await Promise.all([
        loadImage(imageSources[0]),
        loadImage(imageSources[1 % imageSources.length])
    ]);
    initializeCanvas([firstImage, secondImage]);
}

initializeFromAssets().catch((error) => console.error(error));

// Move and draw one panel's particles, returning whether they have all settled.
function drawParticles(panelParticles) {
    let allSettled = true;

    for (const particle of panelParticles) {
        if (!particle.move()) {
            allSettled = false;
        }

        ctx.fillStyle = particle.color;
        ctx.fillRect(particle.x, particle.y, 1, 1);
    }

    return allSettled;
}

// Keep completed panels visible and start the next panel only after the current one settles.
function animate() {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    if (isInitialized) {
        const lastVisiblePanel = activePanel;
        for (let panel = 0; panel <= lastVisiblePanel; panel++) {
            const settled = drawParticles(particles[panel]);
            if (panel === activePanel && settled && activePanel < particles.length - 1) {
                activePanel++;
            } else if (panel === activePanel && settled && !isLoadingNextImage) {
                canAdvance = true;
            }
        }
    }

    requestAnimationFrame(animate);
}

// Move the bottom image to the top and load the next asset into the bottom panel.
function loadNextImage() {
    if (!canAdvance || isLoadingNextImage) {
        return;
    }

    canAdvance = false;
    isLoadingNextImage = true;

    if (!hasShiftedForNextImage) {
        const panelHeight = canvas.height / 2;
        const topParticles = particles[1];
        for (const particle of topParticles) {
            particle.originalY -= panelHeight;
            particle.y -= panelHeight;
        }

        particles = [topParticles, []];
        activePanel = 0;
        hasShiftedForNextImage = true;
    }

    loadImage(imageSources[nextImageIndex])
        .then((nextImage) => {
            particles[1] = createPanelParticles(nextImage, 1);
            activePanel = 1;
            nextImageIndex = (nextImageIndex + 1) % imageSources.length;
            hasShiftedForNextImage = false;
            isLoadingNextImage = false;
        })
        .catch((error) => {
            console.error(error);
            isLoadingNextImage = false;
            canAdvance = true;
        });
}

// Downward wheel/trackpad scrolling advances once the second image has settled.
window.addEventListener('wheel', (event) => {
    if (event.deltaY > 0 && (canAdvance || isLoadingNextImage)) {
        event.preventDefault();
        if (canAdvance) {
            loadNextImage();
        }
    }
}, { passive: false });

// Treat an upward finger swipe as downward scrolling on touchscreens.
let touchStartY = null;
window.addEventListener('touchstart', (event) => {
    touchStartY = event.changedTouches[0].clientY;
}, { passive: true });

window.addEventListener('touchend', (event) => {
    const touchEndY = event.changedTouches[0].clientY;
    if (touchStartY !== null && touchStartY - touchEndY > 40) {
        loadNextImage();
    }
    touchStartY = null;
}, { passive: true });

// Start the animation loop.
animate();
