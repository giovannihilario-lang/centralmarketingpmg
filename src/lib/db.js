import sql from 'mssql';
import 'dotenv/config';

function env(...names) {
  for (const name of names) {
    const value = process.env[name];
    if (value !== undefined && String(value).trim() !== '') return String(value).trim();
  }
  return '';
}
function bool(value, fallback = false) {
  if (value === undefined || value === null || value === '') return fallback;
  return String(value).toLowerCase() === 'true';
}

const server = env('SQL_SERVER','AZURE_SQL_SERVER');
const database = env('SQL_DATABASE','AZURE_SQL_DATABASE');
const user = env('SQL_USER','AZURE_SQL_USER');
const password = env('SQL_PASSWORD','AZURE_SQL_PASSWORD');
const trusted = bool(env('SQL_TRUSTED_CONNECTION'),false);

function validate() {
  const missing=[];
  if(!server)missing.push('SQL_SERVER/AZURE_SQL_SERVER');
  if(!database)missing.push('SQL_DATABASE/AZURE_SQL_DATABASE');
  if(!trusted&&!user)missing.push('SQL_USER/AZURE_SQL_USER');
  if(!trusted&&!password)missing.push('SQL_PASSWORD/AZURE_SQL_PASSWORD');
  if(missing.length){const error=new Error(`Configuração SQL incompleta: ${missing.join(', ')}`);error.code='SQL_ENV_MISSING';throw error;}
}

const common = {
  server,
  database,
  connectionTimeout:Number(env('SQL_CONNECTION_TIMEOUT')) || 45000,
  requestTimeout:Number(env('SQL_REQUEST_TIMEOUT')) || 120000,
  // Uma conexão mínima permanece aquecida. Esta é a diferença que evita pagar
  // o custo de conexão ao Azure em cada busca de fornecedor/produto.
  pool:{ max:6, min:1, idleTimeoutMillis:600000 },
};

const config = trusted ? {
  ...common,
  driver:'msnodesqlv8',
  options:{ trustedConnection:true, trustServerCertificate:true, enableArithAbort:true, appName:'PMG Connect Local' },
} : {
  ...common,
  user,
  password,
  port:Number(env('SQL_PORT')) || 1433,
  options:{ encrypt:bool(env('SQL_ENCRYPT'),true), trustServerCertificate:bool(env('SQL_TRUST_SERVER_CERTIFICATE'),false), enableArithAbort:true, appName:'PMG Connect Local' },
};

let poolPromise=null;
let poolInstance=null;

export function getPool(){
  validate();
  if(!poolPromise){
    poolInstance=new sql.ConnectionPool(config);
    poolInstance.on('error',(error)=>{
      console.error('[sql-pool]',error?.message||error);
      poolPromise=null;
      poolInstance=null;
    });
    poolPromise=poolInstance.connect().catch((error)=>{
      poolPromise=null;
      poolInstance=null;
      throw error;
    });
  }
  return poolPromise;
}

export async function resetPool(){
  const current=poolInstance;
  poolPromise=null;poolInstance=null;
  if(current){try{await current.close();}catch(_){}}
}

export function diagnosticoConfiguracaoSql(){
  return {serverConfigurado:Boolean(server),databaseConfigurado:Boolean(database),userConfigurado:trusted||Boolean(user),passwordConfigurado:trusted||Boolean(password),autenticacao:trusted?'windows':'sql-login',server,database,port:config.port||null,encrypt:Boolean(config.options?.encrypt),connectionTimeout:config.connectionTimeout,requestTimeout:config.requestTimeout,pool:config.pool};
}

export { sql };
