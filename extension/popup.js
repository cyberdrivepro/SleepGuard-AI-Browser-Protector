document.addEventListener('DOMContentLoaded', () => {
  const testBtn = document.getElementById('testBtn');

  testBtn.addEventListener('click', () => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs.length > 0) {
        chrome.tabs.remove(tabs[0].id);
      }
    });
  });
});
