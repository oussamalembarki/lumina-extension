function applyStudyMode() {
  // CRITICAL: Check if the extension is still connected
  if (!chrome.runtime?.id) {
    return; 
  }

  chrome.storage.local.get(['enabled', 'myNotes'], (result) => {
    let styleTag = document.getElementById('study-mode-style');
    let notepad = document.getElementById('study-notepad');

    if (result.enabled) {
      if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'study-mode-style';
        styleTag.innerHTML = `
          #secondary, #comments, ytd-live-chat-frame { display: none !important; }
          #primary { padding-right: 350px !important; }
        `;
        document.head.appendChild(styleTag);
      }

      if (!notepad) {
        notepad = document.createElement('div');
        notepad.id = 'study-notepad';
        notepad.innerHTML = `
          <div style="font-weight:bold; margin-bottom:10px; color:#ff0000;">Notes</div>
          <textarea id="noteArea" style="width:100%; height:85%; background:#2d2d2d; color:white; border:none; padding:10px; resize:none;">${result.myNotes || ""}</textarea>
        `;
        Object.assign(notepad.style, {
          position: 'fixed', top: '100px', right: '20px', width: '300px', height: '400px',
          backgroundColor: '#1e1e1e', border: '1px solid #333', padding: '15px', zIndex: '9999', color: 'white'
        });
        document.body.appendChild(notepad);

        const area = document.getElementById('noteArea');
        area.oninput = () => { 
            if (chrome.runtime?.id) { // Safety check before saving
                chrome.storage.local.set({ myNotes: area.value }); 
            }
        };
      }
    } else {
      if (styleTag) styleTag.remove();
      if (notepad) notepad.remove();
      const primary = document.getElementById('primary');
      if (primary) primary.style.paddingRight = '0';
    }
  });
}

// Refresh every second to handle YouTube's dynamic page
setInterval(applyStudyMode, 1000);