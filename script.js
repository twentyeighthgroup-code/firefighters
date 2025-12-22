/**
 * FireHero: Elite Squad (Fixed Version)
 * Исправленная версия с безопасной инициализацией
 */

// --- CONFIGURATION ---
const CONFIG = {
    gridSize: 25,
    regenRate: 20, // Water per second
    fireSpreadChance: 0.015,
    autoSaveInterval: 5000,
    costs: {
        pump: { base: 100, growth: 1.6 },
        tank: { base: 250, growth: 1.5 },
        rain: 50
    },
    levels: {
        pump: [0, 5, 12, 25, 50, 100], 
        tank: [0, 50, 150, 300, 600, 1000]
    }
};

// --- CORE UTILS (SAFE) ---
const TG = window.Telegram.WebApp;

// Безопасная обертка для вибрации
const Haptic = {
    impact: (style = 'medium') => {
        if(TG.HapticFeedback) TG.HapticFeedback.impactOccurred(style);
    },
    notify: (type = 'success') => {
        if(TG.HapticFeedback) TG.HapticFeedback.notificationOccurred(type);
    },
    select: () => {
        if(TG.HapticFeedback) TG.HapticFeedback.selectionChanged();
    }
};

// --- STATE MANAGEMENT ---
class GameState {
    constructor() {
        this._data = {
            coins: 0,
            water: 100,
            maxWater: 100,
            burnedPercent: 0,
            upgrades: { pump: 1, tank: 1 },
            lastSave: Date.now()
        };
        this.listeners = new Map();
        
        // Proxy для автоматического обновления UI
        this.proxy = new Proxy(this._data, {
            set: (target, prop, value) => {
                target[prop] = value;
                this.notify(prop, value);
                return true;
            }
        });
    }

    get() { return this.proxy; }

    subscribe(prop, callback) {
        if (!this.listeners.has(prop)) this.listeners.set(prop, []);
        this.listeners.get(prop).push(callback);
    }

    notify(prop, value) {
        if (this.listeners.has(prop)) {
            this.listeners.get(prop).forEach(cb => cb(value));
        }
    }

    load() {
        try {
            const saved = localStorage.getItem('FireHero_Save_v1');
            if (saved) Object.assign(this._data, JSON.parse(saved));
        } catch (e) { console.warn('Save file corrupted'); }
        // Принудительное обновление всех подписчиков
        Object.keys(this._data).forEach(k => this.notify(k, this._data[k]));
    }

    save() {
        localStorage.setItem('FireHero_Save_v1', JSON.stringify(this._data));
    }
}

// --- VISUAL FX SYSTEM ---
class FXManager {
    constructor() {
        this.canvas = document.getElementById('game-canvas');
        if (!this.canvas) return; // Защита если canvas не найден
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.floatingTexts = [];
        
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.loop();
    }

    resize() {
        if (!this.canvas) return;
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    spawn(x, y, type) {
        const count = type === 'rain' ? 2 : (type === 'fire' ? 5 : 10);
        for(let i=0; i<count; i++) {
            this.particles.push({
                x, y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0, type,
                color: type === 'fire' ? `255, 69, 58` : `10, 132, 255`
            });
        }
    }

    floatText(x, y, text, color = '#ffd60a') {
        this.floatingTexts.push({ x, y, text, color, life: 1.0, vy: -2 });
    }

    loop() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        // Particles
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04;
            
            if (p.type === 'rain') p.vy += 1; else p.vy += 0.2;

            this.ctx.fillStyle = `rgba(${p.color}, ${p.life})`;
            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, Math.random()*3+1, 0, Math.PI * 2);
            this.ctx.fill();

            if (p.life <= 0) this.particles.splice(i, 1);
        }

        // Text
        this.ctx.font = "bold 24px -apple-system";
        this.ctx.textAlign = "center";
        for (let i = this.floatingTexts.length - 1; i >= 0; i--) {
            const t = this.floatingTexts[i];
            t.y += t.vy;
            t.life -= 0.02;
            this.ctx.fillStyle = t.color;
            this.ctx.globalAlpha = Math.max(0, t.life);
            this.ctx.fillText(t.text, t.x, t.y);
            this.ctx.globalAlpha = 1;
            if (t.life <= 0) this.floatingTexts.splice(i, 1);
        }

        requestAnimationFrame(() => this.loop());
    }
}

// --- MAIN GAME CONTROLLER ---
class GameController {
    constructor() {
        console.log("Game Controller starting...");
        this.store = new GameState();
        this.state = this.store.get();
        this.fx = new FXManager();
        this.cells = [];
        this.lastTime = 0;
        
        this.ui = {
            grid: document.getElementById('grid-container'),
            waterFill: document.getElementById('water-bar-fill'),
            rainBtn: document.getElementById('btn-rain'),
            shop: document.getElementById('shop-container'),
            views: document.querySelectorAll('.view'),
            navs: document.querySelectorAll('.nav-item'),
            loader: document.getElementById('loader'),
            app: document.getElementById('app')
        };
    }

    init() {
        try {
            TG.expand();
        } catch(e) { console.log("Telegram expand failed (browser mode?)"); }

        this.setupBindings();
        this.generateGrid();
        this.renderShop();
        this.setupNavigation();
        
        // Load Data
        this.store.load();
        
        // Start Loop
        requestAnimationFrame((t) => this.gameLoop(t));
        
        // Hide Loader
        setTimeout(() => {
            if(this.ui.loader) this.ui.loader.classList.add('hidden');
            if(this.ui.app) this.ui.app.classList.remove('hidden');
        }, 800);

        // Listeners
        if(this.ui.rainBtn) this.ui.rainBtn.addEventListener('click', () => this.activateRain());
        const waterBtn = document.getElementById('water-btn');
        if(waterBtn) waterBtn.addEventListener('click', () => this.manualRefill());
    }

    setupBindings() {
        const boundElements = document.querySelectorAll('[data-bind]');
        boundElements.forEach(el => {
            const prop = el.dataset.bind;
            this.store.subscribe(prop, (val) => {
                if(prop === 'burned') el.innerText = `${Math.floor(val)}%`;
                else if(prop === 'water' || prop === 'coins') el.innerText = Math.floor(val);
                else el.innerText = val;
            });
        });

        this.store.subscribe('water', (val) => {
            if(this.ui.waterFill) {
                const pct = (val / this.state.maxWater) * 100;
                this.ui.waterFill.style.transform = `scaleX(${pct / 100})`;
            }
            if(this.ui.rainBtn) {
                if (val >= CONFIG.costs.rain) this.ui.rainBtn.classList.remove('locked');
                else this.ui.rainBtn.classList.add('locked');
            }
        });
    }

    generateGrid() {
        if(!this.ui.grid) return;
        this.ui.grid.innerHTML = '';
        for (let i = 0; i < CONFIG.gridSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell';
            cell.innerHTML = '<div class="cell-content">🏢</div>';
            cell.dataset.hp = 0;
            
            const interact = (e) => {
                // e.preventDefault(); // removed to allow scrolling if needed
                const rect = cell.getBoundingClientRect();
                this.handleCellClick(i, cell, rect.left + rect.width/2, rect.top + rect.height/2);
            };
            
            cell.addEventListener('touchstart', interact, {passive: true});
            cell.addEventListener('mousedown', interact);
            
            this.ui.grid.appendChild(cell);
            this.cells.push(cell);
        }
    }

    handleCellClick(index, el, x, y) {
        const hp = parseInt(el.dataset.hp);
        
        if (hp > 0) {
            if (this.state.water >= 5) {
                this.state.water -= 5;
                const power = CONFIG.levels.pump[this.state.upgrades.pump] + 20;
                const newHp = Math.max(0, hp - power);
                
                el.dataset.hp = newHp;
                this.fx.spawn(x, y, 'water');
                Haptic.impact('light');

                if (newHp <= 0) {
                    this.clearFire(el, x, y);
                }
            } else {
                Haptic.notify('error');
            }
        }
    }

    clearFire(el, x, y) {
        el.className = 'cell';
        el.querySelector('.cell-content').innerText = '🏢';
        const reward = 10 + (this.state.upgrades.pump * 2);
        this.state.coins += reward;
        this.fx.floatText(x, y - 20, `+${reward}`);
        Haptic.notify('success');
    }

    startFire(el) {
        el.dataset.hp = 100;
        el.className = 'cell fire';
        el.querySelector('.cell-content').innerText = '🔥';
        const rect = el.getBoundingClientRect();
        this.fx.spawn(rect.left + 20, rect.top + 20, 'fire');
    }

    activateRain() {
        if (this.state.water >= CONFIG.costs.rain) {
            this.state.water -= CONFIG.costs.rain;
            Haptic.notify('success');
            
            const interval = setInterval(() => {
                this.fx.spawn(Math.random() * window.innerWidth, -10, 'rain');
            }, 50);

            setTimeout(() => {
                clearInterval(interval);
                this.cells.forEach(c => {
                    if (parseInt(c.dataset.hp) > 0) {
                        const rect = c.getBoundingClientRect();
                        c.dataset.hp = 0;
                        this.clearFire(c, rect.left + 20, rect.top + 20);
                    }
                });
            }, 1000);
        }
    }

    manualRefill() {
        if (this.state.water < this.state.maxWater) {
            this.state.water = Math.min(this.state.water + 15, this.state.maxWater);
            Haptic.select();
        }
    }

    gameLoop(timestamp) {
        const dt = (timestamp - this.lastTime) / 1000;
        this.lastTime = timestamp;

        // Regen
        if (this.state.water < this.state.maxWater) {
            this.state.water = Math.min(this.state.water + (CONFIG.regenRate * dt), this.state.maxWater);
        }

        // Fire Logic
        const burning = this.cells.filter(c => parseInt(c.dataset.hp) > 0);
        this.state.burnedPercent = Math.floor((burning.length / CONFIG.gridSize) * 100);
        
        if (Math.random() < CONFIG.fireSpreadChance && burning.length < CONFIG.gridSize) {
            const safe = this.cells.filter(c => parseInt(c.dataset.hp) === 0);
            if (safe.length > 0) {
                const target = safe[Math.floor(Math.random() * safe.length)];
                this.startFire(target);
            }
        }

        // Save
        if (Date.now() - this.state.lastSave > CONFIG.autoSaveInterval) {
            this.store.save();
            this.state.lastSave = Date.now();
        }

        requestAnimationFrame((t) => this.gameLoop(t));
    }

    renderShop() {
        if(!this.ui.shop) return;
        const items = [
            { id: 'pump', name: 'Гидро-Пушка', icon: '🔫', desc: 'Мощность струи' },
            { id: 'tank', name: 'Цистерна', icon: '🛢️', desc: 'Запас воды' }
        ];

        this.ui.shop.innerHTML = items.map(item => `
            <div class="shop-item">
                <div class="item-icon">${item.icon}</div>
                <div class="item-info">
                    <h4>${item.name} <small>Lvl <span data-bind-upgrade="${item.id}">1</span></small></h4>
                    <p>${item.desc}</p>
                </div>
                <button class="btn-buy" onclick="window.Game.buyUpgrade('${item.id}')">
                    <span id="cost-${item.id}">...</span> 🪙
                </button>
            </div>
        `).join('');
        this.updateShopPrices();
    }

    buyUpgrade(id) {
        const lvl = this.state.upgrades[id];
        const cost = Math.floor(CONFIG.costs[id].base * Math.pow(CONFIG.costs[id].growth, lvl));
        
        if (this.state.coins >= cost) {
            this.state.coins -= cost;
            this.state.upgrades[id]++;
            
            if (id === 'tank') this.state.maxWater = 100 + CONFIG.levels.tank[this.state.upgrades[id] || 5];
            
            Haptic.notify('success');
            this.updateShopPrices();
            this.store.save(); 
        } else {
            Haptic.notify('error');
        }
    }

    updateShopPrices() {
        ['pump', 'tank'].forEach(id => {
            const lvl = this.state.upgrades[id];
            const cost = Math.floor(CONFIG.costs[id].base * Math.pow(CONFIG.costs[id].growth, lvl));
            const btn = document.getElementById(`cost-${id}`);
            if (btn) btn.innerText = cost;
            document.querySelectorAll(`[data-bind-upgrade="${id}"]`).forEach(el => el.innerText = lvl);
        });
    }

    setupNavigation() {
        this.ui.navs.forEach(btn => {
            btn.addEventListener('click', () => {
                const targetId = btn.dataset.target;
                this.ui.views.forEach(v => v.classList.remove('active'));
                const target = document.getElementById(targetId);
                if(target) target.classList.add('active');
                
                this.ui.navs.forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                Haptic.select();
            });
        });
        
        const lb = document.getElementById('leaderboard-list');
        if(lb) {
            const names = ['FireMaster', 'SaveCity', 'Hero123', 'WaterBoy'];
            lb.innerHTML = names.map((n, i) => `
                <div class="leader-item">
                    <div style="font-weight:bold; width:30px">#${i+2}</div>
                    <div style="flex:1">${n}</div>
                    <div style="color:#ffd60a">${15000 - (i*1000)}</div>
                </div>
            `).join('');
        }
    }
}

// --- SAFE STARTUP ---
document.addEventListener('DOMContentLoaded', () => {
    try {
        window.Game = new GameController();
        window.Game.init();
    } catch (e) {
        console.error("Game Init Failed:", e);
        // Force hide loader if error
        document.getElementById('loader').style.display = 'none';
        alert("Ошибка запуска игры. Обновите страницу.");
    }
});
