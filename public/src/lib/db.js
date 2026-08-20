import sql from 'mssql';
import 'dotenv/config';

function env(...nomes) {
  for (const nome of nomes) {
    const valor = process.env[nome];
    if (valor !== undefined && String(valor).trim() !== '') return String(valor).trim();
  }
  return '';
}

function booleano(valor, padrao = false) {
  if (valor === undefined || valor === null || valor === '') return padrao;
  return String(valor).toLowerCase() === 'true';
}

const server = env('SQL_SERVER', 'AZURE_SQL_SERVER');
const database = env('SQL_DATABASE', 'AZURE_SQL_DATABASE');
const user = env('SQL_USER', 'AZURE_SQL_USER');
const password = env('SQL_PASSWORD', 'AZURE_SQL_PASSWORD');
const usaWindowsAuth = booleano(env('SQL_TRUSTED_CONNECTION'), false);

function validarConfiguracao() {
  const faltando = [];
  if (!server) faltando.push('SQL_SERVER/AZURE_SQL_SERVER');
  if (!database) faltando.push('SQL_DATABASE/AZURE_SQL_DATABASE');
  if (!usaWindowsAuth && !user) faltando.push('SQL_USER/AZURE_SQL_USER');
  if (!usaWindowsAuth && !password) faltando.push('SQL_PASSWORD/AZURE_SQL_PASSWORD');
  if (faltando.length) {
    const erro = new Error(`Configuração SQL incompleta: ${faltando.join(', ')}`);
    erro.code = 'SQL_ENV_MISSING';
    throw erro;
  }
}

const config = usaWindowsAuth
  ? {
      server,
      database,
      driver: 'msnodesqlv8',
      connectionTimeout: Number(env('SQL_CONNECTION_TIMEOUT')) || 30000,
      requestTimeout: Number(env('SQL_REQUEST_TIMEOUT')) || 50000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 20000 },
      options: {
        trustedConnection: true,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    }
  : {
      server,
      database,
      user,
      password,
      port: Number(env('SQL_PORT')) || 1433,
      connectionTimeout: Number(env('SQL_CONNECTION_TIMEOUT')) || 30000,
      requestTimeout: Number(env('SQL_REQUEST_TIMEOUT')) || 50000,
      pool: { max: 5, min: 0, idleTimeoutMillis: 20000 },
      options: {
        encrypt: booleano(env('SQL_ENCRYPT'), true),
        trustServerCertificate: booleano(env('SQL_TRUST_SERVER_CERTIFICATE'), false),
        enableArithAbort: true,
        appName: 'PMG Connect - Campanhas',
      },
    };

let poolPromise = null;

export function getPool() {
  validarConfiguracao();
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .catch((erro) => {
        poolPromise = null;
        throw erro;
      });
  }
  return poolPromise;
}

export async function resetPool() {
  if (!poolPromise) return;
  try {
    const pool = await poolPromise;
    await pool.close();
  } catch (_) {
    // A próxima chamada recria o pool.
  } finally {
    poolPromise = null;
  }
}

export function diagnosticoConfiguracaoSql() {
  return {
    serverConfigurado: Boolean(server),
    databaseConfigurado: Boolean(database),
    userConfigurado: usaWindowsAuth || Boolean(user),
    passwordConfigurado: usaWindowsAuth || Boolean(password),
    autenticacao: usaWindowsAuth ? 'windows' : 'sql-login',
    server,
    database,
    port: config.port || null,
    encrypt: Boolean(config.options?.encrypt),
    connectionTimeout: config.connectionTimeout,
    requestTimeout: config.requestTimeout,
  };
}

export { sql };
