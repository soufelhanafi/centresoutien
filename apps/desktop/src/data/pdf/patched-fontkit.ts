import realFontkit from '@pdf-lib/fontkit';

/** The minimal fontkit `Font` surface this adapter touches. `layout`'s real
 *  runtime signature takes more arguments than pdf-lib's public types
 *  declare (`text, features, script, language, direction`) — untyped here on
 *  purpose since we only ever call the ones we didn't write ourselves. */
type PatchableFont = {
  layout: (...args: unknown[]) => unknown;
};

/**
 * `pdf-lib`'s `CustomFontEmbedder` calls the underlying fontkit `Font.layout()`
 * with only a `text`/`features` pair, leaving `direction` unset. When `text`
 * contains any Arabic-class character, fontkit's own auto-detected RTL layout
 * kicks in — and empirically (verified by hand against rendered PDF output) it
 * is not a correct UAX#9 implementation: it reverses embedded digit/Latin runs
 * it should leave alone (`"200,00 د.م."` comes out as `"00,002 د.م."`), on top
 * of whatever shaping/reordering this adapter already did itself via
 * {@link toRtlVisualText}. Forcing `direction: 'ltr'` here makes fontkit treat
 * every run as already laid out (no reversal, no reshaping of the
 * presentation-form glyphs `toRtlVisualText` produced) — the sole remaining
 * source of RTL correctness is this adapter's own shaping + bidi pass,
 * applied once.
 *
 * This is a fontkit quirk workaround scoped to this one adapter, not a patch
 * on the shared `@pdf-lib/fontkit` module — `create()` wraps each font
 * instance's `layout` individually.
 */
export const patchedFontkit = {
  create(buffer: Uint8Array, postscriptName?: string) {
    const realFont = realFontkit.create(buffer, postscriptName);
    const font = realFont as unknown as PatchableFont;
    const originalLayout = font.layout.bind(font);
    font.layout = (...args: unknown[]) => {
      const [text, features] = args;
      return originalLayout(text, features, undefined, undefined, 'ltr');
    };
    return realFont;
  },
};
