/* ==========================================================
         Random Aesthetic Generator — Single File App
         - Deterministic PRNG (seed)
         - HSL palette generation by mood + mode
         - Contrast guardrails + auto-fix
         - Locks (palette, fonts, individual tokens)
         - History + favorites persisted
         - Shareable URL encodes the aesthetic snapshot
      ========================================================== */

      (function () {
        "use strict";

        /* -----------------------------
           Constants
        ------------------------------ */
        const TOKENS = ["bg", "surface", "text", "muted", "primary", "accent"];
        const HISTORY_LIMIT = 12;
        const LS_KEYS = {
          favorites: "rag_favorites_v1",
          history: "rag_history_v1",
          last: "rag_last_v1",
        };

        const CONTRAST_TARGET = 4.5;

        // Curated, practical Google Fonts list.
        // Keep to common families that load reliably.
        const FONT_DB = {
          display: [
            { name: "Space Grotesk", category: "sans", weights: "500;600;700" },
            { name: "Plus Jakarta Sans", category: "sans", weights: "500;600;700" },
            { name: "DM Sans", category: "sans", weights: "500;700" },
            { name: "Sora", category: "sans", weights: "500;600;700" },
            { name: "Poppins", category: "sans", weights: "500;600;700" },
            { name: "Raleway", category: "sans", weights: "500;600;700" },
            { name: "Oswald", category: "sans", weights: "500;600;700" },
            { name: "Bebas Neue", category: "sans", weights: "400" },
            { name: "Playfair Display", category: "serif", weights: "500;600;700" },
            { name: "Fraunces", category: "serif", weights: "500;600;700" },
            { name: "Cormorant Garamond", category: "serif", weights: "500;600;700" },
          ],
          body: [
            { name: "Inter", category: "sans", weights: "400;500;600;700" },
            { name: "Source Sans 3", category: "sans", weights: "400;600;700" },
            { name: "Work Sans", category: "sans", weights: "400;500;600;700" },
            { name: "Manrope", category: "sans", weights: "400;500;600;700" },
            { name: "IBM Plex Sans", category: "sans", weights: "400;500;600;700" },
            { name: "Noto Sans", category: "sans", weights: "400;600;700" },
            { name: "Nunito Sans", category: "sans", weights: "400;600;700" },
            { name: "Merriweather", category: "serif", weights: "400;700" },
            { name: "Source Serif 4", category: "serif", weights: "400;600;700" },
          ],
        };

        const FALLBACKS = {
          sans: "ui-sans-serif, system-ui, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, 'Apple Color Emoji', 'Segoe UI Emoji'",
          serif: "ui-serif, Georgia, Cambria, 'Times New Roman', Times, serif",
        };

        const MOODS = ["Minimal", "Bold", "Pastel", "Neon", "Earthy"];

        /* -----------------------------
           DOM
        ------------------------------ */
        const $ = (sel, root = document) => root.querySelector(sel);
        const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

        const els = {
          seedValue: $("#seedValue"),
          btnGenerate: $("#btnGenerate"),
          btnCopySeed: $("#btnCopySeed"),
          toggleMode: $("#toggleMode"),
          modeLabel: $("#modeLabel"),
          moodSelect: $("#moodSelect"),

          tokenList: $("#tokenList"),
          btnLockPalette: $("#btnLockPalette"),
          paletteLockIcon: $("#paletteLockIcon"),

          displayFont: $("#displayFont"),
          bodyFont: $("#bodyFont"),
          btnLockFonts: $("#btnLockFonts"),
          fontsLockIcon: $("#fontsLockIcon"),
          btnSwapFonts: $("#btnSwapFonts"),
          btnCopyFont: $("#btnCopyFont"),

          contrastList: $("#contrastList"),
          btnAutoFix: $("#btnAutoFix"),

          btnCopyCSS: $("#btnCopyCSS"),
          btnCopyLink: $("#btnCopyLink"),
          btnStar: $("#btnStar"),
          starIcon: $("#starIcon"),

          searchHistory: $("#searchHistory"),
          historyList: $("#historyList"),
          favoritesList: $("#favoritesList"),
          btnClearHistory: $("#btnClearHistory"),
          btnClearFavorites: $("#btnClearFavorites"),

          pvDisplay: $("#pvDisplay"),
          pvBody: $("#pvBody"),
          previewRoot: $("#previewRoot"),

          toasts: $("#toasts"),

          generatedFontsLink: $("#generated-fonts"),
        };

        /* -----------------------------
           State Model
        ------------------------------ */
        const state = {
          seed: "",
          mode: "light", // light | dark
          mood: "Minimal",
          palette: {
            bg: "#0b1020",
            surface: "#101a33",
            text: "#e8efff",
            muted: "#b8c2dd",
            primary: "#3b82f6",
            accent: "#22d3ee",
          },
          fonts: {
            display: "Space Grotesk",
            body: "Inter",
          },
          locks: {
            palette: false,
            fonts: false,
            tokens: Object.fromEntries(TOKENS.map((t) => [t, false])),
          },
          history: [],
          favorites: [],
          ui: {
            historyQuery: "",
          },
        };

        let _renderScheduled = false;
        let _urlDebounce = null;

        /* -----------------------------
           PRNG (deterministic)
        ------------------------------ */
        function hashStringToUint32(str) {
          // FNV-1a 32-bit
          let h = 0x811c9dc5;
          for (let i = 0; i < str.length; i++) {
            h ^= str.charCodeAt(i);
            h = Math.imul(h, 0x01000193);
          }
          return h >>> 0;
        }

        function mulberry32(seed) {
          let t = seed >>> 0;
          return function () {
            t += 0x6d2b79f5;
            let x = t;
            x = Math.imul(x ^ (x >>> 15), x | 1);
            x ^= x + Math.imul(x ^ (x >>> 7), x | 61);
            return ((x ^ (x >>> 14)) >>> 0) / 4294967296;
          };
        }

        function randInt(rng, min, max) {
          return Math.floor(rng() * (max - min + 1)) + min;
        }

        function randFloat(rng, min, max) {
          return rng() * (max - min) + min;
        }

        function pick(rng, arr) {
          return arr[Math.floor(rng() * arr.length)];
        }

        function clamp(n, a, b) {
          return Math.max(a, Math.min(b, n));
        }

        /* -----------------------------
           Color Utils
        ------------------------------ */
        function hslToRgb(h, s, l) {
          // h: 0-360, s/l: 0-100
          const H = ((h % 360) + 360) % 360;
          const S = clamp(s, 0, 100) / 100;
          const L = clamp(l, 0, 100) / 100;

          const c = (1 - Math.abs(2 * L - 1)) * S;
          const hp = H / 60;
          const x = c * (1 - Math.abs((hp % 2) - 1));

          let r = 0,
            g = 0,
            b = 0;
          if (hp >= 0 && hp < 1) [r, g, b] = [c, x, 0];
          else if (hp >= 1 && hp < 2) [r, g, b] = [x, c, 0];
          else if (hp >= 2 && hp < 3) [r, g, b] = [0, c, x];
          else if (hp >= 3 && hp < 4) [r, g, b] = [0, x, c];
          else if (hp >= 4 && hp < 5) [r, g, b] = [x, 0, c];
          else [r, g, b] = [c, 0, x];

          const m = L - c / 2;
          r = Math.round((r + m) * 255);
          g = Math.round((g + m) * 255);
          b = Math.round((b + m) * 255);
          return { r, g, b };
        }

        function rgbToHex({ r, g, b }) {
          const to2 = (n) => n.toString(16).padStart(2, "0");
          return `#${to2(clamp(r, 0, 255))}${to2(clamp(g, 0, 255))}${to2(clamp(b, 0, 255))}`.toLowerCase();
        }

        function hexToRgb(hex) {
          const m = /^#?([0-9a-f]{6})$/i.exec(hex.trim());
          if (!m) return null;
          const n = parseInt(m[1], 16);
          return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
        }

        function relativeLuminance(hex) {
          const rgb = hexToRgb(hex);
          if (!rgb) return 0;

          const srgb = [rgb.r, rgb.g, rgb.b].map((v) => v / 255);
          const lin = srgb.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
          return 0.2126 * lin[0] + 0.7152 * lin[1] + 0.0722 * lin[2];
        }

        function contrastRatio(fgHex, bgHex) {
          const L1 = relativeLuminance(fgHex);
          const L2 = relativeLuminance(bgHex);
          const lighter = Math.max(L1, L2);
          const darker = Math.min(L1, L2);
          return (lighter + 0.05) / (darker + 0.05);
        }

        function mixHex(a, b, t) {
          const A = hexToRgb(a);
          const B = hexToRgb(b);
          if (!A || !B) return a;
          const lerp = (x, y) => Math.round(x + (y - x) * t);
          return rgbToHex({ r: lerp(A.r, B.r), g: lerp(A.g, B.g), b: lerp(A.b, B.b) });
        }

        function bestBWFor(bgHex) {
          const cWhite = contrastRatio("#ffffff", bgHex);
          const cBlack = contrastRatio("#0b0f1a", bgHex);
          return cWhite >= cBlack ? "#ffffff" : "#0b0f1a";
        }

        function isValidHex(hex) {
          return /^#([0-9a-f]{6})$/i.test(hex.trim());
        }

        /* -----------------------------
           Palette Generation
        ------------------------------ */
        function moodRules(mood, mode) {
          const isDark = mode === "dark";

          // Each mood returns ranges and tendencies.
          switch (mood) {
            case "Minimal":
              return {
                neutralHue: () => 210,
                neutralSat: [2, 10],
                bgL: isDark ? [6, 12] : [92, 97],
                surfaceL: isDark ? [10, 18] : [86, 93],
                textL: isDark ? [92, 97] : [10, 14],
                mutedMix: isDark ? 0.55 : 0.55,
                colorSat: [20, 45],
                colorL: isDark ? [52, 64] : [44, 56],
                accentSat: [30, 55],
                accentL: isDark ? [56, 70] : [44, 58],
                colorHue: [195, 255],
                accentHueOffset: [30, 80],
              };

            case "Bold":
              return {
                neutralHue: () => randInt(currentRng(), 190, 230),
                neutralSat: [6, 18],
                bgL: isDark ? [6, 10] : [92, 96],
                surfaceL: isDark ? [12, 18] : [84, 90],
                textL: isDark ? [92, 97] : [10, 14],
                mutedMix: isDark ? 0.58 : 0.58,
                colorSat: [45, 75],
                colorL: isDark ? [52, 62] : [42, 52],
                accentSat: [55, 85],
                accentL: isDark ? [56, 66] : [40, 52],
                colorHue: [0, 359],
                accentHueOffset: [120, 200],
              };

            case "Pastel":
              return {
                neutralHue: () => randInt(currentRng(), 200, 240),
                neutralSat: [6, 14],
                bgL: isDark ? [8, 14] : [94, 98],
                surfaceL: isDark ? [14, 20] : [88, 94],
                textL: isDark ? [92, 97] : [10, 14],
                mutedMix: isDark ? 0.62 : 0.62,
                colorSat: [35, 55],
                colorL: isDark ? [60, 72] : [58, 72],
                accentSat: [40, 60],
                accentL: isDark ? [64, 76] : [60, 76],
                colorHue: [0, 359],
                accentHueOffset: [40, 110],
              };

            case "Neon":
              return {
                neutralHue: () => randInt(currentRng(), 200, 250),
                neutralSat: [8, 22],
                bgL: isDark ? [5, 10] : [92, 96],
                surfaceL: isDark ? [11, 17] : [84, 90],
                textL: isDark ? [92, 98] : [10, 14],
                mutedMix: isDark ? 0.58 : 0.58,
                colorSat: [80, 100],
                colorL: isDark ? [52, 62] : [48, 58],
                accentSat: [85, 100],
                accentL: isDark ? [58, 68] : [46, 56],
                colorHue: [0, 359],
                accentHueOffset: [150, 210],
              };

            case "Earthy":
              return {
                neutralHue: () => randInt(currentRng(), 20, 55),
                neutralSat: [8, 20],
                bgL: isDark ? [7, 12] : [91, 96],
                surfaceL: isDark ? [12, 18] : [84, 90],
                textL: isDark ? [92, 97] : [10, 14],
                mutedMix: isDark ? 0.6 : 0.6,
                colorSat: [35, 65],
                colorL: isDark ? [50, 60] : [40, 52],
                accentSat: [30, 55],
                accentL: isDark ? [54, 64] : [38, 50],
                colorHue: [20, 140],
                accentHueOffset: [40, 120],
              };

            default:
              return moodRules("Minimal", mode);
          }
        }

        // A small trick to let moodRules use a deterministic RNG
        // without threading it through every call.
        let _rngStack = [];
        function withRng(rng, fn) {
          _rngStack.push(rng);
          try {
            return fn();
          } finally {
            _rngStack.pop();
          }
        }
        function currentRng() {
          return _rngStack[_rngStack.length - 1] || Math.random;
        }

        function generatePalette(seedStr, mode, mood, prevPalette, tokenLocks) {
          const rng = mulberry32(hashStringToUint32(seedStr + "|palette|" + mode + "|" + mood));

          return withRng(rng, () => {
            const rules = moodRules(mood, mode);
            const isDark = mode === "dark";

            const neutralHue = typeof rules.neutralHue === "function" ? rules.neutralHue() : 210;
            const nSat = randInt(rng, rules.neutralSat[0], rules.neutralSat[1]);

            const bg = rgbToHex(hslToRgb(neutralHue, nSat, randInt(rng, rules.bgL[0], rules.bgL[1])));
            const surface = rgbToHex(hslToRgb(neutralHue, nSat + randInt(rng, 0, 8), randInt(rng, rules.surfaceL[0], rules.surfaceL[1])));

            // Primary + accent hues
            const baseHue = randInt(rng, rules.colorHue[0], rules.colorHue[1]);
            const accentHue = (baseHue + randInt(rng, rules.accentHueOffset[0], rules.accentHueOffset[1])) % 360;

            const primary = rgbToHex(hslToRgb(baseHue, randInt(rng, rules.colorSat[0], rules.colorSat[1]), randInt(rng, rules.colorL[0], rules.colorL[1])));
            const accent = rgbToHex(hslToRgb(accentHue, randInt(rng, rules.accentSat[0], rules.accentSat[1]), randInt(rng, rules.accentL[0], rules.accentL[1])));

            // Text: mostly neutral, tuned to bg. Keep high contrast by default.
            const text = isDark ? "#eaf0ff" : "#0b0f1a";
            const muted = mixHex(text, bg, rules.mutedMix);

            const next = { bg, surface, text, muted, primary, accent };

            // Respect individual token locks
            const out = { ...next };
            for (const t of TOKENS) {
              if (tokenLocks?.[t]) out[t] = prevPalette[t];
            }
            return out;
          });
        }

        /* -----------------------------
           Font Generation
        ------------------------------ */
        function generateFonts(seedStr, mood, prevFonts) {
          const rng = mulberry32(hashStringToUint32(seedStr + "|fonts|" + mood));

          // Mood influences: Minimal/Bold -> more sans, Pastel/Earthy -> allow serif display
          const preferSerifDisplay = mood === "Pastel" || mood === "Earthy";
          const preferSansDisplay = mood === "Minimal" || mood === "Neon" || mood === "Bold";

          const displayPool = FONT_DB.display.filter((f) => {
            if (preferSansDisplay) return f.category === "sans";
            if (preferSerifDisplay) return true;
            return true;
          });

          const bodyPool = FONT_DB.body.filter((f) => f.name !== prevFonts.display);

          let display = pick(rng, displayPool);
          // Avoid too many super-condensed displays with serif bodies (keep pairing practical)
          if (display.name === "Bebas Neue" && preferSerifDisplay) {
            display = FONT_DB.display.find((f) => f.name === "Playfair Display") || display;
          }

          let body = pick(rng, bodyPool);

          // If display is already a serif, bias body to sans for readability.
          if (display.category === "serif") {
            const sansBody = FONT_DB.body.filter((f) => f.category === "sans");
            body = pick(rng, sansBody);
          }

          // If display is very stylized, keep body ultra-safe.
          if (display.name === "Bebas Neue") {
            body = FONT_DB.body.find((f) => f.name === "Inter") || body;
          }

          return { display: display.name, body: body.name };
        }

        function fontMeta(name) {
          const all = [...FONT_DB.display, ...FONT_DB.body];
          return all.find((f) => f.name === name) || { name, category: "sans", weights: "400;600;700" };
        }

        function googleFontsHref(displayName, bodyName) {
          const d = fontMeta(displayName);
          const b = fontMeta(bodyName);
          const fam = (f) => `family=${encodeURIComponent(f.name).replace(/%20/g, "+")}:wght@${f.weights.replace(/;/g, ";")}`;
          // Keep URL deterministic order
          const families = [d, b]
            .map(fam)
            .join("&");
          return `https://fonts.googleapis.com/css2?${families}&display=swap`;
        }

        function applyGeneratedFontLoading() {
          const href = googleFontsHref(state.fonts.display, state.fonts.body);
          els.generatedFontsLink.href = href;
          els.generatedFontsLink.disabled = false;

          // Apply to preview (variables)
          const d = fontMeta(state.fonts.display);
          const b = fontMeta(state.fonts.body);
          const displayStack = `'${d.name}', ${FALLBACKS[d.category] || FALLBACKS.sans}`;
          const bodyStack = `'${b.name}', ${FALLBACKS[b.category] || FALLBACKS.sans}`;
          els.previewRoot.style.setProperty("--display-font", displayStack);
          els.previewRoot.style.setProperty("--body-font", bodyStack);

          els.pvDisplay.textContent = d.name;
          els.pvBody.textContent = b.name;
        }

        /* -----------------------------
           Contrast
        ------------------------------ */
        function computeContrastReport(palette) {
          const onPrimary = bestBWFor(palette.primary);

          const pairs = [
            {
              key: "text_bg",
              label: "Text on Background",
              fg: palette.text,
              bg: palette.bg,
              ratio: contrastRatio(palette.text, palette.bg),
              target: CONTRAST_TARGET,
            },
            {
              key: "text_surface",
              label: "Text on Surface",
              fg: palette.text,
              bg: palette.surface,
              ratio: contrastRatio(palette.text, palette.surface),
              target: CONTRAST_TARGET,
            },
            {
              key: "on_primary",
              label: "Text on Primary Button",
              fg: onPrimary,
              bg: palette.primary,
              ratio: contrastRatio(onPrimary, palette.primary),
              target: CONTRAST_TARGET,
            },
          ];

          const anyFail = pairs.some((p) => p.ratio < p.target);
          return { pairs, onPrimary, anyFail };
        }

        function autoFixContrast() {
          // Strategy: choose a text color (near-black or near-white) that maximizes
          // the minimum contrast across background + surface.
          // Then set muted as a controlled mix to preserve character.
          const pal = { ...state.palette };

          const candidates = ["#0b0f1a", "#111827", "#f8fafc", "#ffffff"]; // two dark, two light
          const score = (textHex) => {
            const a = contrastRatio(textHex, pal.bg);
            const b = contrastRatio(textHex, pal.surface);
            return Math.min(a, b);
          };

          let best = candidates[0];
          let bestScore = -1;
          for (const c of candidates) {
            const s = score(c);
            if (s > bestScore) {
              bestScore = s;
              best = c;
            }
          }

          // If still below target, push further toward extremes.
          pal.text = best;

          // muted keeps some softness, but ensure it's not unreadable.
          const baseMuted = mixHex(pal.text, pal.bg, state.mode === "dark" ? 0.62 : 0.62);
          // If muted too low contrast, reduce mixing (bring closer to text).
          const mutedContrast = contrastRatio(baseMuted, pal.bg);
          pal.muted = mutedContrast < 3 ? mixHex(pal.text, pal.bg, 0.45) : baseMuted;

          setState({ palette: pal }, { recordHistory: true, announce: "Contrast auto-fixed." });
        }

        /* -----------------------------
           URL encode/decode (share)
        ------------------------------ */
        function base64UrlEncode(str) {
          const b64 = btoa(unescape(encodeURIComponent(str)));
          return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
        }

        function base64UrlDecode(str) {
          const pad = str.length % 4 ? "=".repeat(4 - (str.length % 4)) : "";
          const b64 = str.replace(/-/g, "+").replace(/_/g, "/") + pad;
          return decodeURIComponent(escape(atob(b64)));
        }

        function snapshotForShare() {
          return {
            v: 1,
            seed: state.seed,
            mode: state.mode,
            mood: state.mood,
            palette: state.palette,
            fonts: state.fonts,
          };
        }

        function encodeShareParam() {
          return base64UrlEncode(JSON.stringify(snapshotForShare()));
        }

        function tryHydrateFromUrl() {
          const params = new URLSearchParams(location.search);
          const a = params.get("a");
          if (!a) return false;

          try {
            const raw = base64UrlDecode(a);
            const data = JSON.parse(raw);
            if (!data || data.v !== 1) return false;

            // Defensive defaults
            const next = {
              seed: typeof data.seed === "string" ? data.seed : randomSeed(),
              mode: data.mode === "dark" ? "dark" : "light",
              mood: MOODS.includes(data.mood) ? data.mood : "Minimal",
              palette: normalizePalette(data.palette) || state.palette,
              fonts: normalizeFonts(data.fonts) || state.fonts,
            };

            setState(next, { recordHistory: false, announce: "Loaded from share link." });
            return true;
          } catch {
            return false;
          }
        }

        function updateUrlDebounced() {
          clearTimeout(_urlDebounce);
          _urlDebounce = setTimeout(() => {
            const params = new URLSearchParams(location.search);
            params.set("a", encodeShareParam());
            const next = `${location.pathname}?${params.toString()}`;
            history.replaceState(null, "", next);
          }, 120);
        }

        /* -----------------------------
           Persistence
        ------------------------------ */
        function loadJSON(key, fallback) {
          try {
            const raw = localStorage.getItem(key);
            if (!raw) return fallback;
            return JSON.parse(raw);
          } catch {
            return fallback;
          }
        }

        function saveJSON(key, value) {
          try {
            localStorage.setItem(key, JSON.stringify(value));
          } catch {
            // ignore
          }
        }

        function signatureOf(snapshot) {
          // Stable signature used for favorites.
          const s = {
            mode: snapshot.mode,
            mood: snapshot.mood,
            palette: snapshot.palette,
            fonts: snapshot.fonts,
          };
          return JSON.stringify(s);
        }

        function normalizePalette(p) {
          if (!p) return null;
          const out = {};
          for (const t of TOKENS) {
            const v = p[t];
            if (typeof v !== "string" || !isValidHex(v)) return null;
            out[t] = v.toLowerCase();
          }
          return out;
        }

        function normalizeFonts(f) {
          if (!f) return null;
          if (typeof f.display !== "string" || typeof f.body !== "string") return null;
          return { display: f.display, body: f.body };
        }

        function persist() {
          // Persist favorites + history + last snapshot
          saveJSON(LS_KEYS.favorites, state.favorites);
          saveJSON(LS_KEYS.history, state.history);
          saveJSON(LS_KEYS.last, snapshotForShare());
        }

        /* -----------------------------
           State updates + history
        ------------------------------ */
        function setState(patch, opts = {}) {
          const { recordHistory = false, announce = "" } = opts;

          // Apply patch
          if (patch.seed != null) state.seed = patch.seed;
          if (patch.mode != null) state.mode = patch.mode;
          if (patch.mood != null) state.mood = patch.mood;
          if (patch.palette != null) state.palette = patch.palette;
          if (patch.fonts != null) state.fonts = patch.fonts;
          if (patch.locks != null) state.locks = patch.locks;
          if (patch.history != null) state.history = patch.history;
          if (patch.favorites != null) state.favorites = patch.favorites;
          if (patch.ui != null) state.ui = { ...state.ui, ...patch.ui };

          if (recordHistory) {
            addToHistory(snapshotForShare());
          }

          updateUrlDebounced();
          persist();
          scheduleRender();
          if (announce) toast(announce);
        }

        function addToHistory(snapshot) {
          const item = {
            id: `${Date.now().toString(36)}_${hashStringToUint32(snapshot.seed).toString(16)}`,
            at: Date.now(),
            seed: snapshot.seed,
            mode: snapshot.mode,
            mood: snapshot.mood,
            palette: snapshot.palette,
            fonts: snapshot.fonts,
          };

          // Avoid duplicate consecutive entries
          const last = state.history[0];
          if (last && signatureOf(last) === signatureOf(item)) return;

          const next = [item, ...state.history].slice(0, HISTORY_LIMIT);
          state.history = next;
        }

        /* -----------------------------
           Generation Flow
        ------------------------------ */
        function randomSeed() {
          // short base36 seed
          return Math.floor(Math.random() * 1e9).toString(36);
        }

        function generate({ newSeed = true } = {}) {
          const seed = newSeed ? randomSeed() : state.seed || randomSeed();
          const next = { seed };

          // palette
          if (!state.locks.palette) {
            next.palette = generatePalette(seed, state.mode, state.mood, state.palette, state.locks.tokens);
          } else {
            next.palette = state.palette;
          }

          // fonts
          if (!state.locks.fonts) {
            next.fonts = generateFonts(seed, state.mood, state.fonts);
          } else {
            next.fonts = state.fonts;
          }

          setState(next, { recordHistory: true });
        }

        /* -----------------------------
           UI Rendering
        ------------------------------ */
        function scheduleRender() {
          if (_renderScheduled) return;
          _renderScheduled = true;
          requestAnimationFrame(() => {
            _renderScheduled = false;
            render();
          });
        }

        function iconLock(locked) {
          return locked
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M7 10V8a5 5 0 0 1 10 0v2" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M17 10V8a5 5 0 0 0-9.9-1" stroke="currentColor" stroke-width="2" stroke-linecap="round"/><path d="M7 10h10a2 2 0 0 1 2 2v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2Z" stroke="currentColor" stroke-width="2"/></svg>`;
        }

        function iconStar(on) {
          return on
            ? `<svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2Z"/></svg>`
            : `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 2l3.09 6.26L22 9.27l-5 4.87L18.18 22 12 18.77 5.82 22 7 14.14l-5-4.87 6.91-1.01L12 2Z" stroke="currentColor" stroke-width="2" stroke-linejoin="round"/></svg>`;
        }

        function render() {
          // Header
          els.seedValue.textContent = state.seed || "—";

          // Mode toggle
          const isDark = state.mode === "dark";
          els.toggleMode.setAttribute("aria-pressed", String(isDark));
          els.modeLabel.textContent = isDark ? "Dark" : "Light";

          // Mood
          if (els.moodSelect.value !== state.mood) els.moodSelect.value = state.mood;

          // Locks
          els.btnLockPalette.setAttribute("aria-pressed", String(state.locks.palette));
          els.paletteLockIcon.innerHTML = iconLock(state.locks.palette);

          els.btnLockFonts.setAttribute("aria-pressed", String(state.locks.fonts));
          els.fontsLockIcon.innerHTML = iconLock(state.locks.fonts);

          // Tokens
          renderTokens();

          // Fonts selects
          if (!els.displayFont.options.length) fillFontSelects();
          if (els.displayFont.value !== state.fonts.display) els.displayFont.value = state.fonts.display;
          if (els.bodyFont.value !== state.fonts.body) els.bodyFont.value = state.fonts.body;

          // Apply theme to preview
          applyThemeToPreview();

          // Contrast
          renderContrast();

          // Favorite button
          const isFav = isCurrentFavorite();
          els.btnStar.setAttribute("aria-pressed", String(isFav));
          els.starIcon.innerHTML = iconStar(isFav);

          // History + favorites
          renderHistoryAndFavorites();
        }

        function fillFontSelects() {
          const makeOptions = (arr) =>
            arr
              .map((f) => `<option value="${escapeHtml(f.name)}">${escapeHtml(f.name)}${f.category === "serif" ? " (serif)" : ""}</option>`)
              .join(" ");

          els.displayFont.innerHTML = makeOptions(FONT_DB.display);
          els.bodyFont.innerHTML = makeOptions(FONT_DB.body);
        }

        function tokenLabel(t) {
          const map = {
            bg: "background",
            surface: "surface",
            text: "text",
            muted: "muted",
            primary: "primary",
            accent: "accent",
          };
          return map[t] || t;
        }

        function renderTokens() {
          // Render once, then update values
          if (!els.tokenList.dataset.ready) {
            els.tokenList.innerHTML = TOKENS.map(
              (t) => `
              <div class="token" data-token="${t}">
                <div class="swatch" data-swatch="${t}" aria-hidden="true"></div>
                <div class="meta">
                  <div class="name">
                    <strong>${tokenLabel(t)}</strong>
                    <span class="mini mono" data-hexlabel="${t}">—</span>
                  </div>
                  <div class="hex">
                    <input
                      type="text"
                      class="mono"
                      data-hex="${t}"
                      inputmode="text"
                      autocomplete="off"
                      spellcheck="false"
                      aria-label="Hex value for ${tokenLabel(t)}"
                      placeholder="#rrggbb"
                    />
                    <input type="color" data-color="${t}" aria-label="Pick color for ${tokenLabel(t)}" />
                  </div>
                </div>
                <div class="token-actions">
                  <button class="btn icon ghost" type="button" data-copy="${t}" aria-label="Copy ${tokenLabel(t)} hex">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" aria-hidden="true">
                      <path d="M9 9h10v10H9V9Z" stroke="currentColor" stroke-width="2" />
                      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" stroke="currentColor" stroke-width="2" />
                    </svg>
                  </button>
                  <button class="btn icon" type="button" data-lock="${t}" aria-label="Lock ${tokenLabel(t)}" aria-pressed="false"></button>
                </div>
              </div>
            `
            ).join(" ");
            els.tokenList.dataset.ready = "1";

            // Delegated events
            els.tokenList.addEventListener("click", (e) => {
              const lockBtn = e.target.closest("button[data-lock]");
              if (lockBtn) {
                const token = lockBtn.getAttribute("data-lock");
                toggleTokenLock(token);
                return;
              }

              const copyBtn = e.target.closest("button[data-copy]");
              if (copyBtn) {
                const token = copyBtn.getAttribute("data-copy");
                copyToClipboard(state.palette[token], `Copied ${tokenLabel(token)} ${state.palette[token]}`);
              }
            });

            els.tokenList.addEventListener("change", (e) => {
              const color = e.target.closest("input[type=color][data-color]");
              if (color) {
                const token = color.getAttribute("data-color");
                updateTokenHex(token, color.value);
              }
            });

            els.tokenList.addEventListener("blur", (e) => {
              const hex = e.target.closest("input[type=text][data-hex]");
              if (!hex) return;
              const token = hex.getAttribute("data-hex");
              const v = hex.value.trim().toLowerCase();
              if (isValidHex(v)) {
                updateTokenHex(token, v);
              } else {
                // restore
                hex.value = state.palette[token];
                toast("Invalid hex. Use #rrggbb.", "Validation");
              }
            }, true);
          }

          // Update visuals
          for (const t of TOKENS) {
            const sw = els.tokenList.querySelector(`[data-swatch="${t}"]`);
            const input = els.tokenList.querySelector(`[data-hex="${t}"]`);
            const color = els.tokenList.querySelector(`[data-color="${t}"]`);
            const label = els.tokenList.querySelector(`[data-hexlabel="${t}"]`);
            const lockBtn = els.tokenList.querySelector(`button[data-lock="${t}"]`);

            const val = state.palette[t];
            if (sw) sw.style.background = val;
            if (input && input.value !== val) input.value = val;
            if (color) color.value = val;
            if (label) label.textContent = val;

            const locked = !!state.locks.tokens[t];
            if (lockBtn) {
              lockBtn.setAttribute("aria-pressed", String(locked));
              lockBtn.innerHTML = iconLock(locked);
              lockBtn.classList.toggle("ghost", !locked);
            }
          }
        }

        function applyThemeToPreview() {
          const pal = state.palette;
          const { onPrimary } = computeContrastReport(pal);

          // Apply palette tokens as CSS variables
          els.previewRoot.style.setProperty("--bg", pal.bg);
          els.previewRoot.style.setProperty("--surface", pal.surface);
          els.previewRoot.style.setProperty("--text", pal.text);
          els.previewRoot.style.setProperty("--muted", pal.muted);
          els.previewRoot.style.setProperty("--primary", pal.primary);
          els.previewRoot.style.setProperty("--accent", pal.accent);
          els.previewRoot.style.setProperty("--on-primary", onPrimary);

          // Fonts
          applyGeneratedFontLoading();
        }

        function renderContrast() {
          const report = computeContrastReport(state.palette);

          els.btnAutoFix.disabled = !report.anyFail;

          els.contrastList.innerHTML = report.pairs
            .map((p) => {
              const pass = p.ratio >= p.target;
              const ratio = p.ratio.toFixed(2);
              return `
              <div class="contrast-row">
                <div>
                  <div style="font-weight: 800; letter-spacing: -0.01em; font-size: 12px">${escapeHtml(p.label)}</div>
                  <div class="mini mono">${escapeHtml(p.fg)} on ${escapeHtml(p.bg)} · ratio ${ratio}</div>
                </div>
                <span class="badge ${pass ? "pass" : "fail"}">${pass ? "PASS" : "FAIL"}</span>
              </div>
            `;
            })
            .join(" ");
        }

        function renderHistoryAndFavorites() {
          const q = (state.ui.historyQuery || "").trim().toLowerCase();

          const filterFn = (it) => {
            if (!q) return true;
            const hay = `${it.seed} ${it.mode} ${it.mood} ${it.fonts?.display || ""} ${it.fonts?.body || ""}`.toLowerCase();
            return hay.includes(q);
          };

          const history = state.history.filter(filterFn);
          const favorites = state.favorites.filter(filterFn);

          els.historyList.innerHTML = history.length ? history.map((it) => renderItem(it, { kind: "history" })).join(" ") : `<div class="mini">No history yet. Hit <strong>Generate</strong> to start.</div>`;
          els.favoritesList.innerHTML = favorites.length ? favorites.map((it) => renderItem(it, { kind: "favorites" })).join(" ") : `<div class="mini">No favorites yet. Star an aesthetic to save it.</div>`;

          // Bind actions via delegation
          if (!els.historyList.dataset.bound) {
            els.historyList.addEventListener("click", (e) => {
              const restore = e.target.closest("button[data-restore]");
              if (restore) {
                const id = restore.getAttribute("data-restore");
                const item = state.history.find((x) => x.id === id);
                if (item) restoreSnapshot(item);
              }

              const star = e.target.closest("button[data-star]");
              if (star) {
                const id = star.getAttribute("data-star");
                const item = state.history.find((x) => x.id === id);
                if (item) toggleFavorite(item);
              }
            });
            els.historyList.dataset.bound = "1";
          }

          if (!els.favoritesList.dataset.bound) {
            els.favoritesList.addEventListener("click", (e) => {
              const restore = e.target.closest("button[data-restore]");
              if (restore) {
                const id = restore.getAttribute("data-restore");
                const item = state.favorites.find((x) => x.id === id);
                if (item) restoreSnapshot(item);
              }

              const star = e.target.closest("button[data-star]");
              if (star) {
                const id = star.getAttribute("data-star");
                const item = state.favorites.find((x) => x.id === id);
                if (item) toggleFavorite(item);
              }
            });
            els.favoritesList.dataset.bound = "1";
          }
        }

        function renderItem(it, { kind }) {
          const fav = state.favorites.some((f) => signatureOf(f) === signatureOf(it));
          const time = new Date(it.at || Date.now()).toLocaleString(undefined, { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" });
          return `
            <div class="item" data-id="${escapeHtml(it.id)}">
              <div class="item-top">
                <div class="swatches" aria-hidden="true">
                  <span class="mini-swatch" style="background:${escapeHtml(it.palette.bg)}"></span>
                  <span class="mini-swatch" style="background:${escapeHtml(it.palette.primary)}"></span>
                  <span class="mini-swatch" style="background:${escapeHtml(it.palette.accent)}"></span>
                </div>
                <div class="item-actions">
                  <button class="btn sm" type="button" data-restore="${escapeHtml(it.id)}" aria-label="Restore this aesthetic">Restore</button>
                  <button class="btn sm ghost" type="button" data-star="${escapeHtml(it.id)}" aria-label="Toggle favorite" aria-pressed="${fav}">
                    ${iconStar(fav)}
                  </button>
                </div>
              </div>
              <div class="item-title">
                <strong>${escapeHtml(it.mood)} · ${escapeHtml(it.mode)} · seed <span class="mono">${escapeHtml(it.seed)}</span></strong>
                <span class="mini">${escapeHtml(it.fonts.display)} / ${escapeHtml(it.fonts.body)} · ${escapeHtml(time)}</span>
              </div>
            </div>
          `;
        }

        function restoreSnapshot(snap) {
          const next = {
            seed: snap.seed,
            mode: snap.mode,
            mood: snap.mood,
            palette: snap.palette,
            fonts: snap.fonts,
          };
          setState(next, { recordHistory: false, announce: "Restored aesthetic." });
        }

        function isCurrentFavorite() {
          const sig = signatureOf(snapshotForShare());
          return state.favorites.some((f) => signatureOf(f) === sig);
        }

        function toggleFavorite(snapshot) {
          const sig = signatureOf(snapshot);
          const exists = state.favorites.find((f) => signatureOf(f) === sig);
          let next;
          if (exists) {
            next = state.favorites.filter((f) => signatureOf(f) !== sig);
            setState({ favorites: next }, { announce: "Removed from favorites." });
          } else {
            const item = {
              id: snapshot.id || `${Date.now().toString(36)}_fav_${hashStringToUint32(sig).toString(16)}`,
              at: snapshot.at || Date.now(),
              seed: snapshot.seed,
              mode: snapshot.mode,
              mood: snapshot.mood,
              palette: snapshot.palette,
              fonts: snapshot.fonts,
            };
            next = [item, ...state.favorites];
            setState({ favorites: next }, { announce: "Saved to favorites." });
          }
        }

        function toggleTokenLock(token) {
          const locks = { ...state.locks, tokens: { ...state.locks.tokens } };
          locks.tokens[token] = !locks.tokens[token];
          setState({ locks }, { announce: `${locks.tokens[token] ? "Locked" : "Unlocked"} ${tokenLabel(token)}.` });
        }

        function updateTokenHex(token, hex) {
          if (!isValidHex(hex)) return;
          const next = { ...state.palette, [token]: hex.toLowerCase() };
          setState({ palette: next }, { recordHistory: false });
        }

        /* -----------------------------
           Exports
        ------------------------------ */
        function cssVariablesSnippet() {
          const lines = TOKENS.map((t) => `  --${t}: ${state.palette[t]};`).join("\n");
          return `:root {\n${lines}\n}`;
        }

        function fontSnippet() {
          const href = googleFontsHref(state.fonts.display, state.fonts.body);
          const d = fontMeta(state.fonts.display);
          const b = fontMeta(state.fonts.body);
          const displayStack = `'${d.name}', ${FALLBACKS[d.category] || FALLBACKS.sans}`;
          const bodyStack = `'${b.name}', ${FALLBACKS[b.category] || FALLBACKS.sans}`;

          return [
            `<!-- Google Fonts -->`,
            `<link rel="preconnect" href="https://fonts.googleapis.com">`,
            `<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>`,
            `<link href="${href}" rel="stylesheet">`,
            `\n/* CSS font-family */`,
            `:root {`,
            `  --display-font: ${displayStack};`,
            `  --body-font: ${bodyStack};`,
            `}`,
          ].join("\n");
        }

        /* -----------------------------
           Copy + Toast
        ------------------------------ */
        async function copyToClipboard(text, msg = "Copied.") {
          try {
            if (navigator.clipboard && window.isSecureContext) {
              await navigator.clipboard.writeText(text);
            } else {
              // fallback
              const ta = document.createElement("textarea");
              ta.value = text;
              ta.setAttribute("readonly", "");
              ta.style.position = "absolute";
              ta.style.left = "-9999px";
              document.body.appendChild(ta);
              ta.select();
              document.execCommand("copy");
              ta.remove();
            }
            toast(msg);
          } catch {
            toast("Copy failed. Your browser may block clipboard.", "Clipboard");
          }
        }

        function toast(message, title = "Copied") {
          const el = document.createElement("div");
          el.className = "toast";
          el.innerHTML = `<span class="dot" aria-hidden="true"></span><div><div style="font-weight:800; letter-spacing:-0.01em">${escapeHtml(
            title
          )}</div><div>${escapeHtml(message)}</div></div>`;
          els.toasts.appendChild(el);
          setTimeout(() => {
            el.style.opacity = "0";
            el.style.transform = "translateY(6px)";
            el.style.transition = "opacity 180ms ease, transform 180ms ease";
            setTimeout(() => el.remove(), 220);
          }, 2300);
        }

        function escapeHtml(str) {
          return String(str)
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/\"/g, "&quot;")
            .replace(/'/g, "&#039;");
        }

        /* -----------------------------
           Event Wiring
        ------------------------------ */
        function bindEvents() {
          els.btnGenerate.addEventListener("click", () => generate({ newSeed: true }));

          els.btnCopySeed.addEventListener("click", () => copyToClipboard(state.seed, `Seed ${state.seed} copied.`));

          els.toggleMode.addEventListener("click", () => {
            const nextMode = state.mode === "dark" ? "light" : "dark";
            setState({ mode: nextMode }, { recordHistory: false, announce: `Mode: ${nextMode}.` });
            // If palette isn't locked, regenerate to match the new mode but keep seed
            if (!state.locks.palette) {
              const pal = generatePalette(state.seed || randomSeed(), nextMode, state.mood, state.palette, state.locks.tokens);
              setState({ palette: pal }, { recordHistory: true });
            }
          });

          els.moodSelect.addEventListener("change", () => {
            const mood = els.moodSelect.value;
            setState({ mood }, { recordHistory: false, announce: `Mood: ${mood}.` });
            // If palette/fonts unlocked, regen within the same seed for predictable shift
            const seed = state.seed || randomSeed();
            const next = {};
            if (!state.locks.palette) next.palette = generatePalette(seed, state.mode, mood, state.palette, state.locks.tokens);
            if (!state.locks.fonts) next.fonts = generateFonts(seed, mood, state.fonts);
            if (Object.keys(next).length) setState(next, { recordHistory: true });
          });

          els.btnLockPalette.addEventListener("click", () => {
            const locks = { ...state.locks };
            locks.palette = !locks.palette;
            setState({ locks }, { announce: `Palette ${locks.palette ? "locked" : "unlocked"}.` });
          });

          els.btnLockFonts.addEventListener("click", () => {
            const locks = { ...state.locks };
            locks.fonts = !locks.fonts;
            setState({ locks }, { announce: `Fonts ${locks.fonts ? "locked" : "unlocked"}.` });
          });

          els.displayFont.addEventListener("change", () => {
            const display = els.displayFont.value;
            setState({ fonts: { ...state.fonts, display } }, { recordHistory: true, announce: "Updated display font." });
          });

          els.bodyFont.addEventListener("change", () => {
            const body = els.bodyFont.value;
            setState({ fonts: { ...state.fonts, body } }, { recordHistory: true, announce: "Updated body font." });
          });

          els.btnSwapFonts.addEventListener("click", () => {
            const next = { display: state.fonts.body, body: state.fonts.display };
            setState({ fonts: next }, { recordHistory: true, announce: "Swapped fonts." });
          });

          els.btnAutoFix.addEventListener("click", () => autoFixContrast());

          els.btnCopyCSS.addEventListener("click", () => copyToClipboard(cssVariablesSnippet(), "CSS variables copied."));
          els.btnCopyFont.addEventListener("click", () => copyToClipboard(fontSnippet(), "Font snippet copied."));
          els.btnCopyLink.addEventListener("click", () => copyToClipboard(location.href, "Share link copied."));

          els.btnStar.addEventListener("click", () => {
            const snap = snapshotForShare();
            // attach stable id so toggling works smoothly
            snap.id = `${Date.now().toString(36)}_cur_${hashStringToUint32(signatureOf(snap)).toString(16)}`;
            toggleFavorite(snap);
            scheduleRender();
          });

          els.searchHistory.addEventListener("input", () => {
            setState({ ui: { historyQuery: els.searchHistory.value } }, { recordHistory: false });
          });

          els.btnClearHistory.addEventListener("click", () => {
            setState({ history: [] }, { recordHistory: false, announce: "History cleared." });
          });

          els.btnClearFavorites.addEventListener("click", () => {
            setState({ favorites: [] }, { recordHistory: false, announce: "Favorites cleared." });
          });
        }

        /* -----------------------------
           Boot
        ------------------------------ */
        function boot() {
          // Load persisted state
          state.favorites = loadJSON(LS_KEYS.favorites, []);
          state.history = loadJSON(LS_KEYS.history, []);

          // Fill mood options (keeps order stable)
          els.moodSelect.innerHTML = MOODS.map((m) => `<option>${escapeHtml(m)}</option>`).join("");

          // Try URL, else last snapshot
          const fromUrl = tryHydrateFromUrl();

          if (!fromUrl) {
            const last = loadJSON(LS_KEYS.last, null);
            if (last && last.v === 1) {
              const pal = normalizePalette(last.palette);
              const fonts = normalizeFonts(last.fonts);
              setState(
                {
                  seed: typeof last.seed === "string" ? last.seed : randomSeed(),
                  mode: last.mode === "dark" ? "dark" : "light",
                  mood: MOODS.includes(last.mood) ? last.mood : "Minimal",
                  palette: pal || state.palette,
                  fonts: fonts || state.fonts,
                },
                { recordHistory: false }
              );
            } else {
              // First run
              state.seed = randomSeed();
              state.mode = "light";
              state.mood = "Minimal";
              // Generate initial palette/fonts with this seed
              state.palette = generatePalette(state.seed, state.mode, state.mood, state.palette, state.locks.tokens);
              state.fonts = generateFonts(state.seed, state.mood, state.fonts);
              addToHistory(snapshotForShare());
            }
          }

          bindEvents();
          scheduleRender();
        }

        boot();
      })();
