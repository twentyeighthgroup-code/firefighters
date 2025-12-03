const tg = window.Telegram.WebApp;
tg.expand(); // Раскрыть на весь экран

class FirefighterGame {
    constructor() {
        // Состояние игры
        this.coins = 0;
        this.water = 100;
        this.maxWater = 100;
        this.waterRecovery = 0.5; // Восстановление в тик
        this.firePower = 20; // Урон по огню за клик
        this.burnedPercent = 0;
        this.level = 1;
        this.autoDrones = 0;

        // Цены
        this.costs = { hose: 50, tank: 100, auto: 500 };
        
        // Сетка
        this.gridSize = 25; // 5x5
        this.cells = [];
        this.fires = []; // Индексы горящих клеток

        // Элементы UI
        this.ui = {
            coins: document.getElementById('coins'),
            burned: document.getElementById('burned'),
            waterBar: document.getElementById('water-level'),
            grid: document.getElementById('city-grid'),
            shopModal: document.getElementById('shop-modal'),
            waterControl: document.querySelector('.water-control')
        };

        this.init();
    }

    init() {
        this.loadProgress();
        this.createGrid();
        this.setupListeners();
        
        // Игровой цикл
        setInterval(() => this.gameLoop(), 1000); // Каждую секунду
        setInterval(() => this.regenWater(), 100); // Регенерация воды
        
        // Дроны
        setInterval(() => this.droneWork(), 2000);
    }

    createGrid() {
        this.ui.grid.innerHTML = '';
        this.cells = [];
        for (let i = 0; i < this.gridSize; i++) {
            const cell = document.createElement('div');
            cell.classList.add('cell', 'house');
            cell.dataset.index = i;
            
            // ХП огня (если 0 - огня нет, 100 - полный огонь)
            cell.dataset.fireHp = 0;
            
            cell.addEventListener('touchstart', (e) => {
                e.preventDefault(); // Убрать зум
                this.extinguish(i);
            });
            cell.addEventListener('click', () => this.extinguish(i));
            
            this.ui.grid.appendChild(cell);
            this.cells.push(cell);
        }
        this.startFire(); // Первый пожар
    }

    setupListeners() {
        document.getElementById('shop-btn').onclick = () => this.ui.shopModal.classList.remove('hidden');
        document.getElementById('close-shop').onclick = () => this.ui.shopModal.classList.add('hidden');
        
        // Клик по баку для быстрой перезарядки
        this.ui.waterControl.addEventListener('click', () => {
            this.water = Math.min(this.water + 10, this.maxWater);
            this.updateUI();
        });

        this.updateShopUI();
    }

    startFire() {
        // Выбираем случайную мирную клетку и поджигаем
        const peaceful = this.cells.filter(c => c.dataset.fireHp == 0);
        if (peaceful.length > 0) {
            const randomCell = peaceful[Math.floor(Math.random() * peaceful.length)];
            this.ignite(randomCell);
        }
    }

    ignite(cell) {
        cell.dataset.fireHp = 100;
        cell.classList.remove('house', 'saved');
        cell.classList.add('fire');
        tg.HapticFeedback.notificationOccurred('warning');
    }

    extinguish(index) {
        const cell = this.cells[index];
        let hp = parseInt(cell.dataset.fireHp);

        if (hp > 0 && this.water >= 5) {
            // Тушим
            this.water -= 5;
            hp -= this.firePower;
            tg.HapticFeedback.impactOccurred('light');

            if (hp <= 0) {
                // Потушили
                hp = 0;
                cell.classList.remove('fire');
                cell.classList.add('house', 'saved');
                this.coins += 10 + (this.level * 2);
                this.checkLevelUp();
                tg.HapticFeedback.notificationOccurred('success');
            } else {
                // Эффект пара (визуально можно доработать)
            }
            
            cell.dataset.fireHp = hp;
            this.updateUI();
        } else if (this.water < 5) {
             // Нет воды
             this.ui.waterControl.classList.add('shake'); // Добавить CSS анимацию тряски
             setTimeout(() => this.ui.waterControl.classList.remove('shake'), 500);
        }
    }

    regenWater() {
        if (this.water < this.maxWater) {
            this.water += this.waterRecovery;
            if (this.water > this.maxWater) this.water = this.maxWater;
            this.updateUI();
        }
    }

    gameLoop() {
        // Распространение огня
        const burning = this.cells.filter(c => c.dataset.fireHp > 0);
        this.burnedPercent = Math.floor((burning.length / this.gridSize) * 100);

        if (Math.random() < 0.3 + (this.level * 0.05)) {
            this.startFire();
        }
        
        this.saveProgress();
        this.updateUI();
    }

    droneWork() {
        if (this.autoDrones > 0) {
            for(let i=0; i < this.autoDrones; i++) {
                const burning = this.cells.filter(c => c.dataset.fireHp > 0);
                if(burning.length > 0) {
                    const target = burning[Math.floor(Math.random() * burning.length)];
                    const idx = parseInt(target.dataset.index);
                    // Дроны тушат без траты воды игрока, но медленно
                    let hp = parseInt(target.dataset.fireHp);
                    hp -= 20;
                    if (hp <= 0) {
                        hp = 0;
                        target.classList.remove('fire');
                        target.classList.add('house', 'saved');
                        this.coins += 5;
                    }
                    target.dataset.fireHp = hp;
                }
            }
            this.updateUI();
        }
    }

    buyUpgrade(type) {
        if (this.coins >= this.costs[type]) {
            this.coins -= this.costs[type];
            
            switch(type) {
                case 'hose':
                    this.firePower += 10;
                    this.costs.hose = Math.floor(this.costs.hose * 1.5);
                    break;
                case 'tank':
                    this.maxWater += 50;
                    this.water = this.maxWater;
                    this.costs.tank = Math.floor(this.costs.tank * 1.5);
                    break;
                case 'auto':
                    this.autoDrones++;
                    this.costs.auto = Math.floor(this.costs.auto * 2);
                    break;
            }
            
            tg.HapticFeedback.notificationOccurred('success');
            this.updateUI();
            this.updateShopUI();
            this.saveProgress();
        } else {
            tg.HapticFeedback.notificationOccurred('error');
        }
    }

    checkLevelUp() {
        if (this.coins > this.level * 500) {
            this.level++;
            document.getElementById('level').innerText = this.level;
            // Усложнение игры можно добавить здесь
        }
    }

    updateUI() {
        this.ui.coins.innerText = Math.floor(this.coins);
        this.ui.burned.innerText = this.burnedPercent + '%';
        this.ui.burned.style.color = this.burnedPercent > 50 ? 'red' : 'white';
        
        const pct = (this.water / this.maxWater) * 100;
        this.ui.waterBar.style.width = pct + '%';
        this.ui.waterBar.style.backgroundColor = pct < 20 ? 'red' : 'var(--water-color)';
    }

    updateShopUI() {
        document.getElementById('cost-hose').innerText = this.costs.hose;
        document.getElementById('cost-tank').innerText = this.costs.tank;
        document.getElementById('cost-auto').innerText = this.costs.auto;
    }

    saveProgress() {
        const data = {
            coins: this.coins,
            level: this.level,
            costs: this.costs,
            firePower: this.firePower,
            maxWater: this.maxWater,
            autoDrones: this.autoDrones
        };
        localStorage.setItem('fireHeroSave', JSON.stringify(data));
    }

    loadProgress() {
        const saved = localStorage.getItem('fireHeroSave');
        if (saved) {
            const data = JSON.parse(saved);
            this.coins = data.coins || 0;
            this.level = data.level || 1;
            this.costs = data.costs || this.costs;
            this.firePower = data.firePower || 20;
            this.maxWater = data.maxWater || 100;
            this.autoDrones = data.autoDrones || 0;
            document.getElementById('level').innerText = this.level;
        }
    }
}

// Запуск игры
window.game = new FirefighterGame();
