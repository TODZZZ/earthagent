document.addEventListener('DOMContentLoaded', function() {
  const apiKeyInput = document.getElementById('apiKey');
  const saveApiKeyBtn = document.getElementById('saveApiKey');
  const promptInput = document.getElementById('prompt');
  const generateBtn = document.getElementById('generateBtn');
  const codeOutput = document.getElementById('codeOutput');
  const copyBtn = document.getElementById('copyBtn');
  const clearBtn = document.getElementById('clearBtn');
  const spinner = document.getElementById('spinner');
  const validationToggle = document.getElementById('validationToggle');
  const validationStatus = document.getElementById('validationStatus');
  const statusText = document.getElementById('statusText');
  
  // Global variables
  const VALIDATION_SERVER_URL = 'http://localhost:5000/validate';
  let validationEnabled = false; // Default to false
  
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
  
  // Load validation setting from storage
  chrome.storage.sync.get(['validation_enabled'], function(result) {
    if (result.validation_enabled !== undefined) {
      validationEnabled = result.validation_enabled;
      validationToggle.checked = validationEnabled;
    }
    // Check if validation server is available
    checkValidationServer();
  });
  
  // Toggle validation on/off
  validationToggle.addEventListener('change', function() {
    validationEnabled = this.checked;
    chrome.storage.sync.set({ 'validation_enabled': validationEnabled });
    
    if (validationEnabled) {
      checkValidationServer();
    } else {
      validationStatus.style.display = 'none';
    }
  });
  
  // Check if validation server is running
  function checkValidationServer() {
    validationStatus.style.display = 'block';
    statusText.textContent = 'Checking...';
    
    fetch(VALIDATION_SERVER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ code: '// test' })
    })
    .then(response => {
      if (response.ok) {
        statusText.textContent = 'Connected';
        statusText.style.color = 'green';
      } else {
        throw new Error('Server error');
      }
    })
    .catch(error => {
      statusText.textContent = 'Not available (using fallback validation)';
      statusText.style.color = 'orange';
      console.error('Validation server error:', error);
    });
  }
  
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
        if (validationEnabled) {
          return validateCode(code);
        } else {
          return { valid: true, code: code };
        }
      })
      .then(result => {
        if (result.valid) {
          codeOutput.value = result.code;
        } else {
          codeOutput.value = `Error: ${result.error}\n\nOriginal code:\n${result.originalCode}`;
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
  });
  
  // Copy generated code to clipboard
  copyBtn.addEventListener('click', function() {
    const code = codeOutput.value.trim();
    if (code) {
      copyToClipboard(code);
    }
  });
  
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
  
  // Validate code using the Pydantic validation server
  async function validateCode(code) {
    try {
      const response = await fetch(VALIDATION_SERVER_URL, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ code: code })
      });
      
      const data = await response.json();
      
      if (!response.ok) {
        return {
          valid: false,
          error: data.error || 'Validation server error',
          originalCode: code
        };
      }
      
      return {
        valid: true,
        code: data.code
      };
    } catch (error) {
      console.error('Validation error:', error);
      // If validation server is unavailable, perform basic fallback validation
      return performFallbackValidation(code);
    }
  }
  
  // Simple client-side validation as a fallback
  function performFallbackValidation(code) {
    try {
      // Basic check for JavaScript syntax
      if (!/[{};()=]/.test(code)) {
        return {
          valid: false,
          error: 'Code does not appear to be valid JavaScript',
          originalCode: code
        };
      }
      
      // Check for Earth Engine patterns
      const eePatterns = [
        'ee.Image',
        'ee.FeatureCollection',
        'ee.Geometry',
        'ee.Reducer',
        'Map.addLayer',
        'ee.Filter',
        'ee.Date'
      ];
      
      const hasEarthEngineCode = eePatterns.some(pattern => code.includes(pattern));
      
      if (!hasEarthEngineCode) {
        return {
          valid: false,
          error: 'Code does not appear to contain Earth Engine JavaScript',
          originalCode: code
        };
      }
      
      return {
        valid: true,
        code: code
      };
    } catch (e) {
      return {
        valid: true, // Allow it to pass if our fallback validation fails
        code: code
      };
    }
  }
  
  async function generateEarthEngineCode(prompt, apiKey) {
    const enhancedPrompt = `Generate Google Earth Engine JavaScript code for the following task. 
    Only provide the code without explanations. Make sure it's complete, working JavaScript that can be used directly in the Earth Engine Code Editor:
    
    ${prompt}`;
    
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: 'gpt-3.5-turbo',
          messages: [
            {
              role: 'system',
              content: 'You are an expert in Google Earth Engine programming. Provide only working JavaScript code for the Earth Engine Code Editor without explanations or markdown formatting.'
            },
            {
              role: 'user',
              content: enhancedPrompt
            }
          ],
          temperature: 0.7,
          max_tokens: 2048
        })
      });
      
      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error?.message || 'Error calling OpenAI API');
      }
      
      const data = await response.json();
      return data.choices[0].message.content.trim();
    } catch (error) {
      console.error('Error calling OpenAI API:', error);
      throw error;
    }
  }
}); 