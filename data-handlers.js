// data-handlers.js

import { showToast, getDateObject } from './utils.js';

let db;
let appState;

export function initDataHandlers(firestore, state) {
    db = firestore;
    appState = state;
}

export async function saveTransaction(form, isEdit = false) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const type = isEdit ? appState.allTransactions.find(t => t.id === data.id)?.type : form.dataset.type;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;

    const batch = db.batch();

    try {
        data.value = parseFloat(String(data.value).replace(',', '.')) || 0;
        if (data.value <= 0) throw new Error("O valor deve ser positivo.");
        const dateString = data.date;

        if (type === 'transferencia') {
            if (data.sourceAccountId === data.destinationAccountId) throw new Error("As contas devem ser diferentes.");
            const transferId = db.collection('financeiro_lancamentos').doc().id;
            const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, transferId };
            const sourceName = appState.accounts.find(a => a.id === data.sourceAccountId)?.name || 'N/A';
            const destName = appState.accounts.find(a => a.id === data.destinationAccountId)?.name || 'N/A';
            batch.set(db.collection('financeiro_lancamentos').doc(), { ...commonData, accountId: data.sourceAccountId, type: 'Transferência', description: `Para ${destName}` });
            batch.set(db.collection('financeiro_lancamentos').doc(), { ...commonData, accountId: data.destinationAccountId, type: 'Transferência', description: `De ${sourceName}` });
            updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);
            updateAccountBalance(data.destinationAccountId, data.value, 'Entrada', false, batch);
        } else if (type === 'pagarFatura') {
            const paymentId = db.collection('financeiro_lancamentos').doc().id;
            const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, paymentId, invoiceMonthYear: data.invoiceMonthYear };
            const sourceName = appState.accounts.find(a => a.id === data.sourceAccountId)?.name || 'N/A';
            const destName = appState.accounts.find(a => a.id === data.destinationAccountId)?.name || 'N/A';
            batch.set(db.collection('financeiro_lancamentos').doc(), { ...commonData, accountId: data.sourceAccountId, type: 'Pagamento de Fatura', description: `Pag. Fatura ${destName}`, destinationAccountId: data.destinationAccountId });
            batch.set(db.collection('financeiro_lancamentos').doc(), { ...commonData, accountId: data.destinationAccountId, type: 'Pagamento de Fatura', description: `Pag. Recebido de ${sourceName}`, sourceAccountId: data.sourceAccountId });
            updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);
        } else if (isEdit) {
            const original = appState.allTransactions.find(t => t.id === data.id);
            const fullDate = new Date(`${dateString}T${getDateObject(original.date).toTimeString().slice(0, 8)}`);
            const updateData = { ...data, value: data.value, date: firebase.firestore.Timestamp.fromDate(fullDate), monthYear: `${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getFullYear()}`, type: original.type };
            delete updateData.id;
            batch.update(db.collection('financeiro_lancamentos').doc(data.id), updateData);
            updateAccountBalance(original.accountId, original.value, original.type, true, batch);
            updateAccountBalance(updateData.accountId, updateData.value, original.type, false, batch);
        } else {
            const installments = parseInt(data.installments) || 1;
            const selectedAccount = appState.accounts.find(a => a.id === data.accountId);
            if (type === 'saida' && selectedAccount?.type === 'Cartão de Crédito' && installments > 1) {
                const groupId = db.collection('financeiro_lancamentos').doc().id;
                const valuePerInstallment = data.value / installments;
                for (let i = 0; i < installments; i++) {
                    const instDate = new Date(`${dateString}T12:00:00Z`);
                    instDate.setMonth(instDate.getMonth() + i);
                    const instData = { ...data, type: 'Saída', date: firebase.firestore.Timestamp.fromDate(instDate), monthYear: `${(instDate.getMonth() + 1).toString().padStart(2, '0')}-${instDate.getFullYear()}`, description: `${data.description} [${i + 1}/${installments}]`, value: valuePerInstallment, installmentGroupId: groupId };
                    delete instData.installments;
                    batch.set(db.collection('financeiro_lancamentos').doc(), instData);
                }
            } else {
                const fullDate = new Date(`${dateString}T${new Date().toTimeString().slice(0, 8)}`);
                data.type = type === 'saida' ? 'Saída' : 'Entrada';
                data.date = firebase.firestore.Timestamp.fromDate(fullDate);
                data.monthYear = `${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getFullYear()}`;
                delete data.installments;
                batch.set(db.collection('financeiro_lancamentos').doc(), data);
                updateAccountBalance(data.accountId, data.value, data.type, false, batch);
            }
        }
        await batch.commit();
        if (!isEdit) {
            form.reset();
            form.querySelector('[name="description"]')?.focus();
        }
        showToast('Lançamento salvo com sucesso!', 'success');
        return { success: true, isEdit };
    } catch (error) {
        console.error("Erro em saveTransaction:", error);
        showToast(error.message || 'Ocorreu um erro ao salvar.', 'error');
        return { success: false };
    } finally {
        submitButton.disabled = false;
        submitButton.innerHTML = isEdit ? `Salvar` : `<i class="fa-solid fa-check"></i> Salvar`;
    }
}

export function updateAccountBalance(accountId, value, type, revert = false, batch) {
    const account = appState.accounts.find(a => a.id === accountId);
    if (account?.type === 'Conta Corrente') {
        let incrementValue = (type === 'Entrada' || type === 'Transferência') ? value : -value;
        if (type === 'Pagamento de Fatura') incrementValue = -value;
        if (revert) incrementValue *= -1;
        batch.update(db.collection('financeiro_contas').doc(accountId), { balance: firebase.firestore.FieldValue.increment(incrementValue) });
    }
}

export async function saveItem(e, collection, itemName) {
    const form = e.target.closest('form');
    const submitButton = form.querySelector('button[type="submit"]');
    submitButton.disabled = true;
    try {
        const formData = new FormData(form);
        const data = Object.fromEntries(formData.entries());
        const id = data.id;
        delete data.id;
        
        if (itemName === 'Conta') {
            if (data.type === 'Cartão de Crédito') {
                data.limit = parseFloat(String(data.limit || '0').replace(',', '.')) || 0;
                data.dueDate = parseInt(data.dueDate) || 1;
                data.closingDay = parseInt(data.closingDay) || 1;
                delete data.balance;
            } else {
                data.balance = parseFloat(String(data.balance || '0').replace(',', '.')) || 0;
                delete data.limit; delete data.dueDate; delete data.closingDay;
            }
        } else if (itemName === 'Estabelecimento') {
            data.aliases = (data.aliases || '').split(',').map(s => s.trim()).filter(Boolean);
        } else if (itemName === 'Regra OCR') {
            data.enabled = 'enabled' in data;
            data.priority = parseInt(data.priority) || 10;
            if (data.associatedId === '') {
                delete data.associatedId;
            }
        }

        if (id) {
            await db.collection(collection).doc(id).update(data);
        } else {
            if (itemName === 'Conta') data.arquivado = false;
            await db.collection(collection).add(data);
        }
        showToast(`${itemName} salvo com sucesso!`, 'success');
        return { success: true };
    } catch (error) {
        console.error(`Erro ao salvar ${itemName}:`, error);
        showToast(error.message || `Erro ao salvar ${itemName}.`, 'error');
        return { success: false };
    } finally {
        submitButton.disabled = false;
    }
}

export async function deleteItem(collection, id, itemName, transaction = null) {
    const confirmationPromise = new Promise((resolve) => {
        const modalHtml = `
            <div class="modal-content" style="max-width: 400px;">
                <div class="modal-body confirmation-body">
                    <i class="fa-solid fa-triangle-exclamation confirmation-icon"></i>
                    <h2>Confirmar Exclusão</h2>
                    <p class="confirmation-message">Tem certeza que deseja excluir: <strong>${itemName}</strong>?</p>
                </div>
                <div class="modal-actions">
                    <button type="button" class="button-secondary" id="cancel-delete-btn">Cancelar</button>
                    <button type="button" class="button-danger" id="confirm-delete-btn">Excluir</button>
                </div>
            </div>`;
        const modalContainer = document.getElementById('modal-container');
        modalContainer.innerHTML = modalHtml;
        modalContainer.classList.add('visible');

        const confirmBtn = document.getElementById('confirm-delete-btn');
        const cancelBtn = document.getElementById('cancel-delete-btn');
        const closeModal = () => {
            modalContainer.classList.remove('visible');
            setTimeout(() => { modalContainer.innerHTML = ''; }, 300);
        };

        confirmBtn.onclick = () => { closeModal(); resolve(true); };
        cancelBtn.onclick = () => { closeModal(); resolve(false); };
        modalContainer.onclick = (e) => { if (e.target === modalContainer) { closeModal(); resolve(false); } };
    });

    const confirmed = await confirmationPromise;
    if (!confirmed) return false;

    const batch = db.batch();
    try {
        if (collection === 'financeiro_lancamentos' && transaction) {
            batch.delete(db.collection(collection).doc(id));
            updateAccountBalance(transaction.accountId, transaction.value, transaction.type, true, batch);
        } else {
            let fieldToCheck = '';
            if (itemName === 'Categoria') fieldToCheck = 'categoryId';
            else if (itemName === 'Pessoa') fieldToCheck = 'personId';
            else if (itemName === 'Estabelecimento') fieldToCheck = 'establishmentId';
            else if (itemName === 'Conta') fieldToCheck = 'accountId';

            if (fieldToCheck) {
                const snapshot = await db.collection('financeiro_lancamentos').where(fieldToCheck, '==', id).limit(1).get();
                if (!snapshot.empty) throw new Error(`Este item não pode ser excluído pois possui lançamentos associados.`);
            }
            batch.delete(db.collection(collection).doc(id));
        }
        await batch.commit();
        showToast(`${itemName} excluído com sucesso.`, 'success');
        return true;
    } catch (error) { 
        console.error(`Erro ao excluir ${itemName}:`, error);
        showToast(error.message || `Erro ao excluir ${itemName}.`, 'error'); 
        return false;
    }
}

export async function savePlanningData(planningData, monthYear) {
    const docId = `planejamento_${monthYear}`;
    try {
        const dataToSave = {
            planningData: {
                receitas: (planningData.receitas || []).map(item => ({...item, value: parseFloat(item.value) || 0 })),
                despesas: (planningData.despesas || []).map(item => ({...item, value: parseFloat(item.value) || 0 }))
            },
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };
        await db.collection('financeiro_planejamento').doc(docId).set(dataToSave, { merge: true });
        return true;
    } catch (error) {
        console.error("Erro ao salvar planejamento:", error);
        showToast('Erro ao salvar planejamento.', 'error');
        return false;
    }
}

export async function saveAssociation(form) {
    const formData = new FormData(form);
    const newAlias = formData.get('textoOcr').trim();
    const establishmentId = formData.get('entidadeId');
    if (!newAlias || !establishmentId) return false;
    try {
        const ref = db.collection('financeiro_estabelecimentos').doc(establishmentId);
        await ref.update({ aliases: firebase.firestore.FieldValue.arrayUnion(newAlias) });
        showToast('Apelido adicionado com sucesso!', 'success');
        return true;
    } catch (error) {
        console.error("Erro ao salvar associação:", error);
        showToast('Não foi possível adicionar o apelido.', 'error');
        return false;
    }
}