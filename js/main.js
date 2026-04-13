/**
 * 主入口文件
 */
document.addEventListener('DOMContentLoaded', () => {
    const canvas = document.querySelector("canvas");
    const textInput = document.getElementById('textInput');
    const submitBtn = document.getElementById('submitBtn');

    // 初始化粒子系统
    const particleSystem = new ParticleSystem(canvas);

    // 绑定输入框事件
    submitBtn.addEventListener('click', () => {
        particleSystem.updateText(textInput.value);
    });

    textInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter') {
            particleSystem.updateText(textInput.value);
        }
    });

    // 页面卸载时清理资源
    window.addEventListener('beforeunload', () => {
        particleSystem.destroy();
    });

    // 暴露到全局（方便调试）
    window.particleSystem = particleSystem;
});
