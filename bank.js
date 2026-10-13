// ==========================================
// MÓDULO BANCARIO Y AUTOCOMPLETADO - UPRISING RP
// ==========================================

// Búsqueda en tiempo real de GamerTags para el autocompletado
async function searchGamerTags(inputVal) {
    const suggestionsBox = document.getElementById('gamertagSuggestions');
    if (!suggestionsBox) return;

    const query = inputVal.trim();
    if (query.length < 1) {
        suggestionsBox.style.display = 'none';
        suggestionsBox.innerHTML = '';
        return;
    }

    try {
        // Buscar usuarios cuyo gamertag empiece con el texto ingresado
        const snapshot = await db.collection('users')
            .where('gamertag', '>=', query)
            .where('gamertag', '<=', query + '\uf8ff')
            .limit(5)
            .get();

        suggestionsBox.innerHTML = '';

        if (snapshot.empty) {
            suggestionsBox.style.display = 'none';
            return;
        }

        suggestionsBox.style.display = 'block';

        snapshot.forEach((doc) => {
            const data = doc.data();
            // Ignorar al propio usuario
            if (currentUser && doc.id === currentUser.uid) return;

            const item = document.createElement('div');
            item.style.cssText = `
                padding: 10px 14px;
                cursor: pointer;
                border-bottom: 1px solid rgba(255,255,255,0.05);
                display: flex;
                justify-content: space-between;
                align-items: center;
                transition: background 0.2s;
            `;
            item.innerHTML = `
                <span style="font-weight: bold; color: var(--accent);"><i class="fa-solid fa-gamepad"></i> ${data.gamertag}</span>
            `;

            item.onmouseover = () => item.style.background = 'rgba(0, 240, 255, 0.15)';
            item.onmouseout = () => item.style.background = 'transparent';

            item.onclick = () => {
                document.getElementById('transferRecipient').value = data.gamertag;
                suggestionsBox.style.display = 'none';
            };

            suggestionsBox.appendChild(item);
        });
    } catch (error) {
        console.error("Error buscando GamerTags:", error);
    }
}

// Enviar dinero a otro usuario por GamerTag o UID
async function transferMoney(targetGamerTag, amount) {
    if (!currentUser) {
        alert("Debes estar autenticado para realizar transferencias.");
        return false;
    }

    amount = parseInt(amount);
    if (isNaN(amount) || amount <= 0) {
        alert("Por favor ingresa un monto válido mayor a 0.");
        return false;
    }

    if ((userData.money || 0) < amount) {
        alert("Saldo insuficiente para realizar esta transferencia.");
        return false;
    }

    try {
        const cleanTag = targetGamerTag.trim();
        const usersRef = db.collection('users');
        
        // Buscar por GamerTag exacto
        let recipientQuery = await usersRef.where('gamertag', '==', cleanTag).get();
        
        // Fallback: Si ingresó correo o UID
        if (recipientQuery.empty) {
            recipientQuery = await usersRef.where('email', '==', cleanTag.toLowerCase()).get();
        }

        if (recipientQuery.empty) {
            alert(`No se encontró ningún jugador registrado con el GamerTag: "${cleanTag}".`);
            return false;
        }

        const recipientDoc = recipientQuery.docs[0];
        const recipientId = recipientDoc.id;

        if (recipientId === currentUser.uid) {
            alert("No puedes transferirte dinero a ti mismo.");
            return false;
        }

        // Transacción Atómica en Firebase
        await db.runTransaction(async (transaction) => {
            const senderRef = db.collection('users').doc(currentUser.uid);
            const receiverRef = db.collection('users').doc(recipientId);

            const senderDoc = await transaction.get(senderRef);
            const receiverDoc = await transaction.get(receiverRef);

            if (!senderDoc.exists) throw "Tu cuenta no existe.";
            if (!receiverDoc.exists) throw "El destinatario no existe.";

            const currentSenderMoney = senderDoc.data().money || 0;
            if (currentSenderMoney < amount) throw "Saldo insuficiente al procesar.";

            const currentReceiverMoney = receiverDoc.data().money || 0;

            transaction.update(senderRef, { money: currentSenderMoney - amount });
            transaction.update(receiverRef, { money: currentReceiverMoney + amount });

            // Historial Remitente
            const senderHistoryRef = senderRef.collection('transactions').doc();
            transaction.set(senderHistoryRef, {
                type: 'ENVIADO',
                amount: amount,
                target: recipientDoc.data().gamertag || cleanTag,
                date: firebase.firestore.FieldValue.serverTimestamp()
            });

            // Historial Destinatario
            const receiverHistoryRef = receiverRef.collection('transactions').doc();
            transaction.set(receiverHistoryRef, {
                type: 'RECIBIDO',
                amount: amount,
                from: userData.gamertag || currentUser.email,
                date: firebase.firestore.FieldValue.serverTimestamp()
            });
        });

        alert(`¡Transferencia de $${amount.toLocaleString()} a ${recipientDoc.data().gamertag || cleanTag} realizada con éxito!`);
        return true;

    } catch (error) {
        console.error("Error en la transferencia:", error);
        alert("Ocurrió un error: " + error);
        return false;
    }
}

// Historial en tiempo real
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
