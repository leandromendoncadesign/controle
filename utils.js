// utils.js

export function escapeRegex(string) {
    if (typeof string !== 'string') return '';
    return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function getDateObject(dateFieldValue) {
    if (!dateFieldValue) return new Date();
    if (typeof dateFieldValue.toDate === 'function') return dateFieldValue.toDate();
    return new Date(dateFieldValue);
}

export function getLocalISODate(date = new Date()) {
    const localDate = new Date(date.getTime() - (date.getTimezoneOffset() * 60000));
    return localDate.toISOString().split("T")[0];
}

export function getDateFromMonthYear(monthYear) {
    const [month, year] = monthYear.split('-');
    return new Date(year, month - 1, 15);
}

export function getInvoiceKeyForDate(date, card) {
    if (!date || !card || !card.closingDay) return '';
    
    const transactionDate = getDateObject(date);
    const closingDay = parseInt(card.closingDay, 10);
    
    let invoiceYear = transactionDate.getFullYear();
    let invoiceMonth = transactionDate.getMonth() + 1;

    if (transactionDate.getDate() > closingDay) {
        invoiceMonth += 1;
        if (invoiceMonth > 12) {
            invoiceMonth = 1;
            invoiceYear += 1;
        }
    }
    
    return `${invoiceMonth.toString().padStart(2, '0')}-${invoiceYear}`;
}

export function capitalizeFirstLetter(string) { 
    return string ? string.charAt(0).toUpperCase() + string.slice(1) : ''; 
}

export function formatCurrency(value) { 
    return (parseFloat(value) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }); 
}

export function getContrastColor(hexColor) {
    if (!hexColor || hexColor.length < 7) return '#FFFFFF';
    const r = parseInt(hexColor.substr(1, 2), 16);
    const g = parseInt(hexColor.substr(3, 2), 16);
    const b = parseInt(hexColor.substr(5, 2), 16);
    return ((r * 299) + (g * 587) + (b * 114)) / 1000 >= 128 ? '#000000' : '#FFFFFF';
}

export function showToast(message, type = 'success') {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    let iconClass = 'fa-info-circle';
    if (type === 'success') iconClass = 'fa-check-circle';
    if (type === 'error') iconClass = 'fa-times-circle';

    toast.innerHTML = `<i class="fa-solid ${iconClass}"></i> ${message}`;
    
    toastContainer.appendChild(toast);
    
    setTimeout(() => toast.classList.add('show'), 10); 
    
    setTimeout(() => { 
        toast.classList.remove('show'); 
        toast.addEventListener('transitionend', () => toast.remove()); 
    }, 4000);
}