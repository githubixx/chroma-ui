// SPDX-License-Identifier: GPL-3.0-or-later
// Optional select enhancement derived from vdradmin-go's loaded theme.js.
(() => {
    const ui = window.ChromaUI ||= {};
    if (ui.initSelects) return;
    let nextID = 0;
    const widgets = new Set();
    const selector = 'select:not([multiple]):not([size]):not(.custom-select-initialized)';
    const uniqueID = () => {
        let id;
        do { id = `chroma-select-${++nextID}`; } while (document.getElementById(id));
        return id;
    };
    const closeAll = except => {
        for (const widget of widgets) {
            if (!widget.select.isConnected) {
                widgets.delete(widget);
            } else if (widget !== except) {
                widget.close();
            }
        }
    };

    ui.initSelects = (root = document) => {
        const selects = [...(root.matches?.(selector) ? [root] : []), ...root.querySelectorAll(selector)];
        for (const select of selects) {
            if (select.disabled || select.hidden || select.style.display === 'none' || select.classList.contains('hidden')) continue;
            const wrapper = document.createElement('div');
            wrapper.className = 'custom-select-container';
            wrapper.classList.toggle('is-pill', select.classList.contains('is-pill'));
            const trigger = document.createElement('div');
            trigger.className = `${select.className} custom-select-trigger`;
            trigger.tabIndex = select.tabIndex;
            trigger.setAttribute('role', 'combobox');
            trigger.setAttribute('aria-haspopup', 'listbox');
            trigger.setAttribute('aria-expanded', 'false');
            const labels = Array.from(select.labels || []);
            const labelledBy = select.getAttribute('aria-labelledby') || labels.map(label => label.id ||= uniqueID()).join(' ');
            if (labelledBy) trigger.setAttribute('aria-labelledby', labelledBy);
            if (select.hasAttribute('aria-label')) trigger.setAttribute('aria-label', select.getAttribute('aria-label'));
            for (const attribute of ['aria-describedby', 'aria-required', 'aria-invalid']) {
                if (select.hasAttribute(attribute)) trigger.setAttribute(attribute, select.getAttribute(attribute));
            }
            if (select.required) trigger.setAttribute('aria-required', 'true');
            const phantom = document.createElement('div');
            phantom.className = `${select.className} custom-select-phantom`;
            phantom.setAttribute('aria-hidden', 'true');
            const dropdown = document.createElement('ul');
            dropdown.id = uniqueID();
            dropdown.className = 'custom-select-dropdown';
            dropdown.setAttribute('role', 'listbox');
            trigger.setAttribute('aria-controls', dropdown.id);
            let active = select.selectedIndex;
            const close = () => {
                dropdown.classList.remove('open');
                trigger.classList.remove('open');
                trigger.setAttribute('aria-expanded', 'false');
                trigger.removeAttribute('aria-activedescendant');
            };
            const highlight = () => {
                for (const option of dropdown.children) {
                    option.classList.toggle('selected', Number(option.dataset.index) === active);
                }
                if (active >= 0) trigger.setAttribute('aria-activedescendant', `${dropdown.id}-${active}`);
            };
            const sync = () => {
                trigger.textContent = select.selectedOptions[0]?.text || '';
                phantom.textContent = Array.from(select.options).reduce((text, option) => option.text.length > text.length ? option.text : text, '');
                trigger.setAttribute('aria-disabled', String(select.disabled));
                trigger.tabIndex = select.disabled ? -1 : select.tabIndex;
                if (select.required) trigger.setAttribute('aria-required', 'true');
                else if (!select.hasAttribute('aria-required')) trigger.removeAttribute('aria-required');
                if (select.validity.valid && !select.hasAttribute('aria-invalid')) trigger.removeAttribute('aria-invalid');
                dropdown.replaceChildren();
                Array.from(select.options).forEach((option, index) => {
                    const item = document.createElement('li');
                    item.id = `${dropdown.id}-${index}`;
                    item.className = 'custom-select-option';
                    item.textContent = option.text;
                    item.dataset.index = String(index);
                    item.setAttribute('role', 'option');
                    item.setAttribute('aria-selected', String(option.selected));
                    const disabled = option.disabled || (option.parentElement instanceof HTMLOptGroupElement && option.parentElement.disabled);
                    item.setAttribute('aria-disabled', String(disabled));
                    item.addEventListener('click', event => {
                        event.stopPropagation();
                        if (!disabled) choose(index);
                    });
                    dropdown.appendChild(item);
                });
                active = select.selectedIndex;
                if (dropdown.classList.contains('open')) highlight();
            };
            const choose = index => {
                if (select.disabled) return;
                select.selectedIndex = index;
                close();
                sync();
                trigger.focus();
                select.dispatchEvent(new Event('input', { bubbles: true }));
                select.dispatchEvent(new Event('change', { bubbles: true }));
            };
            const widget = { select, close };
            const open = () => {
                if (select.disabled) return;
                closeAll(widget);
                sync();
                dropdown.classList.add('open');
                trigger.classList.add('open');
                trigger.setAttribute('aria-expanded', 'true');
                highlight();
                const selected = dropdown.children[active];
                if (selected) dropdown.scrollTop = selected.offsetTop - (dropdown.clientHeight - selected.offsetHeight) / 2;
            };
            const move = direction => {
                for (let index = active + direction; index >= 0 && index < dropdown.children.length; index += direction) {
                    if (dropdown.children[index].getAttribute('aria-disabled') !== 'true') {
                        active = index;
                        highlight();
                        dropdown.children[index].scrollIntoView({ block: 'nearest' });
                        break;
                    }
                }
            };
            trigger.addEventListener('click', event => {
                event.stopPropagation();
                if (dropdown.classList.contains('open')) close(); else open();
            });
            trigger.addEventListener('keydown', event => {
                if (['ArrowDown', 'ArrowUp', 'Enter', ' ', 'Escape', 'Home', 'End'].includes(event.key)) event.preventDefault();
                if (event.key === 'Escape' || event.key === 'Tab') {
                    close();
                } else if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
                    if (!dropdown.classList.contains('open')) open();
                    move(event.key === 'ArrowDown' ? 1 : -1);
                } else if (event.key === 'Home' || event.key === 'End') {
                    if (!dropdown.classList.contains('open')) open();
                    active = event.key === 'Home' ? -1 : dropdown.children.length;
                    move(event.key === 'Home' ? 1 : -1);
                } else if (event.key === 'Enter' || event.key === ' ') {
                    if (dropdown.classList.contains('open')) {
                        if (active >= 0 && dropdown.children[active].getAttribute('aria-disabled') !== 'true') choose(active);
                    } else open();
                }
            });
            trigger.addEventListener('focusout', close);
            dropdown.addEventListener('mousedown', event => event.preventDefault());
            select.addEventListener('change', sync);
            select.addEventListener('invalid', event => {
                event.preventDefault();
                trigger.setAttribute('aria-invalid', 'true');
                trigger.focus();
            });
            // Native reset values are applied after reset-event microtasks.
            select.form?.addEventListener('reset', event => setTimeout(() => {
                if (!event.defaultPrevented) { close(); sync(); }
            }, 0));
            for (const label of labels) {
                label.addEventListener('click', event => {
                    if (event.target === label) { event.preventDefault(); trigger.focus(); }
                });
            }
            select.before(wrapper);
            wrapper.append(select, phantom, trigger, dropdown);
            select.classList.add('custom-select-initialized');
            select.style.display = 'none';
            widgets.add(widget);
            sync();
        }
    };
    document.addEventListener('click', () => closeAll());
    document.addEventListener('htmx:load', event => ui.initSelects(event.detail.elt));
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', () => ui.initSelects());
    } else {
        ui.initSelects();
    }
})();
