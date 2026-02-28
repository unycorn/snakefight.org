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
const PELLET_COUNT = 2500;
const WORLD_SIZE = 10000;

class SnakeSegment {
    constructor(x, y) {
        this.x = x;
        this.y = y;
    }
}

class Snake {
    constructor(x, y, name, colorType, isPlayer = false) {
        this.segments = [];
        this.pathHistory = [];
        this.name = name;
        this.colorType = colorType;
        this.isPlayer = isPlayer;
        this.score = 10;
        this.isDead = false;
        this.readyToRemove = false;
        this.deathAlpha = 1.0;

        for (let i = 0; i < INITIAL_SEGMENTS; i++) {
            this.segments.push(new SnakeSegment(x, y));
        }
        for (let i = 0; i < INITIAL_SEGMENTS * 10; i++) {
            this.pathHistory.push({ x, y });
        }
        this.head = this.segments[0];
        this.angle = 0; // Current movement direction
        this.segmentCanvasCache = document.createElement('canvas');
        this.cachedRadius = -1;
        this.cachedDashing = false;
        this.isAccelerating = false;
    }

    get radius() {
        return 20 + this.score * 0.005;
    }

    get segmentDistance() {
        return this.radius * 0.5;
    }

    update(targetAngle, isAccelerating) {
        if (this.readyToRemove) return;

        if (this.isDead) { // Dying animation state
            this.deathAlpha -= 0.1;
            if (this.deathAlpha <= 0.0) {
                this.deathAlpha = 0.0;
                this.readyToRemove = true;
            }
            return; // don't move
        }

        // Smoothly rotate current angle towards targetAngle
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
        this.isAccelerating = isAccelerating && this.score > 0;
        let currentSpeed = SNAKE_SPEED;

        if (this.isAccelerating) {
            currentSpeed = SNAKE_SPEED * 2.5; // Speed boost
            this.score -= 0.3; // Drain score over time
            if (this.score < 0) this.score = 0;
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
        const pelletsEaten = this.score / 10;
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
        if (this.cachedRadius === this.radius && this.cachedDashing === this.isAccelerating && this.cachedGlow === USE_GLOW) return;
        this.cachedRadius = this.radius;
        this.cachedDashing = this.isAccelerating;
        this.cachedGlow = USE_GLOW;

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
            // gradient.addColorStop(0, 'rgba(255, 170, 50, 0.95)');
            // gradient.addColorStop(1, 'rgba(255, 50, 0, 0.8)');
            gradient.addColorStop(0, 'rgba(54, 32, 255, 0.95)');
            gradient.addColorStop(1, 'rgba(0, 18, 179, 0.8)');
            oCtx.shadowColor = '#ffffffff';
        } else {
            // Normal colors
            if (this.colorType === 'green') {
                gradient.addColorStop(0, 'rgba(50, 255, 100, 0.95)');
                gradient.addColorStop(1, 'rgba(0, 180, 50, 0.8)');
                oCtx.shadowColor = '#00b432';
            } else if (this.colorType === 'purple') {
                gradient.addColorStop(0, 'rgba(200, 50, 255, 0.95)');
                gradient.addColorStop(1, 'rgba(120, 0, 180, 0.8)');
                oCtx.shadowColor = '#7800b4';
            } else if (this.colorType === 'pink') {
                gradient.addColorStop(0, 'rgba(255, 50, 150, 0.95)');
                gradient.addColorStop(1, 'rgba(180, 0, 80, 0.8)');
                oCtx.shadowColor = '#b40050';
            } else { // default blue
                gradient.addColorStop(0, 'rgba(54, 32, 255, 0.95)');
                gradient.addColorStop(1, 'rgba(0, 18, 179, 0.8)');
                oCtx.shadowColor = '#00065cff';
            }
        }

        oCtx.fillStyle = gradient;
        oCtx.shadowBlur = USE_GLOW ? 10 : 0;
        oCtx.fill();
    }

    draw(offsetX, offsetY) {
        if (this.readyToRemove) return;
        ctx.save();
        ctx.globalAlpha = this.deathAlpha;

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
                // Sine wave color ramp effect along the body segments (modulating brightness, not opacity)
                ctx.globalAlpha = this.deathAlpha;
                ctx.filter = `brightness(${0.9 + 0.1 * Math.sin((i / 6) * Math.PI * 2)})`;
                ctx.drawImage(this.segmentCanvasCache, screenX - centerOffset, screenY - centerOffset);
                ctx.filter = 'none'; // reset filter
                ctx.restore();
            } else {
                ctx.beginPath();
                ctx.arc(screenX, screenY, currentRadius, 0, Math.PI * 2);
                let fallbackFill = 'rgba(0, 242, 255, 0.8)';
                let fallbackShadow = '#00f2ff';
                if (this.isAccelerating) {
                    fallbackFill = `rgba(255, 100, 0, 0.8)`;
                    fallbackShadow = '#ff2200';
                } else if (this.colorType === 'green') {
                    fallbackFill = 'rgba(0, 255, 100, 0.8)';
                    fallbackShadow = '#00ff64';
                } else if (this.colorType === 'purple') {
                    fallbackFill = 'rgba(200, 50, 255, 0.8)';
                    fallbackShadow = '#c832ff';
                } else if (this.colorType === 'pink') {
                    fallbackFill = 'rgba(255, 50, 150, 0.8)';
                    fallbackShadow = '#ff3296';
                }
                ctx.fillStyle = fallbackFill;
                if (USE_GLOW) {
                    ctx.shadowBlur = 10;
                    ctx.shadowColor = fallbackShadow;
                } else {
                    ctx.shadowBlur = 0;
                }
                // Sine wave color ramp effect along the body segments
                ctx.save();
                ctx.globalAlpha = this.deathAlpha;
                ctx.filter = `brightness(${0.9 + 0.1 * Math.sin((i / 6) * Math.PI * 2)})`;
                ctx.fill();
                ctx.restore();
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
                if (USE_GLOW) {
                    ctx.shadowBlur = 2;
                    ctx.shadowColor = 'rgba(0,0,0,0.5)';
                } else {
                    ctx.shadowBlur = 0;
                }

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

                // Track mouse if player, else track movement direction
                let pupilAngle = this.angle;
                if (this.isPlayer) {
                    const pDx = mouse.x - (width / 2);
                    const pDy = mouse.y - (height / 2);
                    pupilAngle = Math.atan2(pDy, pDx);
                }

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
        ctx.restore(); // Restore globalAlpha
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
        this.orbitRadius = 2 + Math.random() * 7; // Wider loop radius
        this.orbitSpeed = (Math.random() < 0.5 ? 1 : -1) * (0.05 + Math.random() * 0.07); // Faster orbit
        this.orbitAngle = Math.random() * Math.PI * 2;
        this.size = 4 + Math.random() * 3;
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = 0.08 + Math.random() * 0.03;
        // Generate a random vibrant color
        this.hue = Math.floor(Math.random() * 360);
        this.color = `hsl(${this.hue}, 100%, 60%)`;
        this.isEaten = false;
        this.targetSnake = null;
        this.spawnAlpha = 1.0;
        this.isPermanentlyDead = false;
    }

    update() {
        if (this.spawnAlpha < 1.0) {
            this.spawnAlpha += 0.1;
            if (this.spawnAlpha > 1.0) this.spawnAlpha = 1.0;
        }

        if (this.isEaten && this.targetSnake) {
            // Fly into the snake's mouth
            const dx = this.targetSnake.head.x - this.x;
            const dy = this.targetSnake.head.y - this.y;
            this.x += dx * 0.2;
            this.y += dy * 0.2;
            this.size -= 0.5; // Shrink

            if (this.size <= 0.1) {
                // Determine if we should respawn or stay dead to maintain cap
                const activePellets = pellets.filter(p => !p.isEaten && !p.isPermanentlyDead).length;
                if (activePellets >= PELLET_COUNT) {
                    this.isPermanentlyDead = true;
                } else {
                    this.reset();
                    // Ensure the pellet doesn't respawn too close to any snake
                    let tooClose = true;
                    while (tooClose) {
                        tooClose = false;
                        for (const s of snakes) {
                            if (Math.sqrt(Math.pow(s.head.x - this.baseX, 2) + Math.pow(s.head.y - this.baseY, 2)) < 200) {
                                tooClose = true;
                                break;
                            }
                        }
                        if (tooClose) this.reset();
                    }
                }
            }
        } else if (!this.isPermanentlyDead) {
            this.orbitAngle += this.orbitSpeed;
            this.x = this.baseX + Math.cos(this.orbitAngle) * this.orbitRadius;
            this.y = this.baseY + Math.sin(this.orbitAngle) * this.orbitRadius;
            this.pulse += this.pulseSpeed;
        }
    }

    draw(offsetX, offsetY) {
        const screenX = this.x + offsetX;
        const screenY = this.y + offsetY;

        // Only draw if roughly within screen bounds to save performance
        if (screenX < -50 || screenX > width + 50 || screenY < -50 || screenY > height + 50) return;

        ctx.save();
        ctx.globalAlpha = this.spawnAlpha;

        // Subtler blink effect (multiplier 0.5 instead of 2), and don't blink if eaten
        const pSize = this.isEaten ? Math.max(0.1, this.size) : this.size + Math.sin(this.pulse) * 0.5;

        // Reset to solid spawn alpha
        ctx.globalAlpha = this.spawnAlpha;

        // Smoothly ramp lightness up and down as a glow blink instead of opacity
        const lightness = this.isEaten ? 60 : 60 + 20 * Math.sin(this.pulse * 2);
        const currentColor = `hsl(${this.hue}, 100%, ${lightness}%)`;

        ctx.beginPath();
        ctx.arc(screenX, screenY, pSize, 0, Math.PI * 2);
        ctx.fillStyle = currentColor;

        if (this.isEaten) {
            if (USE_GLOW) {
                ctx.shadowBlur = 5;
                ctx.shadowColor = currentColor;
            } else ctx.shadowBlur = 0;
            ctx.fill();
        } else {
            if (USE_GLOW) {
                ctx.shadowBlur = 25; // Enhance glow
                ctx.shadowColor = currentColor;
                ctx.fill();
            } else ctx.shadowBlur = 0;
            ctx.fill(); // Double drawing heavily intensifies the glow opacity
        }
        ctx.restore();
    }
}

let snakes = [];
let pellets = [];
let playerName = "";
let USE_GRADIENT = true;
let USE_GLOW = true;
let isDashing = false;
let npcNames = [
    "Amy Stake", "Barb Dwyer", "Chris P Bacon", "Chris P Baker", "Chris Peacock",
    "Drew Peacock", "Flo Peacock", "Doug Graves", "Ella Vader", "Emma Roids",
    "Hugh Jass", "Hugh Janus", "Jack Hoff", "Jacqueline Hyde", "Jed I Knight",
    "Laura Lynn Hardy", "Lee King", "Mike Hawk", "Mike Rotch", "Ophelia Pane",
    "Paige Turner", "Paul Bearer", "Phil McCracken", "Philipa Bucket", "Rhoda Wolff",
    "Robyn Banks", "Seymour Cox", "Sue Flay", "Sum Ting Wong", "Teresa Brown",
    "Teresa Crowd", "Teresa Green", "Tim Burr", "Toby Lerone", "Ty Prater",
    "Wayne Kerr", "Zoltan Pepper", "Earthworm Jones", "Roundworm Jones", "Leech Jones",
    "Eel Jones", "Lamprey Jones", "Caecilian Jones", "Sea cucumber Jones",
    "Peanut worm Jones", "Ribbon worm Jones", "Hagfish Jones", "Polychaete Jones",
    "Tubeworm Jones", "Sausage worm Jones", "Giant shipworm Jones", "Amphioxus Jones",
    "Marsha Mellow", "Chip Munk", "Neil Down", "Paige Turner", "Anita Bath",
    "Art Major", "Story Teller", "Al O’Vera", "Cliff Hanger", "Clair Annette",
    "Kerry Oki", "Ella Vator", "Holly Daze", "Noah Lott", "Willie Makeit",
    "Noah Dia", "Barry Cade", "Cam Payne", "Cara Van", "Candace Spencer",
    "Duane Pipe", "Justin Time", "Sal Monella", "Dill Eavery", "Al Dente",
    "Gene Pool", "Frank Enstein", "Jed Dye", "Artie Choke", "Ray D. Ater",
    "Tim Burr", "Tish Hughes", "Walter Melon", "Jack Inabocks", "Emma Grate",
    "Rosa Bush", "Holden Aseck", "Ivy League", "Cy Nara", "Ginny Tonic",
    "Pearl Button", "Colleen Cardd", "Mae Day", "Jack Pott", "Ty Coon",
    "Anna Graham", "Izzy Gone", "Joe King", "Al Bino", "Ali Gaither",
    "Stanley Cupp", "Sloane Steady", "Crystal Clearwater", "Douglas Furr", "Tad Moore",
    "Landon Pi", "Justin Case", "Ken Dahl", "Walt R. Upto", "Biff Wellington",
    "Brighton Early", "Major Payne", "Earl E. Bird", "Liv Long", "Teddy Baer",
    "Candy Barr", "Annie Howe", "Marty Graw", "Mary Kristmas", "Bea Havior",
    "Chris Coe", "Buck N. Ears", "Olive Green", "Phil Graves", "Piece Heart",
    "Mel O’Drama", "Sue Flay", "Joy Rider", "Polly Ester", "Chris P. Bacon",
    "Ali Katt", "Peg Legge", "Robyn Banks", "Otto Graf", "Rhoda Carr",
    "Jasmine Rice", "Matt Tress", "Rocky Rhodes", "Sandy Banks", "Russell Sprout",
    "Manny Moore", "Rose Bush", "Sharon Lunch", "June Bugg", "Story Tyme",
    "Blue Knight", "Tommy Hawk", "Rusty Bridges", "Brock Lee", "Sonny Day",
    "Wanda Rinn", "Willie Leeve", "Harry Houze", "Tom Morrow", "Bill Board",
    "Virginia Beach", "Owen Cash", "Guy Power", "North West", "Sweetie Pi",
    "Herb Garden", "Eaton Wright", "Lisa Ford", "Ben Dover", "Sage Berger",
    "Patty O’Furniture", "Ophelia Payne", "Kay Bull", "Piper Down", "Tiffany Box",
    "Warren Peace", "Lake Day", "Candy Kane", "Olive Yu", "Richie Poore",
    "Dan Saul Knight", "Sandy Beach", "Raven Claw", "Dee Liver", "Phillip Button",
    "Ferris Wheeler", "Mel Loewe", "Miles A. Head", "Ima Foxx", "Kandi Queene",
    "Apple Pi", "Crystal Clear", "Forrest Green", "Cy Klone", "Bea O’Problem",
    "Carry Oakey", "Rocky Stone", "Bud Wiser", "Ima Pigg", "Will Power",
    "Ann Teak", "Kelly Green", "Bonnie Ann Clyde", "Cole Slaw", "Foster Child",
    "Joe Kerr", "Penny Loafer", "Dusty Carr", "Ray Gunn", "Buck Wild",
    "Ocean Ball", "Don Key", "Art Seller", "Annie May Shin", "Anna May",
    "Gus T. Wind", "Guy Swett", "Harry Baer", "Tad Pohl", "Charity Case",
    "Summer Day", "Stan Still", "Reign Mann", "Rusty Dorr", "Lisa Mann",
    "Anna Conda", "Joy Ful", "Roman Holiday", "Daisy Gardener", "Royal Payne",
    "Holly Wood", "Rowan Boatmann", "Ella Funt", "Rocky Hill", "Lou Natic",
    "Olive Barr", "Myles Long", "Manny Kin", "Ginger Snap", "Anita Resume",
    "Marshall Law", "Pat Myback", "Dan Druff", "Jack Hammer", "Crystal Glass",
    "Constance Noring", "Polly Tics", "Sunny Day", "Shirley U. Jest", "Lucy Fer",
    "Walker Strait", "Grace Kyes", "Misty Meanor", "Amanda Lynn", "Johnny B. Good",
    "Rick O’Shea", "Barb Dwyer", "Criss Chross", "Saint O’ffender", "Max Power"
];
let playerRespawnTime = 0;
let lastCamX = 0;
let lastCamY = 0;
let isIntroPan = true;

// FPS tracking
let lastFrameTime = performance.now();
let framesThisSecond = 0;
let lastFpsUpdateTime = 0;
const fpsElement = document.getElementById('fps-counter');

function init() {
    resize();
    snakes = [];
    // Player will spawn when startGame is called

    // Spawn some NPCs
    for (let i = 0; i < 5; i++) {
        const colors = ['green', 'purple', 'pink', 'blue'];
        const color = colors[Math.floor(Math.random() * colors.length)];
        const spawnX = (Math.random() - 0.5) * WORLD_SIZE;
        const spawnY = (Math.random() - 0.5) * WORLD_SIZE;
        const rName = npcNames[Math.floor(Math.random() * npcNames.length)] + " (bot)";
        snakes.push(new Snake(spawnX, spawnY, rName, color, false));
    }

    // Start mouse at center so it doesn't immediately snap weirdly
    mouse.x = width / 2;
    mouse.y = height / 2;
    pellets = Array.from({ length: PELLET_COUNT }, () => new Pellet());

    // Auto-focus the input field
    const nameInput = document.getElementById('name-input');
    if (nameInput) nameInput.focus();

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
    // if (e.key.toLowerCase() === 'g') {
    //     USE_GRADIENT = !USE_GRADIENT;
    // }
    // if (e.key.toLowerCase() === 'h') {
    //     USE_GLOW = !USE_GLOW;
    // }
}

function startGame(e) {
    e.preventDefault();
    if (gameStarted) return;

    const input = document.getElementById('name-input');
    playerName = input.value.trim() || 'Player';

    // Spawn the player
    const spawnX = (Math.random() - 0.5) * WORLD_SIZE;
    const spawnY = (Math.random() - 0.5) * WORLD_SIZE;
    snakes.push(new Snake(spawnX, spawnY, playerName, "blue", true));

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

function updateLeaderboard() {
    const list = document.getElementById('leaderboard-list');
    if (!list) return;

    // Sort all snakes by score descending
    const sorted = snakes.filter(s => !s.isDead).sort((a, b) => b.score - a.score).slice(0, 10);

    list.innerHTML = sorted.map((s, index) => {
        const isMe = s.isPlayer ? 'style="color: var(--accent-color); font-weight: bold;"' : '';
        return `<li ${isMe}>
            <span>${index + 1}. ${s.name}</span>
            <span class="score">${Math.floor(s.score)}</span>
        </li>`;
    }).join('');
}

function checkCollisions() {
    snakes.forEach(snake => {
        if (snake.isDead) return;
        const currentRadius = snake.radius;
        const hitBoxRadius = currentRadius * 1.3; // Make eating more forgiving
        pellets.forEach(p => {
            if (p.isEaten) return; // Ignore pellets already being eaten

            const dx = snake.head.x - p.x;
            const dy = snake.head.y - p.y;
            const dist = Math.sqrt(dx * dx + dy * dy);

            if (dist < hitBoxRadius + p.size) { // Collision radius
                p.isEaten = true;
                p.targetSnake = snake;
                snake.score += 10;
            }
        });
    });
}

function checkSnakeCollisions() {
    for (let i = 0; i < snakes.length; i++) {
        const snakeA = snakes[i];
        if (snakeA.isDead) continue;

        const headA = snakeA.head;
        const radiusA = snakeA.radius;

        // Check World Border Collisions
        const halfWorld = WORLD_SIZE / 2;
        if (headA.x < -halfWorld || headA.x > halfWorld || headA.y < -halfWorld || headA.y > halfWorld) {
            snakeA.isDead = true;
            // No pellets spawned when dying to the border!
            continue;
        }

        for (let j = 0; j < snakes.length; j++) {
            if (i === j) continue; // Don't collide with self
            const snakeB = snakes[j];
            if (snakeB.isDead) continue;

            const radiusB = snakeB.radius;

            // Check head A against all body segments of B
            // If A's head hits B's body, A dies.
            for (let k = 1; k < snakeB.segments.length; k += 3) { // optimization: check every 3rd segment
                const segB = snakeB.segments[k];
                const dx = headA.x - segB.x;
                const dy = headA.y - segB.y;
                const distSq = dx * dx + dy * dy;
                const minRadiusSquared = Math.pow(radiusA + radiusB, 2);

                if (distSq < minRadiusSquared) {
                    snakeA.isDead = true;
                    // Spawn pellets from dead snake
                    spawnPelletsFromSnake(snakeA);
                    break;
                }
            }
        }
    }
}

function spawnPelletsFromSnake(deadSnake) {
    // Drop 1 pellet for every 20 score, spread along path
    const dropCount = Math.floor(deadSnake.score / 20);
    if (dropCount <= 0) return;

    const step = Math.max(1, Math.floor(deadSnake.segments.length / dropCount));

    let baseHue = 230; // default blue
    if (deadSnake.colorType === 'green') baseHue = 140;
    else if (deadSnake.colorType === 'purple') baseHue = 280;
    else if (deadSnake.colorType === 'pink') baseHue = 330;

    for (let i = 0; i < deadSnake.segments.length && i < dropCount * step; i += step) {
        const seg = deadSnake.segments[i];
        let p = pellets.find(pellet => pellet.isEaten && pellet.size <= 0.1);
        if (!p) {
            p = new Pellet();
            pellets.push(p);
        }
        p.reset();
        p.baseX = seg.x + (Math.random() - 0.5) * 50;
        p.baseY = seg.y + (Math.random() - 0.5) * 50;
        p.x = p.baseX;
        p.y = p.baseY;
        p.size = 8 + Math.random() * 8; // Double normal size

        // Add subtle hue variation around the base color
        p.hue = baseHue + (Math.random() - 0.5) * 30; // +/- 15 degrees

        p.spawnAlpha = 0.0; // fade in from 0
    }
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
        updateLeaderboard();
    }

    // Update DOM score deterministically
    const player = snakes.find(s => s.isPlayer);
    if (player) {
        scoreElement.textContent = Math.floor(player.score);
    }

    ctx.clearRect(0, 0, width, height);

    // AI Logic and Update all snakes
    snakes.forEach(snake => {
        if (snake.readyToRemove) return; // Skip update if snake is ready to be removed

        let targetAngle = snake.angle;
        let accel = false;

        if (!snake.isDead) { // Only update logic if alive
            if (snake.isPlayer) {
                const dx = mouse.x - (width / 2);
                const dy = mouse.y - (height / 2);
                targetAngle = Math.atan2(dy, dx);
                accel = isDashing;
            } else {
                // AI Logic: Combine Pellet Seeking, Obstacle Avoidance, and Wander
                let desiredX = 0;
                let desiredY = 0;

                // 1. Find closest uneaten pellet
                let closestDist = Infinity;
                let closestPellet = null;
                const searchRadius = 1500; // Much wider radius to find food
                for (const p of pellets) {
                    if (p.isEaten) continue;

                    // Fast box check for performance across 2500 pellets
                    const dx = p.x - snake.head.x;
                    const dy = p.y - snake.head.y;
                    if (Math.abs(dx) > searchRadius || Math.abs(dy) > searchRadius) continue;

                    const distSq = dx * dx + dy * dy;
                    if (distSq < closestDist) {
                        closestDist = distSq;
                        closestPellet = p;
                    }
                }

                if (closestPellet) {
                    desiredX = closestPellet.x - snake.head.x;
                    desiredY = closestPellet.y - snake.head.y;
                    const pLen = Math.sqrt(desiredX * desiredX + desiredY * desiredY);
                    if (pLen > 0) {
                        desiredX /= pLen;
                        desiredY /= pLen;
                    }
                }

                // 2. Avoid other snakes (Repulsion)
                let repX = 0;
                let repY = 0;
                const avoidRadius = 150; // Was 300 - much less aware of surroundings

                for (const other of snakes) {
                    if (other === snake || other.readyToRemove) continue;

                    const checkPoints = [other.head, ...other.segments];
                    for (let i = 0; i < checkPoints.length; i += 5) { // Check every 5th segment for performance
                        const pt = checkPoints[i];
                        const dx = snake.head.x - pt.x;
                        const dy = snake.head.y - pt.y;
                        const distSq = dx * dx + dy * dy;

                        if (distSq > 0 && distSq < avoidRadius * avoidRadius) {
                            const dist = Math.sqrt(distSq);
                            const force = Math.pow((avoidRadius - dist) / avoidRadius, 2); // Exponential falloff
                            repX += (dx / dist) * force;
                            repY += (dy / dist) * force;
                        }
                    }
                }

                // Mix vectors. Repulsion overrides pellet seeking if strong.
                desiredX += repX * 1.5; // Was 3.0 - much weaker repulsion
                desiredY += repY * 1.5;

                if (desiredX !== 0 || desiredY !== 0) {
                    targetAngle = Math.atan2(desiredY, desiredX);
                }

                // 3. Add smooth wander
                if (snake.wanderAngle === undefined) snake.wanderAngle = 0;

                // If actively tracking food within the wide radius, decrease wander so they don't miss it
                let wanderDampen = 1.0;
                if (closestPellet) wanderDampen = 0.2;

                snake.wanderAngle += (Math.random() - 0.5) * 0.8 * wanderDampen; // Wander volatility
                // Bound wander angle 
                if (snake.wanderAngle > 2.5 * wanderDampen) snake.wanderAngle = 2.5 * wanderDampen;
                if (snake.wanderAngle < -2.5 * wanderDampen) snake.wanderAngle = -2.5 * wanderDampen;

                // Sometimes randomly snap the wander angle for sudden sharp turns
                if (Math.random() < 0.02 * wanderDampen) {
                    snake.wanderAngle = (Math.random() - 0.5) * Math.PI * 2 * wanderDampen;
                }

                targetAngle += snake.wanderAngle;
            }
        }

        snake.update(targetAngle, accel);
    });

    // Calculate camera offset so the player's head is dead center
    let camX = lastCamX, camY = lastCamY;
    if (player) {
        isIntroPan = false;
        camX = player.head.x;
        camY = player.head.y;
        lastCamX = camX;
        lastCamY = camY;
    } else if (isIntroPan && snakes.length > 0) {
        // Follow the first available bot during the intro sequence
        camX = snakes[0].head.x;
        camY = snakes[0].head.y;
    }
    const offsetX = (width / 2) - camX;
    const offsetY = (height / 2) - camY;

    // Draw background grid 
    ctx.shadowBlur = 0;
    drawGrid(camX, camY);

    // Draw Map Border (Optimized)
    ctx.save();
    const bx = -WORLD_SIZE / 2 + offsetX;
    const by = -WORLD_SIZE / 2 + offsetY;

    // Simulate glow with layered translucent strokes instead of expensive shadowBlur
    if (USE_GLOW) {
        for (let i = 0; i < 6; i++) {
            const glowWidth = 40 - (i * 6);
            const glowAlpha = 0.1 + (i * 0.15); // Ramp up opacity towards the core
            ctx.strokeStyle = `rgba(200, 0, 0, ${glowAlpha})`;
            ctx.lineWidth = glowWidth;
            ctx.strokeRect(bx, by, WORLD_SIZE, WORLD_SIZE);
        }
    }

    // Core line
    ctx.strokeStyle = 'red';
    ctx.lineWidth = 4;
    ctx.strokeRect(bx, by, WORLD_SIZE, WORLD_SIZE);
    ctx.restore();

    // Update & Draw Pellets
    pellets.forEach(p => {
        p.update();
        p.draw(offsetX, offsetY);
    });

    // Draw Snakes
    // Draw NPCs first, then player on top
    snakes.forEach(snake => {
        if (!snake.readyToRemove && !snake.isPlayer) snake.draw(offsetX, offsetY);
    });
    if (player && !player.readyToRemove) player.draw(offsetX, offsetY);

    // Check world-space collisions
    checkCollisions();
    checkSnakeCollisions();

    // Remove dead snakes and respawn
    for (let i = snakes.length - 1; i >= 0; i--) {
        if (snakes[i].readyToRemove) {
            const deadState = snakes[i];
            snakes.splice(i, 1);
            if (deadState.isPlayer) {
                // Delay player respawn by 500 ms
                playerRespawnTime = currentTime + 500;
            } else {
                // Respawn NPC
                const colors = ['green', 'purple', 'pink', 'blue'];
                const color = colors[Math.floor(Math.random() * colors.length)];
                const spawnX = (Math.random() - 0.5) * WORLD_SIZE;
                const spawnY = (Math.random() - 0.5) * WORLD_SIZE;
                const rName = npcNames[Math.floor(Math.random() * npcNames.length)] + " (bot)";
                snakes.push(new Snake(spawnX, spawnY, rName, color, false));
            }
        }
    }

    if (playerRespawnTime > 0 && currentTime > playerRespawnTime) {
        playerRespawnTime = 0;
        gameStarted = false;
        document.getElementById('message-container').classList.remove('hidden');
    }

    requestAnimationFrame(animate);
}
