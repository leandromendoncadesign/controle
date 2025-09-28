// data-handlers.js

import { showToast, getDateObject, getLocalISODate } from './utils.js';

let db;
let appState; // O estado do App será injetado

export function initDataHandlers(firestore, state) {
    db = firestore;
    appState = state;
}

// ----------------------------------------------------------------------
// FUNÇÕES DE PERSISTÊNCIA E MANIPULAÇÃO DE TRANSAÇÕES
// ----------------------------------------------------------------------

// Função centralizada para salvar ou editar um lançamento
export async function saveTransaction(form, isEdit = false) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());
    const type = isEdit ? appState.allTransactions.find(t => t.id === data.id)?.type : form.dataset.type;
    const id = data.id;
    const submitButton = form.querySelector('[type="submit"]');
    submitButton.disabled = true;
    submitButton.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Salvando...`;

    const batch = db.batch();

    try {
        data.value = parseFloat(String(data.value).replace(',', '.')) || 0;
        if (data.value <= 0) throw new Error("O valor deve ser positivo.");
        const dateString = data.date;

        if (type === 'saida' && !isEdit) {
            const dateObj = new Date(dateString + 'T12:00:00');
            const sameDayTransactions = appState.allTransactions.filter(t =>
                t.accountId === data.accountId &&
                getDateObject(t.date).toDateString() === dateObj.toDateString() &&
                t.value === data.value
            );
            if (sameDayTransactions.length > 0) {
                if (!confirm("Atenção: Este lançamento parece ser uma duplicata de um já existente. Deseja salvá-lo mesmo assim?")) {
                    throw new Error("Operação cancelada pelo usuário.");
                }
            }
        }

        // --- Lógica de Transferência e Pagamento de Fatura ---
        if (type === 'transferencia') {
            if (data.sourceAccountId === data.destinationAccountId) throw new Error("A conta de origem e destino não podem ser a mesma.");
            
            const transferId = db.collection('financeiro_lancamentos').doc().id;
            const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, transferId };
            
            const sourceAccount = appState.accounts.find(a => a.id === data.sourceAccountId);
            const destAccount = appState.accounts.find(a => a.id === data.destinationAccountId);

            const debit = { ...commonData, accountId: data.sourceAccountId, type: 'Transferência', description: data.description || `Transferência para ${destAccount?.name || 'N/A'}` };
            const credit = { ...commonData, accountId: data.destinationAccountId, type: 'Transferência', description: data.description || `Transferência de ${sourceAccount?.name || 'N/A'}` };
            
            batch.set(db.collection('financeiro_lancamentos').doc(), debit);
            batch.set(db.collection('financeiro_lancamentos').doc(), credit);
            updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);
            updateAccountBalance(data.destinationAccountId, data.value, 'Entrada', false, batch);

        } else if (type === 'pagarFatura') {
            const paymentId = db.collection('financeiro_lancamentos').doc().id;
            const commonData = { value: data.value, date: firebase.firestore.Timestamp.fromDate(new Date(`${dateString}T12:00:00`)), monthYear: `${(new Date(dateString).getMonth() + 1).toString().padStart(2, '0')}-${new Date(dateString).getFullYear()}`, paymentId, invoiceMonthYear: data.invoiceMonthYear };
            
            const sourceAccountName = appState.accounts.find(a => a.id === data.sourceAccountId)?.name || 'N/A';
            const destinationAccountName = appState.accounts.find(a => a.id === data.destinationAccountId)?.name || 'N/A';

            const debitDesc = `Pagamento Fatura ${destinationAccountName}`;
            const creditDesc = `Pagamento Recebido de ${sourceAccountName}`;
            
            // Saída (débito) da conta corrente
            const debit = { ...commonData, accountId: data.sourceAccountId, type: 'Pagamento de Fatura', description: debitDesc, destinationAccountId: data.destinationAccountId };
            // Entrada (crédito) na conta do cartão (que reduz o saldo devedor)
            const credit = { ...commonData, accountId: data.destinationAccountId, type: 'Pagamento de Fatura', description: creditDesc, sourceAccountId: data.sourceAccountId };
            
            batch.set(db.collection('financeiro_lancamentos').doc(), debit);
            batch.set(db.collection('financeiro_lancamentos').doc(), credit);
            
            // Só atualiza o saldo da conta corrente (o saldo do cartão é calculado)
            updateAccountBalance(data.sourceAccountId, data.value, 'Saída', false, batch);

        } else if (isEdit) {
            // --- Lógica de Edição de Lançamento Único ---
            const originalTransaction = appState.allTransactions.find(t => t.id === id);
            if (!originalTransaction) throw new Error("Lançamento original não encontrado para editar.");
            
            // Preserva o horário original
            const fullDate = new Date(`${dateString}T${getDateObject(originalTransaction.date).toTimeString().slice(0, 8)}`);
            const updateData = { 
                ...data, 
                value: data.value, 
                date: firebase.firestore.Timestamp.fromDate(fullDate), 
                monthYear: `${(fullDate.getMonth() + 1).toString().padStart(2, '0')}-${fullDate.getFullYear()}`, 
                type: originalTransaction.type // Mantém o tipo original
            };
            delete updateData.id;
            
            batch.update(db.collection('financeiro_lancamentos').doc(id), updateData);
            
            // Reverte o efeito da transação original e aplica o efeito da transação atualizada
            updateAccountBalance(originalTransaction.accountId, originalTransaction.value, originalTransaction.type, true, batch);
            updateAccountBalance(updateData.accountId, updateData.value, originalTransaction.type, false, batch);

        } else {
            // --- Lógica de Lançamento Simples (Entrada/Saída) ou Parcelado ---
            const installments = parseInt(data.installments) || 1;
            const selectedAccount = appState.accounts.find(a => a.id === data.accountId);

            if (type === 'saida' && selectedAccount?.type === 'Cartão de Crédito' && installments > 1) {
                // Lançamento parcelado em Cartão de Crédito
                const installmentGroupId = db.collection('financeiro_lancamentos').doc().id;
                const installmentValue = data.value / installments;
                for (let i = 0; i < installments; i++) {
                    const installmentDate = new Date(`${dateString}T12:00:00Z`);
                    installmentDate.setMonth(installmentDate.getMonth() + i);
                    
                    const installmentData = { 
                        ...data, 
                        type: 'Saída', 
                        date: firebase.firestore.Timestamp.fromDate(installmentDate), 
                        monthYear: `${(installmentDate.getMonth() + 1).toString().padStart(2, '0')}-${installmentDate.getFullYear()}`, 
                        description: `${data.description} [${i + 1}/${installments}]`, 
                        value: installmentValue, 
                        installmentGroupId: installmentGroupId 
                    };
                    delete installmentData.installments;
                    batch.set(db.collection('financeiro_lancamentos').doc(), installmentData);
                }
            } else {
                // Lançamento simples (Entrada ou Saída)
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
            form.querySelector('[name="description"]').value = '';
            form.querySelector('[name="value"]').value = '';
            form.querySelector('[name="description"]').focus();
            sessionStorage.removeItem('lancamentoFormState');
        } else {
            // A função de fechar o modal será chamada pelo app.js
        }

        showToast('Lançamento salvo com sucesso!', 'success');
        return { success: true, isEdit };

    } catch (error) {
        console.error("Erro ao salvar lançamento:", error);
        if (error.message !== "Operação cancelada pelo usuário.") {
            showToast(error.message || 'Ocorreu um erro ao salvar.', 'error');
        }
        return { success: false };
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = isEdit ? `Salvar` : `<i class="fa-solid fa-check"></i> Salvar`;
        }
    }
}

// Atualiza o saldo de uma conta corrente usando `increment`
export function updateAccountBalance(accountId, value, type, revert = false, batch) {
    const account = appState.accounts.find(a => a && a.id === accountId);
    
    // O saldo de Cartão de Crédito é sempre calculado, não atualizado diretamente.
    if (account?.type === 'Conta Corrente') {
        let valueToIncrement = 0;
        
        if (type === 'Entrada' || type === 'Transferência') {
            valueToIncrement = value;
        } else if (type === 'Saída' || type === 'Pagamento de Fatura') {
            valueToIncrement = -value;
        }
        
        if (revert) {
            valueToIncrement *= -1;
        }
        
        batch.update(db.collection('financeiro_contas').doc(accountId), { balance: firebase.firestore.FieldValue.increment(valueToIncrement) });
    }
}

// ----------------------------------------------------------------------
// FUNÇÕES DE PERSISTÊNCIA DE ITENS GERAIS (Conta, Categoria, Regra, etc.)
// ----------------------------------------------------------------------

export async function saveItem(e, collection, itemName) {
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
        } else if (itemName === 'Estabelecimento') {
            data.categoriaPadraoId = data.categoriaPadraoId || '';
            data.aliases = data.aliases.split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
        } else if (itemName === 'Regra OCR') {
            data.priority = parseInt(data.priority) || 99;
            data.enabled = !!data.enabled;
            
            const isSimpleMode = form.querySelector('.mode-btn[data-mode="simple"]')?.classList.contains('active');
            if (isSimpleMode && data.wizard_subtype) {
                const wizardSubtype = data.wizard_subtype;
                const escapeRegexFunc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); 
                const wizardKeyword = escapeRegexFunc(data.wizard_keyword || '');
                let generatedPattern = '';

                switch(wizardSubtype) {
                    case 'exact_text':
                        generatedPattern = `(${wizardKeyword})`;
                        break;
                    case 'same_line_after':
                        generatedPattern = `${wizardKeyword}\\s*(.+)`;
                        break;
                    case 'next_line_after':
                        generatedPattern = `${wizardKeyword}\\s*\\n(.+)`;
                        break;
                }
                if (generatedPattern) data.pattern = generatedPattern;
            }
            delete data.wizard_subtype;
            delete data.wizard_keyword;

            if (data.type === 'account' && !data.accountId) {
                throw new Error('Para regras do tipo "Conta/Cartão", é obrigatório selecionar uma conta.');
            }
            if (data.type !== 'account') {
                delete data.accountId;
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
        showToast(error.message || `Erro ao salvar ${itemName}.`, 'error');
        console.error(`Erro em saveItem para ${collection}:`, error);
        return { success: false, error: error.message };
    } finally {
        if (submitButton) {
            submitButton.disabled = false;
            submitButton.innerHTML = `Salvar`;
        }
    }
}

export async function deleteItem(collection, id, itemName, transactionToDelete = null) {
    let confirmationMessage = `Tem certeza que deseja excluir: ${itemName}? Esta ação não pode ser desfeita.`;
    if (transactionToDelete?.installmentGroupId) {
        confirmationMessage = 'Este é um lançamento parcelado. Deseja excluir TODAS as parcelas relacionadas?';
    }

    if (!confirm(confirmationMessage)) return false;

    const batch = db.batch();
    try {
        if (collection === 'financeiro_lancamentos') {
            let transactionsToDelete = [];
            
            if (transactionToDelete?.transferId) {
                const querySnapshot = await db.collection(collection).where('transferId', '==', transactionToDelete.transferId).get();
                querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
            } else if (transactionToDelete?.paymentId) {
                const querySnapshot = await db.collection(collection).where('paymentId', '==', transactionToDelete.paymentId).get();
                querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
            } else if (transactionToDelete?.installmentGroupId) {
                const querySnapshot = await db.collection(collection).where('installmentGroupId', '==', transactionToDelete.installmentGroupId).get();
                querySnapshot.docs.forEach(doc => transactionsToDelete.push({ id: doc.id, ...doc.data() }));
            } else if (transactionToDelete) {
                transactionsToDelete.push(transactionToDelete);
            }
            
            if (transactionsToDelete.length === 0 && transactionToDelete) {
                 transactionsToDelete.push(transactionToDelete);
            }

            for (const trans of transactionsToDelete) {
                if (trans && trans.id) {
                    batch.delete(db.collection(collection).doc(trans.id));
                    if (trans.type === 'Saída' || trans.type === 'Entrada' || trans.type === 'Pagamento de Fatura') {
                        updateAccountBalance(trans.accountId, trans.value, trans.type, true, batch);
                    }
                }
            }
        } else {
            const fieldToCheck = { 'financeiro_contas': 'accountId', 'financeiro_categorias': 'categoryId', 'financeiro_pessoas': 'personId', 'financeiro_estabelecimentos': 'establishmentId' }[collection];
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
        showToast(error.message || `Erro ao excluir ${itemName}.`, 'error'); 
        console.error(error); 
        return false;
    }
}

// ----------------------------------------------------------------------
// FUNÇÕES DE PERSISTÊNCIA DE PLANEJAMENTO
// ----------------------------------------------------------------------

export async function savePlanningData(planningData, monthYear) {
    const docId = monthYear;
    try {
        // Garante que todos os valores sejam salvos como números.
        const sanitizedData = {
            ...planningData,
            receitas: (planningData.receitas || []).map(item => ({...item, value: parseFloat(item.value) || 0 })),
            despesas: (planningData.despesas || []).map(item => ({...item, value: parseFloat(item.value) || 0 }))
        };

        await db.collection('financeiro_planejamento').doc(docId).set(sanitizedData, { merge: true });
        console.log(`Planejamento de ${docId} salvo.`);
        return true;
    } catch (error) {
        console.error('Erro ao salvar planejamento:', error);
        showToast('Erro ao salvar planejamento.', 'error');
        return false;
    }
}

// ----------------------------------------------------------------------
// FUNÇÕES DE ASSOCIAÇÃO/ALIAS
// ----------------------------------------------------------------------

export async function saveAssociation(form) {
    const formData = new FormData(form);
    const newAlias = formData.get('textoOcr').trim().toLowerCase();
    const establishmentId = formData.get('entidadeId');

    if (!newAlias || !establishmentId) {
        showToast('Erro: dados inválidos para associação.', 'error');
        return false;
    }

    try {
        const establishmentRef = db.collection('financeiro_estabelecimentos').doc(establishmentId);
        
        await establishmentRef.update({
            aliases: firebase.firestore.FieldValue.arrayUnion(newAlias)
        });

        showToast('Apelido adicionado ao estabelecimento com sucesso!', 'success');
        return true;
    } catch (error) {
        console.error("Erro ao adicionar apelido:", error);
        showToast('Não foi possível adicionar o apelido.', 'error');
        return false;
    }
}