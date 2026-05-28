/* ============================================================
   EditMind — js/app.js  v5.0
   - Múltiplos recortes com foco/duração
   - YouTube + TikTok via endpoints genéricos
   - Download real via backend
   - UX refinada: hover apenas em controles clicáveis
   ============================================================ */

const API = window.CONFIG?.API_URL ?? '';
const TIMEOUT = 3 * 60 * 1000;

const $ = id => document.getElementById(id);

const painelUpload = $('painel-upload');
const painelIa = $('painel-ia');
const areaSoltar = $('area-soltar');
const entrada = $('entrada-arquivo');
const nomeArq = $('nome-arquivo');
const barraP = $('barra-progresso');
const porcT = $('porcentagem-envio');
const msgT = $('mensagem-envio');
const metaRes = $('meta-res');
const metaFps = $('meta-fps');
const metaDur = $('meta-duracao');
const txtTransc = $('texto-transcricao');
const corteIni = $('corte-inicio');
const corteFim = $('corte-fim');
const corteMot = $('corte-motivo');
const conteudosLista = $('conteudos-lista');
const conteudosEmptyTemplate = $('conteudos-empty-template');
const conteudosFeedback = $('conteudos-feedback');
const quantidadeRecortes = $('quantidade-recortes');
const recortesConfig = $('recortes-config');
const formatoVertical = $('formato-vertical');
const conteudosCount = $('conteudos-count');
const btnSelectAll = $('btn-select-all');
const btnClearSelection = $('btn-clear-selection');
const btnDownloadSelected = $('btn-download-selected');
const btnDeleteSelected = $('btn-delete-selected');
const profileNome = $('profile-nome');
const profileEmail = $('profile-email');
const profileSenha = $('profile-senha');
const profileFeedback = $('profile-feedback');

window.ultimoResultado = null;
window.previewSelecionados = new Set();
window.meusCortes = [];
window.projetosConteudo = [];
window.selectedCortes = new Set();
window.projetoAtualId = null;

const FOCOS = [
    'Livre', 'Humor', 'Terror', 'Emocionante', 'Triste',
    'Polêmico', 'Educativo', 'Impactante', 'Motivacional', 'Surpreendente'
];

const DURACOES = [
    { value: '5s', label: '5s' },
    { value: '10s', label: '10s' },
    { value: '15s', label: '15s' },
    { value: '30s', label: '30s' },
];

const PRESET_PARA_DURACAO = {
    '<30s': '10s',
    '30s-60s': '15s',
    '>60s': '30s',
};

const DURACAO_PARA_PRESET = {
    '5s': '<30s',
    '10s': '<30s',
    '15s': '30s-60s',
    '30s': '>60s',
};

let engineDuracaoPadrao = '10s';
let _iv = null;
let _t0 = null;

// ── INIT ──────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    if (!window.Auth?.estaLogado()) {
        window.location.href = 'login.html';
        return;
    }

    const u = window.Auth.getUsuario();
    const el = $('user-nome');
    if (el && u) el.textContent = u.nome || u.email?.split('@')[0] || 'Usuário';

    const logoutFn = () => window.Auth.logout();
    $('btn-logout')?.addEventListener('click', logoutFn);
    $('btn-logout-mobile')?.addEventListener('click', logoutFn);

    const toggle = $('navToggle'), nav = $('btnNav');
    if (toggle && nav) {
        const syncNavA11y = () => toggle.setAttribute('aria-expanded', String(nav.classList.contains('open')));

        toggle.addEventListener('click', e => {
            e.stopPropagation();
            nav.classList.toggle('open');
            syncNavA11y();
        });

        document.addEventListener('click', e => {
            if (!nav.contains(e.target)) {
                nav.classList.remove('open');
                syncNavA11y();
            }
        });

        nav.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', () => {
                nav.classList.remove('open');
                syncNavA11y();
            });
        });

        window.addEventListener('resize', () => {
            if (window.innerWidth >= 769) {
                nav.classList.remove('open');
                syncNavA11y();
            }
        });

        document.addEventListener('keydown', e => {
            if (e.key === 'Escape') {
                nav.classList.remove('open');
                syncNavA11y();
            }
        });

        syncNavA11y();
    }

    quantidadeRecortes?.addEventListener('change', renderRecortesConfig);
    renderRecortesConfig();

    document.querySelectorAll('.engine-card[data-duration], .engine-card[data-preset]').forEach(card => {
        card.addEventListener('click', () => selecionarEnginePreset(card));
    });

    btnSelectAll?.addEventListener('click', selecionarTodosCortes);
    btnClearSelection?.addEventListener('click', limparSelecaoCortes);
    btnDownloadSelected?.addEventListener('click', baixarSelecionadosZip);
    btnDeleteSelected?.addEventListener('click', excluirSelecionados);

    carregarPerfil();
    $('form-profile-nome')?.addEventListener('submit', salvarNomePerfil);
    $('form-profile-email')?.addEventListener('submit', salvarEmailPerfil);
    $('form-profile-senha')?.addEventListener('submit', salvarSenhaPerfil);
});

// ── ENGINE PRESETS ───────────────────────────────────────────
function normalizarPresetEngine(valor) {
    if (!valor) return '10s';
    const v = String(valor).trim();
    if (PRESET_PARA_DURACAO[v]) return PRESET_PARA_DURACAO[v];
    return DURACOES.some(d => d.value === v) ? v : '10s';
}

window.selecionarEnginePreset = function (card) {
    if (!card) return;
    const valor = card.getAttribute('data-preset') || card.getAttribute('data-duration') || '10s';
    engineDuracaoPadrao = normalizarPresetEngine(valor);

    document.querySelectorAll('.engine-card[data-duration], .engine-card[data-preset]').forEach(c => {
        c.classList.remove('active', 'selected');
    });
    card.classList.add('selected', 'active');

    document.querySelectorAll('.recorte-duracao').forEach(select => {
        select.value = engineDuracaoPadrao;
    });
};

// ── AUTH HELPERS ─────────────────────────────────────────────
function getAuthToken() {
    return localStorage.getItem(window.CONFIG?.TOKEN_KEY || 'editmind_token') || window.Auth?.getToken?.() || null;
}

function getAuthHeaders(extra = {}) {
    const token = getAuthToken();
    return {
        ...extra,
        ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    };
}

// ── CONFIGURAÇÃO DE RECORTES ─────────────────────────────────
function renderRecortesConfig() {
    if (!recortesConfig) return;
    const qtd = Math.max(1, Math.min(2, Number(quantidadeRecortes?.value || 1)));
    const html = Array.from({ length: qtd }, (_, i) => {
        const n = i + 1;
        return `
            <div class="recorte-config-item" data-recorte-index="${n}">
                <div class="recorte-config-title">Recorte ${n}</div>
                <div class="recorte-config-grid">
                    <div>
                        <label class="input-label">Duração</label>
                        <select class="input-field select-field recorte-duracao" data-recorte-duration="${n}">
                            ${DURACOES.map(d => `<option value="${d.value}" ${d.value === engineDuracaoPadrao ? 'selected' : ''}>${d.label}</option>`).join('')}
                        </select>
                    </div>
                    <div>
                        <label class="input-label">Foco do Gancho</label>
                        <select class="input-field select-field recorte-foco" data-recorte-focus="${n}">
                            ${FOCOS.map(f => `<option value="${f}">${f}</option>`).join('')}
                        </select>
                    </div>
                </div>
            </div>
        `;
    }).join('');
    recortesConfig.innerHTML = html;
}

function coletarConfigProcessamento() {
    const qtd = Math.max(1, Math.min(2, Number(quantidadeRecortes?.value || 1)));
    const cortes = [];
    for (let i = 1; i <= qtd; i++) {
        cortes.push({
            duracao_tipo: document.querySelector(`[data-recorte-duration="${i}"]`)?.value || engineDuracaoPadrao,
            foco: document.querySelector(`[data-recorte-focus="${i}"]`)?.value || 'Livre',
        });
    }
    return {
        cortes,
        formato_vertical: Boolean(formatoVertical?.checked),
    };
}

// ── TIMER ─────────────────────────────────────────────────────
function startTimer() {
    _t0 = Date.now();
    _iv = setInterval(() => {
        const s = Math.floor((Date.now() - _t0) / 1000);
        const el = $('timer-display');
        if (el) el.textContent = `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
    }, 1000);
}

function stopTimer() {
    clearInterval(_iv);
    _iv = null;
    const e = _t0 ? Math.floor((Date.now() - _t0) / 1000) : 0;
    _t0 = null;
    return e;
}

// ── UI HELPERS ────────────────────────────────────────────────
function pct(v) {
    if (barraP) barraP.style.width = v + '%';
    if (porcT) porcT.textContent = v + '%';
}

function msg(html, cor = '#6b7280') {
    if (!msgT) return;
    msgT.innerHTML = html;
    msgT.style.color = cor;
}

function animCard(el, val) {
    if (!el) return;
    el.style.transition = 'none';
    el.style.opacity = '0';
    el.style.transform = 'translateY(6px)';
    el.textContent = val;
    requestAnimationFrame(() => requestAnimationFrame(() => {
        el.style.transition = 'opacity .4s ease, transform .4s ease';
        el.style.opacity = '1';
        el.style.transform = 'translateY(0)';
    }));
}

function resetUI() {
    pct(0);
    msg('Engine pronta para receber seu projeto.');
    if (barraP) barraP.style.background = '';
    if (nomeArq) nomeArq.textContent = 'Aguardando feed...';
    if (metaRes) metaRes.textContent = '—';
    if (metaFps) metaFps.textContent = '—';
    if (metaDur) metaDur.textContent = '—';
    if (entrada) entrada.value = '';
    const te = $('timer-display');
    if (te) te.textContent = '00:00';
}

function escaparHtml(texto) {
    return String(texto ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function montarUrlVideo(videoUrl) {
    if (!videoUrl) return '#';
    return videoUrl.startsWith('http') ? videoUrl : `${API}${videoUrl}`;
}

function formatarDataPtBR(isoString) {
    if (!isoString) return 'Data indisponível';
    const data = new Date(isoString);
    if (Number.isNaN(data.getTime())) return 'Data inválida';
    return data.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function duracaoLabel(tipo) {
    return DURACOES.find(d => d.value === tipo)?.label || tipo || '—';
}

// ── DRAG & DROP ───────────────────────────────────────────────
if (areaSoltar) {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(e =>
        areaSoltar.addEventListener(e, ev => { ev.preventDefault(); ev.stopPropagation(); }));
    ['dragenter', 'dragover'].forEach(e =>
        areaSoltar.addEventListener(e, () => {
            areaSoltar.style.borderColor = '#f97316';
            areaSoltar.style.background = 'rgba(249,115,22,0.06)';
        }));
    ['dragleave', 'drop'].forEach(e =>
        areaSoltar.addEventListener(e, () => {
            areaSoltar.style.borderColor = '';
            areaSoltar.style.background = '';
        }));
    areaSoltar.addEventListener('drop', e => processar(e.dataTransfer.files));
}
if (entrada) entrada.addEventListener('change', e => processar(e.target.files));

// ── PIPELINE PRINCIPAL ────────────────────────────────────────
async function processar(arquivos) {
    if (!arquivos?.length) return;
    const arq = arquivos[0];
    const ext = arq.name.split('.').pop().toLowerCase();
    if (!['mp4', 'mov', 'avi', 'webm'].includes(ext)) {
        alert('Aceito apenas: mp4, mov, avi, webm.');
        return;
    }

    const config = coletarConfigProcessamento();
    await _executar(async (ctrl) => {
        const form = new FormData();
        form.append('file', arq);
        form.append('cortes_config', JSON.stringify(config));
        form.append('formato_vertical', String(config.formato_vertical));
        if (nomeArq) nomeArq.textContent = arq.name;
        return fetch(`${API}/api/processar`, {
            method: 'POST',
            headers: getAuthHeaders(),
            body: form,
            signal: ctrl.signal,
        });
    });
}

// ── PROCESSAR LINKS ──────────────────────────────────────────
async function processarLinkGenerico(inputId, btnId, nomeFonte) {
    const input = $(inputId);
    const btn = $(btnId);
    const link = input?.value.trim();
    if (!link) {
        alert(`Insira um link válido do ${nomeFonte}.`);
        return;
    }

    mudarAba('inicio');
    if (nomeArq) nomeArq.textContent = link;
    if (btn) { btn.disabled = true; btn.textContent = 'Processando...'; }

    const config = coletarConfigProcessamento();
    try {
    await _executar(async (ctrl) =>
        fetch(`${API}/api/processar-link`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ url: link, config }),
            signal: ctrl.signal,
        })
    );

    } finally {
        if (btn) { btn.textContent = 'Processar'; btn.disabled = false; }
        if (input) input.value = '';
    }
}

window.processarYouTube = () => processarLinkGenerico('input-youtube', 'btn-yt-processar', 'YouTube');
window.processarTikTok = () => processarLinkGenerico('input-tiktok', 'btn-tt-processar', 'TikTok');

window.processarLink = function (plataforma) {
    const p = String(plataforma || '').toLowerCase();
    if (p === 'youtube') return window.processarYouTube();
    if (p === 'tiktok') return window.processarTikTok();
    alert('Plataforma não suportada.');
};

async function baixarLinkGenerico(inputId, btnId, nomeArquivo = 'Video_EditMind.mp4') {
    const input = $(inputId);
    const btn = $(btnId);
    const link = input?.value.trim();
    if (!link) {
        alert('Insira um link válido.');
        return;
    }
    if (btn) { btn.disabled = true; btn.textContent = 'Baixando...'; }

    try {
        const res = await fetch(`${API}/api/download-link`, {
            method: 'POST',
            headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ url: link }),
            signal: AbortSignal.timeout(300_000),
        });
        if (!res.ok) {
            const e = await res.json().catch(() => ({}));
            throw new Error(e.detail || `Erro ${res.status}`);
        }
        const blob = await res.blob();
        baixarBlob(blob, nomeArquivo);
        if (btn) btn.textContent = 'Concluído';
        if (input) input.value = '';
        setTimeout(() => { if (btn) { btn.textContent = 'Baixar MP4'; btn.disabled = false; } }, 2500);
    } catch (e) {
        alert('Erro: ' + (e.message || 'Falha no download.'));
        if (btn) { btn.textContent = 'Baixar MP4'; btn.disabled = false; }
    }
}

window.baixarYouTube = () => baixarLinkGenerico('input-youtube', 'btn-yt-baixar', 'Video_YouTube_EditMind.mp4');
window.baixarTikTok = () => baixarLinkGenerico('input-tiktok', 'btn-tt-baixar', 'Video_TikTok_EditMind.mp4');

window.baixarLink = function (plataforma) {
    const p = String(plataforma || '').toLowerCase();
    if (p === 'youtube') return window.baixarYouTube();
    if (p === 'tiktok') return window.baixarTikTok();
    alert('Plataforma não suportada.');
};

// ── EXECUTOR GENÉRICO ─────────────────────────────────────────
async function _executar(fetchFn) {
    if (barraP) barraP.style.background = 'linear-gradient(to right,#f97316,#facc15)';
    startTimer();

    const etapas = [
        { p: 10, m: 'Enviando para o servidor...', d: 0 },
        { p: 25, m: 'FFmpeg extraindo áudio...', d: 5000 },
        { p: 50, m: 'Whisper transcrevendo...', d: 12000 },
        { p: 70, m: 'IA avaliando o vídeo inteiro...', d: 22000 },
        { p: 85, m: 'Selecionando recortes por foco...', d: 32000 },
        { p: 93, m: 'Renderizando os cortes...', d: 42000 },
    ];
    const tids = etapas.map(({ p, m, d }) => setTimeout(() => { pct(p); msg(m); }, d));

    const ctrl = new AbortController();
    const tId = setTimeout(() => ctrl.abort(), TIMEOUT);

    try {
        const res = await fetchFn(ctrl);
        clearTimeout(tId); tids.forEach(clearTimeout);
        const data = await res.json();
        const elapsed = stopTimer();

        if (!res.ok) {
            if (res.status === 401) { window.Auth.logout(); return; }
            throw new Error(data.detail || `Erro ${res.status}`);
        }

        const infos = data.detalhes_tecnicos || {};
        animCard(metaRes, infos.resolucao || 'N/A');
        animCard(metaFps, infos.fps ? `${infos.fps} FPS` : 'N/A');
        animCard(metaDur, infos.duracao_segundos ? `${infos.duracao_segundos}s` : 'N/A');

        pct(100);
        window.ultimoResultado = { ...data, elapsed };

        const mm = String(Math.floor(elapsed / 60)).padStart(2, '0');
        const ss = String(elapsed % 60).padStart(2, '0');
        msg(`
            <div style="display:flex;flex-direction:column;gap:10px;margin-top:10px;">
                <span style="font-size:11px;color:#22c55e;font-weight:700;">Concluído em ${mm}:${ss}</span>
                <button onclick="mostrarResultado()" class="btn-inline-result">Ver Relatório da IA</button>
            </div>`, '#22c55e');
    } catch (err) {
        clearTimeout(tId); tids.forEach(clearTimeout); stopTimer();
        const m_ = err.name === 'AbortError'
            ? 'Timeout: processamento demorou mais de 5 minutos.'
            : `${err.message || 'Erro desconhecido.'}`;
        msg(m_, '#ef4444');
        if (barraP) barraP.style.background = '#ef4444';
        setTimeout(resetUI, 6000);
    }
}

// ── PAINEL DE RESULTADO ───────────────────────────────────────
window.mostrarResultado = function () {
    if (window.ultimoResultado) exibirResultado(window.ultimoResultado);
};

function exibirResultado(data) {
    if (painelUpload) painelUpload.classList.add('hidden');
    if (painelIa) painelIa.classList.remove('hidden', 'fade-out');

    if (txtTransc) txtTransc.textContent = data.transcricao || '—';

    const cortes = Array.isArray(data.cortes) && data.cortes.length ? data.cortes : [{
        ...data.corte_sugerido,
        url_corte: data.url_corte,
        storage: data.storage,
        foco: 'Livre',
        duracao_tipo: '10s'
    }];

    const primeiro = cortes[0] || {};
    if (corteIni) corteIni.textContent = primeiro.inicio || '00:00:00';
    if (corteFim) corteFim.textContent = primeiro.fim || '00:00:00';
    if (corteMot) corteMot.textContent = primeiro.motivo || '—';

    const inf = data.detalhes_tecnicos || {};
    const em = $('ia-meta-info');
    if (em && inf.resolucao) em.textContent = `${inf.resolucao} • ${inf.fps} FPS • ${inf.duracao_segundos}s`;
    if (data.elapsed !== undefined) {
        const tp = $('tempo-processamento');
        if (tp) tp.textContent = `Processado em ${String(Math.floor(data.elapsed / 60)).padStart(2, '0')}:${String(data.elapsed % 60).padStart(2, '0')}`;
    }

    const area = $('area-download');
    if (!area) return;
    area.innerHTML = cortes.map((corte, idx) => renderCorteResultado(corte, idx)).join('') + '<div class="result-btns"><button type="button" id="btn-confirmar-cortes" class="btn-upload">Salvar cortes selecionados</button></div>';
}

function renderCorteResultado(corte, idx) {
    const urlCorte = montarUrlVideo(corte.url_corte || corte.video_url);
    const storageTag = corte.storage === 'supabase'
        ? '<span class="storage-chip storage-ok">Supabase Storage</span>'
        : '<span class="storage-chip storage-local">Servidor local</span>';
    const titulo = `Recorte ${corte.index || idx + 1}`;
    return `
        <article class="resultado-corte-card">
            <div class="resultado-corte-head">
                <strong>${titulo}</strong>
                ${storageTag}
            </div>
            <video src="${urlCorte}" controls preload="metadata" class="video-result-player" playsinline></video>
            <div class="resultado-meta-grid">
                <span>Início: <b>${escaparHtml(corte.inicio || '—')}</b></span>
                <span>Fim: <b>${escaparHtml(corte.fim || '—')}</b></span>
                <span>Duração: <b>${escaparHtml(String(corte.duracao_segundos || '—'))}s</b></span>
                <span>Foco: <b>${escaparHtml(corte.foco || 'Livre')}</b></span>
            </div>
            <p class="resultado-motivo">${escaparHtml(corte.motivo || 'Trecho viral identificado.')}</p>
            <div class="result-btns">
                <button type="button" class="btn-assistir btn-play-inline">Assistir</button>
                <label><input type="checkbox" class="preview-select" data-index="${corte.index || idx+1}" checked> Salvar</label>
                <button type="button" class="btn-download btn-download-video" data-url="${urlCorte}">Baixar MP4</button>
            </div>
        </article>
    `;
}

window.resetarNovoCorte = function () {
    if (painelIa) painelIa.classList.add('fade-out');
    setTimeout(() => {
        if (painelIa) { painelIa.classList.add('hidden'); painelIa.classList.remove('fade-out'); }
        if (painelUpload) painelUpload.classList.remove('hidden');
        resetUI();
        window.ultimoResultado = null;
window.previewSelecionados = new Set();
    }, 400);
};

// ── DOWNLOAD REAL DOS RECORTES ────────────────────────────────
function baixarBlob(blob, filename) {
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
}

async function baixarArquivoVideo(urlVideo, botaoRef = null) {
    if (!urlVideo || urlVideo === '#') {
        alert('Não foi possível identificar a URL do vídeo para download.');
        return;
    }
    const btn = botaoRef || null;
    const textoOriginal = btn ? btn.textContent : '';
    if (btn) { btn.disabled = true; btn.textContent = 'Baixando...'; }
    try {
        const endpoint = `${API}/api/cortes/download?video_url=${encodeURIComponent(urlVideo)}`;
        const res = await fetch(endpoint, { method: 'GET', headers: getAuthHeaders() });
        if (!res.ok) throw new Error(`Falha no download (${res.status}).`);
        const blob = await res.blob();
        baixarBlob(blob, 'Corte_EditMind.mp4');
    } catch (err) {
        console.error('[EditMind] Erro ao baixar vídeo:', err);
        alert('Não foi possível baixar o vídeo agora. Tente novamente em instantes.');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = textoOriginal || 'Baixar MP4'; }
    }
}
window.baixarArquivoVideo = baixarArquivoVideo;

// ── ABAS ──────────────────────────────────────────────────────
window.mudarAba = function (id) {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.section').forEach(s => s.classList.remove('active'));
    document.querySelector(`.nav-item[data-aba="${id}"]`)?.classList.add('active');
    $(`aba-${id}`)?.classList.add('active');
    if (id === 'conteudos') carregarMeusConteudos();
};

// ── MEUS CONTEÚDOS ────────────────────────────────────────────
function renderEmptyStateConteudos() {
    if (!conteudosLista || !conteudosEmptyTemplate) return;
    conteudosLista.innerHTML = conteudosEmptyTemplate.innerHTML;
}

function setConteudosFeedback(texto, tipo = 'erro') {
    if (!conteudosFeedback) return;
    conteudosFeedback.textContent = texto || '';
    conteudosFeedback.style.color = tipo === 'erro' ? '#ef4444' : '#22c55e';
}

function renderConteudos(cortes) {
    if (!conteudosLista) return;
    window.meusCortes = Array.isArray(cortes) ? cortes : [];
    if (window.meusCortes.length === 0) {
        renderEmptyStateConteudos();
        limparSelecaoCortes();
        return;
    }
    limparSelecaoCortes();

    const agrupar = new Map();
    window.meusCortes.forEach((c) => {
        const pid = c.project_id || 'sem-projeto';
        if (!agrupar.has(pid)) agrupar.set(pid, []);
        agrupar.get(pid).push(c);
    });
    window.projetosConteudo = Array.from(agrupar.entries()).map(([project_id, clips]) => ({ project_id, clips }));
    renderListaProjetos();
}

function renderProjetos(projetos) {
    if (!conteudosLista) return;
    const lista = Array.isArray(projetos) ? projetos : [];
    window.projetosConteudo = lista.map((p) => ({
        ...p,
        project_id: p.project_id || p.id || 'sem-projeto',
        clips: Array.isArray(p.cuts) ? p.cuts : (Array.isArray(p.clips) ? p.clips : []),
    }));
    window.meusCortes = window.projetosConteudo.flatMap(p => p.clips || []);
    if (!window.projetosConteudo.length) {
        renderEmptyStateConteudos();
        limparSelecaoCortes();
        return;
    }
    limparSelecaoCortes();
    renderListaProjetos();
}

function renderListaProjetos() {
    if (!conteudosLista) return;
    window.projetoAtualId = null;
    if (!window.projetosConteudo.length) return renderEmptyStateConteudos();
    conteudosLista.innerHTML = window.projetosConteudo.map((projeto) => {
        const primeiro = projeto.clips[0] || {};
        const titulo = escaparHtml(projeto.original_title || primeiro.titulo || `Projeto ${projeto.project_id}`);
        const dataFmt = formatarDataPtBR(projeto.created_at || primeiro.criado_em);
        const status = projeto.status || primeiro.status || 'concluido';
        const preview = montarUrlVideo(projeto.thumbnail_url || primeiro.video_url || '');
        const totalClips = Number(projeto.clips_count ?? projeto.clips?.length ?? 0);
        const duracao = projeto.duration_seconds ? `${Number(projeto.duration_seconds).toFixed(1)}s` : 'indisponivel';
        return `
            <article class="tool-bentoCard conteudo-card">
                <h3 class="tool-title conteudo-title">${titulo}</h3>
                <p class="tool-description conteudo-date">Criado em: ${dataFmt}</p>
                <p class="conteudo-tags">Clipes: <b>${totalClips}</b> &middot; Duração: <b>${escaparHtml(duracao)}</b> &middot; Status: <b>${escaparHtml(status)}</b></p>
                ${preview ? `<video src="${preview}" controls preload="metadata" class="conteudo-video"></video>` : ''}
                <div class="result-btns"><button type="button" class="btn-assistir btn-open-project" data-project-id="${escaparHtml(projeto.project_id)}">Abrir projeto</button></div>
            </article>
        `;
    }).join('');
}

async function renderCortesProjeto(projectId) {
    let projeto = window.projetosConteudo.find(p => p.project_id === projectId);
    try {
        const res = await fetch(`${API}/api/projetos/${encodeURIComponent(projectId)}`, { headers: getAuthHeaders() });
        const data = await res.json().catch(() => ({}));
        if (res.status === 401) { window.Auth.logout(); return; }
        if (res.ok && data?.sucesso && data.projeto) {
            projeto = {
                ...data.projeto,
                project_id: data.projeto.project_id || projectId,
                clips: Array.isArray(data.projeto.cuts) ? data.projeto.cuts : [],
            };
            const idx = window.projetosConteudo.findIndex(p => p.project_id === projectId);
            if (idx >= 0) window.projetosConteudo[idx] = projeto;
        }
    } catch (err) {
        console.warn('[EditMind] Fallback para projeto em memória:', err);
    }
    if (!projeto) return;
    window.projetoAtualId = projectId;
    window.meusCortes = projeto.clips || [];
    limparSelecaoCortes();
    const headerProjeto = `<div class="result-btns"><button type="button" class="btn-secondary-lite" id="btn-voltar-projetos">← Voltar para projetos</button></div>`;
    if (!projeto.clips?.length) {
        conteudosLista.innerHTML = `${headerProjeto}
            <div class="tool-bentoCard empty-state">
                <h3 class="upload-title">Projeto sem clipes salvos</h3>
                <p class="upload-subtitle">Salve os recortes gerados para que eles apareçam aqui.</p>
            </div>`;
        return;
    }
    conteudosLista.innerHTML = headerProjeto + projeto.clips.map((corte) => {
        const titulo = escaparHtml(corte.titulo || 'Sem título');
        const dataFmt = formatarDataPtBR(corte.criado_em);
        const urlVideo = montarUrlVideo(corte.video_url);
        const corteId = escaparHtml(corte.id || '');
        const foco = escaparHtml(corte.foco || 'Livre');
        const duracaoTipo = escaparHtml(duracaoLabel(corte.duracao_tipo));
        return `
            <article class="tool-bentoCard conteudo-card" data-corte-id="${corteId}">
                <label class="conteudo-select-wrap"><input type="checkbox" class="conteudo-select" data-corte-id="${corteId}"><span class="conteudo-check-ui"></span><span>Selecionar</span></label>
                <video src="${urlVideo}" controls preload="metadata" class="conteudo-video"></video>
                <h3 class="tool-title conteudo-title">${titulo}</h3>
                <p class="tool-description conteudo-date">Criado em: ${dataFmt}</p>
                <p class="conteudo-tags">Foco: <b>${foco}</b> · Duração: <b>${duracaoTipo}</b></p>
                <div class="result-btns">
                    <a href="${urlVideo}" target="_blank" rel="noopener noreferrer" class="btn-assistir">Abrir vídeo</a>
                    <button type="button" class="btn-download btn-download-video" data-url="${urlVideo}">Baixar</button>
                    <button type="button" class="btn-excluir-corte" data-corte-id="${corteId}">Excluir</button>
                    <button type="button" class="btn-secondary-lite btn-editar-corte" data-corte-id="${corteId}" data-url="${urlVideo}">Editar</button>
                </div>
            </article>
        `;
    }).join('');
}

function abrirModalEdicao(corteId, urlVideo) {
    const html = `
    <div id="edit-modal" style="position:fixed;inset:0;background:rgba(0,0,0,.7);z-index:9999;display:flex;align-items:center;justify-content:center;padding:16px;">
      <div style="background:#111827;border:1px solid #374151;border-radius:12px;max-width:760px;width:100%;padding:16px;color:#fff;">
        <h3>Editar clipe</h3>
        <video id="edit-video" src="${urlVideo}" controls style="width:100%;border-radius:8px;margin:8px 0;"></video>
        <div style="display:flex;gap:8px;flex-wrap:wrap;">
          <input id="edit-start" type="number" min="0" step="0.1" placeholder="Início (s)">
          <input id="edit-end" type="number" min="0" step="0.1" placeholder="Fim (s)">
          <input id="edit-remove-start" type="number" min="0" step="0.1" placeholder="Remover de (s)">
          <input id="edit-remove-end" type="number" min="0" step="0.1" placeholder="Remover até (s)">
        </div>
        <p id="edit-duration">Duração estimada: 0.0s</p>
        <div class="result-btns"><button id="edit-save" class="btn-download">Salvar nova versão</button><button id="edit-close" class="btn-excluir-corte">Fechar</button></div>
      </div></div>`;
    document.body.insertAdjacentHTML('beforeend', html);
    const modal = $('edit-modal'), video = $('edit-video'), iStart = $('edit-start'), iEnd = $('edit-end');
    const iRemoveStart = $('edit-remove-start'), iRemoveEnd = $('edit-remove-end');
    const calc = () => {
        let d = Math.max(0, (Number(iEnd.value || 0) - Number(iStart.value || 0)));
        const rs = iRemoveStart.value === '' ? null : Number(iRemoveStart.value);
        const re = iRemoveEnd.value === '' ? null : Number(iRemoveEnd.value);
        if (rs !== null && re !== null && re > rs) d = Math.max(0, d - (re - rs));
        $('edit-duration').textContent = `Duração estimada: ${d.toFixed(2)}s`;
    };
    video.addEventListener('loadedmetadata', () => {
        iStart.value = '0';
        if (Number.isFinite(video.duration)) iEnd.value = video.duration.toFixed(1);
        calc();
    });
    [iStart, iEnd, iRemoveStart, iRemoveEnd].forEach(input => input.addEventListener('input', calc));
    $('edit-close').onclick = () => modal.remove();
    $('edit-save').onclick = async () => {
        const payload = { start: Number(iStart.value), end: Number(iEnd.value), replace_original: false };
        if (iRemoveStart.value !== '' && iRemoveEnd.value !== '') {
            payload.remove_start = Number(iRemoveStart.value);
            payload.remove_end = Number(iRemoveEnd.value);
        }
        const res = await fetch(`${API}/api/cortes/${corteId}/editar`, { method:'POST', headers:getAuthHeaders({'Content-Type':'application/json'}), body: JSON.stringify(payload) });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || !data?.ok) return alert(data?.detail || 'Falha ao editar clipe.');
        modal.remove();
        if (window.projetoAtualId) renderCortesProjeto(window.projetoAtualId);
        else carregarMeusConteudos();
    };
}

async function carregarMeusConteudos() {
    const token = getAuthToken();
    if (!token) { window.Auth.logout(); return; }
    try {
        setConteudosFeedback('');
        const res = await fetch(`${API}/api/projetos`, { method: 'GET', headers: getAuthHeaders() });
        if (res.status === 401) { window.Auth.logout(); return; }
        const dados = await res.json();
        if (!res.ok || !dados?.sucesso) throw new Error(dados?.detail || 'Falha ao carregar conteúdos.');
        renderProjetos(Array.isArray(dados.projetos) ? dados.projetos : []);
    } catch (err) {
        console.warn('[EditMind] Falha ao carregar projetos; tentando histórico legado:', err);
        try {
            const legado = await fetch(`${API}/api/meus-cortes`, { method: 'GET', headers: getAuthHeaders() });
            if (legado.status === 401) { window.Auth.logout(); return; }
            const dadosLegado = await legado.json();
            if (!legado.ok || !dadosLegado?.sucesso) throw new Error(dadosLegado?.detail || 'Falha ao carregar conteúdos.');
            renderConteudos(Array.isArray(dadosLegado.cortes) ? dadosLegado.cortes : []);
        } catch (fallbackErr) {
            console.error('[EditMind] Erro ao carregar Meus Conteúdos:', fallbackErr);
            setConteudosFeedback(fallbackErr.message || 'Falha ao carregar conteúdos.');
            renderEmptyStateConteudos();
        }
    }
}

async function excluirCorte(corteId, btn) {
    if (!corteId) return;
    if (!confirm('Tem certeza que deseja excluir este recorte?')) return;
    const token = getAuthToken();
    if (!token) { window.Auth.logout(); return; }
    try {
        setConteudosFeedback('');
        if (btn) btn.disabled = true;
        const res = await fetch(`${API}/api/cortes/${corteId}`, { method: 'DELETE', headers: getAuthHeaders() });
        if (res.status === 401) { window.Auth.logout(); return; }
        const dados = await res.json();
        if (!res.ok || !dados?.sucesso) throw new Error(dados?.detail || dados?.mensagem || 'Erro ao excluir recorte.');
        window.meusCortes = window.meusCortes.filter(c => c.id !== corteId);
        document.querySelector(`.conteudo-card[data-corte-id="${corteId}"]`)?.remove();
        setConteudosFeedback('Recorte excluído com sucesso.', 'ok');
        if (window.projetoAtualId) await renderCortesProjeto(window.projetoAtualId);
        else if (window.meusCortes.length === 0) renderEmptyStateConteudos();
    } catch (err) {
        console.error(`[EditMind] Erro ao excluir recorte ${corteId}:`, err);
        setConteudosFeedback(err.message || 'Falha ao excluir recorte.');
        alert(err.message || 'Falha ao excluir recorte.');
    } finally {
        if (btn) btn.disabled = false;
    }
}

function setProfileFeedback(texto, tipo = 'ok') {
    if (!profileFeedback) return;
    profileFeedback.textContent = texto || '';
    profileFeedback.style.color = tipo === 'erro' ? '#ef4444' : '#22c55e';
}

async function carregarPerfil() {
    const token = getAuthToken();
    if (!token) return;
    try {
        const res = await fetch(`${API}/api/user/profile`, { headers: getAuthHeaders() });
        if (!res.ok) return;
        const data = await res.json();
        const perfil = data?.perfil || {};
        const nome = perfil.nome || perfil.email?.split('@')[0] || 'Usuário';
        if (profileNome) profileNome.value = perfil.nome || '';
        if (profileEmail) profileEmail.value = perfil.email || '';
        const userEl = $('user-nome');
        if (userEl) userEl.textContent = nome;
        const oldUser = window.Auth?.getUsuario?.() || {};
        localStorage.setItem(window.CONFIG?.USER_KEY || 'editmind_user', JSON.stringify({ ...oldUser, nome, email: perfil.email || oldUser.email }));
    } catch (e) {
        console.warn('Falha ao carregar perfil', e);
    }
}

async function salvarNomePerfil(event) {
    event.preventDefault();
    const nome = profileNome?.value.trim();
    if (!nome) return setProfileFeedback('Informe um nome válido.', 'erro');
    const res = await fetch(`${API}/api/user/profile/name`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nome }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setProfileFeedback(data.detail || 'Não foi possível atualizar o nome.', 'erro');
    setProfileFeedback('Nome atualizado com sucesso.');
    carregarPerfil();
}

async function salvarEmailPerfil(event) {
    event.preventDefault();
    const email = profileEmail?.value.trim();
    if (!email) return setProfileFeedback('Informe um e-mail válido.', 'erro');
    const res = await fetch(`${API}/api/user/profile/email`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ email }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setProfileFeedback(data.detail || 'Não foi possível atualizar o e-mail.', 'erro');
    setProfileFeedback(data.mensagem || 'Verifique seu e-mail para confirmar a alteração.');
}

async function salvarSenhaPerfil(event) {
    event.preventDefault();
    const nova_senha = profileSenha?.value || '';
    if (nova_senha.length < 6) return setProfileFeedback('A senha deve ter pelo menos 6 caracteres.', 'erro');
    const res = await fetch(`${API}/api/user/profile/password`, {
        method: 'PATCH',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ nova_senha }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return setProfileFeedback(data.detail || 'Não foi possível atualizar a senha.', 'erro');
    profileSenha.value = '';
    setProfileFeedback('Senha atualizada com sucesso.');
}

function atualizarContadorSelecao() {
    if (!conteudosCount) return;
    const total = window.selectedCortes.size;
    conteudosCount.textContent = `${total} selecionado${total === 1 ? '' : 's'}`;
}

function atualizarVisualSelecaoCorte(checkbox) {
    const card = checkbox?.closest('.conteudo-card');
    if (card) card.classList.toggle('is-selected', Boolean(checkbox.checked));
}

function alternarSelecaoCorte(checkbox) {
    if (!checkbox) return;
    const id = checkbox.getAttribute('data-corte-id');
    if (!id) return;
    if (checkbox.checked) window.selectedCortes.add(id);
    else window.selectedCortes.delete(id);
    atualizarVisualSelecaoCorte(checkbox);
    atualizarContadorSelecao();
}

function selecionarTodosCortes() {
    document.querySelectorAll('.conteudo-select').forEach(cb => {
        cb.checked = true;
        const id = cb.getAttribute('data-corte-id');
        if (id) window.selectedCortes.add(id);
        atualizarVisualSelecaoCorte(cb);
    });
    atualizarContadorSelecao();
}

function limparSelecaoCortes() {
    window.selectedCortes.clear();
    document.querySelectorAll('.conteudo-select').forEach(cb => {
        cb.checked = false;
        atualizarVisualSelecaoCorte(cb);
    });
    atualizarContadorSelecao();
}

async function baixarSelecionadosZip() {
    if (!window.selectedCortes.size) return alert('Selecione ao menos um recorte.');
    const res = await fetch(`${API}/api/cortes/bulk-download`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: Array.from(window.selectedCortes) }),
    });
    if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        return alert(data.detail || 'Falha ao baixar ZIP.');
    }
    const blob = await res.blob();
    baixarBlob(blob, 'recortes_editmind.zip');
}

async function excluirSelecionados() {
    if (!window.selectedCortes.size) return alert('Selecione ao menos um recorte.');
    if (!confirm(`Excluir ${window.selectedCortes.size} recorte(s)?`)) return;
    const res = await fetch(`${API}/api/cortes/bulk-delete`, {
        method: 'POST',
        headers: getAuthHeaders({ 'Content-Type': 'application/json' }),
        body: JSON.stringify({ ids: Array.from(window.selectedCortes) }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return alert(data.detail || 'Falha ao excluir recortes.');
    const ids = new Set(window.selectedCortes);
    window.meusCortes = window.meusCortes.filter(c => !ids.has(c.id));
    ids.forEach(id => document.querySelector(`.conteudo-card[data-corte-id="${id}"]`)?.remove());
    limparSelecaoCortes();
    setConteudosFeedback(`${data.excluidos || ids.size} recorte(s) excluído(s).`, 'ok');
    if (window.projetoAtualId) await renderCortesProjeto(window.projetoAtualId);
    else if (!window.meusCortes.length) renderEmptyStateConteudos();
}

// ── EVENT DELEGATION ─────────────────────────────────────────
document.addEventListener('click', (event) => {
    const btnDownload = event.target.closest('.btn-download-video');
    if (btnDownload) {
        const videoUrl = btnDownload.getAttribute('data-url');
        baixarArquivoVideo(videoUrl, btnDownload);
        return;
    }

    const btnPlay = event.target.closest('.btn-play-inline');
    if (btnPlay) {
        const card = btnPlay.closest('.resultado-corte-card');
        const video = card?.querySelector('video');
        if (video) { video.scrollIntoView({ behavior: 'smooth', block: 'center' }); video.play(); }
        return;
    }

    const btnExcluir = event.target.closest('.btn-excluir-corte');
    if (btnExcluir) {
        excluirCorte(btnExcluir.getAttribute('data-corte-id'), btnExcluir);
        return;
    }
    const btnOpenProject = event.target.closest('.btn-open-project');
    if (btnOpenProject) {
        renderCortesProjeto(btnOpenProject.getAttribute('data-project-id'));
        return;
    }
    if (event.target.id === 'btn-voltar-projetos') {
        renderListaProjetos();
        return;
    }
    const btnEditar = event.target.closest('.btn-editar-corte');
    if (btnEditar) {
        abrirModalEdicao(btnEditar.getAttribute('data-corte-id'), btnEditar.getAttribute('data-url'));
        return;
    }

    const cb = event.target.closest('.conteudo-select');
    if (cb) {
        alternarSelecaoCorte(cb);
    }
});


document.addEventListener('change', (e) => {
    if (e.target.classList.contains('conteudo-select')) {
        alternarSelecaoCorte(e.target);
        return;
    }
    if (!e.target.classList.contains('preview-select')) return;
    const idx = Number(e.target.dataset.index);
    if (e.target.checked) window.previewSelecionados.add(idx); else window.previewSelecionados.delete(idx);
});

document.addEventListener('click', async (e) => {
    if (e.target.id !== 'btn-confirmar-cortes') return;
    const btn = e.target;
    const projectId = window.ultimoResultado?.project?.project_id;
    if (!projectId) return alert('Projeto não encontrado para salvar.');
    const selected = [...document.querySelectorAll('.preview-select:checked')].map(x => Number(x.dataset.index));
    if (!selected.length) return alert('Selecione ao menos um corte.');
    btn.disabled = true; btn.textContent = 'Salvando cortes selecionados...';
    msg('Salvando cortes selecionados...', '#f97316');
    try {
        const res = await fetch(`${API}/api/projetos/${projectId}/confirmar-cortes`, {
            method: 'POST',
            headers: getAuthHeaders({'Content-Type':'application/json'}),
            body: JSON.stringify({ selected_indexes: selected }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.detail || 'Erro ao salvar cortes.');
        msg('Cortes salvos com sucesso.', '#22c55e');
        btn.textContent = 'Cortes salvos';
        carregarMeusConteudos();
    } catch(err){
        msg(`Erro ao gerar/salvar: ${err.message || 'falha'}`, '#ef4444');
        btn.disabled = false; btn.textContent = 'Salvar cortes selecionados';
    }
});
