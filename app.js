// app.js

import * as Utils from './utils.js';
import * as DataHandlers from './data-handlers.js';
import * as UIRenderer from './ui-renderer.js';
import * as LogicManager from './logic-manager.js';

document.addEventListener('DOMContentLoaded', () => {
    const App = {
        state: {
            currentView: 'resumos',
            currentSubView: null,
            currentMonthYear: '',
            allTransactions: [],
            accounts: [],
            categories: [],
            people: [],
            establishments: [],
            ocrRules: [],
            listeners: [],
            planningListener: null,
            charts: {},
            isLoading: true,
            initialMonthDecided: false, // Variável de controle
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

        init() {
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
                
                sidebarNav: document.querySelector('.sidebar-nav'),
                mobileNav: document.querySelector('.mobile-nav'),
                sidebarPill: document.getElementById('sidebar-pill'),
                mobilePill: document.getElementById('mobile-pill')
            };
            if (!firebase.apps.length) firebase.initializeApp(this.config.firebase);
            this.db = firebase.firestore();
            this.db.enablePersistence({ synchronizeTabs: true }).catch(err => console.error('Persistência não suportada: ', err));
            
            DataHandlers.initDataHandlers(this.db, this.state);
            LogicManager.initLogicManager(
                this.state, 
                this.db, 
                DataHandlers.savePlanningData, 
                this.renderCurrentView.bind(this),
                UIRenderer.renderLancamentoForm,
                LogicManager.calculateInvoiceDetails,
                UIRenderer.updatePlanningSummary,
                this.findItemName.bind(this)
            );
            UIRenderer.initUIRenderer(this.state, {
                findItemName: this.findItemName.bind(this),
                calculateInvoiceDetails: LogicManager.calculateInvoiceDetails,
                calculateCreditCardUsage: LogicManager.calculateCreditCardUsage,
                isInvoicePaid: LogicManager.isInvoicePaid,
                setupModalEvents: this.setupModalEvents.bind(this),
                closeModal: this.closeModal.bind(this),
                exportReportToPdf: this.exportReportToPdf.bind(this)
            });

            this.checkLogin();
        },
        
        updatePill(container, pill, activeLink, orientation = 'vertical') {
            if (!activeLink || !pill || !container) return;
        
            if (orientation === 'vertical') {
                const top = activeLink.offsetTop;
                pill.style.transform = `translateY(${top}px)`;
                pill.style.height = `${activeLink.offsetHeight}px`;
            } else {
                const left = activeLink.offsetLeft;
                pill.style.transform = `translateX(${left}px)`;
                pill.style.width = `${activeLink.offsetWidth}px`;
            }
        },

        updateNavPills() {
            const activeSidebarLink = this.elements.sidebarNav?.querySelector('.nav-link.active');
            this.updatePill(this.elements.sidebarNav, this.elements.sidebarPill, activeSidebarLink, 'vertical');

            const activeMobileLink = this.elements.mobileNav?.querySelector('.nav-link.active');
            this.updatePill(this.elements.mobileNav, this.elements.mobilePill, activeMobileLink, 'horizontal');
        },

        attachEventListeners() {
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
        
        handleFirebaseAuthError(code) {
            switch (code) {
                case 'auth/user-not-found': case 'auth/wrong-password': case 'auth/invalid-credential': return 'Credenciais inválidas.';
                default: return 'Ocorreu um erro desconhecido.';
            }
        },

        handleLoginSubmit(e) {
            e.preventDefault();
            const email = document.getElementById('email-input').value;
            const password = document.getElementById('password-input').value;
            const errorMessage = document.getElementById('error-message');
            const loginButton = document.getElementById('login-button');
            errorMessage.textContent = '';
            loginButton.disabled = true;
            firebase.auth().signInWithEmailAndPassword(email, password)
                .then(() => window.location.reload())
                .catch((error) => {
                    errorMessage.textContent = this.handleFirebaseAuthError(error.code);
                    loginButton.disabled = false;
                });
        },

        checkLogin() {
            const loginForm = document.getElementById('login-form');
            if (!loginForm) return;
            const startApp = () => {
                if (this.elements.body.classList.contains('is-loading')) {
                    this.elements.body.classList.remove('is-loading'); 
                    this.elements.authContainer.style.display = 'none';
                    LogicManager.applySavedSettings();
                    this.attachEventListeners();
                    this.fetchAllData();
                }
            };
            const showLogin = () => {
                this.elements.body.classList.remove('is-loading'); 
                this.elements.authContainer.style.display = 'flex';
                this.elements.authContainer.classList.add('is-visible');
                document.getElementById('email-input')?.focus();
            };
            firebase.auth().onAuthStateChanged(user => user ? startApp() : showLogin());
            loginForm.onsubmit = this.handleLoginSubmit.bind(this);
        },

        handleLogout() {
            firebase.auth().signOut().then(() => { this.detachListeners(); window.location.reload(); });
        },
        
        fetchAllData() {
            this.state.isLoading = true;
            this.renderCurrentView();
            this.detachListeners();

            const collections = {
                'financeiro_contas': 'accounts', 'financeiro_categorias': 'categories', 'financeiro_pessoas': 'people',
                'financeiro_estabelecimentos': 'establishments', 'financeiro_regras_ocr': 'ocrRules'
            };

            const staticDataPromise = new Promise(res => {
                const listeners = Object.entries(collections).map(([col, key]) => {
                    return this.db.collection(col).onSnapshot(snap => {
                        this.state[key] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    }, err => console.error(`Erro ao buscar ${col}:`, err));
                });
                this.state.listeners.push(...listeners);
                res();
            });

            const transactionDataPromise = new Promise(res => {
                const listener = this.db.collection('financeiro_lancamentos').orderBy('date', 'desc').onSnapshot(snap => {
                    this.state.allTransactions = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                    if (!this.state.isLoading) {
                        this.renderCurrentView();
                    }
                    res();
                }, err => { console.error("Erro ao buscar lançamentos:", err); res(); });
                this.state.listeners.push(listener);
            });
            
            Promise.all([staticDataPromise, transactionDataPromise]).then(() => {
                if (this.state.initialMonthDecided) return;
                this.state.initialMonthDecided = true;

                const now = new Date();
                const currentRealMonthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
                const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 15);
                
                let hasUnpaidInvoicesInPreviousMonth = false;
                const creditCards = this.state.accounts.filter(a => a?.type === 'Cartão de Crédito' && !a.arquivado);

                for (const card of creditCards) {
                    const { openInvoiceTotal, invoiceKey } = LogicManager.calculateInvoiceDetails(card.id, new Date(prevMonthDate));
                    if (openInvoiceTotal > 0) {
                        const isPaid = LogicManager.isInvoicePaid(card.id, invoiceKey);
                        if (!isPaid) {
                            hasUnpaidInvoicesInPreviousMonth = true;
                            break; 
                        }
                    }
                }
                
                const previousMonthYear = `${(prevMonthDate.getMonth() + 1).toString().padStart(2, '0')}-${prevMonthDate.getFullYear()}`;
                this.state.currentMonthYear = hasUnpaidInvoicesInPreviousMonth ? previousMonthYear : currentRealMonthYear;

                this.state.isLoading = false;
                this.populateMonthSelector();
                this.attachPlanningListener();
                this.render();
                setTimeout(() => this.updateNavPills(), 100);
            });
        },
        
        attachPlanningListener() {
            if (this.state.planningListener) this.state.planningListener();
            const docId = `planejamento_${this.state.currentMonthYear}`;
            const docRef = this.db.collection('financeiro_planejamento').doc(docId);
            this.state.planningListener = docRef.onSnapshot(async (doc) => {
                if (doc.metadata.hasPendingWrites) {
                    if (this.state.currentView === 'planning') UIRenderer.updatePlanningSummary();
                    return;
                }

                const planningDoc = doc.data();
                this.state.planningData = (doc.exists && planningDoc && planningDoc.planningData) ? planningDoc.planningData : { receitas: [], despesas: [] };
                
                await LogicManager.syncAutomaticInvoices();
                
                if (this.state.currentView === 'planning') {
                    UIRenderer.renderPlanningLists();
                    UIRenderer.updatePlanningSummary();
                }
            }, err => console.error("Erro no listener de planejamento:", err));
        },

        populateMonthSelector() {
            const monthsSet = new Set(this.state.allTransactions.map(t => t.monthYear).filter(Boolean));
            const now = new Date();
            const currentRealMonthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
            const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
            const previousMonthYear = `${(prevMonthDate.getMonth() + 1).toString().padStart(2, '0')}-${prevMonthDate.getFullYear()}`;

            monthsSet.add(currentRealMonthYear);
            monthsSet.add(previousMonthYear);

            this.state.availableMonths = Array.from(monthsSet).sort((a, b) => new Date(b.split('-')[1], b.split('-')[0]-1) - new Date(a.split('-')[1], a.split('-')[0]-1));
            this.elements.monthYearSelector.innerHTML = this.state.availableMonths.map(monthYear => {
                const [month, year] = monthYear.split('-');
                const monthName = Utils.capitalizeFirstLetter(new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' }));
                return `<option value="${monthYear}">${monthName} de ${year}</option>`;
            }).join('');
            
            if (this.state.currentMonthYear) {
                this.elements.monthYearSelector.value = this.state.currentMonthYear;
            }
        },

        detachListeners() {
            this.state.listeners.forEach(unsubscribe => unsubscribe());
            this.state.listeners = [];
            if (this.state.planningListener) { this.state.planningListener(); this.state.planningListener = null; }
        },

        navigate(e, data = null) {
            if (e) e.preventDefault();
            const view = e ? e.currentTarget.dataset.view : data.view;
            if (this.state.currentView === view && !data) return;
            
            this.state.currentView = view;
            this.state.currentSubView = null;
            this.render();

            if (data && data.formType) {
                 UIRenderer.renderLancamentoForm(data.formType, data.prefill);
            }
        },

        changeMonth(monthYear) {
            this.state.currentMonthYear = monthYear;
            this.attachPlanningListener();
            this.renderCurrentView();
        },

        navigateMonth(direction) {
            const currentIndex = this.state.availableMonths.indexOf(this.state.currentMonthYear);
            const newIndex = currentIndex - direction;
            if (newIndex >= 0 && newIndex < this.state.availableMonths.length) {
                this.elements.monthYearSelector.value = this.state.availableMonths[newIndex];
                this.changeMonth(this.state.availableMonths[newIndex]);
            }
        },
        
        render() {
            this.elements.navLinks.forEach(link => link.classList.toggle('active', link.dataset.view === this.state.currentView));
            this.renderCurrentView();
            
            setTimeout(() => {
                this.updateNavPills();
            }, 50);
        },

        renderCurrentView() {
            const viewContainer = this.elements.viewContainer;
            if (this.elements.planningKeydownListener) {
                viewContainer.removeEventListener('keydown', this.elements.planningKeydownListener);
            }
            if (this.state.isLoading) {
                viewContainer.innerHTML = `<div class="loading-spinner"></div>`;
                return;
            }
            let html = '';
            switch (this.state.currentView) {
                case 'resumos': html = UIRenderer.getResumosHtml(); break;
                case 'lancar': html = UIRenderer.getLancarHtml(); break;
                case 'invoices': html = UIRenderer.getInvoicesHtml(); break;
                case 'movements': html = UIRenderer.getMovementsHtml(); break;
                case 'accounts': html = UIRenderer.getAccountsHtml(); break;
                case 'planning': html = UIRenderer.getPlanningHtml(); break;
                case 'settings': html = this.state.currentSubView ? UIRenderer.getSettingsSubmenuHtml(this.state.currentSubView) : UIRenderer.getSettingsHtml(); break;
                default: html = UIRenderer.getResumosHtml();
            }
            viewContainer.innerHTML = html;
            
            if (this.state.currentView === 'resumos') {
                UIRenderer.createDashboardChart();
                LogicManager.setupReportGenerator(this.generateReportAndShowModal.bind(this));
            } else if (this.state.currentView === 'invoices') {
                LogicManager.postRenderInvoices(UIRenderer.getTransactionHtml);
            } else if (this.state.currentView === 'planning') {
                UIRenderer.renderPlanningLists();
                UIRenderer.updatePlanningSummary();
            } else if (this.state.currentView === 'settings' && this.state.currentSubView) {
                if (this.state.currentSubView === 'ocr-rules') UIRenderer.renderOcrRulesList();
                else if (this.state.currentSubView === 'appearance') LogicManager.setupAppearanceSettings();
            }
        },

        handleViewContainerClick(e) {
            const target = e.target.closest('[data-action]');
            if (!target) {
                const menu = document.querySelector('.card-actions-menu:not(.hidden)');
                if (menu && !e.target.closest('.card-actions-button') && !e.target.closest('.card-actions-menu')) {
                    menu.classList.add('hidden');
                }
                const item = e.target.closest('.transaction-list-item');
                if (item && !e.target.closest('[data-action]')) { 
                    const trans = this.state.allTransactions.find(t => t.id === item.dataset.id);
                    if (trans) UIRenderer.showTransactionDetailsModal(trans);
                }
                return;
            }
            const { action, id } = target.dataset;
            const actions = {
                'navigate-to-submenu': () => { this.state.currentSubView = target.dataset.submenu; this.renderCurrentView(); },
                'navigate-back-from-submenu': () => { this.state.currentSubView = null; this.renderCurrentView(); },
                'show-lancar-form': () => UIRenderer.renderLancamentoForm(target.dataset.formType),
                'add-establishment': () => UIRenderer.showEstablishmentModal(),
                'edit-establishment': () => UIRenderer.showEstablishmentModal(id),
                'delete-establishment': () => DataHandlers.deleteItem('financeiro_estabelecimentos', id, 'Estabelecimento'),
                'add-ocr-rule': () => UIRenderer.showOcrRuleModal(),
                'edit-ocr-rule': () => UIRenderer.showOcrRuleModal(id),
                'delete-ocr-rule': () => DataHandlers.deleteItem('financeiro_regras_ocr', id, 'Regra OCR'),
                'test-ocr-rule': () => {
                    const modal = document.querySelector('#ocr-rule-form');
                    if (!modal) return;
                    const rule = {
                        name: modal.querySelector('[name="name"]').value,
                        type: modal.querySelector('[name="type"]').value,
                        pattern: modal.querySelector('[name="pattern"]').value,
                        associatedId: modal.querySelector('[name="associatedId"]') ? modal.querySelector('[name="associatedId"]').value : null
                    };
                    const testText = modal.querySelector('#ocr-tester-input').value;
                    const result = LogicManager.testSingleOcrRule(testText, rule);
                    const resultContainer = modal.querySelector('#ocr-tester-result');
                    if (result.success) {
                        resultContainer.innerHTML = `<span class="positive"><i class="fa-solid fa-check-circle"></i> <strong>Valor Extraído:</strong> ${result.value}</span>`;
                    } else {
                        resultContainer.innerHTML = `<span class="negative"><i class="fa-solid fa-times-circle"></i> <strong>Resultado:</strong> ${result.message}</span>`;
                    }
                },
                'cancel-lancar-form': () => { document.getElementById('form-lancamento-container').innerHTML = ''; },
                'change-chart-type': () => { this.state.dashboardChartType = target.dataset.chart; this.renderCurrentView(); },
                'toggle-menu': () => { document.querySelectorAll('.card-actions-menu').forEach(m => { if (m.dataset.menuId !== id) m.classList.add('hidden'); }); document.querySelector(`.card-actions-menu[data-menu-id="${id}"]`)?.classList.toggle('hidden'); },
                'toggle-archived': () => { this.state.showArchived = !this.state.showArchived; this.renderCurrentView(); },
                'pay-invoice': () => this.navigate(null, { view: 'lancar', formType: 'pagarFatura', prefill: { destinationAccountId: target.dataset.cardId, value: parseFloat(target.dataset.invoiceTotal), invoiceMonthYear: target.dataset.invoiceKey } }),
                'edit-from-details': () => { this.closeModal(); setTimeout(() => UIRenderer.showTransactionModal(id), 310); },
                'add-account': () => UIRenderer.showAccountModal(),
                'edit-account': () => UIRenderer.showAccountModal(id),
                'delete-account': () => DataHandlers.deleteItem('financeiro_contas', id, 'Conta'),
                'archive-account': () => { const acc = this.state.accounts.find(a => a.id === id); this.db.collection('financeiro_contas').doc(id).update({ arquivado: !acc.arquivado }); },
                'adjust-balance': () => LogicManager.adjustAccountBalance(id),
                'delete-transaction': () => DataHandlers.deleteItem('financeiro_lancamentos', id, 'Lançamento', this.state.allTransactions.find(t => t.id === id)).then(success => success && this.closeModal()),
                'show-filter-modal': () => UIRenderer.showFilterModal(),
                'show-sort-modal': () => UIRenderer.showSortModal(),
                'add-planning-item': () => LogicManager.addPlanningItem(target.dataset.type),
                'save-planning-item': () => LogicManager.savePlanningItem(target.dataset.type, target.dataset.index),
                'delete-planning-item': () => LogicManager.deletePlanningItem(target.dataset.type, target.dataset.index),
                'sync-invoice': () => LogicManager.syncInvoiceValue(target.dataset.index, target.dataset.cardId),
                'add-category': () => UIRenderer.showCategoryModal(),
                'edit-category': () => UIRenderer.showCategoryModal(id),
                'delete-category': () => DataHandlers.deleteItem('financeiro_categorias', id, 'Categoria'),
                'add-person': () => UIRenderer.showPersonModal(),
                'edit-person': () => UIRenderer.showPersonModal(id),
                'delete-person': () => DataHandlers.deleteItem('financeiro_pessoas', id, 'Pessoa'),
                'show-add-alias-modal': () => UIRenderer.showAddAliasModal(target.dataset.description),
                'launch-ocr': () => LogicManager.launchOcr(UIRenderer.renderLancamentoForm),
            };
            if (actions[action]) actions[action]();
        },

        async handleFormSubmit(e) {
            e.preventDefault();
            const form = e.target.closest('form');
            if (!form) return;
        
            const formId = form.getAttribute('id');
        
            const handlers = {
                'account-form': () => DataHandlers.saveItem(e, 'financeiro_contas', 'Conta'),
                'category-form': () => DataHandlers.saveItem(e, 'financeiro_categorias', 'Categoria'),
                'person-form': () => DataHandlers.saveItem(e, 'financeiro_pessoas', 'Pessoa'),
                'establishment-form': () => DataHandlers.saveItem(e, 'financeiro_estabelecimentos', 'Estabelecimento'),
                'ocr-rule-form': () => DataHandlers.saveItem(e, 'financeiro_regras_ocr', 'Regra OCR'),
                'add-alias-form': () => DataHandlers.saveAssociation(form),
                'transaction-form': () => DataHandlers.saveTransaction(form, true),
                'lancar-form': () => DataHandlers.saveTransaction(form, false),
                'filter-form': () => {
                    this.state.movementsFilter = Object.fromEntries(new FormData(form).entries());
                    this.closeModal(); this.renderCurrentView();
                    return Promise.resolve({ success: false });
                },
                'sort-form': () => {
                    const [key, order] = new FormData(form).get('sort').split('-');
                    this.state.movementsSort = { key, order };
                    this.closeModal(); this.renderCurrentView();
                    return Promise.resolve({ success: false });
                }
            };
        
            if (handlers[formId]) {
                const result = await handlers[formId]();
                if (result?.success) {
                    this.closeModal();
                    if (result.shouldCheckForMonthAdvance) {
                        this.checkForMonthAdvance(result.monthYear);
                    }
                }
            }
        },

        checkForMonthAdvance(monthYear) {
            const now = new Date();
            const currentRealMonthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
        
            if (monthYear === currentRealMonthYear) {
                return;
            }
        
            let hasUnpaidInvoices = false;
            const creditCards = this.state.accounts.filter(a => a?.type === 'Cartão de Crédito' && !a.arquivado);
            const [month, year] = monthYear.split('-');
            const refDate = new Date(year, month - 1, 15);
        
            for (const card of creditCards) {
                const { openInvoiceTotal, invoiceKey } = LogicManager.calculateInvoiceDetails(card.id, refDate);
                if (openInvoiceTotal > 0 && !LogicManager.isInvoicePaid(card.id, invoiceKey)) {
                    hasUnpaidInvoices = true;
                    break;
                }
            }
        
            if (!hasUnpaidInvoices) {
                Utils.showToast('Todas as faturas do mês foram pagas! Avançando para o mês atual.', 'success');
                this.changeMonth(currentRealMonthYear);
            }
        },
        
        handleStateUpdateOnInput(e) {
            const input = e.target;
            if (input.classList.contains('val')) {
                UIRenderer.updatePlanningSummary();
            }
            if (input.closest('#lancar-form')) {
                if (input.name === 'description') {
                    LogicManager.handleDescriptionChange(input.value, input.closest('form'));
                }
            }
        },

        handleSaveOnChange(e) {
            const target = e.target;
            const checkbox = target.closest('.checkbox-paid input.paid');
            if (checkbox) {
                const { type, index } = checkbox.dataset;
                const item = this.state.planningData?.[type]?.[parseInt(index)];
                if(item) {
                    item.paid = checkbox.checked;
                    DataHandlers.savePlanningData(this.state.planningData, this.state.currentMonthYear);
                    UIRenderer.updatePlanningSummary();
                }
            }
            if (target.id === 'lancar-saida-account') {
                const form = target.closest('form');
                const installmentsGroup = form.querySelector('#installments-group');
                const selectedAccount = this.state.accounts.find(a => a.id === target.value);
                if(installmentsGroup) {
                    installmentsGroup.classList.toggle('hidden', selectedAccount?.type !== 'Cartão de Crédito');
                }
            }
            if (target.name === 'establishmentId') {
                 const form = target.closest('form');
                 LogicManager.handleEstablishmentChange(target.value, form);
            }
        },

        setupModalEvents() {
            if (this.closeModalTimeout) clearTimeout(this.closeModalTimeout);
            this.elements.modalContainer.classList.add('visible');
            this.elements.modalContainer.querySelectorAll('.close-modal-btn, .modal-actions .button-secondary').forEach(btn => {
                if (!btn.id?.includes('delete')) { 
                    btn.onclick = () => this.closeModal();
                }
            });
            this.elements.modalContainer.onclick = (e) => { if (e.target === this.elements.modalContainer) this.closeModal(); };
        },

        closeModal() {
            this.elements.modalContainer.classList.remove('visible');
            this.closeModalTimeout = setTimeout(() => { this.elements.modalContainer.innerHTML = ''; }, 300);
        },

        findItemName(id, collectionName) {
            const collection = this.state[collectionName] || [];
            return collection.find(c => c.id === id)?.name || 'N/A';
        },
        
        generateReportAndShowModal() {
            LogicManager.generateReport(UIRenderer.showReportModal);
        },
        
        async exportReportToPdf() {
            const exportBtn = document.getElementById('export-report-pdf-btn');
            if(!exportBtn || !this.state.currentReport) return;
            exportBtn.disabled = true;
            exportBtn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Gerando...`;
            try {
                const { jsPDF } = window.jspdf;
                const { transactions, title, summary } = this.state.currentReport;
                const doc = new jsPDF();
                doc.setFontSize(18);
                doc.text(title, 14, 22);
                const tableBody = transactions.map(t => [
                    Utils.getDateObject(t.date).toLocaleDateString('pt-BR'),
                    t.description, 
                    this.findItemName(t.accountId, 'accounts'),
                    Utils.formatCurrency(t.value)
                ]);
                doc.autoTable({ 
                    head: [['Data', 'Descrição', 'Conta', 'Valor']], 
                    body: tableBody, startY: 30, theme: 'grid'
                });
                let finalY = doc.lastAutoTable.finalY || 40;
                doc.setFontSize(12);
                doc.text('Resumo do Período', 14, finalY + 10);
                doc.autoTable({
                    body: [
                        ['Total de Entradas', Utils.formatCurrency(summary.totalIncome)],
                        ['Total de Saídas', Utils.formatCurrency(summary.totalExpense)],
                        ['Saldo Final', Utils.formatCurrency(summary.finalBalance)]
                    ],
                    startY: finalY + 15, theme: 'plain'
                });
                doc.save(`${title.replace(/[^\w]/g, '_')}.pdf`);
            } catch (err) {
                console.error("PDF Generation Error:", err);
            } finally {
                exportBtn.disabled = false;
                exportBtn.innerHTML = `<i class="fa-solid fa-file-pdf"></i> Gerar PDF`;
            }
        }
    };
    App.init();
});