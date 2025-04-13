// Copyright 2023 Google LLC
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     https://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

// Initialize the sidepanel to open when the action button is clicked
chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error("Error setting panel behavior:", error));

// Handle messages from the sidepanel
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'copy-to-clipboard') {
    addToClipboard(message.data);
  }
});

// When the action button is clicked, the sidepanel will automatically open
// thanks to the setPanelBehavior above, so we don't need this listener anymore
// chrome.action.onClicked.addListener(async (tab) => {
//   // Open the side panel
//   await chrome.sidePanel.open({ tabId: tab.id });
//   // Set sidepanel as default for current window
//   await chrome.sidePanel.setOptions({
//     enabled: true
//   });
// });

// Use an offscreen document to write to the system clipboard
async function addToClipboard(value) {
  await chrome.offscreen.createDocument({
    url: 'offscreen.html',
    reasons: [chrome.offscreen.Reason.CLIPBOARD],
    justification: 'Write text to the clipboard.'
  });

  // Now that we have an offscreen document, we can dispatch the
  // message.
  chrome.runtime.sendMessage({
    type: 'copy-data-to-clipboard',
    target: 'offscreen-doc',
    data: value
  });
}

// Solution 2 – Once extension service workers can use the Clipboard API,
// replace the offscreen document based implementation with something like this.
// eslint-disable-next-line no-unused-vars -- This is an alternative implementation
async function addToClipboardV2(value) {
  navigator.clipboard.writeText(value);
}
