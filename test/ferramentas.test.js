const test = require('node:test');
const assert = require('node:assert/strict');

const { calcularDAS } = require('../agentes/ferramentas/simples-nacional');
const { analisarNFe, dvChaveAcesso } = require('../agentes/ferramentas/nfe');
const { validarCPF, validarCNPJ } = require('../agentes/ferramentas/documentos');
const { proximosPrazos, diaUtil, pascoa } = require('../agentes/ferramentas/prazos');
const { calcularDescontosFolha, calcularINSS } = require('../agentes/ferramentas/folha');
const { lerExtratoOFX } = require('../agentes/ferramentas/extrato');
const { AGENTES, buscarAgente } = require('../agentes/catalogo');
const ferramentas = require('../agentes/ferramentas');

test('catálogo tem 57 agentes e todas as ferramentas existem', () => {
  assert.equal(AGENTES.length, 57);
  for (const a of AGENTES) {
    assert.doesNotThrow(() => ferramentas.definicoes(a.ferramentas), a.id);
    assert.ok(['low', 'medium', 'high'].includes(a.esforco), a.id);
  }
  assert.equal(buscarAgente('Agente Conferência').id, 'conferencia-nfe');
});

test('DAS Anexo III, 2ª faixa', () => {
  const r = calcularDAS({ rbt12: 300000, receita_mes: 28000, anexo: 'III' });
  // (300000 x 11,2% - 9360) / 300000 = 8,08%
  assert.equal(r.faixa, 2);
  assert.equal(r.aliquota_efetiva_pct, 8.08);
  assert.equal(r.valor_das, 2262.4);
});

test('DAS Anexo V com Fator R >= 28% vai para o Anexo III', () => {
  const r = calcularDAS({ rbt12: 540000, receita_mes: 52000, anexo: 'V', folha_12_meses: 160000 });
  assert.equal(r.anexo, 'III');
  // (540000 x 13,5% - 17640) / 540000 = 10,2333%
  assert.equal(r.aliquota_efetiva_pct, 10.2333);
  assert.equal(r.valor_das, 5321.33);
});

test('DAS avisa sublimite e exclusão', () => {
  assert.match(calcularDAS({ rbt12: 4000000, receita_mes: 1, anexo: 'I' }).avisos.join(), /sublimite/);
  assert.match(calcularDAS({ rbt12: 5000000, receita_mes: 1, anexo: 'I' }).avisos.join(), /excluída/);
});

test('validação de CPF e CNPJ (numérico e alfanumérico)', () => {
  assert.equal(validarCPF('529.982.247-25'), true);
  assert.equal(validarCPF('529.982.247-24'), false);
  assert.equal(validarCPF('111.111.111-11'), false);
  assert.equal(validarCNPJ('11.222.333/0001-81'), true);
  assert.equal(validarCNPJ('11.222.333/0001-80'), false);
  assert.equal(validarCNPJ('12.ABC.345/01DE-35'), true); // exemplo oficial da Receita
});

function chaveValida(base43) {
  return base43 + dvChaveAcesso(base43);
}

function xmlNFe({ cfop = '5102', crt = '3', icms = '<ICMS00><orig>0</orig><CST>00</CST><vBC>1000.00</vBC><pICMS>18.00</pICMS><vICMS>180.00</vICMS></ICMS00>', vProdTotal = '1000.00', cStat = '100' } = {}) {
  const chave = chaveValida('3526091122233300018155001000000123100000001');
  return `<?xml version="1.0" encoding="UTF-8"?>
<nfeProc xmlns="http://www.portalfiscal.inf.br/nfe" versao="4.00">
  <NFe><infNFe Id="NFe${chave}" versao="4.00">
    <ide><mod>55</mod><serie>1</serie><nNF>123</nNF><dhEmi>2026-09-10T10:00:00-03:00</dhEmi><tpNF>1</tpNF><idDest>1</idDest><natOp>Venda</natOp></ide>
    <emit><CNPJ>11222333000181</CNPJ><xNome>Emitente</xNome><enderEmit><UF>SP</UF></enderEmit><CRT>${crt}</CRT></emit>
    <dest><CNPJ>11444777000161</CNPJ><xNome>Destinatario</xNome><enderDest><UF>SP</UF></enderDest></dest>
    <det nItem="1"><prod><cProd>1</cProd><xProd>Produto</xProd><NCM>84713012</NCM><CFOP>${cfop}</CFOP><qCom>10</qCom><vUnCom>100.00</vUnCom><vProd>1000.00</vProd></prod>
      <imposto><ICMS>${icms}</ICMS></imposto></det>
    <total><ICMSTot><vBC>1000.00</vBC><vICMS>180.00</vICMS><vProd>${vProdTotal}</vProd><vNF>1000.00</vNF></ICMSTot></total>
  </infNFe></NFe>
  <protNFe><infProt><chNFe>${chave}</chNFe><cStat>${cStat}</cStat></infProt></protNFe>
</nfeProc>`;
}

test('NF-e correta passa sem divergências', () => {
  const r = analisarNFe(xmlNFe());
  assert.deepEqual(r.divergencias, []);
  assert.equal(r.resultado, 'OK');
  assert.equal(r.itens[0].cfop, '5102');
  assert.equal(r.itens[0].cst, '000');
  assert.equal(r.totais.icms, 180);
});

test('NF-e com CFOP interestadual em operação interna é apontada', () => {
  const r = analisarNFe(xmlNFe({ cfop: '6102' }));
  assert.match(r.divergencias.join(), /CFOP 6102 incompatível/);
});

test('NF-e de optante do Simples com CST é apontada', () => {
  const r = analisarNFe(xmlNFe({ crt: '1' }));
  assert.match(r.divergencias.join(), /deveria usar CSOSN/);
});

test('NF-e com total divergente e cancelada é apontada', () => {
  const r = analisarNFe(xmlNFe({ vProdTotal: '999.00', cStat: '101' }));
  assert.match(r.divergencias.join(), /Soma dos itens/);
  assert.match(r.divergencias.join(), /não está autorizada/);
});

test('prazos: feriados e ajuste de dia útil', () => {
  assert.equal(pascoa(2026).toISOString().slice(0, 10), '2026-04-05');
  assert.equal(diaUtil(new Date('2026-11-20T00:00:00Z')), false); // Consciência Negra
  const r = proximosPrazos({ competencia: '2026-09', regime: 'simples' });
  const das = r.prazos.find((p) => p.obrigacao.startsWith('DAS'));
  assert.equal(das.vencimento, '2026-10-20'); // terça-feira
  // FGTS de 10/2026: 20/11 é feriado, antecipa para 19/11.
  const fgts = proximosPrazos({ competencia: '2026-10' }).prazos.find((p) => p.obrigacao === 'FGTS Digital');
  assert.equal(fgts.vencimento, '2026-11-19');
});

test('INSS progressivo e IRRF com redução até R$ 5.000', () => {
  // 1518 x 7,5% + (2793,88 - 1518) x 9% + (3000 - 2793,88) x 12% = 113,85 + 114,83 + 24,73
  assert.equal(calcularINSS(3000).valor, 253.41);
  const r = calcularDescontosFolha({ salario_bruto: 3000 });
  assert.equal(r.irrf.valor, 0);
  assert.equal(r.fgts_empregador, 240);
  assert.equal(r.salario_liquido, 2746.59);
  const alto = calcularDescontosFolha({ salario_bruto: 10000 });
  assert.ok(alto.irrf.valor > 0);
  assert.equal(alto.irrf.reducao_lei_15270, 0);
});

test('leitura de extrato OFX', () => {
  const ofx = `OFXHEADER:100
<OFX><BANKMSGSRSV1><STMTTRNRS><STMTRS><BANKACCTFROM><BANKID>341<ACCTID>12345</BANKACCTFROM>
<BANKTRANLIST><DTSTART>20260901<DTEND>20260930
<STMTTRN><TRNTYPE>CREDIT<DTPOSTED>20260905120000[-3:BRT]<TRNAMT>1500.00<FITID>1<MEMO>PIX RECEBIDO</STMTTRN>
<STMTTRN><TRNTYPE>DEBIT<DTPOSTED>20260910<TRNAMT>-45.90<FITID>2<MEMO>TARIFA</STMTTRN>
</BANKTRANLIST><LEDGERBAL><BALAMT>1454.10</LEDGERBAL></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`;
  const r = lerExtratoOFX(ofx);
  assert.equal(r.quantidade, 2);
  assert.equal(r.total_creditos, 1500);
  assert.equal(r.total_debitos, -45.9);
  assert.equal(r.lancamentos[0].data, '2026-09-05');
  assert.equal(r.saldo_final_informado, 1454.1);
});
