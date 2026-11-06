import { test as base, expect } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const resourceRoot = path.resolve(import.meta.dirname, '../../.cache/e2e-resources');
const resources = JSON.parse(await readFile(new URL('./resources.lock.json', import.meta.url), 'utf8'));
async function routeResources(target, errors) {
    await target.route('https://**/*', async route => {
        const url = new URL(route.request().url()).href;
        const resource = resources[url];
        if (!resource) {
            errors.push(`Unregistered external resource: ${url}`);
            await route.abort('blockedbyclient');
            return;
        }
        await route.fulfill({
            contentType: resource.contentType,
            body: await readFile(path.join(resourceRoot, resource.sha256)),
            headers: { 'access-control-allow-origin': '*' },
        });
    });
}
const test = base.extend({
    page: async ({ page }, use) => {
        const errors = [];
        page.on('pageerror', error => errors.push(error.message));
        page.on('response', response => { if (response.status() >= 400) errors.push(`${response.status()} ${response.url()}`); });
        page.on('requestfailed', request => {
            if (request.failure()?.errorText !== 'net::ERR_ABORTED') errors.push(`${request.failure()?.errorText} ${request.url()}`);
        });
        await routeResources(page, errors);
        await use(page);
        expect(errors, 'Browser errors or missing resources').toEqual([]);
    },
});

async function open(page, query = '') {
    const response = await page.goto(`/${query}`);
    expect(response.status()).toBe(200);
    await page.evaluate(() => document.fonts.ready);
    await page.evaluate(async () => {
        const background = getComputedStyle(document.body).backgroundImage;
        const urls = Array.from(background.matchAll(/url\(["']?([^"')]+)["']?\)/g), match => match[1]);
        await Promise.all(urls.map(async url => {
            const image = new Image();
            image.src = url;
            await image.decode();
        }));
    });
}

const themes = [
    { id: 'aurora-glass-1', font: 'Manrope', radius: 0.5, scheme: 'dark' },
    { id: 'fitness', font: 'Inter', radius: 1.25, scheme: 'dark' },
    { id: 'glas-1', font: 'Inter', radius: 0.75, scheme: 'light' },
    { id: 'gold-1', font: 'Inter', radius: 0.35, scheme: 'dark' },
    { id: 'golden-moon', font: 'Lora', radius: 0.75, scheme: 'dark' },
    { id: 'leather-style-black-1', font: 'Inter', radius: 0.75, scheme: 'dark' },
    { id: 'leather-style-red-1', font: 'Inter', radius: 0.75, scheme: 'dark' },
    { id: 'lighting-1', font: 'Rajdhani', radius: 0.25, scheme: 'dark' },
    { id: 'luxury-1', font: 'Inter', radius: 0.75, scheme: 'dark' },
    { id: 'mantle-1', font: 'Inter', radius: 1, scheme: 'dark' },
    { id: 'retro-arcade', font: 'VT323', radius: 0.35, scheme: 'dark' },
    { id: 'solar-system-1', font: 'Rajdhani', radius: 0.35, scheme: 'dark' },
    { id: 'space-night-1', font: 'Inter', radius: 0.75, scheme: 'dark' },
    { id: 'light', font: 'Inter', radius: 0.75, scheme: 'light' },
    { id: 'dark', font: 'Inter', radius: 0.75, scheme: 'dark' },
    { id: 'cartoon-1', font: 'Fredoka', radius: 1, scheme: 'dark' },
    { id: 'metal-1', font: 'Barlow Condensed', radius: 0.25, scheme: 'dark' },
    ...['blue', 'cyan', 'green', 'grey', 'magenta', 'mono', 'orange', 'purple', 'red', 'yellow'].flatMap(color =>
        ['dark', 'light'].map(shade => ({
            id: `spaceship-${color}-${shade}`, font: 'Rajdhani', radius: 0.25, scheme: 'dark',
        }))),
    { id: 'spaceship-2', font: 'Share Tech Mono', radius: 0, scheme: 'dark', framed: true },
    { id: 'crt-starfield-1', font: 'Space Grotesk', radius: 0.25, scheme: 'dark' },
];

async function expectPagerLayout(page) {
    const pagers = page.locator('.ui-pager');
    await expect(pagers).toHaveCount(3);
    for (const pager of await pagers.all()) {
        await expect(pager).toHaveCSS('display', 'flex');
        await expect(pager).toHaveCSS('justify-content', 'center');
        await expect(pager).toHaveCSS('flex-wrap', 'wrap');
        await expect(pager).toHaveRole('navigation');
        await expect(pager).toHaveAccessibleName(/Memory Desk|Mail Console/);
        await expect(pager.getByRole('status')).toHaveAttribute('aria-live', 'polite');
        await expect(pager.getByRole('status')).toHaveAttribute('aria-atomic', 'true');
        const layout = await pager.evaluate(element => {
            const rect = node => {
                const { left, right, top, bottom } = node.getBoundingClientRect();
                return { left, right, top, bottom };
            };
            return {
                box: rect(element),
                scrollWidth: element.scrollWidth, clientWidth: element.clientWidth,
                children: [...element.children].map(rect),
            };
        });
        expect(layout.scrollWidth, 'Pager must not require horizontal scrolling').toBeLessThanOrEqual(layout.clientWidth + 1);
        for (const child of layout.children) {
            expect(child.left).toBeGreaterThanOrEqual(layout.box.left - 1);
            expect(child.right).toBeLessThanOrEqual(layout.box.right + 1);
            expect(child.top).toBeGreaterThanOrEqual(layout.box.top - 1);
            expect(child.bottom).toBeLessThanOrEqual(layout.box.bottom + 1);
        }
        for (let i = 0; i < layout.children.length; i++) {
            for (let j = i + 1; j < layout.children.length; j++) {
                const a = layout.children[i], b = layout.children[j];
                expect(a.right <= b.left + 1 || b.right <= a.left + 1 ||
                    a.bottom <= b.top + 1 || b.bottom <= a.top + 1,
                'Pager controls and status must not overlap').toBe(true);
            }
        }
    }
    await expect(pagers.first().getByRole('button', { name: 'Previous page' })).toBeDisabled();
    await expect(pagers.first().getByRole('button', { name: 'Next page' })).toBeEnabled();
    await expect(pagers.nth(1).getByRole('button', { name: 'Previous page' })).toBeEnabled();
    await expect(pagers.nth(1).getByRole('button', { name: 'Next page' })).toBeEnabled();
    await expect(pagers.last().getByRole('button', { name: 'Previous page' })).toBeEnabled();
    await expect(pagers.last().getByRole('button', { name: 'Next page' })).toBeDisabled();
}

for (const width of [1440, 390]) {
    test(`leather-style-black-1 polished highlights retain compact component sizing at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        const dimensions = () => page.locator('.demo-actions .btn, #title, #notes, .custom-select-trigger').evaluateAll(elements =>
            elements.map(element => {
                const style = getComputedStyle(element);
                return [style.padding, style.fontSize, style.borderWidth, style.borderRadius,
                    element.getBoundingClientRect().width, element.getBoundingClientRect().height];
            }));
        await open(page, '?theme=leather-style-red-1');
        const original = await dimensions();
        await open(page, '?theme=leather-style-black-1');
        expect(await dimensions(), 'Gloss must not enlarge buttons or form controls').toEqual(original);
        const capture = await page.locator('.card').first().screenshot({ animations: 'disabled' });
        const reflection = await page.evaluate(async imageData => {
            const image = new Image();
            image.src = `data:image/png;base64,${imageData}`;
            await image.decode();
            const canvas = document.createElement('canvas');
            canvas.width = image.width;
            canvas.height = image.height;
            const context = canvas.getContext('2d');
            context.drawImage(image, 0, 0);
            const brightness = y => {
                const pixels = context.getImageData(Math.floor(image.width / 2), y, 5, 5).data;
                let total = 0;
                for (let i = 0; i < pixels.length; i += 4) total += pixels[i] + pixels[i + 1] + pixels[i + 2];
                return total / 75;
            };
            return { highlight: brightness(16), body: brightness(image.height - 24) };
        }, capture.toString('base64'));
        expect(reflection.highlight, 'Polished highlights must visibly lift the dark panel surface').toBeGreaterThan(reflection.body + 8);
        expect(reflection.highlight, 'Panel highlights remain restrained rather than white glare').toBeLessThan(100);
    });
}

for (const [width, height] of [[1561, 600], [1920, 1080], [390, 844]]) {
    for (const app of ['memory', 'mail']) {
        test(`leather-style-black-1 retains the background head in ${app} at ${width}x${height}`, async ({ page }, testInfo) => {
            await page.setViewportSize({ width, height });
            await open(page, `?app=${app}&theme=leather-style-black-1`);
            await page.screenshot({ path: testInfo.outputPath('head-layout.png'), animations: 'disabled' });
            const mobile = width <= 768;
            const hideContent = await page.addStyleTag({ content: 'body > * { visibility: hidden !important; }' });
            let capture;
            try {
                capture = await page.screenshot({ path: testInfo.outputPath('head-background.png'), animations: 'disabled' });
            } finally {
                await hideContent.evaluate(element => element.remove());
            }
            const framing = await page.evaluate(async ({ screenshot, mobile }) => {
                const background = getComputedStyle(document.body).backgroundImage;
                const url = background.match(/url\(["']?([^"')]+)["']?\)/)[1];
                const artwork = new Image();
                artwork.src = url;
                const actual = new Image();
                actual.src = `data:image/png;base64,${screenshot}`;
                await Promise.all([artwork.decode(), actual.decode()]);
                const viewportWidth = document.documentElement.clientWidth;
                const scale = Math.max(viewportWidth / artwork.width, innerHeight / artwork.height);
                const offsetX = (viewportWidth - artwork.width * scale) / 2;
                // Source coordinates enclose the approved model's hair and face.
                const x = Math.round((mobile ? 180 : 1100) * scale + offsetX);
                const y = Math.round(30 * scale);
                const size = Math.round(180 * scale);
                const canvas = document.createElement('canvas');
                canvas.width = innerWidth;
                canvas.height = innerHeight;
                const context = canvas.getContext('2d');
                context.drawImage(artwork, offsetX, 0, artwork.width * scale, artwork.height * scale);
                const expected = context.getImageData(x, y, size, size).data;
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(actual, 0, 0);
                const rendered = context.getImageData(x, y, size, size).data;
                let total = 0;
                for (let i = 0; i < expected.length; i += 4) {
                    for (let channel = 0; channel < 3; channel++) {
                        total += Math.abs(expected[i + channel] - rendered[i + channel]);
                    }
                }
                context.clearRect(0, 0, canvas.width, canvas.height);
                context.drawImage(artwork, 0, 0);
                const skin = context.getImageData(mobile ? 265 : 1185, 80, 20, 20).data;
                let warmth = 0;
                for (let i = 0; i < skin.length; i += 4) warmth += skin[i] - skin[i + 2];
                return {
                    difference: total / (size * size * 3),
                    x, y, right: x + size, bottom: y + size,
                    warmth: warmth / 400,
                };
            }, { screenshot: capture.toString('base64'), mobile });
            expect(framing.difference, 'Rendered hair and face must match the uncropped artwork').toBeLessThan(10);
            expect(framing.right).toBeLessThanOrEqual(width);
            expect(framing.bottom).toBeLessThanOrEqual(height);
            expect(framing.x).toBeGreaterThanOrEqual(0);
            expect(framing.y).toBeGreaterThanOrEqual(0);
            expect(framing.warmth, 'The approved skin tones must retain natural color, not grayscale').toBeGreaterThan(15);
        });
    }
}

for (const app of ['memory', 'mail']) {
    for (const theme of themes) {
        for (const width of [1440, 390]) {
            test(`${app} ${theme.id} ${width}px uses shared components without overflow`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 1000 });
                await open(page, `?app=${app}&theme=${theme.id}`);
                await expect(page.getByRole('heading', { level: 1 })).toContainText(app === 'memory' ? 'Memory Desk' : 'Mail Console');
                await expect(page.getByRole('button', { name: app === 'memory' ? 'Create memory' : 'Create mailbox' })).toBeVisible();
                expect(await page.locator('html').getAttribute('data-theme')).toBe(theme.id);
                await expect(page.locator('html')).toHaveCSS('color-scheme', theme.scheme);
                const viewport = await page.evaluate(() => ({
                    content: document.documentElement.scrollWidth, available: document.documentElement.clientWidth,
                }));
                expect(viewport.content).toBeLessThanOrEqual(viewport.available);
                const styles = await page.locator('.card').first().evaluate(element => {
                    const style = getComputedStyle(element);
                    return {
                        radius: style.borderRadius, font: style.fontFamily,
                        backgroundColor: style.backgroundColor, backgroundImage: style.backgroundImage,
                        frame: style.borderImageSource, rootFontSize: parseFloat(getComputedStyle(document.documentElement).fontSize),
                    };
                });
                expect(parseFloat(styles.radius)).toBeCloseTo(styles.rootFontSize * theme.radius, 1);
                if (theme.framed) {
                    expect(styles.frame).toContain('data:image/svg+xml');
                } else {
                    expect(styles.backgroundImage !== 'none' || styles.backgroundColor !== 'rgba(0, 0, 0, 0)').toBeTruthy();
                }
                expect(styles.font).toContain(theme.font);
                expect(await page.evaluate(font => Array.from(document.fonts).some(face =>
                    face.family.replaceAll('"', '').replaceAll("'", '') === font && face.status === 'loaded'), theme.font)).toBeTruthy();
                if (theme.radius >= 0.75) {
                    for (const field of ['#title', '#notes', '#locked']) {
                        expect(await page.locator(field).evaluate(element => parseFloat(getComputedStyle(element).borderRadius))).toBeGreaterThan(0);
                    }
                }
                const states = await page.locator('.ui-item').evaluateAll(items => items.map(item => {
                    const style = getComputedStyle(item);
                    return `${style.borderColor}|${style.background}|${style.borderImageSource}|${style.opacity}`;
                }));
                expect(new Set(states).size).toBe(5);
                await expectSemanticItemBorders(page);
                expect(await page.locator('.ui-item.is-inactive').evaluate(item => Number(getComputedStyle(item).opacity))).toBeLessThan(1);
                const progress = page.getByRole('progressbar', { name: 'Example progress' });
                await expect(progress).toHaveAttribute('aria-valuenow', '65');
                const track = await progress.boundingBox();
                const bar = await progress.locator('.progress-bar').boundingBox();
                expect(bar.height).toBeGreaterThan(0);
                expect(Math.abs(bar.width / track.width - 0.65)).toBeLessThan(0.02);
                expect(await page.locator('.data-table th').first().evaluate(element => parseFloat(getComputedStyle(element).paddingLeft))).toBeGreaterThan(1);
                await expectPagerLayout(page);
                if (app === 'memory') {
                    await page.screenshot({ path: testInfo.outputPath('showcase.png'), fullPage: true });
                }
                const menu = page.getByLabel('Navigate', { exact: true });
                await menu.click();
                await expect(page.locator('.nav-burger-menu a').first()).toBeVisible();
                await page.keyboard.press('Escape');
                await expect(menu).toBeFocused();
                const picker = page.getByRole('combobox', { name: 'Theme', exact: true });
                await picker.click();
                const options = page.locator('.custom-select-dropdown.open');
                if (app === 'memory') {
                    await expectOpaqueDropdown(page, options);
                    await page.screenshot({ path: testInfo.outputPath('showcase-dropdown.png'), animations: 'disabled' });
                }
                await options.evaluate(list => { list.scrollTop = list.scrollHeight; });
                const lastOption = options.getByRole('option').last();
                await expect.poll(() => lastOption.evaluate(option => {
                    const bounds = option.getBoundingClientRect();
                    return document.elementFromPoint(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2)?.closest('[role="option"]') === option;
                })).toBe(true);
                await lastOption.click();
                await expect(page.locator('#theme')).toHaveValue('spaceship-yellow-light');
                expect(await page.locator('.card').first().evaluate(card => card.scrollTop)).toBe(0);
            });
        }
    }
}

for (const app of ['memory', 'mail']) {
    test(`${app} pager preserves keyboard access, native boundaries and live status`, async ({ page }) => {
        await open(page, `?app=${app}&theme=light`);
        const pagers = page.locator('.ui-pager');
        const firstNext = pagers.first().getByRole('button', { name: 'Next page' });
        const middlePrevious = pagers.nth(1).getByRole('button', { name: 'Previous page' });
        await firstNext.focus();
        await page.keyboard.press('Tab');
        await expect(middlePrevious).toBeFocused();
        await page.keyboard.press('Shift+Tab');
        await expect(firstNext).toBeFocused();
        await pagers.first().getByRole('button', { name: 'Previous page' }).focus();
        await expect(firstNext).toBeFocused();
        const lastPrevious = pagers.last().getByRole('button', { name: 'Previous page' });
        await lastPrevious.focus();
        await page.keyboard.press('Tab');
        await expect(pagers.last().getByRole('button', { name: 'Next page' })).not.toBeFocused();
        const status = pagers.nth(1).getByRole('status');
        await status.evaluate(element => { element.textContent = 'Application-owned updated range'; });
        await expect(status).toHaveText('Application-owned updated range');
        await expect(status).toHaveAttribute('aria-live', 'polite');
        await expectPagerLayout(page);
    });
}

test('pager wraps long ranges and supports hidden and bare compositions', async ({ page }, testInfo) => {
    for (const theme of ['metal-1', 'spaceship-2']) {
        for (const app of ['memory', 'mail']) {
            await open(page, `?app=${app}&theme=${theme}`);
            const pagers = page.locator('.ui-pager');
            await pagers.first().evaluate(element => { element.hidden = true; });
            await expect(pagers.first()).toBeHidden();
            await pagers.first().evaluate(element => { element.hidden = false; });
            await expect(pagers.first()).toBeVisible();
            await pagers.nth(1).evaluate(element => { element.classList.remove('toolbar'); });
            await pagers.nth(1).getByRole('status').evaluate(element => {
                element.textContent = 'VeryLongApplicationOwnedRangeLabel'.repeat(12);
            });
            for (const width of [390, 320]) {
                await page.setViewportSize({ width, height: 1000 });
                await expectPagerLayout(page);
                expect(await page.evaluate(() => document.documentElement.scrollWidth))
                    .toBeLessThanOrEqual(width);
            }
            await pagers.first().screenshot({ path: testInfo.outputPath(`${app}-${theme}-pager.png`), animations: 'disabled' });
        }
    }
});

function hasSemanticHue(channels, state) {
    const [red, green, blue, alpha = 1] = channels;
    const maximum = Math.max(red, green, blue);
    const minimum = Math.min(red, green, blue);
    const delta = maximum - minimum;
    if (alpha < 0.35 || maximum < 50 || delta / maximum < 0.25) return false;
    let hue = maximum === red ? (green - blue) / delta
        : maximum === green ? (blue - red) / delta + 2 : (red - green) / delta + 4;
    hue = (hue * 60 + 360) % 360;
    if (state === 'active') return hue >= 75 && hue <= 175;
    if (state === 'warning') return hue >= 20 && hue <= 70;
    return hue >= 330 || hue <= 15;
}

function readItemBorder(element) {
    const style = getComputedStyle(element);
    let color = style.borderLeftColor;
    const framed = style.borderImageSource !== 'none';
    if (framed) {
        const url = style.borderImageSource.match(/url\(["']?([^"')]+)["']?\)/)?.[1];
        if (!url?.startsWith('data:image/svg+xml')) throw new Error(`Unsupported item border image: ${style.borderImageSource}`);
        const comma = url.indexOf(',');
        const svg = new DOMParser().parseFromString(
            url.slice(0, comma).endsWith(';base64') ? atob(url.slice(comma + 1)) : decodeURIComponent(url.slice(comma + 1)),
            'image/svg+xml',
        );
        const stroke = svg.querySelector('polygon[stroke], path[stroke], rect[stroke]')?.getAttribute('stroke');
        if (!stroke) throw new Error('Item SVG frame has no outline stroke');
        const probe = document.createElement('span');
        probe.style.color = stroke;
        element.append(probe);
        color = getComputedStyle(probe).color;
        probe.remove();
    }
    return { color, framed, width: parseFloat(style.borderLeftWidth), style: style.borderLeftStyle };
}

async function expectSemanticItemBorders(page) {
    const ordinary = await page.locator('.ui-item').first().evaluate(readItemBorder);
    const theme = await page.locator('html').getAttribute('data-theme');
    const spaceship = theme.startsWith('spaceship');
    const leather = theme.startsWith('leather-style-');
    for (const state of ['active', 'warning', 'error']) {
        const item = page.locator(`.ui-item.is-${state}`);
        const border = await item.evaluate(readItemBorder);
        expect(border.width, `${state} border width`).toBeGreaterThan(0);
        expect(border.style, `${state} border style`).not.toBe('none');
        expect(hasSemanticHue(border.color.match(/[\d.]+/g).map(Number), state), `${state} border must have a semantic hue, received ${border.color}`).toBe(true);
        if (state === 'active') {
            expect({ color: border.color, width: border.width }, 'Default item border must not imply active status')
                .not.toEqual({ color: ordinary.color, width: ordinary.width });
        }
        if (spaceship && !border.framed) {
            const edges = await item.evaluate(element => {
                const style = getComputedStyle(element);
                return [
                    ...['Top', 'Right', 'Bottom', 'Left'].map(side => ({
                        name: side, color: style[`border${side}Color`],
                        width: parseFloat(style[`border${side}Width`]), style: style[`border${side}Style`],
                    })),
                    ...['::before', '::after'].map((pseudo, index) => {
                        const corner = getComputedStyle(element, pseudo);
                        return { name: pseudo, color: index ? corner.borderBottomColor : corner.borderTopColor,
                            width: parseFloat(index ? corner.borderBottomWidth : corner.borderTopWidth),
                            style: index ? corner.borderBottomStyle : corner.borderTopStyle };
                    }),
                ];
            });
            for (const edge of edges) {
                expect(edge.width, `${state} ${edge.name} width`).toBeGreaterThan(0);
                expect(edge.style, `${state} ${edge.name} style`).not.toBe('none');
                expect(hasSemanticHue(edge.color.match(/[\d.]+/g).map(Number), state),
                    `${state} ${edge.name} must have a semantic hue, received ${edge.color}`).toBe(true);
            }
        }
        if (border.framed || spaceship || leather) {
            const capture = await item.screenshot({ animations: 'disabled' });
            const strips = await page.evaluate(async ({ imageData, allEdges }) => {
                const image = new Image();
                image.src = `data:image/png;base64,${imageData}`;
                await image.decode();
                const canvas = document.createElement('canvas');
                canvas.width = image.width;
                canvas.height = image.height;
                const context = canvas.getContext('2d');
                context.drawImage(image, 0, 0);
                const rows = Math.floor(image.height / 2);
                const columns = Math.floor(image.width / 2);
                const edges = [
                    { name: 'left', x: 0, y: Math.floor(image.height / 4), width: 8, height: rows, length: rows },
                    { name: 'right', x: image.width - 8, y: Math.floor(image.height / 4), width: 8, height: rows, length: rows },
                    { name: 'top', x: Math.floor(image.width / 4), y: 0, width: columns, height: 8, length: columns },
                    { name: 'bottom', x: Math.floor(image.width / 4), y: image.height - 8, width: columns, height: 8, length: columns },
                ];
                return (allEdges ? edges : edges.slice(0, 1)).map(edge => ({
                    name: edge.name, length: edge.length,
                    pixels: Array.from(context.getImageData(edge.x, edge.y, edge.width, edge.height).data),
                }));
            }, { imageData: capture.toString('base64'), allEdges: spaceship || leather });
            for (const strip of strips) {
                let colored = 0;
                for (let offset = 0; offset < strip.pixels.length; offset += 4) {
                    const pixel = strip.pixels.slice(offset, offset + 4);
                    pixel[3] /= 255;
                    if (hasSemanticHue(pixel, state)) colored++;
                }
                expect(colored, `${state} ${strip.name} border must visibly render its semantic color`).toBeGreaterThanOrEqual(strip.length / 4);
            }
        }
    }
}

async function expectOpaqueDropdown(page, dropdown) {
    const selected = await dropdown.locator('.selected').evaluate(option => {
        const style = getComputedStyle(option);
        return { color: style.color, background: style.backgroundColor, image: style.backgroundImage };
    });
    if (selected.image === 'none') {
        const foreground = selected.color.match(/[\d.]+/g).map(Number);
        const background = selected.background.match(/[\d.]+/g).map(Number);
        expect(background[3] ?? 1, 'Selected option needs an opaque highlight').toBe(1);
        const alpha = foreground[3] ?? 1;
        const text = foreground.slice(0, 3).map((channel, index) => channel * alpha + background[index] * (1 - alpha));
        const luminance = channels => channels.slice(0, 3).map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const levels = [luminance(text), luminance(background)].sort((a, b) => b - a);
        expect((levels[0] + 0.05) / (levels[1] + 0.05), 'Selected-option text contrast').toBeGreaterThanOrEqual(4.5);
    }
    const bounds = await dropdown.boundingBox();
    const clip = { x: bounds.x + 8, y: bounds.y + 8, width: bounds.width - 16, height: bounds.height - 16 };
    const captures = [];
    try {
        for (const color of ['#ff0000', '#0000ff']) {
            await page.locator('.card').evaluateAll((cards, background) => {
                for (const card of cards) card.style.background = background;
            }, color);
            captures.push(await page.screenshot({ clip, animations: 'disabled' }));
        }
        expect(captures[0].equals(captures[1]), 'Dropdown pixels must not change with the content underneath').toBe(true);
    } finally {
        await page.locator('.card').evaluateAll(cards => {
            for (const card of cards) card.style.removeProperty('background');
        });
    }
}

for (const width of [1440, 390]) {
    for (const theme of ['aurora-glass-1', 'space-night-1', 'leather-style-red-1', 'leather-style-black-1']) {
        test(`${theme} uses mounted responsive artwork at ${width}px`, async ({ page }) => {
            await page.setViewportSize({ width, height: 1000 });
            await open(page, `?theme=${theme}`);
            const background = await page.locator('body').evaluate(body => getComputedStyle(body).backgroundImage);
            const variant = width === 390 ? 'mobile' : 'desktop';
            expect(background).toContain(`/demo/skin/themes/${theme}/assets/`);
            expect(background).toContain(`-${variant}.`);
            expect(background).not.toContain(`-${width === 390 ? 'desktop' : 'mobile'}.`);
        });
    }

    test(`long theme lists reveal the current selection without scrolling the page at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await open(page, '?theme=spaceship-yellow-light');
        const before = await page.evaluate(() => window.scrollY);
        const picker = page.getByRole('combobox', { name: 'Theme', exact: true });
        await picker.click();
        const dropdown = page.locator('.custom-select-dropdown.open');
        await expect(dropdown.getByRole('option')).toHaveCount(themes.length + 1);
        const list = await dropdown.boundingBox();
        const selected = await dropdown.locator('.selected').boundingBox();
        expect(selected.y).toBeGreaterThanOrEqual(list.y);
        expect(selected.y + selected.height).toBeLessThanOrEqual(list.y + list.height);
        expect(await page.evaluate(() => window.scrollY)).toBe(before);
        expect(await page.locator('.card').first().evaluate(card => card.scrollTop)).toBe(0);
        await page.keyboard.press('Escape');
        await picker.click();
        await expect(dropdown.locator('.selected')).toHaveText('Spaceship (yellow light)');
        await page.keyboard.press('Home');
        await page.keyboard.press('Enter');
        await expect(page.locator('#theme')).toHaveValue('system');
    });

    test(`CRT artwork and motion preferences work at ${width}px`, async ({ page }) => {
        await page.setViewportSize({ width, height: 1000 });
        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await open(page, '?theme=crt-starfield-1');
        const background = await page.locator('body').evaluate(body => {
            const style = getComputedStyle(body);
            return { image: style.backgroundImage, size: style.backgroundSize, repeat: style.backgroundRepeat };
        });
        for (const image of ['crt-hero-fade.webp', 'crt-sky.webp']) {
            expect(background.image).toContain(`/demo/skin/themes/crt-starfield-1/assets/${image}`);
        }
        expect(background.size).toBe(width === 390 ? 'auto 520px, 1672px 600px' : '100% auto, 1672px 600px');
        expect(background.repeat).toBe('no-repeat, repeat');
        const comets = () => page.locator('body').evaluate(body => ['::before', '::after'].map(pseudo => {
            const style = getComputedStyle(body, pseudo);
            return { animation: style.animationName, pointerEvents: style.pointerEvents, display: style.display };
        }));
        for (const comet of await comets()) {
            expect(comet.animation).toBe('crt-comet');
            expect(comet.pointerEvents).toBe('none');
        }
        await page.emulateMedia({ reducedMotion: 'reduce' });
        for (const comet of await comets()) expect(comet.animation).toBe('none');
        await page.emulateMedia({ media: 'print' });
        for (const comet of await comets()) expect(comet.display).toBe('none');
    });
}

async function expectRasterTextContrast(page, locator, foreground) {
    const previous = await locator.evaluate(element => {
        const nodes = [element, ...element.querySelectorAll('*')];
        return nodes.map(node => {
            const style = node.getAttribute('style');
            node.style.setProperty('color', 'transparent', 'important');
            return style;
        });
    });
    let capture;
    try {
        capture = await locator.screenshot({ animations: 'disabled' });
    } finally {
        await locator.evaluate((element, styles) => {
            [element, ...element.querySelectorAll('*')].forEach((node, index) => {
                if (styles[index] === null) node.removeAttribute('style');
                else node.setAttribute('style', styles[index]);
            });
        }, previous);
    }
    const contrast = await page.evaluate(async ({ imageData, foreground }) => {
        const image = new Image();
        image.src = `data:image/png;base64,${imageData}`;
        await image.decode();
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;
        const context = canvas.getContext('2d');
        context.drawImage(image, 0, 0);
        const luminance = channels => channels.map(channel => {
            const value = channel / 255;
            return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
        }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
        const text = luminance(foreground);
        let minimum = Infinity;
        for (let y = Math.floor(image.height * 0.35); y < image.height * 0.7; y++) {
            for (let x = Math.floor(image.width * 0.2); x < image.width * 0.8; x++) {
                const background = luminance([...context.getImageData(x, y, 1, 1).data].slice(0, 3));
                minimum = Math.min(minimum, (Math.max(text, background) + 0.05) / (Math.min(text, background) + 0.05));
            }
        }
        return minimum;
    }, { imageData: capture.toString('base64'), foreground });
    if (contrast < 4.5) {
        await test.info().attach('contrast-background', { body: capture, contentType: 'image/png' });
    }
    expect(contrast, `${locator} needs 4.5:1 text contrast over the rendered raster surface`).toBeGreaterThanOrEqual(4.5);
}

test.describe('aurora-glass-1 native material controls', () => {
    test.use({ javaScriptEnabled: false });
    for (const app of ['memory', 'mail']) {
        for (const width of [1440, 390]) {
            test(`${app} keeps native appearance and form controls usable at ${width}px`, async ({ page }) => {
                await page.setViewportSize({ width, height: 1000 });
                const response = await page.goto(`/?app=${app}&theme=aurora-glass-1`);
                expect(response.status()).toBe(200);
                await expect(page.locator('.custom-select-container')).toHaveCount(0);
                await page.locator('#visibility').selectOption('shared');
                await expect(page.locator('#visibility')).toHaveValue('shared');
                await page.getByRole('button', { name: 'Reset example' }).click();
                await expect(page.locator('#visibility')).toHaveValue('private');
                await page.getByLabel('Navigate', { exact: true }).click();
                await expect(page.locator('.nav-burger-menu a').first()).toBeVisible();
                await page.getByLabel('Navigate', { exact: true }).click();
                await page.locator('#theme').selectOption('dark');
                await page.getByRole('button', { name: 'Apply appearance' }).click();
                await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
            });
        }
    }
});

test.describe('polished material rendering', () => {
    test.use({ deviceScaleFactor: 2 });
    for (const theme of ['aurora-glass-1', 'leather-style-red-1', 'leather-style-black-1']) {
        for (const app of ['memory', 'mail']) {
            for (const width of [1440, 390]) {
                test(`${theme} keeps smooth materials and readable controls in ${app} at ${width}px HiDPI`, async ({ page }, testInfo) => {
                    await page.setViewportSize({ width, height: 1000 });
                    await open(page, `?app=${app}&theme=${theme}`);
                    for (const selector of ['.demo-actions .btn-primary', '.demo-actions .btn-secondary', '#title', '#notes', '.custom-select-trigger']) {
                        const element = page.locator(selector).first();
                        const foreground = await element.evaluate(element =>
                            getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number));
                        await expectRasterTextContrast(page, element, foreground);
                    }
                    for (const pseudo of ['::before', '::after']) {
                        expect(await page.locator('.card').first().evaluate((element, pseudo) =>
                            getComputedStyle(element, pseudo).pointerEvents, pseudo)).toBe('none');
                    }
                    const button = page.locator('.demo-actions .btn-primary');
                    const size = await button.boundingBox();
                    const raisedShadow = await button.evaluate(element => getComputedStyle(element).boxShadow);
                    await button.hover();
                    await page.mouse.down();
                    try {
                        await expect.poll(() => button.evaluate(element => getComputedStyle(element).boxShadow)).not.toBe(raisedShadow);
                        const pressed = await button.boundingBox();
                        expect(pressed.width).toBe(size.width);
                        expect(pressed.height).toBe(size.height);
                    } finally {
                        await page.mouse.up();
                    }
                    await page.mouse.move(0, 0);
                    await page.evaluate(() => window.scrollTo(0, 0));
                    await page.screenshot({ path: testInfo.outputPath('materials-hidpi.png'), fullPage: true, animations: 'disabled' });
                    const picker = page.getByRole('combobox', { name: 'Theme', exact: true });
                    await picker.click();
                    const dropdown = page.locator('.custom-select-dropdown.open');
                    await expectOpaqueDropdown(page, dropdown);
                    await expect(dropdown.locator('.selected')).toBeInViewport();
                    await page.keyboard.press('Escape');
                    await expect(picker).toBeFocused();
                    await page.emulateMedia({ reducedMotion: 'reduce' });
                    await expect(button).toHaveCSS('transition-duration', '0s');
                    await expect(page.locator('.card').first()).toHaveCSS('transition-duration', '0s');
                    await page.emulateMedia({ media: 'print' });
                    await expect(page.locator('.card').first()).toHaveCSS('background-image', 'none');
                    for (const pseudo of ['::before', '::after']) {
                        expect(await page.locator('.card').first().evaluate((element, pseudo) =>
                            getComputedStyle(element, pseudo).display, pseudo)).toBe('none');
                    }
                });
            }
        }
    }
});

for (const theme of ['leather-style-red-1', 'leather-style-black-1']) {
    for (const app of ['memory', 'mail']) {
        for (const width of [1440, 390]) {
            test(`${theme} raster surfaces, frames and accessible controls in ${app} at ${width}px`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 1000 });
                await open(page, `?app=${app}&theme=${theme}`);
                for (const selector of ['.card', '.toolbar', '.ui-item', '.data-table th']) {
                    const surface = await page.locator(selector).first().evaluate(element => getComputedStyle(element).backgroundImage);
                    expect(surface).toContain(`/demo/skin/themes/${theme}/assets/panel-surface.webp`);
                }
                for (const selector of ['.btn-primary', '.btn-secondary', '.badge', '#title', '#notes', '#locked', '.custom-select-trigger', '.progress', '.progress-bar']) {
                    const element = page.locator(selector).first();
                    const image = await element.evaluate(element => getComputedStyle(element).backgroundImage);
                    expect(image).toContain(`/demo/skin/themes/${theme}/assets/control-surface.webp`);
                }
                for (const selector of ['.card', '.toolbar', '.ui-item']) {
                    const frame = await page.locator(selector).first().evaluate(element => {
                        const style = getComputedStyle(element, '::before');
                        return { image: style.borderImageSource, pointerEvents: style.pointerEvents };
                    });
                    expect(frame.image).toContain(`/demo/skin/themes/${theme}/assets/panel-frame.webp`);
                    expect(frame.pointerEvents).toBe('none');
                }
                const card = page.locator('.card').first();
                const withFrame = await card.screenshot({ animations: 'disabled' });
                const suppress = await page.addStyleTag({ content: `.card::before { display: none !important; }` });
                try {
                    expect(withFrame.equals(await card.screenshot({ animations: 'disabled' })),
                        'The raster chrome frame must visibly change the rendered panel').toBe(false);
                } finally {
                    await suppress.evaluate(element => element.remove());
                }
                const ordinary = page.locator('.ui-item').first();
                await expectRasterTextContrast(page, ordinary, [255, 255, 255]);
                const muted = await ordinary.locator('.ui-item-subtitle').evaluate(element =>
                    getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number));
                await expectRasterTextContrast(page, ordinary, muted);
                for (const selector of ['.demo-actions .btn-primary', '.demo-actions .btn-secondary', '#title', '#notes', '.custom-select-trigger']) {
                    await expectRasterTextContrast(page, page.locator(selector).first(), [255, 255, 255]);
                }
                const plainLink = page.locator('.demo-links a:not(.btn)');
                const linkColor = await plainLink.evaluate(element =>
                    getComputedStyle(element).color.match(/[\d.]+/g).slice(0, 3).map(Number));
                await expectRasterTextContrast(page, plainLink, linkColor);
                const progressCapture = await page.locator('.progress').screenshot({ animations: 'disabled' });
                const progressContrast = await page.evaluate(async imageData => {
                    const image = new Image();
                    image.src = `data:image/png;base64,${imageData}`;
                    await image.decode();
                    const canvas = document.createElement('canvas');
                    canvas.width = image.width;
                    canvas.height = image.height;
                    const context = canvas.getContext('2d');
                    context.drawImage(image, 0, 0);
                    const luminanceAt = fraction => [...context.getImageData(
                        Math.floor(image.width * fraction), Math.floor(image.height / 2), 1, 1,
                    ).data].slice(0, 3).map(channel => {
                        const value = channel / 255;
                        return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
                    }).reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
                    const levels = [luminanceAt(0.3), luminanceAt(0.85)].sort((a, b) => b - a);
                    return (levels[0] + 0.05) / (levels[1] + 0.05);
                }, progressCapture.toString('base64'));
                expect(progressContrast, 'Rendered progress fill must contrast with the unfilled track').toBeGreaterThanOrEqual(3);
                for (const variant of ['success', 'danger']) {
                    await page.locator('.demo-actions').evaluate((element, variant) => {
                        const button = document.createElement('button');
                        button.type = 'button';
                        button.className = `btn btn-${variant}`;
                        button.textContent = `${variant} preview`;
                        element.appendChild(button);
                    }, variant);
                    const preview = page.getByRole('button', { name: `${variant} preview`, exact: true });
                    try {
                        await expectRasterTextContrast(page, preview, [255, 255, 255]);
                        const color = await preview.evaluate(element => getComputedStyle(element).borderColor);
                        expect(hasSemanticHue(color.match(/[\d.]+/g).map(Number), variant === 'success' ? 'active' : 'error')).toBe(true);
                    } finally {
                        await preview.evaluate(element => element.remove());
                    }
                }
                const title = page.locator('#title');
                await title.focus();
                await expect(title).toHaveCSS('outline-style', 'solid');
                await expect(title).toHaveCSS('outline-width', '2px');
                const visibility = page.getByRole('combobox', { name: 'Visibility', exact: true });
                await visibility.focus();
                await page.keyboard.press('ArrowDown');
                await page.keyboard.press('Enter');
                await expect(page.locator('#visibility')).toHaveValue('shared');
                await page.getByRole('button', { name: 'Reset example' }).click();
                await expect(page.locator('#visibility')).toHaveValue('private');
                await expect(page.locator('#locked')).toBeDisabled();
                await expect(page.getByRole('button', { name: 'Delete selection' })).toBeDisabled();
                const menu = page.getByLabel('Navigate', { exact: true });
                await menu.click();
                await expectRasterTextContrast(page, page.locator('.nav-burger-menu a[aria-current="page"]'), [255, 255, 255]);
                await page.keyboard.press('Escape');
                await expect(menu).toBeFocused();
                await page.getByRole('combobox', { name: 'Theme', exact: true }).click();
                await expectOpaqueDropdown(page, page.locator('.custom-select-dropdown.open'));
                await page.keyboard.press('Escape');
                await page.screenshot({ path: testInfo.outputPath(`${app}-leather.png`), fullPage: true, animations: 'disabled' });
                await page.emulateMedia({ reducedMotion: 'reduce' });
                await expect(card).toHaveCSS('transition-duration', '0s');
                await page.emulateMedia({ media: 'print' });
                await expect(page.locator('body')).toHaveCSS('background-image', 'none');
                await expect(card).toHaveCSS('background-image', 'none');
                expect(await card.evaluate(element => getComputedStyle(element, '::before').display)).toBe('none');
                await expect(page.locator('.progress-bar')).toHaveCSS('background-color', 'rgb(85, 85, 85)');
            });
        }
    }

    test(`${theme} native controls work without JavaScript`, async ({ browser }) => {
        const context = await browser.newContext({ javaScriptEnabled: false });
        const errors = [];
        await routeResources(context, errors);
        try {
            const page = await context.newPage();
            const response = await page.goto(`http://127.0.0.1:18764/?app=mail&theme=${theme}`);
            expect(response.status()).toBe(200);
            await expect(page.locator('.custom-select-container')).toHaveCount(0);
            await expect(page.locator('#visibility')).toBeVisible();
            await page.locator('#visibility').selectOption('shared');
            await expect(page.locator('#visibility')).toHaveValue('shared');
            await page.getByLabel('Navigate', { exact: true }).click();
            await expect(page.getByRole('link', { name: 'Domains', exact: true })).toBeVisible();
            await expectPagerLayout(page);
            await page.locator('#theme').selectOption(theme === 'leather-style-red-1' ? 'leather-style-black-1' : 'leather-style-red-1');
            await page.getByRole('button', { name: 'Apply appearance' }).click();
            await expect(page.locator('html')).not.toHaveAttribute('data-theme', theme);
            expect(errors).toEqual([]);
        } finally {
            await context.close();
        }
    });
}

for (const width of [1440, 390]) {
    test(`metal dropdowns hide underlying content at ${width}px`, async ({ page }, testInfo) => {
        await page.setViewportSize({ width, height: 1000 });
        await open(page, '?theme=metal-1');
        await page.getByRole('combobox', { name: 'Theme', exact: true }).click();
        const dropdown = page.locator('.custom-select-dropdown.open');
        await expect(dropdown).toHaveCSS('background-color', 'rgb(7, 7, 7)');
        expect(await dropdown.evaluate(element => getComputedStyle(element).backgroundImage)).toContain('linear-gradient');
        await expect(dropdown.locator('[aria-selected="true"]')).toHaveCSS('color', 'rgba(8, 10, 13, 0.94)');
        await expectOpaqueDropdown(page, dropdown);
        await page.screenshot({ path: testInfo.outputPath('metal-dropdown.png') });
        await dropdown.getByRole('option', { name: 'Spaceship (grey light)', exact: true }).click();
        await expect(page.locator('#theme')).toHaveValue('spaceship-grey-light');
    });
}

for (const theme of [
    { id: 'gold-1', active: 'rgb(34, 197, 94)', error: 'rgb(239, 68, 68)', warning: 'rgb(184, 160, 90)', inactive: 'rgb(203, 213, 225)' },
    { id: 'lighting-1', active: 'rgb(0, 255, 136)', error: 'rgb(255, 0, 68)', warning: 'rgb(255, 170, 0)', inactive: 'rgba(255, 255, 255, 0.28)' },
    { id: 'luxury-1', active: 'rgb(34, 197, 94)', error: 'rgb(239, 68, 68)', warning: 'rgb(212, 175, 55)', inactive: 'rgb(176, 141, 44)' },
    { id: 'solar-system-1', active: 'rgb(34, 197, 94)', error: 'rgb(239, 68, 68)', warning: 'rgb(245, 158, 11)', inactive: 'rgb(138, 101, 24)' },
    { id: 'metal-1', active: 'rgb(34, 197, 94)', error: 'rgb(239, 68, 68)', warning: 'rgb(245, 158, 11)', inactive: 'rgb(154, 166, 178)' },
    { id: 'golden-moon', active: 'rgb(43, 112, 66)', error: 'rgb(139, 28, 28)', warning: 'rgb(204, 155, 34)', inactive: 'rgb(26, 32, 51)' },
]) {
    for (const app of ['memory', 'mail']) {
        for (const width of [1440, 390]) {
            test(`${theme.id} item state borders are semantic in ${app} at ${width}px`, async ({ page }, testInfo) => {
                await page.setViewportSize({ width, height: 1000 });
                await open(page, `?app=${app}&theme=${theme.id}`);
                await expect(page.locator('.ui-item.is-active')).toHaveCSS('border-color', theme.active);
                await expect(page.locator('.ui-item.is-error')).toHaveCSS('border-color', theme.error);
                await expect(page.locator('.ui-item.is-warning')).toHaveCSS('border-left-color', theme.warning);
                await expect(page.locator('.ui-item.is-inactive')).toHaveCSS('border-left-color', theme.inactive);
                if (theme.id === 'lighting-1') {
                    await expect(page.locator('.ui-item.is-active')).toHaveCSS('box-shadow', 'rgba(0, 255, 136, 0.6) -2px 0px 20px 0px');
                    await expect(page.locator('.ui-item').first()).toHaveCSS('border-left-color', 'rgba(0, 243, 255, 0.2)');
                }
                if (theme.id === 'golden-moon') {
                    await expect(page.locator('.ui-item').first()).toHaveCSS('border-left-color', 'rgba(212, 175, 55, 0.25)');
                }
                await page.locator('.ui-item').first().locator('..').screenshot({ path: testInfo.outputPath('item-states.png') });
            });
        }
    }
}

test('retro healthy activity uses success styling and retains the moving starfield', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'no-preference' });
    await open(page, '?theme=retro-arcade');
    const state = await page.locator('.ui-item.is-active').evaluate(item => {
        const probe = document.createElement('span');
        probe.style.color = 'var(--success-color)';
        item.append(probe);
        const result = { actual: getComputedStyle(item).borderLeftColor, expected: getComputedStyle(probe).color };
        probe.remove();
        return result;
    });
    expect(state.actual).toBe(state.expected);
    expect(state.actual).not.toBe(await page.locator('.ui-item.is-error').evaluate(item => getComputedStyle(item).borderLeftColor));
    const starfield = await page.locator('body').evaluate(body => {
        const style = getComputedStyle(body, '::before');
        return { name: style.animationName, duration: style.animationDuration, images: style.backgroundImage.match(/url\(/g)?.length };
    });
    expect(starfield).toEqual({ name: 'retro-starfield', duration: '60s', images: 4 });
});

test('metal flares and grey spaceship HUD decorations survive extraction', async ({ page }) => {
    await open(page, '?theme=metal-1');
    const flare = await page.locator('.card').first().evaluate(card => {
        const style = getComputedStyle(card, '::before');
        return { background: style.backgroundImage, blend: style.mixBlendMode, pointerEvents: style.pointerEvents };
    });
    expect(flare.background).toContain('radial-gradient');
    expect(flare.blend).toBe('screen');
    expect(flare.pointerEvents).toBe('none');
    await expect(page.locator('.btn-primary').first()).toHaveCSS('color', 'rgba(8, 10, 13, 0.94)');
    for (const theme of ['spaceship-grey-dark', 'spaceship-grey-light']) {
        await open(page, `?theme=${theme}`);
        const corners = await page.locator('.card').first().evaluate(card =>
            ['::before', '::after'].map((pseudo, index) => {
                const style = getComputedStyle(card, pseudo);
                return {
                    content: style.content, position: style.position,
                    horizontal: parseFloat(index === 0 ? style.borderTopWidth : style.borderBottomWidth),
                    vertical: parseFloat(index === 0 ? style.borderLeftWidth : style.borderRightWidth),
                };
            }));
        for (const corner of corners) {
            expect(corner.content).toBe('""');
            expect(corner.position).toBe('absolute');
            expect(corner.horizontal).toBe(2);
            expect(corner.vertical).toBe(2);
        }
    }
});

test('navigation supports active links, Escape focus and outside-click closing', async ({ page }) => {
    await open(page, '?app=mail&theme=dark');
    const toggle = page.getByLabel('Navigate', { exact: true });
    await toggle.click();
    await expect(page.getByRole('link', { name: 'Mailboxes', exact: true })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('link', { name: 'Domains', exact: true }).focus();
    await page.keyboard.press('Escape');
    await expect(page.locator('details.nav-burger')).not.toHaveAttribute('open', '');
    await expect(toggle).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('details.nav-burger')).toHaveAttribute('open', '');
    await page.getByRole('heading', { name: 'Appearance', exact: true }).click();
    await expect(page.locator('details.nav-burger')).not.toHaveAttribute('open', '');
    await toggle.click();
    await page.getByRole('link', { name: 'Domains', exact: true }).click();
    await expect(page.getByRole('heading', { level: 1 })).toContainText('Domains');
});

test('select keyboard skips disabled options, commits once and resets', async ({ page }) => {
    await open(page, '?theme=light');
    const visibility = page.getByRole('combobox', { name: 'Visibility', exact: true });
    await page.evaluate(() => {
        window.submissions = 0;
        const select = document.getElementById('visibility');
        select.form.submit = () => window.submissions++;
        select.setAttribute('onchange', 'this.form.submit()');
    });
    await visibility.focus();
    await page.keyboard.press('ArrowDown');
    await expect(visibility).toHaveAttribute('aria-expanded', 'true');
    await page.keyboard.press('Enter');
    await expect(page.locator('#visibility')).toHaveValue('shared');
    expect(await page.evaluate(() => window.submissions)).toBe(1);
    await expect(visibility).toBeFocused();
    await page.getByRole('button', { name: 'Reset example' }).click();
    await expect(page.locator('#visibility')).toHaveValue('private');
    await expect(visibility).toHaveText('Private');
    await visibility.focus();
    await page.keyboard.press('End');
    await page.keyboard.press('Escape');
    await expect(page.locator('#visibility')).toHaveValue('private');
    await expect(visibility).toHaveAttribute('aria-expanded', 'false');
});

test('pointer selection, labels and duplicate initialization work', async ({ page }) => {
    await open(page);
    const visibility = page.getByRole('combobox', { name: 'Visibility', exact: true });
    await page.locator('label[for="visibility"]').click();
    await expect(visibility).toBeFocused();
    await visibility.click();
    await page.getByRole('option', { name: 'Shared', exact: true }).click();
    await expect(page.locator('#visibility')).toHaveValue('shared');
    await page.evaluate(() => { window.ChromaUI.initSelects(); window.ChromaUI.initSelects(); });
    await expect(page.locator('.custom-select-container .custom-select-container')).toHaveCount(0);
    await expect(page.getByRole('combobox', { name: 'Visibility', exact: true })).toHaveCount(1);
    await expect(page.locator('#locked')).toBeVisible();
    await expect(page.locator('#locked')).toBeDisabled();
});

test('fragment initialization includes the fragment root and needs no htmx dependency', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
        const select = document.createElement('select');
        select.id = 'fragment';
        select.setAttribute('aria-label', 'Fragment');
        select.innerHTML = '<option>First</option><option>Second</option>';
        document.querySelector('main').appendChild(select);
        select.dispatchEvent(new CustomEvent('htmx:load', { bubbles: true, detail: { elt: select } }));
    });
    await expect(page.getByRole('combobox', { name: 'Fragment', exact: true })).toBeVisible();
    await expect(page.locator('#fragment')).toHaveClass(/custom-select-initialized/);
    expect(await page.evaluate(() => typeof window.htmx)).toBe('undefined');
});

test('optional enhancement can be omitted while other helpers are active', async ({ page }) => {
    await open(page, '?enhance=0');
    await expect(page.locator('#visibility')).toBeVisible();
    await expect(page.locator('.custom-select-container')).toHaveCount(0);
    await page.locator('#visibility').selectOption('shared');
    await expect(page.locator('#visibility')).toHaveValue('shared');
    expect(await page.evaluate(() => typeof window.ChromaUI.initSelects)).toBe('undefined');
});

test('required select validation focuses the visible control and clears after a valid choice', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
        const select = document.getElementById('visibility');
        const placeholder = new Option('Choose visibility', '', true, true);
        placeholder.disabled = true;
        select.prepend(placeholder);
        select.required = true;
        select.value = '';
        select.dispatchEvent(new Event('change'));
        select.form.requestSubmit();
    });
    const control = page.getByRole('combobox', { name: 'Visibility', exact: true });
    await expect(control).toBeFocused();
    await expect(control).toHaveAttribute('aria-invalid', 'true');
    await expect(control).toHaveAttribute('aria-required', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('#visibility')).toHaveValue('private');
    await expect(control).not.toHaveAttribute('aria-invalid');
});

for (const colorScheme of ['light', 'dark']) {
    test(`system mode follows ${colorScheme} preference without persistence`, async ({ page }) => {
        await page.emulateMedia({ colorScheme });
        await open(page, '?theme=system');
        await expect(page.locator('html')).not.toHaveAttribute('data-theme');
        expect(await page.locator('html').evaluate(element => getComputedStyle(element).colorScheme)).toBe(colorScheme);
        await page.emulateMedia({ colorScheme: colorScheme === 'light' ? 'dark' : 'light' });
        expect(await page.locator('html').evaluate(element => getComputedStyle(element).colorScheme)).not.toBe(colorScheme);
        expect(await page.context().cookies()).toEqual([]);
        expect(await page.evaluate(() => localStorage.length)).toBe(0);
        await expectPagerLayout(page);
    });
}

test('theme bootstrap preserves an explicit server theme and honors its fallback', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' });
    await open(page, '?theme=light');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'light');
    await page.evaluate(() => {
        delete document.documentElement.dataset.theme;
        document.documentElement.dataset.themeDefault = 'dark';
        document.querySelector('link[href$="/themes/light/theme.css"]').href = '/demo/skin/themes/dark/theme.css';
    });
    await page.addScriptTag({ url: '/demo/skin/js/theme.js' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    await expect(page.locator('html')).toHaveCSS('color-scheme', 'dark');
});

test('native selects, navigation and pager remain usable without JavaScript', async ({ browser }) => {
    const context = await browser.newContext({ javaScriptEnabled: false });
    const errors = [];
    await routeResources(context, errors);
    try {
        const page = await context.newPage();
        await page.goto('http://127.0.0.1:18764/?app=memory&theme=light');
        await expect(page.locator('#theme')).toBeVisible();
        await page.locator('#theme').selectOption('dark');
        await page.getByRole('button', { name: 'Apply appearance' }).click();
        await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
        await page.getByLabel('Navigate', { exact: true }).click();
        await expect(page.getByRole('link', { name: 'Albums', exact: true })).toBeVisible();
        await expectPagerLayout(page);
        expect(errors).toEqual([]);
    } finally {
        await context.close();
    }
});
