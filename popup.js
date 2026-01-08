document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('toggleBtn');
    const status = document.getElementById('statusText');

    chrome.storage.local.get(['enabled'], (res) => {
        btn.checked = res.enabled || false;
        status.innerText = btn.checked ? "STUDY MODE: ON" : "STUDY MODE: OFF";
    });

    btn.onchange = () => {
        chrome.storage.local.set({ enabled: btn.checked }, () => {
            status.innerText = btn.checked ? "STUDY MODE: ON" : "STUDY MODE: OFF";
        });
    };
});