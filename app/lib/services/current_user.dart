import 'package:supabase_flutter/supabase_flutter.dart';

/// Nome que o usuário escolheu pra ser chamado (definido no cadastro,
/// guardado em `user_metadata.display_name`). Contas criadas antes dessa
/// feature existir não têm esse metadado — nesse caso cai pro início do
/// e-mail.
String currentDisplayName() {
  final user = Supabase.instance.client.auth.currentUser;
  if (user == null) return '';

  final metadataName = user.userMetadata?['display_name'] as String?;
  if (metadataName != null && metadataName.trim().isNotEmpty) {
    return metadataName.trim();
  }

  final email = user.email;
  if (email != null && email.contains('@')) {
    return email.split('@').first;
  }

  return '';
}
