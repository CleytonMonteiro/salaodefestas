import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, query, orderByChild, limitToLast, off } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-auth.js";

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

// --- VARIÁVEIS GLOBAIS DE CONTROLE ---
const urlParams = new URLSearchParams(window.location.search);
// Se não tiver na URL, assume 'principal' (AABB)
let currentHallId = urlParams.get('salao') || 'principal'; 

// Elementos da UI
const hallSelectionOverlay = document.getElementById('hall-selection-overlay');
const hallSelector = document.getElementById('hall-selector');
const linkLayout = document.getElementById('link-layout');
const linkMapa = document.getElementById('link-mapa');

// Referências ativas para poder desligar (off) quando mudar de salão
let activeLayoutRef = null;
let activeMesasRef = null;
let activeLogRef = null;

// Função global para o botão de seleção inicial (Overlay)
window.selectHall = function(hallId) {
    hallSelectionOverlay.style.display = 'none';
    changeHallContext(hallId);
};

// --- AUTENTICAÇÃO ---
onAuthStateChanged(auth, (user) => {
    if (user && user.email === 'cleyton@aabb-aracaju.com.br') {
        console.log(`Acesso autorizado.`);
        
        // Verifica se veio com salão na URL, senão mostra overlay
        if (!urlParams.get('salao')) {
            // Se já tem um valor padrão, apenas atualiza o UI, mas deixa o overlay se quiser
            // Aqui optamos por: se não tem URL, mostra overlay para garantir a escolha
             if(hallSelectionOverlay) hallSelectionOverlay.style.display = 'flex';
        } else {
             // Se já tem URL, carrega direto
             changeHallContext(currentHallId);
        }

        // Listener para o Dropdown do Header
        hallSelector.addEventListener('change', (e) => {
            changeHallContext(e.target.value);
        });

    } else {
        alert("Acesso restrito ao administrador do sistema.");
        window.location.href = 'index.html';
    }
});

// --- FUNÇÃO DE TROCA DE SALÃO (CORE) ---
function changeHallContext(hallId) {
    currentHallId = hallId;
    
    // Atualiza o Dropdown (caso a chamada venha de fora)
    hallSelector.value = currentHallId;

    // Atualiza a URL sem recarregar a página (para ficar bonito)
    const newUrl = new URL(window.location);
    newUrl.searchParams.set('salao', currentHallId);
    window.history.pushState({}, '', newUrl);

    // Atualiza os Links do Header
    if(linkLayout) linkLayout.href = `layout.html?salao=${currentHallId}`;
    if(linkMapa) linkMapa.href = `index.html?salao=${currentHallId}`;

    // Limpa listeners antigos para não misturar dados
    if (activeLayoutRef) off(activeLayoutRef);
    if (activeMesasRef) off(activeMesasRef);
    if (activeLogRef) off(activeLogRef);

    // Define o prefixo do banco
    let dbPrefix = ''; 
    if (currentHallId === 'douradus') {
        dbPrefix = 'saloes/douradus/';
    } else if (currentHallId === 'principal') {
        dbPrefix = ''; 
    }

    // Cria novas referências
    activeLayoutRef = ref(database, dbPrefix + 'layoutMesas');
    activeMesasRef = ref(database, dbPrefix + 'mesas');
    activeLogRef = ref(database, 'activityLog'); // Log é global, mas recarregamos para filtrar

    // Inicia o Dashboard com as novas referências
    loadDashboard(activeLayoutRef, activeMesasRef, activeLogRef);
}


function loadDashboard(layoutRef, mesasRef, activityLogRef) {
    let masterTableList = [];
    let currentSort = { column: 'numero', direction: 'asc' };
    let searchTerm = '';
    let layoutDataGlobal = {}; // Resetar dados
    let mesasDataGlobal = {}; // Resetar dados
    let statusChart = null;

    const totalArrecadadoEl = document.getElementById('total-arrecadado');
    const mesasVendidasEl = document.getElementById('mesas-vendidas');
    const mesasReservadasEl = document.getElementById('mesas-reservadas');
    const mesasLivresEl = document.getElementById('mesas-livres');
    const mesasTbodyEl = document.getElementById('mesas-tbody');
    const searchInput = document.getElementById('table-search-input');
    const tableHeaders = document.getElementById('table-headers');
    const activityLogListEl = document.getElementById('activity-log-list');
    const ctx = document.getElementById('statusChart').getContext('2d');

    // Função interna de atualização
    function updateUI() {
        let totalMesas = 0, countVendida = 0, countReservada = 0, totalArrecadado = 0;
        masterTableList = [];

        // 1. Constrói lista baseada no Layout Físico
        for (const colId in layoutDataGlobal) {
            (layoutDataGlobal[colId] || []).forEach(num => {
                masterTableList.push({ numero: parseInt(num), status: 'livre', nome: '---', preco: 0, pago: false });
            });
        }
        totalMesas = masterTableList.length;

        // 2. Cruza com dados de Vendas
        for (const mesaNum in mesasDataGlobal) {
            const mesaInfo = mesasDataGlobal[mesaNum];
            const mesaNaLista = masterTableList.find(m => m.numero == mesaNum);
            
            if (mesaNaLista) {
                Object.assign(mesaNaLista, {
                    status: mesaInfo.status,
                    nome: mesaInfo.nome || '---',
                    preco: parseFloat(mesaInfo.preco) || 0,
                    pago: mesaInfo.pago || false,
                });
            }

            // Conta estatísticas (apenas se a mesa estiver no layout ou decidimos contar todas do banco?)
            // Aqui contamos apenas se a mesa existe no layout desenhado para evitar fantasmas
            if (mesaNaLista) { 
                if (mesaInfo.status === 'vendida') {
                    countVendida++;
                    if (mesaInfo.pago) totalArrecadado += parseFloat(mesaInfo.preco) || 0;
                } else if (mesaInfo.status === 'reservada') {
                    countReservada++;
                }
            }
        }
        const countLivre = totalMesas - countVendida - countReservada;

        // Atualiza KPIs
        totalArrecadadoEl.textContent = `R$ ${totalArrecadado.toFixed(2).replace('.', ',')}`;
        mesasVendidasEl.textContent = countVendida;
        mesasReservadasEl.textContent = countReservada;
        mesasLivresEl.textContent = countLivre;

        // Atualiza Gráfico
        if (statusChart) {
            statusChart.data.datasets[0].data = [countLivre, countReservada, countVendida];
            statusChart.update();
        } else {
            statusChart = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['Livres', 'Reservadas', 'Vendidas'], datasets: [{ label: 'Status', data: [countLivre, countReservada, countVendida], backgroundColor: ['#28a745', '#ffc107', '#dc3545'], borderColor: '#fff', borderWidth: 2 }] },
                options: { responsive: true, maintainAspectRatio: true, plugins: { legend: { position: 'top' } } }
            });
        }
        renderTable();
    }

    function renderTable() {
        let filteredList = masterTableList;
        if (searchTerm) {
            const lowerCaseSearchTerm = searchTerm.toLowerCase();
            filteredList = masterTableList.filter(mesa =>
                mesa.numero.toString().includes(lowerCaseSearchTerm) ||
                mesa.status.toLowerCase().includes(lowerCaseSearchTerm) ||
                mesa.nome.toLowerCase().includes(lowerCaseSearchTerm)
            );
        }
        filteredList.sort((a, b) => {
            const valA = a[currentSort.column], valB = b[currentSort.column];
            let comparison = (valA > valB) ? 1 : (valA < valB) ? -1 : 0;
            return currentSort.direction === 'desc' ? comparison * -1 : comparison;
        });
        mesasTbodyEl.innerHTML = '';
        filteredList.forEach(mesa => {
            const row = document.createElement('tr');
            let statusPagamento = mesa.status === 'vendida' ? (mesa.pago ? 'Sim' : 'Não') : '---';
            row.innerHTML = `
                <td>${String(mesa.numero).padStart(2, '0')}</td>
                <td class="status-${mesa.status}">${mesa.status.charAt(0).toUpperCase() + mesa.status.slice(1)}</td>
                <td>${mesa.nome}</td>
                <td>${mesa.preco.toFixed(2).replace('.', ',')}</td>
                <td>${statusPagamento}</td>
            `;
            mesasTbodyEl.appendChild(row);
        });
        
        tableHeaders.querySelectorAll('th').forEach(th => {
            th.classList.remove('sorted-asc', 'sorted-desc');
            if (th.dataset.sort === currentSort.column) {
                th.classList.add(currentSort.direction === 'asc' ? 'sorted-asc' : 'sorted-desc');
            }
        });
    }

    // Remover listeners de eventos antigos (Search e Sort) para não duplicar
    // (Simplificação: como loadDashboard é chamado novamente, idealmente limpamos os listeners do DOM,
    // mas como inputs não mudam, apenas atualizamos a referência interna das funções)
    
    // Recriando elemento para limpar listeners antigos (maneira rápida e suja, mas eficaz)
    const newSearchInput = searchInput.cloneNode(true);
    searchInput.parentNode.replaceChild(newSearchInput, searchInput);
    newSearchInput.addEventListener('input', (e) => { searchTerm = e.target.value; renderTable(); });

    const newTableHeaders = tableHeaders.cloneNode(true);
    tableHeaders.parentNode.replaceChild(newTableHeaders, tableHeaders);
    newTableHeaders.addEventListener('click', (e) => {
        const column = e.target.dataset.sort;
        if (!column) return;
        if (currentSort.column === column) {
            currentSort.direction = currentSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
            currentSort.column = column;
            currentSort.direction = 'asc';
        }
        renderTable();
    });


    // LISTENERS DO BANCO DE DADOS
    onValue(layoutRef, (snapshot) => { layoutDataGlobal = snapshot.val() || {}; updateUI(); });
    onValue(mesasRef, (snapshot) => { mesasDataGlobal = snapshot.val() || {}; updateUI(); });
    
    // LOG DE ATIVIDADES (Filtrado pelo ID do Salão)
    onValue(query(activityLogRef, orderByChild('timestamp'), limitToLast(50)), (snapshot) => {
        activityLogListEl.innerHTML = '';
        if (!snapshot.exists()) { activityLogListEl.innerHTML = '<li><p>Nenhuma atividade registrada ainda.</p></li>'; return; }
        
        const logEntries = [];
        snapshot.forEach(childSnapshot => { logEntries.push(childSnapshot.val()); });
        
        const filteredLogs = logEntries.filter(entry => {
            const logSaloon = entry.saloonId || 'principal';
            if (currentHallId === 'principal') return logSaloon === 'principal';
            return logSaloon === currentHallId;
        });

        filteredLogs.reverse().forEach(entry => {
            const li = document.createElement('li');
            const actionClass = entry.action.split(' ')[0].toLowerCase(); 
            const iconLetter = entry.action.charAt(0);
            const date = new Date(entry.timestamp);
            const formattedDate = `${date.toLocaleDateString('pt-BR')} ${date.toLocaleTimeString('pt-BR', {hour: '2-digit', minute:'2-digit'})}`;
            
            li.innerHTML = `
                <div class="log-icon log-${actionClass}">${iconLetter}</div>
                <div class="log-details"><p>${entry.details}</p><p class="log-user">${entry.userEmail}</p></div>
                <span class="log-timestamp">${formattedDate}</span>
            `;
            activityLogListEl.appendChild(li);
        });
    });
}