// Configuracao do frontend. Sem segredos aqui: tokens e chaves vivem APENAS
// no .env do backend (PULSAR GESTOR DE TRAFEGO). O navegador so conhece a URL.
window.PULSAR_CONFIG = {
  // URL base da API da Central (npm run server na pasta PULSAR GESTOR DE TRAFEGO)
  API_BASE_URL: "http://localhost:3001"
};
