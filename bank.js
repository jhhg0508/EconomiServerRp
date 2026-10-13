// ==========================================
// MÓDULO BANCARIO Y TRANSFERENCIAS - UPRISING RP
// ==========================================

// Enviar dinero a otro usuario mediante su Correo o UID
async function transferMoney(recipientIdentifier, amount) {
    if (!currentUser) {
        alert("Debes estar autenticado para realizar transferencias.");
        return false;
    }

    amount = parseInt(amount);
    if (isNaN(amount) || amount <= 0) {
        alert("Por favor ingresa un monto válido mayor a 0.");
        return false;
    }

    if (userData.money < amount) {
        alert("Saldo insuficiente. No tienes suficientes fondos para realizar esta transferencia.");
        return false;
    }

    try {
        // Buscar al destinatario por correo electrónico
        const usersRef = db.collection('users');
        let recipientQuery = await usersRef.where(firebase.firestore.FieldPath.documentId(), '==', recipientIdentifier).get();
        
        let recipientDoc = null;

        if (!recipientQuery.empty) {
            recipientDoc = recipientQuery.docs[0];
        } else {
            // Intentar buscar por coincidencia de email si no es UID directo
            const emailQuery = await usersRef.where('email', '==', recipientIdentifier.toLowerCase().trim()).get();
            if (!emailQuery.empty) {
                recipientDoc = emailQuery.docs[0];
            }
        }

        if (!recipientDoc) {
            alert("No se encontró ningún jugador registrado con esa cuenta o correo.");
            return false;
        }

        const recipientId = recipientDoc.id;

        if (recipientId === currentUser.uid) {
            alert("No puedes transferirte dinero a ti mismo.");
            return false;
        }

        // Transacción Atómica en Firebase (Transfiere el dinero de forma 100% segura)
        await db.runTransaction(async (transaction) => {
            const senderRef = db.collection('users').doc(currentUser.uid);
            const receiverRef = db.collection('users').doc(recipientId);

            const senderDoc = await transaction.get(senderRef);
            const receiverDoc = await transaction.get(receiverRef);

            if (!senderDoc.exists) throw "Tu cuenta no existe en la base de datos.";
            if (!receiverDoc.exists) throw "La cuenta del destinatario ya no existe.";

            const currentSenderMoney = senderDoc.data().money || 0;
            if (currentSenderMoney < amount) throw "Saldo insuficiente al procesar.";

            const currentReceiverMoney = receiverDoc.data().money || 0;

            // Actualizar saldos
            transaction.update(senderRef, { money: currentSenderMoney - amount });
            transaction.update(receiverRef, { money: currentReceiverMoney + amount });

            // Registrar movimiento en el historial del remitente
            const senderHistoryRef = senderRef.collection('transactions').doc();
            transaction.set(senderHistoryRef, {
                type: 'ENVIADO',
                amount: amount,
                target: recipientDoc.data().email || recipientId,
                date: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Registrar movimiento en el historial del destinatario
            const receiverHistoryRef = receiverRef.collection('transactions').doc();
            transaction.set(receiverHistoryRef, {
                type: 'RECIBIDO',
                amount: amount,
                from: currentUser.email || currentUser.uid,
                date: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        alert(`¡Transferencia de $${amount.toLocaleString()} realizada con éxito!`);
        return true;

    } catch (error) {
        console.error("Error en la transferencia:", error);
        alert("Ocurrió un error en la transacción: " + error);
        return false;
    }
}

// Escuchar e Historial de Transacciones en tiempo real
function listenTransactionHistory(userId) {
    const historyList = document.getElementById('transactionHistoryList');
    if (!historyList) return;

    db.collection('users').doc(userId).collection('transactions')
        .orderBy('date', 'desc')
        .limit(10)
        .onSnapshot((snapshot) => {
            historyList.innerHTML = '';
            if (snapshot.empty) {
                historyList.innerHTML = '<p style="color: var(--text-muted); font-size: 0.9rem;">No hay movimientos recientes.</p>';
                return;
            }

            snapshot.forEach((doc) => {
                const data = doc.data();
                const isSent = data.type === 'ENVIADO';
                const dateStr = data.date ? new Date(data.date.toDate()).toLocaleString() : 'Reciente';

                const item = document.createElement('div');
                item.className = 'history-item';
                item.style.cssText = `
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                    padding: 12px;
                    background: rgba(255,255,255,0.03);
                    border-left: 4px solid ${isSent ? '#ef4444' : '#10b981'};
                    border-radius: 8px;
                    margin-bottom: 10px;
                `;

                item.innerHTML = `
                    <div>
                        <div style="font-weight: bold; font-size: 0.95rem; color: #fff;">
                            ${isSent ? '📤 Transferencia Enviada' : '📥 Transferencia Recibida'}
                        </div>
                        <div style="font-size: 0.8rem; color: var(--text-muted);">
                            ${isSent ? 'Para: ' + (data.target || 'Usuario') : 'De: ' + (data.from || 'Usuario')} | ${dateStr}
                        </div>
                    </div>
                    <div style="font-family: 'Orbitron'; font-weight: bold; color: ${isSent ? '#ef4444' : '#10b981'};">
                        ${isSent ? '-' : '+'}$${data.amount.toLocaleString()}
                    </div>
                `;

                historyList.appendChild(item);
            });
        });
}
