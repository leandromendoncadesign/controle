// CÓDIGO COMPLETO E FINAL - Com todas as correções e melhorias
document.addEventListener('DOMContentLoaded', () => {
    const App = {
        state: {
            currentView: 'resumos',
            currentMonthYear: '',
            allTransactions: [],
            accounts: [],
            categories: [],
            people: [],
            establishments: [],
            listeners: [],
            charts: {},
            isLoading: true,
            availableMonths: [],
            planningData: { receitas: [], despesas: [] },
            dashboardChartType: 'category',
            movementsSort: { key: 'date', order: 'desc' },
            movementsFilter: { type: 'all', accountId: 'all' },
            showArchived: false,
            currentReport: null,
        },
        config: {
            firebase: { apiKey: "AIzaSyBbJnhZuL5f9v7KYjJRa1uGY9g17JXkYlo", authDomain: "dadosnf-38b2f.firebaseapp.com", projectId: "dadosnf-38b2f", storageBucket: "dadosnf-38b2f.firebasestorage.app", messagingSenderId: "103044936313", appId: "1:103044936313:web:e0f1ad680cd31445a1daa8" }
        },
        elements: {
            planningKeydownListener: null
        },
        planningSaveTimeout: null,
        closeModalTimeout: null,

        // ======================================================================
        // INICIALIZAÇÃO E NAVEGAÇÃO
        // ======================================================================
        init() {
            console.log('App iniciando...');
            this.elements = {
                body: document.body,
                appRoot: document.getElementById('app-root'),
                authContainer: document.getElementById('auth-container'),
                viewContainer: document.getElementById('view-container'),
                logoutButton: document.getElementById('logout-button'),
                navLinks: document.querySelectorAll('.nav-link'),
                monthYearSelector: document.getElementById('month-year-selector'),
                monthSelectorContainer: document.getElementById('month-selector-container'),
                prevMonthBtn: document.getElementById('prev-month-btn'),
                nextMonthBtn: document.getElementById('next-month-btn'),
                modalContainer: document.getElementById('modal-container'),
                toastContainer: document.getElementById('toast-container'),
                planningKeydownListener: null
            };
            if (!firebase.apps.length) firebase.initializeApp(this.config.firebase);
            this.db = firebase.firestore();
            this.db.enablePersistence({ synchronizeTabs: true }).catch(err => console.log('Persistência não suportada: ', err));
            this.checkLogin();
        },

        attachEventListeners() {
            console.log('Anexando escutadores de eventos...');
            this.elements.logoutButton.onclick = () => this.handleLogout();
            this.elements.navLinks.forEach(link => link.onclick = (e) => this.navigate(e));
            this.elements.monthYearSelector.onchange = (e) => this.changeMonth(e.target.value);
            this.elements.prevMonthBtn.onclick = () => this.navigateMonth(-1);
            this.elements.nextMonthBtn.onclick = () => this.navigateMonth(1);

            this.elements.body.addEventListener('click', this.handleViewContainerClick.bind(this));
            this.elements.body.addEventListener('submit', this.handleFormSubmit.bind(this));
            this.elements.viewContainer.addEventListener('input', this.handleStateUpdateOnInput.bind(this));
            this.elements.viewContainer.addEventListener('change', this.handleSaveOnChange.bind(this));
        },

        checkLogin() {
            const loginForm = document.getElementById('login-form');
            if (!loginForm) return;
            const emailInput = document.getElementById('email-input');
            const passwordInput = document.getElementById('password-input');
            const errorMessage = document.getElementById('error-message');
            const attemptLogin = () => {
                if (passwordInput.value === '1206') {
                    localStorage.setItem('isLoggedInFinanceiro', 'true');
                    startApp();
                } else {
                    errorMessage.textContent = 'Senha incorreta.';
                }
            };

            const startApp = () => {
                this.elements.authContainer.style.display = 'none';
                this.applySavedSettings(); // Aplica as configurações salvas
                this.elements.appRoot.classList.add('is-visible');
                this.elements.body.classList.remove('is-loading');
                this.attachEventListeners();
                this.setCurrentMonthYear();
            };
            const showLogin = () => {
                this.elements.authContainer.style.display = 'flex';
                this.elements.appRoot.style.visibility = 'hidden';
                this.elements.body.classList.remove('is-loading');
                emailInput.focus();
            };
            loginForm.onsubmit = (e) => {
                e.preventDefault();
                attemptLogin();
            };
            if (localStorage.getItem('isLoggedInFinanceiro') === 'true') {
                startApp();
            } else {
                showLogin();
            }
        },

        handleLogout() {
            localStorage.removeItem('isLoggedInFinanceiro');
            this.detachListeners();
            window.location.reload();
        },

        navigate(e, data = null) {
            if (this.state.currentView === 'lancar') {
                const form = document.getElementById('lancar-form');
                if (form) {
                    const formData = new FormData(form);
                    const formState = Object.fromEntries(formData.entries());
                    if (Object.values(formState).some(val => val !== '')) {
                        formState.formType = form.dataset.type;
                        sessionStorage.setItem('lancamentoFormState', JSON.stringify(formState));
                    } else {
                        sessionStorage.removeItem('lancamentoFormState');
                    }
                }
            }

            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            
            if (this.state.currentView === view && !data) return;

            this.state.currentView = view;
            this.render();
            
            if (view === 'lancar' && data) {
                this.renderLancamentoForm(data.formType, data.prefill);
            }
        },

        setCurrentMonthYear() {
            const now = new Date();
            this.state.currentMonthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
            this.fetchAllData();
        },

        changeMonth(monthYear) {
            this.state.currentMonthYear = monthYear;
            this.renderCurrentView();
        },

        navigateMonth(direction) {
            const currentIndex = this.state.availableMonths.indexOf(this.state.currentMonthYear);
            const newIndex = currentIndex - direction;
            if (newIndex >= 0 && newIndex < this.state.availableMonths.length) {
                this.state.currentMonthYear = this.state.availableMonths[newIndex];
                this.elements.monthYearSelector.value = this.state.currentMonthYear;
                this.renderCurrentView();
            }
        },

        fetchAllData() {
            this.state.isLoading = true;
            this.renderCurrentView();
            this.detachListeners();
            const collections = {
                'financeiro_contas': 'accounts',
                'financeiro_categorias': 'categories',
                'financeiro_pessoas': 'people',
                'financeiro_estabelecimentos': 'establishments',
            };
            const promises = Object.entries(collections).map(([col, stateKey]) =>
                new Promise(resolve => {
                    const listener = this.db.collection(col).onSnapshot(snap => {
                        this.state[stateKey] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        if (!this.state.isLoading) {
                            const viewsToUpdate = ['accounts', 'settings', 'lancar', 'movements', 'invoices'];
                            if(viewsToUpdate.includes(this.state.currentView)) {
                                this.renderCurrentView();
                            }
                        }
                        resolve();
                    }, console.error);
                    this.state.listeners.push(listener);
                })
            );
            const transactionsListener = this.db.collection('financeiro_lancamentos').orderBy('date', 'desc').onSnapshot(snapshot => {
                this.state.allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.populateMonthSelector();
                Promise.all(promises).then(() => {
                    const wasLoading = this.state.isLoading;
                    this.state.isLoading = false;
                    const viewsToUpdate = ['resumos', 'movements', 'invoices', 'planning'];
                    if (wasLoading || viewsToUpdate.includes(this.state.currentView)) {
                        this.render();
                    }
                });
            }, console.error);
            this.state.listeners.push(transactionsListener);
        },

        populateMonthSelector() {
            const monthsSet = new Set();
            this.state.allTransactions.forEach(t => {
                if (t && t.date) {
                    const jsDate = this.getDateObject(t.date);
                    monthsSet.add(`${(jsDate.getMonth() + 1).toString().padStart(2, '0')}-${jsDate.getFullYear()}`);
                }
            });
            const now = new Date();
            monthsSet.add(`${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`);
            this.state.availableMonths = Array.from(monthsSet).sort((a, b) => {
                const [mA, yA] = a.split('-');
                const [mB, yB] = b.split('-');
                return new Date(yB, mB - 1) - new Date(yA, mA - 1);
            });
            const selector = this.elements.monthYearSelector;
            const currentValue = selector.value;
            selector.innerHTML = '';
            this.state.availableMonths.forEach(monthYear => {
                const [month, year] = monthYear.split('-');
                const date = new Date(year, month - 1, 1);
                const option = document.createElement('option');
                option.value = monthYear;
                const monthName = this.capitalizeFirstLetter(date.toLocaleString('pt-BR', { month: 'long' }));
                option.textContent = `${monthName} de ${year}`;
                selector.appendChild(option);
            });
            selector.value = currentValue || this.state.currentMonthYear;
        },

        detachListeners() {
            this.state.listeners.forEach(unsubscribe => unsubscribe());
            this.state.listeners = [];
        },
        render() {
            this.elements.navLinks.forEach(link => {
                const isActive = link.dataset.view === this.state.currentView;
                link.classList.toggle('active', isActive);
                const span = link.querySelector('span');
                if (span) span.style.fontWeight = isActive ? '700' : '500';
            });
            this.renderCurrentView();
        },

        async renderCurrentView() {
            const mainContent = document.querySelector('.main-content');
            const viewContainer = this.elements.viewContainer;
            const oldView = viewContainer.querySelector('.view-wrapper');
            const scrollY = mainContent.scrollTop;
            
            if (this.elements.planningKeydownListener) {
                viewContainer.removeEventListener('keydown', this.elements.planningKeydownListener);
                this.elements.planningKeydownListener = null;
            }
            if (this.state.isLoading && !oldView) {
                viewContainer.innerHTML = `<div class="view-wrapper"><div class="loading"><div class="loading-spinner"></div></div></div>`;
                return;
            }
            if (this.state.currentView === 'planning') {
                await this.loadPlanningData();
            }
            
            let newViewHtml = '';
            switch (this.state.currentView) {
                case 'resumos': newViewHtml = this.getResumosHtml(); break;
                case 'lancar': newViewHtml = this.getLancarHtml(); break;
                case 'invoices': newViewHtml = this.getInvoicesHtml(); break;
                case 'movements': newViewHtml = this.getMovementsHtml(); break;
                case 'accounts': newViewHtml = this.getAccountsHtml(); break;
                case 'planning': newViewHtml = this.getPlanningHtml(); break;
                case 'settings': newViewHtml = this.getSettingsHtml(); break;
                default: newViewHtml = this.getResumosHtml();
            }
            const newView = document.createElement('div');
            newView.className = 'view-wrapper';
            newView.innerHTML = `<div class="screen-content">${newViewHtml}</div>`;
            
            viewContainer.innerHTML = ''; 
            viewContainer.appendChild(newView);

            mainContent.scrollTop = scrollY;
            
            if (this.state.currentView === 'resumos') {
                const transactionsThisMonth = this.state.allTransactions.filter(t => t.monthYear === this.state.currentMonthYear);
                this.createDashboardChart(transactionsThisMonth);
                this.setupReportGenerator();
            }
            if (this.state.currentView === 'invoices') {
                this.postRenderInvoices();
            }
            if (this.state.currentView === 'planning') {
                this.postRenderPlanning();
            }
            if (this.state.currentView === 'lancar') {
                const savedState = sessionStorage.getItem('lancamentoFormState');
                if (savedState) {
                    const { formType, ...prefillData } = JSON.parse(savedState);
                    this.renderLancamentoForm(formType, prefillData);
                    sessionStorage.removeItem('lancamentoFormState');
                }
            }
            if (this.state.currentView === 'settings') {
                this.setupAppearanceSettings();
            }
        },

        postRenderPlanning() {
            this.renderAllPlanningSections();
            this.attachPlanningKeydownListener();
        },
        getResumosHtml() {
            const transactionsThisMonth = this.state.allTransactions.filter(t => t && t.monthYear === this.state.currentMonthYear);
            const totalIncome = transactionsThisMonth.filter(t => t.type === 'Entrada').reduce((sum, t) => sum + t.value, 0);
            const totalExpense = transactionsThisMonth.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.value, 0);
            const accountBalance = this.state.accounts
                .filter(a => a && a.type === 'Conta Corrente' && !a.arquivado)
                .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
            return `
            <div class="view-header"><h2><i class="fa-solid fa-chart-pie"></i> Resumos</h2></div>
            <div class="grid-container" style="margin-bottom: 24px;">
            <div class="card kpi-card"><div class="value">${this.formatCurrency(accountBalance)}</div><div class="label">Saldo em Contas</div></div>
            <div class="card kpi-card"><div class="value positive">+ ${this.formatCurrency(totalIncome)}</div><div class="label">Entradas do Mês</div></div>
            <div class="card kpi-card"><div class="value negative">- ${this.formatCurrency(totalExpense)}</div><div class="label">Saídas do Mês</div></div>
            </div>
            <div class="card">
            <h3 class="card-title"><i class="fa-solid fa-chart-bar"></i> Saídas do Mês Agrupadas por:</h3>
            <div class="chart-selector">
            <button data-action="change-chart-type" data-chart="category" class="${this.state.dashboardChartType === 'category' ? 'active' : ''}">Categoria</button>
            <button data-action="change-chart-type" data-chart="establishment" class="${this.state.dashboardChartType === 'establishment' ? 'active' : ''}">Estabelecimento</button>
            <button data-action="change-chart-type" data-chart="person" class="${this.state.dashboardChartType === 'person' ? 'active' : ''}">Pessoa</button>
            </div>
            <div style="height: 300px;"><canvas id="dashboard-chart"></canvas></div>
            </div>
            <div class="card" style="margin-top: 24px;">
                <h3 class="card-title"><i class="fa-solid fa-magnifying-glass-chart"></i> Central de Relatórios</h3>
                <div id="report-generator">
                    <div class="grid-container" style="grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));">
                        <div class="form-group">
                            <label>1. Tipo de Relatório</label>
                            <select id="report-type-selector">
                                <option value="category">Saídas por Categoria</option>
                                <option value="person">Transações por Pessoa</option>
                                <option value="establishment">Transações por Estabelecimento</option>
                                <option value="account">Transações por Conta/Cartão</option>
                                <option value="keyword">Busca por Palavra-Chave</option>
                            </select>
                        </div>
                        <div class="form-group" id="report-item-container">
                            <label>2. Selecione o Item</label>
                            <select id="report-item-selector"></select>
                            <input type="text" id="report-keyword-input" class="hidden" placeholder="Digite aqui...">
                        </div>
                        <div class="form-group">
                            <label>3. Período (De)</label>
                            <input type="date" id="report-date-start">
                        </div>
                        <div class="form-group">
                            <label>4. Período (Até)</label>
                            <input type="date" id="report-date-end">
                        </div>
                    </div>
                    <div class="form-actions" style="margin-top: 0;">
                        <button id="generate-report-btn" class="button-primary"><i class="fa-solid fa-play"></i> Gerar Relatório</button>
                    </div>
                </div>
            </div>`;
        },
        getLancarHtml() {
            return `
            <div class="view-header"><h2><i class="fa-solid fa-plus"></i> Novo Lançamento</h2></div>
            <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 16px;">O que você gostaria de registrar hoje?</p>
            <div class="lancar-actions-grid">
            <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="saida"><i class="fa-solid fa-arrow-down saida-icon"></i><span>Nova Saída</span></button>
            <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="entrada"><i class="fa-solid fa-arrow-up entrada-icon"></i><span>Nova Entrada</span></button>
            <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="transferencia"><i class="fa-solid fa-right-left" style="color: var(--accent-blue)"></i><span>Transferência</span></button>
            <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="pagarFatura"><i class="fa-solid fa-file-invoice-dollar" style="color: var(--accent-purple)"></i><span>Pagar Fatura</span></button>
            </div>
            <div id="form-lancamento-container"></div>`;
        },
        getInvoicesHtml() {
            const creditCards = this.state.accounts.filter(a => a && a.type === 'Cartão de Crédito' && !a.arquivado);
            if (creditCards.length === 0) {
                return `<div class="view-header"><h2><i class="fa-solid fa-file-invoice-dollar"></i> Faturas</h2></div>
                <div class="card"><div class="empty-state"><i class="fa-solid fa-credit-card"></i><p>Nenhum cartão de crédito ativo cadastrado.</p></div></div>`;
            }
            const totalOpenInvoices = creditCards.reduce((sum, card) => sum + this.calculateInvoiceDetails(card.id, true).openInvoiceTotal, 0);
            const totalLimit = creditCards.reduce((sum, card) => sum + (card.limit || 0), 0);
            const summaryHtml = `
            <div class="card" style="margin-top: 24px;">
            <h3 class="card-title"><i class="fa-solid fa-layer-group"></i> Resumo Geral de Cartões</h3>
            <div class="card-details" style="background: transparent; padding: 0;">
            <div class="detail-row"><span class="label"><i class="fa-solid fa-file-invoice-dollar negative"></i> <strong>Valor de Faturas Abertas</strong></span><span class="value negative">${this.formatCurrency(totalOpenInvoices)}</span></div>
            <div class="detail-row"><span class="label"><i class="fa-solid fa-coins neutral-positive"></i> <strong>Limite de Crédito Total</strong></span><span class="value neutral-positive">${this.formatCurrency(totalLimit)}</span></div>
            </div>
            </div>`;
            return `<div class="view-header"><h2><i class="fa-solid fa-file-invoice-dollar"></i> Faturas</h2></div>
            <div class="card">
            <div class="invoice-selector-container">
            <select id="invoice-card-selector">${creditCards.map(c => `<option value="${c.id}">${c.name}</option>`).join('')}</select>
            <select id="invoice-period-selector"></select>
            </div>
            <div id="invoice-details-container"></div>
            </div>
            ${summaryHtml}`;
        },
        getMovementsHtml() {
            let transactions = this.state.allTransactions.filter(t => t && t.monthYear === this.state.currentMonthYear);
            if (this.state.movementsFilter.type !== 'all') {
                transactions = transactions.filter(t => t.type === this.state.movementsFilter.type);
            }
            if (this.state.movementsFilter.accountId !== 'all') {
                transactions = transactions.filter(t => t.accountId === this.state.movementsFilter.accountId);
            }
            transactions.sort((a, b) => {
                if (!a || !b) return 0;
                const { key, order } = this.state.movementsSort;
                const valA = key === 'date' ? this.getDateObject(a[key]) : a[key];
                const valB = key === 'date' ? this.getDateObject(b[key]) : b[key];
                if (valA < valB) return order === 'asc' ? -1 : 1;
                if (valA > valB) return order === 'asc' ? 1 : -1;
                return 0;
            });
            return `
            <div class="view-header">
            <h2><i class="fa-solid fa-receipt"></i> Movimentações</h2>
            <div class="actions">
            <button class="button-secondary" data-action="show-filter-modal"><i class="fa-solid fa-filter"></i> Filtrar</button>
            <button class="button-secondary" data-action="show-sort-modal"><i class="fa-solid fa-sort"></i> Ordenar</button>
            </div>
            </div>
            <div class="card"><div id="transaction-list">${transactions.length > 0 ? transactions.map(t => this.getTransactionHtml(t)).join('') : '<div class="empty-state"><p>Nenhuma movimentação encontrada.</p></div>'}</div></div>`;
        },

        getSettingsHtml() {
            const getItemsHtml = (items, type, icon) => {
                if (!items || items.length === 0) return `<div class="empty-state" style="padding: 20px 0;">Nenhum item cadastrado.</div>`;
                return items
                    .filter(item => !!item)
                    .sort((a, b) => a.name.localeCompare(b.name))
                    .map(item => `
                    <div class="item-list-row">
                    <span class="icon-name"><i class="fa-solid ${item.icon || icon}"></i> ${item.name}</span>
                    <div class="actions">
                    <button class="button-icon" data-action="edit-${type}" data-id="${item.id}"><i class="fa-solid fa-pen"></i></button>
                    <button class="button-icon delete-btn" data-action="delete-${type}" data-id="${item.id}"><i class="fa-solid fa-trash"></i></button>
                    </div>
                    </div>`).join('');
            };
            return `
            <div class="view-header"><h2><i class="fa-solid fa-gears"></i> Configurações</h2></div>
            <div class="card">
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-tags"></i> Categorias</h3>
                        <button class="button-primary" data-action="add-category"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                    <div id="categories-list">${getItemsHtml(this.state.categories, 'category', 'fa-tag')}</div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-users"></i> Pessoas/Terceiros</h3>
                        <button class="button-primary" data-action="add-person"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                    <div id="people-list">${getItemsHtml(this.state.people, 'person', 'fa-user')}</div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-store"></i> Estabelecimentos</h3>
                        <button class="button-primary" data-action="add-establishment"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                    <div id="establishments-list">${getItemsHtml(this.state.establishments, 'establishment', 'fa-store')}</div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-palette"></i> Aparência</h3>
                    </div>
                    <div class="form-group">
                        <label for="font-size-slider">Tamanho da Fonte</label>
                        <input type="range" id="font-size-slider" min="14" max="20" step="1" style="width: 100%; cursor: pointer;">
                    </div>
                    <div class="form-group">
                        <label for="animation-style-selector">Estilo de Animação</label>
                        <select id="animation-style-selector">
                            <option value="sutil">Sutil (Padrão)</option>
                            <option value="fluida">Fluida</option>
                            <option value="instantanea">Instantânea (Sem Animações)</option>
                        </select>
                    </div>
                </div>
            </div>`;
        },
        getAccountsHtml() {
            const accountsToRender = this.state.accounts.filter(acc => acc && (this.state.showArchived || !acc.arquivado));
            const cardsHtml = accountsToRender.map(account => this.generateCardHTML(account)).join('');
            const emptyState = `<div class="empty-state"><i class="fa-solid fa-piggy-bank"></i><p>Nenhuma conta para exibir.<br>Clique em "Adicionar Conta" para começar.</p></div>`;
            return `
            <div class="view-header">
            <h2><i class="fa-solid fa-building-columns"></i> Contas e Cartões</h2>
            <div class="actions">
            <button class="button-secondary" data-action="toggle-archived"><i class="fa-solid ${this.state.showArchived ? 'fa-eye-slash' : 'fa-eye'}"></i><span>${this.state.showArchived ? 'Ocultar' : 'Exibir'} Arquivadas</span></button>
            <button class="button-primary" data-action="add-account"><i class="fa-solid fa-plus"></i><span>Adicionar Conta</span></button>
            </div>
            </div>
            <div class="card-grid">${accountsToRender.length > 0 ? cardsHtml : emptyState}</div>`;
        },

        generateCardHTML(account) {
            if (!account) return '';
            const textColor = this.getContrastColor(account.color);
            let icon, mainLabel, mainValue, footerInfo = '';
            const openInvoice = account.type === 'Cartão de Crédito' ? this.calculateInvoiceDetails(account.id, true).openInvoiceTotal : 0;
            const availableLimit = (account.limit || 0) - this.calculateCreditCardUsage(account.id);
            if (account.type === 'Conta Corrente') {
                icon = 'fa-building-columns';
                mainLabel = 'Saldo Atual';
                mainValue = this.formatCurrency(account.balance);
            } else {
                icon = 'fa-credit-card';
                mainLabel = 'Fatura Aberta';
                mainValue = this.formatCurrency(openInvoice);
                footerInfo = `<div class="card-footer"><span class="label">Limite Disponível</span><span class="value">${this.formatCurrency(availableLimit)}</span></div>`;
            }
            return `
            <div class="account-card-display ${account.arquivado ? 'archived' : ''}" style="background-color: ${account.color || '#424242'}; color: ${textColor};">
            <div class="card-content">
                <div class="card-header">
                <div class="icon-title"><i class="fa-solid ${icon}"></i><span>${account.name || 'Sem nome'}</span></div>
                <button class="card-actions-button" data-action="toggle-menu" data-id="${account.id}"><i class="fa-solid fa-ellipsis-vertical"></i></button>
                <ul class="card-actions-menu hidden" data-menu-id="${account.id}">
                ${account.type === 'Conta Corrente' ? `<li data-action="adjust-balance" data-id="${account.id}"><i class="fa-solid fa-sack-dollar"></i> Ajustar Saldo</li>` : ''}
                <li data-action="edit-account" data-id="${account.id}"><i class="fa-solid fa-pencil"></i> Editar</li>
                <li data-action="archive-account" data-id="${account.id}"><i class="fa-solid fa-archive"></i> ${account.arquivado ? 'Desarquivar' : 'Arquivar'}</li>
                <li data-action="delete-account" data-id="${account.id}" class="delete"><i class="fa-solid fa-trash-can"></i> Excluir</li>
                </ul>
                </div>
                <div class="card-body">
                <div class="label">${mainLabel}</div>
                <div class="main-value">${mainValue}</div>
                </div>
                ${footerInfo}
            </div>
            </div>`;
        },
        getPlanningHtml() {
            return `
            <div class="view-header"><h2><i class="fa-solid fa-lightbulb"></i> Planejamento Mensal</h2></div>
            <div class="card" id="planning-card-container">
            <div class="planning-section">
            <div class="planning-section-header">
            <h3><div class="section-icon"><i class="fa-solid fa-arrow-up"></i></div> Entradas Previstas</h3>
            <button class="button-primary" data-action="add-planning-item" data-type="receitas"><i class="fa-solid fa-plus"></i> Adicionar</button>
            </div>
            <div class="planning-list" data-list-type="receitas"><div class="loading-spinner small"></div></div>
            </div>
            <div class="planning-section">
            <div class="planning-section-header">
            <h3><div class="section-icon expenses-icon"><i class="fa-solid fa-arrow-down"></i></div> Saídas Previstas</h3>
            </div>
            <div id="saidas-section-container"><div class="loading-spinner small"></div></div>
            </div>
            <div id="planning-summary" class="card-details"><div class="loading-spinner small"></div></div>
            </div>`;
        },

        renderAllPlanningSections() {
            this.renderList('receitas');
            this.renderSaidasSection();
            this.updateSummary();
        },
        renderSaidasSection() {
            const container = document.getElementById('saidas-section-container');
            if (!container) return;
            const automaticFaturas = (this.state.planningData.despesas || []).filter(d => d && d.isAutomatic);
            const manualDespesas = (this.state.planningData.despesas || []).filter(d => d && !d.isAutomatic);
            container.innerHTML = `
            <div class="planning-subsection-header">Faturas de Cartão</div>
            <div class="planning-list" data-list-type="faturas">
            ${automaticFaturas.map(item => this.getPlanningRowHtml('despesas', item, this.state.planningData.despesas.indexOf(item))).join('')}
            </div>
            <div class="planning-subsection-header">Outras Despesas</div>
            <div class="planning-list" data-list-type="outrasDespesas">
            ${manualDespesas.map(item => this.getPlanningRowHtml('despesas', item, this.state.planningData.despesas.indexOf(item))).join('')}
            </div>
            <button class="button-primary" data-action="add-planning-item" data-type="despesas" style="margin-top: 16px;"><i class="fa-solid fa-plus"></i> Adicionar Outra Despesa</button>`;
        },
        renderList(listType) {
            const listContainer = document.querySelector(`.planning-list[data-list-type="${listType}"]`);
            if (!listContainer) return;
            let items, type;
            if (listType === 'receitas') {
                items = (this.state.planningData.receitas || []).filter(i => !!i);
                type = 'receitas';
            } else {
                items = (this.state.planningData.despesas || []).filter(d => d && !d.isAutomatic);
                type = 'despesas';
            }
            listContainer.innerHTML = items.map(item => {
                const originalIndex = this.state.planningData[type].findIndex(pItem => pItem === item);
                return this.getPlanningRowHtml(type, item, originalIndex);
            }).join('');
        },
        updateSummary() {
            const summaryContainer = document.getElementById('planning-summary');
            if (!summaryContainer) return;
            const despesasAPagar = (this.state.planningData.despesas || []).filter(item => item && !item.paid);
            const totalDespesas = despesasAPagar.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
            const totalReceitas = (this.state.planningData.receitas || []).filter(i => !!i).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
            const saldo = totalReceitas - totalDespesas;
            summaryContainer.innerHTML = `
            <div class="detail-row">
            <span class="label"><i class="fa-solid fa-arrow-up summary-icon positive"></i><strong>Total de Entradas</strong></span>
            <span class="value positive">${this.formatCurrency(totalReceitas)}</span>
            </div>
            <div class="detail-row">
            <span class="label"><i class="fa-solid fa-arrow-down summary-icon negative"></i><strong>Total de Saídas (A Pagar)</strong></span>
            <span class="value negative">${this.formatCurrency(totalDespesas)}</span>
            </div>
            <div class="detail-row" style="font-size: 18px;">
            <span class="label"><i class="fa-solid fa-wallet summary-icon neutral-positive"></i><strong>Saldo Previsto</strong></span>
            <span class="value ${saldo >= 0 ? 'neutral-positive' : 'negative'}">${this.formatCurrency(saldo)}</span>
            </div>`;
        },
        getPlanningRowHtml(type, item, index) {
            if (!item) return '';
            if (type === 'receitas') {
                return `
                <div class="planning-item income-item">
                <div class="planning-input-description">
                <input type="text" class="planning-input" value="${item.description || ''}" data-type="receitas" data-index="${index}" data-field="description" placeholder="Descrição da receita...">
                </div>
                <div class="planning-input-value input-group-currency">
                <span class="currency-symbol">R$</span>
                <input type="number" inputmode="decimal" class="planning-input" value="${item.value || ''}" placeholder="0,00" data-type="receitas" data-index="${index}" data-field="value">
                </div>
                <div class="planning-item-actions">
                <button class="button-icon" data-action="delete-planning-item" data-type="receitas" data-index="${index}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
                </div>
                </div>`;
            }
            if (item.isAutomatic) {
                const card = this.state.accounts.find(acc => acc && acc.id === item.cardId);
                const cardColor = card ? card.color : '#cccccc';
                return `
                <div class="planning-item expense-item ${item.paid ? 'paid' : ''}">
                <input type="checkbox" class="planning-item-checkbox" data-type="despesas" data-index="${index}" ${item.paid ? 'checked' : ''}>
                <div class="planning-input-description-flex">
                <span class="card-icon" style="background-color: ${cardColor};"><i class="fa-solid fa-credit-card"></i></span>
                <input type="text" class="planning-input" value="${item.description}" readonly>
                </div>
                <button class="button-icon sync-btn" data-action="sync-invoice" data-card-id="${item.cardId}" data-index="${index}" title="Sincronizar com fatura"><i class="fa-solid fa-arrows-rotate"></i></button>
                <div class="planning-input-value input-group-currency">
                <span class="currency-symbol">R$</span>
                <input type="number" inputmode="decimal" class="planning-input" value="${item.value || ''}" placeholder="0,00" data-type="despesas" data-index="${index}" data-field="value">
                </div>
                <div class="planning-item-actions"></div>
                </div>`;
            }
            return `
            <div class="planning-item expense-item ${item.paid ? 'paid' : ''}">
            <input type="checkbox" class="planning-item-checkbox" data-type="despesas" data-index="${index}" ${item.paid ? 'checked' : ''}>
            <div class="planning-input-description">
            <input type="text" class="planning-input" value="${item.description || ''}" data-type="despesas" data-index="${index}" data-field="description" placeholder="Descrição da despesa...">
            </div>
            <div></div>
            <div class="planning-input-value input-group-currency">
            <span class="currency-symbol">R$</span>
            <input type="number" inputmode="decimal" class="planning-input" value="${item.value || ''}" placeholder="0,00" data-type="despesas" data-index="${index}" data-field="value">
            </div>
            <div class="planning-item-actions">
            <button class="button-icon" data-action="delete-planning-item" data-type="despesas" data-index="${index}" title="Excluir"><i class="fa-solid fa-trash"></i></button>
            </div>
            </div>`;
        },
        attachPlanningKeydownListener() {
            this.elements.planningKeydownListener = (e) => {
                if (e.key !== 'Enter' || !e.target.classList.contains('planning-input')) return;
                e.preventDefault();
                const input = e.target;
                const parentItem = input.closest('.planning-item');
                const { type } = input.dataset;
                if (input.closest('.planning-input-description')) {
                    parentItem.querySelector('.planning-input-value input').focus();
                } else if (input.closest('.planning-input-value')) {
                    this.addPlanningItem(type);
                }
            };
            this.elements.viewContainer.addEventListener('keydown', this.elements.planningKeydownListener);
        },

        handleViewContainerClick(e) {
            const actionTarget = e.target.closest('[data-action]');
            
            if (!actionTarget) {
                const activeMenu = document.querySelector('.card-actions-menu:not(.hidden)');
                if (activeMenu && !e.target.closest('.card-actions-button')) {
                    activeMenu.classList.add('hidden');
                }
                
                const transactionItem = e.target.closest('.transaction-list-item');
                if (transactionItem && !e.target.closest('.delete-btn')) {
                    const transactionId = transactionItem.dataset.id;
                    const transaction = this.state.allTransactions.find(t => t.id === transactionId);
                    if (transaction) {
                         this.showTransactionDetailsModal(transaction);
                    }
                }
                return;
            }

            const { action, id, type, index, cardId, chart, invoiceKey } = actionTarget.dataset;
            
            const actionHandlers = {
                'show-lancar-form': () => this.renderLancamentoForm(actionTarget.dataset.formType),
                'cancel-lancar-form': () => {
                    document.getElementById('form-lancamento-container').innerHTML = '';
                    sessionStorage.removeItem('lancamentoFormState');
                },
                'change-chart-type': () => { this.state.dashboardChartType = chart; this.renderCurrentView(); },
                'add-account': () => this.showAccountModal(),
                'edit-account': () => this.showAccountModal(id),
                'delete-account': () => this.deleteItem('financeiro_contas', id, 'Conta'),
                'archive-account': () => { const account = this.state.accounts.find(acc => acc.id === id); this.db.collection('financeiro_contas').doc(id).update({ arquivado: !account.arquivado }); },
                'adjust-balance': () => this.adjustAccountBalance(id),
                'toggle-menu': () => { document.querySelectorAll('.card-actions-menu').forEach(menu => { if (menu.dataset.menuId !== id) menu.classList.add('hidden'); }); document.querySelector(`.card-actions-menu[data-menu-id="${id}"]`)?.classList.toggle('hidden'); },
                'toggle-archived': () => { this.state.showArchived = !this.state.showArchived; this.renderCurrentView(); },
                'add-planning-item': () => this.addPlanningItem(type),
                'delete-planning-item': () => this.deletePlanningItem(type, parseInt(index)),
                'sync-invoice': () => this.syncInvoiceValue(parseInt(index), cardId),
                'delete-transaction': () => { const transaction = this.state.allTransactions.find(t => t.id === id); this.deleteItem('financeiro_lancamentos', id, 'Lançamento', transaction); },
                'edit-from-details': () => this.showTransactionModal(id),
                'show-filter-modal': () => this.showFilterModal(),
                'show-sort-modal': () => this.showSortModal(),
                'pay-invoice': () => { this.navigate({ currentTarget: { dataset: { view: 'lancar' } }, preventDefault: () => { } }, { formType: 'pagarFatura', prefill: { destinationAccountId: cardId, value: parseFloat(actionTarget.dataset.invoiceTotal), invoiceMonthYear: invoiceKey } }); },
                'add-category': () => this.showCategoryModal(), 'edit-category': () => this.showCategoryModal(id), 'delete-category': () => this.deleteItem('financeiro_categorias', id, 'Categoria'),
                'add-person': () => this.showPersonModal(), 'edit-person': () => this.showPersonModal(id), 'delete-person': () => this.deleteItem('financeiro_pessoas', id, 'Pessoa'),
                'add-establishment': () => this.showEstablishmentModal(), 'edit-establishment': () => this.showEstablishmentModal(id), 'delete-establishment': () => this.deleteItem('financeiro_estabelecimentos', id, 'Estabelecimento'),
            };

            if (actionHandlers[action]) {
                actionHandlers[action](e);
            }
        },

        handleFormSubmit(e) {
            e.preventDefault();
            const form = e.target.closest('form');
            if (!form) return;

            const formId = form.getAttribute('id');
            const formHandlers = {
                'account-form': () => this.saveItem(e, 'financeiro_contas', 'Conta'),
                'category-form': () => this.saveItem(e, 'financeiro_categorias', 'Categoria'),
                'person-form': () => this.saveItem(e, 'financeiro_pessoas', 'Pessoa'),
                'establishment-form': () => this.saveItem(e, 'financeiro_estabelecimentos', 'Estabelecimento'),
                'transaction-form': () => this.saveTransaction(form, true),
                'lancar-form': () => this.saveTransaction(form),
                'filter-form': () => {
                    const formData = new FormData(form);
                    this.state.movementsFilter.type = formData.get('type');
                    this.state.movementsFilter.accountId = formData.get('accountId');
                    this.closeModal();
                    this.renderCurrentView();
                },
                'sort-form': () => {
                    const formData = new FormData(form);
                    const [key, order] = formData.get('sort').split('-');
                    this.state.movementsSort = { key, order };
                    this.closeModal();
                    this.renderCurrentView();
                }
            };
            if (formHandlers[formId]) {
                formHandlers[formId]();
            }
        },

        handleStateUpdateOnInput(e) {
            const planningInput = e.target.closest('.planning-input');
            if (planningInput && !planningInput.readOnly && this.state.currentView === 'planning') {
                const { type, index, field } = planningInput.dataset;
                const value = planningInput.type === 'number' ? planningInput.value : planningInput.value;
                if (planningInput.type === 'number' && isNaN(parseFloat(value)) && value !== '' && value !== '-') return;
                this.state.planningData[type][parseInt(index)][field] = value;
                this.updateSummary();
                this.debouncedSavePlanning();
                return;
            }
            const lancarInput = e.target.closest('#lancar-form input, #lancar-form select');
            if (lancarInput) {
                const form = lancarInput.closest('form');
                const formData = new FormData(form);
                const formState = Object.fromEntries(formData.entries());
                formState.formType = form.dataset.type;
                sessionStorage.setItem('lancamentoFormState', JSON.stringify(formState));
            }
        },
        handleSaveOnChange(e) {
            const checkbox = e.target.closest('.planning-item-checkbox');
            if (checkbox && this.state.currentView === 'planning') {
                const { type, index } = checkbox.dataset;
                const item = this.state.planningData[type][parseInt(index)];
                if (item) {
                    item.paid = checkbox.checked;
                    this.savePlanningData();
                    const planningItem = checkbox.closest('.planning-item');
                    planningItem.classList.toggle('paid', checkbox.checked);
                    this.updateSummary();
                }
                return;
            }
            if (e.target.id === 'lancar-saida-account') {
                const form = e.target.closest('form');
                const installmentsGroup = form.querySelector('#installments-group');
                const selectedAccount = this.state.accounts.find(a => a.id === e.target.value);
                const showInstallments = selectedAccount?.type === 'Cartão de Crédito';
                installmentsGroup.classList.toggle('hidden', !showInstallments);
            }
        },
        getTransactionHtml(transaction, showAccount = true) {
            if (!transaction || !transaction.id) return '';
            const category = this.state.categories.find(c => c && c.id === transaction.categoryId);
            const account = this.state.accounts.find(a => a && a.id === transaction.accountId);
            
            const primaryText = transaction.establishmentId ? this.findItemName(transaction.establishmentId, 'establishments') : transaction.description;
            const secondaryText = showAccount && account ? account.name : category?.name || transaction.type;

            let isPositive = transaction.type === 'Entrada';
            let amountClass = isPositive ? 'positive' : 'negative';
            let amountSign = isPositive ? '+' : '-';
            if (transaction.type === 'Transferência' || transaction.type === 'Pagamento de Fatura') {
                amountClass = 'neutral';
                amountSign = '';
            }
            const date = this.getDateObject(transaction.date);
            const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
            
            return `<div class="transaction-list-item" data-id="${transaction.id}">
            <div class="icon" style="background-color: ${account?.color || '#e5e5ea'}"><i class="fa-solid ${category?.icon || (isPositive ? 'fa-arrow-up' : 'fa-arrow-down')}"></i></div>
            <div class="details"><div class="description">${primaryText}</div><div class="category">${secondaryText}</div></div>
            <div class="amount-details"><div class="amount ${amountClass}">${amountSign} ${this.formatCurrency(transaction.value)}</div><div class="date">${formattedDate}</div></div>
            </div>`;
        },
        renderLancamentoForm(type, prefillData = {}) {
            const container = document.getElementById('form-lancamento-container');
            if (!container) return;
            const accounts = this.state.accounts.filter(a => a && !a.arquivado) || [];
            const checkingAccounts = accounts.filter(a => a.type === 'Conta Corrente');
            const creditCards = accounts.filter(a => a.type === 'Cartão de Crédito');
            
            const getOptions = (items = [], selectedId) => {
                return [...items]
                    .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
                    .map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.name}</option>`)
                    .join('');
            };

            const dateInputValue = prefillData.date || this.getLocalISODate();
            let formHtml = '', title = '';

            const prefill = (name) => prefillData[name] || '';

            switch (type) {
                case 'saida':
                    title = 'Nova Saída';
                    formHtml = `<div class="form-group"><label>Descrição</label><input type="text" name="description" value="${prefill('description')}" required></div><div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div><div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div><div class="form-group"><label>Conta / Cartão</label><select id="lancar-saida-account" name="accountId" required><option value="">Selecione...</option>${getOptions(accounts, prefill('accountId'))}</select></div><div id="installments-group" class="form-group hidden"><label>Número de Parcelas</label><input type="number" inputmode="numeric" name="installments" min="1" value="${prefill('installments') || '1'}"></div><div class="form-group"><label>Categoria</label><select name="categoryId" required><option value="">Selecione...</option>${getOptions(this.state.categories, prefill('categoryId'))}</select></div><div class="form-group"><label>Pessoa (Opcional)</label><select name="personId"><option value="">Nenhuma</option>${getOptions(this.state.people, prefill('personId'))}</select></div><div class="form-group"><label>Estabelecimento (Opcional)</label><select name="establishmentId"><option value="">Nenhum</option>${getOptions(this.state.establishments, prefill('establishmentId'))}</select></div>`;
                    break;
                case 'entrada':
                    title = 'Nova Entrada';
                    formHtml = `<div class="form-group"><label>Descrição</label><input type="text" name="description" value="${prefill('description')}" required></div><div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div><div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div><div class="form-group"><label>Conta de Destino</label><select name="accountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('accountId'))}</select></div><div class="form-group"><label>Categoria</label><select name="categoryId" required><option value="">Selecione...</option>${getOptions(this.state.categories, prefill('categoryId'))}</select></div>`;
                    break;
                case 'transferencia':
                    title = 'Transferência entre Contas';
                    formHtml = `<div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div><div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div><div class="form-group"><label>Conta de Origem</label><select name="sourceAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('sourceAccountId'))}</select></div><div class="form-group"><label>Conta de Destino</label><select name="destinationAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('destinationAccountId'))}</select></div><div class="form-group"><label>Descrição (Opcional)</label><input type="text" name="description" value="${prefill('description')}" placeholder="Transferência entre contas"></div>`;
                    break;
                case 'pagarFatura':
                    title = 'Pagar Fatura de Cartão';
                    formHtml = `<input type="hidden" name="invoiceMonthYear" value="${prefill('invoiceMonthYear') || ''}"><div class="form-group"><label>Valor do Pagamento</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" value="${prefill('value') || ''}" placeholder="0,00" required></div></div><div class="form-group"><label>Data do Pagamento</label><input type="date" name="date" value="${dateInputValue}" required></div><div class="form-group"><label>Pagar com a conta</label><select name="sourceAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('sourceAccountId'))}</select></div><div class="form-group"><label>Fatura do cartão</label><select name="destinationAccountId" required><option value="">Selecione...</option>${getOptions(creditCards, prefill('destinationAccountId'))}</select></div>`;
                    break;
            }
            container.innerHTML = `<div class="card"><form id="lancar-form" data-type="${type}" novalidate><h3 class="card-title" style="font-size: 20px;">${title}</h3>${formHtml}<div class="form-actions"><button type="button" class="button-secondary" data-action="cancel-lancar-form">Cancelar</button><button type="submit" class="button-primary"><i class="fa-solid fa-check"></i> Salvar</button></div></form></div>`;
            
            const form = container.querySelector('#lancar-form');
            form.addEventListener('keydown', (e) => {
                if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
                    e.preventDefault();
                    const fields = Array.from(form.querySelectorAll('input, select'));
                    const currentIndex = fields.indexOf(e.target);
                    const nextField = fields[currentIndex + 1];
                    if (nextField) {
                        nextField.focus();
                    } else {
                        form.querySelector('button[type="submit"]').click();
                    }
                }
            });

            setTimeout(() => {
                const mainContent = document.querySelector('.main-content');
                if (container && mainContent && container.offsetParent) {
                    const headerHeight = document.querySelector('.main-header')?.offsetHeight || 80;
                    const targetPosition = container.offsetTop - headerHeight - 20;
                    mainContent.scrollTo({
                        top: targetPosition,
                        behavior: 'smooth'
                    });
                }
            }, 100);
        },
        async saveTransaction(form, isEdit = false) {
            const formData = new FormData(form);
            const data = Object.fromEntries(formData.entries());
            const type = isEdit ? this.state.allTransactions.find(t => t.id === data.id)?.type : form.dataset.type;
            const id = data.id;
            const submitButton = form.querySelector('[type="submit"]');
            submitButton.disabled = true;
            submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;
            const batch = this.db.batch();
            try {
                data.value = parseFloat(String(data.value).replace(',', '.')) || 0;
                if (data.value <= 0) throw new Error("O valor deve ser positivo.");
                const dateString = data.date;
                if (type === 'transferencia') {
                    if (data.sourceAccountId === data.destinationAccountId) throw new Error("A conta de origem e destino não podem ser a mesma.");
                    const transferId = this.db.collection('financeiro_lancamentos').doc().id;
                    const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, transferId };
                    const sourceAccount = this.state.accounts.find(a => a.id === data.sourceAccountId);
                    const destAccount = this.state.accounts.find(a => a.id === data.destinationAccountId);
                    const debit = { ...commonData, accountId: data.sourceAccountId, type: 'Transferência', description: `Transferência para ${destAccount.name}` };
                    const credit = { ...commonData, accountId: data.destinationAccountId, type: 'Transferência', description: `Transferência de ${sourceAccount.name}` };
                    batch.set(this.db.collection('financeiro_lancamentos').doc(), debit);
                    batch.set(this.db.collection('financeiro_lancamentos').doc(), credit);
                    this.updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);
                    this.updateAccountBalance(data.destinationAccountId, data.value, 'Entrada', false, batch);
                } else if (type === 'pagarFatura') {
                    const paymentId = this.db.collection('financeiro_lancamentos').doc().id;
                    const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, paymentId, invoiceMonthYear: data.invoiceMonthYear };
                    const debitDesc = `Pagamento Fatura ${this.findItemName(data.destinationAccountId, 'accounts')}`;
                    const creditDesc = `Pagamento Recebido de ${this.findItemName(data.sourceAccountId, 'accounts')}`;
                    const debit = { ...commonData, accountId: data.sourceAccountId, type: 'Pagamento de Fatura', description: debitDesc, destinationAccountId: data.destinationAccountId };
                    const credit = { ...commonData, accountId: data.destinationAccountId, type: 'Pagamento de Fatura', description: creditDesc, sourceAccountId: data.sourceAccountId };
                    batch.set(this.db.collection('financeiro_lancamentos').doc(), debit);
                    batch.set(this.db.collection('financeiro_lancamentos').doc(), credit);
                    this.updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);
                } else if (isEdit) {
                    const originalTransaction = this.state.allTransactions.find(t => t.id === id);
                    if (!originalTransaction) throw new Error("Lançamento original não encontrado para editar.");
                    
                    const fullDate = new Date(`${dateString}T${this.getDateObject(originalTransaction.date).toTimeString().slice(0, 8)}`);
                    const updateData = { ...data, value: data.value, date: firebase.firestore.Timestamp.fromDate(fullDate), monthYear: `${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getFullYear()}`, type: originalTransaction.type };
                    delete updateData.id;
                    
                    batch.update(this.db.collection('financeiro_lancamentos').doc(id), updateData);
                    
                    this.updateAccountBalance(originalTransaction.accountId, originalTransaction.value, originalTransaction.type, true, batch);
                    this.updateAccountBalance(updateData.accountId, updateData.value, originalTransaction.type, false, batch);

                } else {
                    const installments = parseInt(data.installments) || 1;
                    const selectedAccount = this.state.accounts.find(a => a.id === data.accountId);
                    if (type === 'saida' && selectedAccount?.type === 'Cartão de Crédito' && installments > 1) {
                        const installmentGroupId = this.db.collection('financeiro_lancamentos').doc().id;
                        const installmentValue = data.value / installments;
                        for (let i = 0; i < installments; i++) {
                            const installmentDate = new Date(`${dateString}T12:00:00Z`);
                            installmentDate.setMonth(installmentDate.getMonth() + i);
                            const installmentData = { ...data, type: 'Saída', date: firebase.firestore.Timestamp.fromDate(installmentDate), monthYear: `${(installmentDate.getMonth() + 1).toString().padStart(2, '0')}-${installmentDate.getFullYear()}`, description: `${data.description} [${i + 1}/${installments}]`, value: installmentValue, installmentGroupId: installmentGroupId };
                            delete installmentData.installments;
                            batch.set(this.db.collection('financeiro_lancamentos').doc(), installmentData);
                        }
                    } else {
                        const fullDate = new Date(`${dateString}T${new Date().toTimeString().slice(0, 8)}`);
                        data.type = type === 'saida' ? 'Saída' : 'Entrada';
                        data.date = firebase.firestore.Timestamp.fromDate(fullDate);
                        data.monthYear = `${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getFullYear()}`;
                        delete data.installments;
                        batch.set(this.db.collection('financeiro_lancamentos').doc(), data);
                        this.updateAccountBalance(data.accountId, data.value, data.type, false, batch);
                    }
                }
                
                await batch.commit();

                if (!isEdit) {
                    form.querySelector('[name="description"]').value = '';
                    form.querySelector('[name="value"]').value = '';
                    form.querySelector('[name="description"]').focus();
                    sessionStorage.removeItem('lancamentoFormState');
                } else {
                    this.closeModal();
                }

                this.showToast('Lançamento salvo com sucesso!', 'success');

            } catch (error) {
                console.error("Erro ao salvar lançamento:", error);
                this.showToast(error.message || 'Ocorreu um erro ao salvar.', 'error');
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = isEdit ? `Salvar` : `<i class="fa-solid fa-check"></i> Salvar`;
                }
            }
        },
        async saveItem(e, collection, itemName) {
            const form = e.target.closest('form');
            const submitButton = form.querySelector('button[type="submit"]');
            if (submitButton) {
                submitButton.disabled = true;
                submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;
            }

            try {
                const formData = new FormData(form);
                const data = Object.fromEntries(formData.entries());
                const id = data.id;
                delete data.id;
                if (itemName === 'Conta') {
                    if (data.type === 'Cartão de Crédito') {
                        data.limit = parseFloat(String(data.limit).replace(',', '.')) || 0;
                        data.dueDate = data.dueDate || "";
                        data.closingDay = data.closingDay || "";
                        delete data.balance;
                    } else {
                        data.balance = parseFloat(String(data.balance).replace(',', '.')) || 0;
                        delete data.limit;
                        delete data.dueDate;
                        delete data.closingDay;
                    }
                }
                console.log(`Salvando ${itemName}:`, data);
                if (id) {
                    await this.db.collection(collection).doc(id).update(data);
                } else {
                    if (itemName === 'Conta') data.arquivado = false;
                    await this.db.collection(collection).add(data);
                }
                this.showToast(`${itemName} salvo com sucesso!`, 'success');
                this.closeModal();

            } catch (error) {
                this.showToast(`Erro ao salvar ${itemName}.`, 'error');
                console.error(`Erro em saveItem para ${collection}:`, error);
            } finally {
                if (submitButton) {
                    submitButton.disabled = false;
                    submitButton.innerHTML = `Salvar`;
                }
            }
        },
        async deleteItem(collection, id, itemName, transactionToDelete = null) {
            if (!confirm(`Tem certeza que deseja excluir: ${itemName}? Esta ação não pode ser desfeita.`)) return;
            const batch = this.db.batch();
            try {
                if (collection === 'financeiro_lancamentos') {
                    let transactionsToDelete = [];
                    if (transactionToDelete?.transferId) {
                        const querySnapshot = await this.db.collection(collection).where('transferId', '==', transactionToDelete.transferId).get();
                        querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
                    } else if (transactionToDelete?.paymentId) {
                        const querySnapshot = await this.db.collection(collection).where('paymentId', '==', transactionToDelete.paymentId).get();
                        querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
                    } else if (transactionToDelete?.installmentGroupId) {
                        if (!confirm('Este é um lançamento parcelado. Deseja excluir TODAS as parcelas relacionadas?')) return;
                        const querySnapshot = await this.db.collection(collection).where('installmentGroupId', '==', transactionToDelete.installmentGroupId).get();
                        querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
                    } else if (transactionToDelete) {
                        transactionsToDelete.push(transactionToDelete);
                    }
                    
                    if (transactionsToDelete.length === 0 && transactionToDelete) {
                         transactionsToDelete.push(transactionToDelete);
                    }

                    for (const trans of transactionsToDelete) {
                        if (trans && trans.id) {
                            batch.delete(this.db.collection(collection).doc(trans.id));
                            this.updateAccountBalance(trans.accountId, trans.value, trans.type, true, batch);
                        }
                    }
                } else {
                    const fieldToCheck = { 'financeiro_contas': 'accountId', 'financeiro_categorias': 'categoryId', 'financeiro_pessoas': 'personId', 'financeiro_estabelecimentos': 'establishmentId' }[collection];
                    const snapshot = await this.db.collection('financeiro_lancamentos').where(fieldToCheck, '==', id).limit(1).get();
                    if (!snapshot.empty) throw new Error(`Este item não pode ser excluído pois possui lançamentos associados.`);
                    batch.delete(this.db.collection(collection).doc(id));
                }
                await batch.commit();
                this.showToast(`${itemName} excluído com sucesso.`, 'success');
                this.closeModal();
            } catch (error) { this.showToast(error.message || `Erro ao excluir ${itemName}.`, 'error'); console.error(error); }
        },
        updateAccountBalance(accountId, value, type, revert = false, batch) {
            const account = this.state.accounts.find(a => a && a.id === accountId);
            if (account?.type === 'Conta Corrente') {
                let valueToIncrement = (type === 'Entrada' || type === 'Transferência') ? value : -value;
                if (type === 'Pagamento de Fatura') valueToIncrement = -value;
                if (revert) valueToIncrement *= -1;
                batch.update(this.db.collection('financeiro_contas').doc(accountId), { balance: firebase.firestore.FieldValue.increment(valueToIncrement) });
            }
        },
        showAccountModal(accountId = null) {
            const isEditing = !!accountId;
            const account = isEditing ? this.state.accounts.find(a => a.id === accountId) : {};
            const accountColor = account?.color || '#007aff';
            this.elements.modalContainer.innerHTML = `
            <div class="modal-content">
            <form id="account-form">
            <input type="hidden" name="id" value="${account?.id || ''}">
            <div class="modal-header">
            <h2>${isEditing ? 'Editar' : 'Nova'} Conta</h2>
            <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
            <div class="form-group">
            <label>Nome</label>
            <input type="text" name="name" value="${account?.name || ''}" required>
            </div>
            <div class="form-group">
            <label>Tipo</label>
            <select name="type" id="account-type">
            <option value="Conta Corrente" ${account?.type === 'Conta Corrente' ? 'selected' : ''}>Conta Corrente</option>
            <option value="Cartão de Crédito" ${account?.type === 'Cartão de Crédito' ? 'selected' : ''}>Cartão de Crédito</option>
            </select>
            </div>
            <div class="form-group color-picker">
            <label>Cor</label>
            <input type="color" name="color" value="${accountColor}">
            </div>
            <div class="form-group" id="balance-limit-group">
            <label>Saldo Inicial</label>
            <div class="input-group-currency">
            <span class="currency-symbol">R$</span>
            <input type="number" step="0.01" name="balance" value="${account?.balance || ''}" placeholder="0,00">
            </div>
            </div>
            <div id="credit-card-fields" class="hidden">
            <div class="form-group">
            <label>Dia do Vencimento</label>
            <input type="number" min="1" max="31" name="dueDate" value="${account?.dueDate || ''}">
            </div>
            <div class="form-group">
            <label>Dia do Fechamento</label>
            <input type="number" min="1" max="31" name="closingDay" value="${account?.closingDay || ''}">
            </div>
            </div>
            </div>
            <div class="modal-actions">
            <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
            <button type="submit" form="account-form" class="button-primary">Salvar</button>
            </div>
            </form>
            </div>`;
            const selector = document.getElementById('account-type');
            const toggleFields = () => {
                const isCredit = selector.value === 'Cartão de Crédito';
                document.getElementById('credit-card-fields').classList.toggle('hidden', !isCredit);
                const balanceGroup = document.getElementById('balance-limit-group');
                balanceGroup.querySelector('label').textContent = isCredit ? 'Limite do Cartão' : 'Saldo Inicial';
                const input = balanceGroup.querySelector('input');
                input.name = isCredit ? 'limit' : 'balance';
                input.value = (isCredit ? account?.limit : account?.balance) || '';
            };
            toggleFields();
            selector.onchange = toggleFields;
            this.setupModalEvents();
        },
        async adjustAccountBalance(accountId) {
            const account = this.state.accounts.find(acc => acc.id === accountId);
            if (!account) return;

            const newBalanceStr = prompt('Digite o novo saldo correto:', account.balance);

            if (newBalanceStr !== null) {
                const newBalance = parseFloat(newBalanceStr.replace(',', '.'));
                if (isNaN(newBalance)) {
                    this.showToast('Valor inválido.', 'error');
                    return;
                }

                const oldBalance = parseFloat(account.balance) || 0;
                const adjustmentValue = newBalance - oldBalance;

                if (adjustmentValue === 0) {
                    this.showToast('O saldo informado é o mesmo que o atual.', 'info');
                    return;
                }

                const transactionType = adjustmentValue > 0 ? 'Entrada' : 'Saída';
                const transactionValue = Math.abs(adjustmentValue);

                const adjustmentTransaction = {
                    accountId: accountId,
                    date: firebase.firestore.Timestamp.now(),
                    monthYear: `${(new Date().getMonth() + 1).toString().padStart(2, '0')}-${new Date().getFullYear()}`,
                    description: "Ajuste de Saldo",
                    type: transactionType,
                    value: transactionValue,
                    categoryId: ''
                };

                const batch = this.db.batch();
                try {
                    const accountRef = this.db.collection('financeiro_contas').doc(accountId);
                    batch.update(accountRef, { balance: newBalance });

                    const transactionRef = this.db.collection('financeiro_lancamentos').doc();
                    batch.set(transactionRef, adjustmentTransaction);

                    await batch.commit();
                    this.showToast('Saldo ajustado e movimentação registrada!', 'success');
                } catch (error) {
                    console.error("Erro ao ajustar saldo:", error);
                    this.showToast('Ocorreu um erro ao ajustar o saldo.', 'error');
                }
            }
        },
        showCategoryModal(categoryId = null) {
            const category = categoryId ? this.state.categories.find(c => c.id === categoryId) : {};
            this.elements.modalContainer.innerHTML = `<div class="modal-content"><form id="category-form"><input type="hidden" name="id" value="${category?.id || ''}"><div class="modal-header"><h2>${category?.id ? 'Editar' : 'Nova'} Categoria</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div><div class="modal-body"><div class="form-group"><label>Nome</label><input type="text" name="name" value="${category?.name || ''}" required></div><div class="form-group"><label>Ícone (Font Awesome)</label><input type="text" name="icon" value="${category?.icon || 'fa-tag'}" placeholder="Ex: fa-utensils"></div></div><div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" form="category-form" class="button-primary">Salvar</button></div></form></div>`;
            this.setupModalEvents();
        },
        showPersonModal(personId = null) {
            const person = personId ? this.state.people.find(p => p.id === personId) : {};
            this.elements.modalContainer.innerHTML = this.getGenericModalHtml('person-form', 'Pessoa', person, [{ label: 'Nome', name: 'name', type: 'text', required: true }]);
            this.setupModalEvents();
        },
        showEstablishmentModal(establishmentId = null) {
            const establishment = establishmentId ? this.state.establishments.find(e => e.id === establishmentId) : {};
            this.elements.modalContainer.innerHTML = this.getGenericModalHtml('establishment-form', 'Estabelecimento', establishment, [{ label: 'Nome', name: 'name', type: 'text', required: true }]);
            this.setupModalEvents();
        },
        getGenericModalHtml(formId, title, item = {}, fields = []) {
            return `<div class="modal-content"><form id="${formId}"><input type="hidden" name="id" value="${item.id || ''}"><div class="modal-header"><h2>${item.id ? 'Editar' : 'Novo(a)'} ${title}</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div><div class="modal-body">${fields.map(f => `<div class="form-group"><label>${f.label}</label><input type="${f.type}" name="${f.name}" value="${item[f.name] || ''}" ${f.required ? 'required' : ''}></div>`).join('')}</div><div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" form="${formId}" class="button-primary">Salvar</button></div></form></div>`;
        },
        showTransactionDetailsModal(transaction) {
            if (!transaction) return;

            const date = this.getDateObject(transaction.date);
            const formattedDate = date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
            
            const isDebit = transaction.type === 'Saída';
            const amountClass = isDebit ? 'negative' : 'positive';
            const amountSign = isDebit ? '-' : '+';

            const accountName = this.findItemName(transaction.accountId, 'accounts');
            const categoryName = this.findItemName(transaction.categoryId, 'categories');
            const personName = transaction.personId ? this.findItemName(transaction.personId, 'people') : null;
            const establishmentName = transaction.establishmentId ? this.findItemName(transaction.establishmentId, 'establishments') : null;

            const canBeModified = !transaction.paymentId && !transaction.installmentGroupId && transaction.type !== 'Pagamento de Fatura' && transaction.type !== 'Transferência';

            const modalHtml = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Detalhes da Movimentação</h2>
                    <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="modal-body">
                    <div class="transaction-detail-header">
                        <span class="transaction-detail-value ${amountClass}">${amountSign} ${this.formatCurrency(transaction.value)}</span>
                        <span class="transaction-detail-description">${transaction.description}</span>
                    </div>
                    <div class="card-details" style="background: transparent; padding: 0; margin-top: 16px;">
                        <div class="detail-row"><span class="label">Data</span><span class="value">${formattedDate}</span></div>
                        <div class="detail-row"><span class="label">Conta</span><span class="value">${accountName}</span></div>
                        <div class="detail-row"><span class="label">Categoria</span><span class="value">${categoryName}</span></div>
                        ${personName ? `<div class="detail-row"><span class="label">Pessoa</span><span class="value">${personName}</span></div>` : ''}
                        ${establishmentName ? `<div class="detail-row"><span class="label">Estabelecimento</span><span class="value">${establishmentName}</span></div>` : ''}
                    </div>
                </div>
                <div class="modal-actions">
                    <button type="button" class="button-secondary close-modal-btn">Fechar</button>
                    ${canBeModified ? `<button type="button" class="button-danger" data-action="delete-transaction" data-id="${transaction.id}"><i class="fa-solid fa-trash"></i> Excluir</button>` : ''}
                    ${canBeModified ? `<button type="button" class="button-primary" data-action="edit-from-details" data-id="${transaction.id}"><i class="fa-solid fa-pencil"></i> Editar</button>` : ''}
                </div>
            </div>`;

            this.elements.modalContainer.innerHTML = modalHtml;
            this.setupModalEvents();
        },
        showTransactionModal(transactionId) {
            const transaction = transactionId ? this.state.allTransactions.find(t => t.id === transactionId) : {};
            if (!transaction?.id || transaction.paymentId || transaction.installmentGroupId || transaction.type === 'Pagamento de Fatura' || transaction.type === 'Transferência') {
                this.showToast("Este tipo de lançamento não pode ser editado.", "error");
                return;
            }
            const getOptions = (items = [], selectedId) => items.map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.name}</option>`).join('');
            const dateInputValue = transaction.date ? this.getLocalISODate(this.getDateObject(transaction.date)) : this.getLocalISODate();
            let formFieldsHtml = `
                <div class="form-group"><label>Descrição</label><input type="text" name="description" value="${transaction.description || ''}" required></div>
                <div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" value="${transaction.value || ''}" required></div></div>
                <div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div>
                <div class="form-group"><label>Conta</label><select name="accountId" required>${getOptions(this.state.accounts.filter(a => !a.arquivado), transaction.accountId)}</select></div>
                <div class="form-group"><label>Categoria</label><select name="categoryId" required>${getOptions(this.state.categories, transaction.categoryId)}</select></div>
            `;
            if (transaction.type === 'Saída') {
                formFieldsHtml += `
                    <div class="form-group"><label>Pessoa (Opcional)</label><select name="personId"><option value="">Nenhuma</option>${getOptions(this.state.people, transaction.personId)}</select></div>
                    <div class="form-group"><label>Estabelecimento (Opcional)</label><select name="establishmentId"><option value="">Nenhum</option>${getOptions(this.state.establishments, transaction.establishmentId)}</select></div>
                `;
            }
            this.elements.modalContainer.innerHTML = `
                <div class="modal-content">
                    <form id="transaction-form" novalidate>
                        <input type="hidden" name="id" value="${transaction.id}">
                        <div class="modal-header">
                            <h2>Editar Lançamento</h2>
                            <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
                        </div>
                        <div class="modal-body">${formFieldsHtml}</div>
                        <div class="modal-actions">
                            <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
                            <button type="submit" form="transaction-form" class="button-primary">Salvar</button>
                        </div>
                    </form>
                </div>`;
            this.setupModalEvents();
        },
        setupModalEvents() {
            if (this.closeModalTimeout) {
                clearTimeout(this.closeModalTimeout);
                this.closeModalTimeout = null;
            }
            this.elements.modalContainer.classList.add('visible');
            this.elements.modalContainer.querySelectorAll('.close-modal-btn').forEach(btn => btn.onclick = () => this.closeModal());
            this.elements.modalContainer.onclick = (e) => { if (e.target === this.elements.modalContainer) this.closeModal(); };
        },
        closeModal() {
            this.elements.modalContainer.classList.remove('visible');
            this.closeModalTimeout = setTimeout(() => {
                this.elements.modalContainer.innerHTML = '';
                this.closeModalTimeout = null;
            }, 300);
        },
        createDashboardChart(transactions) {
            const ctx = document.getElementById('dashboard-chart');
            if (!ctx) return;
            if (this.state.charts.dashboardChart) this.state.charts.dashboardChart.destroy();
            const expenseData = transactions.filter(t => t.type === 'Saída');
            let dataByGroup = {};
            let emptyMessage = "Nenhuma saída no mês";
            switch (this.state.dashboardChartType) {
                case 'establishment':
                    expenseData.forEach(t => { if (t?.establishmentId) { const name = this.findItemName(t.establishmentId, 'establishments'); dataByGroup[name] = (dataByGroup[name] || 0) + t.value; } });
                    emptyMessage = "Nenhuma saída por estabelecimento.";
                    break;
                case 'person':
                    expenseData.forEach(t => { if (t?.personId) { const name = this.findItemName(t.personId, 'people'); dataByGroup[name] = (dataByGroup[name] || 0) + t.value; } });
                    emptyMessage = "Nenhuma saída por pessoa.";
                    break;
                default:
                    expenseData.forEach(t => { const name = this.findItemName(t.categoryId, 'categories'); dataByGroup[name] = (dataByGroup[name] || 0) + t.value; });
            }
            if (Object.keys(dataByGroup).length === 0) {
                ctx.parentElement.innerHTML = `<div class="empty-state"><i class="fa-solid fa-chart-pie"></i><p>${emptyMessage}</p></div>`;
                return;
            }
            this.state.charts.dashboardChart = new Chart(ctx, { type: 'doughnut', data: { labels: Object.keys(dataByGroup), datasets: [{ data: Object.values(dataByGroup), backgroundColor: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de', '#5856d6', '#ffcc00'], hoverOffset: 4 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom' } }, cutout: '60%' } });
        },
        calculateCreditCardUsage(cardId) {
            const cardTransactions = this.state.allTransactions.filter(t => t && t.accountId === cardId);
            const totalSpent = cardTransactions.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.value, 0);
            const totalPaid = cardTransactions.filter(t => t.type === 'Pagamento de Fatura').reduce((sum, t) => sum + t.value, 0);
            return totalSpent - totalPaid;
        },
        isInvoicePaid(cardId, invoiceMonthYear) {
            return this.state.allTransactions.some(t => t && t.type === 'Pagamento de Fatura' && t.destinationAccountId === cardId && t.invoiceMonthYear === invoiceMonthYear);
        },
        calculateInvoiceDetails(cardId, useCurrentDate = false) {
            const card = this.state.accounts.find(a => a && a.id === cardId);
            if (!card || !card.closingDay) return { openInvoiceTotal: 0 };
            
            const referenceDate = useCurrentDate ? new Date() : this.getDateFromMonthYear(this.state.currentMonthYear);
            const invoiceKey = this.getInvoiceKeyForDate(referenceDate, card);

            const transactionsForInvoice = this.state.allTransactions
                .filter(t => t && t.accountId === cardId && t.type === 'Saída')
                .filter(t => this.getInvoiceKeyForDate(this.getDateObject(t.date), card) === invoiceKey);

            const totalExpenses = transactionsForInvoice.reduce((sum, t) => sum + (t.value || 0), 0);
            return { openInvoiceTotal: totalExpenses };
        },
        postRenderInvoices() {
            const cardSelector = document.getElementById('invoice-card-selector');
            const periodSelector = document.getElementById('invoice-period-selector');
            const detailsContainer = document.getElementById('invoice-details-container');
            if (!cardSelector) return;
            const renderInvoice = () => {
                const cardId = cardSelector.value;
                const card = this.state.accounts.find(a => a && a.id === cardId);
                if (!card) {
                    detailsContainer.innerHTML = '<div class="empty-state"><p>Selecione um cartão.</p></div>';
                    return;
                }
                const currentOpenInvoiceKey = this.getInvoiceKeyForDate(new Date(), card);
                const transactionsByInvoice = this.state.allTransactions
                    .filter(t => t && t.accountId === cardId && t.type === 'Saída')
                    .reduce((acc, t) => {
                        const invoiceKey = this.getInvoiceKeyForDate(this.getDateObject(t.date), card);
                        if (!acc[invoiceKey]) acc[invoiceKey] = [];
                        acc[invoiceKey].push(t);
                        return acc;
                    }, {});
                if (!transactionsByInvoice[currentOpenInvoiceKey]) {
                    transactionsByInvoice[currentOpenInvoiceKey] = [];
                }
                const sortedPeriods = Object.keys(transactionsByInvoice).sort((a, b) => {
                    const [mA, yA] = a.split('-');
                    const [mB, yB] = b.split('-');
                    return new Date(yB, mB - 1) - new Date(yA, mA - 1);
                });
                const initialPeriod = periodSelector.value || currentOpenInvoiceKey;
                periodSelector.innerHTML = sortedPeriods.map(p => {
                    const [month, year] = p.split('-');
                    const monthName = this.capitalizeFirstLetter(new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' }));
                    return `<option value="${p}" ${p === initialPeriod ? 'selected' : ''}>${monthName} de ${year}</option>`;
                }).join('');
                const currentPeriodKey = periodSelector.value;
                if (!currentPeriodKey) {
                    detailsContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-ghost"></i><p>Nenhuma fatura para este período.</p></div>';
                    return;
                }
                const transactionsForPeriod = transactionsByInvoice[currentPeriodKey] || [];
                transactionsForPeriod.sort((a, b) => this.getDateObject(b.date) - this.getDateObject(a.date));
                const invoiceTotal = transactionsForPeriod.reduce((sum, t) => sum + t.value, 0);
                const isPaid = this.isInvoicePaid(cardId, currentPeriodKey);
                
                const [month, year] = currentPeriodKey.split('-');
                const dueDate = card.dueDate ? new Date(year, parseInt(month, 10) - 1, card.dueDate) : null;
                if (dueDate && card.dueDate < card.closingDay) {
                    dueDate.setMonth(dueDate.getMonth() + 1);
                }

                detailsContainer.innerHTML = `
                <div class="card-details">
                <div class="detail-row">
                <span class="label"><strong>Total da Fatura</strong></span>
                <span class="value negative">${this.formatCurrency(invoiceTotal)}</span>
                </div>
                ${dueDate ? `
                <div class="detail-row">
                <span class="label">Vencimento</span>
                <span class="value">${dueDate.toLocaleDateString('pt-BR')}</span>
                </div>` : ''}
                <div class="detail-row">
                <span class="label">Status</span>
                <span class="value ${isPaid ? 'positive' : 'negative'}">${isPaid ? 'Paga' : 'Aberta'}</span>
                </div>
                <div style="display: flex; gap: 12px; margin-top: 16px; flex-wrap: wrap;">
                    ${!isPaid && invoiceTotal > 0 ? `<button class="button-primary" data-action="pay-invoice" data-card-id="${cardId}" data-invoice-total="${invoiceTotal}" data-invoice-key="${currentPeriodKey}"><i class="fa-solid fa-dollar-sign"></i> Pagar Fatura</button>` : ''}
                </div>
                </div>
                <h4 class="invoice-transaction-header">Lançamentos</h4>
                <div class="transaction-list compact">${transactionsForPeriod.map(t => this.getTransactionHtml(t, false)).join('') || '<div class="empty-state small"><p>Nenhum lançamento.</p></div>'}</div>
                `;
            };
            cardSelector.onchange = renderInvoice;
            periodSelector.onchange = renderInvoice;
            renderInvoice();
        },
        getDateObject(dateFieldValue) {
            if (!dateFieldValue) return new Date();
            if (typeof dateFieldValue.toDate === 'function') return dateFieldValue.toDate();
            return new Date(dateFieldValue);
        },
        getLocalISODate(date = new Date()) {
            return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
        },
        getDateFromMonthYear(monthYear) {
            const [month, year] = monthYear.split('-');
            return new Date(year, month - 1, 15);
        },
        getInvoiceKeyForDate(date, card) {
            if (!date || !card || !card.closingDay) return '';
            
            const transactionDate = this.getDateObject(date);
            let invoiceYear = transactionDate.getFullYear();
            let invoiceMonth = transactionDate.getMonth() + 1; 

            if (transactionDate.getDate() > card.closingDay) {
                invoiceMonth += 1;
                if (invoiceMonth > 12) {
                    invoiceMonth = 1;
                    invoiceYear += 1;
                }
            }
            
            return `${invoiceMonth.toString().padStart(2, '0')}-${invoiceYear}`;
        },
        capitalizeFirstLetter(string) { return string ? string.charAt(0).toUpperCase() + string.slice(1) : ''; },
        formatCurrency(value) { return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); },
        getContrastColor(hexColor) {
            if (!hexColor || hexColor.length < 7) return '#FFFFFF';
            const r = parseInt(hexColor.substr(1, 2), 16);
            const g = parseInt(hexColor.substr(3, 2), 16);
            const b = parseInt(hexColor.substr(5, 2), 16);
            return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128 ? '#000000' : '#FFFFFF';
        },
        findItemName(id, collectionName) {
            const collection = this.state[collectionName] || [];
            const item = collection.find(c => c && c.id === id);
            return item ? item.name : 'N/A';
        },
        showToast(message, type = 'success') {
            const toast = document.createElement('div');
            toast.className = `toast ${type}`;
            toast.innerHTML = `<i class="fa-solid ${type === 'success' ? 'fa-check-circle' : 'fa-times-circle'}"></i> ${message}`;
            this.elements.toastContainer.appendChild(toast);
            setTimeout(() => toast.classList.add('show'), 10);
            setTimeout(() => { toast.classList.remove('show'); toast.addEventListener('transitionend', () => toast.remove()); }, 4000);
        },
        showInstallmentDetailsModal(installmentGroupId) {
            const installments = this.state.allTransactions
                .filter(t => t && t.installmentGroupId === installmentGroupId)
                .sort((a, b) => this.getDateObject(a.date) - this.getDateObject(b.date));
            if (installments.length === 0) return;
            const originalDescription = installments[0].description.replace(/ \[\d+\/\d+\]$/, '');
            const modalHtml = `
            <div class="modal-content">
            <div class="modal-header">
            <h2>Detalhes da Compra Parcelada</h2>
            <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
            <h4>${originalDescription}</h4>
            <div class="transaction-list compact">
            ${installments.map(t => this.getTransactionHtml(t, false)).join('')}
            </div>
            </div>
            <div class="modal-actions">
            <button type="button" class="button-secondary close-modal-btn">Fechar</button>
            </div>
            </div>
            `;
            this.elements.modalContainer.innerHTML = modalHtml;
            this.setupModalEvents();
        },
        showFilterModal() {
            const { type, accountId } = this.state.movementsFilter;
            const accountOptions = `<option value="all" ${accountId === 'all' ? 'selected' : ''}>Todas as Contas</option>` +
                this.state.accounts.map(acc => `<option value="${acc.id}" ${accountId === acc.id ? 'selected' : ''}>${acc.name}</option>`).join('');
            const modalHtml = `
            <div class="modal-content">
            <form id="filter-form">
            <div class="modal-header">
            <h2>Filtrar Movimentações</h2>
            <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
            <div class="form-group">
            <label>Tipo de Lançamento</label>
            <select name="type">
            <option value="all" ${type === 'all' ? 'selected' : ''}>Todos</option>
            <option value="Entrada" ${type === 'Entrada' ? 'selected' : ''}>Entradas</option>
            <option value="Saída" ${type === 'Saída' ? 'selected' : ''}>Saídas</option>
            </select>
            </div>
            <div class="form-group">
            <label>Conta</label>
            <select name="accountId">${accountOptions}</select>
            </div>
            </div>
            <div class="modal-actions">
            <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
            <button type="submit" class="button-primary">Aplicar Filtro</button>
            </div>
            </form>
            </div>`;
            this.elements.modalContainer.innerHTML = modalHtml;
            this.setupModalEvents();
        },
        showSortModal() {
            const { key, order } = this.state.movementsSort;
            const currentSort = `${key}-${order}`;
            const modalHtml = `
            <div class="modal-content">
            <form id="sort-form">
            <div class="modal-header">
            <h2>Ordenar Movimentações</h2>
            <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
            <div class="form-group radio-group">
            <label><input type="radio" name="sort" value="date-desc" ${currentSort === 'date-desc' ? 'checked' : ''}> Mais Recentes</label>
            <label><input type="radio" name="sort" value="date-asc" ${currentSort === 'date-asc' ? 'checked' : ''}> Mais Antigos</label>
            <label><input type="radio" name="sort" value="value-desc" ${currentSort === 'value-desc' ? 'checked' : ''}> Maior Valor</label>
            <label><input type="radio" name="sort" value="value-asc" ${currentSort === 'value-asc' ? 'checked' : ''}> Menor Valor</label>
            </div>
            </div>
            <div class="modal-actions">
            <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
            <button type="submit" class="button-primary">Ordenar</button>
            </div>
            </form>
            </div>`;
            this.elements.modalContainer.innerHTML = modalHtml;
            this.setupModalEvents();
        },
        async loadPlanningData() {
            const docId = `planejamento_${this.state.currentMonthYear}`;
            try {
                const planningDoc = await this.db.collection('financeiro_planejamento').doc(docId).get();
                let planningData = { receitas: [], despesas: [] };
                if (planningDoc.exists) {
                    planningData = planningDoc.data().planningData || { receitas: [], despesas: [] };
                } else {
                    const [month, year] = this.state.currentMonthYear.split('-').map(Number);
                    const prevDate = new Date(year, month - 2, 1);
                    const prevMonthYear = `${(prevDate.getMonth() + 1).toString().padStart(2, '0')}-${prevDate.getFullYear()}`;
                    const prevDoc = await this.db.collection('financeiro_planejamento').doc(`planejamento_${prevMonthYear}`).get();
                    if (prevDoc.exists) {
                        const prevData = prevDoc.data().planningData;
                        planningData.receitas = prevData.receitas || [];
                        planningData.despesas = (prevData.despesas || []).map(d => ({ ...d, paid: false, value: d.isAutomatic ? 0 : d.value }));
                        await this.savePlanningData(planningData);
                    }
                }
                this.state.planningData = this.generateAutomaticInvoiceItems(planningData);
            } catch (error) { this.state.planningData = { receitas: [], despesas: [] }; }
        },
        async savePlanningData() {
            const docId = `planejamento_${this.state.currentMonthYear}`;
            await this.db.collection('financeiro_planejamento').doc(docId).set({ planningData: this.state.planningData }, { merge: true });
        },
        debouncedSavePlanning() {
            clearTimeout(this.planningSaveTimeout);
            this.planningSaveTimeout = setTimeout(() => {
                this.savePlanningData();
                this.showToast('Planejamento salvo!', 'success');
            }, 1500);
        },
        generateAutomaticInvoiceItems(planningData) {
            const creditCards = this.state.accounts.filter(acc => acc && acc.type === 'Cartão de Crédito' && !acc.arquivado);
            const manualDespesas = (planningData.despesas || []).filter(d => d && !d.isAutomatic);
            const automaticFaturas = creditCards.map(card => {
                const existing = (planningData.despesas || []).find(d => d && d.isAutomatic && d.cardId === card.id);
                return existing || { description: `Fatura ${card.name}`, value: 0, paid: false, isAutomatic: true, cardId: card.id };
            });
            planningData.despesas = [...automaticFaturas, ...manualDespesas];
            return planningData;
        },
        addPlanningItem(type) {
            if (type === 'receitas') {
                if (!this.state.planningData.receitas) this.state.planningData.receitas = [];
                this.state.planningData.receitas.push({ description: '', value: '' });
                this.renderList('receitas');
                setTimeout(() => {
                    const list = document.querySelector('.planning-list[data-list-type="receitas"]');
                    list.querySelector('.planning-item:last-child .planning-input-description input').focus();
                }, 50);
            } else if (type === 'despesas') {
                const newItem = { description: '', value: '', paid: false, isAutomatic: false };
                this.state.planningData.despesas.push(newItem);
                this.renderSaidasSection();
                setTimeout(() => {
                    const list = document.querySelector('.planning-list[data-list-type="outrasDespesas"]');
                    list.querySelector('.planning-item:last-child .planning-input-description input').focus();
                }, 50);
            }
            this.updateSummary();
        },
        deletePlanningItem(type, index) {
            if (this.state.planningData[type]?.[index]) {
                this.state.planningData[type].splice(index, 1);
                this.savePlanningData();
                this.renderAllPlanningSections();
            }
        },
        syncInvoiceValue(itemIndex, cardId) {
            const card = this.state.accounts.find(a => a && a.id === cardId);
            if (!card) return;
            const invoiceDetails = this.calculateInvoiceDetails(cardId, true);
            this.state.planningData.despesas[itemIndex].value = invoiceDetails.openInvoiceTotal;
            this.savePlanningData();
            this.renderSaidasSection();
            this.updateSummary();
            this.showToast(`Fatura de ${card.name} sincronizada!`, 'success');
        },

        // ======================================================================
        // SEÇÃO DE APARÊNCIA
        // ======================================================================
        applySavedSettings() {
            const savedFontSize = localStorage.getItem('appFontSize');
            if (savedFontSize) {
                document.documentElement.style.setProperty('--base-font-size', `${savedFontSize}px`);
            }

            const savedAnimationStyle = localStorage.getItem('appAnimationStyle');
            if (savedAnimationStyle) {
                this.updateAnimationSpeed(savedAnimationStyle);
            }
        },

        updateAnimationSpeed(style) {
            let speed = '0.2s';
            if (style === 'fluida') speed = '0.4s';
            if (style === 'instantanea') speed = '0s';
            document.documentElement.style.setProperty('--animation-speed', speed);
        },
        
        setupAppearanceSettings() {
            const fontSizeSlider = document.getElementById('font-size-slider');
            const animationSelector = document.getElementById('animation-style-selector');
            
            if (!fontSizeSlider || !animationSelector) return;
            
            const savedFontSize = localStorage.getItem('appFontSize') || '16';
            fontSizeSlider.value = savedFontSize;
            
            const savedAnimationStyle = localStorage.getItem('appAnimationStyle') || 'sutil';
            animationSelector.value = savedAnimationStyle;
            
            fontSizeSlider.oninput = (e) => {
                const newSize = e.target.value;
                document.documentElement.style.setProperty('--base-font-size', `${newSize}px`);
                localStorage.setItem('appFontSize', newSize);
            };
            
            animationSelector.onchange = (e) => {
                const newStyle = e.target.value;
                this.updateAnimationSpeed(newStyle);
                localStorage.setItem('appAnimationStyle', newStyle);
            };
        },

        // ======================================================================
        // CENTRAL DE RELATÓRIOS
        // ======================================================================
        setupReportGenerator() {
            const typeSelector = document.getElementById('report-type-selector');
            const itemSelector = document.getElementById('report-item-selector');
            const keywordInput = document.getElementById('report-keyword-input');
            const dateStartInput = document.getElementById('report-date-start');
            const dateEndInput = document.getElementById('report-date-end');
            const generateBtn = document.getElementById('generate-report-btn');

            if (!typeSelector) return;

            const updateItemSelector = () => {
                const type = typeSelector.value;
                itemSelector.innerHTML = '';
                keywordInput.classList.add('hidden');
                itemSelector.classList.remove('hidden');

                let items = [];
                switch (type) {
                    case 'category': items = this.state.categories; break;
                    case 'person': items = this.state.people; break;
                    case 'establishment': items = this.state.establishments; break;
                    case 'account': items = this.state.accounts; break;
                    case 'keyword':
                        itemSelector.classList.add('hidden');
                        keywordInput.classList.remove('hidden');
                        return;
                }
                items.sort((a,b) => a.name.localeCompare(b.name)).forEach(item => {
                    const option = document.createElement('option');
                    option.value = item.id;
                    option.textContent = item.name;
                    itemSelector.appendChild(option);
                });
            };

            typeSelector.onchange = updateItemSelector;
            generateBtn.onclick = () => this.generateReport();
            
            const today = new Date();
            const firstDayOfYear = new Date(today.getFullYear(), 0, 1);
            dateStartInput.value = this.getLocalISODate(firstDayOfYear);
            dateEndInput.value = this.getLocalISODate(today);

            updateItemSelector();
        },

        generateReport() {
            const type = document.getElementById('report-type-selector').value;
            const itemId = document.getElementById('report-item-selector').value;
            const keyword = document.getElementById('report-keyword-input').value.toLowerCase();
            const startDate = new Date(document.getElementById('report-date-start').value + 'T00:00:00');
            const endDate = new Date(document.getElementById('report-date-end').value + 'T23:59:59');

            if (!startDate.valueOf() || !endDate.valueOf() || startDate > endDate) {
                this.showToast('Por favor, selecione um período de datas válido.', 'error');
                return;
            }

            let filteredTransactions = this.state.allTransactions.filter(t => {
                const tDate = this.getDateObject(t.date);
                return tDate >= startDate && tDate <= endDate;
            });

            let reportTitle = '';
            let selectedItemName = '';

            switch (type) {
                case 'category':
                    selectedItemName = this.findItemName(itemId, 'categories');
                    reportTitle = `Relatório de Saídas: ${selectedItemName}`;
                    filteredTransactions = filteredTransactions.filter(t => t.categoryId === itemId && t.type === 'Saída');
                    break;
                case 'person':
                    selectedItemName = this.findItemName(itemId, 'people');
                    reportTitle = `Relatório de Transações: ${selectedItemName}`;
                    filteredTransactions = filteredTransactions.filter(t => t.personId === itemId);
                    break;
                case 'establishment':
                    selectedItemName = this.findItemName(itemId, 'establishments');
                    reportTitle = `Relatório de Transações: ${selectedItemName}`;
                    filteredTransactions = filteredTransactions.filter(t => t.establishmentId === itemId);
                    break;
                case 'account':
                    selectedItemName = this.findItemName(itemId, 'accounts');
                    reportTitle = `Relatório de Transações: ${selectedItemName}`;
                    filteredTransactions = filteredTransactions.filter(t => t.accountId === itemId);
                    break;
                case 'keyword':
                    if (!keyword) {
                        this.showToast('Por favor, digite uma palavra-chave para buscar.', 'error');
                        return;
                    }
                    reportTitle = `Relatório por Palavra-Chave: "${keyword}"`;
                    filteredTransactions = filteredTransactions.filter(t => t.description && t.description.toLowerCase().includes(keyword));
                    break;
            }

            const totalIncome = filteredTransactions.filter(t => t.type === 'Entrada').reduce((sum, t) => sum + t.value, 0);
            const totalExpense = filteredTransactions.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.value, 0);
            const finalBalance = totalIncome - totalExpense;

            const summary = { count: filteredTransactions.length, totalIncome, totalExpense, finalBalance };
            
            this.state.currentReport = { transactions: filteredTransactions, title: reportTitle, summary };
            this.showReportModal(this.state.currentReport);
        },

        showReportModal({transactions, title, summary}) {
            let transactionsHtml = '<div class="empty-state" style="padding: 20px 0;"><p>Nenhuma transação encontrada.</p></div>';

            if (transactions.length > 0) {
                transactions.sort((a,b) => this.getDateObject(b.date) - this.getDateObject(a.date));
                transactionsHtml = transactions.map(t => this.getTransactionHtml(t, true)).join('');
            }

            const summaryHtml = `
            <div class="card-details" style="background: var(--bg-tertiary); padding: 16px; margin-top: 24px; border-radius: var(--radius-m);">
                <h4 class="card-title" style="margin-bottom: 8px; font-size: 16px;">Resumo do Período</h4>
                <div class="detail-row">
                    <span class="label">Total de Entradas:</span>
                    <span class="value positive">${this.formatCurrency(summary.totalIncome)}</span>
                </div>
                <div class="detail-row" style="border-bottom: none;">
                    <span class="label">Total de Saídas:</span>
                    <span class="value negative">${this.formatCurrency(summary.totalExpense)}</span>
                </div>
                <div class="detail-row" style="border-top: 1px solid var(--separator-color); padding-top: 10px; margin-top: 5px; font-weight: bold; font-size: 16px;">
                    <span class="label">Saldo Final:</span>
                    <span class="value ${summary.finalBalance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(summary.finalBalance)}</span>
                </div>
            </div>`;
            
            const modalHtml = `
            <div class="modal-content" style="max-width: 800px;">
                <div class="modal-header">
                    <h2>${title}</h2>
                    <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="modal-body" id="report-modal-content">
                    <p style="color: var(--text-secondary); margin-bottom: 16px; text-align: center; font-weight: 500;">
                        Exibindo ${summary.count} transações.
                    </p>
                    <div class="transaction-list">${transactionsHtml}</div>
                    ${summaryHtml}
                </div>
                <div class="modal-actions">
                    <button type="button" class="button-secondary close-modal-btn">Fechar</button>
                    <button type="button" id="export-report-pdf-btn" class="button-primary"><i class="fa-solid fa-file-pdf"></i> Gerar PDF</button>
                </div>
            </div>`;
            this.elements.modalContainer.innerHTML = modalHtml;
            this.setupModalEvents();

            document.getElementById('export-report-pdf-btn').onclick = () => this.exportReportToPdf();
        },

        exportReportToPdf() {
            const { jsPDF } = window.jspdf;
            const exportBtn = document.getElementById('export-report-pdf-btn');
            const { transactions, title, summary } = this.state.currentReport;

            if (!exportBtn || !transactions) return;

            const originalBtnContent = exportBtn.innerHTML;
            exportBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Gerando...`;
            exportBtn.disabled = true;

            try {
                const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
                
                const printContainer = document.createElement('div');
                printContainer.style.position = 'absolute';
                printContainer.style.left = '-9999px';
                printContainer.style.width = '210mm';
                printContainer.style.boxSizing = 'border-box';
                printContainer.style.fontSize = '12px';
                
                let html = `
                    <style>
                        body { font-family: 'Helvetica', 'Arial', sans-serif; }
                        h1 { font-size: 16pt; margin-bottom: 5mm; color: #1c1e21; border-bottom: 0.5mm solid #e5e5ea; padding-bottom: 3mm; }
                        p { font-size: 10pt; color: #606770; margin-bottom: 10mm; }
                        table { width: 100%; border-collapse: collapse; font-size: 9pt; }
                        th, td { border-bottom: 0.3mm solid #e5e5ea; padding: 3mm 1mm; text-align: left; }
                        th { font-weight: bold; color: #1c1e21; }
                        .text-right { text-align: right; }
                        .positive { color: #28a745 !important; }
                        .negative { color: #dc3545 !important; }
                        .summary-block { page-break-inside: avoid; margin-top: 10mm; }
                        .summary-table { width: 50%; float: right; }
                        .summary-table td { border-bottom: 0.3mm solid #e5e5ea; }
                        .summary-table tr:last-child td { border-bottom: none; }
                        .summary-table .total { font-weight: bold; font-size: 10pt; }
                    </style>
                    <h1>${title}</h1>
                    <p>Exibindo ${summary.count} transações.</p>
                    <table>
                        <thead>
                            <tr>
                                <th>Data</th>
                                <th>Descrição</th>
                                <th>Conta</th>
                                <th class="text-right">Valor</th>
                            </tr>
                        </thead>
                        <tbody>`;

                transactions.forEach(t => {
                    const date = this.getDateObject(t.date).toLocaleDateString('pt-BR');
                    const description = t.description || 'N/A';
                    const account = this.findItemName(t.accountId, 'accounts');
                    const amountColor = t.type === 'Entrada' ? 'positive' : 'negative';
                    const amountSign = t.type === 'Entrada' ? '+' : '';
                    const value = this.formatCurrency(t.value);

                    html += `
                        <tr>
                            <td>${date}</td>
                            <td>${description}</td>
                            <td>${account}</td>
                            <td class="text-right ${amountColor}">${amountSign}${value}</td>
                        </tr>
                    `;
                });
                
                html += `</tbody></table>`;
                
                html += `
                    <div class="summary-block">
                        <table class="summary-table">
                            <tbody>
                                <tr><td>Total de Entradas:</td><td class="text-right positive">${this.formatCurrency(summary.totalIncome)}</td></tr>
                                <tr><td>Total de Saídas:</td><td class="text-right negative">${this.formatCurrency(summary.totalExpense)}</td></tr>
                                <tr class="total"><td>Saldo Final:</td><td class="text-right ${summary.finalBalance >= 0 ? 'positive' : 'negative'}">${this.formatCurrency(summary.finalBalance)}</td></tr>
                            </tbody>
                        </table>
                    </div>`;
                
                printContainer.innerHTML = html;
                document.body.appendChild(printContainer);

                doc.html(printContainer, {
                    callback: (pdf) => {
                        document.body.removeChild(printContainer);
                        const filename = `${title.replace(/[^\w\s]/gi, '').replace(/ /g, '_').toLowerCase()}.pdf`;
                        pdf.save(filename);
                        exportBtn.innerHTML = originalBtnContent;
                        exportBtn.disabled = false;
                    },
                    margin: [15, 15, 15, 15],
                    autoPaging: 'text',
                    width: 180,
                    windowWidth: 794
                });

            } catch(err) {
                this.showToast('Erro ao gerar PDF.', 'error');
                console.error(err);
                exportBtn.innerHTML = originalBtnContent;
                exportBtn.disabled = false;
            }
        }
    };

    App.init();
    window.App = App;
});
