import { createClient } from '@supabase/supabase-js';
import { resolveSupabaseUrl, resolveServiceKey } from './env.js';

let adminClient = null;

function getAdminClient() {
  if (adminClient) return adminClient;
  const url = resolveSupabaseUrl();
  const key = resolveServiceKey();
  if (!url || !key) {
    const error = new Error('SUPABASE_SERVICE_ROLE_KEY não configurada.');
    error.status = 503;
    throw error;
  }
  adminClient = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }
  });
  return adminClient;
}

const CAPACIDADES = {
  fornecedores: 'pode_gerenciar_fornecedores',
  materiais: 'pode_aprovar_materiais',
  automacoes: 'pode_gerenciar_automacoes',
  academia: 'pode_gerenciar_academia',
  presenca: 'pode_corrigir_presenca',
  campanhas: 'pode_gerenciar_campanhas',
  catalogo: 'pode_gerenciar_catalogo',
};

async function buscarColaboradorAtivo(userId) {
  const client = getAdminClient();
  const { data, error } = await client
    .from('colaboradores')
    .select(`id,role,ativo,${Object.values(CAPACIDADES).join(',')}`)
    .eq('auth_user_id', userId)
    .eq('ativo', true)
    .maybeSingle();
  if (error) throw error;
  return data;
}

export function isGestor(colaborador) {
  return String(colaborador?.role || '').toLowerCase() === 'gestor';
}

export async function requireColaboradorAtivo(userId) {
  const colaborador = await buscarColaboradorAtivo(userId);
  if (!colaborador) {
    const error = new Error('Usuário não possui perfil ativo no PMG Connect.');
    error.status = 403;
    error.code = 'PMG_PROFILE_REQUIRED';
    throw error;
  }
  return colaborador;
}

export async function requireGestor(userId) {
  const colaborador = await requireColaboradorAtivo(userId);
  if (!isGestor(colaborador)) {
    const error = new Error('Apenas gestores podem acessar este recurso.');
    error.status = 403;
    error.code = 'PMG_GESTOR_REQUIRED';
    throw error;
  }
  return colaborador;
}

export async function requireCapacidade(userId, capacidade) {
  const colaborador = await requireColaboradorAtivo(userId);
  if (isGestor(colaborador)) return colaborador;
  const campo = CAPACIDADES[String(capacidade || '').toLowerCase()];
  const permitido = campo ? colaborador[campo] === true : false;
  if (!permitido) {
    const error = new Error('Você não possui permissão para esta operação.');
    error.status = 403;
    error.code = 'PMG_CAPABILITY_DENIED';
    throw error;
  }
  return colaborador;
}
