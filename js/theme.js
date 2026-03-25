import { dom } from './dom.js';

const THEME_KEY = 'album_theme';
const GRADIENT_KEY = 'album_gradient';
const THEME_MODE_KEY = 'album_theme_mode';
const THEME_PACKAGE_KEY = 'album_theme_package';

const THEME_PACKAGES = {
    cream: {
        label: '奶油相册',
        gradient: 'linear-gradient(135deg, #fff8ee 0%, #ffe7d1 52%, #f7d7c2 100%)',
        accent: '#d47c5d',
        accentHover: '#bf6948',
        cardBg: 'rgba(255, 251, 245, 0.62)',
        chipBg: 'rgba(255, 242, 229, 0.92)',
        bodyGlow: 'radial-gradient(circle, rgba(255, 236, 214, 0.86) 0%, rgba(255, 236, 214, 0.08) 62%, rgba(255, 236, 214, 0) 72%)'
    },
    film: {
        label: '胶片相册',
        gradient: 'linear-gradient(145deg, #5d5047 0%, #9a7a5c 42%, #d6be9d 100%)',
        accent: '#5a3f2c',
        accentHover: '#4b3425',
        cardBg: 'rgba(255, 244, 223, 0.54)',
        chipBg: 'rgba(92, 63, 43, 0.14)',
        bodyGlow: 'radial-gradient(circle, rgba(255, 217, 163, 0.55) 0%, rgba(255, 217, 163, 0.08) 60%, rgba(255, 217, 163, 0) 72%)'
    },
    summer: {
        label: '夏日相册',
        gradient: 'linear-gradient(135deg, #fef7d7 0%, #c9f2ee 42%, #8fd5ff 100%)',
        accent: '#0f9fb7',
        accentHover: '#0b8398',
        cardBg: 'rgba(244, 255, 252, 0.56)',
        chipBg: 'rgba(228, 252, 247, 0.88)',
        bodyGlow: 'radial-gradient(circle, rgba(183, 244, 237, 0.72) 0%, rgba(183, 244, 237, 0.08) 62%, rgba(183, 244, 237, 0) 72%)'
    }
};

function updateThemeIcon(theme) {
    dom.themeIcon.textContent = theme === 'dark' ? '☀️' : '🌙';
    dom.themeToggleBtn.title = theme === 'dark' ? '切换到白天模式' : '切换到夜晚模式';
}

function getFestivalContext() {
    const now = new Date();
    const month = now.getMonth() + 1;
    const day = now.getDate();

    if (month === 1 && day <= 7) return { name: '新年团聚', badge: '新年推荐', copy: '新的一年，把全家的第一份笑容继续收藏下来。', packageKey: 'cream' };
    if (month === 2 && day >= 10 && day <= 18) return { name: '元宵团圆', badge: '元宵推荐', copy: '灯火亮起的时候，最适合把家人的热闹留在同一本相册里。', packageKey: 'cream' };
    if (month >= 3 && month <= 5) return { name: '春日漫游', badge: '春日推荐', copy: '把野餐、散步和花开的日子，慢慢装订成春天的家庭回忆。', packageKey: 'cream' };
    if (month >= 6 && month <= 8) return { name: '夏日欢聚', badge: '夏日推荐', copy: '阳光、海风和西瓜的季节，最适合用清爽的色调收纳回忆。', packageKey: 'summer' };
    if (month === 10 && day >= 1 && day <= 7) return { name: '假日出游', badge: '国庆推荐', copy: '假期的旅途和团聚，都值得在回家后继续被翻看很多次。', packageKey: 'film' };
    if (month >= 9 && month <= 11) return { name: '秋日故事', badge: '秋日推荐', copy: '收获和团聚的季节，用带一点胶片感的暖色更有故事味道。', packageKey: 'film' };
    return { name: '冬日收藏', badge: '冬日推荐', copy: '围坐在一起的时刻，总值得被留在一个温暖的角落里。', packageKey: 'film' };
}

function clearPackageStyles() {
    const root = document.documentElement;
    ['--bg-gradient', '--accent', '--accent-hover', '--card-bg', '--theme-chip-bg', '--theme-body-glow'].forEach((key) => root.style.removeProperty(key));
    root.removeAttribute('data-theme-package');
}

function syncThemePackageButtons(activeKey, mode) {
    dom.themePackageBtns.forEach((btn) => {
        btn.classList.toggle('active', btn.dataset.package === activeKey && mode === 'manual');
    });
    dom.autoThemeBtn.classList.toggle('active', mode === 'auto');
}

function syncActivePreset(gradient) {
    dom.themePresets.forEach((preset) => {
        preset.classList.toggle('active', preset.dataset.gradient === gradient);
    });
}

function applyGradient(gradient, persist = true) {
    clearPackageStyles();
    document.documentElement.style.setProperty('--bg-gradient', gradient);
    document.documentElement.setAttribute('data-theme-package', 'custom');
    if (persist) {
        localStorage.setItem(GRADIENT_KEY, gradient);
        localStorage.setItem(THEME_MODE_KEY, 'manual');
        localStorage.setItem(THEME_PACKAGE_KEY, 'custom');
    }
    syncActivePreset(gradient);
    syncThemePackageButtons('custom', 'manual');
}

function applyThemePackage(packageKey, options = {}) {
    const { persist = true, mode = 'manual' } = options;
    const themePackage = THEME_PACKAGES[packageKey];
    if (!themePackage) return;

    const root = document.documentElement;
    root.setAttribute('data-theme-package', packageKey);
    root.style.setProperty('--bg-gradient', themePackage.gradient);
    root.style.setProperty('--accent', themePackage.accent);
    root.style.setProperty('--accent-hover', themePackage.accentHover);
    root.style.setProperty('--card-bg', themePackage.cardBg);
    root.style.setProperty('--theme-chip-bg', themePackage.chipBg);
    root.style.setProperty('--theme-body-glow', themePackage.bodyGlow);
    localStorage.removeItem(GRADIENT_KEY);
    syncActivePreset('');

    if (persist) {
        localStorage.setItem(THEME_MODE_KEY, mode);
        localStorage.setItem(THEME_PACKAGE_KEY, packageKey);
    }

    syncThemePackageButtons(packageKey, mode);
}

function refreshFestivalHeader() {
    const festival = getFestivalContext();
    dom.festivalBadge.textContent = `${festival.badge} · ${THEME_PACKAGES[festival.packageKey].label}`;
    dom.recommendThemeBtn.textContent = `一键切换到${THEME_PACKAGES[festival.packageKey].label}`;
    dom.recommendThemeBtn.dataset.package = festival.packageKey;
    dom.headerKicker.textContent = `${festival.name} · 把寻常日子装订成家的回忆册`;
    dom.headerDescription.textContent = festival.copy;
}

export function initTheme() {
    const savedTheme = localStorage.getItem(THEME_KEY) || 'light';
    const themeMode = localStorage.getItem(THEME_MODE_KEY) || 'auto';
    const savedPackage = localStorage.getItem(THEME_PACKAGE_KEY);
    const savedGradient = localStorage.getItem(GRADIENT_KEY);
    const festival = getFestivalContext();

    document.documentElement.setAttribute('data-theme', savedTheme);
    updateThemeIcon(savedTheme);
    refreshFestivalHeader();

    if (themeMode === 'auto') {
        applyThemePackage(festival.packageKey, { persist: false, mode: 'auto' });
        syncThemePackageButtons(festival.packageKey, 'auto');
    } else if (savedPackage && savedPackage !== 'custom') {
        applyThemePackage(savedPackage, { persist: false, mode: 'manual' });
    } else if (savedGradient) {
        applyGradient(savedGradient, false);
        syncThemePackageButtons('custom', 'manual');
    } else {
        applyThemePackage(festival.packageKey, { persist: false, mode: 'auto' });
        syncThemePackageButtons(festival.packageKey, 'auto');
    }

    dom.themeToggleBtn.addEventListener('click', () => {
        const current = document.documentElement.getAttribute('data-theme');
        const next = current === 'dark' ? 'light' : 'dark';
        document.documentElement.setAttribute('data-theme', next);
        localStorage.setItem(THEME_KEY, next);
        updateThemeIcon(next);
    });

    dom.themePanelBtn.addEventListener('click', (event) => {
        event.stopPropagation();
        dom.themeDropdown.classList.toggle('open');
    });

    document.addEventListener('click', (event) => {
        if (!event.target.closest('.theme-panel')) {
            dom.themeDropdown.classList.remove('open');
        }
    });

    dom.themePresets.forEach((preset) => {
        const gradient = preset.dataset.gradient;
        preset.style.background = gradient;
        preset.addEventListener('click', () => applyGradient(gradient));
    });

    dom.themePackageBtns.forEach((btn) => {
        btn.addEventListener('click', () => applyThemePackage(btn.dataset.package));
    });

    dom.autoThemeBtn.addEventListener('click', () => {
        const nextFestival = getFestivalContext();
        localStorage.setItem(THEME_MODE_KEY, 'auto');
        localStorage.removeItem(THEME_PACKAGE_KEY);
        applyThemePackage(nextFestival.packageKey, { persist: false, mode: 'auto' });
        syncThemePackageButtons(nextFestival.packageKey, 'auto');
    });

    dom.applyColorBtn.addEventListener('click', () => {
        applyGradient(`linear-gradient(135deg, ${dom.colorStart.value} 0%, ${dom.colorEnd.value} 100%)`);
    });

    dom.recommendThemeBtn.addEventListener('click', () => {
        applyThemePackage(dom.recommendThemeBtn.dataset.package);
    });
}