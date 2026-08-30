'use strict';

const path = require('node:path');

const errors = [];
const env = process.env;

function requireValue(name) {
  const value = env[name]?.trim();
  if (!value) errors.push(`${name} is required`);
  return value || '';
}

function isServerless() {
  return Boolean(env.VERCEL || env.AWS_LAMBDA_FUNCTION_NAME || env.LAMBDA_TASK_ROOT);
}

if (env.NODE_ENV?.trim().toLowerCase() !== 'production') {
  errors.push('NODE_ENV must be production');
}

const appUrl = requireValue('NEXT_PUBLIC_APP_URL');
if (appUrl) {
  try {
    const parsed = new URL(appUrl);
    if (parsed.protocol !== 'https:') errors.push('NEXT_PUBLIC_APP_URL must use HTTPS');
    if (/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$/i.test(parsed.hostname)) {
      errors.push('NEXT_PUBLIC_APP_URL must not point to localhost');
    }
  } catch {
    errors.push('NEXT_PUBLIC_APP_URL must be a valid URL');
  }
}

for (const name of ['DATABASE_URL', 'DIRECT_URL']) {
  const value = requireValue(name);
  if (value && !/^postgres(?:ql)?:\/\//i.test(value)) {
    errors.push(`${name} must be a PostgreSQL URL`);
  }
}

const sessionSecret = requireValue('SESSION_SECRET');
if (sessionSecret && sessionSecret.length < 32) errors.push('SESSION_SECRET must contain at least 32 characters');
if (sessionSecret && /replace-with|change-me|ci-only|build-only|placeholder|example/i.test(sessionSecret)) {
  errors.push('SESSION_SECRET contains a placeholder or non-production marker');
}

const storageDriver = (env.STORAGE_DRIVER?.trim().toLowerCase() || 'local');
if (!['local', 'supabase'].includes(storageDriver)) {
  errors.push(`STORAGE_DRIVER "${storageDriver}" is unsupported`);
} else if (storageDriver === 'local') {
  const uploadDir = env.UPLOAD_DIR?.trim();
  if (!uploadDir) {
    errors.push('UPLOAD_DIR is required for local production storage');
  } else if (!path.isAbsolute(uploadDir)) {
    errors.push('UPLOAD_DIR must be an absolute path in production');
  }
  if (isServerless()) {
    errors.push('serverless production requires STORAGE_DRIVER=supabase (or another durable object store)');
  }
} else {
  const supabaseKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const supabaseUrl = env.SUPABASE_URL?.trim();
  if (!supabaseKey) errors.push('SUPABASE_SERVICE_ROLE_KEY is required for Supabase storage');
  // The database URL can use a pooler hostname that does not contain the
  // project ref needed to derive the Storage API origin. Require the explicit
  // origin so the readiness probe and uploads cannot disagree about config.
  if (!supabaseUrl) {
    errors.push('SUPABASE_URL is required for Supabase storage');
  } else {
    try {
      const parsed = new URL(supabaseUrl);
      if (parsed.protocol !== 'https:') errors.push('SUPABASE_URL must use HTTPS');
    } catch {
      errors.push('SUPABASE_URL must be a valid URL');
    }
  }
}

for (const name of ['BOOTSTRAP_ADMIN_NAME', 'BOOTSTRAP_ADMIN_PHONE', 'BOOTSTRAP_ADMIN_EMAIL', 'BOOTSTRAP_ADMIN_PASSWORD', 'SEED_PASSWORD', 'SEED_ADMIN_PASSWORD']) {
  if (env[name]?.trim()) errors.push(`${name} must be removed from the steady-state production environment`);
}

if (errors.length) {
  console.error('Production environment check failed:');
  for (const error of errors) console.error(`- ${error}`);
  process.exitCode = 1;
} else {
  console.log('Production environment configuration is valid.');
}
