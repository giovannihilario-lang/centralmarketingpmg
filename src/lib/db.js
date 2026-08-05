import sql from 'mssql';
import 'dotenv/config';

/**
 * Conexão com o SQL Server da rede local.
 *
 * Duas formas de autenticar (escolha com SQL_TRUSTED_CONNECTION no .env):
 *
 * 1) SQL_TRUSTED_CONNECTION=true  -> Autenticação do Windows (o SQL Server
 *    "não pede login" porque usa o usuário do Windows logado na máquina).
 *    Exige o driver nativo `msnodesqlv8` instalado (veja README-migracao.md).
 *
 * 2) SQL_TRUSTED_CONNECTION=false (ou ausente) -> SQL Authentication normal,
 *    com usuário/senha nas variáveis SQL_USER / SQL_PASSWORD.
 *
 * Se você não sabe qual usar: abra o SSMS/Azure Data Studio, veja em
 * "Autenticação" na tela de conexão. Se estiver em branco/"Windows
 * Authentication", use a opção 1. Se tiver usuário e senha salvos, use a 2.
 */

const usaWindowsAuth =
  String(process.env.SQL_TRUSTED_CONNECTION).toLowerCase() === 'true';

const config = usaWindowsAuth
  ? {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      driver: 'msnodesqlv8',
      options: {
        trustedConnection: true,
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    }
  : {
      server: process.env.SQL_SERVER,
      database: process.env.SQL_DATABASE,
      user: process.env.SQL_USER,
      password: process.env.SQL_PASSWORD,
      options: {
        encrypt: String(process.env.SQL_ENCRYPT).toLowerCase() === 'true',
        trustServerCertificate: true,
        enableArithAbort: true,
      },
    };

let poolPromise = null;

/** Retorna (e reaproveita) um pool de conexões único para todo o app. */
export function getPool() {
  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool(config)
      .connect()
      .catch((err) => {
        poolPromise = null; // permite tentar de novo na próxima chamada
        throw err;
      });
  }
  return poolPromise;
}

export { sql };
