import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import authRoutes from './routes/auth.js';
import clientApiRoutes from './routes/clientApi.js';
import deviceRoutes from './routes/devices.js';
import enterpriseRoutes from './routes/enterprise.js';
import { runHealthChecks } from './services/health.js';
import { prisma } from './prisma.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.WEB_ORIGIN.split(',').map((origin) => origin.trim()), credentials: true }));
app.use(rateLimit({ windowMs: 60_000, limit: 600 }));
app.use(morgan('combined'));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

app.get('/healthz', async (_req, res, next) => {
  try {
    await prisma.$queryRaw`SELECT 1`;
    res.json({ ok: true, service: 'rustdesk-admin-server' });
  } catch (error) {
    next(error);
  }
});

app.get('/health', async (_req, res, next) => {
  try {
    const result = await runHealthChecks();
    res.status(result.ok ? 200 : 503).json({ service: 'rustdesk-admin-server', ...result });
  } catch (error) {
    next(error);
  }
});

app.use('/api', authRoutes);
app.use('/api', clientApiRoutes);
app.use('/api/admin', deviceRoutes);
app.use('/api/admin', enterpriseRoutes);

app.use((err: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  if (err instanceof Error && err.name === 'ClientDeviceTokenMismatch') {
    res.status(403).json({ error: err.message });
    return;
  }
  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
});

app.listen(config.SERVER_PORT, () => {
  console.log(`RustDesk admin server listening on http://localhost:${config.SERVER_PORT}`);
});
