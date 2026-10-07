// Leitura e conferência de XML de NF-e / NFC-e (modelos 55 e 65).
const { XMLParser } = require('fast-xml-parser');

const parser = new XMLParser({
  ignoreAttributes: false,
  attributeNamePrefix: '@',
  removeNSPrefix: true,
  parseTagValue: false, // mantém zeros à esquerda (CFOP, NCM, CST, chave)
  isArray: (nome) => nome === 'det',
});

const num = (v) => (v === undefined || v === null || v === '' ? 0 : Number(v));
const arred = (v) => Math.round((v + Number.EPSILON) * 100) / 100;

function dvChaveAcesso(chave43) {
  let peso = 2;
  let soma = 0;
  for (let i = chave43.length - 1; i >= 0; i--) {
    soma += Number(chave43[i]) * peso;
    peso = peso === 9 ? 2 : peso + 1;
  }
  const resto = soma % 11;
  return resto < 2 ? 0 : 11 - resto;
}

// O grupo de ICMS vem como <ICMS><ICMS00>...</ICMS00></ICMS>, <ICMSSN102>, etc.
function grupoIcms(imposto) {
  const icms = imposto && imposto.ICMS;
  if (!icms) return {};
  const chave = Object.keys(icms)[0];
  return { grupo: chave, ...(icms[chave] || {}) };
}

const SITUACOES = {
  100: 'Autorizada',
  101: 'Cancelada',
  110: 'Uso denegado',
  135: 'Evento registrado (verifique cancelamento)',
  150: 'Autorizada fora de prazo',
  301: 'Uso denegado: irregularidade do emitente',
  302: 'Uso denegado: irregularidade do destinatário',
};

function analisarNFe(xml) {
  let doc;
  try {
    doc = parser.parse(xml);
  } catch (e) {
    return { erro: `XML inválido: ${e.message}` };
  }

  const proc = doc.nfeProc || doc;
  const nfe = proc.NFe;
  const inf = nfe && nfe.infNFe;
  if (!inf) return { erro: 'Não encontrei o grupo infNFe. O arquivo é um XML de NF-e/NFC-e?' };

  const divergencias = [];
  const alertas = [];
  const ide = inf.ide || {};
  const emit = inf.emit || {};
  const dest = inf.dest || {};
  const tot = (inf.total && inf.total.ICMSTot) || {};
  const prot = proc.protNFe && proc.protNFe.infProt;

  // Chave de acesso
  const chave = String(inf['@Id'] || '').replace(/^NFe/, '');
  if (!/^\d{44}$/.test(chave)) {
    divergencias.push(`Chave de acesso com formato inválido: "${chave}".`);
  } else if (dvChaveAcesso(chave.slice(0, 43)) !== Number(chave[43])) {
    divergencias.push(`Dígito verificador da chave de acesso não confere (${chave}).`);
  }

  // Situação na SEFAZ
  let situacao = 'Sem protocolo de autorização no arquivo';
  if (prot) {
    const cStat = Number(prot.cStat);
    situacao = `${cStat} - ${SITUACOES[cStat] || prot.xMotivo || 'Verificar'}`;
    if (![100, 150].includes(cStat)) divergencias.push(`Nota não está autorizada: ${situacao}.`);
  } else {
    alertas.push('XML sem protNFe: não dá para confirmar a autorização. Consulte a chave no portal da SEFAZ.');
  }

  const tpNF = String(ide.tpNF); // 0 = entrada, 1 = saída
  const idDest = String(ide.idDest); // 1 interna, 2 interestadual, 3 exterior
  const crt = String(emit.CRT); // 1 Simples, 2 Simples excesso sublimite, 3 normal, 4 MEI
  const simples = crt === '1' || crt === '4';

  const primeirosValidos = {
    '0': { '1': ['1'], '2': ['2'], '3': ['3'] },
    '1': { '1': ['5'], '2': ['6'], '3': ['7'] },
  };

  let somaProd = 0;
  let somaIcms = 0;
  let somaDesc = 0;

  const itens = (inf.det || []).map((det) => {
    const prod = det.prod || {};
    const icms = grupoIcms(det.imposto);
    const cfop = String(prod.CFOP || '');
    const cst = icms.CST !== undefined ? String(icms.orig ?? '') + String(icms.CST) : null;
    const csosn = icms.CSOSN !== undefined ? String(icms.CSOSN) : null;
    const n = det['@nItem'];
    const rotulo = `Item ${n} (${prod.xProd || prod.cProd || 'sem descrição'})`;

    somaProd += num(prod.vProd);
    somaIcms += num(icms.vICMS);
    somaDesc += num(prod.vDesc);

    if (!/^\d{4}$/.test(cfop)) {
      divergencias.push(`${rotulo}: CFOP inválido "${cfop}".`);
    } else {
      const esperados = (primeirosValidos[tpNF] || {})[idDest];
      if (esperados && !esperados.includes(cfop[0])) {
        divergencias.push(
          `${rotulo}: CFOP ${cfop} incompatível com a operação (${tpNF === '0' ? 'entrada' : 'saída'}, ` +
          `${{ 1: 'interna', 2: 'interestadual', 3: 'exterior' }[idDest] || 'destino ' + idDest}). Esperado iniciar com ${esperados.join('/')}.`,
        );
      }
      const final = cfop.slice(1);
      if (['405'].includes(final) && !((cst && cst.endsWith('60')) || csosn === '500')) {
        alertas.push(`${rotulo}: CFOP ${cfop} (ST já retida) normalmente usa CST 60 ou CSOSN 500; veio ${cst || csosn}.`);
      }
      if (['401', '403'].includes(final) && !((cst && /(10|70)$/.test(cst)) || ['201', '202', '203'].includes(csosn))) {
        alertas.push(`${rotulo}: CFOP ${cfop} (contribuinte substituto) normalmente usa CST 10/70 ou CSOSN 201/202/203; veio ${cst || csosn}.`);
      }
    }

    if (simples && !csosn) divergencias.push(`${rotulo}: emitente do Simples (CRT ${crt}) deveria usar CSOSN, mas veio CST ${cst}.`);
    if (!simples && emit.CRT !== undefined && !cst) divergencias.push(`${rotulo}: emitente do regime normal (CRT ${crt}) deveria usar CST, mas veio CSOSN ${csosn}.`);

    if (prod.NCM && !/^\d{8}$/.test(String(prod.NCM)) && String(prod.NCM) !== '00') {
      divergencias.push(`${rotulo}: NCM "${prod.NCM}" não tem 8 dígitos.`);
    }

    const qv = num(prod.qCom) * num(prod.vUnCom);
    if (prod.qCom && prod.vUnCom && Math.abs(qv - num(prod.vProd)) > 0.05) {
      alertas.push(`${rotulo}: quantidade x valor unitário (${arred(qv)}) difere do valor do produto (${prod.vProd}).`);
    }

    return {
      item: n,
      codigo: prod.cProd,
      descricao: prod.xProd,
      ncm: prod.NCM,
      cfop,
      cst,
      csosn,
      quantidade: num(prod.qCom),
      valor_produto: num(prod.vProd),
      base_icms: num(icms.vBC),
      aliquota_icms: num(icms.pICMS),
      valor_icms: num(icms.vICMS),
    };
  });

  if (Math.abs(arred(somaProd) - num(tot.vProd)) > 0.01) {
    divergencias.push(`Soma dos itens (R$ ${arred(somaProd)}) diferente do total de produtos da nota (R$ ${num(tot.vProd)}).`);
  }
  if (Math.abs(arred(somaIcms) - num(tot.vICMS)) > 0.01) {
    divergencias.push(`Soma do ICMS dos itens (R$ ${arred(somaIcms)}) diferente do ICMS total (R$ ${num(tot.vICMS)}).`);
  }
  if (Math.abs(arred(somaDesc) - num(tot.vDesc)) > 0.01) {
    alertas.push(`Soma dos descontos dos itens (R$ ${arred(somaDesc)}) diferente do desconto total (R$ ${num(tot.vDesc)}).`);
  }

  return {
    chave,
    modelo: ide.mod,
    numero: ide.nNF,
    serie: ide.serie,
    emissao: ide.dhEmi || ide.dEmi,
    natureza_operacao: ide.natOp,
    tipo: tpNF === '0' ? 'Entrada' : 'Saída',
    situacao,
    emitente: { cnpj: emit.CNPJ || emit.CPF, nome: emit.xNome, uf: emit.enderEmit && emit.enderEmit.UF, crt },
    destinatario: { documento: dest.CNPJ || dest.CPF || dest.idEstrangeiro, nome: dest.xNome, uf: dest.enderDest && dest.enderDest.UF },
    totais: {
      produtos: num(tot.vProd),
      desconto: num(tot.vDesc),
      frete: num(tot.vFrete),
      base_icms: num(tot.vBC),
      icms: num(tot.vICMS),
      icms_st: num(tot.vST),
      ipi: num(tot.vIPI),
      pis: num(tot.vPIS),
      cofins: num(tot.vCOFINS),
      nota: num(tot.vNF),
    },
    itens,
    divergencias,
    alertas,
    resultado: divergencias.length ? 'COM DIVERGÊNCIAS' : alertas.length ? 'OK COM ALERTAS' : 'OK',
  };
}

module.exports = { analisarNFe, dvChaveAcesso };
