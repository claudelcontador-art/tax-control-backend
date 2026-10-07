// Validação de CPF e CNPJ (numérico e alfanumérico, IN RFB 2.229/2024).

function somenteDigitos(valor) {
  return String(valor || '').replace(/\D/g, '');
}

function validarCPF(cpf) {
  const d = somenteDigitos(cpf);
  if (d.length !== 11 || /^(\d)\1{10}$/.test(d)) return false;
  const calc = (len) => {
    let soma = 0;
    for (let i = 0; i < len; i++) soma += Number(d[i]) * (len + 1 - i);
    const resto = (soma * 10) % 11;
    return resto === 10 ? 0 : resto;
  };
  return calc(9) === Number(d[9]) && calc(10) === Number(d[10]);
}

// No CNPJ alfanumérico cada caractere vale (código ASCII - 48): '0'..'9' => 0..9, 'A' => 17, ...
function validarCNPJ(cnpj) {
  const c = String(cnpj || '').toUpperCase().replace(/[.\-/\s]/g, '');
  if (!/^[0-9A-Z]{12}\d{2}$/.test(c)) return false;
  if (/^(\d)\1{13}$/.test(c)) return false;
  const valor = (ch) => ch.charCodeAt(0) - 48;
  const dv = (base) => {
    const pesos = base.length === 12
      ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2]
      : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const soma = base.split('').reduce((acc, ch, i) => acc + valor(ch) * pesos[i], 0);
    const resto = soma % 11;
    return resto < 2 ? 0 : 11 - resto;
  };
  const dv1 = dv(c.slice(0, 12));
  const dv2 = dv(c.slice(0, 12) + dv1);
  return dv1 === Number(c[12]) && dv2 === Number(c[13]);
}

function validarDocumento({ documento }) {
  const limpo = String(documento || '').toUpperCase().replace(/[.\-/\s]/g, '');
  if (limpo.length === 11) {
    return { documento: limpo, tipo: 'CPF', valido: validarCPF(limpo) };
  }
  if (limpo.length === 14) {
    return {
      documento: limpo,
      tipo: /[A-Z]/.test(limpo) ? 'CNPJ alfanumérico' : 'CNPJ',
      valido: validarCNPJ(limpo),
    };
  }
  return { documento: limpo, tipo: 'desconhecido', valido: false, erro: 'Esperado CPF (11) ou CNPJ (14 caracteres).' };
}

module.exports = { validarCPF, validarCNPJ, validarDocumento, somenteDigitos };
