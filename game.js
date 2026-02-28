const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');
const scoreElement = document.getElementById('score-value');
const promptElement = document.getElementById('prompt');

let width, height;
let score = 10;
let gameStarted = false;
const mouse = { x: 0, y: 0 };

// Configuration
const SNAKE_SPEED = 4.5;
const TURN_SPEED = 0.1;
const INITIAL_SEGMENTS = 10;
const GROWTH_PER_PELLET = 0.4; // Number of segments added per pellet (fractional)
const PELLET_COUNT = 900;
const WORLD_SIZE = 4000;

class SnakeSegment {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Snake {
    constructor() {
        this.segments = [];
        this.pathHistory = [];
        for (let i = 0; i < INITIAL_SEGMENTS; i++) {
            this.segments.push(new SnakeSegment(0, 0)); // Start at world 0,0
        }
        for (let i = 0; i < INITIAL_SEGMENTS * 10; i++) {
            this.pathHistory.push({ x: 0, y: 0 });
        }
        this.head = this.segments[0];
        this.angle = 0; // Current movement direction
        this.segmentCanvasCache = document.createElement('canvas');
        this.cachedRadius = -1;
        this.cachedDashing = false;
        this.isAccelerating = false;
    }

    get radius() {
        return 20 + score * 0.005;
    }

    get segmentDistance() {
        return this.radius * 0.5;
    }

    update() {
        if (!gameStarted) return;

        // Head is always at screen center (width/2, height/2).
        // Find angle from screen center to mouse cursor.
        const dx = mouse.x - (width / 2);
        const dy = mouse.y - (height / 2);
        const targetAngle = Math.atan2(dy, dx);

        // Smoothly rotate current angle towards target angle
        let diff = targetAngle - this.angle;

        // Normalize the difference to between -PI and PI for shortest-path turning
        while (diff > Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;

        if (Math.abs(diff) < TURN_SPEED) {
            this.angle = targetAngle;
        } else {
            this.angle += Math.sign(diff) * TURN_SPEED;
        }

        // Handle Dashing Mechanics
        this.isAccelerating = isDashing && score > 0;
        let currentSpeed = SNAKE_SPEED;

        if (this.isAccelerating) {
            currentSpeed = SNAKE_SPEED * 1.8; // Speed boost
            score -= 0.3; // Drain score over time
            if (score < 0) score = 0;
        }

        // Constant movement in the direction of the current angle
        const vx = Math.cos(this.angle) * currentSpeed;
        const vy = Math.sin(this.angle) * currentSpeed;

        this.head.x += vx;
        this.head.y += vy;

        // Record history at the beginning of the array
        this.pathHistory.unshift({ x: this.head.x, y: this.head.y });

        // Position body exactly along the history path
        let currentDist = 0;
        let historyIndex = 0;
        const targetSegDist = this.segmentDistance;

        for (let i = 1; i < this.segments.length; i++) {
            const desiredDist = i * targetSegDist;

            // Traverse history to find the segment's exact spot
            while (historyIndex < this.pathHistory.length - 1 && currentDist < desiredDist) {
                const p1 = this.pathHistory[historyIndex];
                const p2 = this.pathHistory[historyIndex + 1];
                const pdx = p2.x - p1.x;
                const pdy = p2.y - p1.y;
                const dist = Math.sqrt(pdx * pdx + pdy * pdy);

                if (currentDist + dist >= desiredDist) {
                    const overflow = desiredDist - currentDist;
                    const t = dist === 0 ? 0 : overflow / dist; // Prevent div by 0
                    this.segments[i].x = p1.x + pdx * t;
                    this.segments[i].y = p1.y + pdy * t;
                    break;
                } else {
                    currentDist += dist;
                    historyIndex++;
                }
            }

            // If history is too short (can happen shortly after a massive growth spurt),
            // just stack any remaining segments at the very end of the known path.
            if (historyIndex >= this.pathHistory.length - 1) {
                const lastPos = this.pathHistory[this.pathHistory.length - 1];
                this.segments[i].x = lastPos.x;
                this.segments[i].y = lastPos.y;
            }
        }

        // Trick to prune the end of the history array without garbage collection overhead
        if (this.pathHistory.length > historyIndex + 2) {
            this.pathHistory.length = historyIndex + 2;
        }

        // Maintain deterministic length based on score
        // score / 10 equals the number of pellets eaten. Multiply by GROWTH_PER_PELLET and floor it.
        const pelletsEaten = score / 10;
        const targetLength = INITIAL_SEGMENTS + Math.floor(pelletsEaten * GROWTH_PER_PELLET);

        while (this.segments.length < targetLength) {
            const last = this.segments[this.segments.length - 1];
            this.segments.push(new SnakeSegment(last.x, last.y));
        }
        while (this.segments.length > Math.max(INITIAL_SEGMENTS, targetLength)) {
            this.segments.pop();
        }
    }

    updateSegmentCache() {
        if (this.cachedRadius === this.radius && this.cachedDashing === this.isAccelerating) return;
        this.cachedRadius = this.radius;
        this.cachedDashing = this.isAccelerating;

        const padding = 15; // Space for shadow blur
        const totalSize = (this.radius + padding) * 2;

        this.segmentCanvasCache.width = totalSize;
        this.segmentCanvasCache.height = totalSize;

        const oCtx = this.segmentCanvasCache.getContext('2d');
        const center = this.radius + padding;

        oCtx.beginPath();
        oCtx.arc(center, center, this.radius, 0, Math.PI * 2);

        const gradient = oCtx.createRadialGradient(
            center, center, 0,
            center, center, this.radius
        );

        if (this.isAccelerating) {
            // Dash colors: fiery orange/red
            gradient.addColorStop(0, 'rgba(255, 170, 50, 0.95)');
            gradient.addColorStop(1, 'rgba(255, 50, 0, 0.8)');
            oCtx.shadowColor = '#ff2200';
        } else {
            // Normal colors: icy blue
            gradient.addColorStop(0, 'rgba(54, 32, 255, 0.95)');
            gradient.addColorStop(1, 'rgba(0, 18, 179, 0.8)');
            oCtx.shadowColor = '#00065cff';
        }

        oCtx.fillStyle = gradient;
        oCtx.shadowBlur = 10;
        oCtx.fill();
    }

    draw(offsetX, offsetY) {
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        const currentRadius = this.radius;

        if (USE_GRADIENT) {
            this.updateSegmentCache();
        }

        const offsetForCenter = currentRadius + 15; // padding = 15

        for (let i = this.segments.length - 1; i >= 0; i--) {
            const seg = this.segments[i];
            const screenX = seg.x + offsetX;
            const screenY = seg.y + offsetY;

            if (USE_GRADIENT) {
                // Highly performant image blitting
                // When drawing, we must offset by the center minus the actual screen coordinate
                const cachePadding = 15;
                const centerOffset = currentRadius + cachePadding;

                // Explicitly set context shadow so pellet colors don't bleed into the blit
                ctx.save();
                ctx.shadowBlur = 0;
                ctx.shadowColor = 'transparent';
                ctx.drawImage(this.segmentCanvasCache, screenX - centerOffset, screenY - centerOffset);
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(screenX, screenY, currentRadius, 0, Math.PI * 2);
                ctx.fillStyle = this.isAccelerating ? `rgba(255, 100, 0, 0.8)` : `rgba(0, 242, 255, 0.8)`;
                ctx.shadowBlur = 10;
                ctx.shadowColor = this.isAccelerating ? '#ff2200' : '#00f2ff';
                ctx.fill();
            }

            // Draw eyes on the head
            if (i === 0) {
                const eyeRadius = currentRadius * 0.36; // Increased to touch in the middle
                const eyeOffset = currentRadius * 0.5;
                const eyeAngleOffset = Math.PI / 4; // 45 degrees

                // Left eye
                const leftEyeX = screenX + Math.cos(this.angle - eyeAngleOffset) * eyeOffset;
                const leftEyeY = screenY + Math.sin(this.angle - eyeAngleOffset) * eyeOffset;

                // Right eye
                const rightEyeX = screenX + Math.cos(this.angle + eyeAngleOffset) * eyeOffset;
                const rightEyeY = screenY + Math.sin(this.angle + eyeAngleOffset) * eyeOffset;

                ctx.save();

                // Whites of the eyes
                ctx.fillStyle = 'white';
                ctx.shadowBlur = 2;
                ctx.shadowColor = 'rgba(0,0,0,0.5)';

                ctx.beginPath();
                ctx.arc(leftEyeX, leftEyeY, eyeRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(rightEyeX, rightEyeY, eyeRadius, 0, Math.PI * 2);
                ctx.fill();

                // Pupils
                ctx.fillStyle = 'black';
                ctx.shadowBlur = 0;
                const pupilRadius = eyeRadius * 0.5;
                const pupilOffset = eyeRadius * 0.45; // Look slightly forward
                // Calculate angle specifically to the mouse for the pupils
                const pDx = mouse.x - (width / 2);
                const pDy = mouse.y - (height / 2);
                const pupilAngle = Math.atan2(pDy, pDx);

                const leftPupilX = leftEyeX + Math.cos(pupilAngle) * pupilOffset;
                const leftPupilY = leftEyeY + Math.sin(pupilAngle) * pupilOffset;

                const rightPupilX = rightEyeX + Math.cos(pupilAngle) * pupilOffset;
                const rightPupilY = rightEyeY + Math.sin(pupilAngle) * pupilOffset;

                ctx.beginPath();
                ctx.arc(leftPupilX, leftPupilY, pupilRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.beginPath();
                ctx.arc(rightPupilX, rightPupilY, pupilRadius, 0, Math.PI * 2);
                ctx.fill();

                ctx.restore();
            }
        }
    }
}

class Pellet {
    constructor() {
        this.reset();
    }

    reset() {
        // Spread pellets across a large world area
        this.baseX = (Math.random() - 0.5) * WORLD_SIZE;
        this.baseY = (Math.random() - 0.5) * WORLD_SIZE;
        this.x = this.baseX;
        this.y = this.baseY;
        this.orbitRadius = 1 + Math.random() * 5; // Smaller loop radius
        this.orbitSpeed = (Math.random() < 0.5 ? 1 : -1) * (0.05 + Math.random() * 0.04);
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.size = 4 + Math.random() * 3;
        this.pulse = Math.random() * Math.PI * 2;
        // Generate a random vibrant color
        const hue = Math.floor(Math.random() * 360);
        this.color = `hsl(${hue}, 100%, 60%)`;
        this.isEaten = false;
    }

    update() {
        if (this.isEaten) {
            // Fly into the snake's mouth
            const dx = snake.head.x - this.x;
            const dy = snake.head.y - this.y;
            this.x += dx * 0.2;
            this.y += dy * 0.2;
            this.size -= 0.5; // Shrink

            if (this.size <= 0.1) {
                this.reset();
                // Ensure the pellet doesn't respawn too close to the snake
                while (Math.sqrt(Math.pow(snake.head.x - this.baseX, 2) + Math.pow(snake.head.y - this.baseY, 2)) < 200) {
                    this.reset();
                }
            }
        } else {
            this.orbitAngle += this.orbitSpeed;
            this.x = this.baseX + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.y = this.baseY + Math.sin(this.orbitAngle) * this.orbitRadius;
            this.pulse += 0.05;
        }
    }

    draw(offsetX, offsetY) {
        const screenX = this.x + offsetX;
        const screenY = this.y + offsetY;

        // Only draw if roughly within screen bounds to save performance
        if (screenX < -50 || screenX > width + 50 || screenY < -50 || screenY > height + 50) return;

        // Subtler blink effect (multiplier 0.5 instead of 2), and don't blink if eaten
        const pSize = this.isEaten ? Math.max(0.1, this.size) : this.size + Math.sin(this.pulse) * 0.5;

        ctx.beginPath();
        ctx.arc(screenX, screenY, pSize, 0, Math.PI * 2);
        ctx.fillStyle = this.color;

        if (this.isEaten) {
            ctx.shadowBlur = 5;
            ctx.shadowColor = this.color;
            ctx.fill();
        } else {
            ctx.shadowBlur = 20; // Tight enough to be visible
            ctx.shadowColor = this.color;
            ctx.fill();
            ctx.fill(); // Double drawing heavily intensifies the glow opacity
        }
    }
}

let snake;
let pellets = [];
let playerName = "";
let USE_GRADIENT = true;
let isDashing = false;

// FPS tracking
let lastFrameTime = performance.now();
let framesThisSecond = 0;
let lastFpsUpdateTime = 0;
const fpsElement = document.getElementById('fps-counter');

function init() {
    resize();
    snake = new Snake();
    // Start mouse at center so it doesn't immediately snap weirdly
    mouse.x = width / 2;
    mouse.y = height / 2;
    pellets = Array.from({ length: PELLET_COUNT }, () => new Pellet());

    // Auto-focus the input field
    const usernameInput = document.getElementById('username-input');
    if (usernameInput) usernameInput.focus();

    requestAnimationFrame((timestamp) => {
        lastFrameTime = timestamp || performance.now();
        lastFpsUpdateTime = timestamp || performance.now();
        animate(timestamp);
    });
}

function resize() {
    width = canvas.width = window.innerWidth;
    height = canvas.height = window.innerHeight;
}

function handleMouseMove(e) {
    mouse.x = e.clientX;
    mouse.y = e.clientY;
}

function handleMouseDown(e) {
    if (e.button === 0) isDashing = true; // Left click
}

function handleMouseUp(e) {
    if (e.button === 0) isDashing = false;
}

function handleKeyDown(e) {
    if (e.key.toLowerCase() === 'g') {
        USE_GRADIENT = !USE_GRADIENT;
    }
}

function startGame(e) {
    e.preventDefault();
    if (gameStarted) return;

    const input = document.getElementById('username-input');
    playerName = input.value.trim() || 'Player';

    gameStarted = true;

    // Hide title screen
    const messageContainer = document.getElementById('message-container');
    messageContainer.classList.add('hidden');
}

// Setup Event Listeners
window.addEventListener('resize', resize);
window.addEventListener('mousemove', handleMouseMove);
window.addEventListener('mousedown', handleMouseDown);
window.addEventListener('mouseup', handleMouseUp);
window.addEventListener('keydown', handleKeyDown);
document.getElementById('start-form').addEventListener('submit', startGame);

init();
function checkCollisions() {
    // We can do this in world space, independent of rendering offset
    const currentRadius = snake.radius;
    const hitBoxRadius = currentRadius * 1.3; // Make eating more forgiving
    pellets.forEach(p => {
        if (p.isEaten) return; // Ignore pellets already being eaten

        const dx = snake.head.x - p.x;
        const dy = snake.head.y - p.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < hitBoxRadius + p.size) { // Collision radius
            p.isEaten = true;
            score += 10;
        }
    });
}

function drawGrid(camX, camY) {
    const GRID_ANGLE = Math.PI / 16;

    const hexRadius = 60;
    const hexHeight = hexRadius * 2;
    const hexWidth = Math.sqrt(3) * hexRadius;
    const vertDist = hexHeight * 0.75;
    const horizDist = hexWidth;

    // Find camera in rotated grid space to calculate bounding box
    const cosA = Math.cos(-GRID_ANGLE);
    const sinA = Math.sin(-GRID_ANGLE);
    const gridCamX = camX * cosA - camY * sinA;
    const gridCamY = camX * sinA + camY * cosA;

    // Calculate maximum screen extent (diagonal) from center
    const screenRadius = Math.sqrt(width * width + height * height) / 2;

    const startCols = Math.floor((gridCamX - screenRadius) / horizDist) - 1;
    const endCols = Math.floor((gridCamX + screenRadius) / horizDist) + 1;
    const startRows = Math.floor((gridCamY - screenRadius) / vertDist) - 1;
    const endRows = Math.floor((gridCamY + screenRadius) / vertDist) + 1;

    ctx.save();
    // Center of screen
    ctx.translate(width / 2, height / 2);
    // Move to world origin relative to camera
    ctx.translate(-camX, -camY);
    // Rotate the entire grid layer centered around the world origin
    ctx.rotate(GRID_ANGLE);

    // 1. Draw Outer Hexagons
    ctx.strokeStyle = 'rgba(54, 54, 54, 0.06)';
    ctx.lineWidth = 3.4;
    ctx.beginPath();
    for (let row = startRows; row <= endRows; row++) {
        for (let col = startCols; col <= endCols; col++) {
            let x = col * horizDist;
            let y = row * vertDist;

            // Offset alternate rows
            if (row % 2 !== 0) {
                x += horizDist / 2;
            }

            // Draw outer hexagon
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + (Math.PI / 6); // Pointy top
                const hx = x + hexRadius * Math.cos(angle);
                const hy = y + hexRadius * Math.sin(angle);

                if (i === 0) {
                    ctx.moveTo(hx, hy);
                } else {
                    ctx.lineTo(hx, hy);
                }
            }
            ctx.closePath();
        }
    }
    ctx.stroke();

    // 2. Draw Inset Darker Hexagons
    const innerRadius = hexRadius * 0.65;

    // Create the local gradient once
    const hexGradient = ctx.createLinearGradient(0, -innerRadius, 0, innerRadius);
    hexGradient.addColorStop(0, 'rgba(35, 45, 75, 0.7)'); // Subtle cobalt
    hexGradient.addColorStop(1, 'rgba(20, 22, 26, 0.7)'); // Dark gray

    for (let row = startRows; row <= endRows; row++) {
        for (let col = startCols; col <= endCols; col++) {
            let x = col * horizDist;
            let y = row * vertDist;

            if (row % 2 !== 0) {
                x += horizDist / 2;
            }

            ctx.save();
            ctx.translate(x, y);

            ctx.beginPath();
            for (let i = 0; i < 6; i++) {
                const angle = (Math.PI / 3) * i + (Math.PI / 6);
                const hx = innerRadius * Math.cos(angle);
                const hy = innerRadius * Math.sin(angle);

                if (i === 0) {
                    ctx.moveTo(hx, hy);
                } else {
                    ctx.lineTo(hx, hy);
                }
            }
            ctx.closePath();

            ctx.fillStyle = hexGradient;
            ctx.fill();

            ctx.strokeStyle = 'rgba(45, 50, 65, 0.8)';
            ctx.lineWidth = 2;
            ctx.stroke();

            ctx.restore();
        }
    }

    ctx.restore();
}

function animate(currentTime) {
    if (!currentTime) currentTime = performance.now();

    // Calculate FPS
    const deltaTime = currentTime - lastFrameTime;
    lastFrameTime = currentTime;
    framesThisSecond++;

    if (currentTime > lastFpsUpdateTime + 1000) {
        if (fpsElement) fpsElement.textContent = `${framesThisSecond} FPS`;
        framesThisSecond = 0;
        lastFpsUpdateTime = currentTime;
    }

    // Update DOM score deterministically
    scoreElement.textContent = Math.floor(score);

    ctx.clearRect(0, 0, width, height);

    // Update snake logic (world coordinates)
    snake.update();

    // Calculate camera offset so the head is dead center
    const offsetX = (width / 2) - snake.head.x;
    const offsetY = (height / 2) - snake.head.y;

    // Draw background grid 
    ctx.shadowBlur = 0;
    drawGrid(snake.head.x, snake.head.y);

    // Update & Draw Pellets
    pellets.forEach(p => {
        p.update();
        p.draw(offsetX, offsetY);
    });

    // Draw Snake
    snake.draw(offsetX, offsetY);

    // Check world-space collisions
    checkCollisions();

    requestAnimationFrame(animate);
}
