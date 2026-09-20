import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import 'star_shape.dart';

class NavDestinationData {
  const NavDestinationData({required this.icon, required this.label});

  final IconData icon;
  final String label;
}

const List<NavDestinationData> appDestinations = [
  NavDestinationData(icon: Icons.checkroom, label: 'Meu guarda-roupa'),
  NavDestinationData(icon: Icons.star_border_rounded, label: 'Looks'),
  NavDestinationData(icon: Icons.favorite_border, label: 'Favoritos'),
  NavDestinationData(icon: Icons.settings_outlined, label: 'Configurações'),
];

/// Casca de navegação compartilhada pelas telas internas do app: barra
/// lateral em telas largas (web/tablet), navegação inferior no celular —
/// igual ao mockup, que mostra um menu lateral fixo com as 4 seções.
class AppShell extends StatelessWidget {
  const AppShell({
    super.key,
    required this.selectedIndex,
    required this.onDestinationSelected,
    required this.body,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;
  final Widget body;

  static const double _wideBreakpoint = 840;

  @override
  Widget build(BuildContext context) {
    final isWide = MediaQuery.sizeOf(context).width >= _wideBreakpoint;

    if (isWide) {
      return Scaffold(
        body: Row(
          children: [
            _SideNav(
              selectedIndex: selectedIndex,
              onDestinationSelected: onDestinationSelected,
            ),
            const VerticalDivider(width: 1),
            Expanded(child: body),
          ],
        ),
      );
    }

    return Scaffold(
      body: body,
      bottomNavigationBar: NavigationBar(
        selectedIndex: selectedIndex,
        onDestinationSelected: onDestinationSelected,
        backgroundColor: Colors.white,
        indicatorColor: AppColors.pinkLight,
        destinations: [
          for (final destination in appDestinations)
            NavigationDestination(
              icon: Icon(destination.icon),
              label: destination.label,
            ),
        ],
      ),
    );
  }
}

class _SideNav extends StatelessWidget {
  const _SideNav({
    required this.selectedIndex,
    required this.onDestinationSelected,
  });

  final int selectedIndex;
  final ValueChanged<int> onDestinationSelected;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 240,
      color: Colors.white,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 24),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: 8),
            child: Row(
              children: [
                const StarShape(size: 22, color: AppColors.wine),
                const SizedBox(width: 8),
                Text(
                  'Wable',
                  style: Theme.of(context).textTheme.headlineMedium
                      ?.copyWith(fontSize: 22, height: 1),
                ),
              ],
            ),
          ),
          const SizedBox(height: 32),
          for (var i = 0; i < appDestinations.length; i++)
            _SideNavTile(
              data: appDestinations[i],
              selected: i == selectedIndex,
              onTap: () => onDestinationSelected(i),
            ),
        ],
      ),
    );
  }
}

class _SideNavTile extends StatelessWidget {
  const _SideNavTile({
    required this.data,
    required this.selected,
    required this.onTap,
  });

  final NavDestinationData data;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Material(
        color: selected ? AppColors.pinkLight : Colors.transparent,
        borderRadius: BorderRadius.circular(14),
        child: InkWell(
          borderRadius: BorderRadius.circular(14),
          onTap: onTap,
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 12),
            child: Row(
              children: [
                Icon(
                  data.icon,
                  size: 20,
                  color: selected ? AppColors.wine : AppColors.textMuted,
                ),
                const SizedBox(width: 12),
                Text(
                  data.label,
                  style: Theme.of(context).textTheme.titleMedium?.copyWith(
                    color: selected ? AppColors.wine : AppColors.textMuted,
                    fontWeight: selected ? FontWeight.w700 : FontWeight.w500,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
