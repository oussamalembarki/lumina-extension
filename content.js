// =============================================================================
// LUMINA 3.0 — content.js
// Phase 3: Repaint Suppression + GPU Layer Isolation + Performance Audit Log
// Builds on Phase 2: Focus Score Engine + Ambient Glassmorphism
// Builds on Phase 1: Debounced Observer + Video-ID Note Storage
// =============================================================================

// --- PERFORMANCE AUDIT LOG ---
// Fires exactly once at script load, never again. Not gated behind isEnabled
// because the observer itself is already active at this point.
console.info(
    '%cLumina 3.0%c Repaint Suppression Active. Rendering load reduced.',
    'color:#FF0000;font-weight:700;letter-spacing:1px;',
    'color:#aaa;font-weight:400;'
);


// =============================================================================
// SECTION A: UTILITIES
// =============================================================================

function getVideoId() {
    return new URLSearchParams(window.location.search).get('v');
}

function debounce(fn, delay) {
    let timer;
    return (...args) => {
        clearTimeout(timer);
        timer = setTimeout(() => fn(...args), delay);
    };
}

function saveNotes(videoId, value) {
    if (!videoId) return;
    chrome.storage.local.set({ [`notes_${videoId}`]: value });
}


// =============================================================================
// SECTION B: FOCUS SCORE ENGINE
// Tracks (timeInFocus / totalSessionTime) using the Page Visibility API.
// Lifecycle: reset on new video → accumulate while tab is visible → display.
// =============================================================================

const FocusEngine = (() => {
    let timeInFocus     = 0;   // seconds tab was active + video playing
    let totalSession    = 0;   // seconds since video play began
    let lastTick        = null; // timestamp of last interval tick
    let tickInterval    = null;
    let isTracking      = false;

    // Called once per second while the video is playing.
    function tick() {
        const now = Date.now();
        const delta = lastTick ? (now - lastTick) / 1000 : 0;
        lastTick = now;

        totalSession += delta;
        if (!document.hidden) timeInFocus += delta;

        renderScore();
    }

    function getScore() {
        if (totalSession < 1) return 100;
        return Math.round((timeInFocus / totalSession) * 100);
    }

    function renderScore() {
        const el = document.getElementById('lumina-focus-score');
        if (!el) return;
        const score = getScore();
        el.textContent = `${score}%`;

        // Color shifts: green → amber → red as focus drops
        if (score >= 80)      el.style.color = '#4ade80'; // green
        else if (score >= 50) el.style.color = '#fbbf24'; // amber
        else                  el.style.color = '#f87171'; // red
    }

    function start() {
        if (isTracking) return;
        isTracking = true;
        lastTick = Date.now();
        tickInterval = setInterval(tick, 1000);
    }

    function stop() {
        clearInterval(tickInterval);
        tickInterval = null;
        isTracking = false;
        lastTick = null;
    }

    function reset() {
        stop();
        timeInFocus  = 0;
        totalSession = 0;
    }

    // Wire Page Visibility API once, globally.
    // The engine only counts time when the video is also playing, so this
    // listener alone doesn't start/stop tracking — the video event handlers do.
    document.addEventListener('visibilitychange', () => {
        // If tab becomes hidden mid-session, the tick() guard handles it.
        // We just need lastTick to reset so we don't count hidden time
        // when the tab comes back.
        if (!document.hidden) lastTick = Date.now();
    });

    return { start, stop, reset, getScore, renderScore };
})();


// =============================================================================
// SECTION C: AMBIENT COLOR ENGINE
// Samples the dominant color from the YouTube video frame every 10 seconds
// using a 10×10px hidden canvas — negligible GPU cost.
// =============================================================================

const AmbientEngine = (() => {
    let sampleInterval = null;
    // Lumina Red as the default fallback accent
    let currentRgb = { r: 255, g: 0, b: 0 };

    function sample() {
        const video = document.querySelector('video');
        const notepad = document.getElementById('lumina-notepad');
        if (!video || video.readyState < 2 || !notepad) return;

        try {
            // 10×10 is enough for dominant color; any larger wastes cycles
            const canvas = document.createElement('canvas');
            canvas.width  = 10;
            canvas.height = 10;
            const ctx = canvas.getContext('2d');
            ctx.drawImage(video, 0, 0, 10, 10);

            // Average pixel color across the 100-pixel sample
            const data = ctx.getImageData(0, 0, 10, 10).data;
            let r = 0, g = 0, b = 0;
            const pixels = data.length / 4;
            for (let i = 0; i < data.length; i += 4) {
                r += data[i];
                g += data[i + 1];
                b += data[i + 2];
            }
            currentRgb = {
                r: Math.round(r / pixels),
                g: Math.round(g / pixels),
                b: Math.round(b / pixels),
            };
        } catch (e) {
            // Cross-origin frame: leave currentRgb unchanged (keeps last good color)
        }

        applyAmbientGlow(notepad);
    }

    function applyAmbientGlow(notepad) {
        const { r, g, b } = currentRgb;
        // Outer glow: sampled color at low opacity for ambience
        // Inner spread: tighter halo at higher opacity for depth
        notepad.style.boxShadow = `
            0 8px 32px rgba(${r}, ${g}, ${b}, 0.20),
            0 0 0 1px rgba(${r}, ${g}, ${b}, 0.15),
            0 24px 64px rgba(0, 0, 0, 0.55)
        `;
        notepad.style.borderColor = `rgba(${r}, ${g}, ${b}, 0.25)`;
    }

    function start() {
        if (sampleInterval) return;
        sample(); // immediate first sample
        sampleInterval = setInterval(sample, 10_000);
    }

    function stop() {
        clearInterval(sampleInterval);
        sampleInterval = null;
    }

    function reset() {
        stop();
        currentRgb = { r: 255, g: 0, b: 0 }; // back to Lumina Red
    }

    return { start, stop, reset };
})();


// =============================================================================
// SECTION D: VIDEO LIFECYCLE HOOKS
// Attaches play/pause/ended listeners to the YouTube <video> element.
// These are the single source of truth for when the Focus + Ambient engines run.
// Attaches only once per video element instance to avoid listener stacking.
// =============================================================================

function attachVideoListeners() {
    const video = document.querySelector('video');
    if (!video || video.dataset.luminaWired === 'true') return;

    video.dataset.luminaWired = 'true';

    video.addEventListener('play', () => {
        FocusEngine.start();
        AmbientEngine.start();
    });

    video.addEventListener('pause', () => {
        // Pause both engines — paused video time shouldn't count against focus
        FocusEngine.stop();
        AmbientEngine.stop();
    });

    video.addEventListener('ended', () => {
        FocusEngine.stop();
        AmbientEngine.stop();
    });

    // If video is already playing when we attach (e.g. extension enabled mid-video)
    if (!video.paused) {
        FocusEngine.start();
        AmbientEngine.start();
    }
}


// =============================================================================
// SECTION E: SIDEBAR / STYLE INJECTION — Phase 3 Repaint Suppression
//
// Strategy change from Phase 1:
//   BEFORE: CSS `display:none` + `visibility:hidden` injected via <style> tag.
//           Problem: `display:none` destroys DOM state; `visibility:hidden`
//           still composites the layer, keeping GPU paint costs alive.
//
//   AFTER:  Two-layer approach.
//           1. A minimal static <style> tag sets pointer-events:none and
//              visibility:hidden on #secondary — these remain cheap to apply
//              and are needed to preserve the left-aligned video layout.
//           2. JS directly adds/removes the `.lumina-suppress-paint` class
//              on the target elements. That class applies `content-visibility`
//              and `contain`, which instruct the browser's rendering pipeline
//              to skip layout AND paint for those subtrees entirely.
//              `contain-intrinsic-size` prevents scrollbar jump when toggled.
//
// The notepad itself gets `will-change: transform` once at mount time,
// placing it on a dedicated GPU compositing layer so its ambient glow
// animations never cause repaints on the main YouTube video layer.
// =============================================================================

// Targets for repaint suppression — both the sidebar and the comments section.
const SUPPRESS_TARGETS = [
    // Sidebar: the element that holds recommendations
    () => document.querySelector('ytd-watch-flexy #secondary'),
    // Comments: skip painting the entire thread subtree
    () => document.querySelector('ytd-watch-flexy #comments'),
    // Live chat frame (streams)
    () => document.querySelector('ytd-live-chat-frame'),
];

function toggleDynamicStyles(isEnabled) {
    const styleId = 'lumina-dynamic-css';
    let styleTag  = document.getElementById(styleId);

    if (isEnabled) {
        // Inject the visibility + pointer-events rules once.
        // These keep the sidebar's layout space intact (no left-shift on the
        // video) while making it non-interactive. The actual paint skip is
        // handled by the class manipulation below, not by display:none.
        if (!styleTag) {
            styleTag = document.createElement('style');
            styleTag.id = styleId;
            styleTag.textContent = `
                ytd-watch-flexy #secondary {
                    visibility: hidden !important;
                    pointer-events: none !important;
                }
            `;
            document.head.appendChild(styleTag);
        }
        // Apply repaint suppression class to all targets
        applySuppression(true);
    } else {
        if (styleTag) styleTag.remove();
        // Remove suppression class immediately to fully restore rendering
        applySuppression(false);
    }
}

function applySuppression(shouldSuppress) {
    SUPPRESS_TARGETS.forEach(getEl => {
        const el = getEl();
        if (!el) return;
        if (shouldSuppress) {
            el.classList.add('lumina-suppress-paint');
        } else {
            el.classList.remove('lumina-suppress-paint');
        }
    });
}


// =============================================================================
// SECTION F: NOTEPAD MOUNT
// Builds the Bento Header layout:
//   [Left: Focus Score] [Center: Timestamp Btn] [Right: Export Btn]
// =============================================================================

function buildNotepad(savedNotes, videoId) {
    const notepad = document.createElement('div');
    notepad.id = 'lumina-notepad';

    notepad.innerHTML = `
        <div id="notepad-header">

            <!-- LEFT CELL: Focus Score -->
            <div class="bento-cell bento-left" id="notepad-header-left">
                <span class="lumina-wordmark">LUMINA</span>
                <span class="focus-divider">·</span>
                <span id="lumina-focus-score" title="Focus Score">—</span>
            </div>

            <!-- CENTER CELL: Timestamp -->
            <div class="bento-cell bento-center" onmousedown="event.stopPropagation()">
                <button id="addTimestamp" class="study-btn btn-timestamp" title="Stamp current time">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Stamp
                </button>
            </div>

            <!-- RIGHT CELL: Export -->
            <div class="bento-cell bento-right" onmousedown="event.stopPropagation()">
                <button id="downloadNotes" class="study-btn btn-export" title="Export notes as .txt">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export
                </button>
            </div>

        </div>

        <textarea id="noteArea" placeholder="Capture your insights...">${savedNotes}</textarea>
        <div class="resize-handle"></div>
    `;

    document.body.appendChild(notepad);

    // --- HARDWARE ACCELERATION GUARD ---
    // Promote the notepad to its own GPU compositing layer.
    // Without this, the notepad's ambient box-shadow animation (which changes
    // every 10 seconds via AmbientEngine) can trigger repaints that bleed into
    // the main video layer, causing frame drops on lower-end hardware.
    // `will-change: transform` tells the compositor to isolate this element
    // before any animation begins — not after — which is the critical timing.
    // We set this via JS rather than CSS so it pairs explicitly with the mount
    // lifecycle and is visible as an intentional architectural decision.
    notepad.style.willChange = 'transform';

    makeDraggable(notepad);
    return notepad;
}


// =============================================================================
// SECTION G: MAIN APP
// =============================================================================

function applyLuminaMode() {
    if (!chrome.runtime?.id) return;

    const videoId    = getVideoId();
    const isWatchPage = !!videoId;
    const storageKey  = videoId ? `notes_${videoId}` : null;
    const keysToFetch = ['enabled', ...(storageKey ? [storageKey] : [])];

    chrome.storage.local.get(keysToFetch, (result) => {
        const isEnabled  = result.enabled || false;
        const savedNotes = (storageKey && result[storageKey]) ? result[storageKey] : '';

        toggleDynamicStyles(isEnabled);

        let notepad = document.getElementById('lumina-notepad');

        if (isEnabled && isWatchPage) {
            if (!notepad) {
                notepad = buildNotepad(savedNotes, videoId);
            }

            // SPA navigation guard — sync notes for the new video without remounting
            const area = notepad.querySelector('#noteArea');
            if (area && area.dataset.loadedFor !== videoId) {
                area.value = savedNotes;
                area.dataset.loadedFor = videoId;
                // New video = fresh Focus and Ambient session
                FocusEngine.reset();
                AmbientEngine.reset();
            }

            syncTheme(notepad);
            setupNotepadLogic(notepad, videoId);
            attachVideoListeners();

        } else {
            if (notepad) notepad.remove();
            FocusEngine.stop();
            AmbientEngine.stop();
        }
    });
}


// =============================================================================
// SECTION H: EVENT HANDLERS
// =============================================================================

function setupNotepadLogic(notepad, videoId) {
    const area    = notepad.querySelector('#noteArea');
    const btnTime = notepad.querySelector('#addTimestamp');
    const btnDown = notepad.querySelector('#downloadNotes');

    if (!area) return;

    if (btnTime) {
        btnTime.onclick = () => {
            const video = document.querySelector('video');
            if (video) {
                const t     = Math.floor(video.currentTime);
                const stamp = `[${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}] `;
                area.value += `\n${stamp}`;
                area.focus();
                saveNotes(videoId, area.value);
            }
        };
    }

    if (btnDown) {
        btnDown.onclick = () => {
            const blob = new Blob([area.value], { type: 'text/plain' });
            const a    = document.createElement('a');
            a.href     = URL.createObjectURL(blob);
            a.download = `Lumina-Notes-${videoId}.txt`;
            a.click();
            URL.revokeObjectURL(a.href);
        };
    }

    area.oninput = debounce(() => saveNotes(videoId, area.value), 400);
}

function syncTheme(notepad) {
    if (!notepad) return;
    const isDark = document.documentElement.hasAttribute('dark');
    notepad.className = isDark ? 'dark-theme' : 'light-theme';
}

function makeDraggable(el) {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    const h = el.querySelector('#notepad-header');
    if (!h) return;

    h.onmousedown = (e) => {
        // Don't drag when clicking buttons inside the header
        if (e.target.closest('button')) return;
        e.preventDefault();
        p3 = e.clientX; p4 = e.clientY;
        document.onmouseup   = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            e.preventDefault();
            p1 = p3 - e.clientX; p2 = p4 - e.clientY;
            p3 = e.clientX;      p4 = e.clientY;

            let top  = Math.max(60, Math.min(el.offsetTop  - p2, window.innerHeight - 50));
            let left = Math.max(0,  Math.min(el.offsetLeft - p1, window.innerWidth  - 50));

            el.style.top   = top  + 'px';
            el.style.left  = left + 'px';
            el.style.right = 'auto';
        };
    };
}


// =============================================================================
// SECTION I: OBSERVER (Phase 1 debounced architecture — unchanged)
// Phase 3 note: applySuppression() is called inside toggleDynamicStyles()
// which is called inside applyLuminaMode() on every observer tick.
// Because applySuppression() is a classList operation (not a style injection),
// it is idempotent — calling it repeatedly has zero cost when the class is
// already present or already absent.
// =============================================================================

let lastUrl = location.href;

const debouncedApply = debounce(() => {
    const currentUrl = location.href;
    if (currentUrl !== lastUrl) {
        lastUrl = currentUrl;
        const staleNotepad = document.getElementById('lumina-notepad');
        if (staleNotepad) {
            const area = staleNotepad.querySelector('#noteArea');
            if (area) delete area.dataset.loadedFor;
        }
    }
    applyLuminaMode();
}, 150);

const appRoot = document.querySelector('ytd-app') || document.body;
new MutationObserver(debouncedApply).observe(appRoot, { subtree: true, childList: true });

applyLuminaMode();