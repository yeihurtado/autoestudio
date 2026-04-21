  import { SharedArray } from 'k6/data';
  import papaparse from 'https://jslib.k6.io/papaparse/5.1.1/index.js';

  // Patrón factoría: el test llama a open() (que solo funciona en init context),
  // y pasa el contenido crudo al loader. Así la librería no depende de rutas.
  export function loadUsersFromCsv(csvContent) {
    return new SharedArray('users', function () {
      const parsed = papaparse.parse(csvContent, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: true, // convierte "1" → 1 donde procede
      });
      return parsed.data;
    });
  }

  export function loadPayloadsFromJson(jsonContent) {
    return new SharedArray('payloads', function () {
      return JSON.parse(jsonContent);
    });
  }

  // Selector determinista (útil para reproducibilidad en debugging).
  export function pickDeterministic(arr, vu, iter) {
    return arr[((vu - 1) * 31 + iter) % arr.length];
  }

  // Selector aleatorio (realista).
  export function pickRandom(arr) {
    return arr[Math.floor(Math.random() * arr.length)];
  }