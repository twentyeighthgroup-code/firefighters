const tg = window.Telegram.WebApp;
try { tg.expand(); tg.disableVerticalSwipes(); } catch(e) {}

// --- FIX: Haptic Mock для ПК ---
if (!tg.HapticFeedback) {
    tg.HapticFeedback = {
        impactOccurred: () => {},
        notificationOccurred: () => {},
        selectionChanged: () => {}
    };
}

// --- PARTICLE SYSTEM ---
class ParticleSystem {
    constructor() {
        this.canvas = document.getElementById('fx-canvas');
        if (!this.canvas) return;
        this.ctx = this.canvas.getContext('2d');
        this.particles = [];
        this.resize();
        window.addEventListener('resize', () => this.resize());
        this.animate();
    }
    resize() { this.canvas.width = window.innerWidth; this.canvas.height = window.innerHeight; }
    spawn(x, y, type = 'water', count = 8) {
        for (let i = 0; i < count; i++) {
            this.particles.push({
                x: x, y: y,
                vx: (Math.random() - 0.5) * (type==='rain'?2:10),
                vy: (Math.random() - 0.5) * (type==='rain'?2:10),
                life: 1.0, type: type,
                size: Math.random() * 3 + 2
            });
        }
    }
    animate() {
        if (!this.ctx) return;
        this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
        for (let i = this.particles.length - 1; i >= 0; i--) {
            const p = this.particles[i];
            p.x += p.vx;
            p.y += p.vy;
            p.life -= 0.03;
            if (p.type === 'water') p.vy += 0.5; // Гравитация
            if (p.type === 'rain') p.vy += 10; // Быстрый дождь вниз
            else if (p.type === 'fire') p.vy -= 0.1; // Дым вверх

            this.ctx.fillStyle = p.type==='fire' ? `rgba(255, 69, 58, ${p.life})` : `rgba(10, 132, 255, ${p.life})`;
            this.ctx.beginPath(); this.ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); this.ctx.fill();
            if (p.life <= 0) this.particles.splice(i, 1);
        }
        requestAnimationFrame(() => this.animate());
    }
}

// --- GAME LOGIC ---
class GameApp {
    constructor() {
        this.state = {
            coins: 0,
            level: 1,
            water: 100, maxWater: 100,
            clickPower: 25,
            burned: 0,
            firesExtinguished: 0,
            upgrades: { pump: 1, tank: 1 },
            lastLogin: 0,
            streak: 0
        };
        this.config = { gridSize: 25, regenRate: 0.2 };
        this.cells = [];
        this.fx = new ParticleSystem();
    }

    start() {
        // Ждем загрузки DOM
        document.addEventListener('DOMContentLoaded', () => {
            this.ui = this.bindUI();
            this.init();
        });
    }

    bindUI() {
        const get = (id) => document.getElementById(id);
        return {
            coins: get('coins'), burned: get('burned'),
            grid: get('city-grid'), waterFill: get('water-fill'), waterText: get('water-text'),
            waterBtn: get('water-btn'), shopList: get('shop-list'),
            loader: get('loader'), app: get('app'),
            modalDaily: get('modal-daily'), dailyGrid: get('daily-grid'), btnDaily: get('btn-claim-daily'),
            abilityRain: get('ability-rain'),
            leaderboardList: get('leaderboard-list'), totalScore: get('total-score')
        };
    }

    init() {
        this.loadSave();
        this.simulateLoading();
        this.renderGrid();
        this.renderShop();
        this.renderLeaderboard();
        this.startLoop();
        this.checkDailyBonus();

        // Слушатели
        if(this.ui.waterBtn) this.ui.waterBtn.addEventListener('click', () => this.manualReload());
        if(this.ui.abilityRain) this.ui.abilityRain.addEventListener('click', () => this.activateRain());
    }

    simulateLoading() {
        setTimeout(() => {
            if(this.ui.loader) this.ui.loader.classList.add('hidden');
            if(this.ui.app) this.ui.app.classList.remove('hidden');
        }, 1500);
    }

    // --- NEW: Ежедневный бонус ---
    checkDailyBonus() {
        const now = new Date();
        const last = new Date(this.state.lastLogin);
        const isSameDay = now.getDate() === last.getDate() && now.getMonth() === last.getMonth();

        if (!isSameDay) {
            // Новый день
            if (now - last > 86400000 * 2) this.state.streak = 0; // Пропуск > 48ч - сброс
            
            const currentDay = Math.min(this.state.streak, 7); // Макс 7 дней
            this.renderDailyModal(currentDay);
            this.ui.modalDaily.classList.remove('hidden');
        }
    }

    renderDailyModal(dayIndex) {
        this.ui.dailyGrid.innerHTML = '';
        const rewards = [100, 200, 350, 500, 800, 1200, 2000, 5000];
        
        for(let i=0; i<8; i++) {
            const div = document.createElement('div');
            div.className = `day-item ${i < dayIndex ? 'claimed' : (i === dayIndex ? 'active' : '')}`;
            div.innerHTML = `День ${i+1} <span class="day-reward">+${rewards[i]}</span>`;
            this.ui.dailyGrid.appendChild(div);
        }

        this.ui.btnDaily.disabled = false;
        this.ui.btnDaily.onclick = () => {
            this.state.coins += rewards[dayIndex];
            this.state.lastLogin = Date.now();
            this.state.streak++;
            this.ui.modalDaily.classList.add('hidden');
            this.updateUI();
            this.saveData();
            tg.HapticFeedback.notificationOccurred('success');
        };
    }

    // --- NEW: Супер-способность ---
    activateRain() {
        if (this.state.water >= 50) {
            this.state.water -= 50;
            tg.HapticFeedback.notificationOccurred('success');
            
            // Визуал дождя
            for(let i=0; i<20; i++) {
                setTimeout(() => {
                    this.fx.spawn(Math.random() * window.innerWidth, 0, 'rain', 2);
                }, i * 50);
            }

            // Тушим всех
            this.cells.forEach(cell => {
                if(parseInt(cell.dataset.hp) > 0) {
                    cell.dataset.hp = 0;
                    this.extinguishFire(cell);
                }
            });
            this.updateUI();
        } else {
            tg.HapticFeedback.notificationOccurred('error');
            alert("Нужно 50 воды для вызова дождя!");
        }
    }

    // --- GAMEPLAY ---
    renderGrid() {
        this.ui.grid.innerHTML = '';
        this.cells = [];
        for (let i = 0; i < this.config.gridSize; i++) {
            const cell = document.createElement('div');
            cell.className = 'cell house';
            cell.dataset.hp = 0;
            
            const handle = (e) => {
                const rect = cell.getBoundingClientRect();
                this.handleInteraction(i, rect.left + rect.width/2, rect.top + rect.height/2);
            };
            cell.addEventListener('touchstart', (e) => { e.preventDefault(); handle(e); });
            cell.addEventListener('mousedown', handle);
            this.ui.grid.appendChild(cell);
            this.cells.push(cell);
        }
        this.igniteRandom();
    }

    handleInteraction(index, x, y) {
        const cell = this.cells[index];
        const hp = parseInt(cell.dataset.hp);

        if (hp > 0) {
            if (this.state.water >= 5) {
                this.state.water -= 5;
                const newHp = Math.max(0, hp - this.state.clickPower);
                cell.dataset.hp = newHp;
                this.fx.spawn(x, y, 'water');
                tg.HapticFeedback.impactOccurred('medium');
                if (newHp === 0) this.extinguishFire(cell);
                this.updateUI();
            } else {
                tg.HapticFeedback.notificationOccurred('error');
            }
        }
    }

    extinguishFire(cell) {
        cell.className = 'cell house';
        this.state.coins += 15;
        this.state.firesExtinguished++;
        this.updateUI();
    }

    igniteRandom() {
        const safe = this.cells.filter(c => c.dataset.hp == 0);
        if (safe.length > 0) {
            const t = safe[Math.floor(Math.random() * safe.length)];
            t.dataset.hp = 100;
            t.className = 'cell fire';
        }
    }

    manualReload() {
        if (this.state.water < this.state.maxWater) {
            this.state.water = Math.min(this.state.water + 15, this.state.maxWater);
            tg.HapticFeedback.selectionChanged();
            this.updateUI();
        }
    }

    startLoop() {
        setInterval(() => {
            if (this.state.water < this.state.maxWater) this.state.water += this.config.regenRate;
            
            const burnCount = this.cells.filter(c => c.dataset.hp > 0).length;
            this.state.burned = Math.floor((burnCount / this.config.gridSize) * 100);
            
            if (Math.random() < 0.02 + (this.state.burned/3000)) this.igniteRandom();
            
            this.updateUI();
        }, 100);
        setInterval(() => this.saveData(), 5000);
    }

    // --- UI/UX ---
    renderShop() {
        const items = [
            { id: 'pump', name: 'Насос V8', desc: '+5 Силы', cost: 150 },
            { id: 'tank', name: 'Бак XL', desc: '+50 Воды', cost: 300 }
        ];
        this.ui.shopList.innerHTML = items.map(i => `
            <div class="shop-item">
                <div style="flex:1">
                    <h4>${i.name} <small>(Ур. ${this.state.upgrades[i.id]})</small></h4>
                    <p>${i.desc}</p>
                </div>
                <button class="buy-btn" onclick="app.buy('${i.id}', ${i.cost})">
                    ${Math.floor(i.cost * Math.pow(1.5, this.state.upgrades[i.id]))} 🪙
                </button>
            </div>
        `).join('');
    }

    renderLeaderboard() {
        const players = [
            { name: "Alex Fire", score: 15400 },
            { name: "Sam Hero", score: 12200 },
            { name: "Maria_99", score: 9800 }
        ];
        this.ui.leaderboardList.innerHTML = players.map((p, i) => `
            <div class="leader-row">
                <span class="rank">#${i+1}</span>
                <span class="name">${p.name}</span>
                <span class="score">${p.score}</span>
            </div>
        `).join('');
    }

    buy(id, base) {
        const price = Math.floor(base * Math.pow(1.5, this.state.upgrades[id]));
        if (this.state.coins >= price) {
            this.state.coins -= price;
            this.state.upgrades[id]++;
            if(id === 'pump') this.state.clickPower += 5;
            if(id === 'tank') this.state.maxWater += 50;
            this.renderShop();
            this.updateUI();
            tg.HapticFeedback.notificationOccurred('success');
        }
    }

    inviteFriend() {
        const link = "https://t.me/share/url?url=https://t.me/твоя_игра_бот&text=Спаси город вместе со мной!";
        tg.openTelegramLink(link);
    }

    switchTab(id) {
        document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
        document.getElementById(`tab-${id}`).classList.add('active');
        document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
        
        const map = { 'game': 0, 'shop': 1, 'social': 2 };
        document.querySelectorAll('.nav-btn')[map[id]].classList.add('active');
        tg.HapticFeedback.selectionChanged();
    }

    updateUI() {
        this.ui.coins.innerText = Math.floor(this.state.coins);
        this.ui.totalScore.innerText = Math.floor(this.state.coins); // Для лидерборда
        this.ui.burned.innerText = this.state.burned + '%';
        this.ui.burned.style.color = this.state.burned > 50 ? 'red' : 'white';
        const pct = (this.state.water / this.state.maxWater) * 100;
        this.ui.waterFill.style.width = `${pct}%`;
        this.ui.waterText.innerText = `${Math.floor(this.state.water)}/${this.state.maxWater}`;
    }

    saveData() { localStorage.setItem('FireHeroV3', JSON.stringify(this.state)); }
    loadSave() {
        try { this.state = { ...this.state, ...JSON.parse(localStorage.getItem('FireHeroV3')) }; } catch(e) {}
    }
}

window.app = new GameApp();
window.app.start();
