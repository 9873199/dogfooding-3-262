/**
 * 粒子系统配置
 */
const CONFIG = {
    particleCount: 8000,
    textArray: ["Design.", "Code.", "Coffee."],
    mouseRadius: 0.15,
    particleSize: 2.5,
    forceMultiplier: 0.001,
    returnSpeed: 0.005,
    velocityDamping: 0.95,
    colorMultiplier: 40000,
    saturationMultiplier: 1000,
    textChangeInterval: 10000,
    rotationForceMultiplier: 0.5
};

/**
 * 粒子系统类
 */
class ParticleSystem {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = canvas.getContext("webgl");
        this.particles = [];
        this.textCoordinates = [];
        this.currentTextIndex = 0;
        this.nextTextTimeout = null;
        this.isTouchActive = false;
        this.animationId = null;

        this.mouse = {
            x: -500,
            y: -500,
            radius: CONFIG.mouseRadius
        };

        this.init();
    }

    init() {
        this.setupCanvas();
        this.initParticles();
        this.setupShaders();
        this.setupBuffers();
        this.bindEvents();
        this.start();
    }

    setupCanvas() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
        this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
        this.gl.clearColor(0, 0, 0, 1);
    }

    initParticles() {
        for (let i = 0; i < CONFIG.particleCount; i++) {
            this.particles.push({
                x: 0,
                y: 0,
                baseX: 0,
                baseY: 0,
                vx: 0,
                vy: 0
            });
        }
    }

    setupShaders() {
        const vertexShaderSource = `
            attribute vec2 a_position;
            attribute float a_hue;
            attribute float a_saturation;
            varying float v_hue;
            varying float v_saturation;
            void main() {
                gl_PointSize = ${CONFIG.particleSize.toFixed(1)};
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

        const vertexShader = this.createShader(this.gl.VERTEX_SHADER, vertexShaderSource);
        const fragmentShader = this.createShader(this.gl.FRAGMENT_SHADER, fragmentShaderSource);
        this.program = this.createProgram(vertexShader, fragmentShader);

        this.positionAttributeLocation = this.gl.getAttribLocation(this.program, "a_position");
        this.hueAttributeLocation = this.gl.getAttribLocation(this.program, "a_hue");
        this.saturationAttributeLocation = this.gl.getAttribLocation(this.program, "a_saturation");
    }

    createShader(type, source) {
        const shader = this.gl.createShader(type);
        this.gl.shaderSource(shader, source);
        this.gl.compileShader(shader);
        if (!this.gl.getShaderParameter(shader, this.gl.COMPILE_STATUS)) {
            console.error(this.gl.getShaderInfoLog(shader));
            this.gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    createProgram(vertexShader, fragmentShader) {
        const program = this.gl.createProgram();
        this.gl.attachShader(program, vertexShader);
        this.gl.attachShader(program, fragmentShader);
        this.gl.linkProgram(program);
        if (!this.gl.getProgramParameter(program, this.gl.LINK_STATUS)) {
            console.error(this.gl.getProgramInfoLog(program));
            this.gl.deleteProgram(program);
            return null;
        }
        return program;
    }

    setupBuffers() {
        this.positionBuffer = this.gl.createBuffer();
        this.hueBuffer = this.gl.createBuffer();
        this.saturationBuffer = this.gl.createBuffer();

        this.positions = new Float32Array(CONFIG.particleCount * 2);
        this.hues = new Float32Array(CONFIG.particleCount);
        this.saturations = new Float32Array(CONFIG.particleCount);
    }

    /**
     * 自动换行处理 - 根据画布宽度智能分割文本
     */
    wrapText(ctx, text, maxWidth) {
        const chars = text.split('');
        const lines = [];
        let currentLine = '';

        for (let i = 0; i < chars.length; i++) {
            const char = chars[i];
            const testLine = currentLine + char;
            const metrics = ctx.measureText(testLine);
            const testWidth = metrics.width;

            if (testWidth > maxWidth && currentLine !== '') {
                lines.push(currentLine);
                currentLine = char;
            } else {
                currentLine = testLine;
            }
        }
        lines.push(currentLine);
        return lines;
    }

    getTextCoordinates(text) {
        // 创建离屏 canvas 用于渲染文字
        const offscreenCanvas = document.createElement("canvas");
        const ctx = offscreenCanvas.getContext("2d", { willReadFrequently: true });
        
        // 使用更高分辨率以获得更精确的采样
        const scale = 2;
        offscreenCanvas.width = this.canvas.width * scale;
        offscreenCanvas.height = this.canvas.height * scale;

        // 检测是否包含中文
        const hasChinese = /[\u4e00-\u9fa5]/.test(text);
        const maxLineWidth = offscreenCanvas.width * 0.85;

        // 计算合适的字体大小
        const textLength = text.length;
        const estimatedCharWidth = hasChinese ? 50 : 30; // 估算每个字符的像素宽度
        const estimatedLineWidth = textLength * estimatedCharWidth;
        
        // 根据文本长度和画布大小计算字体大小
        let fontSize = Math.min(
            offscreenCanvas.width / (hasChinese ? 8 : 12),
            offscreenCanvas.height / 3,
            200
        );
        
        // 如果文本很长，减小字体大小
        if (estimatedLineWidth > maxLineWidth) {
            fontSize = Math.min(fontSize, maxLineWidth / (textLength * 0.6));
        }
        
        fontSize = Math.max(fontSize, 24); // 确保最小字体大小

        // 设置字体 - 使用系统默认中文字体作为后备
        ctx.font = `900 ${fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
        ctx.fillStyle = "white";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // 自动换行
        const lines = this.wrapText(ctx, text, maxLineWidth);
        
        // 如果有多个行，重新计算字体大小以适应高度
        if (lines.length > 1) {
            fontSize = Math.min(fontSize, offscreenCanvas.height / (lines.length * 1.5));
            ctx.font = `900 ${fontSize}px "Microsoft YaHei", "SimHei", "PingFang SC", "Hiragino Sans GB", "Noto Sans CJK SC", sans-serif`;
        }

        // 清空画布并绘制文字
        ctx.fillStyle = "black";
        ctx.fillRect(0, 0, offscreenCanvas.width, offscreenCanvas.height);
        ctx.fillStyle = "white";

        const lineHeight = fontSize * 1.4;
        const startY = offscreenCanvas.height / 2 - (lines.length - 1) * lineHeight / 2;

        lines.forEach((line, index) => {
            const y = startY + index * lineHeight;
            // 绘制多次以增强文字边缘
            ctx.fillText(line, offscreenCanvas.width / 2, y);
            ctx.fillText(line, offscreenCanvas.width / 2, y); // 重复绘制使文字更粗
        });

        // 获取图像数据
        const imageData = ctx.getImageData(0, 0, offscreenCanvas.width, offscreenCanvas.height).data;
        const coordinates = [];

        // 第一步：使用 step=1 精细采样获取所有可能的坐标
        for (let y = 0; y < offscreenCanvas.height; y += 1) {
            for (let x = 0; x < offscreenCanvas.width; x += 1) {
                const index = (y * offscreenCanvas.width + x) * 4;
                // 检查红色通道（白色文字的R=255）
                if (imageData[index] > 200) {
                    coordinates.push({
                        x: (x / offscreenCanvas.width) * 2 - 1,
                        y: (y / offscreenCanvas.height) * -2 + 1
                    });
                }
            }
        }

        console.log(`Text: "${text}", Lines: ${lines.length}, Raw Coordinates: ${coordinates.length}`);

        // 如果坐标点太多，进行均匀采样
        let finalCoordinates = coordinates;
        if (coordinates.length > 15000) {
            const samplingRate = Math.ceil(coordinates.length / 15000);
            finalCoordinates = coordinates.filter((_, i) => i % samplingRate === 0);
            console.log(`Sampled down to: ${finalCoordinates.length} coordinates`);
        }

        // 如果坐标点太少，可能是文字太细，返回原始坐标
        if (finalCoordinates.length < 100) {
            console.warn('Too few coordinates, text may not be rendering correctly');
        }

        return finalCoordinates;
    }

    createParticles() {
        this.textCoordinates = this.getTextCoordinates(CONFIG.textArray[this.currentTextIndex]);

        if (this.textCoordinates.length === 0) {
            console.warn('No text coordinates found, using default positions');
            for (let i = 0; i < CONFIG.particleCount; i++) {
                const angle = (i / CONFIG.particleCount) * Math.PI * 2;
                const radius = 0.5;
                this.particles[i].x = this.particles[i].baseX = Math.cos(angle) * radius;
                this.particles[i].y = this.particles[i].baseY = Math.sin(angle) * radius;
            }
            return;
        }

        for (let i = 0; i < CONFIG.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * this.textCoordinates.length);
            const { x, y } = this.textCoordinates[randomIndex];
            this.particles[i].x = this.particles[i].baseX = x;
            this.particles[i].y = this.particles[i].baseY = y;
        }
    }

    updateParticles() {
        for (let i = 0; i < CONFIG.particleCount; i++) {
            const particle = this.particles[i];
            const dx = this.mouse.x - particle.x;
            const dy = this.mouse.y - particle.y;
            const distance = Math.sqrt(dx * dx + dy * dy);

            if (distance > 0) {
                const forceDirectionX = dx / distance;
                const forceDirectionY = dy / distance;
                const maxDistance = this.mouse.radius;
                const force = Math.max(0, (maxDistance - distance) / maxDistance);
                const directionX = forceDirectionX * force * CONFIG.forceMultiplier;
                const directionY = forceDirectionY * force * CONFIG.forceMultiplier;

                const angle = Math.atan2(dy, dx);

                const rotationForceX = Math.sin(-Math.cos(angle * -1) *
                    Math.sin(CONFIG.rotationForceMultiplier * Math.cos(force)) *
                    Math.sin(distance * distance) *
                    Math.sin(angle * distance)
                );

                const rotationForceY = Math.sin(
                    Math.cos(angle * 1) *
                    Math.sin(CONFIG.rotationForceMultiplier * Math.sin(force)) *
                    Math.sin(distance * distance) *
                    Math.cos(angle * distance)
                );

                if (distance < this.mouse.radius) {
                    particle.vx -= directionX + rotationForceX;
                    particle.vy -= directionY + rotationForceY;
                }
            }

            particle.vx += (particle.baseX - particle.x) * CONFIG.returnSpeed;
            particle.vy += (particle.baseY - particle.y) * CONFIG.returnSpeed;

            particle.x += particle.vx;
            particle.y += particle.vy;
            particle.vx *= CONFIG.velocityDamping;
            particle.vy *= CONFIG.velocityDamping;

            const speed = Math.sqrt(particle.vx * particle.vx + particle.vy * particle.vy);
            const hue = (speed * CONFIG.colorMultiplier) % 360;

            this.hues[i] = hue / 360;
            this.saturations[i] = Math.min(speed * CONFIG.saturationMultiplier, 1);
            this.positions[i * 2] = particle.x;
            this.positions[i * 2 + 1] = particle.y;
        }

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.positions, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.hueBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.hues, this.gl.DYNAMIC_DRAW);
        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.saturationBuffer);
        this.gl.bufferData(this.gl.ARRAY_BUFFER, this.saturations, this.gl.DYNAMIC_DRAW);
    }

    render() {
        this.gl.clear(this.gl.COLOR_BUFFER_BIT);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.positionBuffer);
        this.gl.vertexAttribPointer(this.positionAttributeLocation, 2, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.positionAttributeLocation);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.hueBuffer);
        this.gl.vertexAttribPointer(this.hueAttributeLocation, 1, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.hueAttributeLocation);

        this.gl.bindBuffer(this.gl.ARRAY_BUFFER, this.saturationBuffer);
        this.gl.vertexAttribPointer(this.saturationAttributeLocation, 1, this.gl.FLOAT, false, 0, 0);
        this.gl.enableVertexAttribArray(this.saturationAttributeLocation);

        this.gl.useProgram(this.program);
        this.gl.drawArrays(this.gl.POINTS, 0, CONFIG.particleCount);
    }

    animate() {
        this.updateParticles();
        this.render();
        this.animationId = requestAnimationFrame(() => this.animate());
    }

    bindEvents() {
        // 鼠标事件
        this.canvas.addEventListener("mousemove", (event) => {
            this.mouse.x = (event.clientX / this.canvas.width) * 2 - 1;
            this.mouse.y = (event.clientY / this.canvas.height) * -2 + 1;
        });

        this.canvas.addEventListener("mouseleave", () => {
            this.mouse.x = -500;
            this.mouse.y = -500;
        });

        // 触摸事件
        this.canvas.addEventListener("touchstart", (event) => {
            event.preventDefault();
            this.isTouchActive = true;
            const touch = event.touches[0];
            this.mouse.x = (touch.clientX / this.canvas.width) * 2 - 1;
            this.mouse.y = (touch.clientY / this.canvas.height) * -2 + 1;
        }, { passive: false });

        this.canvas.addEventListener("touchmove", (event) => {
            event.preventDefault();
            if (this.isTouchActive) {
                const touch = event.touches[0];
                this.mouse.x = (touch.clientX / this.canvas.width) * 2 - 1;
                this.mouse.y = (touch.clientY / this.canvas.height) * -2 + 1;
            }
        }, { passive: false });

        this.canvas.addEventListener("touchend", (event) => {
            event.preventDefault();
            this.isTouchActive = false;
            setTimeout(() => {
                if (!this.isTouchActive) {
                    this.mouse.x = -500;
                    this.mouse.y = -500;
                }
            }, 100);
        });

        this.canvas.addEventListener("touchcancel", (event) => {
            event.preventDefault();
            this.isTouchActive = false;
            this.mouse.x = -500;
            this.mouse.y = -500;
        });

        // 窗口大小调整（防抖）
        let resizeTimeout;
        window.addEventListener("resize", () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                this.canvas.width = window.innerWidth;
                this.canvas.height = window.innerHeight;
                this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
                this.createParticles();
            }, 200);
        });

        // WebGL上下文丢失处理
        this.canvas.addEventListener("webglcontextlost", (event) => {
            event.preventDefault();
            console.warn('WebGL context lost');
            if (this.animationId) {
                cancelAnimationFrame(this.animationId);
            }
        });

        this.canvas.addEventListener("webglcontextrestored", () => {
            console.log('WebGL context restored');
            this.init();
        });
    }

    changeText() {
        this.currentTextIndex = (this.currentTextIndex + 1) % CONFIG.textArray.length;
        const newCoordinates = this.getTextCoordinates(CONFIG.textArray[this.currentTextIndex]);

        if (newCoordinates.length === 0) {
            console.warn('No coordinates found for text:', CONFIG.textArray[this.currentTextIndex]);
            this.nextTextTimeout = setTimeout(() => this.changeText(), CONFIG.textChangeInterval);
            return;
        }

        for (let i = 0; i < CONFIG.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * newCoordinates.length);
            const { x, y } = newCoordinates[randomIndex];
            this.particles[i].baseX = x;
            this.particles[i].baseY = y;
        }

        this.nextTextTimeout = setTimeout(() => this.changeText(), CONFIG.textChangeInterval);
    }

    updateText(text) {
        if (!text.trim()) return;

        CONFIG.textArray = [text];
        this.currentTextIndex = 0;
        clearTimeout(this.nextTextTimeout);

        const newCoordinates = this.getTextCoordinates(text);
        if (newCoordinates.length === 0) {
            console.warn('No coordinates found for input text:', text);
            return;
        }

        for (let i = 0; i < CONFIG.particleCount; i++) {
            const randomIndex = Math.floor(Math.random() * newCoordinates.length);
            const { x, y } = newCoordinates[randomIndex];
            this.particles[i].baseX = x;
            this.particles[i].baseY = y;
        }
    }

    start() {
        this.createParticles();
        this.animate();
        this.nextTextTimeout = setTimeout(() => this.changeText(), CONFIG.textChangeInterval);
    }

    destroy() {
        if (this.animationId) {
            cancelAnimationFrame(this.animationId);
        }
        clearTimeout(this.nextTextTimeout);
    }
}

// 导出供其他模块使用
if (typeof module !== 'undefined' && module.exports) {
    module.exports = { ParticleSystem, CONFIG };
}
