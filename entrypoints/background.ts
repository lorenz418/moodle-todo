export default defineBackground(() => {
  // The toolbar icon opens the settings page; there is no popup.
  browser.action.onClicked.addListener(() => {
    browser.runtime.openOptionsPage();
  });
});
