require('dotenv').config();

const http = require('http');
const app = require('./app');
const { connectDatabase } = require('./config/database');
const { seedPermissionsAndRoles } = require('./services/seed');
const { ensureAcademyStudentIndexes } = require('./services/academy/ensureAcademyStudentIndexes');
const { ensureCamerasFromEnv } = require('./services/aiAttendance/cameraEnvService');
const { autostartFromEnv } = require('./services/aiAttendance/cctvPoller');
const { startCronJobs } = require('./jobs/cron');
const { initSocket, getIO } = require('./services/socket/index');

const port = Number(process.env.PORT) || 5000;
const clientOrigins = (process.env.CLIENT_URL || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

async function bootstrap() {
  await connectDatabase();
  await seedPermissionsAndRoles();
  await ensureAcademyStudentIndexes();
  await ensureCamerasFromEnv();
  startCronJobs();

  const server = http.createServer(app);
  initSocket(server, clientOrigins);
  app.set('io', getIO());

  server.listen(port, () => {
    // eslint-disable-next-line no-console
    console.log(`Academy API listening on port ${port}`);
    // Non-blocking: open RTSP from .env and mark attendance when faces match
    autostartFromEnv().catch((err) => {
      // eslint-disable-next-line no-console
      console.warn('[cctv] Autostart failed:', err.message);
    });
  });
}

bootstrap().catch((err) => {
  // eslint-disable-next-line no-console
  console.error(err);
  process.exit(1);
});
