document.addEventListener('DOMContentLoaded', function() {
    const btn = document.getElementById('toggleBtn');
    const statusText = document.getElementById('statusText');

    chrome.storage.local.get(['enabled'], (result) => {
        if (btn) {
            btn.checked = result.enabled || false;
            statusText.innerText = btn.checked ? "ON" : "OFF";
        }
    });

    btn.onchange = () => {
        chrome.storage.local.set({ enabled: btn.checked }, () => {
            statusText.innerText = btn.checked ? "ON" : "OFF";
        });
    };
});