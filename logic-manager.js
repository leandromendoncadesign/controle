// logic-manager.js

import { 
    showToast, 
    getDateObject,
    getInvoiceKeyForDate,
    getLocalISODate,
    capitalizeFirstLetter,
    formatCurrency
} from './utils.js';

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

export function testSingleOcrRule(text, rule) {
    if (!text || !rule || !rule.pattern || !rule.type) {
        return { success: false, message: 'Dados de teste inválidos. Preencha o padrão, tipo e texto de teste.' };
    }

    try {
        const match = text.match(new RegExp(rule.pattern, 'im'));

        if (match) {
            let extractedValue = null;
            switch (rule.type) {
                case 'value':
                    if (match[1]) extractedValue = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                    break;
                case 'description':
                    if (match[1]) extractedValue = match[1].trim().split('\n')[0];
                    break;
                case 'installments':
                    if (match[1]) extractedValue = rule.name.toLowerCase().includes('vista') ? 1 : parseInt(match[1], 10);
                    break;
                case 'date':
                    if (match.length > 3) {
                        const day = match[1];
                        const monthStr = match[2];
                        const year = match[3];
                        const monthMap = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
                        const cleanedMonthStr = monthStr.toLowerCase().replace('.', '');
                        const month = cleanedMonthStr.match(/^\d+$/) ? cleanedMonthStr.padStart(2, '0') : monthMap[cleanedMonthStr];
                        if (month) {
                            const fullYear = year.length === 2 ? `20${year}` : year;
                            extractedValue = `${fullYear}-${month}-${day.padStart(2, '0')}`;
                        }
                    }
                    break;
                case 'establishmentId':
                case 'accountId':
                     extractedValue = `Associado a: ${findItemNameGlobal(rule.associatedId, rule.type === 'accountId' ? 'accounts' : 'establishments')}`;
                     break;
            }

            if (extractedValue !== null && (!isNaN(extractedValue) || (typeof extractedValue === 'string' && extractedValue))) {
                return { success: true, value: extractedValue };
            }
        }
        return { success: false, message: 'Nenhum valor correspondente encontrado.' };
    } catch (e) {
        return { success: false, message: `Erro no padrão Regex: ${e.message}` };
    }
}

export async function syncAutomaticInvoices() {
    const creditCards = appState.accounts.filter(a => a?.type === 'Cartão de Crédito' && !a.arquivado);
    if (!creditCards.length) return;

    let despesas = [...(appState.planningData.despesas || [])];
    let hasChanged = false;

    despesas = despesas.filter(d => !d.isAutomatic || creditCards.some(c => c.id === d.cardId));

    for (const card of creditCards) {
        const refDate = new Date(appState.currentMonthYear.split('-')[1], appState.currentMonthYear.split('-')[0] - 1, 15);
        const invoiceDetails = calculateInvoiceDetailsGlobal(card.id, refDate);
        const formattedValue = parseFloat(invoiceDetails.openInvoiceTotal.toFixed(2));
        const existingInvoiceIndex = despesas.findIndex(d => d.cardId === card.id && d.isAutomatic);

        if (existingInvoiceIndex > -1) {
            if (despesas[existingInvoiceIndex].value !== formattedValue) {
                despesas[existingInvoiceIndex].value = formattedValue;
                hasChanged = true;
            }
        } else if (formattedValue > 0) {
            despesas.push({
                description: `Fatura ${card.name}`,
                value: formattedValue,
                paid: false, isAutomatic: true, cardId: card.id
            });
            hasChanged = true;
        }
    }

    if (hasChanged) {
        appState.planningData.despesas = despesas;
        await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    }
}

export async function syncInvoiceValue(index, cardId) {
    const item = appState.planningData.despesas[parseInt(index)];
    if (!item) return;

    const refDate = new Date(appState.currentMonthYear.split('-')[1], appState.currentMonthYear.split('-')[0] - 1, 15);
    const invoiceTotal = calculateInvoiceDetailsGlobal(cardId, refDate).openInvoiceTotal;
    item.value = parseFloat(invoiceTotal.toFixed(2));
    
    await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    showToast(`Fatura ${findItemNameGlobal(cardId, 'accounts')} sincronizada!`, 'success');
    renderCurrentViewGlobal();
}

export function addPlanningItem(type) {
    if (!appState.planningData[type]) appState.planningData[type] = [];
    
    const newItem = type === 'despesas' 
        ? { description: '', value: 0, paid: false, isAutomatic: false } 
        : { description: '', value: 0, paid: false };
        
    appState.planningData[type].push(newItem);
    renderCurrentViewGlobal();
}

export async function savePlanningItem(type, index) {
    const itemEl = document.querySelector(`.item:has([data-type="${type}"][data-index="${index}"])`);
    if (!itemEl || !appState.planningData[type] || !appState.planningData[type][index]) {
        showToast('Erro: Item não encontrado para salvar.', 'error');
        return;
    }

    const descInput = itemEl.querySelector('.desc');
    const valueInput = itemEl.querySelector('.val');
    
    const description = descInput ? descInput.value : appState.planningData[type][index].description;
    const value = valueInput ? parseFloat(valueInput.value) || 0 : appState.planningData[type][index].value;

    appState.planningData[type][index].description = description;
    appState.planningData[type][index].value = value;

    await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
    showToast('Item salvo!', 'success');
    updateSummaryGlobal();
}

export async function deletePlanningItem(type, index) {
    if (appState.planningData[type]?.[index]) {
        appState.planningData[type].splice(index, 1);
        await savePlanningDataGlobal(appState.planningData, appState.currentMonthYear);
        renderCurrentViewGlobal();
    }
}

export function attachPlanningKeydownListener(viewContainer, elementRefs) {
    return;
}

export function calculateCreditCardUsage(cardId) {
    const cardTransactions = appState.allTransactions.filter(t => t?.accountId === cardId);
    const totalSpent = cardTransactions.filter(t => t.type === 'Saída').reduce((s, t) => s + t.value, 0);
    const totalPaid = cardTransactions.filter(t => t.type === 'Pagamento de Fatura').reduce((s, t) => s + t.value, 0);
    return totalSpent - totalPaid;
}

export function isInvoicePaid(cardId, invoiceMonthYear) {
    return appState.allTransactions.some(t => t?.type === 'Pagamento de Fatura' && t.destinationAccountId === cardId && t.invoiceMonthYear === invoiceMonthYear);
}

export function calculateInvoiceDetails(cardId, referenceDate = null) {
    const card = appState.accounts.find(a => a?.id === cardId);
    if (!card?.closingDay) return { openInvoiceTotal: 0, invoiceKey: '' };
    
    const date = referenceDate ? getDateObject(referenceDate) : new Date();

    const invoiceKey = getInvoiceKeyForDate(date, card);
    const transactions = appState.allTransactions.filter(t => {
        if (t?.accountId !== cardId || t.type !== 'Saída') return false;
        const transactionInvoiceKey = getInvoiceKeyForDate(getDateObject(t.date), card);
        return transactionInvoiceKey === invoiceKey;
    });

    const total = transactions.reduce((s, t) => s + (t.value || 0), 0);
    return { openInvoiceTotal: total, invoiceKey };
}

export function postRenderInvoices(getTransactionHtmlFunc) {
    const cardSelector = document.getElementById('invoice-card-selector');
    const periodSelector = document.getElementById('invoice-period-selector');
    const detailsContainer = document.getElementById('invoice-details-container');
    if (!cardSelector) return;

    const render = () => {
        const cardId = cardSelector.value;
        const card = appState.accounts.find(a => a.id === cardId);
        if (!card) return;

        // CORREÇÃO APLICADA AQUI: Usa o mês atual do app como referência, não a data de hoje.
        const [month, year] = appState.currentMonthYear.split('-');
        const referenceDateForView = new Date(year, month - 1, 15);
        const defaultInvoiceKey = getInvoiceKeyForDate(referenceDateForView, card);
        
        const previouslySelectedPeriod = periodSelector.value;

        const transByInvoice = appState.allTransactions.filter(t => t?.accountId === cardId && t.type === 'Saída').reduce((acc, t) => {
            const key = getInvoiceKeyForDate(getDateObject(t.date), card);
            if (!acc[key]) acc[key] = [];
            acc[key].push(t);
            return acc;
        }, {});
        
        // Garante que a fatura do mês de visualização e a fatura em aberto (se diferentes) existam na lista
        if (!transByInvoice[defaultInvoiceKey]) {
            transByInvoice[defaultInvoiceKey] = [];
        }
        const currentOpenInvoiceKey = calculateInvoiceDetailsGlobal(cardId, new Date()).invoiceKey;
        if (currentOpenInvoiceKey && !transByInvoice[currentOpenInvoiceKey]) {
            transByInvoice[currentOpenInvoiceKey] = [];
        }

        const sortedPeriods = Object.keys(transByInvoice).sort((a, b) => new Date(b.split('-')[1], b.split('-')[0]-1) - new Date(a.split('-')[1], a.split('-')[0]-1));
        
        periodSelector.innerHTML = sortedPeriods.map(p => `<option value="${p}">${capitalizeFirstLetter(new Date(p.split('-')[1], p.split('-')[0]-1, 1).toLocaleString('pt-BR', { month: 'long' }))} de ${p.split('-')[1]}</option>`).join('');
        
        if (previouslySelectedPeriod && periodSelector.querySelector(`option[value="${previouslySelectedPeriod}"]`)) {
            periodSelector.value = previouslySelectedPeriod;
        } else {
            periodSelector.value = defaultInvoiceKey;
        }
        
        const periodKey = periodSelector.value;
        if (!periodKey) {
            detailsContainer.innerHTML = '<div class="empty-state"><p>Nenhuma fatura para este cartão.</p></div>';
            return;
        }

        const periodTrans = (transByInvoice[periodKey] || []).sort((a,b) => getDateObject(b.date) - getDateObject(a.date));
        const total = periodTrans.reduce((s, t) => s + t.value, 0);
        const paid = isInvoicePaid(cardId, periodKey);
        const [invoiceMonth, invoiceYear] = periodKey.split('-');
        
        const dueDate = new Date(invoiceYear, parseInt(invoiceMonth, 10) - 1, card.dueDate);
        const closingDate = new Date(invoiceYear, parseInt(invoiceMonth, 10) - 1, card.closingDay);
        if (card.dueDate && card.closingDay && closingDate > dueDate) {
            dueDate.setMonth(dueDate.getMonth() + 1);
        }
        
        detailsContainer.innerHTML = `
        <div class="card-details">
            <div class="detail-row"><span><strong>Total</strong></span><span class="value negative">${formatCurrency(total)}</span></div>
            ${card.dueDate ? `<div class="detail-row"><span>Vencimento</span><span>${dueDate.toLocaleDateString('pt-BR')}</span></div>` : ''}
            <div class="detail-row"><span>Status</span><span class="value ${paid ? 'positive':'negative'}">${paid ? 'Paga':'Aberta'}</span></div>
            <div style="margin-top: 16px;">${!paid && total > 0 ? `<button class="button-primary" data-action="pay-invoice" data-card-id="${cardId}" data-invoice-total="${total}" data-invoice-key="${periodKey}"><i class="fa-solid fa-dollar-sign"></i> Pagar Fatura</button>` : ''}</div>
        </div>
        <h4 style="margin-top: 1.5rem;">Lançamentos</h4>
        <div class="transaction-list compact">${periodTrans.length > 0 ? periodTrans.map(t => getTransactionHtmlFunc(t, false)).join('') : '<div class="empty-state small"><p>Nenhum lançamento.</p></div>'}</div>`;
    };
    
    cardSelector.onchange = render;
    periodSelector.onchange = render;
    render();
}

export async function adjustAccountBalance(accountId) {
    const account = appState.accounts.find(acc => acc.id === accountId);
    if (!account) return;
    const newBalanceStr = prompt('Digite o novo saldo correto:', account.balance);
    if (newBalanceStr !== null) {
        const newBalance = parseFloat(newBalanceStr.replace(',', '.'));
        if (isNaN(newBalance)) return showToast('Valor inválido.', 'error');
        try {
            await db.collection('financeiro_contas').doc(accountId).update({ balance: newBalance });
            showToast('Saldo ajustado!', 'success');
        } catch (error) { showToast('Erro ao ajustar o saldo.', 'error'); }
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
        const originalHtml = ocrButton.innerHTML;
        ocrButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i><span>Processando...</span>`;
        ocrButton.disabled = true;
        try {
            const { data: { text } } = await Tesseract.recognize(file, 'por');

            let data = parseReceiptText(text);

            if (!data.establishmentId) {
                const establishmentIdFromScan = findEstablishmentByGlobalScan(text, appState.establishments);
                if (establishmentIdFromScan) {
                    data.establishmentId = establishmentIdFromScan;
                }
            }

            renderFormFunc('saida', data);

            setTimeout(() => {
                const form = document.getElementById('lancar-form');
                if (form && data.establishmentId) {
                    handleEstablishmentChange(data.establishmentId, form);
                }
            }, 100);

            if (Object.keys(data).length <= 1 && !data.establishmentId) {
                 showToast('Não foi possível extrair dados do comprovante.', 'error');
            }
        } catch (error) {
            console.error("Erro no OCR:", error);
            showToast('Erro ao ler o comprovante.', 'error');
        } finally {
            ocrButton.innerHTML = originalHtml;
            ocrButton.disabled = false;
        }
    };
    fileInput.click();
}


export function parseReceiptText(text) {
    const data = {};
    const rules = (appState.ocrRules || [])
        .filter(r => r && r.enabled && r.pattern) 
        .sort((a, b) => (a.priority || 99) - (b.priority || 99));

    for (const rule of rules) {
        if (data[rule.type]) {
            continue;
        }

        try {
            const match = text.match(new RegExp(rule.pattern, 'im'));

            if (match) {
                switch (rule.type) {
                    case 'value':
                        if (match[1]) data.value = parseFloat(match[1].replace(/\./g, '').replace(',', '.'));
                        break;
                    case 'description':
                        if (match[1]) data.description = match[1].trim().split('\n')[0];
                        break;
                    case 'installments':
                        if (match[1]) data.installments = rule.name.toLowerCase().includes('vista') ? 1 : parseInt(match[1], 10);
                        break;
                    case 'date':
                        if (match.length > 3) {
                            const day = match[1];
                            const monthStr = match[2];
                            const year = match[3];
                            const monthMap = { jan: '01', fev: '02', mar: '03', abr: '04', mai: '05', jun: '06', jul: '07', ago: '08', set: '09', out: '10', nov: '11', dez: '12' };
                            const cleanedMonthStr = monthStr.toLowerCase().replace('.', '');
                            const month = cleanedMonthStr.match(/^\d+$/) ? cleanedMonthStr.padStart(2, '0') : monthMap[cleanedMonthStr];
                            if (month) {
                                const fullYear = year.length === 2 ? `20${year}` : year;
                                data.date = `${fullYear}-${month}-${day.padStart(2, '0')}`;
                            }
                        }
                        break;
                    case 'establishmentId':
                        if (rule.associatedId) data.establishmentId = rule.associatedId;
                        break;
                    case 'accountId':
                        if (rule.associatedId) data.accountId = rule.associatedId;
                        break;
                }
            }
        } catch (e) {
            console.warn(`Regra de OCR inválida encontrada: "${rule.name}". Padrão: "${rule.pattern}". Erro:`, e);
        }
    }

    return data;
}

function findEstablishmentByGlobalScan(text, establishments) {
    const normalizedText = text.toLowerCase();
    let bestMatch = null;

    for (const est of establishments) {
        const searchTerms = [est.name, ...(est.aliases || [])]
            .map(term => term ? term.toLowerCase().trim() : '')
            .filter(Boolean);

        for (const term of searchTerms) {
            if (normalizedText.includes(term)) {
                if (!bestMatch || term.length > bestMatch.term.length) {
                    bestMatch = { establishmentId: est.id, term: term };
                }
            }
        }
    }
    return bestMatch ? bestMatch.establishmentId : null;
}


export function handleDescriptionChange(description, form) {
    const establishmentId = findEstablishmentByGlobalScan(description, appState.establishments);
    if (establishmentId) {
        const establishmentSelect = form.querySelector('select[name="establishmentId"]');
        establishmentSelect.value = establishmentId;
        handleEstablishmentChange(establishmentId, form);
    }
}

export function handleEstablishmentChange(establishmentId, form) {
    const categorySelect = form.querySelector('select[name="categoryId"]');
    if (!categorySelect) return;
    const establishment = appState.establishments.find(e => e.id === establishmentId);
    if (establishment?.categoriaPadraoId && !categorySelect.value) {
        categorySelect.value = establishment.categoriaPadraoId;
    }
}

export function setupReportGenerator(generateReportFunc) {
    const form = document.getElementById('report-generator');
    if (!form) return;
    const typeSelector = form.querySelector('#report-type-selector');
    const itemSelector = form.querySelector('#report-item-selector');
    const keywordInput = form.querySelector('#report-keyword-input');
    const dateStartInput = form.querySelector('#report-date-start');
    const dateEndInput = document.querySelector('#report-date-end');

    const updateUI = () => {
        const type = typeSelector.value;
        const isKeyword = type === 'keyword';
        itemSelector.classList.toggle('hidden', isKeyword);
        keywordInput.classList.toggle('hidden', !isKeyword);
        if (isKeyword) return;
        
        let items = [];
        if (type === 'category') items = appState.categories;
        else if (type === 'person') items = appState.people;
        else if (type === 'establishment') items = appState.establishments;
        else if (type === 'account') items = appState.accounts;
        
        itemSelector.innerHTML = items.sort((a,b) => a.name.localeCompare(b.name)).map(i => `<option value="${i.id}">${i.name}</option>`).join('');
    };

    typeSelector.onchange = updateUI;
    form.querySelector('#generate-report-btn').onclick = generateReportFunc;
    
    const saved = JSON.parse(localStorage.getItem('lastReportFilters'));
    if (saved) {
        dateStartInput.value = saved.startDate;
        dateEndInput.value = saved.endDate;
        typeSelector.value = saved.type;
        updateUI();
        if (saved.type === 'keyword') keywordInput.value = saved.keyword;
        else itemSelector.value = saved.itemId;
    } else {
        const today = new Date();
        dateStartInput.value = getLocalISODate(new Date(today.getFullYear(), today.getMonth(), 1));
        dateEndInput.value = getLocalISODate(today);
        updateUI();
    }
}

export function generateReport(showReportModalFunc) {
    const type = document.getElementById('report-type-selector').value;
    const itemId = document.getElementById('report-item-selector').value;
    const keyword = document.getElementById('report-keyword-input').value.toLowerCase();
    const startDateStr = document.getElementById('report-date-start').value;
    const endDateStr = document.getElementById('report-date-end').value;
    
    localStorage.setItem('lastReportFilters', JSON.stringify({ type, itemId, keyword, startDate: startDateStr, endDate: endDateStr }));
    const startDate = new Date(startDateStr + 'T00:00:00');
    const endDate = new Date(endDateStr + 'T23:59:59');

    if (!startDate.valueOf() || !endDate.valueOf() || startDate > endDate) return showToast('Período de datas inválido.', 'error');

    let transactions = appState.allTransactions.filter(t => {
        const tDate = getDateObject(t.date);
        return tDate >= startDate && tDate <= endDate;
    });

    let title = 'Relatório';
    if (type === 'category') {
        title = `Saídas: ${findItemNameGlobal(itemId, 'categories')}`;
        transactions = transactions.filter(t => t.categoryId === itemId && t.type === 'Saída');
    } else if (type === 'person') {
        title = `Transações: ${findItemNameGlobal(itemId, 'people')}`;
        transactions = transactions.filter(t => t.personId === itemId);
    } else if (type === 'establishment') {
        title = `Transações: ${findItemNameGlobal(itemId, 'establishments')}`;
        transactions = transactions.filter(t => t.establishmentId === itemId);
    } else if (type === 'account') {
        title = `Transações: ${findItemNameGlobal(itemId, 'accounts')}`;
        transactions = transactions.filter(t => t.accountId === itemId);
    } else if (type === 'keyword') {
        if (!keyword) return showToast('Digite uma palavra-chave.', 'error');
        title = `Busca por: "${keyword}"`;
        transactions = transactions.filter(t => t.description?.toLowerCase().includes(keyword));
    }

    const income = transactions.filter(t => t.type === 'Entrada').reduce((s, t) => s + t.value, 0);
    const expense = transactions.filter(t => t.type === 'Saída').reduce((s, t) => s + t.value, 0);
    const summary = { count: transactions.length, totalIncome: income, totalExpense: expense, finalBalance: income - expense };
    
    appState.currentReport = { transactions, title, summary };
    showReportModalFunc(appState.currentReport);
}

function updatePillAnimationSpeed(speed) {
    let speedValue = '0.4s'; // Normal
    if (speed === 'rapida') speedValue = '0.2s';
    if (speed === 'lenta') speedValue = '0.6s';
    document.documentElement.style.setProperty('--pill-animation-speed', speedValue);
}

export function applySavedSettings() {
    const fontSize = localStorage.getItem('appFontSize');
    if (fontSize) document.documentElement.style.setProperty('--base-font-size', `${fontSize}px`);
    
    const animationStyle = localStorage.getItem('appAnimationStyle');
    if (animationStyle) updateAnimationSpeed(animationStyle);

    const pillSpeed = localStorage.getItem('appPillSpeed');
    if (pillSpeed) updatePillAnimationSpeed(pillSpeed);
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
    const pillSpeedSelector = document.getElementById('pill-speed-selector');

    if (fontSizeSlider) {
        fontSizeSlider.value = localStorage.getItem('appFontSize') || '16';
        fontSizeSlider.oninput = (e) => {
            document.documentElement.style.setProperty('--base-font-size', `${e.target.value}px`);
            localStorage.setItem('appFontSize', e.target.value);
        };
    }
    
    if (animationSelector) {
        animationSelector.value = localStorage.getItem('appAnimationStyle') || 'sutil';
        animationSelector.onchange = (e) => {
            updateAnimationSpeed(e.target.value);
            localStorage.setItem('appAnimationStyle', e.target.value);
        };
    }

    if (pillSpeedSelector) {
        pillSpeedSelector.value = localStorage.getItem('appPillSpeed') || 'normal';
        pillSpeedSelector.onchange = (e) => {
            updatePillAnimationSpeed(e.target.value);
            localStorage.setItem('appPillSpeed', e.target.value);
        };
    }
}