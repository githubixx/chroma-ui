// SPDX-License-Identifier: GPL-3.0-or-later
// Theme bootstrap extracted from vdradmin-go; selection remains server-owned.
(() => {
    const normalize = value => (value || '').toLowerCase() || 'system';
    const root = document.documentElement;
    if (normalize(root.dataset.theme) !== 'system') return;
    const fallback = normalize(root.dataset.themeDefault);
    if (fallback !== 'system') {
        root.dataset.theme = fallback;
    } else {
        delete root.dataset.theme;
    }
})();
