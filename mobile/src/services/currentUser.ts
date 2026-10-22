import type { User } from '@supabase/supabase-js';

/**
 * Nome que o usuário escolheu pra ser chamado (definido no cadastro, guardado
 * em `user_metadata.display_name`). Contas criadas antes dessa feature
 * existir não têm esse metadado — nesse caso cai pro início do e-mail.
 */
export function displayNameOf(user: Pick<User, 'email' | 'user_metadata'> | null | undefined): string {
  if (!user) return '';
  const metadataName = user.user_metadata?.display_name;
  if (typeof metadataName === 'string' && metadataName.trim() !== '') return metadataName.trim();
  if (user.email?.includes('@')) return user.email.split('@')[0];
  return '';
}
