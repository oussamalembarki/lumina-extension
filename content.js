// --- 1. LOGIC FIX: Invisible Sidebar (Keeps Video Left) ---
function toggleDynamicStyles(isEnabled) {
    const styleId = "lumina-dynamic-css";
    let styleTag = document.getElementById(styleId);

    if (isEnabled) {
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = styleId;
            styleTag.innerHTML = `
                /* Hide Comments & Chat completely to save vertical space */
                ytd-watch-flexy #comments, 
                ytd-live-chat-frame { 
                    display: none !important; 
                }

                /* THE KEY FIX: Make Sidebar Invisible but KEEP its layout space.
                   This forces the video to stay on the LEFT (Normal Format). */
                ytd-watch-flexy #secondary { 
                    visibility: hidden !important;
                    pointer-events: none !important; 
                }
            `;
            document.head.appendChild(styleTag);
        }
    } else {
        if (styleTag) styleTag.remove();
    }
}

// --- 2. MAIN APP ---
function applyLuminaMode() {
    if (!chrome.runtime?.id) return;

    chrome.storage.local.get(['enabled', 'myNotes'], (result) => {
        const isEnabled = result.enabled || false;
        
        // 1. Apply the sidebar hiding logic
        toggleDynamicStyles(isEnabled);

        let notepad = document.getElementById('lumina-notepad');
        
        // 2. CHECK: Are we on a Watch Page?
        const isWatchPage = window.location.href.includes("/watch");

        if (isEnabled && isWatchPage) {
            // SHOW NOTEPAD only if Enabled AND Watching a video
            if (!notepad) {
                notepad = document.createElement('div');
                notepad.id = 'lumina-notepad';
                
                // Rebranded to LUMINA (Red Title)
                notepad.innerHTML = `
                    <div id="notepad-header">
                        <span style="font-weight:700; font-size:14px; color:#FF0000; letter-spacing:2px; font-family:'Roboto', sans-serif;">LUMINA</span>
                        <div style="display:flex; gap:8px;" onmousedown="event.stopPropagation()"> 
                            <button id="addTimestamp" class="study-btn">+ Time</button>
                            <button id="downloadNotes" class="study-btn">Export</button>
                        </div>
                    </div>
                    <textarea id="noteArea" placeholder="Capture your insights...">${result.myNotes || ""}</textarea>
                    <div class="resize-handle"></div>
                `;
                document.body.appendChild(notepad);
                makeDraggable(notepad);
            }
            syncTheme(notepad);
            setupNotepadLogic(notepad);
            
        } else {
            // HIDE NOTEPAD if disabled OR if on Home Page
            if (notepad) {
                notepad.remove();
            }
        }
    });
}

// --- 3. EVENT HANDLERS ---
function setupNotepadLogic(notepad) {
    const area = document.getElementById('noteArea');
    if (!area) return; 

    const btnTime = document.getElementById('addTimestamp');
    const btnDown = document.getElementById('downloadNotes');

    if (btnTime) {
        btnTime.onclick = () => {
            const video = document.querySelector('video');
            if (video) {
                const t = Math.floor(video.currentTime);
                area.value += `\n[${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}] `;
                area.focus();
                chrome.storage.local.set({ myNotes: area.value });
            }
        };
    }

    if (btnDown) {
        btnDown.onclick = () => {
            const blob = new Blob([area.value], { type: 'text/plain' });
            const a = document.createElement('a');
            a.href = URL.createObjectURL(blob);
            a.download = 'Lumina-Notes.txt'; // Rebranded Filename
            a.click();
        };
    }

    area.oninput = () => chrome.storage.local.set({ myNotes: area.value });
}

function syncTheme(notepad) {
    if (!notepad) return;
    const isDark = document.documentElement.hasAttribute('dark');
    notepad.className = isDark ? 'dark-theme' : 'light-theme';
}

function makeDraggable(el) {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    const h = document.getElementById("notepad-header");
    if (!h) return;
    
    h.onmousedown = (e) => {
        e.preventDefault();
        p3 = e.clientX; p4 = e.clientY;
        document.onmouseup = () => { document.onmouseup = null; document.onmousemove = null; };
        document.onmousemove = (e) => {
            e.preventDefault();
            p1 = p3 - e.clientX; p2 = p4 - e.clientY;
            p3 = e.clientX; p4 = e.clientY;
            
            let top = el.offsetTop - p2;
            let left = el.offsetLeft - p1;

            if (top < 60) top = 60;
            if (left < 0) left = 0;
            if (top > window.innerHeight - 50) top = window.innerHeight - 50;
            if (left > window.innerWidth - 50) left = window.innerWidth - 50;

            el.style.top = top + "px";
            el.style.left = left + "px";
            el.style.right = 'auto';
        };
    };
}

// Watch for URL changes (SPA navigation)
let lastUrl = location.href; 
new MutationObserver(() => {
  const url = location.href;
  if (url !== lastUrl) {
    lastUrl = url;
    applyLuminaMode();
  }
  applyLuminaMode();
}).observe(document, {subtree: true, childList: true});

applyLuminaMode();