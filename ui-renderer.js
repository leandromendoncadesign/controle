// ui-renderer.js

import { 
    formatCurrency, 
    getContrastColor, 
    capitalizeFirstLetter,
    getDateObject,
    getLocalISODate
} from './utils.js';

// Variáveis de escopo global injetadas pelo App.js
let appState; 
let findItemNameGlobal;
let calculateInvoiceDetailsGlobal;
let calculateCreditCardUsageGlobal;
let isInvoicePaidGlobal;
let setupModalEventsGlobal;
let closeModalGlobal;
let exportReportToPdfGlobal;

export function initUIRenderer(state, dependencies) {
    appState = state;
    findItemNameGlobal = dependencies.findItemName;
    calculateInvoiceDetailsGlobal = dependencies.calculateInvoiceDetails;
    calculateCreditCardUsageGlobal = dependencies.calculateCreditCardUsage;
    isInvoicePaidGlobal = dependencies.isInvoicePaid;
    setupModalEventsGlobal = dependencies.setupModalEvents;
    closeModalGlobal = dependencies.closeModal;
    exportReportToPdfGlobal = dependencies.exportReportToPdf;
}

// ======================================================================
// 1. RENDERING DAS PRINCIPAIS VIEWS
// ======================================================================

export function getResumosHtml() {
    const transactionsThisMonth = appState.allTransactions.filter(t => t && t.monthYear === appState.currentMonthYear);
    const totalIncome = transactionsThisMonth.filter(t => t.type === 'Entrada').reduce((sum, t) => sum + t.value, 0);
    const totalExpense = transactionsThisMonth.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.value, 0);
    const accountBalance = appState.accounts
        .filter(a => a && a.type === 'Conta Corrente' && !a.arquivado)
        .reduce((sum, a) => sum + (parseFloat(a.balance) || 0), 0);
        
    return `
    <div class="view-header"><h2><i class="fa-solid fa-chart-pie"></i> Resumos</h2></div>
    <div class="grid-container" style="margin-bottom: 24px;">
    <div class="card kpi-card"><div class="value">${formatCurrency(accountBalance)}</div><div class="label">Saldo em Contas</div></div>
    <div class="card kpi-card"><div class="value positive">+ ${formatCurrency(totalIncome)}</div><div class="label">Entradas do Mês</div></div>
    <div class="card kpi-card"><div class="value negative">- ${formatCurrency(totalExpense)}</div><div class="label">Saídas do Mês</div></div>
    </div>
    <div class="card">
    <h3 class="card-title"><i class="fa-solid fa-chart-bar"></i> Saídas do Mês Agrupadas por:</h3>
    <div class="chart-selector">
    <button data-action="change-chart-type" data-chart="category" class="${appState.dashboardChartType === 'category' ? 'active' : ''}">Categoria</button>
    <button data-action="change-chart-type" data-chart="establishment" class="${appState.dashboardChartType === 'establishment' ? 'active' : ''}">Estabelecimento</button>
    <button data-action="change-chart-type" data-chart="person" class="${appState.dashboardChartType === 'person' ? 'active' : ''}">Pessoa</button>
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
}

export function getLancarHtml() {
    return `
    <div class="view-header"><h2><i class="fa-solid fa-plus"></i> Novo Lançamento</h2></div>
    <p style="color: var(--text-secondary); margin-bottom: 24px; font-size: 16px;">O que você gostaria de registrar hoje?</p>
    <div class="lancar-actions-grid">
    <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="saida"><i class="fa-solid fa-arrow-down saida-icon"></i><span>Nova Saída</span></button>
    <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="entrada"><i class="fa-solid fa-arrow-up entrada-icon"></i><span>Nova Entrada</span></button>
    <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="transferencia"><i class="fa-solid fa-right-left" style="color: var(--accent-blue)"></i><span>Transferência</span></button>
    <button class="lancar-action-btn" data-action="show-lancar-form" data-form-type="pagarFatura"><i class="fa-solid fa-file-invoice-dollar" style="color: var(--accent-purple)"></i><span>Pagar Fatura</span></button>
    <button class="lancar-action-btn" data-action="launch-ocr"><i class="fa-solid fa-camera" style="color: var(--accent-purple);"></i><span>Lançar com Comprovante</span></button>
    </div>
    <div id="form-lancamento-container"></div>`;
}

export function getInvoicesHtml() {
    const creditCards = appState.accounts.filter(a => a && a.type === 'Cartão de Crédito' && !a.arquivado);
    if (creditCards.length === 0) {
        return `<div class="view-header"><h2><i class="fa-solid fa-file-invoice-dollar"></i> Faturas</h2></div>
        <div class="card"><div class="empty-state"><i class="fa-solid fa-credit-card"></i><p>Nenhum cartão de crédito ativo cadastrado.</p></div></div>`;
    }
    const totalOpenInvoices = creditCards.reduce((sum, card) => sum + calculateInvoiceDetailsGlobal(card.id, true).openInvoiceTotal, 0);
    const totalLimit = creditCards.reduce((sum, card) => sum + (card.limit || 0), 0);
    const summaryHtml = `
    <div class="card" style="margin-top: 24px;">
    <h3 class="card-title"><i class="fa-solid fa-layer-group"></i> Resumo Geral de Cartões</h3>
    <div class="card-details" style="background: transparent; padding: 0;">
    <div class="detail-row"><span class="label"><i class="fa-solid fa-file-invoice-dollar negative"></i> <strong>Valor de Faturas Abertas</strong></span><span class="value negative">${formatCurrency(totalOpenInvoices)}</span></div>
    <div class="detail-row"><span class="label"><i class="fa-solid fa-coins neutral-positive"></i> <strong>Limite de Crédito Total</strong></span><span class="value neutral-positive">${formatCurrency(totalLimit)}</span></div>
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
}

export function getMovementsHtml() {
    let transactions = appState.allTransactions.filter(t => t && t.monthYear === appState.currentMonthYear);
    if (appState.movementsFilter.type !== 'all') {
        transactions = transactions.filter(t => t.type === appState.movementsFilter.type);
    }
    if (appState.movementsFilter.accountId !== 'all') {
        transactions = transactions.filter(t => t.accountId === appState.movementsFilter.accountId);
    }
    transactions.sort((a, b) => {
        if (!a || !b) return 0;
        const { key, order } = appState.movementsSort;
        const valA = key === 'date' ? getDateObject(a[key]) : a[key];
        const valB = key === 'date' ? getDateObject(b[key]) : b[key];
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
    <div class="card"><div id="transaction-list">${transactions.length > 0 ? transactions.map(t => getTransactionHtml(t)).join('') : '<div class="empty-state"><p>Nenhuma movimentação encontrada.</p></div>'}</div></div>`;
}

export function getSettingsHtml() {
    return `
    <div class="view-header"><h2><i class="fa-solid fa-gears"></i> Ajustes</h2></div>
    <div class="card settings-menu">
        <a class="settings-menu-item" data-action="navigate-to-submenu" data-submenu="categories-people">
            <div class="icon-title"><i class="fa-solid fa-tags"></i> Categorias e Pessoas</div>
            <i class="fa-solid fa-chevron-right"></i>
        </a>
        <a class="settings-menu-item" data-action="navigate-to-submenu" data-submenu="establishments">
            <div class="icon-title"><i class="fa-solid fa-store"></i> Estabelecimentos</div>
            <i class="fa-solid fa-chevron-right"></i>
        </a>
        <a class="settings-menu-item" data-action="navigate-to-submenu" data-submenu="ocr-rules">
            <div class="icon-title"><i class="fa-solid fa-robot"></i> Regras do Leitor (OCR)</div>
            <i class="fa-solid fa-chevron-right"></i>
        </a>
        <a class="settings-menu-item" data-action="navigate-to-submenu" data-submenu="appearance">
            <div class="icon-title"><i class="fa-solid fa-palette"></i> Aparência</div>
            <i class="fa-solid fa-chevron-right"></i>
        </a>
    </div>`;
}

export function getSettingsSubmenuHtml(submenu) {
    const getItemsHtml = (items, type, icon) => {
        if (!items || items.length === 0) return `<div class="empty-state" style="padding: 20px 0;">Nenhum item cadastrado.</div>`;
        return items
            .filter(item => !!item && !!item.name)
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

    const submenus = {
        'categories-people': {
            title: 'Categorias e Pessoas',
            content: `
            <div class="card">
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-tags"></i> Categorias</h3>
                        <button class="button-primary" data-action="add-category"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                    <div id="categories-list">${getItemsHtml(appState.categories, 'category', 'fa-tag')}</div>
                </div>
                <div class="settings-section">
                    <div class="settings-section-header">
                        <h3 class="card-title" style="margin: 0;"><i class="fa-solid fa-users"></i> Pessoas</h3>
                        <button class="button-primary" data-action="add-person"><i class="fa-solid fa-plus"></i> Adicionar</button>
                    </div>
                    <div id="people-list">${getItemsHtml(appState.people, 'person', 'fa-user')}</div>
                </div>
            </div>`,
            actions: ''
        },
        'establishments': {
            title: 'Estabelecimentos',
            content: `<div class="card">${getItemsHtml(appState.establishments, 'establishment', 'fa-store')}</div>`,
            actions: `<button class="button-primary" data-action="add-establishment"><i class="fa-solid fa-plus"></i> Adicionar</button>`
        },
        'ocr-rules': {
            title: 'Regras do Leitor (OCR)',
            content: `<div class="card"><div id="ocr-rules-list"><div class="loading-spinner small"></div></div></div>`,
            actions: `<button class="button-primary" data-action="add-ocr-rule"><i class="fa-solid fa-plus"></i> Adicionar Regra</button>`
        },
        'appearance': {
            title: 'Aparência',
            content: `
            <div class="card">
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
            </div>`,
            actions: ''
        }
    };

    const current = submenus[submenu];
    if (!current) return getSettingsHtml(); 

    return `
    <div class="view-header">
        <div style="display: flex; align-items: center; gap: 0.5rem;">
            <button class="month-nav-arrow" data-action="navigate-back-from-submenu" title="Voltar"><i class="fa-solid fa-chevron-left"></i></button>
            <h2>${current.title}</h2>
        </div>
        <div class="actions">${current.actions || ''}</div>
    </div>
    ${current.content}`;
}

export function renderOcrRulesList() {
    const container = document.getElementById('ocr-rules-list');
    if (!container) return;

    const rules = appState.ocrRules || [];
    if (rules.length === 0) {
        container.innerHTML = `<div class="empty-state" style="padding: 20px 0;">Nenhuma regra de OCR cadastrada.</div>`;
        return;
    }

    const groupedRules = rules.reduce((acc, rule) => {
        if (!acc[rule.type]) acc[rule.type] = [];
        acc[rule.type].push(rule);
        return acc;
    }, {});

    const typeNames = {
        value: 'Valor',
        date: 'Data',
        description: 'Descrição/Estabelecimento',
        installments: 'Parcelas',
        account: 'Conta/Cartão'
    };

    let html = '';
    for (const type in typeNames) {
        if (groupedRules[type]) {
            html += `<h4 class="planning-subsection-header">${typeNames[type]}</h4>`;
            groupedRules[type]
                .sort((a, b) => (a.priority || 99) - (b.priority || 99))
                .forEach(rule => {
                    html += `
                    <div class="item-list-row">
                        <span class="icon-name" style="align-items: flex-start; flex-direction: column; gap: 4px;">
                            <div><i class="fa-solid ${!rule.enabled ? 'fa-eye-slash' : 'fa-file-code'}"></i> ${rule.name} ${!rule.enabled ? '<span style="font-size: 12px; color: var(--text-secondary);">(Inativa)</span>' : ''}</div>
                            <code style="font-size: 12px; color: var(--text-secondary);">${rule.pattern}</code>
                        </span>
                        <div class="actions">
                            <button class="button-icon" data-action="edit-ocr-rule" data-id="${rule.id}"><i class="fa-solid fa-pen"></i></button>
                            <button class="button-icon delete-btn" data-action="delete-ocr-rule" data-id="${rule.id}"><i class="fa-solid fa-trash"></i></button>
                        </div>
                    </div>`;
                });
        }
    }
    container.innerHTML = html;
}

export function getAccountsHtml() {
    const accountsToRender = appState.accounts.filter(acc => acc && (appState.showArchived || !acc.arquivado));
    const cardsHtml = accountsToRender.map(account => generateCardHTML(account)).join('');
    const emptyState = `<div class="empty-state"><i class="fa-solid fa-piggy-bank"></i><p>Nenhuma conta para exibir.<br>Clique em "Adicionar Conta" para começar.</p></div>`;
    return `
    <div class="view-header">
    <h2><i class="fa-solid fa-building-columns"></i> Contas e Cartões</h2>
    <div class="actions">
    <button class="button-secondary" data-action="toggle-archived"><i class="fa-solid ${appState.showArchived ? 'fa-eye-slash' : 'fa-eye'}"></i><span>${appState.showArchived ? 'Ocultar' : 'Exibir'} Arquivadas</span></button>
    <button class="button-primary" data-action="add-account"><i class="fa-solid fa-plus"></i><span>Adicionar Conta</span></button>
    </div>
    </div>
    <div class="card-grid">${accountsToRender.length > 0 ? cardsHtml : emptyState}</div>`;
}

export function getPlanningHtml() {
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
}

// ======================================================================
// 2. RENDERING DE COMPONENTES/ITENS
// ======================================================================

export function getTransactionHtml(transaction, showAccount = true) {
    if (!transaction || !transaction.id) return '';
    
    const account = appState.accounts.find(a => a && a.id === transaction.accountId);
    const category = appState.categories.find(c => c && c.id === transaction.categoryId);
    
    const primaryText = transaction.establishmentId ? findItemNameGlobal(transaction.establishmentId, 'establishments') : transaction.description;
    const secondaryText = showAccount && account ? account.name : category?.name || transaction.type;

    let isPositive = transaction.type === 'Entrada';
    let amountClass = isPositive ? 'positive' : 'negative';
    let amountSign = isPositive ? '+' : '-';
    
    if (transaction.type === 'Transferência' || transaction.type === 'Pagamento de Fatura') {
        amountClass = 'neutral';
        amountSign = '';
    }
    
    const date = getDateObject(transaction.date);
    const formattedDate = `${date.getDate().toString().padStart(2, '0')}/${(date.getMonth() + 1).toString().padStart(2, '0')}/${date.getFullYear()}`;
    
    return `<div class="transaction-list-item" data-id="${transaction.id}">
    <div class="icon" style="background-color: ${account?.color || '#e5e5ea'}"><i class="fa-solid ${category?.icon || (isPositive ? 'fa-arrow-up' : 'fa-arrow-down')}"></i></div>
    <div class="details"><div class="description">${primaryText}</div><div class="category">${secondaryText}</div></div>
    <div class="amount-details"><div class="amount ${amountClass}">${amountSign} ${formatCurrency(transaction.value)}</div><div class="date">${formattedDate}</div></div>
    </div>`;
}

export function generateCardHTML(account) {
    if (!account) return '';
    const textColor = getContrastColor(account.color);
    let icon, mainLabel, mainValue, footerInfo = '';
    
    const openInvoice = account.type === 'Cartão de Crédito' ? calculateInvoiceDetailsGlobal(account.id, true).openInvoiceTotal : 0;
    const availableLimit = (account.limit || 0) - calculateCreditCardUsageGlobal(account.id);
    
    if (account.type === 'Conta Corrente') {
        icon = 'fa-building-columns';
        mainLabel = 'Saldo Atual';
        mainValue = formatCurrency(account.balance);
    } else {
        icon = 'fa-credit-card';
        mainLabel = 'Fatura Aberta';
        mainValue = formatCurrency(openInvoice);
        footerInfo = `<div class="card-footer"><span class="label">Limite Disponível</span><span class="value">${formatCurrency(availableLimit)}</span></div>`;
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
}

export function getPlanningRowHtml(type, item, index) {
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
        const card = appState.accounts.find(acc => acc && acc.id === item.cardId);
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
}


// ======================================================================
// 3. RENDERING DE SEÇÕES DE PLANEJAMENTO
// ======================================================================

export function renderSaidasSection() {
    const container = document.getElementById('saidas-section-container');
    if (!container) return;
    const automaticFaturas = (appState.planningData.despesas || []).filter(d => d && d.isAutomatic);
    const manualDespesas = (appState.planningData.despesas || []).filter(d => d && !d.isAutomatic);
    
    const allDespesas = appState.planningData.despesas || [];

    const automaticHtml = automaticFaturas.map(item => {
        const originalIndex = allDespesas.indexOf(item);
        return getPlanningRowHtml('despesas', item, originalIndex);
    }).join('');

    const manualHtml = manualDespesas.map(item => {
        const originalIndex = allDespesas.indexOf(item);
        return getPlanningRowHtml('despesas', item, originalIndex);
    }).join('');

    container.innerHTML = `
    <div class="planning-subsection-header">Faturas de Cartão</div>
    <div class="planning-list" data-list-type="faturas">
    ${automaticHtml}
    </div>
    <div class="planning-subsection-header">Outras Despesas</div>
    <div class="planning-list" data-list-type="outrasDespesas">
    ${manualHtml}
    </div>
    <button class="button-primary" data-action="add-planning-item" data-type="despesas" style="margin-top: 16px;"><i class="fa-solid fa-plus"></i> Adicionar Outra Despesa</button>`;
}

export function renderList(listType) {
    const listContainer = document.querySelector(`.planning-list[data-list-type="${listType}"]`);
    if (!listContainer) return;

    let items, type;
    if (listType === 'receitas') {
        items = (appState.planningData.receitas || []).filter(i => !!i);
        type = 'receitas';
    } else {
        items = (appState.planningData.despesas || []).filter(d => d && !d.isAutomatic);
        type = 'despesas';
    }

    listContainer.innerHTML = items.map(item => {
        const originalIndex = appState.planningData[type].findIndex(pItem => pItem === item);
        return getPlanningRowHtml(type, item, originalIndex);
    }).join('');
}

export function updateSummary() {
    const summaryContainer = document.getElementById('planning-summary');
    if (!summaryContainer) return;
    const despesasAPagar = (appState.planningData.despesas || []).filter(item => item && !item.paid);
    const totalDespesas = despesasAPagar.reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    const totalReceitas = (appState.planningData.receitas || []).filter(i => !!i).reduce((sum, item) => sum + (parseFloat(item.value) || 0), 0);
    const saldo = totalReceitas - totalDespesas;
    summaryContainer.innerHTML = `
    <div class="detail-row">
    <span class="label"><i class="fa-solid fa-arrow-up summary-icon positive"></i><strong>Total de Entradas</strong></span>
    <span class="value positive">${formatCurrency(totalReceitas)}</span>
    </div>
    <div class="detail-row">
    <span class="label"><i class="fa-solid fa-arrow-down summary-icon negative"></i><strong>Total de Saídas (A Pagar)</strong></span>
    <span class="value negative">${formatCurrency(totalDespesas)}</span>
    </div>
    <div class="detail-row" style="font-size: 18px;">
    <span class="label"><i class="fa-solid fa-wallet summary-icon neutral-positive"></i><strong>Saldo Previsto</strong></span>
    <span class="value ${saldo >= 0 ? 'neutral-positive' : 'negative'}">${formatCurrency(saldo)}</span>
    </div>`;
}

export function renderAllPlanningSections() {
    renderList('receitas');
    renderSaidasSection();
    updateSummary();
}


// ======================================================================
// 4. RENDERING DE FORMULÁRIOS DE LANÇAMENTO
// ======================================================================

export function renderLancamentoForm(type, prefillData = {}) {
    const container = document.getElementById('form-lancamento-container');
    if (!container) return;
    
    const accounts = appState.accounts.filter(a => a && !a.arquivado) || [];
    const checkingAccounts = accounts.filter(a => a.type === 'Conta Corrente');
    const creditCards = accounts.filter(a => a.type === 'Cartão de Crédito');
    
    const getOptions = (items = [], selectedId) => {
        return [...items]
            .sort((a, b) => (a.name || '').localeCompare(b.name || ''))
            .map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.name}</option>`)
            .join('');
    };

    const dateInputValue = prefillData.date || getLocalISODate();
    let formHtml = '', title = '';

    const prefill = (name) => prefillData[name] || '';
    const isCreditCardSelected = prefill('accountId') && accounts.find(a => a.id === prefill('accountId'))?.type === 'Cartão de Crédito';
    const installmentsHidden = !(type === 'saida' && isCreditCardSelected);

    switch (type) {
        case 'saida':
            title = 'Nova Saída';
            formHtml = `
            <div class="form-group"><label>Descrição</label><input type="text" name="description" value="${prefill('description')}" required></div>
            <div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div>
            <div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div>
            <div class="form-group"><label>Conta / Cartão</label><select id="lancar-saida-account" name="accountId" required><option value="">Selecione...</option>${getOptions(accounts, prefill('accountId'))}</select></div>
            <div id="installments-group" class="form-group ${installmentsHidden ? 'hidden' : ''}"><label>Número de Parcelas</label><input type="number" inputmode="numeric" name="installments" min="1" value="${prefill('installments') || '1'}"></div>
            <div class="form-group"><label>Categoria</label><select name="categoryId" required><option value="">Selecione...</option>${getOptions(appState.categories, prefill('categoryId'))}</select></div>
            <div class="form-group"><label>Pessoa (Opcional)</label><select name="personId"><option value="">Nenhuma</option>${getOptions(appState.people, prefill('personId'))}</select></div>
            <div class="form-group"><label>Estabelecimento (Opcional)</label><select name="establishmentId"><option value="">Nenhum</option>${getOptions(appState.establishments, prefill('establishmentId'))}</select><div id="association-helper-container"></div></div>`;
            break;
        case 'entrada':
            title = 'Nova Entrada';
            formHtml = `
            <div class="form-group"><label>Descrição</label><input type="text" name="description" value="${prefill('description')}" required></div>
            <div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div>
            <div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div>
            <div class="form-group"><label>Conta de Destino</label><select name="accountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('accountId'))}</select></div>
            <div class="form-group"><label>Categoria</label><select name="categoryId" required><option value="">Selecione...</option>${getOptions(appState.categories, prefill('categoryId'))}</select></div>`;
            break;
        case 'transferencia':
            title = 'Transferência entre Contas';
            formHtml = `
            <div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" placeholder="0,00" value="${prefill('value')}" required></div></div>
            <div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div>
            <div class="form-group"><label>Conta de Origem</label><select name="sourceAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('sourceAccountId'))}</select></div>
            <div class="form-group"><label>Conta de Destino</label><select name="destinationAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('destinationAccountId'))}</select></div>
            <div class="form-group"><label>Descrição (Opcional)</label><input type="text" name="description" value="${prefill('description')}" placeholder="Transferência entre contas"></div>`;
            break;
        case 'pagarFatura':
            title = 'Pagar Fatura de Cartão';
            formHtml = `
            <input type="hidden" name="invoiceMonthYear" value="${prefill('invoiceMonthYear') || ''}">
            <div class="form-group"><label>Valor do Pagamento</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" inputmode="decimal" name="value" value="${prefill('value') || ''}" placeholder="0,00" required></div></div>
            <div class="form-group"><label>Data do Pagamento</label><input type="date" name="date" value="${dateInputValue}" required></div>
            <div class="form-group"><label>Pagar com a conta</label><select name="sourceAccountId" required><option value="">Selecione...</option>${getOptions(checkingAccounts, prefill('sourceAccountId'))}</select></div>
            <div class="form-group"><label>Fatura do cartão</label><select name="destinationAccountId" required><option value="">Selecione...</option>${getOptions(appState.creditCards, prefill('destinationAccountId'))}</select></div>`;
            break;
    }

    container.innerHTML = `<div class="card"><form id="lancar-form" data-type="${type}" novalidate><h3 class="card-title" style="font-size: 20px;">${title}</h3>${formHtml}<div class="form-actions"><button type="button" class="button-secondary" data-action="cancel-lancar-form">Cancelar</button><button type="submit" class="button-primary"><i class="fa-solid fa-check"></i> Salvar</button></div></form></div>`;
}

// ======================================================================
// 5. CRIAÇÃO DE MODAIS
// ======================================================================

function getGenericModalHtml(formId, title, item = {}, fields = []) {
    const fieldsHtml = fields.map(f => `
        <div class="form-group">
            <label>${f.label}</label>
            <input type="${f.type}" name="${f.name}" value="${item[f.name] || ''}" ${f.required ? 'required' : ''}>
        </div>`).join('');
    
    return `
    <div class="modal-content">
        <form id="${formId}">
            <input type="hidden" name="id" value="${item.id || ''}">
            <div class="modal-header">
                <h2>${item.id ? 'Editar' : 'Novo(a)'} ${title}</h2>
                <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">${fieldsHtml}</div>
            <div class="modal-actions">
                <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
                <button type="submit" class="button-primary">Salvar</button>
            </div>
        </form>
    </div>`;
}

export function showAccountModal(accountId = null) {
    const isEditing = !!accountId;
    const account = isEditing ? appState.accounts.find(a => a.id === accountId) : {};
    const modalContainer = document.getElementById('modal-container');
    const accountColor = account?.color || '#007aff';
    
    modalContainer.innerHTML = `
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
        <div class="form-group" id="balance-limit-group"></div>
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
    const balanceLimitGroup = document.getElementById('balance-limit-group');

    const toggleFields = () => {
        const isCredit = selector.value === 'Cartão de Crédito';
        document.getElementById('credit-card-fields').classList.toggle('hidden', !isCredit);
        
        if (isCredit) {
            balanceLimitGroup.innerHTML = `
                <label>Limite do Cartão</label>
                <div class="input-group-currency">
                    <span class="currency-symbol">R$</span>
                    <input type="number" step="0.01" name="limit" value="${account?.limit || ''}" placeholder="0,00">
                </div>`;
        } else {
            balanceLimitGroup.innerHTML = `
                <label>Saldo Inicial</label>
                <div class="input-group-currency">
                    <span class="currency-symbol">R$</span>
                    <input type="number" step="0.01" name="balance" value="${account?.balance || ''}" placeholder="0,00" ${isEditing ? 'disabled' : ''}>
                </div>`;
        }
    };

    toggleFields();
    selector.onchange = toggleFields;
    setupModalEventsGlobal();
}

export function showCategoryModal(categoryId = null) {
    const category = categoryId ? appState.categories.find(c => c.id === categoryId) : {};
    const modalContainer = document.getElementById('modal-container');
    modalContainer.innerHTML = `<div class="modal-content"><form id="category-form"><input type="hidden" name="id" value="${category?.id || ''}"><div class="modal-header"><h2>${category?.id ? 'Editar' : 'Nova'} Categoria</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div><div class="modal-body"><div class="form-group"><label>Nome</label><input type="text" name="name" value="${category?.name || ''}" required></div><div class="form-group"><label>Ícone (Font Awesome)</label><input type="text" name="icon" value="${category?.icon || 'fa-tag'}" placeholder="Ex: fa-utensils"></div></div><div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" form="category-form" class="button-primary">Salvar</button></div></form></div>`;
    setupModalEventsGlobal();
}

export function showPersonModal(personId = null) {
    const person = personId ? appState.people.find(p => p.id === personId) : {};
    document.getElementById('modal-container').innerHTML = getGenericModalHtml('person-form', 'Pessoa', person, [{ label: 'Nome', name: 'name', type: 'text', required: true }]);
    setupModalEventsGlobal();
}

export function showEstablishmentModal(establishmentId = null) {
    const establishment = establishmentId ? appState.establishments.find(e => e.id === establishmentId) : {};
    const categoryOptions = appState.categories
        .sort((a,b) => a.name.localeCompare(b.name))
        .map(cat => `<option value="${cat.id}" ${establishment?.categoriaPadraoId === cat.id ? 'selected' : ''}>${cat.name}</option>`)
        .join('');
    const aliases = establishment?.aliases ? establishment.aliases.join(', ') : '';

    const fieldsHtml = `
        <div class="form-group">
            <label>Nome</label>
            <input type="text" name="name" value="${establishment.name || ''}" required>
        </div>
        <div class="form-group">
            <label>Categoria Padrão (Opcional)</label>
            <select name="categoriaPadraoId">
                <option value="">Nenhuma</option>
                ${categoryOptions}
            </select>
        </div>
        <div class="form-group">
            <label>Apelidos/Nomes Alternativos (CNPJ)</label>
            <input type="text" name="aliases" value="${aliases}" placeholder="Ex: panificadora silva, cnpj 12.345...">
            <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">Nomes alternativos (separados por vírgula) que aparecem em comprovantes.</p>
        </div>
    `;

    document.getElementById('modal-container').innerHTML = `
        <div class="modal-content">
            <form id="establishment-form">
                <input type="hidden" name="id" value="${establishment.id || ''}">
                <div class="modal-header">
                    <h2>${establishment.id ? 'Editar' : 'Novo'} Estabelecimento</h2>
                    <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
                </div>
                <div class="modal-body">${fieldsHtml}</div>
                <div class="modal-actions">
                    <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
                    <button type="submit" form="establishment-form" class="button-primary">Salvar</button>
                </div>
            </form>
        </div>`;
    setupModalEventsGlobal();
}

export function showOcrRuleModal(ruleId = null) {
    const isEditing = !!ruleId;
    const rule = isEditing ? appState.ocrRules.find(r => r.id === ruleId) : { enabled: true, priority: 10 };
    const modalContainer = document.getElementById('modal-container');

    modalContainer.innerHTML = `
    <div class="modal-content">
        <form id="ocr-rule-form">
            <input type="hidden" name="id" value="${rule?.id || ''}">
            <div class="modal-header">
                <h2>${isEditing ? 'Editar' : 'Nova'} Regra de OCR</h2>
                <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label>Nome da Regra</label>
                    <input type="text" name="name" value="${rule?.name || ''}" placeholder="Ex: Data do PicPay" required>
                </div>
                <div class="form-group">
                    <label>Tipo de Dado</label>
                    <select name="type" id="ocr-rule-type" required>
                        <option value="">Selecione...</option>
                        <option value="value" ${rule?.type === 'value' ? 'selected' : ''}>Valor</option>
                        <option value="date" ${rule?.type === 'date' ? 'selected' : ''}>Data</option>
                        <option value="description" ${rule?.type === 'description' ? 'selected' : ''}>Descrição/Estabelecimento</option>
                        <option value="installments" ${rule?.type === 'installments' ? 'selected' : ''}>Parcelas</option>
                        <option value="account" ${rule?.type === 'account' ? 'selected' : ''}>Conta/Cartão</option>
                    </select>
                </div>
                <div class="form-group hidden" id="ocr-rule-account-selector">
                    <label>Associar Regra à Conta</label>
                    <select name="accountId">
                        <option value="">Selecione a conta...</option>
                        ${appState.accounts.map(acc => `<option value="${acc.id}" ${rule?.accountId === acc.id ? 'selected' : ''}>${acc.name}</option>`).join('')}
                    </select>
                </div>
                <div class="form-group">
                    <label>Modo de Criação do Padrão</label>
                    <div class="mode-toggle-container">
                        <button type="button" class="mode-btn active" data-mode="simple">Simples</button>
                        <button type="button" class="mode-btn" data-mode="advanced">Avançado</button>
                    </div>
                    <div class="ocr-rule-wizard" id="ocr-wizard-simple"></div>
                    <div class="ocr-rule-advanced hidden" id="ocr-wizard-advanced">
                        <textarea name="pattern" rows="3" placeholder="Ex: R\\$\\s*([\\d.,]+)">${rule?.pattern || ''}</textarea>
                    </div>
                </div>
                <div class="form-group">
                    <label>Prioridade</label>
                    <input type="number" name="priority" value="${rule?.priority || '10'}" required>
                </div>
                <div class="form-group" style="display: flex; align-items: center; gap: 10px;">
                     <input type="checkbox" name="enabled" id="rule-enabled-checkbox" ${rule?.enabled ? 'checked' : ''} style="width: auto; height: auto; margin: 0; appearance: checkbox;">
                    <label for="rule-enabled-checkbox" style="margin-bottom: 0; font-weight: normal;">Regra Ativa</label>
                </div>
            </div>
            <div class="modal-actions">
                <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
                <button type="submit" class="button-primary">Salvar</button>
            </div>
        </form>
    </div>`;
    
    setupModalEventsGlobal();
    
    // O resto do código para manipular o wizard do modal de regras
}

export function showAddAliasModal(description) {
    const modalContainer = document.getElementById('modal-container');
    const options = appState.establishments
        .sort((a, b) => a.name.localeCompare(b.name))
        .map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    modalContainer.innerHTML = `
    <div class="modal-content">
        <form id="add-alias-form">
            <input type="hidden" name="textoOcr" value="${description}">
            <div class="modal-header">
                <h2>Adicionar Apelido</h2>
                <button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button>
            </div>
            <div class="modal-body">
                <p>Associar o texto <strong>"${description}"</strong> a qual estabelecimento?</p>
                <div class="form-group"><label>Estabelecimento</label><select name="entidadeId" required>${options}</select></div>
            </div>
            <div class="modal-actions">
                <button type="button" class="button-secondary close-modal-btn">Cancelar</button>
                <button type="submit" class="button-primary">Salvar Apelido</button>
            </div>
        </form>
    </div>`;
    setupModalEventsGlobal();
}

export function showTransactionDetailsModal(transaction) {
    const modalContainer = document.getElementById('modal-container');
    const date = getDateObject(transaction.date);
    const formattedDate = date.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' });
    const isDebit = transaction.type === 'Saída';
    const amountClass = isDebit ? 'negative' : 'positive';
    const amountSign = isDebit ? '-' : '+';
    const accountName = findItemNameGlobal(transaction.accountId, 'accounts');
    const categoryName = findItemNameGlobal(transaction.categoryId, 'categories');
    const personName = transaction.personId ? findItemNameGlobal(transaction.personId, 'people') : null;
    const establishmentName = transaction.establishmentId ? findItemNameGlobal(transaction.establishmentId, 'establishments') : null;
    const canBeModified = transaction.type !== 'Pagamento de Fatura' && transaction.type !== 'Transferência';

    let actionButtons = '';
    if (canBeModified) {
        actionButtons += `<button type="button" class="button-danger" data-action="delete-transaction" data-id="${transaction.id}"><i class="fa-solid fa-trash"></i> Excluir</button>`;
        actionButtons += `<button type="button" class="button-primary" data-action="edit-from-details" data-id="${transaction.id}"><i class="fa-solid fa-pencil"></i> Editar</button>`;
    }

    modalContainer.innerHTML = `
    <div class="modal-content">
        <div class="modal-header"><h2>Detalhes da Movimentação</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div>
        <div class="modal-body">
            <div class="transaction-detail-header">
                <span class="transaction-detail-value ${amountClass}">${amountSign} ${formatCurrency(transaction.value)}</span>
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
            ${actionButtons}
        </div>
    </div>`;
    setupModalEventsGlobal();
}

export function showTransactionModal(transactionId) {
    const transaction = appState.allTransactions.find(t => t.id === transactionId);
    if (!transaction || transaction.type === 'Pagamento de Fatura' || transaction.type === 'Transferência' || transaction.installmentGroupId) {
        showToast("Este tipo de lançamento não pode ser editado.", "error");
        return;
    }
    const getOptions = (items, selectedId) => items.map(i => `<option value="${i.id}" ${i.id === selectedId ? 'selected' : ''}>${i.name}</option>`).join('');
    const dateInputValue = getLocalISODate(getDateObject(transaction.date));
    let formFieldsHtml = `
        <div class="form-group"><label>Descrição</label><input type="text" name="description" value="${transaction.description || ''}" required></div>
        <div class="form-group"><label>Valor</label><div class="input-group-currency"><span class="currency-symbol">R$</span><input type="number" name="value" value="${transaction.value || ''}" required></div></div>
        <div class="form-group"><label>Data</label><input type="date" name="date" value="${dateInputValue}" required></div>
        <div class="form-group"><label>Conta</label><select name="accountId" required>${getOptions(appState.accounts.filter(a => !a.arquivado), transaction.accountId)}</select></div>
        <div class="form-group"><label>Categoria</label><select name="categoryId" required>${getOptions(appState.categories, transaction.categoryId)}</select></div>
    `;
    if (transaction.type === 'Saída') {
        formFieldsHtml += `<div class="form-group"><label>Pessoa</label><select name="personId"><option value="">Nenhuma</option>${getOptions(appState.people, transaction.personId)}</select></div>`;
        formFieldsHtml += `<div class="form-group"><label>Estabelecimento</label><select name="establishmentId"><option value="">Nenhum</option>${getOptions(appState.establishments, transaction.establishmentId)}</select></div>`;
    }
    document.getElementById('modal-container').innerHTML = `
        <div class="modal-content">
            <form id="transaction-form">
                <input type="hidden" name="id" value="${transaction.id}">
                <div class="modal-header"><h2>Editar Lançamento</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div>
                <div class="modal-body">${formFieldsHtml}</div>
                <div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" class="button-primary">Salvar</button></div>
            </form>
        </div>`;
    setupModalEventsGlobal();
}

export function showFilterModal() {
    const { type, accountId } = appState.movementsFilter;
    const accountOptions = `<option value="all" ${accountId === 'all' ? 'selected' : ''}>Todas</option>` +
        appState.accounts.map(acc => `<option value="${acc.id}" ${accountId === acc.id ? 'selected' : ''}>${acc.name}</option>`).join('');
    document.getElementById('modal-container').innerHTML = `
    <div class="modal-content">
        <form id="filter-form">
            <div class="modal-header"><h2>Filtrar Movimentações</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div>
            <div class="modal-body">
                <div class="form-group"><label>Tipo</label><select name="type"><option value="all" ${type === 'all' ? 'selected' : ''}>Todos</option><option value="Entrada" ${type === 'Entrada' ? 'selected' : ''}>Entradas</option><option value="Saída" ${type === 'Saída' ? 'selected' : ''}>Saídas</option></select></div>
                <div class="form-group"><label>Conta</label><select name="accountId">${accountOptions}</select></div>
            </div>
            <div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" class="button-primary">Aplicar</button></div>
        </form>
    </div>`;
    setupModalEventsGlobal();
}

export function showSortModal() {
    const { key, order } = appState.movementsSort;
    const currentSort = `${key}-${order}`;
    document.getElementById('modal-container').innerHTML = `
    <div class="modal-content">
        <form id="sort-form">
            <div class="modal-header"><h2>Ordenar Movimentações</h2><button type="button" class="close-modal-btn"><i class="fa-solid fa-times"></i></button></div>
            <div class="modal-body">
                <div class="form-group radio-group">
                    <label><input type="radio" name="sort" value="date-desc" ${currentSort === 'date-desc' ? 'checked' : ''}> Mais Recentes</label>
                    <label><input type="radio" name="sort" value="date-asc" ${currentSort === 'date-asc' ? 'checked' : ''}> Mais Antigos</label>
                    <label><input type="radio" name="sort" value="value-desc" ${currentSort === 'value-desc' ? 'checked' : ''}> Maior Valor</label>
                    <label><input type="radio" name="sort" value="value-asc" ${currentSort === 'value-asc' ? 'checked' : ''}> Menor Valor</label>
                </div>
            </div>
            <div class="modal-actions"><button type="button" class="button-secondary close-modal-btn">Cancelar</button><button type="submit" class="button-primary">Ordenar</button></div>
        </form>
    </div>`;
    setupModalEventsGlobal();
}