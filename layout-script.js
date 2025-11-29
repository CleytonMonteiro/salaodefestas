import { initializeApp } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-app.js";
import { getDatabase, ref, onValue, set } from "https://www.gstatic.com/firebasejs/9.23.0/firebase-database.js";
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

const defaultLayout = {
  "col-cen-1": [67, 68, 69],"col-cen-2": [64, 65, 66],"col-cen-3": [61, 62, 63],"col-cen-4": [58, 59, 60],"col-cen-5": [55, 56, 57],"col-cen-6": [52, 53, 54],"col-cen-7": [49, 50, 51],"col-dir-1": [41, 42, 43, 44, 45, 46, 47, 48],"col-dir-2": [33, 34, 35, 36, 37, 38, 39, 40],"col-dir-3": [25, 26, 27, 28, 29, 30, 31, 32],"col-dir-4": [17, 18, 19, 20, 21, 22, 23, 24],"col-dir-5": [9, 10, 11, 12, 13, 14, 15, 16],"col-dir-6": [1, 2, 3, 4, 5, 6, 7, 8],"col-esq-1": [94, 95, 96, 97, 98, 99, 100, 101],"col-esq-2": [86, 87, 88, 89, 90, 91, 92, 93],"col-esq-3": [78, 79, 80, 81, 82, 83, 84, 85],"col-esq-4": [70, 71, 72, 73, 74, 75, 76, 77]
};

const app = initializeApp(firebaseConfig);
const database = getDatabase(app);
const auth = getAuth(app);

// --- LÓGICA DE SELEÇÃO DE SALÃO ---
const urlParams = new URLSearchParams(window.location.search);
const currentHallId = urlParams.get('salao');
let dbPrefix = ''; 

// Define a pasta do banco de dados baseada na URL
if (currentHallId === 'douradus') {
    dbPrefix = 'saloes/douradus/';
} else if (currentHallId === 'principal') {
    dbPrefix = ''; 
}

// Verifica se existe um salão selecionado na URL
const shouldLoadEditor = (currentHallId === 'principal' || currentHallId === 'douradus');
// Só cria a referência se tiver salão, para evitar erros
const layoutRef = shouldLoadEditor ? ref(database, dbPrefix + 'layoutMesas') : null;

// Função global para os botões do overlay chamarem
window.selectHall = function(hallId) {
    const url = new URL(window.location);
    url.searchParams.set('salao', hallId);
    window.location.href = url.toString();
};

document.addEventListener('DOMContentLoaded', () => {
    const hallSelectionOverlay = document.getElementById('hall-selection-overlay');
    const editorContainer = document.getElementById('editor-container');
    const deleteModeToggle = document.getElementById('delete-mode-toggle');
    const addColumnBtn = document.getElementById('add-column-btn');
    const addMesaBtn = document.getElementById('add-mesa-btn');
    const saveLayoutBtn = document.getElementById('save-layout-btn');
    const resetLayoutBtn = document.getElementById('reset-layout-btn');
    const backLink = document.getElementById('back-link');
    const editorTitle = document.getElementById('editor-title');

    // --- VERIFICAÇÃO INICIAL ---
    if (!shouldLoadEditor) {
        // Se não tem salão na URL, mostra o overlay de seleção
        if(hallSelectionOverlay) hallSelectionOverlay.style.display = 'flex';
        return; // Interrompe o restante do script
    } else {
        // Se já tem salão, configura o título
        const nomeSalao = currentHallId === 'douradus' ? "Douradu's" : "AABB";
        editorTitle.textContent = `Editando: Salão ${nomeSalao}`;
        
        // --- CORREÇÃO DO BOTÃO VOLTAR ---
        // Adiciona um evento de clique para forçar a navegação correta
        if (backLink) {
            backLink.addEventListener('click', (e) => {
                e.preventDefault(); // Evita comportamento padrão do href="#"
                window.location.href = `index.html?salao=${currentHallId}`;
            });
        }
    }

    let editableLayout = {};

    onAuthStateChanged(auth, (user) => { 
        if (!user) { 
            alert("Acesso negado. Faça login primeiro."); 
            window.location.href = `index.html?salao=${currentHallId || 'principal'}`; 
        }
    });

    function onDragEnd(evt) {
        const mesaNum = parseInt(evt.item.dataset.mesa);
        const fromColumnId = evt.from.dataset.column;
        const toColumnId = evt.to.dataset.column;

        const fromArray = editableLayout[fromColumnId];
        const fromIndex = fromArray.indexOf(mesaNum);
        if (fromIndex > -1) { fromArray.splice(fromIndex, 1); }

        const toArray = editableLayout[toColumnId];
        toArray.splice(evt.newDraggableIndex, 0, mesaNum);
    }

    function renderEditor() {
        editorContainer.innerHTML = '';
        const getColumnWeight = (columnId) => {
            if (columnId.startsWith('col-esq')) return 1;
            if (columnId.startsWith('col-cen')) return 2;
            if (columnId.startsWith('col-dir')) return 3;
            return 4;
        };

        const sortedColumnKeys = Object.keys(editableLayout).sort((a, b) => {
            const weightA = getColumnWeight(a);
            const weightB = getColumnWeight(b);
            if (weightA !== weightB) { return weightA - weightB; }
            return a.localeCompare(b);
        });

        sortedColumnKeys.forEach(columnId => {
            const columnData = editableLayout[columnId] || [];
            const columnDiv = document.createElement('div');
            columnDiv.className = 'layout-column';
            columnDiv.dataset.column = columnId;
            columnDiv.innerHTML = `<h3>${columnId} <button class="remove-column-btn" data-column="${columnId}">X</button></h3>`;
            
            const mesasListDiv = document.createElement('div');
            mesasListDiv.className = 'mesas-list';
            mesasListDiv.dataset.column = columnId;
            
            if (Array.isArray(columnData)) {
                columnData.forEach(mesaNum => {
                    const mesaItemDiv = document.createElement('div');
                    mesaItemDiv.className = 'mesa-item';
                    mesaItemDiv.dataset.mesa = mesaNum;
                    mesaItemDiv.innerHTML = `<span>${mesaNum}</span><button class="remove-mesa-btn" data-column="${columnId}" data-mesa="${mesaNum}">-</button>`;
                    mesasListDiv.appendChild(mesaItemDiv);
                });
            }
            
            columnDiv.appendChild(mesasListDiv);
            editorContainer.appendChild(columnDiv);

            new Sortable(mesasListDiv, { group: 'shared-mesas', animation: 150, ghostClass: 'sortable-ghost', onEnd: onDragEnd });
        });
    }

    onValue(layoutRef, (snapshot) => {
        let dataFromDB = {};
        if (snapshot.exists() && Object.keys(snapshot.val()).length > 0) {
            dataFromDB = snapshot.val();
        } else {
            // Se estiver vazio (novo salão), inicia objeto vazio
            dataFromDB = {}; 
        }

        editableLayout = {};
        for (const columnId in dataFromDB) {
            const columnData = dataFromDB[columnId];
            if (Array.isArray(columnData)) {
                editableLayout[columnId] = columnData;
            } else if (typeof columnData === 'object' && columnData !== null) {
                editableLayout[columnId] = Object.values(columnData);
            } else {
                editableLayout[columnId] = [];
            }
        }
        renderEditor();
    });

    deleteModeToggle.addEventListener('change', (e) => { document.body.classList.toggle('delete-mode-active', e.target.checked); });
    addColumnBtn.addEventListener('click', () => {
        const columnName = prompt("Digite o nome da nova coluna (ex: col-esq-3, palco, etc.):");
        if (columnName && !editableLayout[columnName]) {
            editableLayout[columnName] = [];
            renderEditor();
        } else if (editableLayout[columnName]) {
            alert("Erro: Já existe uma coluna com este nome.");
        }
    });
    
    addMesaBtn.addEventListener('click', () => {
        const columnOptions = Object.keys(editableLayout).sort().join(', ');
        if(!columnOptions) { alert("Crie uma coluna primeiro."); return; }
        
        const columnId = prompt(`Em qual coluna você quer adicionar a mesa?\nOpções: ${columnOptions}`);
        if (!columnId || !editableLayout[columnId]) {
            alert("Nome de coluna inválido ou não encontrado.");
            return;
        }
        const mesaNum = parseInt(prompt(`Digite o número da nova mesa para a coluna ${columnId}:`));
        if (mesaNum) {
             if (Object.values(editableLayout).flat().includes(mesaNum)) {
                alert("Erro: Este número de mesa já existe em outra coluna.");
                return;
            }
            editableLayout[columnId].push(mesaNum);
            renderEditor();
        } else {
            alert("Número de mesa inválido.");
        }
    });

    resetLayoutBtn.addEventListener('click', () => {
        if (confirm("Tem certeza? Isso apagará o desenho atual e carregará o modelo padrão.")) {
            editableLayout = JSON.parse(JSON.stringify(defaultLayout));
            renderEditor();
        }
    });

    editorContainer.addEventListener('click', (e) => {
        const target = e.target;
        if (target.classList.contains('remove-mesa-btn')) {
            const columnId = target.dataset.column;
            const mesaNum = parseInt(target.dataset.mesa);
            if (editableLayout[columnId] && Array.isArray(editableLayout[columnId])) {
                const mesaIndex = editableLayout[columnId].indexOf(mesaNum);
                if (mesaIndex > -1) {
                    editableLayout[columnId].splice(mesaIndex, 1);
                    renderEditor();
                }
            }
        }
        if (target.classList.contains('remove-column-btn')) {
            const columnId = target.dataset.column;
            if (confirm(`Tem certeza que deseja excluir a coluna "${columnId}" e todas as suas mesas?`)) {
                delete editableLayout[columnId];
                renderEditor();
            }
        }
    });

    saveLayoutBtn.addEventListener('click', () => {
        const nomeSalao = currentHallId === 'douradus' ? "Douradu's" : "AABB";
        if(confirm(`Salvar layout para o salão ${nomeSalao}? Isso substituirá o layout online.`)) {
            for(const columnId in editableLayout) {
                if(editableLayout[columnId].length === 0) {
                    delete editableLayout[columnId];
                }
            }
            set(layoutRef, editableLayout)
                .then(() => alert("Layout salvo com sucesso!"))
                .catch((err) => alert("Erro ao salvar: " + err.message));
        }
    });
});