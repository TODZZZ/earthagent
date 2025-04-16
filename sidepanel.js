// Simple configuration object for fallback
if (typeof config === 'undefined') {
  config = {
    OPENAI_API_KEY: "",
    earthAgent: {
      catalogUrl: "https://raw.githubusercontent.com/samapriya/Earth-Engine-Datasets-List/master/gee_catalog.json",
      model: "gpt-4o",
      temperature: 0.3
    }
  };
}

document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const promptInput = document.getElementById('prompt');
  const generateBtn = document.getElementById('generateBtn');
  const codeOutput = document.getElementById('codeOutput');
  const clearBtn = document.getElementById('clearBtn');
  const runBtn = document.getElementById('runInEarthEngineBtn'); // Reuse the run button
  const spinner = document.getElementById('spinner');
  
  // Create separate spinners for each operation
  const generateSpinner = spinner; // Use the existing spinner for generate operation
  
  // Create new spinner for run operation
  const runSpinner = document.createElement('span');
  runSpinner.className = 'spinner';
  runSpinner.style.display = 'none';
  runBtn.parentNode.insertBefore(runSpinner, runBtn.nextSibling);
  
  // Update the button text
  runBtn.textContent = 'Run in Earth Engine';
  
  // Global variables
  const EARTH_ENGINE_EDITOR_URL = 'https://code.earthengine.google.com/';
  
  // Define Zod schema for JavaScript code validation if Zod is available
  let jsCodeSchema = null;
  if (typeof Zod !== 'undefined') {
    jsCodeSchema = Zod.object({
      type: Zod.literal("javascript_code"),
      code: Zod.string().describe("A valid JavaScript code snippet")
    }).optional();
  }
  
  // Load API key from storage
  if (typeof chrome !== 'undefined' && chrome.storage) {
    chrome.storage.sync.get(['openai_api_key'], function(result) {
      if (result.openai_api_key) {
        apiKeyInput.value = result.openai_api_key;
          config.OPENAI_API_KEY = result.openai_api_key;
      }
    });
  }
  
  // Get the current API key from config or input (prioritize config)
  function getApiKey() {
    // First check if we have a valid key in the config
    if (typeof config !== 'undefined' && config.OPENAI_API_KEY && 
        config.OPENAI_API_KEY !== "your-api-key-here" && 
        config.OPENAI_API_KEY.startsWith('sk-')) {
      return config.OPENAI_API_KEY;
    }
    
    // Otherwise use the input field
    return apiKeyInput.value.trim();
  }
  
  // Clean and extract JavaScript code from text
  function extractJavaScriptCode(text) {
    if (!text) return '';
    
    // First, try to parse as JSON if we have Zod available
    if (jsCodeSchema) {
      try {
        const parsed = JSON.parse(text);
        const result = jsCodeSchema.safeParse(parsed);
        if (result.success && result.data && result.data.code) {
          return result.data.code;
        }
      } catch (e) {
        // Not JSON, continue with other extraction methods
      }
    }
    
    // Most common format: extract code from markdown code blocks
    const codeBlockRegex = /```(?:javascript|js)?\s*([\s\S]*?)```/;
    const codeBlockMatch = text.match(codeBlockRegex);
    if (codeBlockMatch && codeBlockMatch[1]) {
      return codeBlockMatch[1].trim();
    }
    
    // Try just finding the first code block without language specification
    const anyBlockRegex = /```\s*([\s\S]*?)```/;
    const anyBlockMatch = text.match(anyBlockRegex);
    if (anyBlockMatch && anyBlockMatch[1]) {
      // Check if it looks like JS
      const possibleCode = anyBlockMatch[1].trim();
      if (possibleCode.includes('var ') || 
          possibleCode.includes('const ') || 
          possibleCode.includes('function ') ||
          possibleCode.includes('// ') || 
          possibleCode.includes('Map.')) {
        return possibleCode;
      }
    }
    
    // Try to find common Earth Engine code patterns
    for (const pattern of [
      /\/\/ Define .+[\s\S]*(?=Map\.centerObject)/,  // From start of comment to Map
      /var \w+ = ee\.[\s\S]*(?=\/\/ End)/,          // From first var to End comment
      /\/\/ Google Earth Engine[\s\S]*$/,            // From GEE comment to end
      /var \w+ = ee\.[\s\S]*$/                      // From first var to end
    ]) {
      const match = text.match(pattern);
      if (match && match[0] && match[0].includes('ee.')) {
        return match[0].trim();
      }
    }
    
    // Look for Earth Engine specific code indicators
    const eeStrings = ['ee.Image', 'ee.FeatureCollection', 'ee.Geometry', 'Map.addLayer', 'Map.centerObject'];
    for (const eeString of eeStrings) {
      if (text.includes(eeString)) {
        // Find the start of the code - look for the first comment or var/const declaration before the EE code
        const startIndex = Math.max(
          0,
          text.lastIndexOf('//', text.indexOf(eeString)),
          text.lastIndexOf('var ', text.indexOf(eeString)),
          text.lastIndexOf('const ', text.indexOf(eeString)),
          text.lastIndexOf('function ', text.indexOf(eeString))
        );
        
        if (startIndex > 0) {
          return text.substring(startIndex).trim();
        }
      }
    }
    
    // If all above failed, use simple heuristics for code detection
    const lines = text.split('\n');
    let codeStartIndex = -1;
    let codeEndIndex = -1;
    
    // Look for a block of code-like lines
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      const isCodeLike = line.includes('var ') || line.includes('const ') || 
                         line.includes('function ') || line.includes('return ') ||
                         line.includes('// ') || line.includes('= ee.') ||
                         line.includes('Map.') || line.startsWith('if ');
      
      if (isCodeLike && codeStartIndex === -1) {
        codeStartIndex = i;
      } else if (codeStartIndex !== -1 && !isCodeLike && line === '' && 
                (lines[i+1]?.trim().startsWith('##') || lines[i+1]?.trim().startsWith('Explanation'))) {
        codeEndIndex = i;
        break;
      }
    }
    
    if (codeStartIndex !== -1) {
      const endIdx = codeEndIndex !== -1 ? codeEndIndex : lines.length;
      return lines.slice(codeStartIndex, endIdx).join('\n').trim();
    }
    
    // If all else fails, just return the original text
    return text;
  }
  
  // Import Earth Agent functionality
  async function importEarthAgent() {
    try {
      // In a real implementation, this would be a proper import
      // For now, we'll assume the earthAgent.js functions are globally available
      return {
        runEarthAgent: window.runEarthAgent || null,
        mockRunEarthAgent: window.mockRunEarthAgent || null
      };
    } catch (error) {
      console.error("Failed to import Earth Agent:", error);
      return { runEarthAgent: null, mockRunEarthAgent: null };
    }
  }
  
  // Save API key
  saveApiKeyBtn.addEventListener('click', function() {
    const apiKey = apiKeyInput.value.trim();
    if (apiKey) {
      config.OPENAI_API_KEY = apiKey;
      if (typeof chrome !== 'undefined' && chrome.storage) {
      chrome.storage.sync.set({ 'openai_api_key': apiKey }, function() {
        alert('API key saved successfully!');
      });
      } else {
        alert('API key saved (but may not persist after page reload)');
      }
    } else {
      alert('Please enter a valid API key');
    }
  });
  
  // Generate code when button is clicked
  generateBtn.addEventListener('click', function() {
    const prompt = promptInput.value.trim();
    const apiKey = config.OPENAI_API_KEY || apiKeyInput.value.trim();
    
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
    
    // Update output with initial message
    codeOutput.value = '⚙️ Generating Earth Engine code...';
    
    // Use the bundled Earth Agent function if available
    if (typeof runEarthAgent === 'function') {
      const updateCallback = (message) => {
        // Check if the message contains dataset information
        if (message.includes("DATASET BROWSING PROCESS") || 
            message.includes("RECOMMENDED DATASETS") || 
            message.includes("ANALYSIS:")) {
          // Display dataset information with proper formatting
          codeOutput.value = message;
        }
        // When Earth Agent is generating code
        else if (message.includes("Earth Agent: Generating Earth Engine code")) {
          codeOutput.value = message;
        }
        // If it looks like code, extract and display it
        else if (message.includes("```javascript") || 
                message.includes("```js") || 
                message.includes("var ") || 
                message.includes("// ") ||
                message.includes("ee.Image") ||
                message.includes("Map.addLayer")) {
          
          // When we detect code is being generated, extract it immediately
          const cleanCode = extractJavaScriptCode(message);
          codeOutput.value = cleanCode;
        }
        // Capture any other update messages
        else {
          codeOutput.value = message;
        }
      };
      
      runEarthAgent(prompt, apiKey, updateCallback)
        .then(code => {
          // Process the code to extract clean JavaScript
          const cleanCode = extractJavaScriptCode(code);
          codeOutput.value = cleanCode;
        })
        .catch(error => {
          codeOutput.value = `Error: ${error.message}`;
        })
        .finally(() => {
          // Hide spinner
          spinner.style.display = 'none';
          generateBtn.disabled = false;
        });
    } else {
      // Fallback to direct OpenAI API call
      const systemPrompt = 'You are an expert in Google Earth Engine programming. Generate efficient, well-commented JavaScript code for the Earth Engine Code Editor. ONLY output valid JavaScript code with no explanations before or after. Do NOT include markdown formatting, headers, or any text that is not part of the code itself.';
      
      fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: config.earthAgent?.model || "gpt-4o",
          messages: [
            {
              role: 'system',
              content: systemPrompt
            },
            {
              role: 'user',
              content: `Generate Earth Engine JavaScript code for: ${prompt}. Return ONLY the code with no explanations before or after.`
            }
          ],
          temperature: 0.2
        })
      })
      .then(response => {
        if (!response.ok) {
          return response.json().then(err => {
            throw new Error(err.error?.message || 'Failed to generate code');
          });
        }
        return response.json();
      })
      .then(data => {
        if (data.choices && data.choices[0] && data.choices[0].message) {
          const content = data.choices[0].message.content;
          // Extract just the code
          codeOutput.value = extractJavaScriptCode(content);
        } else {
          throw new Error('Unexpected API response format');
        }
      })
      .catch(error => {
        codeOutput.value = `Error: ${error.message}`;
      })
      .finally(() => {
        // Hide spinner
        spinner.style.display = 'none';
        generateBtn.disabled = false;
      });
    }
  });
  
  // Clear the output
  clearBtn.addEventListener('click', function() {
    codeOutput.value = '';
  });
  
  // Run in Earth Engine button - combined inject and run functionality
  runBtn.addEventListener('click', function() {
    const code = codeOutput.value.trim();
    
    if (!code) {
      alert('Please generate code first');
      return;
    }
    
    if (typeof chrome === 'undefined' || !chrome.runtime) {
      alert('This feature requires browser extension APIs that are not available.');
      return;
    }
    
    // Show spinner while processing
    runSpinner.style.display = 'inline-block';
    runBtn.disabled = true;
    
    // Copy to clipboard as backup using extension messaging
    chrome.runtime.sendMessage({
      type: 'copy-to-clipboard',
      data: code
    });
    
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
            // After successful injection, click the run button
            clickEarthEngineRunButton(tabId);
          } else {
            console.error("Injection failed:", results && results[0] && results[0].result ? results[0].result.message : "Unknown error");
            alert("Failed to inject code. Try copying and pasting manually.");
            // Reset UI
            runSpinner.style.display = 'none';
            runBtn.disabled = false;
          }
        }).catch(err => {
          console.error("Error executing script:", err);
          alert("Error: " + err.message);
          
          // Reset UI
          runSpinner.style.display = 'none';
          runBtn.disabled = false;
        });
      };
      
      // Function to click the Run button in Earth Engine
      function clickEarthEngineRunButton(tabId) {
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          func: () => {
            try {
              console.log("Looking for Earth Engine run button");
              
              // Find the run button through multiple selectors for reliability
              const runButton = document.querySelector('.goog-button.run-button') || 
                              document.querySelector('button[title="Run"]') ||
                              Array.from(document.querySelectorAll('button')).find(b => 
                                b.innerText === 'Run' || b.title === 'Run' || 
                                b.getAttribute('aria-label') === 'Run'
                              );
              
              if (runButton) {
                console.log("Found run button, clicking...");
                runButton.click();
                return {success: true, message: "Run button clicked"};
              } else {
                console.error("Run button not found");
                return {success: false, message: "Run button not found"};
              }
            } catch (error) {
              console.error("Error clicking run button:", error);
              return {success: false, message: error.toString()};
            }
          }
        }).then(results => {
          if (results && results[0] && results[0].result && results[0].result.success) {
            console.log("Run button clicked successfully");
          } else {
            console.error("Failed to click run button");
            alert("Failed to run code automatically. The code has been injected successfully, but you'll need to click the Run button manually.");
          }
          
          // Reset UI
          runSpinner.style.display = 'none';
          runBtn.disabled = false;
        }).catch(err => {
          console.error("Error executing script for run button:", err);
          
          // Reset UI
          runSpinner.style.display = 'none';
          runBtn.disabled = false;
        });
      }
      
      // Function to wait for Earth Engine to initialize and the run button to be available
      function waitForEarthEngineRunButton(tabId, callback, attempts = 0) {
        if (attempts > 10) { // Max 10 attempts (30 seconds)
          console.error("Timeout waiting for Earth Engine to initialize");
          alert("Timeout waiting for Earth Engine to initialize. Please try again or run manually.");
          
          // Reset UI
          runSpinner.style.display = 'none';
          runBtn.disabled = false;
          return;
        }
        
        chrome.scripting.executeScript({
          target: {tabId: tabId},
          func: () => {
            const runButton = document.querySelector('.goog-button.run-button') || 
                           document.querySelector('button[title="Run"]');
            return !!runButton;
          }
        }).then(results => {
          if (results && results[0] && results[0].result === true) {
            // Run button is available
            callback();
          } else {
            // Wait 3 seconds and try again
            setTimeout(() => {
              waitForEarthEngineRunButton(tabId, callback, attempts + 1);
            }, 3000);
          }
        }).catch(err => {
          console.error("Error checking for run button:", err);
          // Reset UI
          runSpinner.style.display = 'none';
          runBtn.disabled = false;
        });
      }
      
      // Function to reset UI elements
      function finishRunOperation() {
        runSpinner.style.display = 'none';
        runBtn.disabled = false;
      }
      
      // Check if we're on Earth Engine
      if (activeTab && activeTab.url && activeTab.url.startsWith(EARTH_ENGINE_EDITOR_URL)) {
        // Already on Earth Engine, inject and run
        injectCode(activeTab.id);
      } else {
        // Not on Earth Engine, open in a new tab
        chrome.tabs.create({url: EARTH_ENGINE_EDITOR_URL}, function(newTab) {
          // Wait for the page to load
          chrome.tabs.onUpdated.addListener(function listener(tabId, changeInfo) {
            if (tabId === newTab.id && changeInfo.status === 'complete') {
              // Remove the listener to avoid multiple injections
              chrome.tabs.onUpdated.removeListener(listener);
              
              // Wait for Earth Engine to initialize
              waitForEarthEngineRunButton(newTab.id, () => {
                // Wait additional time for the editor to fully initialize
                setTimeout(() => {
                  injectCode(newTab.id);
                }, 2000);
              });
            }
          });
        });
      }
    });
  });
});