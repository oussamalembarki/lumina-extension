document.addEventListener('DOMContentLoaded', () => {
    const btn = document.getElementById('toggle');
    const status = document.getElementById('status');

    chrome.storage.local.get(['enabled'], (res) => {
        btn.checked = res.enabled || false;
        status.innerText = btn.checked ? "FOCUS MODE: ACTIVE" : "FOCUS MODE: OFF";
    });

    btn.onchange = () => {
        chrome.storage.local.set({ enabled: btn.checked }, () => {
            status.innerText = btn.checked ? "FOCUS MODE: ACTIVE" : "FOCUS MODE: OFF";
        });
    };
});
// this is a test git 