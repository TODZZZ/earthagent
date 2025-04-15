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
  
  // Create separate spinners for each operation
  const generateSpinner = spinner; // Use the existing spinner for generate operation
  
  // Create new spinner for inject operation
  const injectSpinner = document.createElement('span');
  injectSpinner.className = 'spinner';
  injectSpinner.style.display = 'none';
  injectCodeBtn.parentNode.insertBefore(injectSpinner, injectCodeBtn.nextSibling);
  
  // Create new spinner for run operation
  const runSpinner = document.createElement('span');
  runSpinner.className = 'spinner';
  runSpinner.style.display = 'none';
  runInEarthEngineBtn.parentNode.insertBefore(runSpinner, runInEarthEngineBtn.nextSibling);
  
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
    generateSpinner.style.display = 'inline-block';
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
        generateSpinner.style.display = 'none';
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
    injectSpinner.style.display = 'inline-block';
    injectCodeBtn.disabled = true;
    
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, function(tabs) {
      const activeTab = tabs[0];
      
      // Function to directly inject the code
      const injectCode = (tabId) => {
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          func: (codeToInject) => {
            try {
              // SIMPLE DIRECT APPROACH - Only use the most reliable method
              console.log("Attempting to inject code into Earth Engine editor");
              
              // Method 1: Direct ACE Editor manipulation
              const editorElement = document.querySelector('.ace_editor');
              if (!editorElement) {
                console.error("Could not find ACE editor");
                return {success: false, message: "Could not find editor"};
              }
              
              // Try to get the textarea input
              const textInput = document.querySelector('.ace_text-input');
              if (textInput) {
                console.log("Found text input, focusing and setting value");
                textInput.focus();
                
                // Use execCommand for reliable insertion
                document.execCommand('selectAll', false, null);
                document.execCommand('insertText', false, codeToInject);
                return {success: true, message: "Code injected via text input"};
              }
              
              // Fallback to ACE API if available
              if (window.ace) {
                try {
                  console.log("Using ACE API");
                  const editor = window.ace.edit(editorElement);
                  editor.setValue(codeToInject);
                  editor.clearSelection();
                  return {success: true, message: "Code injected via ACE API"};
                } catch (e) {
                  console.error("Error using ACE API", e);
                }
              }
              
              // Last resort: direct DOM manipulation
              const textLayer = document.querySelector('.ace_text-layer');
              if (textLayer) {
                console.log("Manipulating DOM directly");
                textLayer.innerHTML = '';
                const lines = codeToInject.split('\n');
                for (let i = 0; i < lines.length; i++) {
                  const lineDiv = document.createElement('div');
                  lineDiv.className = 'ace_line';
                  lineDiv.textContent = lines[i] || ' ';
                  textLayer.appendChild(lineDiv);
                }
                return {success: true, message: "Code injected via DOM"};
              }
              
              return {success: false, message: "All methods failed"};
            } catch (error) {
              console.error("Error injecting code:", error);
              return {success: false, message: error.toString()};
            }
          },
          args: [code]
        }).then(results => {
          if (results && results[0] && results[0].result && results[0].result.success) {
            console.log("Injection successful:", results[0].result.message);
            alert("Code injected successfully!");
          } else {
            console.error("Injection failed:", results && results[0] && results[0].result ? results[0].result.message : "Unknown error");
            alert("Failed to inject code. Try copying and pasting manually.");
          }
          
          // Reset UI
          injectSpinner.style.display = 'none';
          injectCodeBtn.disabled = false;
        }).catch(err => {
          console.error("Error executing script:", err);
          alert("Error: " + err.message);
          
          // Reset UI
          injectSpinner.style.display = 'none';
          injectCodeBtn.disabled = false;
        });
      };
      
      // Check if we're on the Earth Engine Code Editor page
      if (activeTab && activeTab.url && activeTab.url.startsWith(EARTH_ENGINE_EDITOR_URL)) {
        // Already on GEE, inject directly
        injectCode(activeTab.id);
      } else {
        // Not on GEE, open a new tab and wait for it to load
        chrome.tabs.create({url: EARTH_ENGINE_EDITOR_URL}, function(newTab) {
          // Wait for the page to load before injecting
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              // Remove the listener to avoid multiple injections
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Wait 3 seconds for Earth Engine to initialize
              setTimeout(() => {
                injectCode(newTab.id);
              }, 3000);
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
    runSpinner.style.display = 'inline-block';
    runInEarthEngineBtn.disabled = true;
    
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
    runSpinner.style.display = 'none';
    runInEarthEngineBtn.disabled = false;
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