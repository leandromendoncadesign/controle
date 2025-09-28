// utils.js

// Função para escapar caracteres especiais em expressões regulares
export function escapeRegex(string) {
    if (typeof string !== 'string') return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); // $& means the whole matched string
}

// Retorna um objeto Date a partir de um campo de data do Firebase/JS
export function getDateObject(dateFieldValue) {
    if (!dateFieldValue) return new Date();
    // Verifica se é um Timestamp do Firebase e converte para Date
    if (typeof dateFieldValue.toDate === 'function') return dateFieldValue.toDate();
    return new Date(dateFieldValue);
}

// Retorna a data no formato ISO local (YYYY-MM-DD), ideal para inputs type="date"
export function getLocalISODate(date = new Date()) {
    return new Date(date.getTime() - (date.getTimezoneOffset() * 60000)).toISOString().split("T")[0];
}

// Cria um objeto Date para uma data específica (ex: 15º dia) de um mês/ano
export function getDateFromMonthYear(monthYear) {
    const [month, year] = monthYear.split('-');
    return new Date(year, month - 1, 15);
}

/**
 * Determina a chave da fatura (MM-YYYY) a que uma transação pertence.
 * A chave retornada é baseada no MÊS DE FECHAMENTO da fatura.
 * @param {Date | firebase.firestore.Timestamp} date - Data da transação.
 * @param {object} card - Objeto do cartão com 'closingDay'.
 * @returns {string} Chave da fatura (MM-YYYY).
 */
export function getInvoiceKeyForDate(date, card) {
    if (!date || !card || !card.closingDay) return '';
    
    const transactionDate = getDateObject(date);
    const closingDay = parseInt(card.closingDay, 10);
    
    let invoiceYear = transactionDate.getFullYear();
    let invoiceMonth = transactionDate.getMonth() + 1; // Mês 1-12

    // Se a data da transação for APÓS o dia de fechamento,
    // ela pertence à fatura que fechará no próximo mês.
    if (transactionDate.getDate() > closingDay) {
        invoiceMonth += 1;
        if (invoiceMonth > 12) {
            invoiceMonth = 1;
            invoiceYear += 1;
        }
    }
    
    // A chave representa o mês de fechamento da fatura.
    return `${invoiceMonth.toString().padStart(2, '0')}-${invoiceYear}`;
}


// Capitaliza a primeira letra de uma string
export function capitalizeFirstLetter(string) { return string ? string.charAt(0).toUpperCase() + string.slice(1) : ''; }

// Formata um valor numérico para o padrão de moeda BRL
export function formatCurrency(value) { return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); }

// Determina a cor de contraste (preto ou branco) para uma cor de fundo
export function getContrastColor(hexColor) {
    if (!hexColor || hexColor.length < 7) return '#FFFFFF';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    // Fórmula de Luminosidade
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128 ? '#000000' : '#FFFFFF';
}

// Encontra o nome de um item em uma coleção do estado principal (requires App context)
export function findItemName(id, collectionName, appState) {
    const collection = appState[collectionName] || [];
    const item = collection.find(c => c && c.id === id);
    return item ? item.name : 'N/A';
}

// Exibe um toast de notificação (requires DOM access)
export function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    const iconClass = type === 'success' ? 'fa-check-circle' : 'fa-times-circle';
    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${message}`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10); 
    
    setTimeout(() => { 
        toast.classList.remove('show'); 
        toast.addEventListener('transitionend', () => toast.remove()); 
    }, 4000);
}