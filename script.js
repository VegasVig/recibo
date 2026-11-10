'use strict';

const API_URL = 'https://script.google.com/macros/s/AKfycbyVF-TeCt91wdehvjEipC_2s9IvyjAm6DcsSN1l_WtPpLcl7ykDBP4kzkEHrEwl4Zv0/exec';

const S = { sessao: null, usuario: null, perms: [], config: {}, empresas: [], funcionarios: [], recibos: [], funcSel: null, tiposEdit: [] };
const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

/* ================= UTILITÁRIOS ================= */

const esc = s => String(s ?? '').replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m]));
const brl = v => Number(v || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dinheiro = v => { const s = String(v ?? '').replace(/[^\d,.-]/g, ''); const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s); return isFinite(n) ? Math.round(n * 100) / 100 : 0; };
const dataBr = (iso, hora) => { if (!iso) return '—'; const d = new Date(iso); return hora ? d.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : d.toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' }); };
const digitos = s => String(s || '').replace(/\D/g, '');
const mascaraCpf = c => { const d = digitos(c); return d.length === 11 ? `***.${d.slice(3, 6)}.${d.slice(6, 9)}-**` : ''; };
const formataCpf = c => digitos(c).replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4');
const pode = p => S.perms.includes(p);
const ROTULO_ST = { PENDENTE: 'Pendente de assinatura', ASSINADO: 'Assinado', EXPIRADO: 'Expirado', CANCELADO: 'Cancelado' };
const selo = st => `<span class="st st-${esc(st)}">${esc(ROTULO_ST[st] || st)}</span>`;

function extenso(valor) {
  const U = ['', 'um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez', 'onze', 'doze', 'treze', 'quatorze', 'quinze', 'dezesseis', 'dezessete', 'dezoito', 'dezenove'];
  const D = ['', '', 'vinte', 'trinta', 'quarenta', 'cinquenta', 'sessenta', 'setenta', 'oitenta', 'noventa'];
  const C = ['', 'cento', 'duzentos', 'trezentos', 'quatrocentos', 'quinhentos', 'seiscentos', 'setecentos', 'oitocentos', 'novecentos'];
  const ate999 = n => {
    if (n === 100) return 'cem';
    const p = [], c = Math.floor(n / 100), r = n % 100;
    if (c) p.push(C[c]);
    if (r) p.push(r < 20 ? U[r] : D[Math.floor(r / 10)] + (r % 10 ? ' e ' + U[r % 10] : ''));
    return p.join(' e ');
  };
  const inteiro = n => {
    if (n === 0) return 'zero';
    const esc2 = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    const g = [];
    while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); }
    const partes = [];
    for (let i = g.length - 1; i >= 0; i--) {
      if (!g[i]) continue;
      partes.push({ g: g[i], t: i === 1 && g[i] === 1 ? 'mil' : ate999(g[i]) + (i ? ' ' + (g[i] === 1 ? esc2[i][0] : esc2[i][1]) : '') });
    }
    return partes.reduce((s, p, k) => k === 0 ? p.t : s + ((k === partes.length - 1 && (p.g < 100 || p.g % 100 === 0)) ? ' e ' : ' ') + p.t, '');
  };
  const cents = Math.round(Number(valor) * 100);
  const r = Math.floor(cents / 100), c = cents % 100;
  let s = '';
  if (r) s = inteiro(r) + (r >= 1e6 && r % 1e6 === 0 ? ' de' : '') + (r === 1 ? ' real' : ' reais');
  if (c) s += (s ? ' e ' : '') + inteiro(c) + (c === 1 ? ' centavo' : ' centavos');
  return s || 'zero reais';
}

function aviso(msg, ruim) {
  const a = $('#aviso');
  a.textContent = msg;
  a.classList.toggle('ruim', !!ruim);
  a.hidden = false;
  clearTimeout(aviso.t);
  aviso.t = setTimeout(() => (a.hidden = true), 4200);
}

function modal(html) {
  $('#modal-corpo').innerHTML = html;
  $('#modal').hidden = false;
  return $('#modal-corpo');
}
const fecharModal = () => { $('#modal').hidden = true; $('#modal-corpo').innerHTML = ''; };
$('#modal-fechar').onclick = fecharModal;
$('#modal').addEventListener('click', e => { if (e.target.id === 'modal') fecharModal(); });
document.addEventListener('keydown', e => { if (e.key === 'Escape' && !$('#modal').hidden) fecharModal(); });

function b64Blob(b64, mime) {
  const bin = atob(b64), arr = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) arr[i] = bin.charCodeAt(i);
  return new Blob([arr], { type: mime });
}

function baixar(nome, b64, mime) {
  const url = URL.createObjectURL(b64Blob(b64, mime));
  const a = Object.assign(document.createElement('a'), { href: url, download: nome });
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

async function abrirPdf(acao, payload) {
  const janela = window.open('', '_blank');
  if (janela) janela.document.write('<p style="font-family:sans-serif;padding:20px">Carregando PDF…</p>');
  try {
    const r = await api(acao, payload);
    const url = URL.createObjectURL(b64Blob(r.base64, 'application/pdf'));
    if (janela) janela.location.href = url; else baixar(r.nome, r.base64, 'application/pdf');
  } catch (e) { if (janela) janela.close(); aviso(e.message, true); }
}

async function api(action, payload = {}, opts = {}) {
  if (!opts.silencioso) $('#carga').hidden = false;
  try {
    const resp = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, sessao: S.sessao, ...payload }) });
    const j = await resp.json();
    if (!j.ok) {
      if (j.codigo === 'SESSAO') sair(true);
      const e = new Error(j.error); e.codigo = j.codigo; throw e;
    }
    return j.data;
  } catch (e) {
    if (e instanceof TypeError) throw new Error('Sem conexão com o servidor. Verifique a internet e tente novamente.');
    throw e;
  } finally { if (!opts.silencioso) $('#carga').hidden = true; }
}

function mostrarView(id) { $$('.view').forEach(v => (v.hidden = v.id !== id)); }

/* ================= FOLHA DO RECIBO ================= */

function htmlFolha(d, o = {}) {
  const E = d.EMPRESA || {};
  const det = [];
  if (d.QUANTIDADE_DIAS) det.push(['Cálculo', `${d.QUANTIDADE_DIAS} dia(s) × ${brl(d.VALOR_DIARIO)} por dia`]);
  det.push(['Período de referência', d.PERIODO || '—'], ['Data do pagamento', dataBr(d.DATA_PAGAMENTO)], ['Posto de serviço', d.POSTO || '—'],
    ['Forma de pagamento', (d.FORMA_PAGAMENTO || '—') + (d.IDENTIFICACAO_TRANSACAO ? ' — ' + d.IDENTIFICACAO_TRANSACAO : '')]);
  if (d.MATRICULA) det.push(['Matrícula', d.MATRICULA]);
  if (d.OBSERVACOES) det.push(['Observações', d.OBSERVACOES]);
  det.push(['Valor pago', brl(d.VALOR)]);
  const ass = o.assinatura ? `<img src="${esc(o.assinatura)}" alt="Assinatura">` : '';
  const quando = o.assinadoEm ? `Assinado eletronicamente em ${dataBr(o.assinadoEm, true)}` : 'Data: ____/____/______';
  return `<article class="folha ${o.livre ? 'livre' : ''}">
    <div class="fl-topo"><img src="assets/logo.jpg" alt=""><div><b>${esc(E.RAZAO_SOCIAL || 'Selecione a empresa')}</b>
      <small>${E.CNPJ ? 'CNPJ ' + esc(E.CNPJ) : ''}${E.ENDERECO ? '<br>' + esc(E.ENDERECO) : ''}<br>${[E.TELEFONE, E.EMAIL].filter(Boolean).map(esc).join(' | ')}</small></div></div>
    <div class="fl-corpo">
      ${d.STATUS === 'CANCELADO' ? '<div style="text-align:center"><span class="marca-dagua">CANCELADO</span></div>' : ''}
      <h2>RECIBO DE PAGAMENTO</h2>
      <div class="fl-prot">${d.PROTOCOLO ? 'Protocolo ' + esc(d.PROTOCOLO) + ' | ' : ''}${esc(d.TIPO_PAGAMENTO || '')}</div>
      <p class="fl-texto">Eu, <b>${esc(d.NOME_FUNCIONARIO || '__________')}</b>, CPF <b>${esc(d.CPF || '___.___.___-__')}</b>, declaro que recebi de <b>${esc(E.RAZAO_SOCIAL || '')}</b>
        a quantia de <b>${brl(d.VALOR)}</b> (${esc(extenso(d.VALOR || 0))}), referente a ${esc(d.DESCRICAO || '__________')}.</p>
      <table class="fl-det">${det.map((x, i) => `<tr${i === det.length - 1 ? ' class="total"' : ''}><td>${esc(x[0])}</td><td>${esc(x[1])}</td></tr>`).join('')}</table>
      <div class="fl-ass"><div class="espaco">${ass}</div><div class="linha">${esc(d.NOME_FUNCIONARIO || '')}</div><small>${quando}</small></div>
      <p class="fl-rod">${esc(S.config.TEXTO_RODAPE || 'Este recibo é válido como comprovante de pagamento, conforme descrito acima.')}</p>
      ${o.auditoria ? `<div class="fl-aud">${o.auditoria}</div>` : ''}
    </div></article>`;
}

/* ================= LOGIN / SESSÃO ================= */

$('#f-login').addEventListener('submit', async e => {
  e.preventDefault();
  const f = e.target;
  $('#login-erro').textContent = '';
  try {
    const r = await api('login', { login: f.login.value.trim(), senha: f.senha.value });
    S.sessao = r.sessao;
    sessionStorage.setItem('vg_sessao', JSON.stringify({ sessao: r.sessao, usuario: r.usuario, perms: r.permissoes }));
    f.senha.value = '';
    await entrarApp(r.usuario, r.permissoes);
  } catch (err) { $('#login-erro').textContent = err.message; }
});

function sair(expirou) {
  if (S.sessao && !expirou) api('sessao.sair', {}, { silencioso: true }).catch(() => {});
  sessionStorage.removeItem('vg_sessao');
  S.sessao = null;
  fecharModal();
  mostrarView('v-login');
  if (expirou) $('#login-erro').textContent = 'Sua sessão expirou. Entre novamente.';
}
$('#b-sair').onclick = () => sair();

$('#b-senha').onclick = () => {
  const c = modal(`<h2>Trocar senha</h2><form id="f-senha">
    <label>Senha atual<input name="atual" type="password" required autocomplete="current-password"></label>
    <label>Nova senha (mínimo 8 caracteres)<input name="nova" type="password" minlength="8" required autocomplete="new-password"></label>
    <button class="btn azul">Salvar nova senha</button></form>`);
  $('#f-senha', c).onsubmit = async e => {
    e.preventDefault();
    try { await api('sessao.senha', { atual: e.target.atual.value, nova: e.target.nova.value }); fecharModal(); aviso('Senha alterada.'); }
    catch (err) { aviso(err.message, true); }
  };
};

async function entrarApp(usuario, perms) {
  S.usuario = usuario; S.perms = perms;
  $('#u-nome').textContent = `${usuario.nome} (${usuario.perfil})`;
  $$('[data-perm]').forEach(el => (el.hidden = !pode(el.dataset.perm)));
  mostrarView('v-app');
  await carregarDados();
  irPara('painel');
}

async function carregarDados(silencioso) {
  const d = await api('painel.dados', {}, { silencioso });
  S.config = d.config; S.empresas = d.empresas; S.funcionarios = d.funcionarios; S.recibos = d.recibos;
  preencherSelects();
  renderAtual();
}

/* ================= NAVEGAÇÃO ================= */

let telaAtual = 'painel';
$('#menu').addEventListener('click', e => {
  const b = e.target.closest('button');
  if (!b) return;
  if (b.dataset.tela === 'lista') $('#fl-status').value = b.dataset.filtro || '';
  irPara(b.dataset.tela, b);
});

function irPara(tela, botao) {
  telaAtual = tela;
  $$('.tela').forEach(t => (t.hidden = t.id !== 't-' + tela));
  $$('#menu button').forEach(b => b.classList.toggle('ativo', botao ? b === botao : b.dataset.tela === tela && !b.dataset.filtro));
  renderAtual();
  window.scrollTo({ top: 0 });
}

function renderAtual() {
  ({ painel: renderPainel, novo: renderPrevia, lista: renderLista, funcionarios: renderFuncionarios, relatorios: renderRelatorio, config: renderConfig }[telaAtual] || (() => {}))();
}

/* ================= PAINEL ================= */

function renderPainel() {
  const R = S.recibos, cont = st => R.filter(r => r.STATUS === st).length;
  const pago = R.filter(r => r.STATUS === 'ASSINADO').reduce((s, r) => s + r.VALOR, 0);
  const cards = [
    ['Recibos emitidos', R.length, '#168BFF'], ['Aguardando assinatura', cont('PENDENTE'), '#f0b429'], ['Assinados', cont('ASSINADO'), '#2fbf71'],
    ['Cancelados', cont('CANCELADO'), '#ff5a5f'], ['Expirados', cont('EXPIRADO'), '#737982'], ['Pagamentos registrados (assinados)', brl(pago), '#C7CBD1']
  ];
  $('#cards').innerHTML = cards.map(c => `<div class="vidro card" style="--cor:${c[2]}"><b>${esc(c[1])}</b><span>${esc(c[0])}</span></div>`).join('');

  const meses = [];
  const hoje = new Date();
  for (let i = 5; i >= 0; i--) { const d = new Date(hoje.getFullYear(), hoje.getMonth() - i, 1); meses.push({ k: d.getFullYear() + '-' + d.getMonth(), rot: d.toLocaleDateString('pt-BR', { month: 'short' }).replace('.', '') + '/' + String(d.getFullYear()).slice(2) }); }
  const chaveMes = iso => { const d = new Date(iso); return d.getFullYear() + '-' + d.getMonth(); };
  barrasV('#g-mes', meses.map(m => ({ rot: m.rot, v: R.filter(r => chaveMes(r.DATA_EMISSAO) === m.k).length })));
  barrasV('#g-valor', meses.map(m => ({ rot: m.rot, v: R.filter(r => r.STATUS === 'ASSINADO' && chaveMes(r.DATA_ASSINATURA) === m.k).reduce((s, r) => s + r.VALOR, 0) })), true);
  const porTipo = {};
  R.filter(r => r.STATUS !== 'CANCELADO').forEach(r => (porTipo[r.TIPO_PAGAMENTO] = (porTipo[r.TIPO_PAGAMENTO] || 0) + 1));
  barrasH('#g-tipo', Object.entries(porTipo).sort((a, b) => b[1] - a[1]).map(([rot, v]) => ({ rot, v })));
  barrasH('#g-status', ['PENDENTE', 'ASSINADO', 'EXPIRADO', 'CANCELADO'].map(st => ({ rot: ROTULO_ST[st], v: cont(st) })));

  const ult = R.slice(0, 8);
  $('#ultimos').innerHTML = ult.length ? `<div class="tabela-wrap"><table class="tabela"><tr><th>Protocolo</th><th>Funcionário</th><th>Tipo</th><th class="num">Valor</th><th>Emissão</th><th>Status</th></tr>
    ${ult.map(r => `<tr><td>${esc(r.PROTOCOLO)}</td><td>${esc(r.NOME_FUNCIONARIO)}</td><td>${esc(r.TIPO_PAGAMENTO)}</td><td class="num">${brl(r.VALOR)}</td><td>${dataBr(r.DATA_EMISSAO)}</td><td>${selo(r.STATUS)}</td></tr>`).join('')}</table></div>`
    : '<p class="vazio">Nenhum recibo emitido ainda. Comece em “Novo recibo”.</p>';
}

function barrasV(sel, dados, moeda) {
  const max = Math.max(1, ...dados.map(d => d.v));
  $(sel).innerHTML = dados.some(d => d.v) ? `<div class="barras">${dados.map(d => `<div class="barra-col"><div class="barra" style="height:${Math.max(2, (d.v / max) * 100)}%"><em>${moeda ? (d.v ? 'R$ ' + Math.round(d.v).toLocaleString('pt-BR') : '') : d.v}</em></div><small>${esc(d.rot)}</small></div>`).join('')}</div>`
    : '<p class="vazio">Sem dados no período.</p>';
}

function barrasH(sel, dados) {
  const max = Math.max(1, ...dados.map(d => d.v));
  $(sel).innerHTML = dados.some(d => d.v) ? `<div class="hbarras">${dados.map(d => `<div class="hb"><span title="${esc(d.rot)}">${esc(d.rot)}</span><i style="width:${(d.v / max) * 100}%"></i><b>${d.v}</b></div>`).join('')}</div>`
    : '<p class="vazio">Sem dados.</p>';
}

/* ================= NOVO RECIBO ================= */

function preencherSelects() {
  const padrao = S.empresas.find(e => e.PADRAO === 'SIM') || S.empresas[0];
  const selE = $('#sel-empresa'), atualE = selE.value;
  selE.innerHTML = S.empresas.map(e => `<option value="${esc(e.ID_EMPRESA)}">${esc(e.RAZAO_SOCIAL)}</option>`).join('');
  selE.value = atualE && S.empresas.some(e => e.ID_EMPRESA === atualE) ? atualE : padrao?.ID_EMPRESA || '';
  const selT = $('#sel-tipo'), atualT = selT.value;
  selT.innerHTML = S.config.TIPOS_RECIBO.map(t => `<option>${esc(t)}</option>`).join('');
  if (S.config.TIPOS_RECIBO.includes(atualT)) selT.value = atualT;
  $('#fl-tipo').innerHTML = '<option value="">Todos os tipos</option>' + S.config.TIPOS_RECIBO.map(t => `<option>${esc(t)}</option>`).join('');
  $('#dl-func').innerHTML = S.funcionarios.filter(f => f.STATUS === 'ATIVO').map(f => `<option value="${esc(f.NOME)} | CPF ${esc(f.CPF)}${f.MATRICULA ? ' | Mat. ' + esc(f.MATRICULA) : ''}"></option>`).join('');
  const fr = $('#f-recibo');
  if (!fr.VALIDADE_DIAS.value) fr.VALIDADE_DIAS.value = S.config.VALIDADE_DIAS;
  if (!fr.DATA_PAGAMENTO.value) fr.DATA_PAGAMENTO.value = new Date().toLocaleDateString('sv-SE', { timeZone: 'America/Sao_Paulo' });
}

function selecionarFunc(f) {
  S.funcSel = f;
  const fr = $('#f-recibo');
  fr.ID_FUNCIONARIO.value = f ? f.ID_FUNCIONARIO : '';
  $('#func-sel').innerHTML = f ? `<b>${esc(f.NOME)}</b> — CPF ${esc(f.CPF)}${f.MATRICULA ? ' — Mat. ' + esc(f.MATRICULA) : ''}<br>Posto: ${esc(f.POSTO || '—')} | Celular: ${esc(f.TELEFONE || 'não informado')}` : 'Nenhum funcionário selecionado.';
  if (f) {
    if (!fr.POSTO.value) fr.POSTO.placeholder = f.POSTO || 'Posto de serviço';
    if (!fr.IDENTIFICACAO_TRANSACAO.value && fr.FORMA_PAGAMENTO.value === 'PIX') fr.IDENTIFICACAO_TRANSACAO.value = 'Chave (CPF) ' + f.CPF;
  }
  renderPrevia();
}

$('#busca-func').addEventListener('input', e => {
  const v = e.target.value;
  const cpf = (v.match(/CPF ([\d.\-]+)/) || [])[1];
  const f = cpf ? S.funcionarios.find(x => digitos(x.CPF) === digitos(cpf)) : null;
  if (f) { selecionarFunc(f); e.target.value = ''; }
});
$('#busca-func').addEventListener('keydown', e => {
  if (e.key !== 'Enter') return;
  e.preventDefault();
  const q = e.target.value.toLowerCase().trim(), qd = digitos(q);
  const achados = S.funcionarios.filter(f => f.STATUS === 'ATIVO' && (f.NOME.toLowerCase().includes(q) || (qd && digitos(f.CPF).includes(qd)) || String(f.MATRICULA).toLowerCase() === q));
  if (achados.length === 1) { selecionarFunc(achados[0]); e.target.value = ''; }
  else aviso(achados.length ? 'Mais de um funcionário encontrado. Escolha na lista.' : 'Nenhum funcionário encontrado. Use “Cadastrar novo”.', !achados.length);
});
$('#b-novo-func').onclick = () => formFuncionario(null, f => selecionarFunc(f));

const fr = $('#f-recibo');
fr.addEventListener('input', e => {
  if (['QUANTIDADE_DIAS', 'VALOR_DIARIO'].includes(e.target.name)) calcular();
  renderPrevia();
});
fr.FORMA_PAGAMENTO.addEventListener('change', () => {
  if (fr.FORMA_PAGAMENTO.value !== 'PIX' && /^Chave \(CPF\)/.test(fr.IDENTIFICACAO_TRANSACAO.value)) fr.IDENTIFICACAO_TRANSACAO.value = '';
  if (fr.FORMA_PAGAMENTO.value === 'PIX' && !fr.IDENTIFICACAO_TRANSACAO.value && S.funcSel) fr.IDENTIFICACAO_TRANSACAO.value = 'Chave (CPF) ' + S.funcSel.CPF;
  renderPrevia();
});
fr.ID_EMPRESA.addEventListener('change', renderPrevia);

function calcular() {
  const dias = Number(fr.QUANTIDADE_DIAS.value || 0), diario = dinheiro(fr.VALOR_DIARIO.value);
  if (dias > 0 && diario > 0) {
    const total = Math.round(dias * diario * 100) / 100;
    fr.VALOR.value = total.toFixed(2).replace('.', ',');
    fr.VALOR.readOnly = true;
    $('#calc').textContent = `${dias} dia(s) × ${brl(diario)} = ${brl(total)}`;
  } else {
    fr.VALOR.readOnly = false;
    $('#calc').textContent = '';
  }
}

function dadosForm() {
  const E = S.empresas.find(e => e.ID_EMPRESA === fr.ID_EMPRESA.value) || {};
  const f = S.funcSel || {};
  const dias = Number(fr.QUANTIDADE_DIAS.value || 0);
  return {
    EMPRESA: E, NOME_FUNCIONARIO: f.NOME, CPF: f.CPF, MATRICULA: f.MATRICULA, POSTO: (fr.POSTO.value || f.POSTO || '').toUpperCase(),
    TIPO_PAGAMENTO: fr.TIPO_PAGAMENTO.value, DESCRICAO: fr.DESCRICAO.value.trim(), VALOR: dinheiro(fr.VALOR.value),
    VALOR_DIARIO: dias > 0 ? dinheiro(fr.VALOR_DIARIO.value) : '', QUANTIDADE_DIAS: dias > 0 ? dias : '',
    PERIODO: fr.PERIODO.value.trim(), DATA_PAGAMENTO: fr.DATA_PAGAMENTO.value ? fr.DATA_PAGAMENTO.value + 'T12:00:00' : '',
    FORMA_PAGAMENTO: fr.FORMA_PAGAMENTO.value, IDENTIFICACAO_TRANSACAO: fr.IDENTIFICACAO_TRANSACAO.value.trim(), OBSERVACOES: fr.OBSERVACOES.value.trim()
  };
}

function renderPrevia() { if (telaAtual === 'novo') $('#previa').innerHTML = htmlFolha(dadosForm()); }

fr.TIPO_PAGAMENTO.addEventListener('change', () => {
  if (!fr.DESCRICAO.value || fr.DESCRICAO.dataset.auto) { fr.DESCRICAO.value = fr.TIPO_PAGAMENTO.value.toLowerCase(); fr.DESCRICAO.dataset.auto = '1'; }
  renderPrevia();
});
fr.DESCRICAO.addEventListener('input', () => delete fr.DESCRICAO.dataset.auto);

fr.addEventListener('submit', async e => {
  e.preventDefault();
  const erro = $('#recibo-erro');
  erro.textContent = '';
  const d = dadosForm();
  const falta = [];
  if (!fr.ID_FUNCIONARIO.value) falta.push('funcionário');
  if (!d.DESCRICAO) falta.push('descrição');
  if (!(d.VALOR > 0)) falta.push('valor');
  if (!d.PERIODO) falta.push('período');
  if (!fr.DATA_PAGAMENTO.value) falta.push('data do pagamento');
  if (falta.length) { erro.textContent = 'Preencha: ' + falta.join(', ') + '.'; return; }
  if (!confirm(`Confirmar emissão do recibo de ${brl(d.VALOR)} para ${d.NOME_FUNCIONARIO}?`)) return;
  try {
    const r = await api('recibo.criar', { recibo: {
      ID_EMPRESA: fr.ID_EMPRESA.value, ID_FUNCIONARIO: fr.ID_FUNCIONARIO.value, POSTO: fr.POSTO.value, TIPO_PAGAMENTO: d.TIPO_PAGAMENTO,
      DESCRICAO: d.DESCRICAO, VALOR: d.VALOR, VALOR_DIARIO: fr.VALOR_DIARIO.value, QUANTIDADE_DIAS: fr.QUANTIDADE_DIAS.value || 0,
      PERIODO: d.PERIODO, DATA_PAGAMENTO: fr.DATA_PAGAMENTO.value, FORMA_PAGAMENTO: d.FORMA_PAGAMENTO,
      IDENTIFICACAO_TRANSACAO: d.IDENTIFICACAO_TRANSACAO, OBSERVACOES: d.OBSERVACOES, VALIDADE_DIAS: fr.VALIDADE_DIAS.value
    } });
    modalLink(r, true);
    limparForm();
    carregarDados(true).catch(() => {});
  } catch (err) { erro.textContent = err.message; }
});

function limparForm() {
  ['DESCRICAO', 'VALOR', 'VALOR_DIARIO', 'QUANTIDADE_DIAS', 'PERIODO', 'IDENTIFICACAO_TRANSACAO', 'OBSERVACOES', 'POSTO'].forEach(n => (fr[n].value = ''));
  fr.VALOR.readOnly = false;
  $('#calc').textContent = '';
  selecionarFunc(null);
}

function mensagemWhats(link) {
  return `Olá! A Vegas Vigilância disponibilizou seu recibo digital para conferência e assinatura.\n\nAcesse o link abaixo, confira as informações e assine diretamente pelo celular.\n\n${link}\n\nVegas Vigilância e Segurança\nDepartamento Pessoal.`;
}

function linkWhats(tel, link) {
  let d = digitos(tel);
  if (d.length === 10 || d.length === 11) d = '55' + d;
  return `https://wa.me/${d.length >= 12 ? d : ''}?text=${encodeURIComponent(mensagemWhats(link))}`;
}

function modalLink(r, novo) {
  const c = modal(`<h2>${novo ? 'Recibo gerado' : 'Novo link gerado'} — ${esc(r.PROTOCOLO)}</h2>
    <p>Link individual de <b>${esc(r.NOME)}</b>. ${r.DATA_EXPIRACAO ? 'Válido até ' + dataBr(r.DATA_EXPIRACAO, true) + '.' : 'Sem prazo de validade.'}</p>
    <div class="link-recibo">${esc(r.link)}</div>
    ${novo ? '' : '<p class="sub">O link enviado anteriormente deixou de funcionar.</p>'}
    <div class="linha-campos" style="margin-top:14px">
      <button class="btn prata" id="m-copiar">Copiar link</button>
      <a class="btn azul" id="m-whats" target="_blank" rel="noopener" style="text-align:center;text-decoration:none">Enviar pelo WhatsApp</a>
    </div>
    ${r.TELEFONE ? '' : '<p class="sub">Funcionário sem celular cadastrado: o WhatsApp abrirá para você escolher o contato.</p>'}
    <p class="sub">Por segurança o link não fica salvo no sistema. Para reenviar depois, use “Novo link”, que invalida o anterior.</p>`);
  $('#m-whats', c).href = linkWhats(r.TELEFONE, r.link);
  $('#m-copiar', c).onclick = async () => {
    try { await navigator.clipboard.writeText(r.link); aviso('Link copiado.'); }
    catch { const t = document.createElement('textarea'); t.value = r.link; document.body.appendChild(t); t.select(); document.execCommand('copy'); t.remove(); aviso('Link copiado.'); }
  };
}

/* ================= LISTA DE RECIBOS ================= */

['#fl-busca', '#fl-status', '#fl-tipo', '#fl-de', '#fl-ate'].forEach(s => $(s).addEventListener('input', renderLista));
$('#b-atualizar').onclick = () => carregarDados();

function filtrarRecibos({ busca = '', status = '', tipo = '', de = '', ate = '', campoData = 'DATA_EMISSAO' }) {
  const q = busca.toLowerCase().trim(), qd = digitos(q);
  const ini = de ? new Date(de + 'T00:00:00') : null, fim = ate ? new Date(ate + 'T23:59:59') : null;
  return S.recibos.filter(r => {
    if (status && r.STATUS !== status) return false;
    if (tipo && r.TIPO_PAGAMENTO !== tipo) return false;
    const dt = new Date(r[campoData] || r.DATA_EMISSAO);
    if (ini && dt < ini) return false;
    if (fim && dt > fim) return false;
    if (!q) return true;
    return r.NOME_FUNCIONARIO.toLowerCase().includes(q) || String(r.PROTOCOLO).toLowerCase().includes(q) || String(r.MATRICULA).toLowerCase() === q || (qd.length >= 3 && r.CPF_DIG.includes(qd));
  });
}

function renderLista() {
  const lista = filtrarRecibos({ busca: $('#fl-busca').value, status: $('#fl-status').value, tipo: $('#fl-tipo').value, de: $('#fl-de').value, ate: $('#fl-ate').value });
  const tb = $('#tb-recibos');
  if (!lista.length) { tb.innerHTML = '<tr><td class="vazio">Nenhum recibo encontrado com esses filtros.</td></tr>'; return; }
  tb.innerHTML = `<tr><th>Protocolo</th><th>Funcionário</th><th>CPF</th><th>Tipo</th><th class="num">Valor</th><th>Período</th><th>Emissão</th><th>Status</th><th>Assinatura</th><th>Ações</th></tr>` +
    lista.map(r => {
      const a = [`<button data-a="ver" data-id="${r.ID_RECIBO}">Ver</button>`];
      if (['PENDENTE', 'EXPIRADO'].includes(r.STATUS) && pode('recibo.link')) a.push(`<button data-a="link" data-id="${r.ID_RECIBO}">Novo link / WhatsApp</button>`);
      if (r.STATUS === 'ASSINADO') a.push(`<button data-a="pdf" data-id="${r.ID_RECIBO}">Ver PDF</button>`, `<button data-a="baixar" data-id="${r.ID_RECIBO}">Baixar</button>`, `<button data-a="ass" data-id="${r.ID_RECIBO}">Assinatura</button>`);
      if ((['PENDENTE', 'EXPIRADO'].includes(r.STATUS) && pode('recibo.cancelar')) || (r.STATUS === 'ASSINADO' && pode('recibo.cancelarAssinado'))) a.push(`<button data-a="cancelar" data-id="${r.ID_RECIBO}">Cancelar</button>`);
      return `<tr><td>${esc(r.PROTOCOLO)}</td><td>${esc(r.NOME_FUNCIONARIO)}${r.DIVERGENCIA ? ' <span class="flag" title="Funcionário apontou divergência">⚠ divergência</span>' : ''}</td><td>${esc(r.CPF_MASC)}</td>
        <td>${esc(r.TIPO_PAGAMENTO)}</td><td class="num">${brl(r.VALOR)}</td><td>${esc(r.PERIODO)}</td><td>${dataBr(r.DATA_EMISSAO)}</td><td>${selo(r.STATUS)}</td>
        <td>${r.DATA_ASSINATURA ? dataBr(r.DATA_ASSINATURA, true) : '—'}</td><td><div class="acoes">${a.join('')}</div></td></tr>`;
    }).join('');
}

$('#tb-recibos').addEventListener('click', e => {
  const b = e.target.closest('button[data-a]');
  if (!b) return;
  const id = b.dataset.id, r = S.recibos.find(x => x.ID_RECIBO === id);
  ({
    ver: () => verRecibo(id),
    link: () => gerarNovoLink(r),
    pdf: () => abrirPdf('recibo.pdf', { id }),
    baixar: async () => { try { const p = await api('recibo.pdf', { id }); baixar(p.nome, p.base64, 'application/pdf'); } catch (err) { aviso(err.message, true); } },
    ass: async () => { try { const img = await api('recibo.assinatura', { id }); modal(`<h2>Assinatura — ${esc(r.PROTOCOLO)}</h2><div style="background:#fff;border-radius:8px;padding:10px;text-align:center"><img src="${esc(img)}" style="max-width:100%" alt="Assinatura"></div>`); } catch (err) { aviso(err.message, true); } },
    cancelar: () => cancelar(r)
  })[b.dataset.a]();
});

async function verRecibo(id) {
  try {
    const d = await api('recibo.detalhe', { id });
    let assinatura = '';
    if (d.STATUS === 'ASSINADO' || (d.STATUS === 'CANCELADO' && d.DATA_ASSINATURA)) assinatura = await api('recibo.assinatura', { id }).catch(() => '');
    const aud = d.ASSINATURA ? `<b>Registro de autenticidade</b><br>Assinado em ${dataBr(d.ASSINATURA.DATA_HORA_SERVIDOR, true)} (horário do servidor)<br>SHA-256 do PDF: ${esc(d.ASSINATURA.HASH_DOCUMENTO)}<br>SHA-256 do conteúdo: ${esc(d.ASSINATURA.HASH_CONTEUDO)}<br>Dispositivo: ${esc(d.ASSINATURA.DISPOSITIVO)}` : '';
    const c = modal(`<h2>${esc(d.PROTOCOLO)} ${selo(d.STATUS)}</h2>
      ${d.DIVERGENCIA ? `<p class="flag" style="font-size:.92rem">⚠ Divergência apontada pelo funcionário: ${esc(d.DIVERGENCIA)}</p>` : ''}
      ${d.MOTIVO_CANCELAMENTO ? `<p style="color:var(--erro)">Motivo do cancelamento: ${esc(d.MOTIVO_CANCELAMENTO)}</p>` : ''}
      <p class="sub">Emitido por ${esc(d.EMITIDO_POR)} em ${dataBr(d.DATA_EMISSAO, true)}${d.DATA_EXPIRACAO && d.STATUS !== 'ASSINADO' ? ' | Link válido até ' + dataBr(d.DATA_EXPIRACAO, true) : ''}</p>
      ${d.TEM_PDF ? '<div class="linha-campos" style="margin:12px 0"><button class="btn prata" id="m-pdf">Visualizar / imprimir PDF</button></div>' : ''}
      ${htmlFolha(d, { assinatura, assinadoEm: d.DATA_ASSINATURA, livre: true, auditoria: aud })}
      <h3 style="margin-top:20px">Histórico</h3>
      <ul class="hist">${d.HISTORICO.map(h => `<li><time>${dataBr(h.DATA_HORA, true)}</time><b>${esc(h.ACAO)}</b> — ${esc(h.DESCRICAO)} <small class="sub">(${esc(h.RESPONSAVEL)})</small></li>`).join('')}</ul>`);
    if (d.TEM_PDF) $('#m-pdf', c).onclick = () => abrirPdf('recibo.pdf', { id });
  } catch (err) { aviso(err.message, true); }
}

function gerarNovoLink(r) {
  const c = modal(`<h2>Novo link — ${esc(r.PROTOCOLO)}</h2>
    <p>O link anterior deixará de funcionar imediatamente.</p>
    <label>Validade (dias, 0 = sem prazo)<input type="number" id="m-val" min="0" max="365" value="${S.config.VALIDADE_DIAS}"></label>
    <button class="btn azul" id="m-gerar">Gerar novo link</button>`);
  $('#m-gerar', c).onclick = async () => {
    try { const x = await api('recibo.novoLink', { id: r.ID_RECIBO, validadeDias: $('#m-val', c).value }); modalLink(x, false); carregarDados(true).catch(() => {}); }
    catch (err) { aviso(err.message, true); }
  };
}

function cancelar(r) {
  const c = modal(`<h2>Cancelar ${esc(r.PROTOCOLO)}</h2>
    <p>${r.STATUS === 'ASSINADO' ? 'O PDF assinado será preservado no Drive, mas o recibo passará a constar como CANCELADO. Para corrigir dados, emita um novo recibo.' : 'O link do funcionário será revogado imediatamente.'}</p>
    <label>Motivo (obrigatório)<textarea id="m-motivo" rows="3" maxlength="300"></textarea></label>
    <button class="btn perigo" id="m-conf">Confirmar cancelamento</button>`);
  $('#m-conf', c).onclick = async () => {
    try { await api('recibo.cancelar', { id: r.ID_RECIBO, motivo: $('#m-motivo', c).value }); fecharModal(); aviso('Recibo cancelado.'); carregarDados(true); }
    catch (err) { aviso(err.message, true); }
  };
}

/* ================= FUNCIONÁRIOS ================= */

$('#ff-busca').addEventListener('input', renderFuncionarios);
$('#b-add-func').onclick = () => formFuncionario(null);

function renderFuncionarios() {
  const q = $('#ff-busca').value.toLowerCase().trim(), qd = digitos(q);
  const lista = S.funcionarios.filter(f => !q || f.NOME.toLowerCase().includes(q) || (qd && digitos(f.CPF).includes(qd)) || String(f.MATRICULA).toLowerCase().includes(q));
  $('#tb-func').innerHTML = lista.length ? `<tr><th>Matrícula</th><th>Nome</th><th>CPF</th><th>Posto</th><th>Celular</th><th>Status</th><th>Ações</th></tr>` +
    lista.map(f => `<tr><td>${esc(f.MATRICULA)}</td><td>${esc(f.NOME)}</td><td>${esc(mascaraCpf(f.CPF))}</td><td>${esc(f.POSTO)}</td><td>${esc(f.TELEFONE)}</td>
      <td>${f.STATUS === 'ATIVO' ? 'Ativo' : 'Inativo'}</td><td><div class="acoes">
      ${pode('funcionario.editar') ? `<button data-f="editar" data-id="${f.ID_FUNCIONARIO}">Editar</button>` : ''}
      ${pode('recibo.criar') && f.STATUS === 'ATIVO' ? `<button data-f="recibo" data-id="${f.ID_FUNCIONARIO}">Novo recibo</button>` : ''}
      <button data-f="hist" data-id="${f.ID_FUNCIONARIO}">Recibos</button></div></td></tr>`).join('')
    : '<tr><td class="vazio">Nenhum funcionário cadastrado.</td></tr>';
}

$('#tb-func').addEventListener('click', e => {
  const b = e.target.closest('button[data-f]');
  if (!b) return;
  const f = S.funcionarios.find(x => x.ID_FUNCIONARIO === b.dataset.id);
  if (b.dataset.f === 'editar') formFuncionario(f);
  if (b.dataset.f === 'recibo') { irPara('novo'); selecionarFunc(f); }
  if (b.dataset.f === 'hist') { $('#fl-status').value = ''; $('#fl-busca').value = f.NOME; irPara('lista', $('#menu [data-tela="lista"]')); }
});

function formFuncionario(f, aoSalvar) {
  const v = f || { STATUS: 'ATIVO' };
  const c = modal(`<h2>${f ? 'Editar' : 'Cadastrar'} funcionário</h2><form id="f-func">
    <label>Nome completo<input name="NOME" required value="${esc(v.NOME)}"></label>
    <div class="linha-campos"><label>CPF<input name="CPF" required inputmode="numeric" value="${esc(v.CPF)}"></label><label>Matrícula<input name="MATRICULA" value="${esc(v.MATRICULA)}"></label></div>
    <div class="linha-campos"><label>Celular (WhatsApp)<input name="TELEFONE" inputmode="tel" placeholder="(24) 99999-9999" value="${esc(v.TELEFONE)}"></label><label>E-mail (opcional)<input name="EMAIL" type="email" value="${esc(v.EMAIL)}"></label></div>
    <div class="linha-campos"><label>Posto de serviço<input name="POSTO" value="${esc(v.POSTO)}"></label>
      <label>Status<select name="STATUS"><option value="ATIVO">Ativo</option><option value="INATIVO">Inativo</option></select></label></div>
    <button class="btn azul">Salvar funcionário</button></form>`);
  const ff = $('#f-func', c);
  ff.STATUS.value = v.STATUS;
  ff.CPF.addEventListener('input', () => { const d = digitos(ff.CPF.value).slice(0, 11); ff.CPF.value = d.length === 11 ? formataCpf(d) : d; });
  ff.onsubmit = async e => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(ff));
    dados.ID_FUNCIONARIO = f ? f.ID_FUNCIONARIO : '';
    try {
      const salvo = await api('funcionario.salvar', { funcionario: dados });
      const i = S.funcionarios.findIndex(x => x.ID_FUNCIONARIO === salvo.ID_FUNCIONARIO);
      if (i >= 0) S.funcionarios[i] = salvo; else S.funcionarios.push(salvo);
      fecharModal(); aviso('Funcionário salvo.');
      preencherSelects(); renderAtual();
      if (aoSalvar) aoSalvar(salvo);
    } catch (err) { aviso(err.message, true); }
  };
}

/* ================= RELATÓRIOS ================= */

['#rl-agrup', '#rl-de', '#rl-ate', '#rl-status'].forEach(s => $(s).addEventListener('input', renderRelatorio));

function dadosRelatorio() {
  const lista = filtrarRecibos({ status: $('#rl-status').value, de: $('#rl-de').value, ate: $('#rl-ate').value, campoData: 'DATA_PAGAMENTO' }).filter(r => $('#rl-status').value || r.STATUS !== 'CANCELADO');
  const ag = $('#rl-agrup').value, grupos = {};
  lista.forEach(r => {
    const k = ag === 'mes' ? new Date(r.DATA_PAGAMENTO).toLocaleDateString('pt-BR', { month: 'long', year: 'numeric', timeZone: 'America/Sao_Paulo' }) : ag === 'func' ? r.NOME_FUNCIONARIO : r.TIPO_PAGAMENTO;
    (grupos[k] = grupos[k] || { qtd: 0, total: 0 }).qtd++;
    grupos[k].total += r.VALOR;
  });
  return { lista, grupos: Object.entries(grupos).sort((a, b) => b[1].total - a[1].total) };
}

function renderRelatorio() {
  const { lista, grupos } = dadosRelatorio();
  const total = lista.reduce((s, r) => s + r.VALOR, 0);
  const nome = { mes: 'Mês do pagamento', func: 'Funcionário', tipo: 'Tipo de pagamento' }[$('#rl-agrup').value];
  $('#relatorio').innerHTML = grupos.length ? `<div class="tabela-wrap"><table class="tabela"><tr><th>${nome}</th><th class="num">Recibos</th><th class="num">Total</th></tr>
    ${grupos.map(([k, g]) => `<tr><td>${esc(k)}</td><td class="num">${g.qtd}</td><td class="num">${brl(g.total)}</td></tr>`).join('')}
    <tr><td><b>Total geral</b></td><td class="num"><b>${lista.length}</b></td><td class="num"><b>${brl(total)}</b></td></tr></table></div>`
    : '<p class="vazio">Nenhum recibo no período selecionado.</p>';
}

$('#b-csv').onclick = () => {
  const { lista } = dadosRelatorio();
  if (!lista.length) return aviso('Nada para exportar.', true);
  const cols = ['PROTOCOLO', 'NOME_FUNCIONARIO', 'MATRICULA', 'CPF_MASC', 'POSTO', 'TIPO_PAGAMENTO', 'VALOR', 'PERIODO', 'DATA_PAGAMENTO', 'STATUS', 'DATA_ASSINATURA'];
  const linhas = [cols.join(';')].concat(lista.map(r => cols.map(c => {
    let v = c === 'VALOR' ? r.VALOR.toFixed(2).replace('.', ',') : /^DATA_/.test(c) ? (r[c] ? dataBr(r[c], c === 'DATA_ASSINATURA') : '') : r[c];
    v = String(v ?? '').replace(/"/g, '""');
    if (/^[=+\-@]/.test(v)) v = "'" + v;
    return `"${v}"`;
  }).join(';')));
  const blob = new Blob(['\ufeff' + linhas.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(blob), download: `relatorio_recibos_${Date.now()}.csv` });
  a.click();
};

$('#b-imprimir-rel').onclick = () => {
  const w = window.open('', '_blank');
  if (!w) return aviso('Permita pop-ups para imprimir.', true);
  const per = [$('#rl-de').value && 'de ' + dataBr($('#rl-de').value + 'T12:00'), $('#rl-ate').value && 'até ' + dataBr($('#rl-ate').value + 'T12:00')].filter(Boolean).join(' ');
  w.document.write(`<html><head><meta charset="utf-8"><title>Relatório de recibos</title><style>body{font-family:Arial,sans-serif;color:#171A20;padding:24px}table{width:100%;border-collapse:collapse}th,td{border-bottom:1px solid #C7CBD1;padding:7px;text-align:left}.num{text-align:right}h1{font-size:18px}</style></head>
    <body><h1>Relatório de recibos — ${esc($('#rl-agrup').selectedOptions[0].text)} ${esc(per)}</h1>${$('#relatorio').innerHTML.replace(/class="tabela"/, '')}<p style="font-size:11px;color:#737982">Gerado em ${new Date().toLocaleString('pt-BR')} por ${esc(S.usuario.nome)}</p></body></html>`);
  w.document.close(); w.focus(); w.print();
};

$('#b-zip').onclick = async () => {
  const ids = dadosRelatorio().lista.filter(r => r.STATUS === 'ASSINADO' || (r.STATUS === 'CANCELADO' && r.TEM_PDF)).map(r => r.ID_RECIBO);
  if (!ids.length) return aviso('Nenhum PDF assinado no filtro.', true);
  if (ids.length > 200) return aviso('Máximo de 200 PDFs por ZIP. Reduza o período.', true);
  try { const z = await api('recibo.zip', { ids }); baixar(z.nome, z.base64, 'application/zip'); }
  catch (err) { aviso(err.message, true); }
};

/* ================= CONFIGURAÇÕES ================= */

function renderConfig() {
  if (!pode('config.editar')) return;
  const f = $('#f-config');
  ['FRONTEND_URL', 'VALIDADE_DIAS', 'FUNC_BAIXA_PDF', 'FUNC_BAIXA_PDF_DIAS', 'EMAIL_RH', 'TEXTO_DECLARACAO', 'TEXTO_RODAPE'].forEach(k => (f[k].value = S.config[k] ?? ''));
  S.tiposEdit = [...S.config.TIPOS_RECIBO];
  renderTipos();
  $('#empresas-lista').innerHTML = S.empresas.map(e => `<div class="item-cfg"><div>${esc(e.RAZAO_SOCIAL)}${e.PADRAO === 'SIM' ? ' <span class="st st-ASSINADO">Padrão</span>' : ''}<small>CNPJ ${esc(e.CNPJ)}</small></div><button class="btn fino" data-emp="${esc(e.ID_EMPRESA)}">Editar</button></div>`).join('');
  if (pode('usuario.gerir')) api('usuario.listar', {}, { silencioso: true }).then(us => {
    $('#usuarios-lista').innerHTML = us.map(u => `<div class="item-cfg"><div>${esc(u.NOME)} — ${esc(u.LOGIN)}<small>${esc(u.PERFIL)} | ${u.ATIVO === 'SIM' ? 'ativo' : 'inativo'} | último acesso: ${dataBr(u.ULTIMO_ACESSO, true)}</small></div><button class="btn fino" data-user='${esc(JSON.stringify(u))}'>Editar</button></div>`).join('');
  }).catch(err => aviso(err.message, true));
}

function renderTipos() {
  $('#tipos-lista').innerHTML = S.tiposEdit.map((t, i) => `<span class="chip">${esc(t)}<button type="button" data-rm="${i}" aria-label="Remover ${esc(t)}">×</button></span>`).join('');
}
$('#tipos-lista').addEventListener('click', e => { const b = e.target.closest('[data-rm]'); if (b) { S.tiposEdit.splice(Number(b.dataset.rm), 1); renderTipos(); } });
$('#b-add-tipo').onclick = () => { const v = $('#novo-tipo').value.trim(); if (v && !S.tiposEdit.includes(v)) { S.tiposEdit.push(v); renderTipos(); } $('#novo-tipo').value = ''; };

$('#f-config').onsubmit = async e => {
  e.preventDefault();
  const cfg = Object.fromEntries(new FormData(e.target));
  cfg.TIPOS_RECIBO = S.tiposEdit;
  if (!S.tiposEdit.length) return aviso('Mantenha ao menos um tipo de recibo.', true);
  try { S.config = await api('config.salvar', { config: cfg }); preencherSelects(); aviso('Configurações salvas.'); }
  catch (err) { aviso(err.message, true); }
};

$('#empresas-lista').addEventListener('click', e => { const b = e.target.closest('[data-emp]'); if (b) formEmpresa(S.empresas.find(x => x.ID_EMPRESA === b.dataset.emp)); });
$('#b-add-emp').onclick = () => formEmpresa(null);

function formEmpresa(emp) {
  const v = emp || { PADRAO: 'NAO', ATIVA: 'SIM' };
  const c = modal(`<h2>${emp ? 'Editar' : 'Adicionar'} empresa</h2><form id="f-emp">
    <label>Razão social<input name="RAZAO_SOCIAL" required value="${esc(v.RAZAO_SOCIAL)}"></label>
    <label>CNPJ<input name="CNPJ" required placeholder="00.000.000/0000-00" value="${esc(v.CNPJ)}"></label>
    <label>Endereço<input name="ENDERECO" value="${esc(v.ENDERECO)}"></label>
    <div class="linha-campos"><label>Telefone<input name="TELEFONE" value="${esc(v.TELEFONE)}"></label><label>E-mail<input name="EMAIL" value="${esc(v.EMAIL)}"></label></div>
    <label>ID do arquivo da logo no Drive (opcional, usado no PDF)<input name="LOGO_FILE_ID" value="${esc(v.LOGO_FILE_ID)}"></label>
    <div class="linha-campos"><label>Empresa padrão<select name="PADRAO"><option value="NAO">Não</option><option value="SIM">Sim</option></select></label>
      <label>Situação<select name="ATIVA"><option value="SIM">Ativa</option><option value="NAO">Inativa</option></select></label></div>
    <button class="btn azul">Salvar empresa</button></form>`);
  const f = $('#f-emp', c);
  f.PADRAO.value = v.PADRAO; f.ATIVA.value = v.ATIVA;
  f.onsubmit = async e => {
    e.preventDefault();
    const dados = Object.fromEntries(new FormData(f));
    dados.ID_EMPRESA = emp ? emp.ID_EMPRESA : '';
    try { S.empresas = await api('empresa.salvar', { empresa: dados }); fecharModal(); preencherSelects(); renderConfig(); aviso('Empresa salva.'); }
    catch (err) { aviso(err.message, true); }
  };
}

$('#usuarios-lista').addEventListener('click', e => { const b = e.target.closest('[data-user]'); if (b) formUsuario(JSON.parse(b.dataset.user)); });
$('#b-add-user').onclick = () => formUsuario(null);

function formUsuario(u) {
  const v = u || { PERFIL: 'RH', ATIVO: 'SIM' };
  const c = modal(`<h2>${u ? 'Editar' : 'Adicionar'} usuário</h2><form id="f-user">
    <label>Nome<input name="NOME" required value="${esc(v.NOME)}"></label>
    <label>Login<input name="LOGIN" required ${u ? 'readonly' : ''} value="${esc(v.LOGIN)}"></label>
    <div class="linha-campos"><label>Perfil<select name="PERFIL"><option value="ADMIN">ADMIN — tudo, inclusive usuários e configurações</option><option value="RH">RH — emite, envia e cancela pendentes</option><option value="CONSULTA">CONSULTA — só visualiza e baixa</option></select></label>
      <label>Situação<select name="ATIVO"><option value="SIM">Ativo</option><option value="NAO">Inativo</option></select></label></div>
    <label>${u ? 'Nova senha (deixe vazio para manter)' : 'Senha (mínimo 8 caracteres)'}<input name="senha" type="password" ${u ? '' : 'required'} minlength="8" autocomplete="new-password"></label>
    <button class="btn azul">Salvar usuário</button></form>`);
  const f = $('#f-user', c);
  f.PERFIL.value = v.PERFIL; f.ATIVO.value = v.ATIVO;
  f.onsubmit = async e => {
    e.preventDefault();
    try { await api('usuario.salvar', { usuario: Object.fromEntries(new FormData(f)) }); fecharModal(); renderConfig(); aviso('Usuário salvo.'); }
    catch (err) { aviso(err.message, true); }
  };
}

/* ================= PÁGINA DO FUNCIONÁRIO ================= */

async function iniciarFuncionario(token) {
  mostrarView('v-func');
  const area = $('#func-conteudo');
  try {
    const d = await api('pub.recibo', { token }, { silencioso: true });
    S.config.TEXTO_RODAPE = d.config?.TEXTO_RODAPE || S.config.TEXTO_RODAPE;
    if (d.STATUS === 'ASSINADO') return telaSucesso(area, token, d, true);
    area.innerHTML = htmlFolha(d, { livre: true }) + `
      <div class="vidro passo">
        <h3>Algum dado está errado?</h3>
        <p class="sub">Se o valor, o período ou outro dado não confere, não assine. Informe o Departamento Pessoal.</p>
        <button class="btn fino" id="b-div">Informar divergência ao RH</button>
        <div id="div-area" hidden style="margin-top:12px"><label>Descreva o que está diferente<textarea id="div-texto" rows="3" maxlength="1000"></textarea></label><button class="btn prata" id="b-div-enviar">Enviar ao Departamento Pessoal</button></div>
      </div>
      <div class="vidro passo">
        <h3>Assine com o dedo</h3>
        <label class="declara"><input type="checkbox" id="aceite"><span>${esc(d.config.TEXTO_DECLARACAO)}</span></label>
        <div class="quadro"><canvas id="canvas-ass" aria-label="Quadro de assinatura"></canvas><div class="base"></div><div class="dica" id="dica-ass">Assine aqui</div></div>
        <div class="botoes-ass"><button class="btn fino" id="b-limpar">LIMPAR ASSINATURA</button><button class="btn azul" id="b-assinar">CONFIRMAR ASSINATURA</button></div>
        <p class="erro" id="ass-erro" role="alert"></p>
      </div>`;
    const pad = criarPad($('#canvas-ass'), () => ($('#dica-ass').hidden = true));
    $('#b-limpar').onclick = () => { pad.limpar(); $('#dica-ass').hidden = false; };
    $('#b-div').onclick = () => ($('#div-area').hidden = !$('#div-area').hidden);
    $('#b-div-enviar').onclick = async () => {
      try { await api('pub.divergencia', { token, texto: $('#div-texto').value }); $('#div-area').innerHTML = '<p>Apontamento enviado. O Departamento Pessoal vai entrar em contato.</p>'; }
      catch (err) { aviso(err.message, true); }
    };
    $('#b-assinar').onclick = async () => {
      const erro = $('#ass-erro');
      erro.textContent = '';
      if (!$('#aceite').checked) return (erro.textContent = 'Marque a declaração de conferência antes de assinar.');
      if (!pad.valida()) return (erro.textContent = 'Faça sua assinatura no quadro branco.');
      const btn = $('#b-assinar');
      btn.disabled = true; btn.textContent = 'REGISTRANDO…';
      try {
        const r = await api('pub.assinar', { token, assinatura: pad.exportar(), aceite: true, dispositivo: navigator.userAgent.slice(0, 250) });
        telaSucesso(area, token, r, false);
        window.scrollTo({ top: 0, behavior: 'smooth' });
      } catch (err) {
        erro.textContent = err.message;
        btn.disabled = false; btn.textContent = 'CONFIRMAR ASSINATURA';
      }
    };
  } catch (err) {
    area.innerHTML = `<div class="vidro falha"><h2>Não foi possível abrir o recibo</h2><p class="sub">${esc(err.message)}</p></div>`;
  }
}

function telaSucesso(area, token, d, jaAssinado) {
  area.innerHTML = `<div class="vidro sucesso"><div class="check">✓</div>
    <h2>${jaAssinado ? 'Este recibo já está assinado' : 'RECIBO ASSINADO COM SUCESSO!'}</h2>
    <p>${jaAssinado ? `Assinatura registrada em ${dataBr(d.DATA_ASSINATURA, true)}. Protocolo ${esc(d.PROTOCOLO)}.`
      : `Sua assinatura foi registrada e o documento foi encaminhado ao Departamento Pessoal da Vegas Vigilância.<br><br>Obrigado!<br><small>Protocolo ${esc(d.PROTOCOLO)}</small>`}</p>
    ${d.PODE_BAIXAR ? '<button class="btn prata" id="b-comprovante">Visualizar comprovante</button>' : ''}</div>`;
  if (d.PODE_BAIXAR) $('#b-comprovante').onclick = () => abrirPdf('pub.comprovante', { token });
}

function criarPad(canvas, aoDesenhar) {
  const ctx = canvas.getContext('2d');
  let tracos = [], atual = null, base = null;
  const escalaTela = () => { const r = canvas.getBoundingClientRect(); return base ? Math.min(r.width / base.w, r.height / base.h) : 1; };
  const ponto = e => { const r = canvas.getBoundingClientRect(), k = escalaTela(); return { x: (e.clientX - r.left) / k, y: (e.clientY - r.top) / k }; };

  function desenhar(c, k, lista) {
    c.lineCap = 'round'; c.lineJoin = 'round'; c.strokeStyle = '#000'; c.fillStyle = '#000';
    c.lineWidth = 2.6 * k;
    lista.forEach(t => {
      c.beginPath();
      if (t.length === 1) { c.arc(t[0].x * k, t[0].y * k, c.lineWidth / 2, 0, Math.PI * 2); c.fill(); return; }
      c.moveTo(t[0].x * k, t[0].y * k);
      for (let i = 1; i < t.length - 1; i++) c.quadraticCurveTo(t[i].x * k, t[i].y * k, (t[i].x + t[i + 1].x) / 2 * k, (t[i].y + t[i + 1].y) / 2 * k);
      const u = t[t.length - 1];
      c.lineTo(u.x * k, u.y * k);
      c.stroke();
    });
  }

  const dpr = () => Math.max(1, window.devicePixelRatio || 1);
  function redesenhar() {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
    desenhar(ctx, escalaTela() * dpr(), tracos);
  }
  function ajustar() {
    const r = canvas.getBoundingClientRect();
    canvas.width = Math.round(r.width * dpr()); canvas.height = Math.round(r.height * dpr());
    redesenhar();
  }

  canvas.addEventListener('pointerdown', e => {
    e.preventDefault();
    canvas.setPointerCapture(e.pointerId);
    if (!base) { const r = canvas.getBoundingClientRect(); base = { w: r.width, h: r.height }; }
    atual = [ponto(e)];
    tracos.push(atual);
    aoDesenhar && aoDesenhar();
    redesenhar();
  });
  canvas.addEventListener('pointermove', e => {
    if (!atual) return;
    e.preventDefault();
    const evs = e.getCoalescedEvents ? e.getCoalescedEvents() : [];
    (evs.length ? evs : [e]).forEach(ev => atual.push(ponto(ev)));
    redesenhar();
  });
  const fim = () => { atual = null; };
  canvas.addEventListener('pointerup', fim);
  canvas.addEventListener('pointercancel', fim);
  canvas.addEventListener('touchmove', e => e.preventDefault(), { passive: false });

  let tAjuste;
  new ResizeObserver(() => { clearTimeout(tAjuste); tAjuste = setTimeout(ajustar, 60); }).observe(canvas);
  ajustar();

  const caixa = () => {
    const pts = tracos.flat();
    return { x0: Math.min(...pts.map(p => p.x)), x1: Math.max(...pts.map(p => p.x)), y0: Math.min(...pts.map(p => p.y)), y1: Math.max(...pts.map(p => p.y)) };
  };

  return {
    limpar() { tracos = []; base = null; ajustar(); },
    valida() {
      if (!base || tracos.reduce((s, t) => s + t.length, 0) < 12) return false;
      const b = caixa();
      return (b.x1 - b.x0) > base.w * 0.12 || (b.y1 - b.y0) > base.h * 0.2;
    },
    exportar() {
      const K = 2, M = 12, b = caixa();
      const out = document.createElement('canvas');
      out.width = Math.round((b.x1 - b.x0 + M * 2) * K); out.height = Math.round((b.y1 - b.y0 + M * 2) * K);
      const c = out.getContext('2d');
      c.fillStyle = '#fff'; c.fillRect(0, 0, out.width, out.height);
      c.translate((M - b.x0) * K, (M - b.y0) * K);
      desenhar(c, K, tracos);
      return out.toDataURL('image/png');
    }
  };
}

/* ================= INÍCIO ================= */

if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});

(async function iniciar() {
  const token = new URLSearchParams(location.search).get('r');
  if (token) return iniciarFuncionario(token);
  const salvo = JSON.parse(sessionStorage.getItem('vg_sessao') || 'null');
  if (salvo && salvo.sessao) {
    S.sessao = salvo.sessao;
    try { await entrarApp(salvo.usuario, salvo.perms); return; } catch { sessionStorage.removeItem('vg_sessao'); S.sessao = null; }
  }
  mostrarView('v-login');
})();
