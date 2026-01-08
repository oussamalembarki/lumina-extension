function applyStudyMode() {
  if (!chrome.runtime?.id) return; 

  chrome.storage.local.get(['enabled', 'myNotes'], (result) => {
    let notepad = document.getElementById('study-notepad');

    if (result.enabled) {
      if (!notepad) {
        notepad = document.createElement('div');
        notepad.id = 'study-notepad';
        
        // HTML Structure
        notepad.innerHTML = `
          <div id="notepad-header">
            <span style="font-weight:600; font-size:12px; color:#aaa; letter-spacing:1px;">STUDY MODE</span>
            <div style="display:flex; gap:8px;" onmousedown="event.stopPropagation()"> 
              <button id="addTimestamp" class="study-btn">+ Time</button>
              <button id="downloadNotes" class="study-btn">Export</button>
            </div>
          </div>
          <textarea id="noteArea" placeholder="Type notes here...">${result.myNotes || ""}</textarea>
          <div class="resize-label">◢</div>
        `;
        document.body.appendChild(notepad);

        // ACTIVATE SAFE DRAGGING
        makeDraggable(notepad);

        const area = document.getElementById('noteArea');

        // Timestamp Logic
        document.getElementById('addTimestamp').onclick = () => {
          const video = document.querySelector('video');
          if (video) {
            const t = Math.floor(video.currentTime);
            const m = Math.floor(t / 60);
            const s = t % 60;
            const stamp = `\n[${m}:${s < 10 ? '0' + s : s}] `;
            area.value += stamp;
            area.focus();
            chrome.storage.local.set({ myNotes: area.value });
          }
        };

        // Download Logic
        document.getElementById('downloadNotes').onclick = () => {
          const blob = new Blob([area.value], { type: 'text/plain' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = 'youtube-study-notes.txt';
          a.click();
        };

        // Auto-save
        area.oninput = () => { 
          if (chrome.runtime?.id) chrome.storage.local.set({ myNotes: area.value }); 
        };
      }
    } else {
      if (notepad) notepad.remove();
      const primary = document.getElementById('primary');
      if (primary) primary.style.paddingRight = '0';
    }
  });
}

// --- UPDATED SAFE DRAGGING FUNCTION ---
function makeDraggable(element) {
  let pos1 = 0, pos2 = 0, pos3 = 0, pos4 = 0;
  const header = document.getElementById("notepad-header");

  if (header) {
    header.onmousedown = dragMouseDown;
  }

  function dragMouseDown(e) {
    e = e || window.event;
    e.preventDefault();
    pos3 = e.clientX;
    pos4 = e.clientY;
    document.onmouseup = closeDragElement;
    document.onmousemove = elementDrag;
  }

  function elementDrag(e) {
    e = e || window.event;
    e.preventDefault();
    
    // Calculate new cursor position
    pos1 = pos3 - e.clientX;
    pos2 = pos4 - e.clientY;
    pos3 = e.clientX;
    pos4 = e.clientY;

    // Calculate where the box WANTS to go
    let newTop = element.offsetTop - pos2;
    let newLeft = element.offsetLeft - pos1;

    // --- THE INVISIBLE WALLS (Boundary Checks) ---
    // 1. Top Wall: Don't go higher than 60px (keeps it below YouTube navbar)
    if (newTop < 60) newTop = 60; 
    
    // 2. Left Wall: Don't go off the left side
    if (newLeft < 0) newLeft = 0;

    // 3. Bottom Wall: Keep at least 50px visible
    if (newTop > window.innerHeight - 50) newTop = window.innerHeight - 50;

    // 4. Right Wall: Keep at least 50px visible
    if (newLeft > window.innerWidth - 50) newLeft = window.innerWidth - 50;

    // Apply the SAFE coordinates
    element.style.top = newTop + "px";
    element.style.left = newLeft + "px";
    element.style.right = 'auto'; 
  }

  function closeDragElement() {
    document.onmouseup = null;
    document.onmousemove = null;
  }
}

setInterval(applyStudyMode, 1000);