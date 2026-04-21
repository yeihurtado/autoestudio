  import { textSummary } from 'https://jslib.k6.io/k6-summary/0.1.0/index.js';

  // Factoría que devuelve un handleSummary() enlazado a un nombre de prueba.
  // Cada test importa esta función y exporta handleSummary = buildHandleSummary('nombre').
  export function buildHandleSummary(testName) {
    return function handleSummary(data) {
      return {
        [`results/json/${testName}.json`]: JSON.stringify(data, null, 2),
        stdout: textSummary(data, { indent: '  ', enableColors: true }),
      };
    };
  }
  