import { App } from '@capacitor/app';

if (window.Capacitor?.isNativePlatform?.()) {

  let lastBackPress = 0;

  App.addListener('backButton', () => {

    // 1. Close the topmost open modal
    const modals = [
      ...document.querySelectorAll('.modal-overlay.open, .modal-overlay.active')
    ];

    if (modals.length > 0) {
      const modal = modals[modals.length - 1];
      modal.classList.remove('open', 'active');
      return;
    }

    // 2. Close notifications drawer
    const drawer = document.getElementById('notifications-drawer');

    if (drawer && getComputedStyle(drawer).display !== 'none') {
      drawer.style.display = 'none';
      return;
    }

    // 3. Return from authentication screen to landing
    const authStage = document.getElementById('auth-stage');

    if (authStage && getComputedStyle(authStage).display !== 'none') {
      window.showLandingPage?.();
      return;
    }

    // 4. Handle app navigation
    const appStage = document.getElementById('app-stage');

    if (appStage && getComputedStyle(appStage).display !== 'none') {

      const isHost = document
        .getElementById('mode-host-btn')
        ?.classList.contains('active');

      const defaultTab = isHost ? 'host-dash' : 'explore';

      const activeTab = document.querySelector(
        '#app-tabs-bar .nav-tab-item.active[data-tab]'
      );

      if (activeTab?.dataset.tab !== defaultTab) {
        window.switchTab?.(defaultTab);
        return;
      }

      // Return to landing from the main dashboard
      window.showLandingPage?.();
      return;
    }

    // 5. Double-back to exit from landing page
    const now = Date.now();

    if (now - lastBackPress < 2000) {
      App.exitApp();
    } else {
      lastBackPress = now;
      window.showToast?.('Press back again to exit', 'info');
    }
  });

  console.log('ChargeEase Android back button handler initialized');
}