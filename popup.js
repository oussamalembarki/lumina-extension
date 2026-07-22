document.addEventListener('DOMContentLoaded', () => {
    const toggle = document.getElementById('toggle');
    const status = document.getElementById('status');


    chrome.storage.local.get(['enabled'], (result) => {
        toggle.checked = result.enabled || false;
        updateStatus(toggle.checked);
    });


    toggle.addEventListener('change', () => {
        chrome.storage.local.set({
            enabled: toggle.checked
        });

        updateStatus(toggle.checked);
    });


    function updateStatus(enabled) {
        status.textContent = enabled
            ? 'FOCUS MODE: ACTIVE'
            : 'FOCUS MODE: OFF';
    }
});