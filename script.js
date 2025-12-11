const tg = window.Telegram.WebApp;
tg.expand();
tg.enableClosingConfirmation();

// --- PARTICLE SYSTEM (Visual Juice) ---
class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('fx-canvas');
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }

    resize() {
        this.canvas.width = window.innerWidth;
        this.canvas.height = window.innerHeight;
    }

    spawn(x, y, type = 'water') {
        const count = type === 'water' ? 8 : 12;
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * 10,
                vy: (Math.random() - 0.5) * 10,
                life: 1.0,
                type: type,
                size: Math.random() * 4 + 2
            });
        }
    }

    animate() {
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.04;
            
            if (p.type === 'water') {
                p.vy += 0.5; // Gravity
                this.ctx.fillStyle = `rgba(10, 132, 255, ${p.life})`;
            } else {
                p.vy -= 0.1; // Smoke/Fire floats up
                this.ctx.fillStyle = `rgba(255, 69, 58, ${p.life})`;
            }

            this.ctx.beginPath();
            this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            this.ctx.fill();

            if (p.life <= 0) this.particles.splice(i, 1);
        }
        requestAnimationFrame(() => this.animate());
    }
}

// --- GAME CORE ---
class GameApp {
    constructor() {
        this.state = {
            coins: 0,
            level: 1,
            xp: 0,
            water: 100,
            maxWater: 100,
            clickPower: 25,
            autoIncome: 0,
            burned: 0,
            firesExtinguished: 0,
            upgrades: {
                pump: 1,
                tank: 1,
                station: 0
            }
        };

        this.config = {
            gridSize: 25,
            regenRate: 0.2, // Восстановление воды в тик
            fireSpreadChance: 0.02
        };

        this.cells = [];
        this.fx = new ParticleSystem();
        this.ui = this.bindUI();
        
        this.init();
    }

    bindUI() {
        return {
            coins: document.getElementById('coins'),
            burned: document.getElementById('burned'),
            grid: document.getElementById('city-grid'),
            waterFill: document.getElementById('water-fill'),
            waterText: document.getElementById('water-text'),
            waterBtn: document.getElementById('water-btn'),
            shopList: document.getElementById('shop-list'),
            loader: document.getElementById('loader'),
            app: document.getElementById('app'),
            questProgress: document.getElementById('quest-1-prog'),
            questBtn: document.getElementById('quest-1-btn'),
            passiveRate: document.getElementById('passive-rate')
        };
    }

    async init() {
        this.simulateLoading();
        this.loadSave(); // Загрузка из LocalStorage (в реале - Cloud)
        this.renderGrid();
        this.renderShop();
        this.startLoop();
        
        // Слушатели
        this.ui.waterBtn.addEventListener('click', () => this.manualReload());
        this.ui.questBtn.addEventListener('click', () => this.claimQuest());
    }

    simulateLoading() {
        let progress = 0;
        const bar = document.querySelector('.loader-progress');
        const interval = setInterval(() => {
            progress += 5;
            bar.style.width = `${progress}%`;
            if (progress >= 100) {
                clearInterval(interval);
                this.ui.loader.classList.add('opacity-0');
                setTimeout(() => {
                    this.ui.loader.classList.add('hidden');
                    this.ui.app.classList.remove('hidden');
                }, 500);
            }
        }, 50);
    }

    renderGrid() {
        this.ui.grid.innerHTML = '';
        this.cells = [];
        for (let i = 0; i < this.config.gridSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell house';
            cell.dataset.hp = 0;
            
            // Используем touchstart для мгновенного отклика на мобильных
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault();
                const rect = cell.getBoundingClientRect();
                this.handleInteraction(i, rect.left + rect.width/2, rect.top + rect.height/2);
            });
            
            // Фоллбек для мышки
            cell.addEventListener('mousedown', (e) => {
                const rect = cell.getBoundingClientRect();
                this.handleInteraction(i, rect.left + rect.width/2, rect.top + rect.height/2);
            });

            this.ui.grid.appendChild(cell);
            this.cells.push(cell);
        }
        this.igniteRandom();
    }

    handleInteraction(index, x, y) {
        const cell = this.cells[index];
        const hp = parseInt(cell.dataset.hp);

        if (hp > 0) {
            // Тушим огонь
            if (this.state.water >= 5) {
                this.state.water -= 5;
                const damage = this.state.clickPower;
                const newHp = Math.max(0, hp - damage);
                
                cell.dataset.hp = newHp;
                this.fx.spawn(x, y, 'water');
                tg.HapticFeedback.impactOccurred('medium');

                if (newHp === 0) {
                    this.extinguishFire(cell);
                }
                this.updateUI();
            } else {
                tg.HapticFeedback.notificationOccurred('error');
                this.ui.waterBtn.parentElement.classList.add('shake'); // Анимация всего блока
                setTimeout(() => this.ui.waterBtn.parentElement.classList.remove('shake'), 500);
            }
        } else {
            // Просто клик по дому (пасхалка или звук)
            // tg.HapticFeedback.selectionChanged();
        }
    }

    extinguishFire(cell) {
        cell.className = 'cell house';
        this.state.coins += 10 + (this.state.level * 2);
        this.state.firesExtinguished++;
        tg.HapticFeedback.notificationOccurred('success');
        
        // Проверка квеста
        this.updateQuestUI();
    }

    manualReload() {
        if (this.state.water < this.state.maxWater) {
            this.state.water = Math.min(this.state.water + 15, this.state.maxWater);
            tg.HapticFeedback.selectionChanged();
            this.updateUI();
        }
    }

    igniteRandom() {
        const safeCells = this.cells.filter(c => c.dataset.hp == 0);
        if (safeCells.length > 0) {
            const target = safeCells[Math.floor(Math.random() * safeCells.length)];
            target.dataset.hp = 100;
            target.className = 'cell fire';
            
            const rect = target.getBoundingClientRect();
            this.fx.spawn(rect.left + 20, rect.top + 20, 'fire');
        }
    }

    startLoop() {
        setInterval(() => {
            // 1. Медленное восстановление воды
            if (this.state.water < this.state.maxWater) {
                this.state.water = Math.min(this.state.water + this.config.regenRate, this.state.maxWater);
            }

            // 2. Распространение огня
            const burningCount = this.cells.filter(c => c.dataset.hp > 0).length;
            this.state.burned = Math.floor((burningCount / this.config.gridSize) * 100);
            
            // Шанс нового возгорания зависит от текущего %
            const chance = this.config.fireSpreadChance + (this.state.burned / 5000);
            if (Math.random() < chance) {
                this.igniteRandom();
            }

            // 3. Пассивный доход
            if (this.state.autoIncome > 0) {
                this.state.coins += this.state.autoIncome / 10; // делим на 10 т.к. тик 100мс
            }

            this.updateUI();
        }, 100); // Тик каждые 100мс (10 раз в секунду)
        
        // Автосохранение каждые 10 сек
        setInterval(() => this.saveData(), 10000);
    }

    renderShop() {
        const items = [
            { id: 'pump', name: 'Турбо-насос', desc: '+5 к силе клика', cost: 100, icon: '🔫' },
            { id: 'tank', name: 'Бак 2000', desc: '+50 к объему воды', cost: 250, icon: '🛢️' },
            { id: 'station', name: 'Найм бригады', desc: '+2 монеты/сек (AFK)', cost: 1000, icon: '👨‍🚒' }
        ];

        this.ui.shopList.innerHTML = '';
        items.forEach(item => {
            const div = document.createElement('div');
            div.className = 'shop-item';
            div.innerHTML = `
                <div class="item-icon">${item.icon}</div>
                <div class="item-details">
                    <h4>${item.name} <small>(Ур. <span id="lvl-${item.id}">${this.state.upgrades[item.id]}</span>)</small></h4>
                    <p>${item.desc}</p>
                </div>
                <button class="buy-btn" id="btn-${item.id}" onclick="app.buy('${item.id}', ${item.cost})">
                    ${this.getPrice(item.id, item.cost)} 🪙
                </button>
            `;
            this.ui.shopList.appendChild(div);
        });
    }

    getPrice(id, baseCost) {
        return Math.floor(baseCost * Math.pow(1.5, this.state.upgrades[id]));
    }

    buy(id, baseCost) {
        const price = this.getPrice(id, baseCost);
        if (this.state.coins >= price) {
            this.state.coins -= price;
            this.state.upgrades[id]++;
            
            // Применяем эффекты
            if (id === 'pump') this.state.clickPower += 5;
            if (id === 'tank') this.state.maxWater += 50;
            if (id === 'station') this.state.autoIncome += 2;

            tg.HapticFeedback.notificationOccurred('success');
            this.renderShop(); // Перерисовать цены
            this.updateUI();
        } else {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        document.getElementById(`tab-${tabId}`).classList.add('active');
        // Находим кнопку (грязно, но быстро)
        const btns = document.querySelectorAll('.nav-btn');
        if(tabId === 'game') btns[0].classList.add('active');
        if(tabId === 'shop') btns[1].classList.add('active');
        if(tabId === 'hq') btns[2].classList.add('active');
        
        tg.HapticFeedback.selectionChanged();
    }

    updateQuestUI() {
        const target = 100;
        const current = Math.min(this.state.firesExtinguished, target);
        this.ui.questProgress.value = current;
        
        if (current >= target && !this.ui.questBtn.classList.contains('claimed')) {
            this.ui.questBtn.classList.remove('disabled');
            this.ui.questBtn.style.background = 'var(--success)';
            this.ui.questBtn.style.color = '#fff';
        }
    }

    claimQuest() {
        if (!this.ui.questBtn.classList.contains('disabled') && !this.ui.questBtn.classList.contains('claimed')) {
            this.state.coins += 500;
            this.ui.questBtn.innerText = 'Получено ✅';
            this.ui.questBtn.classList.add('claimed', 'disabled');
            tg.HapticFeedback.notificationOccurred('success');
        }
    }

    updateUI() {
        this.ui.coins.innerText = Math.floor(this.state.coins);
        this.ui.burned.innerText = this.state.burned + '%';
        this.ui.burned.style.color = this.state.burned > 50 ? 'var(--danger)' : 'var(--text-main)';
        
        const pct = (this.state.water / this.state.maxWater) * 100;
        this.ui.waterFill.style.width = `${pct}%`;
        this.ui.waterText.innerText = `${Math.floor(this.state.water)}/${this.state.maxWater}`;
        
        this.ui.passiveRate.innerText = this.state.autoIncome.toFixed(1);
    }

    saveData() {
        const json = JSON.stringify(this.state);
        localStorage.setItem('FireHeroPro_v1', json);
        // TODO: Здесь добавить tg.CloudStorage.setItem для реального продакшена
    }

    loadSave() {
        const save = localStorage.getItem('FireHeroPro_v1');
        if (save) {
            const data = JSON.parse(save);
            // Merge state to avoid breaking on updates
            this.state = { ...this.state, ...data };
        }
    }
}

window.app = new GameApp();
