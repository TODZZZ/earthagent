# Earth Engine Code Generator Chrome Extension

This Chrome extension uses OpenAI to generate Google Earth Engine JavaScript code based on natural language prompts.

## Features

- Integrates with OpenAI's API to generate code
- Appears as a convenient sidebar in your browser
- Saves your API key securely in Chrome's storage sync
- Generates ready-to-use JavaScript code for Google Earth Engine
- Validates code using Pydantic (optional)
- Easily copies generated code to clipboard

## Prerequisites

- A Google Chrome browser
- An OpenAI API key ([get one here](https://platform.openai.com/account/api-keys))
- Basic familiarity with Google Earth Engine
- Python 3.9+ (optional, for code validation)

## Installation

1. Clone or download this repository
2. Configure your API key:
   - Option 1: Edit the `config.js` file and add your OpenAI API key
   - Option 2: Load the extension and enter your API key in the sidebar UI
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the folder containing this extension
6. The Earth Engine Code Generator extension should now appear in your extensions list

### Optional: Setting up Pydantic validation server

For enhanced JavaScript validation using Pydantic:

1. Make sure Python 3.9+ is installed
2. Install the required Python packages:
   ```
   pip install -r requirements.txt
   ```
3. Start the validation server:
   ```
   python server.py
   ```
4. Enable validation in the extension's sidebar UI

## Usage

1. Click the extension icon in your Chrome toolbar to open the sidebar
2. If you haven't added your API key to config.js, enter it in the sidebar and click "Save Key"
3. Type a description of the Earth Engine code you need
4. Toggle the Pydantic validation option if you want to validate the generated code
5. Click "Generate Code" and wait for the response
6. Review the generated code
7. Click "Copy to Clipboard" to use the code in the Earth Engine Code Editor

## API Key Configuration

You can provide your OpenAI API key in two ways:

1. **Config File** (recommended for development): 
   - Edit the `config.js` file and add your API key
   - This file is excluded from git via .gitignore for security

2. **UI Storage**:
   - Enter your API key in the sidebar interface
   - Click "Save" to store it in Chrome's secure storage

## Pydantic Validation

The extension can use [Pydantic](https://docs.pydantic.dev/), a powerful Python data validation library, to validate the generated JavaScript code:

- **How it works**: The validation server checks if the code is valid JavaScript and specifically Earth Engine JavaScript
- **Fallback**: If the Python server is not running, a simple JavaScript-based validation will be used
- **Toggle**: You can enable/disable validation in the sidebar UI

## Examples

Here are some example prompts you can try:

- "Show NDVI over San Francisco for the year 2022 using Landsat 8"
- "Calculate forest loss in the Amazon between 2010 and 2020"
- "Create a time-lapse of urban growth in Tokyo over the last 10 years"
- "Generate a flood map for Bangladesh during monsoon season"

## Privacy Notice

Your OpenAI API key is stored locally in your browser using Chrome's storage sync API. Your prompts and generated code are sent to OpenAI's servers according to their [privacy policy](https://openai.com/policies/privacy-policy).
