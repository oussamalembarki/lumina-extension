// --- 1. LOGIC FIX: Dynamic CSS Injection ---
function toggleDynamicStyles(isEnabled) {
    const styleId = "focustube-dynamic-css";
    let styleTag = document.getElementById(styleId);

    if (isEnabled) {
        if (!styleTag) {
            styleTag = document.createElement("style");
            styleTag.id = styleId;
            styleTag.innerHTML = `
                #secondary, #comments, ytd-live-chat-frame { display: none !important; }
                #primary { 
                    max-width: 80% !important; 
                    margin-left: 40px !important; 
                    margin-right: auto !important; 
                }
                ytd-browse[page-subtype="home"] #contents { display: none !important; }
                ytd-browse[page-subtype="home"]::after { 
                    content: "Focus Mode Active: Use Search to begin."; 
                    display: block; text-align: center; padding: 100px; color: #888; font-size: 18px;
                }
            `;
            document.head.appendChild(styleTag);
        }
    } else {
        if (styleTag) styleTag.remove();
    }
}

// --- 2. MAIN APP ---
function applyStudyMode() {
    if (!chrome.runtime?.id) return;

    chrome.storage.local.get(['enabled', 'myNotes'], (result) => {
        const isEnabled = result.enabled || false;
        toggleDynamicStyles(isEnabled);

        let notepad = document.getElementById('study-notepad');

        if (isEnabled) {
            if (!notepad) {
                notepad = document.createElement('div');
                notepad.id = 'study-notepad';
                
                // THE UPDATE: Title is now RED (#FF0000)
                notepad.innerHTML = `
                    <div id="notepad-header">
                        <span style="font-weight:700; font-size:14px; color:#FF0000; letter-spacing:1px; font-family:'Roboto', sans-serif;">FOCUSTUBE</span>
                        <div style="display:flex; gap:8px;" onmousedown="event.stopPropagation()"> 
                            <button id="addTimestamp" class="study-btn">+ Time</button>
                            <button id="downloadNotes" class="study-btn">Export</button>
                        </div>
                    </div>
                    <textarea id="noteArea" placeholder="Type your study notes here...">${result.myNotes || ""}</textarea>
                    <div class="resize-handle"></div>
                `;
                document.body.appendChild(notepad);
                makeDraggable(notepad);
            }
            syncTheme(notepad);
            setupNotepadLogic(notepad);
        } else if (notepad) {
            notepad.remove();
        }
    });
}

// --- 3. EVENT HANDLERS ---
function setupNotepadLogic(notepad) {
    const area = document.getElementById('noteArea');
    
    document.getElementById('addTimestamp').onclick = () => {
        const video = document.querySelector('video');
        if (video) {
            const t = Math.floor(video.currentTime);
            area.value += `\n[${Math.floor(t / 60)}:${(t % 60).toString().padStart(2, '0')}] `;
            area.focus();
            chrome.storage.local.set({ myNotes: area.value });
        }
    };

    document.getElementById('downloadNotes').onclick = () => {
        const blob = new Blob([area.value], { type: 'text/plain' });
        const a = document.createElement('a');
        a.href = URL.createObjectURL(blob);
        a.download = 'FocusTube-Notes.txt';
        a.click();
    };

    area.oninput = () => chrome.storage.local.set({ myNotes: area.value });
}

function syncTheme(notepad) {
    const isDark = document.documentElement.hasAttribute('dark');
    notepad.className = isDark ? 'dark-theme' : 'light-theme';
}

function makeDraggable(el) {
    let p1 = 0, p2 = 0, p3 = 0, p4 = 0;
    const h = document.getElementById("notepad-header");
    
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

const observer = new MutationObserver(() => applyStudyMode());
observer.observe(document.body, { childList: true, subtree: true });
applyStudyMode();