(function() {
    const canvas = document.querySelector("canvas");
    const gl = canvas.getContext("webgl");

    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    gl.viewport(0, 0, canvas.width, canvas.height);

    const config = {
        particleCount: 20000,
        textArray: ["Design.", "Code.", "Coffee."],
        mouseRadius: 0.15,
        particleSize: 2.5,
        forceMultiplier: 0.002,
        returnSpeed: 0.008,
        velocityDamping: 0.92,
        colorMultiplier: 40000,
        saturationMultiplier: 1000,
        textChangeInterval: 10000,
        rotationForceMultiplier: 0.5,
        renderScale: 2,
        samplingGap: 1,
        textPadding: 0.08
    };

    let currentTextIndex = 0;
    let nextTextTimeout;
    let textCoordinates = [];

    const mouse = {
        x: -500,
        y: -500,
        radius: config.mouseRadius,
        isPressed: false
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
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fragmentShaderSource);
    const program = createProgram(gl, vertexShader, fragmentShader);

    const positionAttributeLocation = gl.getAttribLocation(program, "a_position");
    const hueAttributeLocation = gl.getAttribLocation(program, "a_hue");
    const saturationAttributeLocation = gl.getAttribLocation(program, "a_saturation");

    const positionBuffer = gl.createBuffer();
    const hueBuffer = gl.createBuffer();
    const saturationBuffer = gl.createBuffer();

    const positions = new Float32Array(config.particleCount * 2);
    const hues = new Float32Array(config.particleCount);
    const saturations = new Float32Array(config.particleCount);

    function wrapText(text, maxWidth, ctx, fontSize) {
        const lines = [];
        let currentLine = '';
        
        for (let i = 0; i < text.length; i++) {
            const char = text[i];
            if (char === '\n') {
                if (currentLine.length > 0) {
                    lines.push(currentLine);
                }
                currentLine = '';
                continue;
            }
            
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);
            
            if (metrics.width > maxWidth && currentLine.length > 0) {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        
        if (currentLine.length > 0) {
            lines.push(currentLine);
        }
        
        return lines.length > 0 ? lines : [text];
    }

    function measureTextWidth(text, ctx) {
        let maxWidth = 0;
        const lines = text.split('\n');
        lines.forEach(line => {
            const width = ctx.measureText(line).width;
            if (width > maxWidth) {
                maxWidth = width;
            }
        });
        return maxWidth;
    }

    function getTextCoordinates(text) {
        const scale = config.renderScale;
        const padding = config.textPadding;
        
        const offCanvas = document.createElement("canvas");
        offCanvas.width = canvas.width * scale;
        offCanvas.height = canvas.height * scale;
        const ctx = offCanvas.getContext("2d");
        
        ctx.scale(scale, scale);
        
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, offCanvas.width, offCanvas.height);

        const availableWidth = canvas.width * (1 - padding * 2);
        const availableHeight = canvas.height * (1 - padding * 2);
        
        let fontSize = Math.min(canvas.width, canvas.height) / 8;
        fontSize = Math.max(fontSize, 20);
        
        ctx.font = `bold ${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", "SimHei", "Hiragino Sans GB", sans-serif`;
        
        let lines = wrapText(text, availableWidth, ctx, fontSize);
        
        for (let iteration = 0; iteration < 5; iteration++) {
            const textWidth = measureTextWidth(lines.join('\n'), ctx);
            const lineHeight = fontSize * 1.4;
            const totalHeight = lineHeight * lines.length;
            
            if (textWidth <= availableWidth && totalHeight <= availableHeight) {
                break;
            }
            
            fontSize *= 0.85;
            fontSize = Math.max(fontSize, 14);
            ctx.font = `bold ${fontSize}px Arial, "Microsoft YaHei", "PingFang SC", "SimHei", "Hiragino Sans GB", sans-serif`;
            lines = wrapText(text, availableWidth, ctx, fontSize);
        }
        
        const lineHeight = fontSize * 1.4;
        const totalHeight = lineHeight * lines.length;
        const startY = canvas.height / 2 - totalHeight / 2 + lineHeight / 2;

        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";
        
        ctx.shadowColor = "rgba(255, 255, 255, 0.5)";
        ctx.shadowBlur = 1;
        ctx.shadowOffsetX = 0;
        ctx.shadowOffsetY = 0;

        lines.forEach((line, index) => {
            const y = startY + index * lineHeight;
            ctx.fillText(line, canvas.width / 2, y);
        });

        const imageData = ctx.getImageData(0, 0, offCanvas.width, offCanvas.height).data;
        const coordinates = [];
        const gap = config.samplingGap * scale;

        for (let y = 0; y < offCanvas.height; y += gap) {
            for (let x = 0; x < offCanvas.width; x += gap) {
                const index = (y * offCanvas.width + x) * 4;
                const r = imageData[index];
                const g = imageData[index + 1];
                const b = imageData[index + 2];
                
                if (r > 10 || g > 10 || b > 10) {
                    coordinates.push({
                        x: (x / offCanvas.width) * 2 - 1,
                        y: (y / offCanvas.height) * -2 + 1
                    });
                }
            }
        }

        return coordinates;
    }

    function createParticles() {
        textCoordinates = getTextCoordinates(config.textArray[currentTextIndex]);
        
        if (textCoordinates.length === 0) {
            console.warn('No text coordinates found');
            for (let i = 0; i < config.particleCount; i++) {
                particles[i].x = particles[i].baseX = 0;
                particles[i].y = particles[i].baseY = 0;
            }
            return;
        }

        for (let i = 0; i < config.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * textCoordinates.length);
            const { x, y } = textCoordinates[randomIndex];
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

            if (distance > 0.001) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const maxDistance = mouse.radius;
                const force = Math.max(0, (maxDistance - distance) / maxDistance);
                const directionX = forceDirectionX * force * config.forceMultiplier;
                const directionY = forceDirectionY * force * config.forceMultiplier;

                const angle = Math.atan2(dy, dx);

                const rotationForceX = Math.sin(
                    -Math.cos(angle * -1) *
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
            } else {
                particle.vx += (particle.baseX - particle.x) * config.returnSpeed;
                particle.vy += (particle.baseY - particle.y) * config.returnSpeed;
            }

            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= config.velocityDamping;
            particle.vy *= config.velocityDamping;

            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
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

    function handleMouseMove(clientX, clientY) {
        mouse.x = (clientX / canvas.width) * 2 - 1;
        mouse.y = (clientY / canvas.height) * -2 + 1;
    }

    function handleMouseLeave() {
        mouse.x = -500;
        mouse.y = -500;
    }

    canvas.addEventListener("mousemove", (event) => {
        handleMouseMove(event.clientX, event.clientY);
    });

    canvas.addEventListener("mouseleave", handleMouseLeave);

    canvas.addEventListener("touchstart", (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        handleMouseMove(touch.clientX, touch.clientY);
        mouse.isPressed = true;
    }, { passive: false });

    canvas.addEventListener("touchmove", (event) => {
        event.preventDefault();
        const touch = event.touches[0];
        handleMouseMove(touch.clientX, touch.clientY);
    }, { passive: false });

    canvas.addEventListener("touchend", (event) => {
        event.preventDefault();
        handleMouseLeave();
        mouse.isPressed = false;
    }, { passive: false });

    canvas.addEventListener("touchcancel", (event) => {
        event.preventDefault();
        handleMouseLeave();
        mouse.isPressed = false;
    }, { passive: false });

    let resizeTimeout;
    window.addEventListener("resize", () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            canvas.width = window.innerWidth;
            canvas.height = window.innerHeight;
            gl.viewport(0, 0, canvas.width, canvas.height);
            createParticles();
        }, 100);
    });

    function changeText() {
        currentTextIndex = (currentTextIndex + 1) % config.textArray.length;
        const newCoordinates = getTextCoordinates(config.textArray[currentTextIndex]);
        
        if (newCoordinates.length === 0) return;
        
        for (let i = 0; i < config.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * newCoordinates.length);
            const { x, y } = newCoordinates[randomIndex];
            particles[i].baseX = x;
            particles[i].baseY = y;
        }
        nextTextTimeout = setTimeout(changeText, config.textChangeInterval);
    }

    function updateTextFromInput(text) {
        if (!text) return;
        
        config.textArray = [text];
        currentTextIndex = 0;
        clearTimeout(nextTextTimeout);
        
        const newCoordinates = getTextCoordinates(text);
        
        if (newCoordinates.length === 0) {
            console.warn('No coordinates generated for text:', text);
            return;
        }
        
        for (let i = 0; i < config.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * newCoordinates.length);
            const { x, y } = newCoordinates[randomIndex];
            particles[i].baseX = x;
            particles[i].baseY = y;
        }
    }

    gl.clearColor(0, 0, 0, 1);
    createParticles();
    animate();
    nextTextTimeout = setTimeout(changeText, config.textChangeInterval);

    document.getElementById('submitBtn').addEventListener('click', () => {
        const input = document.getElementById('textInput');
        const text = input.value.trim();
        if (text) {
            updateTextFromInput(text);
        }
    });

    document.getElementById('textInput').addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            const input = document.getElementById('textInput');
            const text = input.value.trim();
            if (text) {
                updateTextFromInput(text);
            }
        }
    });

    window.particleConfig = config;
    window.updateTextFromInput = updateTextFromInput;
})();
