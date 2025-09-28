// logic-manager.js

import { 
    showToast, 
    escapeRegex,
    getDateObject,
    getInvoiceKeyForDate,
    getLocalISODate,
    findItemName,
    capitalizeFirstLetter,
    formatCurrency
} from './utils.js';

// Variáveis de escopo global injetadas pelo App.js
let appState; 
let db;
let savePlanningDataGlobal;
let renderCurrentViewGlobal;
let renderLancamentoFormGlobal;
let calculateInvoiceDetailsGlobal;
let updateSummaryGlobal;
let findItemNameGlobal;

export function initLogicManager(state, firestore, planningSaver, renderView, renderForm, invoiceDetailsFunc, summaryUpdateFunc, findNameFunc) {
    appState = state;
    db = firestore;
    savePlanningDataGlobal = planningSaver;
    renderCurrentViewGlobal = renderView;
    renderLancamentoFormGlobal = renderForm;
    calculateInvoiceDetailsGlobal = invoiceDetailsFunc;
    updateSummaryGlobal = summaryUpdateFunc;
    findItemNameGlobal = findNameFunc;
}

// ======================================================================
// LÓGICA DE PLANEJAMENTO
// ======================================================================

let planningSaveTimeout = null;

export function debouncedSavePlanning() {
    clearTimeout(planningSaveTimeout);
    planningSaveTimeout = setTimeout(() => {
        savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    }, 1500);
}

export async function syncAutomaticInvoices() {
    const creditCards = appState.accounts.filter(a => a && a.type === 'Cartão de Crédito' && !a.arquivado);
    if (creditCards.length === 0) return;

    let despesas = [...(appState.planningData.despesas || [])];
    let hasChanged = false;

    despesas = despesas.filter(d => {
        if (!d.isAutomatic) return true; 
        return creditCards.some(card => card.id === d.cardId);
    });

    for (const card of creditCards) {
        // Lógica de previsão: Planejamento do Mês M usa a fatura que fecha no Mês M.
        const invoiceDetails = calculateInvoiceDetailsGlobal(card.id, false); 
        const invoiceTotal = invoiceDetails.openInvoiceTotal || 0;
        const invoiceKey = invoiceDetails.invoiceKey;

        const existingInvoiceIndex = despesas.findIndex(d => d.cardId === card.id && d.isAutomatic);

        if (existingInvoiceIndex > -1) {
            if (despesas[existingInvoiceIndex].value !== invoiceTotal || despesas[existingInvoiceIndex].invoiceKey !== invoiceKey) {
                despesas[existingInvoiceIndex].value = invoiceTotal;
                despesas[existingInvoiceIndex].invoiceKey = invoiceKey;
                hasChanged = true;
            }
        } else {
            if (invoiceTotal > 0) {
                despesas.push({
                    description: `Fatura ${card.name}`,
                    value: invoiceTotal,
                    paid: false,
                    isAutomatic: true,
                    cardId: card.id,
                    invoiceKey: invoiceKey
                });
                hasChanged = true;
            }
        }
    }

    if (hasChanged) {
        appState.planningData.despesas = despesas;
        await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    }
}


export async function syncInvoiceValue(index, cardId) {
    // Lógica de previsão: Sincroniza usando o mês atual como referência.
    const invoiceDetails = calculateInvoiceDetailsGlobal(cardId, false);
    const invoiceTotal = invoiceDetails.openInvoiceTotal || 0;
    
    const item = appState.planningData.despesas[parseInt(index)];
    if(item) {
        item.value = invoiceTotal;

        const inputField = document.querySelector(`.planning-input[data-type="despesas"][data-index="${index}"][data-field="value"]`);
        if (inputField) {
            inputField.value = invoiceTotal.toFixed(2);
        }

        updateSummaryGlobal();
        
        showToast(`Fatura ${findItemNameGlobal(cardId, 'accounts')} sincronizada!`, 'success');

        await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    }
}


export function addPlanningItem(type) {
    if (!appState.planningData[type]) appState.planningData[type] = [];
    
    const newItem = type === 'despesas'
        ? { description: '', value: '', paid: false }
        : { description: '', value: '' };

    appState.planningData[type].push(newItem);
    savePlanningDataGlobal(appState.planningData, appState.currentMonthYear); 
    renderCurrentViewGlobal().then(() => {
        const inputs = document.querySelectorAll(`.planning-input[data-type="${type}"]`);
        if (inputs.length > 0) {
            inputs[inputs.length - 2]?.focus(); 
        }
    });
}

export function deletePlanningItem(type, index) {
    if (appState.planningData[type] && appState.planningData[type][index]) {
        appState.planningData[type].splice(index, 1);
        savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
        renderCurrentViewGlobal();
    }
}

export function attachPlanningKeydownListener(viewContainer, elementRefs) {
    const listener = (e) => {
        if (e.key !== 'Enter' || !e.target.classList.contains('planning-input')) return;
        e.preventDefault();
        const input = e.target;
        const parentItem = input.closest('.planning-item');
        const { type } = input.dataset;
        
        if (input.closest('.planning-input-description')) {
            parentItem.querySelector('.planning-input-value input')?.focus();
        } else if (input.closest('.planning-input-value')) {
            addPlanningItem(type);
        }
    };
    elementRefs.planningKeydownListener = listener;
    viewContainer.addEventListener('keydown', elementRefs.planningKeydownListener);
}

// ======================================================================
// LÓGICA DE FATURAS
// ======================================================================

export function calculateCreditCardUsage(cardId) {
    const cardTransactions = appState.allTransactions.filter(t => t && t.accountId === cardId);
    const totalSpent = cardTransactions.filter(t => t.type === 'Saída').reduce((sum, t) => sum + t.value, 0);
    const totalPaid = cardTransactions.filter(t => t.type === 'Pagamento de Fatura').reduce((sum, t) => sum + t.value, 0);
    return totalSpent - totalPaid;
}

export function isInvoicePaid(cardId, invoiceMonthYear) {
    return appState.allTransactions.some(t => t && t.type === 'Pagamento de Fatura' && t.destinationAccountId === cardId && t.invoiceMonthYear === invoiceMonthYear);
}

export function calculateInvoiceDetails(cardId, referenceDateOrUseCurrent) {
    const card = appState.accounts.find(a => a && a.id === cardId);
    if (!card || !card.closingDay) return { openInvoiceTotal: 0, invoiceKey: '' };
    
    let referenceDate;
    if (referenceDateOrUseCurrent === true) {
        referenceDate = new Date();
    } else if (referenceDateOrUseCurrent instanceof Date) {
        referenceDate = referenceDateOrUseCurrent;
    } else {
        const [month, year] = appState.currentMonthYear.split('-');
        referenceDate = new Date(year, month - 1, 15);
    }

    const invoiceKey = getInvoiceKeyForDate(referenceDate, card);

    const transactionsForInvoice = appState.allTransactions
        .filter(t => t && t.accountId === cardId && t.type === 'Saída')
        .filter(t => getInvoiceKeyForDate(getDateObject(t.date), card) === invoiceKey);

    const totalExpenses = transactionsForInvoice.reduce((sum, t) => sum + (t.value || 0), 0);
    return { openInvoiceTotal: totalExpenses, invoiceKey };
}

export function postRenderInvoices(getTransactionHtmlFunc) {
    const cardSelector = document.getElementById('invoice-card-selector');
    const periodSelector = document.getElementById('invoice-period-selector');
    const detailsContainer = document.getElementById('invoice-details-container');
    if (!cardSelector) return;

    const renderInvoice = () => {
        const cardId = cardSelector.value;
        const card = appState.accounts.find(a => a && a.id === cardId);
        if (!card) {
            detailsContainer.innerHTML = '<div class="empty-state"><p>Selecione um cartão.</p></div>';
            return;
        }
        
        const currentOpenInvoiceDetails = calculateInvoiceDetails(cardId, true);
        const currentOpenInvoiceKey = currentOpenInvoiceDetails.invoiceKey;

        const transactionsByInvoice = appState.allTransactions
            .filter(t => t && t.accountId === cardId && t.type === 'Saída')
            .reduce((acc, t) => {
                const key = getInvoiceKeyForDate(getDateObject(t.date), card);
                if (!acc[key]) acc[key] = [];
                acc[key].push(t);
                return acc;
            }, {});
            
        if (currentOpenInvoiceKey && !transactionsByInvoice[currentOpenInvoiceKey]) {
            transactionsByInvoice[currentOpenInvoiceKey] = [];
        }

        const sortedPeriods = Object.keys(transactionsByInvoice).sort((a, b) => {
            const [mA, yA] = a.split('-');
            const [mB, yB] = b.split('-');
            const dateA = new Date(yA, mA - 1);
            const dateB = new Date(yB, mB - 1);
            return dateB - dateA;
        });
        
        const lastSelectedPeriod = periodSelector.value;
        periodSelector.innerHTML = sortedPeriods.map(p => {
            const [month, year] = p.split('-');
            const date = new Date(year, month - 1, 1);
            const monthName = capitalizeFirstLetter(date.toLocaleString('pt-BR', { month: 'long' }));
            return `<option value="${p}">${monthName} de ${year}</option>`;
        }).join('');

        periodSelector.value = sortedPeriods.includes(lastSelectedPeriod) ? lastSelectedPeriod : currentOpenInvoiceKey;
        
        const currentPeriodKey = periodSelector.value;
        if (!currentPeriodKey) {
            detailsContainer.innerHTML = '<div class="empty-state"><i class="fa-solid fa-ghost"></i><p>Nenhuma fatura para este cartão.</p></div>';
            return;
        }

        const transactionsForPeriod = transactionsByInvoice[currentPeriodKey] || [];
        transactionsForPeriod.sort((a, b) => getDateObject(b.date) - getDateObject(a.date));
        const invoiceTotal = transactionsForPeriod.reduce((sum, t) => sum + t.value, 0);
        const isPaid = isInvoicePaid(cardId, currentPeriodKey);
        
        const [month, year] = currentPeriodKey.split('-');
        let dueDate = null;
        if (card.dueDate) {
            // Vencimento é no mês seguinte ao fechamento
            dueDate = new Date(year, parseInt(month, 10), card.dueDate);
        }
        
        detailsContainer.innerHTML = `
        <div class="card-details">
            <div class="detail-row">
                <span class="label"><strong>Total da Fatura</strong></span>
                <span class="value negative">${formatCurrency(invoiceTotal)}</span>
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
        <h4 class="invoice-transaction-header" style="margin-top: 1.5rem;">Lançamentos</h4>
        <div class="transaction-list compact">${transactionsForPeriod.map(t => getTransactionHtmlFunc(t, false)).join('') || '<div class="empty-state small"><p>Nenhum lançamento neste período.</p></div>'}</div>`;
    };
    
    cardSelector.onchange = renderInvoice;
    periodSelector.onchange = renderInvoice;
    renderInvoice();
}


// ======================================================================
// LÓGICA DE OCR, RELATÓRIOS E APARÊNCIA
// ======================================================================

export async function adjustAccountBalance(accountId) {
    const account = appState.accounts.find(acc => acc.id === accountId);
    if (!account) return;

    const newBalanceStr = prompt('Digite o novo saldo correto:', account.balance);

    if (newBalanceStr !== null) {
        const newBalance = parseFloat(newBalanceStr.replace(',', '.'));
        if (isNaN(newBalance)) {
            showToast('Valor inválido.', 'error');
            return;
        }

        const oldBalance = parseFloat(account.balance) || 0;
        const adjustmentValue = newBalance - oldBalance;

        if (adjustmentValue === 0) {
            showToast('O saldo informado é o mesmo que o atual.', 'info');
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

        const batch = db.batch();
        try {
            const accountRef = db.collection('financeiro_contas').doc(accountId);
            batch.update(accountRef, { balance: newBalance });

            const transactionRef = db.collection('financeiro_lancamentos').doc();
            batch.set(transactionRef, adjustmentTransaction);

            await batch.commit();
            showToast('Saldo ajustado e movimentação registrada!', 'success');
        } catch (error) {
            console.error("Erro ao ajustar saldo:", error);
            showToast('Ocorreu um erro ao ajustar o saldo.', 'error');
        }
    }
}

export async function seedDefaultOcrRules() {
    const defaultRules = [
        { name: 'Valor Padrão (R$)', type: 'value', pattern: 'R\\$\\s*([\\d.,]+)', priority: 1, enabled: true },
        { name: 'Data PicPay (dd/mes/yyyy)', type: 'date', pattern: '(\\d{1,2})\\/(\\w+)\\/(\\d{4})', priority: 1, enabled: true },
        { name: 'Data Willbank (dd/mm/yyyy)', type: 'date', pattern: '(\\d{1,2})\\/(\\d{1,2})\\/(\\d{4})', priority: 2, enabled: true },
        { name: 'Data Nubank (dd MMM yyyy)', type: 'date', pattern: '(\\d{1,2})\\s+(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\\.?\\s+(\\d{4})', priority: 3, enabled: true },
        { name: 'Estabelecimento PicPay', type: 'description', pattern: 'Local da transação:\\s*\\n(.+)', priority: 1, enabled: true },
        { name: 'Estabelecimento Nubank', type: 'description', pattern: 'Estabelecimento\\s(.+)', priority: 2, enabled: true },
        { name: 'Destinatário PIX', type: 'description', pattern: 'Destinatário\\s*\\n(.+)', priority: 3, enabled: true },
        { name: 'Descrição Genérica (Topo)', type: 'description', pattern: '^([A-Z\\s]{5,50})$', priority: 10, enabled: true },
        { name: 'Parcelas (x/y)', type: 'installments', pattern: 'parcela\\s\\d{1,2}\\s*\\/\\s*(\\d{1,2})', priority: 1, enabled: true },
        { name: 'À Vista', type: 'installments', pattern: '(à vista)', priority: 2, enabled: true },
    ];

    const batch = db.batch();
    defaultRules.forEach(rule => {
        const docRef = db.collection('financeiro_regras_ocr').doc();
        batch.set(docRef, rule);
    });

    try {
        await batch.commit();
        showToast('Regras padrão do leitor de comprovantes foram criadas!', 'success');
    } catch (error) {
        console.error("Erro ao criar regras padrão de OCR:", error);
    }
}

export function launchOcr(renderFormFunc) {
    const fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/png, image/jpeg';
    fileInput.onchange = async (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const ocrButton = document.querySelector('[data-action="launch-ocr"]');
        const originalBtnHtml = ocrButton.innerHTML;
        ocrButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Processando...</span>`;
        ocrButton.disabled = true;

        try {
            const { data: { text } } = await Tesseract.recognize(file, 'por');
            console.log("Texto extraído:", text);
            
            const extractedData = parseReceiptText(text);

            if (Object.keys(extractedData).length > 0) {
                showToast('Dados extraídos com sucesso!', 'success');
                renderFormFunc('saida', extractedData);
            } else {
                showToast('Não foi possível extrair os dados. Tente um comprovante mais nítido.', 'error');
            }

        } catch (error) {
            console.error("Erro no OCR:", error);
            showToast('Ocorreu um erro ao ler o comprovante.', 'error');
        } finally {
            ocrButton.innerHTML = originalBtnHtml;
            ocrButton.disabled = false;
        }
    };
    fileInput.click();
}

export function parseReceiptText(text) {
    const data = {};
    const typesToExtract = ['value', 'date', 'description', 'installments', 'account'];

    typesToExtract.forEach(type => {
        const relevantRules = (appState.ocrRules || [])
            .filter(r => r.type === type && r.enabled)
            .sort((a, b) => (a.priority || 99) - (b.priority || 99));

        for (const rule of relevantRules) {
            try {
                if (data[type]) break;

                const regex = new RegExp(rule.pattern, 'i');
                const match = text.match(regex);

                if (match) {
                    if (type === 'account') {
                        data.accountId = rule.accountId;
                    } else if (type === 'value' && match[1]) {
                        data.value = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    } else if (type === 'description' && match[1]) {
                        data.description = match[1].trim().split('\n')[0];
                    } else if (type === 'installments' && match[1]) {
                        data.installments = rule.name.includes('À Vista') ? 1 : parseInt(match[1], 10);
                    } else if (type === 'date' && match[1] && match[2] && match[3]) {
                        const day = match[1].padStart(2, '0');
                        const monthStr = match[2].toLowerCase().replace('.', '');
                        const year = match[3];
                        const monthMap = { jan: '01', janeiro: '01', fev: '02', fevereiro: '02', mar: '03', março: '03', abr: '04', abril: '04', mai: '05', maio: '05', jun: '06', junho: '06', jul: '07', julho: '07', ago: '08', agosto: '08', set: '09', setembro: '09', out: '10', outubro: '10', nov: '11', novembro: '11', dez: '12', dezembro: '12' };
                        const month = monthStr.match(/^\d+$/) ? monthStr.padStart(2, '0') : monthMap[monthStr];
                        if (day && month && year) {
                            data.date = `${year}-${month}-${day}`;
                        }
                    }
                }
            } catch (e) {
                console.error(`Regra OCR inválida: ${rule.name}`, e);
            }
        }
    });

    return data;
}

export function handleDescriptionChange(description, form, showAddAliasModalFunc) {
    const establishmentSelect = form.querySelector('select[name="establishmentId"]');
    const associationContainer = form.querySelector('#association-helper-container');
    const descriptionInput = form.querySelector('input[name="description"]');

    if (!establishmentSelect || !associationContainer || !descriptionInput) return;

    const normalizedText = description.trim().toLowerCase();
    associationContainer.innerHTML = '';
    establishmentSelect.value = '';

    if (!normalizedText) return;

    for (const establishment of appState.establishments) {
        if (establishment.aliases && establishment.aliases.length > 0) {
            for (const alias of establishment.aliases) {
                if (alias && (normalizedText.includes(alias) || normalizedText === alias)) {
                    descriptionInput.value = establishment.name;
                    establishmentSelect.value = establishment.id;
                    handleEstablishmentChange(establishment.id, form);
                    return;
                }
            }
        }
    }

    const directMatch = appState.establishments.find(e => e.name.trim().toLowerCase() === normalizedText);
    if (directMatch) {
        descriptionInput.value = directMatch.name;
        establishmentSelect.value = directMatch.id;
        handleEstablishmentChange(directMatch.id, form);
        return;
    }

    if (appState.establishments.length > 0) {
        associationContainer.innerHTML = `<button type="button" class="button-secondary" data-action="show-add-alias-modal" data-description="${description.trim()}" style="width: 100%; margin-top: 8px;"><i class="fa-solid fa-link"></i> Associar "${description.trim()}" a um estabelecimento?</button>`;
    }
}

export function handleEstablishmentChange(establishmentId, form) {
    const categorySelect = form.querySelector('select[name="categoryId"]');
    if (!establishmentId || !categorySelect) return;

    const establishment = appState.establishments.find(e => e.id === establishmentId);
    if (establishment && establishment.categoriaPadraoId) {
        if (!categorySelect.value) {
            categorySelect.value = establishment.categoriaPadraoId;
        }
    }
}


export function setupReportGenerator(generateReportFunc) {
    const reportGenerator = document.getElementById('report-generator');
    if (!reportGenerator) return;

    const typeSelector = document.getElementById('report-type-selector');
    const itemSelector = document.getElementById('report-item-selector');
    const keywordInput = document.getElementById('report-keyword-input');
    const dateStartInput = document.getElementById('report-date-start');
    const dateEndInput = document.getElementById('report-date-end');
    const generateBtn = document.getElementById('generate-report-btn');

    const updateItemSelector = () => {
        const type = typeSelector.value;
        itemSelector.innerHTML = '';
        keywordInput.classList.add('hidden');
        itemSelector.classList.remove('hidden');

        let items = [];
        switch (type) {
            case 'category': items = appState.categories; break;
            case 'person': items = appState.people; break;
            case 'establishment': items = appState.establishments; break;
            case 'account': items = appState.accounts; break;
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
    generateBtn.onclick = generateReportFunc;
    
    const savedFiltersJSON = localStorage.getItem('lastReportFilters');
    if (savedFiltersJSON) {
        const savedFilters = JSON.parse(savedFiltersJSON);
        dateStartInput.value = savedFilters.startDate;
        dateEndInput.value = savedFilters.endDate;
        typeSelector.value = savedFilters.type;
        updateItemSelector();
        setTimeout(() => { 
            if (savedFilters.type === 'keyword') {
                keywordInput.value = savedFilters.keyword;
            } else {
                itemSelector.value = savedFilters.itemId;
            }
        }, 0);
    } else {
        const today = getLocalISODate();
        dateStartInput.value = today;
        dateEndInput.value = today;
        updateItemSelector();
    }

    reportGenerator.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && e.target.tagName !== 'BUTTON') {
            e.preventDefault();
            const fields = Array.from(reportGenerator.querySelectorAll('input:not(.hidden), select:not(.hidden)'));
            const currentIndex = fields.indexOf(e.target);
            const nextField = fields[currentIndex + 1];
            if (nextField) {
                nextField.focus();
            } else {
                generateBtn.click();
            }
        }
    });
}

export function generateReport(showReportModalFunc) {
    const type = document.getElementById('report-type-selector').value;
    const itemId = document.getElementById('report-item-selector').value;
    const keyword = document.getElementById('report-keyword-input').value.toLowerCase();
    const startDateStr = document.getElementById('report-date-start').value;
    const endDateStr = document.getElementById('report-date-end').value;
    
    const reportFilters = { type, itemId, keyword, startDate: startDateStr, endDate: endDateStr };
    localStorage.setItem('lastReportFilters', JSON.stringify(reportFilters));

    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59');

    if (!startDate.valueOf() || !endDate.valueOf() || startDate > endDate) {
        showToast('Por favor, selecione um período de datas válido.', 'error');
        return;
    }

    let filteredTransactions = appState.allTransactions.filter(t => {
        const tDate = getDateObject(t.date);
        return tDate >= startDate && tDate <= endDate;
    });

    let reportTitle = '';

    switch (type) {
        case 'category':
            reportTitle = `Relatório de Saídas: ${findItemNameGlobal(itemId, 'categories')}`;
            filteredTransactions = filteredTransactions.filter(t => t.categoryId === itemId && t.type === 'Saída');
            break;
        case 'person':
            reportTitle = `Relatório de Transações: ${findItemNameGlobal(itemId, 'people')}`;
            filteredTransactions = filteredTransactions.filter(t => t.personId === itemId);
            break;
        case 'establishment':
            reportTitle = `Relatório de Transações: ${findItemNameGlobal(itemId, 'establishments')}`;
            filteredTransactions = filteredTransactions.filter(t => t.establishmentId === itemId);
            break;
        case 'account':
            reportTitle = `Relatório de Transações: ${findItemNameGlobal(itemId, 'accounts')}`;
            filteredTransactions = filteredTransactions.filter(t => t.accountId === itemId);
            break;
        case 'keyword':
            if (!keyword) {
                showToast('Por favor, digite uma palavra-chave para buscar.', 'error');
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
    
    appState.currentReport = { transactions: filteredTransactions, title: reportTitle, summary };
    showReportModalFunc(appState.currentReport);
}


export function applySavedSettings() {
    const savedFontSize = localStorage.getItem('appFontSize');
    if (savedFontSize) {
        document.documentElement.style.setProperty('--base-font-size', `${savedFontSize}px`);
    }

    const savedAnimationStyle = localStorage.getItem('appAnimationStyle');
    if (savedAnimationStyle) {
        updateAnimationSpeed(savedAnimationStyle);
    }
}

export function updateAnimationSpeed(style) {
    let speed = '0.2s';
    if (style === 'fluida') speed = '0.4s';
    if (style === 'instantanea') speed = '0s';
    document.documentElement.style.setProperty('--animation-speed', speed);
}

export function setupAppearanceSettings() {
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
        updateAnimationSpeed(newStyle);
        localStorage.setItem('appAnimationStyle', newStyle);
    };
}