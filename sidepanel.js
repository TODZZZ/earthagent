document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const promptInput = document.getElementById('prompt');
  const generateBtn = document.getElementById('generateBtn');
  const codeOutput = document.getElementById('codeOutput');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const injectCodeBtn = document.getElementById('injectCodeBtn');
  const runInEarthEngineBtn = document.getElementById('runInEarthEngineBtn');
  const spinner = document.getElementById('spinner');
  
  // Global variables
  const EARTH_ENGINE_EDITOR_URL = 'https://code.earthengine.google.com/';
  
  // Try to load API key from config.js first, then from storage
  if (typeof config !== 'undefined' && config.OPENAI_API_KEY && config.OPENAI_API_KEY !== "your-api-key-here") {
    apiKeyInput.value = config.OPENAI_API_KEY;
  } else {
    // Load saved API key from storage as a fallback
    chrome.storage.sync.get(['openai_api_key'], function(result) {
      if (result.openai_api_key) {
        apiKeyInput.value = result.openai_api_key;
      }
    });
  }
  
  // Define Zod schema for JavaScript code validation - use the global Zod object
  const jsCodeSchema = Zod.object({
    type: Zod.literal("javascript_code"),
    code: Zod.string().describe("A valid JavaScript code snippet")
  });
  
  // Save API key to storage
  saveApiKeyBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      chrome.storage.sync.set({ 'openai_api_key': apiKey }, function() {
        alert('API key saved successfully!');
      });
    } else {
      alert('Please enter a valid API key');
    }
  });
  
  // Generate code when button is clicked
  generateBtn.addEventListener('click', function() {
    const prompt = promptInput.value.trim();
    // Try to get API key from input field first (which could be from config or storage)
    const apiKey = apiKeyInput.value.trim();
    
    if (!apiKey) {
      alert('Please enter your OpenAI API key');
      return;
    }
    
    if (!prompt) {
      alert('Please enter a prompt');
      return;
    }
    
    // Show spinner
    spinner.style.display = 'inline-block';
    generateBtn.disabled = true;
    
    // Call OpenAI API
    generateEarthEngineCode(prompt, apiKey)
      .then(code => {
        codeOutput.value = code;
      })
      .catch(error => {
        codeOutput.value = `Error: ${error.message}`;
      })
      .finally(() => {
        // Hide spinner
        spinner.style.display = 'none';
        generateBtn.disabled = false;
      });
  });
  
  // Copy generated code to clipboard
  copyBtn.addEventListener('click', function() {
    const code = codeOutput.value.trim();
    if (code) {
      copyToClipboard(code);
    }
  });
  
  // Inject code directly into Earth Engine editor
  injectCodeBtn.addEventListener('click', function() {
    const code = codeOutput.value.trim();
    if (!code) {
      alert('No code to inject. Please generate code first.');
      return;
    }
    
    // Show spinner while injecting
    injectCodeBtn.disabled = true;
    spinner.style.display = 'inline-block';
    
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Check if we're on the Earth Engine Code Editor page
      if (activeTab && activeTab.url && activeTab.url.startsWith(EARTH_ENGINE_EDITOR_URL)) {
        // Inject the code into the Earth Engine editor
        waitForEarthEngineEditor(activeTab.id, code, finishInjection);
      } else {
        // If not on Earth Engine, open a new tab
        chrome.tabs.create({url: EARTH_ENGINE_EDITOR_URL}, function(newTab) {
          // Wait for the page to load before injecting
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              // Remove the listener to avoid multiple injections
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Wait longer for the Earth Engine editor to initialize
              waitForEarthEngineEditor(newTab.id, code, finishInjection);
            }
          });
        });
      }
    });
  });
  
  // Run the code in Earth Engine UI by clicking the GEE run button
  runInEarthEngineBtn.addEventListener('click', function() {
    // Skip generating code, just click the run button in Google Earth Engine
    
    // Show spinner while processing
    runInEarthEngineBtn.disabled = true;
    spinner.style.display = 'inline-block';
    
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Check if we're on the Earth Engine Code Editor page
      if (activeTab && activeTab.url && activeTab.url.startsWith(EARTH_ENGINE_EDITOR_URL)) {
        // Click run button directly without injecting code
        clickEarthEngineRunButton(activeTab.id);
        finishRunOperation();
      } else {
        // If not on Earth Engine, open a new tab
        chrome.tabs.create({url: EARTH_ENGINE_EDITOR_URL}, function(newTab) {
          // Wait for the page to load before clicking run button
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              // Remove the listener to avoid multiple clicks
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Wait for the Earth Engine editor to initialize
              waitForEarthEngineRunButton(newTab.id, () => {
                finishRunOperation();
              });
            }
          });
        });
      }
    });
  });
  
  // Function to wait specifically for the run button to be available
  function waitForEarthEngineRunButton(tabId, callback) {
    const MAX_ATTEMPTS = 20;
    const ATTEMPT_INTERVAL = 1000; 
    let attempts = 0;
    
    const checkInterval = setInterval(() => {
      attempts++;
      
      if (attempts > MAX_ATTEMPTS) {
        clearInterval(checkInterval);
        alert('Could not find the Earth Engine run button after multiple attempts. Please make sure Earth Engine is fully loaded and try again.');
        if (callback) callback(false);
        return;
      }
      
      // Check if run button is ready
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: () => {
          try {
            // Find the run button with class "goog-button run-button"
            return document.querySelector('.goog-button.run-button') !== null;
          } catch (error) {
            console.error('Error checking for run button:', error);
            return false;
          }
        }
      })
      .then(results => {
        if (results && results[0] && results[0].result === true) {
          clearInterval(checkInterval);
          console.log(`Earth Engine run button found after ${attempts} attempts`);
          
          // Now click the run button
          clickEarthEngineRunButton(tabId);
          if (callback) callback(true);
        } else {
          console.log(`Waiting for Earth Engine run button (attempt ${attempts}/${MAX_ATTEMPTS})...`);
        }
      })
      .catch(err => {
        console.error('Error checking for run button:', err);
      });
    }, ATTEMPT_INTERVAL);
  }
  
  // Function to reset the UI after run operation
  function finishRunOperation() {
    runInEarthEngineBtn.disabled = false;
    spinner.style.display = 'none';
  }
  
  // Function to click the Google Earth Engine run button
  function clickEarthEngineRunButton(tabId) {
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: () => {
        try {
          // Find the run button with class "goog-button run-button"
          const runButton = document.querySelector('.goog-button.run-button');
          if (runButton) {
            console.log('Found Earth Engine run button, clicking it');
            runButton.click();
            return true;
          } else {
            console.error('Earth Engine run button not found');
            return false;
          }
        } catch (error) {
          console.error('Error clicking Earth Engine run button:', error);
          return false;
        }
      }
    })
    .then((results) => {
      if (results && results[0] && results[0].result === true) {
        console.log('Successfully clicked the Earth Engine run button');
      } else {
        console.error('Failed to click the Earth Engine run button');
        alert('Failed to run code. The Earth Engine run button might not be available yet.');
      }
    })
    .catch(err => {
      console.error('Error executing script to click Earth Engine run button:', err);
    });
  }
  
  // Function to reset the UI after run operation
  function finishRunOperation() {
    runInEarthEngineBtn.disabled = false;
    spinner.style.display = 'none';
  }
  
  // Function to click the Google Earth Engine run button
  function clickEarthEngineRunButton(tabId) {
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: () => {
        try {
          // Find the run button with class "goog-button run-button"
          const runButton = document.querySelector('.goog-button.run-button');
          if (runButton) {
            console.log('Found Earth Engine run button, clicking it');
            runButton.click();
            return true;
          } else {
            console.error('Earth Engine run button not found');
            return false;
          }
        } catch (error) {
          console.error('Error clicking Earth Engine run button:', error);
          return false;
        }
      }
    })
    .then((results) => {
      if (results && results[0] && results[0].result === true) {
        console.log('Successfully clicked the Earth Engine run button');
      } else {
        console.error('Failed to click the Earth Engine run button');
        alert('Failed to run code. The Earth Engine run button might not be available yet. Try again after a few seconds.');
      }
    })
    .catch(err => {
      console.error('Error executing script to click Earth Engine run button:', err);
    });
  }
  
  // Callback function to reset UI after injection attempt
  function finishInjection(success) {
    injectCodeBtn.disabled = false;
    spinner.style.display = 'none';
    
    if (success) {
      // Update with success message
      console.log('Code successfully injected into Earth Engine editor');
    }
  }
  
  // Wait for Earth Engine editor to be fully loaded
  function waitForEarthEngineEditor(tabId, code, callback) {
    const MAX_ATTEMPTS = 30; // Try for up to 30 seconds
    const ATTEMPT_INTERVAL = 1000; // Check every second
    let attempts = 0;
    
    // First check if user is authenticated
    checkEarthEngineAuth(tabId).then(isAuthenticated => {
      if (!isAuthenticated) {
        alert('Please sign in to Earth Engine first. After signing in, try injecting the code again.');
        if (callback) callback(false);
        return;
      }
      
      // Start checking for editor readiness
      const checkInterval = setInterval(() => {
        attempts++;
        
        if (attempts > MAX_ATTEMPTS) {
          clearInterval(checkInterval);
          alert('Could not find the Earth Engine editor after multiple attempts. Please make sure Earth Engine is fully loaded and try again.');
          if (callback) callback(false);
          return;
        }
        
        // Check if editor is ready
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          func: isEarthEngineEditorReady
        })
        .then(results => {
          if (results && results[0] && results[0].result === true) {
            clearInterval(checkInterval);
            console.log(`Earth Engine editor found after ${attempts} attempts`);
            
            // Now try to inject the code
            injectCodeIntoEditor(tabId, code, callback);
          } else {
            console.log(`Waiting for Earth Engine editor (attempt ${attempts}/${MAX_ATTEMPTS})...`);
          }
        })
        .catch(err => {
          console.error('Error checking for editor:', err);
        });
      }, ATTEMPT_INTERVAL);
    });
  }
  
  // Check if Earth Engine editor is ready
  function isEarthEngineEditorReady() {
    try {
      // Check for various editor elements
      const aceEditors = document.querySelectorAll('.ace_editor');
      const codeMirrors = document.querySelectorAll('.CodeMirror');
      const earthEngineApp = document.querySelector('#playground-contents');
      const codeEditor = document.querySelector('#code-editor');
      
      // Look for the playground-specific elements
      if (earthEngineApp && (aceEditors.length > 0 || codeMirrors.length > 0 || codeEditor)) {
        // Additional check: make sure the page has fully rendered
        const loadingIndicator = document.querySelector('.loading-indicator');
        if (loadingIndicator && loadingIndicator.style.display !== 'none') {
          return false; // Still loading
        }
        
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Error checking editor readiness:', error);
      return false;
    }
  }
  
  // Check if the user is authenticated in Earth Engine
  function checkEarthEngineAuth(tabId) {
    return new Promise((resolve) => {
      chrome.scripting.executeScript({
        target: {tabId: tabId},
        func: () => {
          try {
            // Check for login-related elements
            const isSignInPage = document.querySelector('.signin-panel') !== null;
            const needsAuth = document.querySelector('.goog-buttonset-default') !== null && 
                            document.querySelector('.signin-panel') !== null;
            
            // If we detect sign-in elements, the user is not authenticated
            return !needsAuth && !isSignInPage;
          } catch (e) {
            console.error('Error checking auth:', e);
            return false; // Assume not authenticated if we can't check
          }
        }
      })
      .then(results => {
        if (results && results[0]) {
          resolve(results[0].result);
        } else {
          resolve(false);
        }
      })
      .catch(err => {
        console.error('Error checking authentication:', err);
        resolve(false);
      });
    });
  }
  
  // Function to inject code into the Earth Engine editor
  function injectCodeIntoEditor(tabId, code, callback) {
    // Inject script to write to the Earth Engine Code Editor
    chrome.scripting.executeScript({
      target: {tabId: tabId},
      func: injectCodeFunction,
      args: [code]
    })
    .then((results) => {
      if (results && results[0] && results[0].result === true) {
        console.log('Code injected successfully');
        if (callback) callback(true);
      } else {
        console.error('Failed to inject code');
        alert('Failed to inject code. The editor might be in a different state than expected. Try again or use the copy button instead.');
        if (callback) callback(false);
      }
    })
    .catch(err => {
      console.error('Error injecting code:', err);
      if (callback) callback(false);
      alert('Failed to inject code: ' + err.message);
    });
  }
  
  // Function that runs in the context of the Earth Engine tab
  function injectCodeFunction(code) {
    try {
      console.log("Attempting to inject code into Earth Engine editor");
      
      // Method 1: Try to use the CodeEditor directly if it exists in window
      if (window.Code && window.Code.setCode) {
        console.log("Using Code.setCode method");
        window.Code.setCode(code);
        return true;
      }
      
      // Method 2: Try ACE editor
      const aceEditors = document.querySelectorAll('.ace_editor');
      if (aceEditors.length > 0) {
        console.log("Found ACE editor, attempting to use it");
        
        // Try multiple ways to get the editor instance
        for (const editorElement of aceEditors) {
          // Try the common ways to access Ace editor
          try {
            const aceEditor = editorElement.env?.editor || 
                            window.ace?.edit(editorElement) || 
                            editorElement.aceEditor;
            
            if (aceEditor && typeof aceEditor.setValue === 'function') {
              console.log("Found valid Ace editor instance");
              aceEditor.setValue(code);
              aceEditor.clearSelection();
              return true;
            }
          } catch (e) {
            console.warn("Error accessing Ace editor:", e);
          }
        }
      }
      
      // Method 3: Try CodeMirror
      const codeMirrors = document.querySelectorAll('.CodeMirror');
      if (codeMirrors.length > 0) {
        console.log("Found CodeMirror, attempting to use it");
        
        for (const cm of codeMirrors) {
          if (cm.CodeMirror) {
            cm.CodeMirror.setValue(code);
            return true;
          }
        }
      }
      
      // Method 4: Try to find the script editor textarea
      const scriptTextareas = document.querySelectorAll('textarea.ace_text-input, textarea.code-editor');
      if (scriptTextareas.length > 0) {
        console.log("Found script textarea, using direct input");
        
        const textarea = scriptTextareas[0];
        textarea.focus();
        textarea.value = code;
        
        // Try to trigger change events
        const event = new Event('input', { bubbles: true });
        textarea.dispatchEvent(event);
        
        return true;
      }
      
      // Method 5: Look for Earth Engine specific elements and try to find editor
      const codeEditor = document.getElementById('code-editor');
      if (codeEditor) {
        console.log("Found code-editor element, trying to access editor");
        
        // Try to get any available code editor from global variables
        const possibleEditorVars = [
          'earthEngineCodeEditor', 
          'codeEditor', 
          'editor',
          'playground'
        ];
        
        for (const varName of possibleEditorVars) {
          if (window[varName] && typeof window[varName].setValue === 'function') {
            console.log(`Found editor in window.${varName}`);
            window[varName].setValue(code);
            return true;
          }
        }
        
        // If we found the element but couldn't get the editor instance
        // try to inject code via DOM manipulation
        try {
          // Try to find any visible editor content
          const editorContent = codeEditor.querySelector('.ace_content, .CodeMirror-code');
          if (editorContent) {
            // Use exec command as a last resort
            document.execCommand('selectAll', false, null);
            document.execCommand('delete', false, null);
            document.execCommand('insertText', false, code);
            return true;
          }
        } catch (e) {
          console.warn("DOM manipulation failed:", e);
        }
      }
      
      // Method 6: Ultimate fallback - try to simulate keyboard input
      try {
        console.log("Using clipboard and keyboard simulation as last resort");
        // Copy to clipboard
        const originalClipboard = navigator.clipboard.readText();
        navigator.clipboard.writeText(code);
        
        // Try to find any editor element to focus
        const focusTargets = document.querySelectorAll('.ace_editor, .CodeMirror, #code-editor, .ace_text-input');
        if (focusTargets.length > 0) {
          focusTargets[0].focus();
          
          // Simulate Ctrl+A and then Ctrl+V
          document.execCommand('selectAll');
          document.execCommand('paste');
          
          // Restore original clipboard
          setTimeout(() => {
            if (originalClipboard) {
              navigator.clipboard.writeText(originalClipboard);
            }
          }, 500);
          
          return true;
        }
      } catch (e) {
        console.warn("Clipboard fallback failed:", e);
      }
      
      console.error("All injection methods failed");
      return false;
    } catch (error) {
      console.error('Error injecting into editor:', error);
      return false;
    }
  }
  
  // Clear the output
  clearBtn.addEventListener('click', function() {
    codeOutput.value = '';
  });
  
  async function copyToClipboard(text) {
    try {
      // Use the extension's background script to copy to clipboard
      chrome.runtime.sendMessage({
        type: 'copy-to-clipboard',
        data: text
      });
    } catch (err) {
      console.error('Failed to copy text: ', err);
      alert('Failed to copy to clipboard: ' + err.message);
    }
  }
  
  async function generateEarthEngineCode(prompt, apiKey) {
    const enhancedPrompt = `Generate Google Earth Engine JavaScript code for the following task. 
    As a professional mapper fluent with google earth engine javascript coding. Format your response as a JSON object with "type": "javascript_code" and "code" containing the JavaScript code.
    Make sure it's complete, working JavaScript that can be copied and pasted directly without any modifications in the Earth Engine Code Editor:
    Please make sure you handle the minimum and the maximum of the values. Use the latest and most updated version of the earth engine api. Use the best and most updated database. 
    
    ${prompt}`;
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-4o',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in Google Earth Engine programming. Provide working JavaScript code for the Earth Engine Code Editor as a JSON object with "type": "javascript_code" and "code" containing the JavaScript code. Do not include explanations or markdown formatting in the code.'
            },
            {
              role: 'user',
              content: enhancedPrompt
            }
          ],
          response_format: { type: "json_object" },
          temperature: 0.7,
          max_tokens: 2048
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Error calling OpenAI API');
      }
      
      const data = await response.json();
      const content = data.choices[0].message.content.trim();
      
      try {
        // Parse the content as JSON
        const jsonResponse = JSON.parse(content);
        
        // Validate against the schema using the global Zod object
        const result = jsCodeSchema.safeParse(jsonResponse);
        
        if (result.success) {
          // Return just the code part if validation succeeds
          return result.data.code;
        } else {
          console.warn('Schema validation failed:', result.error);
          
          // Attempt to extract code if it exists but validation failed
          if (jsonResponse.code && typeof jsonResponse.code === 'string') {
            return jsonResponse.code;
          } else if (typeof content === 'string') {
            // Fallback: return the original content if parsing succeeded but validation failed
            return content;
          }
          throw new Error('Response format was invalid');
        }
      } catch (parseError) {
        console.warn('Failed to parse JSON response:', parseError);
        // Fallback: return the original content if parsing failed
        return content;
      }
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }
});