// @vitest-environment happy-dom

import type Content from '../../block/base/content';
import type { Muya } from '../../muya';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Muya as MuyaClass } from '../../muya';

vi.mock('../../utils/prism/index', () => ({
    default: {},
    walkTokens: () => null,
    loadedLanguages: new Set(),
    transformAliasToOrigin: (s: string) => s,
    loadLanguage: () => null,
    search: () => [],
}));

vi.mock('../../utils/paste', async (importOriginal) => {
    const actual = await importOriginal<typeof import('../../utils/paste')>();
    return { ...actual, normalizePastedHTML: async (html: string) => html };
});

const bootedHosts: HTMLElement[] = [];
let hadVersion = false;
let originalVersion: string | undefined;

beforeEach(() => {
    hadVersion = 'MUYA_VERSION' in window;
    originalVersion = window.MUYA_VERSION;
    window.MUYA_VERSION = 'test';
});

afterEach(() => {
    while (bootedHosts.length)
        bootedHosts.pop()!.remove();
    if (hadVersion)
        window.MUYA_VERSION = originalVersion as string;
    else
        delete (window as Partial<Window>).MUYA_VERSION;
});

function bootMuya(markdown: string): Muya {
    const host = document.createElement('div');
    document.body.appendChild(host);
    const muya = new MuyaClass(host, { markdown } as ConstructorParameters<typeof MuyaClass>[1]);
    muya.init();
    bootedHosts.push(muya.domNode);
    return muya;
}

function firstContent(muya: Muya): Content {
    return muya.editor.scrollPage!.firstContentInDescendant()!;
}

describe('muya.insertMarkdown', () => {
    it('replaces the selected text with parsed Markdown', async () => {
        const muya = bootMuya('Hello world\n');
        firstContent(muya).setCursor(6, 11, true);

        await muya.insertMarkdown('**there**');

        expect(muya.getMarkdown()).toBe('Hello **there**\n');
    });

    it('inserts block Markdown after the selection without touching it', async () => {
        const muya = bootMuya('Hello world\n');
        firstContent(muya).setCursor(0, 5, true);

        await muya.insertMarkdown('# Title\n\n- a\n- b', 'after');

        expect(muya.getMarkdown()).toBe('Hello world\n\n# Title\n\n- a\n- b\n');
    });

    it('reverts a replacement with one undo without undoing the edit just before it', async () => {
        const muya = bootMuya('One\n');
        firstContent(muya).setCursor(3, 3, true);
        muya.insertParagraph('after', 'Two');
        muya.editor.scrollPage!.lastContentInDescendant()!.setCursor(0, 3, true);

        await muya.insertMarkdown('# A\n\n- b');
        expect(muya.getMarkdown()).toBe('One\n\n# A\n\n- b\n');
        muya.undo();

        expect(muya.getMarkdown()).toBe('One\n\nTwo\n');
    });

    it('reverts an insertion below with a single undo', async () => {
        const muya = bootMuya('Hello world\n');
        firstContent(muya).setCursor(0, 5, true);

        await muya.insertMarkdown('# Title', 'after');
        muya.undo();

        expect(muya.getMarkdown()).toBe('Hello world\n');
    });

    it('does nothing in read-only mode', async () => {
        const muya = bootMuya('Hello world\n');
        firstContent(muya).setCursor(0, 5, true);
        muya.setReadOnly(true);

        await muya.insertMarkdown('Bye');

        expect(muya.getMarkdown()).toBe('Hello world\n');
    });
});
