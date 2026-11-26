import dotenv from 'dotenv';
dotenv.config();

export const config = {
  env: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT || '4000', 10),
  instanceId: process.env.INSTANCE_ID || 'app-standalone',
  jwtSecret: process.env.JWT_SECRET || 'ledgerflow-enterprise-super-secure-jwt-secret-2026',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '24h',
  refreshTokenExpiresDays: 7,
  databaseUrl: process.env.DATABASE_URL || 'postgresql://ledger:secret@localhost:5432/ledgerflow',
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.ethereal.email',
    port: parseInt(process.env.SMTP_PORT || '587', 10),
    user: process.env.SMTP_USER || 'reports@ledgerflow.app',
    pass: process.env.SMTP_PASS || 'mock-smtp-password',
    from: process.env.SMTP_FROM || 'LedgerFlow Reports <reports@ledgerflow.app>',
  },
  cluster: {
    ports: (process.env.CLUSTER_PORTS || '4001,4002,4003')
      .split(',')
      .map((p) => parseInt(p.trim(), 10))
      .filter((p) => Number.isFinite(p) && p > 0),
    lbPort: parseInt(process.env.CLUSTER_LB_PORT || '4000', 10),
  }
};
