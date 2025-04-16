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

// Listen for extension installation or update
chrome.runtime.onInstalled.addListener(function() {
  console.log('Earth Agent extension installed');
  
  // Initialize any settings if needed
  chrome.storage.sync.get(['openai_api_key'], function(result) {
    if (!result.openai_api_key) {
      // Set default settings if API key not found
      console.log('No API key found, using default settings');
    }
  });
});

// Handle clipboard copy requests from the extension
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.type === 'copy-to-clipboard') {
    // Use the offscreen method for clipboard access
    addToClipboard(request.data)
      .then(() => {
        console.log('Text copied to clipboard');
        if (sendResponse) sendResponse({success: true});
      })
      .catch(err => {
        console.error('Failed to copy text: ', err);
        // Try fallback method
        chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
          if (tabs.length > 0) {
            chrome.scripting.executeScript({
              target: {tabId: tabs[0].id},
              function: (text) => {
                const el = document.createElement('textarea');
                el.value = text;
                document.body.appendChild(el);
                el.select();
                document.execCommand('copy');
                document.body.removeChild(el);
                return true;
              },
              args: [request.data]
            }).then(() => {
              console.log('Text copied using fallback method');
              if (sendResponse) sendResponse({success: true});
            }).catch(error => {
              console.error('All clipboard methods failed:', error);
              if (sendResponse) sendResponse({success: false, error: error.message});
            });
          }
        });
      });
    return true; // Indicates we will send a response asynchronously
  }
  
  // Handle Earth Engine code injection
  else if (request.type === 'inject-earth-engine-code') {
    console.log('Received request to inject code into Earth Engine');
    
    // Use executeScript to run code in the Earth Engine tab
    chrome.scripting.executeScript({
      target: { tabId: request.tabId },
      function: injectCodeIntoEarthEngine,
      args: [request.code]
    })
    .then(results => {
      console.log('Code injection results:', results);
      sendResponse({success: true, results: results});
    })
    .catch(error => {
      console.error('Code injection failed:', error);
      sendResponse({success: false, error: error.message});
    });
    
    return true; // Indicates we will send a response asynchronously
  }
});

// Function to inject code into the Earth Engine editor
function injectCodeIntoEarthEngine(code) {
  try {
    console.log('Attempting to inject code into Earth Engine editor');
    
    // Try multiple methods to find and use the editor
    
    // Method 1: CodeMirror
    if (window.CodeMirror && document.querySelector('.CodeMirror')) {
      console.log('Using CodeMirror API');
      const cm = document.querySelector('.CodeMirror').CodeMirror;
      cm.setValue(code);
      return {success: true, method: 'CodeMirror'};
    }
    
    // Method 2: ACE Editor
    if (window.ace && document.querySelector('.ace_editor')) {
      console.log('Using ACE API');
      const editor = window.ace.edit(document.querySelector('.ace_editor'));
      editor.setValue(code);
      editor.clearSelection();
      return {success: true, method: 'ACE'};
    }
    
    // Method 3: Clipboard and keyboard events
    const editorArea = document.querySelector('.ace_content') || 
                     document.querySelector('.CodeMirror-code') ||
                     document.querySelector('#code-editor') ||
                     document.querySelector('[role="code-editor"]');
                     
    if (editorArea) {
      console.log('Using clipboard method');
      
      // First, copy the code to clipboard
      const textArea = document.createElement('textarea');
      textArea.value = code;
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand('copy');
      document.body.removeChild(textArea);
      
      // Focus the editor
      editorArea.click();
      
      // Select all (Ctrl+A) and paste (Ctrl+V)
      document.execCommand('selectAll');
      setTimeout(() => document.execCommand('paste'), 100);
      
      return {success: true, method: 'clipboard'};
    }
    
    return {success: false, error: 'No compatible editor found'};
  } catch (error) {
    console.error('Error injecting code:', error);
    return {success: false, error: error.toString()};
  }
}

// Listen for side panel or action click (newer Chrome APIs)
if (chrome.sidePanel) {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch(error => console.error('Error setting panel behavior:', error));
}

// Register a content script to help with Earth Engine operations
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.action === 'runCodeInEarthEngine') {
    // Find tabs with Earth Engine
    chrome.tabs.query({url: 'https://code.earthengine.google.com/*'}, function(tabs) {
      if (tabs.length > 0) {
        const tabId = tabs[0].id;
        
        // Execute the script to inject and run code
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          function: (code) => {
            try {
              // Try different methods to inject code
              let injected = false;
              
              // Method 1: Use direct editor API access if available
              if (window.CodeMirror && document.querySelector('.CodeMirror')) {
                console.log('Using CodeMirror API');
                const cm = document.querySelector('.CodeMirror').CodeMirror;
                cm.setValue(code);
                injected = true;
              } 
              // Method 2: Try ACE editor
              else if (window.ace && document.querySelector('.ace_editor')) {
                console.log('Using ACE API');
                const editor = window.ace.edit(document.querySelector('.ace_editor'));
                editor.setValue(code);
                editor.clearSelection();
                injected = true;
              }
              // Method 3: Try DOM-based approach
              else {
                // Try to find the editor element
                const editorArea = document.querySelector('.ace_content') || 
                                 document.querySelector('.CodeMirror-code') ||
                                 document.querySelector('#code-editor') ||
                                 document.querySelector('[role="code-editor"]');
                
                if (editorArea) {
                  console.log('Using DOM-based method');
                  
                  // Create a temporary textarea
                  const el = document.createElement('textarea');
                  el.value = code;
                  el.setAttribute('readonly', '');
                  el.style.position = 'absolute';
                  el.style.left = '-9999px';
                  document.body.appendChild(el);
                  
                  // Select and copy the text
                  el.select();
                  document.execCommand('copy');
                  document.body.removeChild(el);
                  
                  // Focus the editor area
                  editorArea.click();
                  
                  // Trigger keyboard shortcut for Select All (Ctrl+A)
                  const selectAllEvent = new KeyboardEvent('keydown', {
                    key: 'a',
                    code: 'KeyA',
                    ctrlKey: true,
                    bubbles: true
                  });
                  editorArea.dispatchEvent(selectAllEvent);
                  
                  // Wait a bit then paste
                  setTimeout(() => {
                    document.execCommand('paste');
                    injected = true;
                  }, 200);
                }
              }
              
              // Wait for the editor to update, then click the run button
              setTimeout(() => {
                try {
                  // Find the run button through various selectors
                  const runButton = document.querySelector('.goog-button.run-button') || 
                                  document.querySelector('button[title="Run"]') ||
                                  Array.from(document.querySelectorAll('button')).find(b => 
                                    b.innerText === 'Run' || b.title === 'Run'
                                  );
                  
                  if (runButton) {
                    console.log('Clicking run button');
                    runButton.click();
                    return {success: true, injected: injected, runClicked: true};
                  } else {
                    console.warn('Run button not found');
                    return {success: true, injected: injected, runClicked: false};
                  }
                } catch (e) {
                  console.error('Error clicking run button:', e);
                  return {success: true, injected: injected, runClicked: false, error: e.toString()};
                }
              }, 1500);
              
              return {success: true, message: 'Code injection initiated'};
            } catch (error) {
              console.error('Error in Earth Engine code injection:', error);
              return {success: false, error: error.toString()};
            }
          },
          args: [message.code]
        }).then(results => {
          console.log('Earth Engine injection results:', results);
          sendResponse({success: true, results: results});
        }).catch(error => {
          console.error('Script execution failed:', error);
          sendResponse({success: false, error: error.toString()});
        });
      } else {
        // No Earth Engine tab found, create one
        chrome.tabs.create({url: 'https://code.earthengine.google.com/'}, function(tab) {
          // Respond that we created a new tab
          sendResponse({success: true, newTab: true, tabId: tab.id});
        });
      }
    });
    
    return true; // Will respond asynchronously
  }
});

// Function to add text to clipboard using the offscreen document
async function addToClipboard(text) {
  try {
    // First try using the direct clipboard API (might fail without focus)
    try {
      await navigator.clipboard.writeText(text);
      return; // Success, we're done
    } catch (directError) {
      console.log('Direct clipboard access failed, trying offscreen document:', directError);
    }
    
    // Create an offscreen document if it doesn't exist
    if (!await chrome.offscreen.hasDocument()) {
      await chrome.offscreen.createDocument({
        url: 'offscreen.html',
        reasons: ['CLIPBOARD'],
        justification: 'Write to clipboard'
      });
    }
    
    // Send a message to the offscreen document to write to the clipboard
    return new Promise((resolve, reject) => {
      chrome.runtime.sendMessage({
        type: 'write-to-clipboard',
        target: 'offscreen',
        data: text
      }, (response) => {
        if (chrome.runtime.lastError) {
          reject(chrome.runtime.lastError);
        } else if (response && response.success) {
          resolve();
        } else {
          reject(new Error('Unknown error writing to clipboard'));
        }
      });
    });
  } catch (error) {
    console.error('Error using clipboard:', error);
    throw error;
  }
}

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

// Solution 2 – Once extension service workers can use the Clipboard API,
// replace the offscreen document based implementation with something like this.
// eslint-disable-next-line no-unused-vars -- This is an alternative implementation
async function addToClipboardV2(value) {
  navigator.clipboard.writeText(value);
}
