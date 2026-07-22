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

    chrome.storage.local.set({
        [`notes_${videoId}`]: value
    });
}


// Tracks how much time the user stays focused on the video page
const FocusEngine = (() => {
    let timeInFocus = 0;
    let totalSession = 0;
    let lastTick = null;
    let tickInterval = null;
    let isTracking = false;

    function tick() {
        const now = Date.now();
        const delta = lastTick ? (now - lastTick) / 1000 : 0;

        lastTick = now;
        totalSession += delta;

        if (!document.hidden) {
            timeInFocus += delta;
        }

        renderScore();
    }

    function getScore() {
        if (totalSession < 1) return 100;

        return Math.round((timeInFocus / totalSession) * 100);
    }

    function renderScore() {
        const scoreElement = document.getElementById('lumina-focus-score');

        if (!scoreElement) return;

        const score = getScore();

        scoreElement.textContent = `${score}%`;

        if (score >= 80) {
            scoreElement.style.color = '#4ade80';
        } else if (score >= 50) {
            scoreElement.style.color = '#fbbf24';
        } else {
            scoreElement.style.color = '#f87171';
        }
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

        timeInFocus = 0;
        totalSession = 0;
    }

    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) {
            lastTick = Date.now();
        }
    });

    return {
        start,
        stop,
        reset,
        getScore,
        renderScore
    };
})();


// Updates the notepad glow using the video colors
const AmbientEngine = (() => {
    let sampleInterval = null;
    let currentRgb = {
        r: 255,
        g: 0,
        b: 0
    };

    function sample() {
        const video = document.querySelector('video');
        const notepad = document.getElementById('lumina-notepad');

        if (!video || video.readyState < 2 || !notepad) return;

        try {
            const canvas = document.createElement('canvas');

            canvas.width = 10;
            canvas.height = 10;

            const context = canvas.getContext('2d');

            context.drawImage(video, 0, 0, 10, 10);

            const pixels = context.getImageData(0, 0, 10, 10).data;

            let r = 0;
            let g = 0;
            let b = 0;

            for (let i = 0; i < pixels.length; i += 4) {
                r += pixels[i];
                g += pixels[i + 1];
                b += pixels[i + 2];
            }

            const count = pixels.length / 4;

            currentRgb = {
                r: Math.round(r / count),
                g: Math.round(g / count),
                b: Math.round(b / count)
            };

        } catch {
            // Keep the previous color if sampling fails
        }

        applyAmbientGlow(notepad);
    }

    function applyAmbientGlow(notepad) {
        const {
            r,
            g,
            b
        } = currentRgb;

        notepad.style.boxShadow = `
            0 8px 32px rgba(${r}, ${g}, ${b}, 0.20),
            0 0 0 1px rgba(${r}, ${g}, ${b}, 0.15),
            0 24px 64px rgba(0, 0, 0, 0.55)
        `;

        notepad.style.borderColor =
            `rgba(${r}, ${g}, ${b}, 0.25)`;
    }

    function start() {
        if (sampleInterval) return;

        sample();

        sampleInterval = setInterval(sample, 10000);
    }

    function stop() {
        clearInterval(sampleInterval);

        sampleInterval = null;
    }

    function reset() {
        stop();

        currentRgb = {
            r: 255,
            g: 0,
            b: 0
        };
    }

    return {
        start,
        stop,
        reset
    };
})();


const SUPPRESS_TARGETS = [
    () => document.querySelector('ytd-watch-flexy #secondary'),
    () => document.querySelector('ytd-watch-flexy #comments'),
    () => document.querySelector('ytd-live-chat-frame')
];


function toggleDynamicStyles(enabled) {
    const styleId = 'lumina-dynamic-css';
    let styleTag = document.getElementById(styleId);

    if (enabled) {
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

        applySuppression(true);

    } else {
        if (styleTag) {
            styleTag.remove();
        }

        applySuppression(false);
    }
}


function applySuppression(enabled) {
    SUPPRESS_TARGETS.forEach(getElement => {
        const element = getElement();

        if (!element) return;

        element.classList.toggle(
            'lumina-suppress-paint',
            enabled
        );
    });
}


// Builds the floating notes panel
function buildNotepad(savedNotes, videoId) {
    const notepad = document.createElement('div');

    notepad.id = 'lumina-notepad';

    notepad.innerHTML = `
        <div id="notepad-header">

            <div class="bento-cell bento-left">
                <span class="lumina-wordmark">LUMINA</span>
                <span class="focus-divider">·</span>
                <span id="lumina-focus-score">—</span>
            </div>


            <div class="bento-cell bento-center">
                <button id="addTimestamp" class="study-btn btn-timestamp">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <circle cx="12" cy="12" r="10"/>
                        <polyline points="12 6 12 12 16 14"/>
                    </svg>
                    Stamp
                </button>
            </div>


            <div class="bento-cell bento-right">
                <button id="downloadNotes" class="study-btn btn-export">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                        <polyline points="7 10 12 15 17 10"/>
                        <line x1="12" y1="15" x2="12" y2="3"/>
                    </svg>
                    Export
                </button>
            </div>

        </div>


        <textarea 
            id="noteArea"
            placeholder="Capture your insights..."
        >${savedNotes}</textarea>


        <div class="resize-handle"></div>
    `;


    document.body.appendChild(notepad);

    // Keeps the floating panel isolated from YouTube rendering
    notepad.style.willChange = 'transform';

    makeDraggable(notepad);

    return notepad;
}
function applyLuminaMode() {
    if (!chrome.runtime?.id) return;

    const videoId = getVideoId();
    const isWatchPage = Boolean(videoId);

    const storageKey = videoId ? `notes_${videoId}` : null;

    const keys = [
        'enabled',
        ...(storageKey ? [storageKey] : [])
    ];


    chrome.storage.local.get(keys, (result) => {
        const enabled = result.enabled || false;

        const savedNotes =
            storageKey && result[storageKey]
                ? result[storageKey]
                : "";


        toggleDynamicStyles(enabled);


        let notepad = document.getElementById('lumina-notepad');


        if (enabled && isWatchPage) {

            if (!notepad) {
                notepad = buildNotepad(savedNotes, videoId);
            }


            const noteArea =
                notepad.querySelector('#noteArea');


            if (noteArea && noteArea.dataset.loadedFor !== videoId) {
                noteArea.value = savedNotes;
                noteArea.dataset.loadedFor = videoId;

                FocusEngine.reset();
                AmbientEngine.reset();
            }


            syncTheme(notepad);

            setupNotepadLogic(
                notepad,
                videoId
            );

            attachVideoListeners();


        } else {

            if (notepad) {
                notepad.remove();
            }

            FocusEngine.stop();
            AmbientEngine.stop();
        }
    });
}



function setupNotepadLogic(notepad, videoId) {

    const area = notepad.querySelector('#noteArea');
    const timestampButton =
        notepad.querySelector('#addTimestamp');

    const exportButton =
        notepad.querySelector('#downloadNotes');


    if (!area) return;


    if (timestampButton) {

        timestampButton.onclick = () => {

            const video =
                document.querySelector('video');


            if (!video) return;


            const seconds =
                Math.floor(video.currentTime);


            const timestamp =
                `[${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}] `;


            area.value += `\n${timestamp}`;

            area.focus();

            saveNotes(videoId, area.value);
        };
    }



    if (exportButton) {

        exportButton.onclick = () => {

            const file =
                new Blob(
                    [area.value],
                    { type: 'text/plain' }
                );


            const link =
                document.createElement('a');


            link.href =
                URL.createObjectURL(file);


            link.download =
                `Lumina-Notes-${videoId}.txt`;


            link.click();


            URL.revokeObjectURL(link.href);
        };
    }



    area.oninput =
        debounce(() => {
            saveNotes(videoId, area.value);
        }, 400);
}



function syncTheme(notepad) {

    const darkMode =
        document.documentElement.hasAttribute('dark');


    notepad.className =
        darkMode
            ? 'dark-theme'
            : 'light-theme';
}



function makeDraggable(element) {

    const header =
        element.querySelector('#notepad-header');


    if (!header) return;


    let startX = 0;
    let startY = 0;
    let currentX = 0;
    let currentY = 0;



    header.onmousedown = (event) => {

        if (event.target.closest('button')) {
            return;
        }


        event.preventDefault();


        currentX = event.clientX;
        currentY = event.clientY;



        document.onmouseup = () => {

            document.onmouseup = null;
            document.onmousemove = null;
        };



        document.onmousemove = (event) => {

            event.preventDefault();


            startX =
                currentX - event.clientX;

            startY =
                currentY - event.clientY;


            currentX = event.clientX;
            currentY = event.clientY;



            const top =
                Math.max(
                    60,
                    Math.min(
                        element.offsetTop - startY,
                        window.innerHeight - 50
                    )
                );


            const left =
                Math.max(
                    0,
                    Math.min(
                        element.offsetLeft - startX,
                        window.innerWidth - 50
                    )
                );


            element.style.top =
                `${top}px`;

            element.style.left =
                `${left}px`;

            element.style.right =
                'auto';
        };
    };
}



function attachVideoListeners() {

    const video =
        document.querySelector('video');


    if (!video ||
        video.dataset.luminaWired === 'true') {
        return;
    }


    video.dataset.luminaWired = 'true';



    video.addEventListener('play', () => {

        FocusEngine.start();
        AmbientEngine.start();

    });



    video.addEventListener('pause', () => {

        FocusEngine.stop();
        AmbientEngine.stop();

    });



    video.addEventListener('ended', () => {

        FocusEngine.stop();
        AmbientEngine.stop();

    });



    if (!video.paused) {

        FocusEngine.start();
        AmbientEngine.start();
    }
}



let lastUrl = location.href;


const debouncedApply =
    debounce(() => {

        const currentUrl =
            location.href;


        if (currentUrl !== lastUrl) {

            lastUrl = currentUrl;


            const notepad =
                document.getElementById(
                    'lumina-notepad'
                );


            if (notepad) {

                const area =
                    notepad.querySelector(
                        '#noteArea'
                    );


                if (area) {
                    delete area.dataset.loadedFor;
                }
            }
        }


        applyLuminaMode();

    }, 150);



const root =
    document.querySelector('ytd-app')
    || document.body;



new MutationObserver(
    debouncedApply
).observe(
    root,
    {
        subtree: true,
        childList: true
    }
);



applyLuminaMode();