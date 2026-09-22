import 'package:flutter/material.dart';
import 'package:supabase_flutter/supabase_flutter.dart';

import '../theme/app_colors.dart';
import '../widgets/star_shape.dart';
import 'welcome_screen.dart';

enum _AuthMode { welcome, login, signUp }

/// Tela raiz enquanto o usuário não está autenticado: mostra a
/// apresentação ([WelcomeScreen]) e, ao tocar em Entrar/Cadastrar/Começar,
/// o formulário correspondente de login ou cadastro via Supabase Auth.
class AuthScreen extends StatefulWidget {
  const AuthScreen({super.key});

  @override
  State<AuthScreen> createState() => _AuthScreenState();
}

class _AuthScreenState extends State<AuthScreen> {
  _AuthMode _mode = _AuthMode.welcome;

  @override
  Widget build(BuildContext context) {
    switch (_mode) {
      case _AuthMode.welcome:
        return WelcomeScreen(
          onLogin: () => setState(() => _mode = _AuthMode.login),
          onSignUp: () => setState(() => _mode = _AuthMode.signUp),
        );
      case _AuthMode.login:
        return _AuthForm(
          isSignUp: false,
          onBack: () => setState(() => _mode = _AuthMode.welcome),
          onSwitchMode: () => setState(() => _mode = _AuthMode.signUp),
        );
      case _AuthMode.signUp:
        return _AuthForm(
          isSignUp: true,
          onBack: () => setState(() => _mode = _AuthMode.welcome),
          onSwitchMode: () => setState(() => _mode = _AuthMode.login),
        );
    }
  }
}

class _AuthForm extends StatefulWidget {
  const _AuthForm({
    required this.isSignUp,
    required this.onBack,
    required this.onSwitchMode,
  });

  final bool isSignUp;
  final VoidCallback onBack;
  final VoidCallback onSwitchMode;

  @override
  State<_AuthForm> createState() => _AuthFormState();
}

class _AuthFormState extends State<_AuthForm> {
  final _formKey = GlobalKey<FormState>();
  final _nameController = TextEditingController();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _isLoading = false;
  String? _errorText;
  String? _infoText;

  @override
  void dispose() {
    _nameController.dispose();
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() {
      _isLoading = true;
      _errorText = null;
      _infoText = null;
    });

    try {
      final auth = Supabase.instance.client.auth;
      if (widget.isSignUp) {
        final response = await auth.signUp(
          email: _emailController.text.trim(),
          password: _passwordController.text,
          data: {'display_name': _nameController.text.trim()},
        );
        // Com confirmação de e-mail ativada (padrão do Supabase), o
        // cadastro não gera sessão imediata.
        if (response.session == null && mounted) {
          setState(
            () => _infoText = 'Cadastro feito! Confirme seu e-mail pra entrar.',
          );
        }
      } else {
        await auth.signInWithPassword(
          email: _emailController.text.trim(),
          password: _passwordController.text,
        );
      }
    } on AuthException catch (e) {
      setState(() => _errorText = e.message);
    } catch (_) {
      setState(() => _errorText = 'Não foi possível conectar. Tente de novo.');
    } finally {
      if (mounted) setState(() => _isLoading = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: widget.onBack,
        ),
        backgroundColor: Colors.transparent,
        elevation: 0,
      ),
      body: Center(
        child: SingleChildScrollView(
          padding: const EdgeInsets.symmetric(horizontal: 28, vertical: 20),
          child: ConstrainedBox(
            constraints: const BoxConstraints(maxWidth: 380),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  Row(
                    children: [
                      const StarShape(size: 22, color: AppColors.wine),
                      const SizedBox(width: 8),
                      Text(
                        'Wable',
                        style: Theme.of(context).textTheme.headlineMedium
                            ?.copyWith(fontSize: 20, height: 1),
                      ),
                    ],
                  ),
                  const SizedBox(height: 20),
                  Text(
                    widget.isSignUp ? 'Criar conta' : 'Entrar',
                    style: Theme.of(context).textTheme.headlineLarge,
                  ),
                  const SizedBox(height: 24),
                  if (widget.isSignUp) ...[
                    TextFormField(
                      controller: _nameController,
                      textCapitalization: TextCapitalization.words,
                      decoration: const InputDecoration(
                        labelText: 'Como você quer ser chamada?',
                        helperText: 'Apelido ou nome — é assim que vamos te chamar no app.',
                      ),
                      validator: (value) => (value == null || value.trim().isEmpty)
                          ? 'Diz como podemos te chamar'
                          : null,
                    ),
                    const SizedBox(height: 16),
                  ],
                  TextFormField(
                    controller: _emailController,
                    keyboardType: TextInputType.emailAddress,
                    autofillHints: const [AutofillHints.email],
                    decoration: const InputDecoration(labelText: 'E-mail'),
                    validator: (value) => (value == null || !value.contains('@'))
                        ? 'Digite um e-mail válido'
                        : null,
                  ),
                  const SizedBox(height: 16),
                  TextFormField(
                    controller: _passwordController,
                    obscureText: true,
                    autofillHints: const [AutofillHints.password],
                    decoration: const InputDecoration(labelText: 'Senha'),
                    validator: (value) => (value == null || value.length < 6)
                        ? 'A senha precisa de pelo menos 6 caracteres'
                        : null,
                  ),
                  if (_errorText != null) ...[
                    const SizedBox(height: 12),
                    Text(
                      _errorText!,
                      style: const TextStyle(color: AppColors.error),
                    ),
                  ],
                  if (_infoText != null) ...[
                    const SizedBox(height: 12),
                    Text(_infoText!, style: const TextStyle(color: AppColors.wine)),
                  ],
                  const SizedBox(height: 24),
                  ElevatedButton(
                    onPressed: _isLoading ? null : _submit,
                    child: _isLoading
                        ? const SizedBox(
                            width: 20,
                            height: 20,
                            child: CircularProgressIndicator(strokeWidth: 2),
                          )
                        : Text(widget.isSignUp ? 'Cadastrar' : 'Entrar'),
                  ),
                  const SizedBox(height: 12),
                  TextButton(
                    onPressed: widget.onSwitchMode,
                    child: Text(
                      widget.isSignUp
                          ? 'Já tem conta? Entrar'
                          : 'Não tem conta? Cadastre-se',
                      style: const TextStyle(color: AppColors.wine),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}
