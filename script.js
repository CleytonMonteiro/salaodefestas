import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set, update, push, off } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
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

// --- CONTROLE DE SALÃO ---
const urlParams = new URLSearchParams(window.location.search);
let currentHallId = urlParams.get('salao');

let activeLayoutRef = null;
let activeMesasRef = null;
let activeEventoRef = null;
const activityLogRef = ref(database, 'activityLog');

let dbPrefix = '';

const hallSelectionOverlay = document.getElementById('hall-selection-overlay');
const hallSelector = document.getElementById('hall-selector');
const adminLink = document.querySelector('.admin-link');
const loadingOverlay = document.getElementById('loading-overlay');
const eventTitle = document.getElementById('event-title');
const statusText = document.getElementById('status-text');

window.selectHall = function(hallId) {
    if(hallSelectionOverlay) hallSelectionOverlay.style.display = 'none';
    changeHallContext(hallId);
};

function changeHallContext(hallId) {
    currentHallId = hallId;
    
    if(hallSelector) hallSelector.value = currentHallId;
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('salao', currentHallId);
    window.history.pushState({}, '', newUrl);

    if(adminLink) adminLink.href = `admin.html?salao=${currentHallId}`;

    if(loadingOverlay) loadingOverlay.style.display = 'flex';

    if (activeLayoutRef) off(activeLayoutRef);
    if (activeMesasRef) off(activeMesasRef);
    if (activeEventoRef) off(activeEventoRef);

    layoutMesasGlobal = {};
    mesasDataGlobal = {};
    isInitialLayoutRendered = false;

    if (currentHallId === 'douradus') {
        dbPrefix = 'saloes/douradus/';
    } else if (currentHallId === 'principal') {
        dbPrefix = ''; 
    }

    activeLayoutRef = ref(database, dbPrefix + 'layoutMesas');
    activeMesasRef = ref(database, dbPrefix + 'mesas');
    activeEventoRef = ref(database, dbPrefix + 'informacoesEvento');

    setupFirebaseListeners();
}

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
        saloonId: currentHallId || 'desconhecido',
        timestamp: Date.now()
    });
}

function isValidEmail(email) {
    const re = /^(([^<>()\[\]\\.,;:\s@"]+(\.[^<>()\[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/;
    return re.test(String(email).toLowerCase());
}

document.addEventListener('DOMContentLoaded', () => {
    
    const elements = {
        layoutContainer: document.querySelector('.scroll-container'),
        logoutBtn: document.getElementById('logout-btn'),
        loginLinkBtn: document.getElementById('login-link-btn'),
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

    if (elements.nomeCompletoInput) {
        elements.nomeCompletoInput.addEventListener('input', () => { elements.nomeCompletoInput.value = elements.nomeCompletoInput.value.toUpperCase(); });
    }
    if (elements.contatoMesaInput) {
        IMask(elements.contatoMesaInput, { mask: '(00) 00000-0000' });
    }

    if(hallSelector) {
        hallSelector.addEventListener('change', (e) => {
            changeHallContext(e.target.value);
        });
    }

    if (!currentHallId) {
        if(loadingOverlay) loadingOverlay.style.display = 'none';
        if(hallSelectionOverlay) hallSelectionOverlay.style.display = 'flex';
    } else {
        changeHallContext(currentHallId);
    }

    window.renderInitialLayout = function() {
        if (!layoutMesasGlobal || Object.keys(layoutMesasGlobal).length === 0) {
            console.warn(`Layout vazio para: ${currentHallId}`);
            if(loadingOverlay) loadingOverlay.style.display = 'none'; 
            if (currentHallId === 'douradus') {
                eventTitle.textContent = "Salão Douradu's (Não Configurado)";
                statusText.textContent = "Use o Admin para criar o layout.";
            } else {
                eventTitle.textContent = "Layout Vazio";
            }
            const secoes = { esq: document.getElementById('col-esq'), cen: document.getElementById('col-cen'), dir: document.getElementById('col-dir') };
            Object.values(secoes).forEach(sec => { if (sec) sec.innerHTML = ''; });
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
        if (oldDivider) oldDivider.remove();
        
        const targetColumn = document.querySelector('.coluna-mesas[data-column-id="col-esq-1"]');
        if (targetColumn) {
            const divider = document.createElement('div');
            divider.className = 'layout-divider';
            targetColumn.parentNode.insertBefore(divider, targetColumn);
        }
    
        isInitialLayoutRendered = true;
        updateMesasView();
        if(loadingOverlay) loadingOverlay.style.display = 'none';
    };

    window.updateMesasView = function() {
        if (!isInitialLayoutRendered || !mesasDataGlobal) return;
        let searchTerm = elements.searchInput.value.toLowerCase();
        let filterStatus = 'all';
        const activeBtn = elements.filterButtons.querySelector('.filter-btn.active');
        if (activeBtn) filterStatus = activeBtn.dataset.status;

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
    };
    
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
        await update(ref(database, dbPrefix + `mesas/${mesaNum}/lockInfo`), { userId: currentUser.uid, userEmail: currentUser.email, timestamp: Date.now() });
    }

    async function unlockTable(mesaNum) {
        await set(ref(database, dbPrefix + `mesas/${mesaNum}/lockInfo`), null);
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
                    alert(`Mesa bloqueada por ${lockInfo.userEmail}.`);
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
            if (!email) { Toastify({ text: "O e-mail é obrigatório.", duration: 3000, backgroundColor: "#dc3545" }).showToast(); return; }
            if (!isValidEmail(email)) { Toastify({ text: "E-mail inválido.", duration: 3000, backgroundColor: "#dc3545" }).showToast(); return; }
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
                    body: JSON.stringify({ numero: mesaNum, nome: mesaDataParaSalvar.nome, email: mesaDataParaSalvar.email, salao: currentHallId }),
                });
                if (!response.ok) { Toastify({ text: "Falha envio email.", duration: 3000, backgroundColor: "#dc3545" }).showToast(); } 
                else { Toastify({ text: "E-mail enviado!", duration: 3000, backgroundColor: "#28a745" }).showToast(); }
            } catch (error) { console.error(error); }
        }
        
        await update(ref(database, dbPrefix + 'mesas/' + mesaNum), mesaDataParaSalvar);
        
        let logAction = 'EDIÇÃO', logDetails = `Mesa ${mesaNum} (${nome}) atualizada.`;
        if (mesaAntes.status === 'livre' && status === 'vendida') { logAction = 'VENDA'; logDetails = `Mesa ${mesaNum} vendida para ${nome}.`; }
        else if (mesaAntes.status === 'livre' && status === 'reservada') { logAction = 'RESERVA'; logDetails = `Mesa ${mesaNum} reservada para ${nome}.`; }
        
        await logActivity(logAction, logDetails);
        await unlockTable(mesaNum);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });

    document.getElementById('liberar-btn').addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        const nomeAntigo = mesasDataGlobal[mesaNum]?.nome || 'desc.';
        await set(ref(database, dbPrefix + 'mesas/' + mesaNum), { nome: '', status: 'livre', contato: '', email: '', pago: false, lockInfo: null });
        await logActivity('LIBERAÇÃO', `Mesa ${mesaNum} liberada.`);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });

    document.getElementById('cancelar-btn').addEventListener('click', async () => {
        const mesaNum = elements.mesaNumeroInput.value;
        if (mesaNum) await unlockTable(mesaNum);
        activeModalTable = null;
        elements.cadastroForm.style.display = 'none';
    });

    elements.reenviarEmailBtn.addEventListener('click', async () => { /* ... */ });
    elements.statusMesaSelect.addEventListener('change', () => {
        document.getElementById('pagamento-container').style.display = (elements.statusMesaSelect.value === 'vendida') ? 'flex' : 'none';
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
    
    // --- AUTH STATE CHANGED (CONTROLE DE VISIBILIDADE) ---
    onAuthStateChanged(auth, (user) => {
        isSupervisorLoggedIn = !!user;
        currentUser = user;
        if (user) {
            const nomeSalao = currentHallId === 'douradus' ? "Douradu's" : "AABB";
            statusText.textContent = `Supervisor: ${user.email} (${nomeSalao})`;
            elements.logoutBtn.style.display = 'inline-block';
            elements.loginLinkBtn.style.display = 'none';
            elements.statArrecadado.style.display = 'inline-block';
            elements.exportContainer.style.display = 'flex';
            
            // MOSTRA O SELETOR DE SALÃO APENAS SE LOGADO
            if(hallSelector) hallSelector.style.display = 'inline-block';
        } else {
            statusText.textContent = 'Modo Visualização';
            elements.logoutBtn.style.display = 'none';
            elements.loginLinkBtn.style.display = 'inline-block';
            elements.statArrecadado.style.display = 'none';
            elements.exportContainer.style.display = 'none';
            
            // ESCONDE O SELETOR SE NÃO ESTIVER LOGADO
            if(hallSelector) hallSelector.style.display = 'none';
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

    const scrollContainer = document.querySelector('.scroll-container');
    const zoomInBtn = document.getElementById('zoom-in-btn');
    const zoomOutBtn = document.getElementById('zoom-out-btn');
    const zoomResetBtn = document.getElementById('zoom-reset-btn');
    let currentZoom = 1; const zoomStep = 0.1; 
    function updateZoom() { if(scrollContainer) { scrollContainer.style.transform = `scale(${currentZoom})`; scrollContainer.style.transformOrigin = 'center center'; } }
    if (zoomInBtn) {
        zoomInBtn.addEventListener('click', () => { currentZoom += zoomStep; updateZoom(); });
        zoomOutBtn.addEventListener('click', () => { if (currentZoom > 0.5) { currentZoom -= zoomStep; updateZoom(); } });
        zoomResetBtn.addEventListener('click', () => { currentZoom = 1; updateZoom(); });
    }
});

function setupFirebaseListeners() {
    onValue(activeEventoRef, (snapshot) => {
        const data = snapshot.val() || {};
        const nomeSalao = currentHallId === 'douradus' ? "Douradu's" : "AABB";
        if(eventTitle) eventTitle.textContent = data.nome || `${nomeSalao}`;
        const dateEl = document.getElementById('event-date');
        if (data.data && dateEl) { const [ano, mes, dia] = data.data.split('-'); dateEl.textContent = `${dia}/${mes}/${ano}`; }
    });

    onValue(activeLayoutRef, (snapshot) => {
        layoutMesasGlobal = snapshot.val() || {};
        window.renderInitialLayout();
    });

    onValue(activeMesasRef, (snapshot) => {
        mesasDataGlobal = snapshot.val() || {};
        if (isInitialLayoutRendered) {
            window.updateMesasView();
        }
    });
}