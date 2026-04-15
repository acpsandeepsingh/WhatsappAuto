// js/load.js
(function() {
    const script = document.createElement('script');
    script.src = chrome.runtime.getURL('js/inject/inject.js');
    script.onload = function() {
        this.remove();
    };
    (document.head || document.documentElement).appendChild(script);
    console.log("WhatsApp Automation: Injector script executed");
})();
