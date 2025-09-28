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
            
            DataHandlers.initDataHandlers(this.db, this.state);
            LogicManager.initLogicManager(
                this.state, 
                this.db, 
                DataHandlers.savePlanningData, 
                this.renderCurrentView.bind(this),
                UIRenderer.renderLancamentoForm,
                LogicManager.calculateInvoiceDetails,
                UIRenderer.updateSummary,
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
                case 'auth/user-not-found':
                case 'auth/wrong-password':
                case 'auth/invalid-credential':
                    return 'Credenciais inválidas. Verifique seu e-mail e senha.';
                default:
                    return 'Ocorreu um erro desconhecido no login.';
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
                    this.setCurrentMonthYear();
                }
            };
            const showLogin = () => {
                this.elements.body.classList.remove('is-loading'); 
                this.elements.authContainer.style.display = 'flex';
                document.getElementById('email-input')?.focus();
            };
            firebase.auth().onAuthStateChanged(user => user ? startApp() : showLogin());
            loginForm.onsubmit = this.handleLoginSubmit.bind(this);
        },

        handleLogout() {
            firebase.auth().signOut().then(() => {
                this.detachListeners();
                window.location.reload(); 
            });
        },
        
        setCurrentMonthYear() {
            const now = new Date();
            this.state.currentMonthYear = `${(now.getMonth() + 1).toString().padStart(2, '0')}-${now.getFullYear()}`;
            this.fetchAllData();
        },

        fetchAllData() {
            this.state.isLoading = true;
            this.detachListeners();
            const collections = {
                'financeiro_contas': 'accounts',
                'financeiro_categorias': 'categories',
                'financeiro_pessoas': 'people',
                'financeiro_estabelecimentos': 'establishments',
                'financeiro_regras_ocr': 'ocrRules'
            };
            const promises = Object.entries(collections).map(([col, stateKey]) =>
                new Promise(resolve => {
                    const listener = this.db.collection(col).onSnapshot(snap => {
                        this.state[stateKey] = snap.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                        resolve();
                    });
                    this.state.listeners.push(listener);
                })
            );
            const transactionsListener = this.db.collection('financeiro_lancamentos').orderBy('date', 'desc').onSnapshot(snapshot => {
                this.state.allTransactions = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
                this.populateMonthSelector();
                Promise.all(promises).then(async () => {
                    if (this.state.isLoading) {
                        this.state.isLoading = false;
                        if (!this.state.ocrRules?.length) await LogicManager.seedDefaultOcrRules();
                        this.attachPlanningListener();
                        this.render();
                    } else {
                        this.renderCurrentView();
                    }
                });
            });
            this.state.listeners.push(transactionsListener);
        },
        
        attachPlanningListener() {
            if (this.state.planningListener) this.state.planningListener();

            // << CORREÇÃO 1: Nome do documento >>
            const docId = `planejamento_${this.state.currentMonthYear}`;
            const docRef = this.db.collection('financeiro_planejamento').doc(docId);
            
            this.state.planningListener = docRef.onSnapshot(async (doc) => {
                console.log(`Dados de planejamento para ${docId} sincronizados.`);
                
                // << CORREÇÃO 2: Estrutura dos dados >>
                if (doc.exists && doc.data().planningData) {
                    this.state.planningData = doc.data().planningData;
                } else {
                    this.state.planningData = { receitas: [], despesas: [] };
                }
                
                await LogicManager.syncAutomaticInvoices();
                
                if (this.state.currentView === 'planning') {
                    UIRenderer.renderAllPlanningSections();
                }
            }, (error) => console.error("Erro no listener de planejamento:", error));
        },

        populateMonthSelector() {
            const monthsSet = new Set();
            this.state.allTransactions.forEach(t => {
                if (t?.date) {
                    const jsDate = Utils.getDateObject(t.date);
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
            selector.innerHTML = this.state.availableMonths.map(monthYear => {
                const [month, year] = monthYear.split('-');
                const monthName = Utils.capitalizeFirstLetter(new Date(year, month - 1, 1).toLocaleString('pt-BR', { month: 'long' }));
                return `<option value="${monthYear}">${monthName} de ${year}</option>`;
            }).join('');
            selector.value = this.state.currentMonthYear;
        },

        detachListeners() {
            this.state.listeners.forEach(unsubscribe => unsubscribe());
            this.state.listeners = [];
            if (this.state.planningListener) {
                this.state.planningListener();
                this.state.planningListener = null;
            }
        },

        navigate(e, data = null) {
            e.preventDefault();
            const view = e.currentTarget.dataset.view;
            if (this.state.currentView === view && !data && !this.state.currentSubView) return;
            this.state.currentView = view;
            this.state.currentSubView = null;
            this.render();
            if (view === 'lancar' && data) UIRenderer.renderLancamentoForm(data.formType, data.prefill);
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
        },

        async renderCurrentView() {
            const viewContainer = this.elements.viewContainer;
            if (this.elements.planningKeydownListener) {
                viewContainer.removeEventListener('keydown', this.elements.planningKeydownListener);
                this.elements.planningKeydownListener = null;
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
                case 'settings': 
                    html = this.state.currentSubView ? UIRenderer.getSettingsSubmenuHtml(this.state.currentSubView) : UIRenderer.getSettingsHtml();
                    break;
                default: html = UIRenderer.getResumosHtml();
            }
            viewContainer.innerHTML = html;
            
            if (this.state.currentView === 'resumos') {
                UIRenderer.createDashboardChart();
                LogicManager.setupReportGenerator(this.generateReportAndShowModal.bind(this));
            } else if (this.state.currentView === 'invoices') {
                LogicManager.postRenderInvoices(UIRenderer.getTransactionHtml);
            } else if (this.state.currentView === 'planning') {
                UIRenderer.renderAllPlanningSections();
                LogicManager.attachPlanningKeydownListener(viewContainer, this.elements);
            } else if (this.state.currentView === 'settings' && this.state.currentSubView) {
                if (this.state.currentSubView === 'ocr-rules') UIRenderer.renderOcrRulesList();
                else if (this.state.currentSubView === 'appearance') LogicManager.setupAppearanceSettings();
            }
        },

        handleViewContainerClick(e) {
            const target = e.target.closest('[data-action]');
            if (!target) {
                const menu = document.querySelector('.card-actions-menu:not(.hidden)');
                if (menu && !e.target.closest('.card-actions-button')) menu.classList.add('hidden');
                const item = e.target.closest('.transaction-list-item');
                if (item && !e.target.closest('.delete-btn')) {
                    const trans = this.state.allTransactions.find(t => t.id === item.dataset.id);
                    if (trans) UIRenderer.showTransactionDetailsModal(trans);
                }
                return;
            }
            const { action, id, type, index, cardId, chart, invoiceKey, submenu, description } = target.dataset;
            const actions = {
                'navigate-to-submenu': () => { this.state.currentSubView = submenu; this.renderCurrentView(); },
                'navigate-back-from-submenu': () => { this.state.currentSubView = null; this.renderCurrentView(); },
                'show-lancar-form': () => UIRenderer.renderLancamentoForm(target.dataset.formType),
                'cancel-lancar-form': () => { document.getElementById('form-lancamento-container').innerHTML = ''; },
                'change-chart-type': () => { this.state.dashboardChartType = chart; this.renderCurrentView(); },
                'toggle-menu': () => { document.querySelectorAll('.card-actions-menu').forEach(m => { if (m.dataset.menuId !== id) m.classList.add('hidden'); }); document.querySelector(`.card-actions-menu[data-menu-id="${id}"]`)?.classList.toggle('hidden'); },
                'toggle-archived': () => { this.state.showArchived = !this.state.showArchived; this.renderCurrentView(); },
                'pay-invoice': () => this.navigate({ currentTarget: { dataset: { view: 'lancar' } }, preventDefault: () => {} }, { formType: 'pagarFatura', prefill: { destinationAccountId: cardId, value: parseFloat(target.dataset.invoiceTotal), invoiceMonthYear: invoiceKey } }),
                'edit-from-details': () => UIRenderer.showTransactionModal(id),
                'add-account': () => UIRenderer.showAccountModal(),
                'edit-account': () => UIRenderer.showAccountModal(id),
                'delete-account': async () => { if(await DataHandlers.deleteItem('financeiro_contas', id, 'Conta')) this.closeModal(); },
                'archive-account': () => { const acc = this.state.accounts.find(a => a.id === id); this.db.collection('financeiro_contas').doc(id).update({ arquivado: !acc.arquivado }); },
                'adjust-balance': () => LogicManager.adjustAccountBalance(id),
                'delete-transaction': async () => { const trans = this.state.allTransactions.find(t => t.id === id); if(await DataHandlers.deleteItem('financeiro_lancamentos', id, 'Lançamento', trans)) this.closeModal(); },
                'show-filter-modal': () => UIRenderer.showFilterModal(),
                'show-sort-modal': () => UIRenderer.showSortModal(),
                'add-planning-item': () => LogicManager.addPlanningItem(type),
                'delete-planning-item': () => LogicManager.deletePlanningItem(type, index),
                'sync-invoice': () => LogicManager.syncInvoiceValue(index, cardId),
                'add-category': () => UIRenderer.showCategoryModal(),
                'edit-category': () => UIRenderer.showCategoryModal(id),
                'delete-category': async () => { if(await DataHandlers.deleteItem('financeiro_categorias', id, 'Categoria')) this.closeModal(); },
                'add-person': () => UIRenderer.showPersonModal(),
                'edit-person': () => UIRenderer.showPersonModal(id),
                'delete-person': async () => { if(await DataHandlers.deleteItem('financeiro_pessoas', id, 'Pessoa')) this.closeModal(); },
                'add-establishment': () => UIRenderer.showEstablishmentModal(),
                'edit-establishment': () => UIRenderer.showEstablishmentModal(id),
                'delete-establishment': async () => { if(await DataHandlers.deleteItem('financeiro_estabelecimentos', id, 'Estabelecimento')) this.closeModal(); },
                'show-add-alias-modal': () => UIRenderer.showAddAliasModal(description),
                'launch-ocr': () => LogicManager.launchOcr(UIRenderer.renderLancamentoForm),
                'add-ocr-rule': () => UIRenderer.showOcrRuleModal(),
                'edit-ocr-rule': () => UIRenderer.showOcrRuleModal(id),
                'delete-ocr-rule': async () => { if(await DataHandlers.deleteItem('financeiro_regras_ocr', id, 'Regra OCR')) this.closeModal(); },
            };
            if (actions[action]) actions[action]();
        },

        async handleFormSubmit(e) {
            e.preventDefault();
            const form = e.target;
            const handlers = {
                'account-form': () => DataHandlers.saveItem(e, 'financeiro_contas', 'Conta'),
                'category-form': () => DataHandlers.saveItem(e, 'financeiro_categorias', 'Categoria'),
                'person-form': () => DataHandlers.saveItem(e, 'financeiro_pessoas', 'Pessoa'),
                'establishment-form': () => DataHandlers.saveItem(e, 'financeiro_estabelecimentos', 'Estabelecimento'),
                'add-alias-form': () => DataHandlers.saveAssociation(form),
                'transaction-form': () => DataHandlers.saveTransaction(form, true),
                'lancar-form': () => DataHandlers.saveTransaction(form, false),
                'ocr-rule-form': () => DataHandlers.saveItem(e, 'financeiro_regras_ocr', 'Regra OCR'),
                'filter-form': () => {
                    this.state.movementsFilter = Object.fromEntries(new FormData(form).entries());
                    this.closeModal(); this.renderCurrentView(); return { success: false };
                },
                'sort-form': () => {
                    const [key, order] = new FormData(form).get('sort').split('-');
                    this.state.movementsSort = { key, order };
                    this.closeModal(); this.renderCurrentView(); return { success: false };
                }
            };
            if (handlers[form.id]) {
                const result = await handlers[form.id]();
                if (result?.success) this.closeModal();
            }
        },

        handleStateUpdateOnInput(e) {
            if (e.target.closest('.planning-input')) {
                const input = e.target;
                const { type, index, field } = input.dataset;
                const value = input.type === 'number' ? parseFloat(input.value) || 0 : input.value;
                this.state.planningData[type][index][field] = value;
                UIRenderer.updateSummary();
                LogicManager.debouncedSavePlanning();
            }
        },

        handleSaveOnChange(e) {
            if (e.target.closest('.planning-item-checkbox')) {
                const checkbox = e.target;
                const { type, index } = checkbox.dataset;
                const item = this.state.planningData[type][parseInt(index)];
                item.paid = checkbox.checked;
                DataHandlers.savePlanningData(this.state.planningData, this.state.currentMonthYear);
                checkbox.closest('.planning-item').classList.toggle('paid', checkbox.checked);
                UIRenderer.updateSummary();
            }
            if (e.target.id === 'lancar-saida-account') {
                const form = e.target.closest('form');
                const installmentsGroup = form.querySelector('#installments-group');
                const selectedAccount = this.state.accounts.find(a => a.id === e.target.value);
                installmentsGroup.classList.toggle('hidden', selectedAccount?.type !== 'Cartão de Crédito');
            }
        },

        setupModalEvents() {
            if (this.closeModalTimeout) clearTimeout(this.closeModalTimeout);
            this.elements.modalContainer.classList.add('visible');
            this.elements.modalContainer.querySelectorAll('.close-modal-btn').forEach(btn => btn.onclick = () => this.closeModal());
            this.elements.modalContainer.onclick = (e) => { if (e.target === this.elements.modalContainer) this.closeModal(); };
        },

        closeModal() {
            this.elements.modalContainer.classList.remove('visible');
            this.closeModalTimeout = setTimeout(() => {
                this.elements.modalContainer.innerHTML = '';
            }, 300);
        },

        findItemName(id, collectionName) {
            const collection = this.state[collectionName] || [];
            const item = collection.find(c => c && c.id === id);
            return item ? item.name : 'N/A';
        },
        
        generateReportAndShowModal() {
            LogicManager.generateReport(UIRenderer.showReportModal);
        },
        
        async exportReportToPdf() {
            const exportBtn = document.getElementById('export-report-pdf-btn');
            if(!exportBtn || !this.state.currentReport) return;
            exportBtn.disabled = true;
            try {
                const { jsPDF } = window.jspdf;
                const { transactions, title } = this.state.currentReport;
                const doc = new jsPDF();
                const tableBody = transactions.map(t => [
                    Utils.getDateObject(t.date).toLocaleDateString('pt-BR'),
                    t.description, 
                    this.findItemName(t.accountId, 'accounts'),
                    Utils.formatCurrency(t.value)
                ]);
                doc.autoTable({ head: [['Data', 'Descrição', 'Conta', 'Valor']], body: tableBody });
                doc.save(`${title.replace(/[^\w]/g, '_')}.pdf`);
            } catch (err) {
                Utils.showToast('Erro ao gerar PDF.', 'error');
            } finally {
                exportBtn.disabled = false;
            }
        }
    };

    App.init();
});