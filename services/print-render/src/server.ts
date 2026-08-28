import express, { type Express } from 'express';

export function createServer(): Express {
  const app = express();
  app.use(express.json({ limit: '30mb' }));

  app.get('/health', (_req, res) => {
    res.status(200).json({ status: 'ok' });
  });

  return app;
}

if (process.env.NODE_ENV !== 'test') {
  const port = process.env.PORT ? Number(process.env.PORT) : 8080;
  createServer().listen(port, () => {
    console.log(`print-render listening on port ${port}`);
  });
}
