import dotenv from 'dotenv';
import { z } from 'zod';
dotenv.config();
dotenv.config({ path: '../.env' });
const envSchema = z.object({
    DATABASE_URL: z.string().min(1).default('postgresql://rustdesk:rustdesk@localhost:5432/rustdesk_admin?schema=public'),
    JWT_SECRET: z.string().min(16).default('change-me-to-a-long-random-secret'),
    SESSION_TTL: z.string().regex(/^\d+[smhd]$/, 'SESSION_TTL must be a duration like 30m, 12h, or 7d').default('12h'),
    SERVER_PORT: z.coerce.number().int().positive().default(21114),
    AUTH_RATE_LIMIT_WINDOW_SECONDS: z.coerce.number().int().positive().default(60),
    AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(20),
    PUBLIC_BASE_URL: z.string().url().default('http://localhost:21114'),
    WEB_ORIGIN: z.string().default('http://localhost:5173'),
    CLIENT_API_TOKEN: z.preprocess((value) => value === '' ? undefined : value, z.string().min(16).optional()),
    RECORDING_DIR: z.string().default('./data/recordings'),
    RECORDING_UPLOAD_MAX_MB: z.coerce.number().int().positive().default(1024),
    RECORDING_RETENTION_DAYS: z.coerce.number().int().min(0).default(90),
    RECORDING_RETENTION_MAX_GB: z.coerce.number().min(0).default(0),
    CONNECTION_STALE_AFTER_MINUTES: z.coerce.number().int().positive().default(1440),
    DEVICE_OFFLINE_AFTER_SECONDS: z.coerce.number().int().positive().default(180),
    ADMIN_EMAIL: z.string().email().default('admin@example.com'),
    ADMIN_PASSWORD: z.string().min(8).default('admin123456'),
    ADDRESS_BOOK_SECRET_KEY: z.string().min(16).default('change-me-address-book-secret'),
    EXTERNAL_USER_DEFAULT_STATUS: z.enum(['NORMAL', 'UNVERIFIED', 'DISABLED']).default('UNVERIFIED'),
    EXTERNAL_USER_DEFAULT_ROLE: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    OIDC_ISSUER_URL: z.preprocess((value) => value === '' ? undefined : value, z.string().url().optional()),
    OIDC_CLIENT_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    OIDC_CLIENT_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    WECHAT_CORP_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    WECHAT_AGENT_ID: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    WECHAT_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    DINGTALK_APP_KEY: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional()),
    DINGTALK_APP_SECRET: z.preprocess((value) => value === '' ? undefined : value, z.string().min(1).optional())
});
export const config = envSchema.parse(process.env);
process.env.DATABASE_URL = config.DATABASE_URL;
