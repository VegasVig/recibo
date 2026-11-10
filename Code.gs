/** RECIBOS DIGITAIS — VEGAS | Backend (Google Apps Script) */

const APP = {
  TZ: 'America/Sao_Paulo',
  PASTA_RECIBOS: 'VEGAS_RH_RECIBOS_ASSINADOS',
  PASTA_ASSINATURAS: 'VEGAS_RH_ASSINATURAS',
  SESSAO_SEG: 8 * 3600,
  VERSAO_DOC: '1.0'
};

const ABAS = {
  FUNCIONARIOS: ['ID_FUNCIONARIO','MATRICULA','NOME','CPF','TELEFONE','EMAIL','POSTO','STATUS','CRIADO_EM'],
  RECIBOS: ['ID_RECIBO','PROTOCOLO','ID_FUNCIONARIO','NOME_FUNCIONARIO','CPF','TIPO_PAGAMENTO','DESCRICAO','VALOR',
    'VALOR_DIARIO','QUANTIDADE_DIAS','PERIODO','DATA_PAGAMENTO','FORMA_PAGAMENTO','IDENTIFICACAO_TRANSACAO','OBSERVACOES',
    'TOKEN_HASH','DATA_EMISSAO','DATA_EXPIRACAO','STATUS','DATA_ASSINATURA','ID_ARQUIVO_PDF','URL_PDF_RESTRITA',
    'MATRICULA','POSTO','TELEFONE','ID_EMPRESA','EMPRESA_JSON','VALOR_EXTENSO','HASH_CONTEUDO','EMITIDO_POR',
    'MOTIVO_CANCELAMENTO','DIVERGENCIA'],
  ASSINATURAS: ['ID_ASSINATURA','ID_RECIBO','NOME_FUNCIONARIO','DATA_HORA_SERVIDOR','ID_ARQUIVO_ASSINATURA','HASH_DOCUMENTO',
    'VERSAO_DOCUMENTO','CONFIRMACAO_RECEBIMENTO','HASH_CONTEUDO','DISPOSITIVO'],
  HISTORICO: ['ID_EVENTO','ID_RECIBO','DATA_HORA','RESPONSAVEL','ACAO','DESCRICAO'],
  CONFIGURACOES: ['CHAVE','VALOR'],
  EMPRESAS: ['ID_EMPRESA','RAZAO_SOCIAL','CNPJ','ENDERECO','TELEFONE','EMAIL','LOGO_FILE_ID','PADRAO','ATIVA'],
  USUARIOS: ['LOGIN','NOME','PERFIL','SALT','SENHA_HASH','ATIVO','ULTIMO_ACESSO']
};

const COLUNAS_TEXTO = ['CPF','TELEFONE','MATRICULA','PROTOCOLO','CNPJ','IDENTIFICACAO_TRANSACAO','PERIODO'];

const PERMISSOES = {
  'painel.ver':          ['ADMIN','RH','CONSULTA'],
  'recibo.criar':        ['ADMIN','RH'],
  'recibo.ver':          ['ADMIN','RH','CONSULTA'],
  'recibo.link':         ['ADMIN','RH'],
  'recibo.cancelar':     ['ADMIN','RH'],
  'recibo.cancelarAssinado': ['ADMIN'],
  'recibo.pdf':          ['ADMIN','RH','CONSULTA'],
  'funcionario.editar':  ['ADMIN','RH'],
  'config.editar':       ['ADMIN'],
  'usuario.gerir':       ['ADMIN']
};

const TIPOS_PADRAO = ['Auxílio-alimentação','Vale-transporte','Salário','Adiantamento','Diárias','Serviços extras','Outros pagamentos'];

const EMPRESAS_PADRAO = [
  ['VEGAS SEGURANÇA E TECNOLOGIA PREVENTIVA LTDA','33.549.671/0001-65','AV. N. SRA. DO AMPARO Nº 99 – NITERÓI – VOLTA REDONDA/RJ – CEP 27.211-450','(24) 98131-1390','rh2@vegasvigilancia.com.br','SIM'],
  ['VEGAS VIGILÂNCIA E SEGURANÇA LTDA','29.890.721/0001-04','','','','NAO'],
  ['VEGAS ALARMES MONITORADOS LTDA','46.937.114/0001-63','','','','NAO'],
  ['VEGAS MONITORAMENTO ELETRONICO E SERVIÇOS TERCEIRIZADOS LTDA','50.196.573/0001-00','','','','NAO'],
  ['VEGAS MONITORAMENTO ELETRONICO E SERVIÇOS – NITERÓI','50.196.573/0002-91','','','','NAO'],
  ['SERVIÇOS CORPORATIVOS VGS LTDA','46.955.475/0001-32','','','','NAO']
];

const CONFIG_PADRAO = {
  FRONTEND_URL: 'https://vegasvig.github.io/recibos/',
  VALIDADE_DIAS: '7',
  FUNC_BAIXA_PDF: 'SIM',
  FUNC_BAIXA_PDF_DIAS: '30',
  EMAIL_RH: 'rh2@vegasvigilancia.com.br',
  TIPOS_RECIBO: JSON.stringify(TIPOS_PADRAO),
  TEXTO_DECLARACAO: 'Declaro que conferi as informações deste recibo e confirmo o recebimento do valor e da descrição nele indicados.',
  TEXTO_RODAPE: 'Este recibo é válido como comprovante de pagamento, conforme descrito acima.'
};

/* ============ INSTALAÇÃO ============ */

function setup() {
  const ss = planilha_();
  Object.keys(ABAS).forEach(nome => {
    let sh = ss.getSheetByName(nome);
    if (!sh) sh = ss.insertSheet(nome);
    const cab = ABAS[nome];
    sh.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold').setBackground('#171A20').setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
    cab.forEach((c, i) => { if (COLUNAS_TEXTO.includes(c)) sh.getRange(2, i + 1, sh.getMaxRows() - 1, 1).setNumberFormat('@'); });
  });
  if (!tabela_('EMPRESAS').length) EMPRESAS_PADRAO.forEach(e => inserir_('EMPRESAS', {
    ID_EMPRESA: uid_(), RAZAO_SOCIAL: e[0], CNPJ: e[1], ENDERECO: e[2], TELEFONE: e[3], EMAIL: e[4], LOGO_FILE_ID: '', PADRAO: e[5], ATIVA: 'SIM'
  }));
  const cfg = configMapa_();
  Object.keys(CONFIG_PADRAO).forEach(k => { if (cfg[k] === undefined) inserir_('CONFIGURACOES', { CHAVE: k, VALOR: CONFIG_PADRAO[k] }); });
  pastaRaiz_(APP.PASTA_RECIBOS);
  pastaRaiz_(APP.PASTA_ASSINATURAS);
  if (!tabela_('USUARIOS').length) {
    const senha = Utilities.getUuid().slice(0, 12);
    salvarUsuario_({ LOGIN: 'admin', NOME: 'Administrador', PERFIL: 'ADMIN', ATIVO: 'SIM', senha: senha });
    Logger.log('USUÁRIO INICIAL: admin | SENHA: ' + senha + '  (troque no primeiro acesso)');
  }
  Logger.log('Setup concluído.');
}

/* ============ ROTEADOR ============ */

const ROTAS = {
  'login': r => login_(r),
  'sessao.sair': r => { CacheService.getScriptCache().remove('S_' + sha_(r.sessao || '')); return true; },
  'sessao.senha': r => trocarSenha_(r),
  'painel.dados': r => (auth_(r, 'painel.ver'), dadosPainel_()),
  'recibo.criar': r => criarRecibo_(r, auth_(r, 'recibo.criar')),
  'recibo.listar': r => (auth_(r, 'recibo.ver'), listarRecibos_()),
  'recibo.detalhe': r => (auth_(r, 'recibo.ver'), detalheRecibo_(r.id)),
  'recibo.novoLink': r => novoLink_(r, auth_(r, 'recibo.link')),
  'recibo.cancelar': r => cancelarRecibo_(r, auth_(r, 'recibo.cancelar')),
  'recibo.pdf': r => (auth_(r, 'recibo.pdf'), pdfRecibo_(r.id)),
  'recibo.assinatura': r => (auth_(r, 'recibo.ver'), imagemAssinatura_(r.id)),
  'recibo.zip': r => zipRecibos_(r, auth_(r, 'recibo.pdf')),
  'funcionario.listar': r => (auth_(r, 'recibo.ver'), listarFuncionarios_()),
  'funcionario.salvar': r => salvarFuncionario_(r.funcionario, auth_(r, 'funcionario.editar')),
  'config.salvar': r => salvarConfig_(r, auth_(r, 'config.editar')),
  'empresa.salvar': r => salvarEmpresa_(r.empresa, auth_(r, 'config.editar')),
  'usuario.listar': r => (auth_(r, 'usuario.gerir'), listarUsuarios_()),
  'usuario.salvar': r => (auth_(r, 'usuario.gerir'), salvarUsuario_(r.usuario), true),
  'pub.recibo': r => publicoRecibo_(r.token),
  'pub.assinar': r => assinar_(r),
  'pub.divergencia': r => divergencia_(r),
  'pub.comprovante': r => comprovante_(r.token)
};

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    const fn = ROTAS[req.action];
    if (!fn) throw falha_('Ação inválida.');
    out = { ok: true, data: fn(req) };
  } catch (err) {
    if (!err.publico) console.error(err && err.stack ? err.stack : err);
    out = { ok: false, error: err.publico ? err.message : 'Erro interno no servidor. Tente novamente.', codigo: err.codigo || '' };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'recibos-vegas' })).setMimeType(ContentService.MimeType.JSON);
}

/* ============ AUTENTICAÇÃO E PERMISSÕES ============ */

function login_(r) {
  const login = String(r.login || '').trim().toLowerCase();
  const cache = CacheService.getScriptCache();
  const kTent = 'T_' + login;
  const tent = Number(cache.get(kTent) || 0);
  if (tent >= 5) throw falha_('Muitas tentativas. Aguarde 15 minutos.');
  const u = tabela_('USUARIOS').find(x => String(x.LOGIN).toLowerCase() === login && x.ATIVO === 'SIM');
  if (!u || hashSenha_(String(r.senha || ''), u.SALT) !== u.SENHA_HASH) {
    cache.put(kTent, String(tent + 1), 900);
    throw falha_('Usuário ou senha inválidos.');
  }
  cache.remove(kTent);
  const sessao = token_();
  const dados = { login: u.LOGIN, nome: u.NOME, perfil: u.PERFIL };
  cache.put('S_' + sha_(sessao), JSON.stringify(dados), APP.SESSAO_SEG);
  atualizar_('USUARIOS', u._linha, { ULTIMO_ACESSO: new Date() });
  return { sessao: sessao, usuario: dados, permissoes: permissoesDe_(u.PERFIL), config: configPublica_() };
}

function auth_(r, perm) {
  const raw = r.sessao ? CacheService.getScriptCache().get('S_' + sha_(r.sessao)) : null;
  if (!raw) throw falha_('Sessão expirada. Entre novamente.', 'SESSAO');
  const u = JSON.parse(raw);
  if (perm && !(PERMISSOES[perm] || []).includes(u.perfil)) throw falha_('Seu perfil não tem permissão para esta ação.');
  return u;
}

function pode_(u, perm) { return (PERMISSOES[perm] || []).includes(u.perfil); }

function permissoesDe_(perfil) { return Object.keys(PERMISSOES).filter(p => PERMISSOES[p].includes(perfil)); }

function hashSenha_(senha, salt) {
  let h = salt + '|' + senha;
  for (let i = 0; i < 300; i++) h = sha_(h + salt);
  return h;
}

function salvarUsuario_(u) {
  const login = String(u.LOGIN || '').trim().toLowerCase();
  if (!/^[a-z0-9._-]{3,30}$/.test(login)) throw falha_('Login inválido (3 a 30 caracteres: letras, números, ponto, hífen).');
  if (!['ADMIN','RH','CONSULTA'].includes(u.PERFIL)) throw falha_('Perfil inválido.');
  const atual = tabela_('USUARIOS').find(x => String(x.LOGIN).toLowerCase() === login);
  const dados = { LOGIN: login, NOME: texto_(u.NOME, 80, true), PERFIL: u.PERFIL, ATIVO: u.ATIVO === 'NAO' ? 'NAO' : 'SIM' };
  if (u.senha) {
    if (String(u.senha).length < 8) throw falha_('A senha precisa ter ao menos 8 caracteres.');
    dados.SALT = Utilities.getUuid();
    dados.SENHA_HASH = hashSenha_(String(u.senha), dados.SALT);
  } else if (!atual) throw falha_('Informe a senha do novo usuário.');
  if (atual && atual.PERFIL === 'ADMIN' && atual.ATIVO === 'SIM' && (dados.PERFIL !== 'ADMIN' || dados.ATIVO !== 'SIM')) {
    const outros = tabela_('USUARIOS').filter(x => x.PERFIL === 'ADMIN' && x.ATIVO === 'SIM' && x.LOGIN !== atual.LOGIN);
    if (!outros.length) throw falha_('É preciso manter ao menos um ADMIN ativo.');
  }
  if (atual) atualizar_('USUARIOS', atual._linha, dados); else inserir_('USUARIOS', dados);
}

function trocarSenha_(r) {
  const s = auth_(r);
  const u = tabela_('USUARIOS').find(x => x.LOGIN === s.login);
  if (!u || hashSenha_(String(r.atual || ''), u.SALT) !== u.SENHA_HASH) throw falha_('Senha atual incorreta.');
  salvarUsuario_({ LOGIN: u.LOGIN, NOME: u.NOME, PERFIL: u.PERFIL, ATIVO: 'SIM', senha: r.nova });
  return true;
}

function listarUsuarios_() {
  return tabela_('USUARIOS').map(u => ({ LOGIN: u.LOGIN, NOME: u.NOME, PERFIL: u.PERFIL, ATIVO: u.ATIVO, ULTIMO_ACESSO: iso_(u.ULTIMO_ACESSO) }));
}

/* ============ PAINEL / CONFIG ============ */

function dadosPainel_() {
  return {
    config: configPublica_(),
    empresas: tabela_('EMPRESAS').filter(e => e.ATIVA === 'SIM').map(limpa_),
    funcionarios: listarFuncionarios_(),
    recibos: listarRecibos_()
  };
}

function configPublica_() {
  const c = configMapa_();
  let tipos;
  try { tipos = JSON.parse(c.TIPOS_RECIBO || '[]'); } catch (e) { tipos = TIPOS_PADRAO; }
  return {
    FRONTEND_URL: c.FRONTEND_URL, VALIDADE_DIAS: Number(c.VALIDADE_DIAS || 7), FUNC_BAIXA_PDF: c.FUNC_BAIXA_PDF,
    FUNC_BAIXA_PDF_DIAS: Number(c.FUNC_BAIXA_PDF_DIAS || 30), EMAIL_RH: c.EMAIL_RH, TIPOS_RECIBO: tipos,
    TEXTO_DECLARACAO: c.TEXTO_DECLARACAO, TEXTO_RODAPE: c.TEXTO_RODAPE
  };
}

function salvarConfig_(r, u) {
  const c = r.config || {};
  const perm = ['FRONTEND_URL','VALIDADE_DIAS','FUNC_BAIXA_PDF','FUNC_BAIXA_PDF_DIAS','EMAIL_RH','TIPOS_RECIBO','TEXTO_DECLARACAO','TEXTO_RODAPE'];
  const lock = trava_();
  try {
    const linhas = tabela_('CONFIGURACOES');
    perm.forEach(k => {
      if (c[k] === undefined) return;
      let v = k === 'TIPOS_RECIBO' ? JSON.stringify((c[k] || []).map(t => texto_(t, 60)).filter(Boolean)) : texto_(c[k], 500);
      if (k === 'FRONTEND_URL' && !/^https:\/\/.+\/$/.test(v)) throw falha_('A URL do sistema deve começar com https:// e terminar com /');
      if (/_DIAS$/.test(k) && !(Number(v) >= 0 && Number(v) <= 365)) throw falha_('Prazo inválido (0 a 365 dias).');
      const l = linhas.find(x => x.CHAVE === k);
      if (l) atualizar_('CONFIGURACOES', l._linha, { VALOR: v }); else inserir_('CONFIGURACOES', { CHAVE: k, VALOR: v });
    });
    historico_('', u.login, 'CONFIG', 'Configurações atualizadas');
  } finally { lock.releaseLock(); }
  return configPublica_();
}

function salvarEmpresa_(e, u) {
  if (!e) throw falha_('Dados da empresa ausentes.');
  const dados = {
    RAZAO_SOCIAL: texto_(e.RAZAO_SOCIAL, 120, true), CNPJ: texto_(e.CNPJ, 20, true), ENDERECO: texto_(e.ENDERECO, 200),
    TELEFONE: texto_(e.TELEFONE, 30), EMAIL: texto_(e.EMAIL, 80), LOGO_FILE_ID: texto_(e.LOGO_FILE_ID, 80),
    PADRAO: e.PADRAO === 'SIM' ? 'SIM' : 'NAO', ATIVA: e.ATIVA === 'NAO' ? 'NAO' : 'SIM'
  };
  if (!/^\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}$/.test(dados.CNPJ)) throw falha_('CNPJ no formato 00.000.000/0000-00.');
  const lock = trava_();
  try {
    const todas = tabela_('EMPRESAS');
    if (dados.PADRAO === 'SIM') todas.filter(x => x.PADRAO === 'SIM' && x.ID_EMPRESA !== e.ID_EMPRESA).forEach(x => atualizar_('EMPRESAS', x._linha, { PADRAO: 'NAO' }));
    const atual = todas.find(x => x.ID_EMPRESA === e.ID_EMPRESA);
    if (atual) atualizar_('EMPRESAS', atual._linha, dados); else inserir_('EMPRESAS', Object.assign({ ID_EMPRESA: uid_() }, dados));
    historico_('', u.login, 'EMPRESA', 'Empresa salva: ' + dados.RAZAO_SOCIAL);
  } finally { lock.releaseLock(); }
  return tabela_('EMPRESAS').filter(x => x.ATIVA === 'SIM').map(limpa_);
}

/* ============ FUNCIONÁRIOS ============ */

function listarFuncionarios_() {
  return tabela_('FUNCIONARIOS').map(f => ({
    ID_FUNCIONARIO: f.ID_FUNCIONARIO, MATRICULA: f.MATRICULA, NOME: f.NOME, CPF: f.CPF, TELEFONE: f.TELEFONE,
    EMAIL: f.EMAIL, POSTO: f.POSTO, STATUS: f.STATUS
  }));
}

function salvarFuncionario_(f, u) {
  if (!f) throw falha_('Dados do funcionário ausentes.');
  const cpf = soDigitos_(f.CPF);
  if (!cpfValido_(cpf)) throw falha_('CPF inválido.');
  const dados = {
    MATRICULA: texto_(f.MATRICULA, 20), NOME: texto_(f.NOME, 100, true).toUpperCase(), CPF: formataCpf_(cpf),
    TELEFONE: texto_(f.TELEFONE, 20), EMAIL: texto_(f.EMAIL, 80), POSTO: texto_(f.POSTO, 60).toUpperCase(),
    STATUS: f.STATUS === 'INATIVO' ? 'INATIVO' : 'ATIVO'
  };
  const lock = trava_();
  try {
    const todos = tabela_('FUNCIONARIOS');
    const dup = todos.find(x => soDigitos_(x.CPF) === cpf && x.ID_FUNCIONARIO !== f.ID_FUNCIONARIO);
    if (dup) throw falha_('Já existe funcionário com este CPF: ' + dup.NOME);
    const atual = todos.find(x => x.ID_FUNCIONARIO === f.ID_FUNCIONARIO);
    let id;
    if (atual) { id = atual.ID_FUNCIONARIO; atualizar_('FUNCIONARIOS', atual._linha, dados); }
    else { id = uid_(); inserir_('FUNCIONARIOS', Object.assign({ ID_FUNCIONARIO: id, CRIADO_EM: new Date() }, dados)); }
    historico_('', u.login, 'FUNCIONARIO', (atual ? 'Atualizado: ' : 'Cadastrado: ') + dados.NOME);
    return Object.assign({ ID_FUNCIONARIO: id }, dados);
  } finally { lock.releaseLock(); }
}

/* ============ RECIBOS — ADMIN ============ */

function criarRecibo_(r, u) {
  const d = r.recibo || {};
  const lock = trava_();
  try {
    const func = tabela_('FUNCIONARIOS').find(x => x.ID_FUNCIONARIO === d.ID_FUNCIONARIO);
    if (!func) throw falha_('Selecione um funcionário cadastrado.');
    if (func.STATUS !== 'ATIVO') throw falha_('Funcionário inativo.');
    const emp = tabela_('EMPRESAS').find(x => x.ID_EMPRESA === d.ID_EMPRESA && x.ATIVA === 'SIM');
    if (!emp) throw falha_('Selecione a empresa emissora.');
    const tipos = configPublica_().TIPOS_RECIBO;
    if (!tipos.includes(d.TIPO_PAGAMENTO)) throw falha_('Tipo de recibo inválido.');

    const dias = Number(d.QUANTIDADE_DIAS || 0), diario = dinheiro_(d.VALOR_DIARIO);
    let valor = dinheiro_(d.VALOR);
    if (dias > 0 && diario > 0) valor = Math.round(dias * diario * 100) / 100;
    if (!(valor > 0) || valor > 1000000) throw falha_('Valor inválido.');
    if (dias < 0 || dias > 366 || !Number.isInteger(dias)) throw falha_('Quantidade de dias inválida.');

    const dataPag = dataIso_(d.DATA_PAGAMENTO, 'Data do pagamento');
    const validade = d.VALIDADE_DIAS === '' || d.VALIDADE_DIAS === undefined ? configPublica_().VALIDADE_DIAS : Number(d.VALIDADE_DIAS);
    if (!(validade >= 0 && validade <= 365)) throw falha_('Validade do link inválida.');

    const agora = new Date();
    const token = token_();
    const empresa = { RAZAO_SOCIAL: emp.RAZAO_SOCIAL, CNPJ: emp.CNPJ, ENDERECO: emp.ENDERECO, TELEFONE: emp.TELEFONE, EMAIL: emp.EMAIL, LOGO_FILE_ID: emp.LOGO_FILE_ID };
    const rec = {
      ID_RECIBO: uid_(), PROTOCOLO: protocolo_(agora), ID_FUNCIONARIO: func.ID_FUNCIONARIO, NOME_FUNCIONARIO: func.NOME,
      CPF: func.CPF, MATRICULA: func.MATRICULA, POSTO: texto_(d.POSTO || func.POSTO, 60).toUpperCase(), TELEFONE: func.TELEFONE,
      TIPO_PAGAMENTO: d.TIPO_PAGAMENTO, DESCRICAO: texto_(d.DESCRICAO, 300, true), VALOR: valor,
      VALOR_DIARIO: dias > 0 ? diario : '', QUANTIDADE_DIAS: dias > 0 ? dias : '', PERIODO: texto_(d.PERIODO, 60, true),
      DATA_PAGAMENTO: dataPag, FORMA_PAGAMENTO: texto_(d.FORMA_PAGAMENTO, 40, true),
      IDENTIFICACAO_TRANSACAO: texto_(d.IDENTIFICACAO_TRANSACAO, 120), OBSERVACOES: texto_(d.OBSERVACOES, 500),
      TOKEN_HASH: sha_(token), DATA_EMISSAO: agora, DATA_EXPIRACAO: validade > 0 ? new Date(agora.getTime() + validade * 86400000) : '',
      STATUS: 'PENDENTE', DATA_ASSINATURA: '', ID_ARQUIVO_PDF: '', URL_PDF_RESTRITA: '', ID_EMPRESA: emp.ID_EMPRESA,
      EMPRESA_JSON: JSON.stringify(empresa), VALOR_EXTENSO: extenso_(valor), HASH_CONTEUDO: '', EMITIDO_POR: u.login,
      MOTIVO_CANCELAMENTO: '', DIVERGENCIA: ''
    };
    inserir_('RECIBOS', rec);
    historico_(rec.ID_RECIBO, u.login, 'EMISSAO', 'Recibo ' + rec.PROTOCOLO + ' emitido — ' + brl_(valor));
    return { ID_RECIBO: rec.ID_RECIBO, PROTOCOLO: rec.PROTOCOLO, link: linkRecibo_(token), DATA_EXPIRACAO: iso_(rec.DATA_EXPIRACAO), TELEFONE: func.TELEFONE, NOME: func.NOME };
  } finally { lock.releaseLock(); }
}

function listarRecibos_() {
  const agora = Date.now();
  return tabela_('RECIBOS').map(r => ({
    ID_RECIBO: r.ID_RECIBO, PROTOCOLO: r.PROTOCOLO, ID_FUNCIONARIO: r.ID_FUNCIONARIO, NOME_FUNCIONARIO: r.NOME_FUNCIONARIO,
    CPF_MASC: mascaraCpf_(r.CPF), CPF_DIG: soDigitos_(r.CPF), MATRICULA: r.MATRICULA, TELEFONE: r.TELEFONE, POSTO: r.POSTO,
    TIPO_PAGAMENTO: r.TIPO_PAGAMENTO, VALOR: Number(r.VALOR), PERIODO: r.PERIODO, DATA_PAGAMENTO: iso_(r.DATA_PAGAMENTO),
    DATA_EMISSAO: iso_(r.DATA_EMISSAO), DATA_EXPIRACAO: iso_(r.DATA_EXPIRACAO), STATUS: statusEfetivo_(r, agora),
    DATA_ASSINATURA: iso_(r.DATA_ASSINATURA), TEM_PDF: !!r.ID_ARQUIVO_PDF, DIVERGENCIA: r.DIVERGENCIA ? 'SIM' : ''
  })).reverse();
}

function detalheRecibo_(id) {
  const r = acharRecibo_('ID_RECIBO', id);
  if (!r) throw falha_('Recibo não encontrado.');
  const v = visaoRecibo_(r, true);
  v.HISTORICO = tabela_('HISTORICO').filter(h => h.ID_RECIBO === id).map(h => ({ DATA_HORA: iso_(h.DATA_HORA), RESPONSAVEL: h.RESPONSAVEL, ACAO: h.ACAO, DESCRICAO: h.DESCRICAO }));
  v.ASSINATURA = tabela_('ASSINATURAS').filter(a => a.ID_RECIBO === id).map(a => ({ ID_ASSINATURA: a.ID_ASSINATURA, DATA_HORA_SERVIDOR: iso_(a.DATA_HORA_SERVIDOR), HASH_DOCUMENTO: a.HASH_DOCUMENTO, HASH_CONTEUDO: a.HASH_CONTEUDO, DISPOSITIVO: a.DISPOSITIVO }))[0] || null;
  return v;
}

function novoLink_(r, u) {
  const lock = trava_();
  try {
    const rec = acharRecibo_('ID_RECIBO', r.id);
    if (!rec) throw falha_('Recibo não encontrado.');
    const st = statusEfetivo_(rec, Date.now());
    if (!['PENDENTE','EXPIRADO'].includes(st)) throw falha_('Só é possível gerar link para recibos pendentes ou expirados.');
    const validade = r.validadeDias === undefined || r.validadeDias === '' ? configPublica_().VALIDADE_DIAS : Number(r.validadeDias);
    const token = token_();
    const exp = validade > 0 ? new Date(Date.now() + validade * 86400000) : '';
    atualizar_('RECIBOS', rec._linha, { TOKEN_HASH: sha_(token), DATA_EXPIRACAO: exp, STATUS: 'PENDENTE' });
    historico_(rec.ID_RECIBO, u.login, 'NOVO_LINK', 'Novo link gerado; o link anterior foi invalidado.');
    return { link: linkRecibo_(token), DATA_EXPIRACAO: iso_(exp), TELEFONE: rec.TELEFONE, NOME: rec.NOME_FUNCIONARIO, PROTOCOLO: rec.PROTOCOLO };
  } finally { lock.releaseLock(); }
}

function cancelarRecibo_(r, u) {
  const motivo = texto_(r.motivo, 300, true);
  if (motivo.length < 5) throw falha_('Descreva o motivo do cancelamento.');
  const lock = trava_();
  try {
    const rec = acharRecibo_('ID_RECIBO', r.id);
    if (!rec) throw falha_('Recibo não encontrado.');
    if (rec.STATUS === 'CANCELADO') throw falha_('Recibo já cancelado.');
    if (rec.STATUS === 'ASSINADO' && !pode_(u, 'recibo.cancelarAssinado')) throw falha_('Apenas ADMIN pode cancelar recibo assinado.');
    atualizar_('RECIBOS', rec._linha, { STATUS: 'CANCELADO', TOKEN_HASH: 'REVOGADO-' + uid_(), MOTIVO_CANCELAMENTO: motivo });
    historico_(rec.ID_RECIBO, u.login, 'CANCELAMENTO', motivo + (rec.STATUS === 'ASSINADO' ? ' (o PDF assinado foi preservado)' : ''));
    return true;
  } finally { lock.releaseLock(); }
}

function pdfRecibo_(id) {
  const r = acharRecibo_('ID_RECIBO', id);
  if (!r || !r.ID_ARQUIVO_PDF) throw falha_('PDF ainda não disponível para este recibo.');
  const f = DriveApp.getFileById(r.ID_ARQUIVO_PDF);
  return { nome: f.getName(), base64: Utilities.base64Encode(f.getBlob().getBytes()) };
}

function imagemAssinatura_(id) {
  const a = tabela_('ASSINATURAS').find(x => x.ID_RECIBO === id);
  if (!a) throw falha_('Assinatura não encontrada.');
  return 'data:image/png;base64,' + Utilities.base64Encode(DriveApp.getFileById(a.ID_ARQUIVO_ASSINATURA).getBlob().getBytes());
}

function zipRecibos_(r, u) {
  const ids = (r.ids || []).slice(0, 200);
  if (!ids.length) throw falha_('Nenhum recibo assinado no filtro.');
  const recs = tabela_('RECIBOS').filter(x => ids.includes(x.ID_RECIBO) && x.ID_ARQUIVO_PDF);
  const blobs = recs.map(x => DriveApp.getFileById(x.ID_ARQUIVO_PDF).getBlob());
  if (!blobs.length) throw falha_('Nenhum PDF encontrado.');
  const zip = Utilities.zip(blobs, 'recibos.zip');
  historico_('', u.login, 'EXPORTACAO', blobs.length + ' PDFs exportados em ZIP');
  return { nome: 'recibos_vegas_' + Utilities.formatDate(new Date(), APP.TZ, 'yyyyMMdd_HHmm') + '.zip', base64: Utilities.base64Encode(zip.getBytes()) };
}

/* ============ RECIBOS — FUNCIONÁRIO (PÚBLICO) ============ */

function reciboPorToken_(token) {
  if (!/^[a-f0-9]{64}$/.test(String(token || ''))) throw falha_('Link inválido.', 'LINK');
  const r = acharRecibo_('TOKEN_HASH', sha_(token));
  if (!r) throw falha_('Este link não é válido ou foi substituído por um novo. Solicite outro ao Departamento Pessoal.', 'LINK');
  return r;
}

function publicoRecibo_(token) {
  const r = reciboPorToken_(token);
  const st = statusEfetivo_(r, Date.now());
  if (st === 'CANCELADO') throw falha_('Este recibo foi cancelado pelo Departamento Pessoal.', 'LINK');
  if (st === 'EXPIRADO') {
    if (r.STATUS !== 'EXPIRADO') atualizar_('RECIBOS', r._linha, { STATUS: 'EXPIRADO' });
    throw falha_('O prazo deste link terminou. Solicite um novo link ao Departamento Pessoal.', 'LINK');
  }
  const v = visaoRecibo_(r, false);
  const cfg = configMapa_();
  v.config = { TEXTO_DECLARACAO: cfg.TEXTO_DECLARACAO, TEXTO_RODAPE: cfg.TEXTO_RODAPE };
  v.PODE_BAIXAR = st === 'ASSINADO' && podeBaixarFuncionario_(r);
  return v;
}

function assinar_(req) {
  if (req.aceite !== true) throw falha_('Marque a declaração de conferência para assinar.');
  const img = String(req.assinatura || '');
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(img) || img.length < 1500 || img.length > 600000) throw falha_('Assinatura inválida. Assine novamente no quadro.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(25000)) throw falha_('Servidor ocupado. Tente novamente em alguns segundos.');
  try {
    const r = reciboPorToken_(req.token);
    const st = statusEfetivo_(r, Date.now());
    if (st === 'ASSINADO') throw falha_('Este recibo já foi assinado.');
    if (st !== 'PENDENTE') throw falha_('Este recibo não está disponível para assinatura.', 'LINK');

    const agora = new Date();
    const bytesAss = Utilities.base64Decode(img.split(',')[1]);
    const ano = Utilities.formatDate(agora, APP.TZ, 'yyyy');
    const mesNome = MESES[Number(Utilities.formatDate(agora, APP.TZ, 'M')) - 1];
    const nomeBase = r.PROTOCOLO + ' - ' + r.NOME_FUNCIONARIO + ' - ' + r.TIPO_PAGAMENTO;

    const pastaAss = subpasta_(subpasta_(pastaRaiz_(APP.PASTA_ASSINATURAS), ano), mesNome);
    const arqAss = pastaAss.createFile(Utilities.newBlob(bytesAss, 'image/png', nomeBase + ' - assinatura.png'));

    const hashConteudo = sha_(JSON.stringify([r.ID_RECIBO, r.PROTOCOLO, r.NOME_FUNCIONARIO, r.CPF, r.TIPO_PAGAMENTO, r.DESCRICAO,
      Number(r.VALOR), r.PERIODO, iso_(r.DATA_PAGAMENTO), r.FORMA_PAGAMENTO, r.IDENTIFICACAO_TRANSACAO, r.EMPRESA_JSON, sha_(bytesAss)]));

    const v = visaoRecibo_(r, true);
    const html = htmlPdf_(v, { assinatura: img, dataHora: agora, hashConteudo: hashConteudo, idAssinatura: arqAss.getId() });
    const pdf = Utilities.newBlob(html, 'text/html', 'recibo.html').getAs('application/pdf').setName(nomeBase + '.pdf');
    const pastaPdf = subpasta_(subpasta_(pastaRaiz_(APP.PASTA_RECIBOS), ano), mesNome);
    const arqPdf = pastaPdf.createFile(pdf);
    const hashPdf = sha_(arqPdf.getBlob().getBytes());
    travaArquivo_(arqPdf.getId());
    travaArquivo_(arqAss.getId());

    atualizar_('RECIBOS', r._linha, {
      STATUS: 'ASSINADO', DATA_ASSINATURA: agora, ID_ARQUIVO_PDF: arqPdf.getId(), URL_PDF_RESTRITA: arqPdf.getUrl(), HASH_CONTEUDO: hashConteudo
    });
    inserir_('ASSINATURAS', {
      ID_ASSINATURA: uid_(), ID_RECIBO: r.ID_RECIBO, NOME_FUNCIONARIO: r.NOME_FUNCIONARIO, DATA_HORA_SERVIDOR: agora,
      ID_ARQUIVO_ASSINATURA: arqAss.getId(), HASH_DOCUMENTO: hashPdf, VERSAO_DOCUMENTO: APP.VERSAO_DOC,
      CONFIRMACAO_RECEBIMENTO: 'SIM — ' + configMapa_().TEXTO_DECLARACAO, HASH_CONTEUDO: hashConteudo,
      DISPOSITIVO: texto_(req.dispositivo, 250)
    });
    historico_(r.ID_RECIBO, 'FUNCIONARIO', 'ASSINATURA', 'Assinado pelo funcionário via link individual. SHA-256 do PDF: ' + hashPdf);
    return { PROTOCOLO: r.PROTOCOLO, DATA_ASSINATURA: iso_(agora), PODE_BAIXAR: podeBaixarFuncionario_(Object.assign({}, r, { DATA_ASSINATURA: agora })) };
  } finally { lock.releaseLock(); }
}

function divergencia_(req) {
  const texto = texto_(req.texto, 1000, true);
  if (texto.length < 5) throw falha_('Descreva a divergência.');
  const r = reciboPorToken_(req.token);
  if (statusEfetivo_(r, Date.now()) !== 'PENDENTE') throw falha_('Este recibo não aceita mais apontamentos.');
  const cache = CacheService.getScriptCache();
  if (cache.get('D_' + r.ID_RECIBO)) throw falha_('Seu apontamento já foi enviado. Aguarde o contato do Departamento Pessoal.');
  cache.put('D_' + r.ID_RECIBO, '1', 600);
  atualizar_('RECIBOS', r._linha, { DIVERGENCIA: Utilities.formatDate(new Date(), APP.TZ, 'dd/MM/yyyy HH:mm') + ' — ' + texto });
  historico_(r.ID_RECIBO, 'FUNCIONARIO', 'DIVERGENCIA', texto);
  const email = configMapa_().EMAIL_RH;
  if (email) {
    try {
      MailApp.sendEmail(email, 'Divergência no recibo ' + r.PROTOCOLO,
        'O funcionário ' + r.NOME_FUNCIONARIO + ' apontou divergência no recibo ' + r.PROTOCOLO + ' (' + r.TIPO_PAGAMENTO + ' — ' + brl_(r.VALOR) + '):\n\n' + texto);
    } catch (e) { console.error('Falha ao enviar e-mail de divergência: ' + e); }
  }
  return true;
}

function comprovante_(token) {
  const r = reciboPorToken_(token);
  if (statusEfetivo_(r, Date.now()) !== 'ASSINADO' || !podeBaixarFuncionario_(r)) throw falha_('Comprovante indisponível para download.');
  return pdfRecibo_(r.ID_RECIBO);
}

function podeBaixarFuncionario_(r) {
  const c = configMapa_();
  if (c.FUNC_BAIXA_PDF !== 'SIM') return false;
  const dias = Number(c.FUNC_BAIXA_PDF_DIAS || 30);
  return dias === 0 || (r.DATA_ASSINATURA && (Date.now() - new Date(r.DATA_ASSINATURA).getTime()) < dias * 86400000);
}

/* ============ VISÃO E PDF ============ */

function visaoRecibo_(r, completo) {
  const emp = JSON.parse(r.EMPRESA_JSON || '{}');
  return {
    ID_RECIBO: completo ? r.ID_RECIBO : undefined, PROTOCOLO: r.PROTOCOLO, STATUS: statusEfetivo_(r, Date.now()),
    EMPRESA: { RAZAO_SOCIAL: emp.RAZAO_SOCIAL, CNPJ: emp.CNPJ, ENDERECO: emp.ENDERECO, TELEFONE: emp.TELEFONE, EMAIL: emp.EMAIL },
    NOME_FUNCIONARIO: r.NOME_FUNCIONARIO, CPF: completo ? r.CPF : mascaraCpf_(r.CPF), MATRICULA: r.MATRICULA, POSTO: r.POSTO,
    TELEFONE: completo ? r.TELEFONE : undefined,
    TIPO_PAGAMENTO: r.TIPO_PAGAMENTO, DESCRICAO: r.DESCRICAO, VALOR: Number(r.VALOR), VALOR_EXTENSO: r.VALOR_EXTENSO,
    VALOR_DIARIO: r.VALOR_DIARIO === '' ? '' : Number(r.VALOR_DIARIO), QUANTIDADE_DIAS: r.QUANTIDADE_DIAS === '' ? '' : Number(r.QUANTIDADE_DIAS),
    PERIODO: r.PERIODO, DATA_PAGAMENTO: iso_(r.DATA_PAGAMENTO), FORMA_PAGAMENTO: r.FORMA_PAGAMENTO,
    IDENTIFICACAO_TRANSACAO: completo ? r.IDENTIFICACAO_TRANSACAO : mascaraTransacao_(r.IDENTIFICACAO_TRANSACAO, r.CPF),
    OBSERVACOES: r.OBSERVACOES, DATA_EMISSAO: iso_(r.DATA_EMISSAO), DATA_EXPIRACAO: iso_(r.DATA_EXPIRACAO),
    DATA_ASSINATURA: iso_(r.DATA_ASSINATURA), MOTIVO_CANCELAMENTO: completo ? r.MOTIVO_CANCELAMENTO : undefined,
    DIVERGENCIA: completo ? r.DIVERGENCIA : undefined, EMITIDO_POR: completo ? r.EMITIDO_POR : undefined,
    HASH_CONTEUDO: r.HASH_CONTEUDO, TEM_PDF: !!r.ID_ARQUIVO_PDF, LOGO_FILE_ID: emp.LOGO_FILE_ID || ''
  };
}

function htmlPdf_(v, a) {
  const e = esc_, E = v.EMPRESA;
  const dataHora = Utilities.formatDate(a.dataHora, APP.TZ, "dd/MM/yyyy 'às' HH:mm:ss");
  const det = [];
  if (v.QUANTIDADE_DIAS) det.push(['Cálculo', v.QUANTIDADE_DIAS + ' dia(s) × ' + brl_(v.VALOR_DIARIO) + ' por dia']);
  det.push(['Período de referência', v.PERIODO], ['Data do pagamento', dataBr_(v.DATA_PAGAMENTO)], ['Posto de serviço', v.POSTO || '—'],
    ['Forma de pagamento', v.FORMA_PAGAMENTO + (v.IDENTIFICACAO_TRANSACAO ? ' — ' + v.IDENTIFICACAO_TRANSACAO : '')]);
  if (v.MATRICULA) det.push(['Matrícula', v.MATRICULA]);
  if (v.OBSERVACOES) det.push(['Observações', v.OBSERVACOES]);
  det.push(['Valor pago', brl_(v.VALOR)]);
  return '<html><head><meta charset="utf-8"><style>' +
    '@page{size:A4;margin:0}html,body{margin:0;padding:0}body{font-family:Arial,Helvetica,sans-serif;color:#171A20;font-size:10.5pt}' +
    '.timb{position:absolute;top:0;left:0;width:210mm;height:297mm}' +
    '.pg{position:absolute;top:46mm;left:20mm;width:170mm}' +
    '.top{text-align:center;border-bottom:1px solid #C7CBD1;padding-bottom:5px}' +
    '.rz{font-size:11.5pt;font-weight:bold;letter-spacing:.4px}.sm{font-size:8pt;color:#454a52;line-height:1.4}' +
    'h1{font-size:15pt;letter-spacing:3px;text-align:center;margin:12px 0 2px}' +
    '.prot{text-align:center;font-size:8pt;color:#737982;margin-bottom:10px}' +
    '.corpo{font-size:10.5pt;line-height:1.5;text-align:justify;margin:0 0 10px}' +
    'table.d{width:100%;border-collapse:collapse;margin-bottom:8px}table.d td{border-bottom:1px solid #C7CBD1;padding:4px 5px;font-size:9.5pt}' +
    'table.d td.k{width:34%;color:#737982}table.d tr.t td{font-weight:bold;font-size:11pt;border-bottom:2px solid #171A20}' +
    '.ass{text-align:center;margin-top:10px}.ass img{height:62px;max-width:280px}.linha{border-top:1px solid #171A20;width:68%;margin:0 auto;padding-top:3px;font-weight:bold}' +
    '.aud{margin-top:8px;border:1px solid #C7CBD1;padding:5px 8px;font-size:6.8pt;color:#454a52;line-height:1.4;word-break:break-all;background:#fff}' +
    '.rod{font-size:8.5pt;color:#454a52;text-align:center;margin:6px 0 0}</style></head><body>' +
    '<img class="timb" src="' + timbrado_(v.LOGO_FILE_ID) + '">' +
    '<div class="pg"><div class="top"><div class="rz">' + e(E.RAZAO_SOCIAL) + '</div><div class="sm">CNPJ ' + e(E.CNPJ) + (E.ENDERECO ? ' &nbsp;|&nbsp; ' + e(E.ENDERECO) : '') +
    '<br>' + [E.TELEFONE, E.EMAIL].filter(Boolean).map(e).join(' &nbsp;|&nbsp; ') + '</div></div>' +
    '<h1>RECIBO DE PAGAMENTO</h1><div class="prot">Protocolo ' + e(v.PROTOCOLO) + ' &nbsp;|&nbsp; ' + e(v.TIPO_PAGAMENTO) + '</div>' +
    '<p class="corpo">Eu, <b>' + e(v.NOME_FUNCIONARIO) + '</b>, CPF <b>' + e(v.CPF) + '</b>, declaro que recebi de <b>' + e(E.RAZAO_SOCIAL) +
    '</b> a quantia de <b>' + brl_(v.VALOR) + '</b> (' + e(v.VALOR_EXTENSO) + '), referente a ' + e(v.DESCRICAO) + '.</p>' +
    '<table class="d">' + det.map((x, i) => '<tr' + (i === det.length - 1 ? ' class="t"' : '') + '><td class="k">' + e(x[0]) + '</td><td>' + e(x[1]) + '</td></tr>').join('') + '</table>' +
    '<div class="ass">' + (a.assinatura ? '<img src="' + a.assinatura + '">' : '<div style="height:62px"></div>') + '<div class="linha">' + e(v.NOME_FUNCIONARIO) + '</div>' +
    '<div class="sm">Assinado eletronicamente em ' + dataHora + ' (horário de Brasília, registrado pelo servidor)</div></div>' +
    '<p class="rod">' + e(configMapa_().TEXTO_RODAPE) + '</p>' +
    '<div class="aud"><b>Registro de autenticidade</b> &nbsp;|&nbsp; Protocolo ' + e(v.PROTOCOLO) + ' &nbsp;|&nbsp; ID ' + e(v.ID_RECIBO) +
    '<br>Emitido em ' + dataBr_(v.DATA_EMISSAO, true) + ' &nbsp;|&nbsp; Assinado em ' + dataHora +
    '<br>Declaração aceita: "' + e(configMapa_().TEXTO_DECLARACAO) + '"' +
    '<br>SHA-256 do conteúdo + assinatura: ' + a.hashConteudo +
    '<br>Assinatura eletrônica simples (manuscrita digitalizada) vinculada ao link individual e à trilha de auditoria. Não é certificado ICP-Brasil.</div>' +
    '</div></body></html>';
}

function timbrado_(fileId) {
  if (fileId) {
    try {
      const b = DriveApp.getFileById(fileId).getBlob();
      return 'data:' + b.getContentType() + ';base64,' + Utilities.base64Encode(b.getBytes());
    } catch (e) { console.error('Papel timbrado não acessível: ' + e); }
  }
  return TIMBRADO_PADRAO;
}

function testeTimbrado() {
  const v = {
    ID_RECIBO: 'TESTE', PROTOCOLO: 'VG0000-TESTE', NOME_FUNCIONARIO: 'FUNCIONÁRIO DE TESTE', CPF: '000.000.000-00', POSTO: 'SEDE',
    TIPO_PAGAMENTO: 'Auxílio-alimentação', DESCRICAO: 'auxílio alimentação', VALOR: 280, VALOR_EXTENSO: extenso_(280),
    QUANTIDADE_DIAS: 7, VALOR_DIARIO: 40, PERIODO: '05 a 13/10/2026', DATA_PAGAMENTO: new Date().toISOString(),
    DATA_EMISSAO: new Date().toISOString(), FORMA_PAGAMENTO: 'PIX', IDENTIFICACAO_TRANSACAO: 'Chave (CPF) 000.000.000-00',
    OBSERVACOES: '', MATRICULA: '123', LOGO_FILE_ID: '',
    EMPRESA: { RAZAO_SOCIAL: EMPRESAS_PADRAO[0][0], CNPJ: EMPRESAS_PADRAO[0][1], ENDERECO: EMPRESAS_PADRAO[0][2], TELEFONE: EMPRESAS_PADRAO[0][3], EMAIL: EMPRESAS_PADRAO[0][4] }
  };
  const html = htmlPdf_(v, { assinatura: '', dataHora: new Date(), hashConteudo: 'TESTE' });
  const f = pastaRaiz_(APP.PASTA_RECIBOS).createFile(Utilities.newBlob(html, 'text/html', 't.html').getAs('application/pdf').setName('TESTE TIMBRADO.pdf'));
  Logger.log('Abra e confira: ' + f.getUrl());
}

/* ============ DRIVE ============ */

const MESES = ['JANEIRO','FEVEREIRO','MARÇO','ABRIL','MAIO','JUNHO','JULHO','AGOSTO','SETEMBRO','OUTUBRO','NOVEMBRO','DEZEMBRO'];

function pastaRaiz_(nome) {
  const props = PropertiesService.getScriptProperties();
  const k = 'PASTA_' + nome;
  const id = props.getProperty(k);
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const it = DriveApp.getFoldersByName(nome);
  const p = it.hasNext() ? it.next() : DriveApp.createFolder(nome);
  props.setProperty(k, p.getId());
  return p;
}

function subpasta_(pai, nome) {
  const it = pai.getFoldersByName(nome);
  return it.hasNext() ? it.next() : pai.createFolder(nome);
}

function travaArquivo_(id) {
  try { Drive.Files.update({ contentRestrictions: [{ readOnly: true, reason: 'Documento assinado — imutável' }] }, id); }
  catch (e) { console.warn('Restrição de somente leitura não aplicada (ative o serviço avançado Drive API v3): ' + e); }
}

/* ============ PLANILHA ============ */

function planilha_() {
  const id = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  return id ? SpreadsheetApp.openById(id) : SpreadsheetApp.getActiveSpreadsheet();
}

function aba_(nome) {
  const sh = planilha_().getSheetByName(nome);
  if (!sh) throw new Error('Aba ' + nome + ' não existe. Execute setup().');
  return sh;
}

function tabela_(nome) {
  const sh = aba_(nome);
  const n = sh.getLastRow();
  if (n < 2) return [];
  const cab = ABAS[nome];
  return sh.getRange(2, 1, n - 1, cab.length).getValues().map((l, i) => {
    const o = { _linha: i + 2 };
    cab.forEach((c, j) => { if (o[c] === undefined) o[c] = l[j]; });
    return o;
  }).filter(o => o[cab[0]] !== '');
}

function inserir_(nome, obj) {
  const cab = ABAS[nome];
  aba_(nome).appendRow(cab.map(c => seguro_(obj[c])));
}

function atualizar_(nome, linha, parcial) {
  const sh = aba_(nome), cab = ABAS[nome];
  Object.keys(parcial).forEach(k => {
    const i = cab.indexOf(k);
    if (i >= 0) sh.getRange(linha, i + 1).setValue(seguro_(parcial[k]));
  });
}

function acharRecibo_(col, valor) {
  if (!valor) return null;
  const sh = aba_('RECIBOS');
  const i = ABAS.RECIBOS.indexOf(col);
  const n = sh.getLastRow();
  if (n < 2) return null;
  const achado = sh.getRange(2, i + 1, n - 1, 1).createTextFinder(String(valor)).matchEntireCell(true).findNext();
  if (!achado) return null;
  const linha = achado.getRow();
  const vals = sh.getRange(linha, 1, 1, ABAS.RECIBOS.length).getValues()[0];
  const o = { _linha: linha };
  ABAS.RECIBOS.forEach((c, j) => { if (o[c] === undefined) o[c] = vals[j]; });
  return o;
}

function configMapa_() {
  const m = {};
  tabela_('CONFIGURACOES').forEach(l => { m[l.CHAVE] = String(l.VALOR); });
  return m;
}

function historico_(idRecibo, resp, acao, desc) {
  inserir_('HISTORICO', { ID_EVENTO: uid_(), ID_RECIBO: idRecibo, DATA_HORA: new Date(), RESPONSAVEL: resp, ACAO: acao, DESCRICAO: desc });
}

function protocolo_(d) {
  const props = PropertiesService.getScriptProperties();
  const ano = Utilities.formatDate(d, APP.TZ, 'yyyy');
  const k = 'SEQ_' + ano;
  const n = Number(props.getProperty(k) || 0) + 1;
  props.setProperty(k, String(n));
  return 'VG' + ano + '-' + ('00000' + n).slice(-5);
}

function trava_() {
  const l = LockService.getScriptLock();
  if (!l.tryLock(20000)) throw falha_('Servidor ocupado. Tente novamente.');
  return l;
}

/* ============ UTILITÁRIOS ============ */

function falha_(msg, codigo) { const e = new Error(msg); e.publico = true; e.codigo = codigo || ''; return e; }
function uid_() { return Utilities.getUuid(); }
function token_() { return sha_(Utilities.getUuid() + Utilities.getUuid() + Date.now() + Math.random()); }

function sha_(v) {
  const d = Array.isArray(v)
    ? Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, v)
    : Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(v), Utilities.Charset.UTF_8);
  return d.map(b => ('0' + (b & 255).toString(16)).slice(-2)).join('');
}

function seguro_(v) {
  if (v === undefined || v === null) return '';
  if (typeof v === 'string' && /^[=+\-@]/.test(v)) return "'" + v;
  return v;
}

function texto_(v, max, obrig) {
  const s = String(v === undefined || v === null ? '' : v).replace(/[\u0000-\u001F]/g, ' ').trim().slice(0, max);
  if (obrig && !s) throw falha_('Preencha todos os campos obrigatórios.');
  return s;
}

function dinheiro_(v) {
  if (typeof v === 'number') return Math.round(v * 100) / 100;
  const s = String(v || '').replace(/[^\d,.-]/g, '');
  const n = Number(s.includes(',') ? s.replace(/\./g, '').replace(',', '.') : s);
  return isFinite(n) ? Math.round(n * 100) / 100 : 0;
}

function dataIso_(v, campo) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(String(v || ''))) throw falha_(campo + ' inválida.');
  const p = v.split('-').map(Number);
  return new Date(p[0], p[1] - 1, p[2], 12, 0, 0);
}

function iso_(d) { return d instanceof Date ? d.toISOString() : (d || ''); }

function dataBr_(iso, hora) {
  if (!iso) return '—';
  return Utilities.formatDate(new Date(iso), APP.TZ, hora ? 'dd/MM/yyyy HH:mm' : 'dd/MM/yyyy');
}

function statusEfetivo_(r, agora) {
  if (r.STATUS === 'PENDENTE' && r.DATA_EXPIRACAO && new Date(r.DATA_EXPIRACAO).getTime() < agora) return 'EXPIRADO';
  return r.STATUS;
}

function linkRecibo_(token) {
  const base = configMapa_().FRONTEND_URL || CONFIG_PADRAO.FRONTEND_URL;
  return base + '?r=' + token;
}

function soDigitos_(s) { return String(s || '').replace(/\D/g, ''); }
function formataCpf_(c) { return c.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4'); }
function mascaraCpf_(c) { const d = soDigitos_(c); return d.length === 11 ? '***.' + d.slice(3, 6) + '.' + d.slice(6, 9) + '-**' : ''; }

function mascaraTransacao_(t, cpf) {
  const s = String(t || '');
  const d = soDigitos_(cpf);
  return d && s.includes(formataCpf_(d)) ? s.replace(formataCpf_(d), mascaraCpf_(d)) : s;
}

function cpfValido_(c) {
  if (!/^\d{11}$/.test(c) || /^(\d)\1{10}$/.test(c)) return false;
  for (let t = 9; t < 11; t++) {
    let s = 0;
    for (let i = 0; i < t; i++) s += Number(c[i]) * (t + 1 - i);
    if (((s * 10) % 11) % 10 !== Number(c[t])) return false;
  }
  return true;
}

function limpa_(o) { const c = Object.assign({}, o); delete c._linha; return c; }
function esc_(s) { return String(s === undefined || s === null ? '' : s).replace(/[&<>"']/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[m])); }

function brl_(v) {
  const n = Number(v || 0).toFixed(2).split('.');
  return 'R$ ' + n[0].replace(/\B(?=(\d{3})+(?!\d))/g, '.') + ',' + n[1];
}

function extenso_(valor) {
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
    const esc = [['', ''], ['mil', 'mil'], ['milhão', 'milhões'], ['bilhão', 'bilhões']];
    const g = [];
    while (n > 0) { g.push(n % 1000); n = Math.floor(n / 1000); }
    const partes = [];
    for (let i = g.length - 1; i >= 0; i--) {
      if (!g[i]) continue;
      partes.push({ g: g[i], t: i === 1 && g[i] === 1 ? 'mil' : ate999(g[i]) + (i ? ' ' + (g[i] === 1 ? esc[i][0] : esc[i][1]) : '') });
    }
    return partes.reduce((s, p, k) => k === 0 ? p.t : s + ((k === partes.length - 1 && (p.g < 100 || p.g % 100 === 0)) ? ' e ' : ' ') + p.t, '');
  };
  const cents = Math.round(Number(valor) * 100);
  const r = Math.floor(cents / 100), c = cents % 100;
  let s = '';
  if (r) s = inteiro(r) + (r >= 1000000 && r % 1000000 === 0 ? ' de' : '') + (r === 1 ? ' real' : ' reais');
  if (c) s += (s ? ' e ' : '') + inteiro(c) + (c === 1 ? ' centavo' : ' centavos');
  return s || 'zero reais';
}
