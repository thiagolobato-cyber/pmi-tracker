# Testes

Testes basicos das funcoes puras (datas, status, formatacao, fases).

## Como rodar

```bash
node tests/run-tests.js
```

Sem dependencias externas. O runner extrai as funcoes diretamente do `index.html`
e avalia em contexto Node, garantindo que o codigo testado e o mesmo que roda em
producao (sem duplicacao).

## Cobertura

- `parseDate`: Date instance, string ISO, dd/mm/yyyy, excel serial, vazios
- `toIso`, `emptyDate`
- `addBusinessDays`: forward/backward, finais de semana
- `businessDaysBetween`: mesmo dia, intervalo, sinal invertido
- `computeTaskFields`: done, empty, ontrack
- `statusLabel`, `fmtBRL`, `sevRank`, `escapeHtml`, `phaseFor`
