// SPDX-License-Identifier: GPL-3.0-or-later
// Outside-click/Escape behavior extracted from vdradmin-go's navigation.
(() => {
    const ui = window.ChromaUI ||= {};
    if (ui.menuInitialized) return;
    ui.menuInitialized = true;

    document.addEventListener('click', event => {
        for (const menu of document.querySelectorAll('details.nav-burger[open]')) {
            if (!menu.contains(event.target)) menu.open = false;
        }
    }, true);
    document.addEventListener('keydown', event => {
        if (event.key !== 'Escape') return;
        for (const menu of document.querySelectorAll('details.nav-burger[open]')) {
            menu.open = false;
            menu.querySelector('summary')?.focus();
        }
    });
})();
