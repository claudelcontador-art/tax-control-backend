// Leitura de extrato bancário OFX (padrão usado pelos bancos brasileiros).

function campo(bloco, tag) {
  const m = new RegExp(`<${tag}>([^<\\r\\n]*)`, 'i').exec(bloco);
  return m ? m[1].trim() : null;
}

function dataOFX(valor) {
  if (!valor) return null;
  const m = /^(\d{4})(\d{2})(\d{2})/.exec(valor);
  return m ? `${m[1]}-${m[2]}-${m[3]}` : valor;
}

function lerExtratoOFX(texto) {
  const blocos = String(texto).match(/<STMTTRN>[\s\S]*?(<\/STMTTRN>|(?=<STMTTRN>)|(?=<\/BANKTRANLIST>))/gi) || [];
  if (!blocos.length) return { erro: 'Nenhum lançamento <STMTTRN> encontrado. O arquivo é OFX?' };

  const lancamentos = blocos.map((b) => {
    const valor = Number(String(campo(b, 'TRNAMT') || '0').replace(',', '.'));
    return {
      data: dataOFX(campo(b, 'DTPOSTED')),
      valor,
      tipo: valor < 0 ? 'débito' : 'crédito',
      historico: campo(b, 'MEMO') || campo(b, 'NAME'),
      documento: campo(b, 'CHECKNUM') || campo(b, 'REFNUM'),
      id: campo(b, 'FITID'),
    };
  });

  const creditos = lancamentos.filter((l) => l.valor > 0).reduce((s, l) => s + l.valor, 0);
  const debitos = lancamentos.filter((l) => l.valor < 0).reduce((s, l) => s + l.valor, 0);
  const saldo = campo(texto, 'BALAMT');

  return {
    banco: campo(texto, 'BANKID'),
    conta: campo(texto, 'ACCTID'),
    periodo: { inicio: dataOFX(campo(texto, 'DTSTART')), fim: dataOFX(campo(texto, 'DTEND')) },
    quantidade: lancamentos.length,
    total_creditos: Math.round(creditos * 100) / 100,
    total_debitos: Math.round(debitos * 100) / 100,
    saldo_final_informado: saldo === null ? null : Number(saldo.replace(',', '.')),
    lancamentos,
  };
}

module.exports = { lerExtratoOFX };
