const canvas = document.querySelector("canvas");
const gl = canvas.getContext("webgl");

canvas.width = window.innerWidth;
canvas.height = window.innerHeight;
gl.viewport(0, 0, canvas.width, canvas.height);

const config = {
    particleCount: 5000,
    textArray: ["Design.", "Code.", "Coffee."],
    mouseRadius: 0.1,
    particleSize: 2,
    forceMultiplier: 0.001,
    returnSpeed: 0.005,
    velocityDamping: 0.95,
    colorMultiplier: 40000,
    saturationMultiplier: 1000,
    textChangeInterval: 10000,
    rotationForceMultiplier: 0.5
};

let currentTextIndex = 0;
let nextTextTimeout;
let textCoordinates = [];

const mouse = {
    x: -500,
    y: -500,
    radius: config.mouseRadius
};

const particles = [];
for (let i = 0; i < config.particleCount; i++) {
    particles.push({
        x: 0,
        y: 0,
        baseX: 0,
        baseY: 0,
        vx: 0,
        vy: 0
    });
}

const vertexShaderSource = `
    attribute vec2 a_position;
    attribute float a_hue;
    attribute float a_saturation;
    varying float v_hue;
    varying float v_saturation;
    void main() {
        gl_PointSize = ${config.particleSize.toFixed(1)};
        gl_Position = vec4(a_position, 0.0, 1.0);
        v_hue = a_hue;
        v_saturation = a_saturation;
    }
`;

const fragmentShaderSource = `
    precision mediump float;
    varying float v_hue;
    varying float v_saturation;
    void main() {
        float c = v_hue * 6.0;
        float x = 1.0 - abs(mod(c, 2.0) - 1.0);
        vec3 color;
        if (c < 1.0) color = vec3(1.0, x, 0.0);
        else if (c < 2.0) color = vec3(x, 1.0, 0.0);
        else if (c < 3.0) color = vec3(0.0, 1.0, x);
        else if (c < 4.0) color = vec3(0.0, x, 1.0);
        else if (c < 5.0) color = vec3(x, 0.0, 1.0);
        else color = vec3(1.0, 0.0, x);
        vec3 finalColor = mix(vec3(1.0), color, v_saturation);
        gl_FragColor = vec4(finalColor, 1.0);
    }
`;

function createShader(gl, type, source) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, source);
    gl.compileShader(shader);
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.error(gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
    }
    return shader;
}

function createProgram(gl, vertexShader, fragmentShader) {
    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error(gl.getProgramInfoLog(program));
        gl.deleteProgram(program);
        return null;
    }
    return program;
}

const vertexShader = createShader(gl, gl.VERTEX_SHADER, vertexShaderSource);
const fragmentShader = createShader(
    gl,
    gl.FRAGMENT_SHADER,
    fragmentShaderSource
);
const program = createProgram(gl, vertexShader, fragmentShader);

const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
const hueAttributeLocation = gl.getAttribLocation(program, "a_hue");
const saturationAttributeLocation = gl.getAttribLocation(
    program,
    "a_saturation"
);

const positionBuffer = gl.createBuffer();
const hueBuffer = gl.createBuffer();
const saturationBuffer = gl.createBuffer();

const positions = new Float32Array(config.particleCount * 2);
const hues = new Float32Array(config.particleCount);
const saturations = new Float32Array(config.particleCount);

function wrapText(ctx, text, maxWidth) {
    const words = text.split('');
    const lines = [];
    let currentLine = words[0] || '';

    for (let i = 1; i < words.length; i++) {
        const word = words[i];
        const width = ctx.measureText(currentLine + word).width;
        if (width < maxWidth) {
            currentLine += word;
        } else {
            lines.push(currentLine);
            currentLine = word;
        }
    }
    lines.push(currentLine);
    return lines;
}

function getTextCoordinates(text) {
    const qualityMultiplier = Math.min(Math.max(text.length / 5, 2), 4);
    const renderWidth = canvas.width * qualityMultiplier;
    const renderHeight = canvas.height * qualityMultiplier;
    
    const ctx = document.createElement("canvas").getContext("2d");
    ctx.canvas.width = renderWidth;
    ctx.canvas.height = renderHeight;
    
    const maxWidth = renderWidth * 0.8;
    let fontSize = Math.min(renderWidth / 5, renderHeight / 5);
    
    ctx.font = `900 ${fontSize}px "Microsoft YaHei", "PingFang SC", "SimHei", "Source Han Sans", "Noto Sans CJK SC", Arial, sans-serif`;
    
    let lines = wrapText(ctx, text, maxWidth);
    
    while (lines.length * fontSize > renderHeight * 0.6 && fontSize > 24) {
        fontSize -= 4;
        ctx.font = `900 ${fontSize}px "Microsoft YaHei", "PingFang SC", "SimHei", "Source Han Sans", "Noto Sans CJK SC", Arial, sans-serif`;
        lines = wrapText(ctx, text, maxWidth);
    }
    
    ctx.fillStyle = "white";
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    
    const lineHeight = fontSize * 1.3;
    const startY = renderHeight / 2 - ((lines.length - 1) * lineHeight) / 2;
    
    lines.forEach((line, index) => {
        ctx.fillText(line, renderWidth / 2, startY + index * lineHeight);
    });
    
    const imageData = ctx.getImageData(0, 0, renderWidth, renderHeight).data;
    const coordinates = [];
    const sampleStep = Math.max(2, Math.floor(qualityMultiplier));
    
    for (let y = 0; y < renderHeight; y += sampleStep) {
        for (let x = 0; x < renderWidth; x += sampleStep) {
            const index = (y * renderWidth + x) * 4;
            if (imageData[index + 3] > 30) {
                coordinates.push({
                    x: (x / renderWidth) * 2 - 1,
                    y: (y / renderHeight) * -2 + 1
                });
            }
        }
    }
    
    const neededParticles = config.particleCount;
    while (coordinates.length < neededParticles && coordinates.length > 0) {
        const baseLen = coordinates.length;
        const jitterAmount = 0.003 + (text.length * 0.0001);
        for (let i = 0; i < baseLen && coordinates.length < neededParticles; i++) {
            const pt = coordinates[i];
            coordinates.push({
                x: pt.x + (Math.random() - 0.5) * jitterAmount,
                y: pt.y + (Math.random() - 0.5) * jitterAmount
            });
        }
    }
    
    return coordinates;
}

function createParticles() {
    textCoordinates = getTextCoordinates(config.textArray[currentTextIndex]);
    for (let i = 0; i < config.particleCount; i++) {
        const randomIndex = Math.floor(Math.random() * textCoordinates.length);
        const {
            x,
            y
        } = textCoordinates[randomIndex];
        particles[i].x = particles[i].baseX = x;
        particles[i].y = particles[i].baseY = y;
    }
}

function updateParticles() {
    for (let i = 0; i < config.particleCount; i++) {
        const particle = particles[i];
        const dx = mouse.x - particle.x;
        const dy = mouse.y - particle.y;
        const distance = Math.sqrt(dx * dx + dy * dy);
        const forceDirectionX = dx / distance;
        const forceDirectionY = dy / distance;
        const maxDistance = mouse.radius;
        const force = (maxDistance - distance) / maxDistance;
        const directionX = forceDirectionX * force * config.forceMultiplier;
        const directionY = forceDirectionY * force * config.forceMultiplier;

        const angle = Math.atan2(dy, dx);

        const rotationForceX = Math.sin(-Math.cos(angle * -1) *
            Math.sin(config.rotationForceMultiplier * Math.cos(force)) *
            Math.sin(distance * distance) *
            Math.sin(angle * distance)
        );

        const rotationForceY = Math.sin(
            Math.cos(angle * 1) *
            Math.sin(config.rotationForceMultiplier * Math.sin(force)) *
            Math.sin(distance * distance) *
            Math.cos(angle * distance)
        );

        if (distance < mouse.radius) {
            particle.vx -= directionX + rotationForceX;
            particle.vy -= directionY + rotationForceY;
        } else {
            particle.vx += (particle.baseX - particle.x) * config.returnSpeed;
            particle.vy += (particle.baseY - particle.y) * config.returnSpeed;
        }

        particle.x += particle.vx;
        particle.y += particle.vy;
        particle.vx *= config.velocityDamping;
        particle.vy *= config.velocityDamping;

        const speed = Math.sqrt(
            particle.vx * particle.vx + particle.vy * particle.vy
        );
        const hue = (speed * config.colorMultiplier) % 360;

        hues[i] = hue / 360;
        saturations[i] = Math.min(speed * config.saturationMultiplier, 1);
        positions[i * 2] = particle.x;
        positions[i * 2 + 1] = particle.y;
    }
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, positions, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, hueBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, hues, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ARRAY_BUFFER, saturationBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, saturations, gl.DYNAMIC_DRAW);
}

function animate() {
    updateParticles();

    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.vertexAttribPointer(positionAttributeLocation, 2, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(positionAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, hueBuffer);
    gl.vertexAttribPointer(hueAttributeLocation, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(hueAttributeLocation);
    gl.bindBuffer(gl.ARRAY_BUFFER, saturationBuffer);
    gl.vertexAttribPointer(saturationAttributeLocation, 1, gl.FLOAT, false, 0, 0);
    gl.enableVertexAttribArray(saturationAttributeLocation);
    gl.useProgram(program);
    gl.drawArrays(gl.POINTS, 0, config.particleCount);
    requestAnimationFrame(animate);
}

canvas.addEventListener("mousemove", (event) => {
    mouse.x = (event.clientX / canvas.width) * 2 - 1;
    mouse.y = (event.clientY / canvas.height) * -2 + 1;
});

canvas.addEventListener("mouseleave", () => {
    mouse.x = -500;
    mouse.y = -500;
});

canvas.addEventListener("touchstart", (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    mouse.x = (touch.clientX / canvas.width) * 2 - 1;
    mouse.y = (touch.clientY / canvas.height) * -2 + 1;
});

canvas.addEventListener("touchmove", (event) => {
    event.preventDefault();
    const touch = event.touches[0];
    mouse.x = (touch.clientX / canvas.width) * 2 - 1;
    mouse.y = (touch.clientY / canvas.height) * -2 + 1;
});

canvas.addEventListener("touchend", () => {
    mouse.x = -500;
    mouse.y = -500;
});

canvas.addEventListener("touchcancel", () => {
    mouse.x = -500;
    mouse.y = -500;
});

window.addEventListener("resize", () => {
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);
    createParticles();
});

function changeText() {
    currentTextIndex = (currentTextIndex + 1) % config.textArray.length;
    const newCoordinates = getTextCoordinates(config.textArray[currentTextIndex]);
    for (let i = 0; i < config.particleCount; i++) {
        const randomIndex = Math.floor(Math.random() * newCoordinates.length);
        const {
            x,
            y
        } = newCoordinates[randomIndex];
        particles[i].baseX = x;
        particles[i].baseY = y;
    }
    nextTextTimeout = setTimeout(changeText, config.textChangeInterval);
}

function updateTextFromInput() {
    const input = document.getElementById('textInput');
    const text = input.value.trim();
    if (text) {
        config.textArray = [text];
        currentTextIndex = 0;
        clearTimeout(nextTextTimeout);
        const newCoordinates = getTextCoordinates(text);
        for (let i = 0; i < config.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * newCoordinates.length);
            const { x, y } = newCoordinates[randomIndex];
            particles[i].baseX = x;
            particles[i].baseY = y;
        }
    }
}

document.getElementById('submitBtn').addEventListener('click', updateTextFromInput);
document.getElementById('textInput').addEventListener('keypress', (e) => {
    if (e.key === 'Enter') {
        updateTextFromInput();
    }
});

gl.clearColor(0, 0, 0, 1);
createParticles();
animate();
nextTextTimeout = setTimeout(changeText, config.textChangeInterval);
