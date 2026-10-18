// Server standalone (lokal / VPS / Render / Railway / Koyeb / Fly.io / Docker)
process.on('unhandledRejection', (err) => console.error('[unhandledRejection]', err?.message || err));
process.on('uncaughtException', (err) => console.error('[uncaughtException]', err?.message || err));

const app = require('./app');
const PORT = process.env.PORT || 3000;

app.listen(PORT, '0.0.0.0', () => {
  console.log(`KelasNime berjalan di http://0.0.0.0:${PORT}`);
});
