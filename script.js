import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

const firebaseConfig = {
    apiKey: "AIzaSyDGVgqwdSOJJn0plwfKkHEsofxvfHFCf6w",
    authDomain: "layoutsalaodefesta.firebaseapp.com",
    databaseURL: "https://layoutsalaodefesta-default-rtdb.firebaseio.com",
    projectId: "layoutsalaodefesta",
    storageBucket: "layoutsalaodefesta.firebasestorage.app",
    messagingSenderId: "1060371531536",
    appId: "1:1060371531536:web:fbed496ff9a78982580795",
    measurementId: "G-L21G98V5CL"
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);
const layoutRef = ref(database, 'layoutMesas');
const mesasRef = ref(database, 'mesas');
const eventoRef = ref(database, 'informacoesEvento');
const activityLogRef = ref(database, 'activityLog');

const LOCK_TIMEOUT_MINUTES = 3;
const LOCK_TIMEOUT_MS = LOCK_TIMEOUT_MINUTES * 60 * 1000;
let currentUser = null;
let mesasDataGlobal = {};
let layoutMesasGlobal = {};
let isSupervisorLoggedIn = false;
let isInitialLayoutRendered = false;
let activeModalTable = null;
let hasPerformedInitialCleanup = false;

async function logActivity(action, details) {
    if (!currentUser) return;
    await push(activityLogRef, {
        action,
        details,
        userEmail: currentUser.email,
        timestamp: Date.now()
    });
}

function isValidEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

document.addEventListener('DOMContentLoaded', () => {
    const loadingOverlay = document.getElementById('loading-overlay');
    const elements = {
        layoutContainer: document.querySelector('.scroll-container'),
        statusText: document.getElementById('status-text'),
        logoutBtn: document.getElementById('logout-btn'),
        loginLinkBtn: document.getElementById('login-link-btn'),
        eventTitle: document.getElementById('event-title'),
        eventDate: document.getElementById('event-date'),
        loginForm: document.getElementById('login-form'),
        cadastroForm: document.getElementById('cadastro-form'),
        infoPanel: document.getElementById('info-panel'),
        totalCount: document.getElementById('total-count'),
        livreCount: document.getElementById('livre-count'),
        reservadaCount: document.getElementById('reservada-count'),
        vendidaCount: document.getElementById('vendida-count'),
        arrecadadoTotal: document.getElementById('arrecadado-total'),
        statArrecadado: document.getElementById('stat-arrecadado'),
        mesaNumeroInput: document.getElementById('mesa-numero'),
        nomeCompletoInput: document.getElementById('nome-completo'),
        statusMesaSelect: document.getElementById('status-mesa'),
        searchInput: document.getElementById('search-input'),
        filterButtons: document.getElementById('filter-buttons'),
        exportContainer: document.getElementById('export-container'),
        exportCsvBtn: document.getElementById('export-csv-btn'),
        exportPdfBtn: document.getElementById('export-pdf-btn'),
        exportFilter: document.getElementById('export-filter'),
        contatoMesaInput: document.getElementById('contato-mesa'),
        reenviarEmailBtn: document.getElementById('reenviar-email-btn')
    };

    elements.nomeCompletoInput.addEventListener('input', () => {
        elements.nomeCompletoInput.value = elements.nomeCompletoInput.value.toUpperCase();
    });

    IMask(elements.contatoMesaInput, {
        mask: '(00) 00000-0000'
    });

    function renderInitialLayout() {
        if (!layoutMesasGlobal || Object.keys(layoutMesasGlobal).length === 0) {
            return;
        }
        
        const secoes = { esq: document.getElementById('col-esq'), cen: document.getElementById('col-cen'), dir: document.getElementById('col-dir') };
        
        Object.values(secoes).forEach(sec => { if (sec) sec.innerHTML = ''; });
    
        const getColumnWeight = (columnId) => {
            if (columnId.startsWith('col-esq')) return 1;
            if (columnId.startsWith('col-cen')) return 2;
            if (columnId.startsWith('col-dir')) return 3;
            return 4;
        };
    
        const sortedColumnKeys = Object.keys(layoutMesasGlobal).sort((a, b) => {
            const weightA = getColumnWeight(a);
            const weightB = getColumnWeight(b);
            if (weightA !== weightB) { return weightA - weightB; }
            return a.localeCompare(b);
        });
    
        sortedColumnKeys.forEach(colId => {
            let secaoAlvo = null;
            if (colId.startsWith('col-esq')) secaoAlvo = secoes.esq;
            else if (colId.startsWith('col-cen')) secaoAlvo = secoes.cen;
            else if (colId.startsWith('col-dir')) secaoAlvo = secoes.dir;
            
            if (secaoAlvo) {
                const colunaDiv = document.createElement('div');
                colunaDiv.classList.add('coluna-mesas');
                colunaDiv.dataset.columnId = colId;
                (layoutMesasGlobal[colId] || []).forEach(mesaNum => {
                    const mesaDiv = document.createElement('div');
                    mesaDiv.className = 'mesa';
                    mesaDiv.textContent = String(mesaNum).padStart(2, '0');
                    mesaDiv.dataset.numero = mesaNum;
                    colunaDiv.appendChild(mesaDiv);
                });
                secaoAlvo.appendChild(colunaDiv);
            }
        });
        
        const oldDivider = document.querySelector('.layout-divider');
        if (oldDivider) {
            oldDivider.remove();
        }
    
        const targetColumn = document.querySelector('.coluna-mesas[data-column-id="col-esq-1"]');
    
        if (targetColumn) {
            const divider = document.createElement('div');
            divider.className = 'layout-divider';
            targetColumn.parentNode.insertBefore(divider, targetColumn);
        }
    
        isInitialLayoutRendered = true;
        updateMesasView();
        loadingOverlay.style.display = 'none';
    }

    function updateMesasView() {
        if (!isInitialLayoutRendered || !mesasDataGlobal) return;
        let searchTerm = elements.searchInput.value.toLowerCase();
        let filterStatus = elements.filterButtons.querySelector('.filter-btn.active').dataset.status;
        document.querySelectorAll('.mesa').forEach(mesaDiv => {
            const mesaNum = mesaDiv.dataset.numero;
            const mesaData = mesasDataGlobal[mesaNum] || { status: 'livre' };
            mesaDiv.classList.remove('livre', 'reservada', 'vendida', 'bloqueada');
            mesaDiv.classList.add(mesaData.status);
            const lockInfo = mesaData.lockInfo;
            if (lockInfo && (Date.now() - lockInfo.timestamp < LOCK_TIMEOUT_MS)) {
                mesaDiv.classList.add('bloqueada');
                mesaDiv.title = `Bloqueada por ${lockInfo.userEmail}`;
            } else {
                mesaDiv.title = '';
            }
            const statusMatch = filterStatus === 'all' || mesaData.status === filterStatus;
            const searchMatch = !searchTerm || mesaNum.toString().includes(searchTerm) || (mesaData.nome && mesaData.nome.toLowerCase().includes(searchTerm));
            mesaDiv.style.display = (statusMatch && searchMatch) ? 'flex' : 'none';
        });
        updateStats();
    }
    
    function updateStats() {
        let countTotal = 0, countReservada = 0, countVendida = 0, totalArrecadado = 0;
        if (layoutMesasGlobal) { for (const colId in layoutMesasGlobal) { countTotal += (layoutMesasGlobal[colId] || []).length; }}
        if (mesasDataGlobal) {
            Object.values(mesasDataGlobal).forEach(mesa => {
                if (mesa.status === 'reservada') countReservada++;
                else if (mesa.status === 'vendida') {
                    countVendida++;
                    if (mesa.pago) totalArrecadado += parseFloat(mesa.preco) || 0;
                }
            });
        }
        const countLivre = countTotal - countReservada - countVendida;
        elements.totalCount.textContent = countTotal;
        elements.livreCount.textContent = countLivre;
        elements.reservadaCount.textContent = countReservada;
        elements.vendidaCount.textContent = countVendida;
        elements.arrecadadoTotal.textContent = `R$ ${totalArrecadado.toFixed(2).replace('.', ',')}`;
    }

    async function lockTable(mesaNum) {
        if (!currentUser) return;
        await update(ref(database, `mesas/${mesaNum}/lockInfo`), { userId: currentUser.uid, userEmail: currentUser.email, timestamp: Date.now() });
    }

    async function unlockTable(mesaNum) {
        await set(ref(database, `mesas/${mesaNum}/lockInfo`), null);
    }
    
    async function abrirModalCadastro(mesaNum) {
        if (activeModalTable && activeModalTable !== mesaNum) { await unlockTable(activeModalTable); }
        activeModalTable = mesaNum;
        await lockTable(mesaNum);
        const mesaData = mesasDataGlobal[mesaNum] || { status: 'livre' };
        document.getElementById('modal-numero-mesa').textContent = String(mesaNum).padStart(2, '0');
        elements.mesaNumeroInput.value = mesaNum;
        elements.nomeCompletoInput.value = mesaData.nome || '';
        elements.statusMesaSelect.value = mesaData.status || 'livre';
        document.getElementById('preco-mesa').value = mesaData.preco || '';
        elements.contatoMesaInput.value = mesaData.contato || '';
        document.getElementById('email-mesa').value = mesaData.email || '';
        document.getElementById('pagamento-confirmado').checked = mesaData.pago || false;
        
        if (mesaData.status === 'vendida' && mesaData.email && isSupervisorLoggedIn) {
            elements.reenviarEmailBtn.style.display = 'block';
        } else {
            elements.reenviarEmailBtn.style.display = 'none';
        }
        
        document.getElementById('pagamento-container').style.display = (elements.statusMesaSelect.value === 'vendida') ? 'flex' : 'none';
        elements.cadastroForm.style.display = 'flex';
    }

    function showInfoPanel(mesaNum) {
        const defaults = { status: 'livre', nome: '---', preco: 0, contato: '', email: '', pago: false };
        const mesaData = { ...defaults, ...mesasDataGlobal[mesaNum] };
        elements.infoPanel.dataset.currentTable = mesaNum;
        document.getElementById('info-panel-numero').textContent = String(mesaNum).padStart(2, '0');
        document.getElementById('info-panel-status').textContent = mesaData.status.charAt(0).toUpperCase() + mesaData.status.slice(1);
        document.getElementById('info-panel-nome').textContent = (mesaData.nome && mesaData.nome.toUpperCase()) || '---';
        const dadosRestritos = document.getElementById('info-panel-dados-restritos');
        if (isSupervisorLoggedIn) {
            dadosRestritos.style.display = 'block';
            document.getElementById('manage-table-btn').style.display = 'block';
            document.getElementById('info-panel-preco').textContent = `R$ ${(parseFloat(mesaData.preco) || 0).toFixed(2)}`;
            document.getElementById('info-panel-contato').textContent = mesaData.contato || '';
            document.getElementById('info-panel-email').textContent = mesaData.email || '';
            document.getElementById('info-panel-pagamento').textContent = (mesaData.status === 'vendida') ? (mesaData.pago ? 'Confirmado' : 'Pendente') : 'N/A';
        } else {
            dadosRestritos.style.display = 'none';
            document.getElementById('manage-table-btn').style.display = 'none';
        }
        elements.infoPanel.classList.add('visible');
    }

    function getExportData() {
        const filterValue = elements.exportFilter.value;
        const allTablesData = [];
        for (const colId in layoutMesasGlobal) {
            (layoutMesasGlobal[colId] || []).forEach(numeroMesa => {
                const data = mesasDataGlobal[numeroMesa] || { status: 'livre' };
                allTablesData.push({ numero: parseInt(numeroMesa), nome: data.nome || '---', contato: data.contato || '---', status: data.status || 'livre' });
            });
        }
        const filteredData = allTablesData.filter(table => {
            if (filterValue === 'ocupadas') { return table.status === 'reservada' || table.status === 'vendida'; }
            return table.status === filterValue;
        });
        return filteredData.sort((a, b) => a.numero - b.numero);
    }

    elements.layoutContainer.addEventListener('click', async (e) => {
        const mesaClicada = e.target.closest('.mesa');
        if (!mesaClicada) return;
        const mesaNum = mesaClicada.dataset.numero;
        const mesaData = mesasDataGlobal[mesaNum] || { status: 'livre' };
        const lockInfo = mesaData.lockInfo;
        if (lockInfo) {
            const isLockExpired = Date.now() - lockInfo.timestamp > LOCK_TIMEOUT_MS;
            if (isLockExpired) {
                await unlockTable(mesaNum);
            } else {
                const isLockedByCurrentUser = currentUser && lockInfo.userId === currentUser.uid;
                if (!isLockedByCurrentUser) {
                    alert(`Mesa bloqueada para edição por ${lockInfo.userEmail}.`);
                    return;
                }
            }
        }
        if (mesaData.status === 'livre') {
            if (isSupervisorLoggedIn) abrirModalCadastro(mesaNum);
            else elements.loginForm.style.display = 'flex';
        } else {
            showInfoPanel(mesaNum);
        }
    });

    document.getElementById('salvar-btn').addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        const nome = elements.nomeCompletoInput.value.trim();
        const status = elements.statusMesaSelect.value;
        const email = document.getElementById('email-mesa').value.trim();
    
        if (status === 'vendida') {
            if (!email) {
                Toastify({ text: "O e-mail é obrigatório para mesas vendidas.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
                return;
            }
            if (!isValidEmail(email)) {
                Toastify({ text: "O e-mail inserido é inválido.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
                return;
            }
        }
    
        const mesaAntes = mesasDataGlobal[mesaNum] || { status: 'livre', pago: false };
        const mesaDataParaSalvar = { 
            nome, 
            status, 
            preco: parseFloat(document.getElementById('preco-mesa').value) || 0, 
            contato: elements.contatoMesaInput.value, 
            email: email, 
            pago: (status === 'vendida') ? document.getElementById('pagamento-confirmado').checked : false 
        };
        
        if (mesaDataParaSalvar.status === 'vendida' && mesaDataParaSalvar.pago && mesaDataParaSalvar.email &&
            !(mesaAntes.status === 'vendida' && mesaAntes.pago)) {
            
            try {
                const response = await fetch('https://salaodefestas.netlify.app/.netlify/functions/enviar-email', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        numero: mesaNum,
                        nome: mesaDataParaSalvar.nome,
                        email: mesaDataParaSalvar.email
                    }),
                });
    
                if (!response.ok) {
                    console.error('Falha ao acionar o envio de e-mail.');
                    Toastify({
                        text: "Falha ao enviar e-mail. Verifique a configuração ou tente o reenvio manual.",
                        duration: 5000,
                        close: true,
                        gravity: "bottom",
                        position: "right",
                        backgroundColor: "#dc3545",
                    }).showToast();
                } else {
                    Toastify({
                        text: "E-mail de confirmação acionado com sucesso!",
                        duration: 3000,
                        close: true,
                        gravity: "bottom",
                        position: "right",
                        backgroundColor: "#28a745",
                    }).showToast();
                }
            } catch (error) {
                console.error('Erro de rede ao chamar a função serverless:', error);
                Toastify({
                    text: "Erro de rede. O e-mail não foi enviado.",
                    duration: 3000,
                    close: true,
                    gravity: "bottom",
                    position: "right",
                    backgroundColor: "#dc3545",
                }).showToast();
            }
        }
        
        await update(ref(database, 'mesas/' + mesaNum), mesaDataParaSalvar);
        let logAction = 'EDIÇÃO', logDetails = `Dados da Mesa ${mesaNum} (cliente ${nome}) foram atualizados.`;
        if (mesaAntes.status === 'livre' && status === 'vendida') { logAction = 'VENDA'; logDetails = `Mesa ${mesaNum} vendida para ${nome}.`; }
        else if (mesaAntes.status === 'livre' && status === 'reservada') { logAction = 'RESERVA'; logDetails = `Mesa ${mesaNum} reservada para ${nome}.`; }
        else if (mesaAntes.status === 'reservada' && status === 'vendida') { logAction = 'VENDA (de reserva)'; logDetails = `Reserva da Mesa ${mesaNum} (cliente ${nome}) foi efetivada como venda.`; }
        await logActivity(logAction, logDetails);
        await unlockTable(mesaNum);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });
    
    elements.reenviarEmailBtn.addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        const nome = elements.nomeCompletoInput.value.trim();
        const email = document.getElementById('email-mesa').value.trim();
        
        if (!email) {
            Toastify({ text: "O campo de e-mail está vazio.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
            return;
        }

        if (!isValidEmail(email)) {
            Toastify({ text: "O e-mail inserido é inválido.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
            return;
        }

        try {
            const response = await fetch('https://salaodefestas.netlify.app/.netlify/functions/enviar-email', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    numero: mesaNum,
                    nome: nome,
                    email: email
                }),
            });

            if (response.ok) {
                Toastify({ text: "E-mail de confirmação reenviado com sucesso!", duration: 3000, backgroundColor: "#28a745" }).showToast();
            } else {
                Toastify({ text: "Falha ao reenviar o e-mail.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
            }
        } catch (error) {
            console.error('Erro de rede ao chamar a função serverless:', error);
            Toastify({ text: "Erro de rede. Verifique sua conexão ou tente novamente.", duration: 3000, backgroundColor: "#dc3545" }).showToast();
        }
    });

    document.getElementById('liberar-btn').addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        const nomeAntigo = mesasDataGlobal[mesaNum]?.nome || 'desconhecido';
        await set(ref(database, 'mesas/' + mesaNum), { nome: '', status: 'livre', contato: '', email: '', pago: false, lockInfo: null });
        await logActivity('LIBERAÇÃO', `Mesa ${mesaNum} (cliente ${nomeAntigo}) foi liberada.`);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });

    document.getElementById('cancelar-btn').addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        if (mesaNum) await unlockTable(mesaNum);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });
    
    elements.statusMesaSelect.addEventListener('change', () => {
        const pagamentoContainer = document.getElementById('pagamento-container');
        if (elements.statusMesaSelect.value === 'vendida') {
            pagamentoContainer.style.display = 'flex';
        } else {
            pagamentoContainer.style.display = 'none';
        }
    });

    elements.searchInput.addEventListener('input', updateMesasView);
    elements.filterButtons.addEventListener('click', (e) => {
        const target = e.target.closest('.filter-btn');
        if (target) {
            elements.filterButtons.querySelectorAll('.filter-btn').forEach(btn => btn.classList.remove('active'));
            target.classList.add('active');
            updateMesasView();
        }
    });

    function cleanupExpiredLocks() {
        if (!isSupervisorLoggedIn || !mesasDataGlobal) return;
        const agora = Date.now();
        const updates = {};
        let locksLimpados = 0;
        for (const mesaId in mesasDataGlobal) {
            const mesa = mesasDataGlobal[mesaId];
            if (mesa.lockInfo && (agora - mesa.lockInfo.timestamp > LOCK_TIMEOUT_MS)) {
                updates[`/mesas/${mesaId}/lockInfo`] = null;
                locksLimpados++;
            }
        }
        if (locksLimpados > 0) {
            console.log(`Zelador: Limpando ${locksLimpados} bloqueios expirados...`);
            update(ref(database), updates);
        }
    }

    onAuthStateChanged(auth, (user) => {
        isSupervisorLoggedIn = !!user;
        currentUser = user;
        if (user) {
            elements.statusText.textContent = `Logado como: ${user.email}`;
            elements.logoutBtn.style.display = 'inline-block';
            elements.loginLinkBtn.style.display = 'none';
            elements.statArrecadado.style.display = 'inline-block';
            elements.exportContainer.style.display = 'flex';
            if (!hasPerformedInitialCleanup && mesasDataGlobal) {
                cleanupExpiredLocks();
                hasPerformedInitialCleanup = true;
            }
        } else {
            elements.statusText.textContent = 'Clique em uma mesa para ver os detalhes.';
            elements.logoutBtn.style.display = 'none';
            elements.loginLinkBtn.style.display = 'inline-block';
            elements.statArrecadado.style.display = 'none';
            elements.exportContainer.style.display = 'none';
            hasPerformedInitialCleanup = false;
        }
    });

    onValue(eventoRef, (snapshot) => {
        const data = snapshot.val() || {};
        elements.eventTitle.textContent = data.nome || "Evento AABB";
        document.title = `AABB ARACAJU - ${elements.eventTitle.textContent}`;
        if (data.data) { const [ano, mes, dia] = data.data.split('-'); elements.eventDate.textContent = `${dia}/${mes}/${ano}`; }
        else { elements.eventDate.textContent = ''; }
    });

    onValue(layoutRef, (snapshot) => {
        layoutMesasGlobal = snapshot.val() || {};
        renderInitialLayout();
    });

    onValue(mesasRef, (snapshot) => {
        mesasDataGlobal = snapshot.val() || {};
        if (isInitialLayoutRendered) {
            updateMesasView();
        }
        if (isSupervisorLoggedIn && !hasPerformedInitialCleanup) {
            cleanupExpiredLocks();
            hasPerformedInitialCleanup = true;
        }
    });
    
    document.getElementById('info-panel-close-btn').addEventListener('click', () => { elements.infoPanel.classList.remove('visible'); });
    document.getElementById('manage-table-btn').addEventListener('click', () => { const mesaNum = elements.infoPanel.dataset.currentTable; if(mesaNum){ elements.infoPanel.classList.remove('visible'); abrirModalCadastro(mesaNum); } });
    elements.loginLinkBtn.addEventListener('click', () => { elements.loginForm.style.display = 'flex'; });
    elements.logoutBtn.addEventListener('click', () => signOut(auth));
    document.getElementById('login-btn').addEventListener('click', () => {
        const email = document.getElementById('login-email').value;
        const pass = document.getElementById('login-senha').value;
        signInWithEmailAndPassword(auth, email, pass).then(() => { elements.loginForm.style.display = 'none'; }).catch(() => { document.getElementById('login-erro').style.display = 'block'; });
    });
    document.getElementById('cancelar-login-btn').addEventListener('click', () => { elements.loginForm.style.display = 'none'; });
    elements.exportCsvBtn.addEventListener('click', () => {
        const data = getExportData();
        if (data.length === 0) { alert("Nenhuma mesa encontrada para exportar com este filtro."); return; }
        let csvContent = "Numero da Mesa,Nome Completo,Contato,Status\n";
        data.forEach(item => { csvContent += `${item.numero},"${item.nome}","${item.contato}","${item.status}"\n`; });
        const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
        const link = document.createElement("a");
        const url = URL.createObjectURL(blob);
        link.setAttribute("href", url);
        link.setAttribute("download", `relatorio_mesas_${elements.exportFilter.value}.csv`);
        link.style.visibility = 'hidden';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });
    elements.exportPdfBtn.addEventListener('click', () => {
        const data = getExportData();
        if (data.length === 0) { alert("Nenhuma mesa encontrada para exportar com este filtro."); return; }
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();
        const tableColumn = ["Nº da Mesa", "Nome Completo", "Contato", "Status"];
        const tableRows = data.map(item => [item.numero, item.nome, item.contato, item.status]);
        const filterText = elements.exportFilter.options[elements.exportFilter.selectedIndex].text;
        doc.text(`Relatório de Mesas: ${filterText}`, 14, 15);
        doc.autoTable(tableColumn, tableRows, { startY: 20 });
        doc.save(`relatorio_mesas_${elements.exportFilter.value}.pdf`);
    });
    window.addEventListener('pageshow', (event) => { if (event.persisted) { isInitialLayoutRendered = false; renderInitialLayout(); } });
    setInterval(() => {
        cleanupExpiredLocks();
    }, 60000);
});