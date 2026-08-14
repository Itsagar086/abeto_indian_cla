import * as THREE from "three";
const TEX_W = 512;
const TEX_H = 256;
const PAD = 8;
const BORDER = 4;
const RADIUS = 18;
/** Kannada first, then the two faces Windows actually ships, then anything */
export const KANNADA_FONT_STACK = '"Noto Sans Kannada", "Nirmala UI", "Tunga", sans-serif';
const KANNADA_RANGE = /[ಀ-೿]/;
/** identical signs share one texture — keyed on everything that affects pixels */
const cache = new Map();
function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
}
/** pixel size out of a CSS font shorthand, for line spacing */
function fontPx(font) {
    const m = /(\d+(?:\.\d+)?)px/.exec(font);
    return m ? parseFloat(m[1]) : 32;
}
function withPx(font, px) {
    return font.replace(/(\d+(?:\.\d+)?)px/, `${px}px`);
}
/**
 * Whether this canvas can actually shape Kannada rather than drawing tofu.
 *
 * Deliberately conservative: a zero measurement means the glyph produced
 * nothing at all. Note that notdef boxes DO have a non-zero advance, so this
 * catches "no glyph" but not "tofu box" — see the report.
 */
export function canRenderKannada(ctx) {
    ctx.save();
    ctx.font = `48px ${KANNADA_FONT_STACK}`;
    const width = ctx.measureText("ಕ").width;
    ctx.restore();
    return width > 0;
}
/**
 * Stacked centred text on a rounded plate. Returns null during SSR — R3F only
 * mounts scene children on the client, so this is a guard, not a code path.
 */
export function makeSignTexture(lines, bg, borderColor) {
    if (typeof document === "undefined")
        return null;
    const key = JSON.stringify([lines, bg, borderColor]);
    const cached = cache.get(key);
    if (cached)
        return cached;
    const canvas = document.createElement("canvas");
    canvas.width = TEX_W;
    canvas.height = TEX_H;
    const ctx = canvas.getContext("2d");
    if (!ctx)
        return null;
    // plate
    const w = TEX_W - PAD * 2;
    const h = TEX_H - PAD * 2;
    ctx.fillStyle = bg;
    roundRect(ctx, PAD, PAD, w, h, RADIUS);
    ctx.fill();
    ctx.lineWidth = BORDER;
    ctx.strokeStyle = borderColor;
    roundRect(ctx, PAD + BORDER / 2, PAD + BORDER / 2, w - BORDER, h - BORDER, RADIUS);
    ctx.stroke();
    // drop any Kannada line this machine cannot shape, leaving English only
    const kannadaOk = canRenderKannada(ctx);
    const usable = lines.filter((l) => kannadaOk || !KANNADA_RANGE.test(l.text));
    // shrink any line that would overrun the plate
    const inner = w - 36;
    const fitted = usable.map((l) => {
        let px = fontPx(l.font);
        let font = l.font;
        for (let i = 0; i < 12; i++) {
            ctx.font = font;
            if (ctx.measureText(l.text).width <= inner)
                break;
            px -= 3;
            font = withPx(l.font, px);
        }
        return { ...l, font, px };
    });
    const gap = 12;
    const total = fitted.reduce((n, l) => n + l.px * 1.15, 0) + gap * Math.max(0, fitted.length - 1);
    let y = TEX_H / 2 - total / 2;
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    for (const l of fitted) {
        ctx.font = l.font;
        ctx.fillStyle = l.color;
        ctx.fillText(l.text, TEX_W / 2, y);
        y += l.px * 1.15 + gap;
    }
    const texture = new THREE.CanvasTexture(canvas);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.anisotropy = 4;
    texture.generateMipmaps = true;
    texture.needsUpdate = true;
    cache.set(key, texture);
    return texture;
}
/** how many distinct textures have been rasterised so far */
export function signTextureCount() {
    return cache.size;
}
