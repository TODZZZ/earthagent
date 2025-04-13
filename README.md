# Earth Engine Code Generator Chrome Extension

This Chrome extension uses OpenAI to generate Google Earth Engine JavaScript code based on natural language prompts.

## Features

- Integrates with OpenAI's API to generate code
- Appears as a convenient sidebar in your browser
- Saves your API key securely in Chrome's storage sync
- Generates ready-to-use JavaScript code for Google Earth Engine
- Directly injects generated code into the Earth Engine Code Editor
- Easily copies generated code to clipboard

## Prerequisites

- A Google Chrome browser
- An OpenAI API key ([get one here](https://platform.openai.com/account/api-keys))
- Basic familiarity with Google Earth Engine

## Installation

1. Clone or download this repository
2. Configure your API key:
   - Option 1: Edit the `config.js` file and add your OpenAI API key
   - Option 2: Load the extension and enter your API key in the sidebar UI
3. Open Chrome and navigate to `chrome://extensions/`
4. Enable "Developer mode" (toggle in top right)
5. Click "Load unpacked" and select the folder containing this extension
6. The Earth Engine Code Generator extension should now appear in your extensions list

## Usage

1. Click the extension icon in your Chrome toolbar to open the sidebar
2. If you haven't added your API key to config.js, enter it in the sidebar and click "Save Key"
3. Type a description of the Earth Engine code you need
4. Click "Generate Code" and wait for the response
5. Review the generated code
6. Choose one of the following options:
   - Click "Inject into Editor" to directly insert the code into the Earth Engine Code Editor
   - Click "Copy to Clipboard" to manually paste the code
   - Click "Clear" to start over

## Direct Code Injection

The extension can insert generated code directly into the Earth Engine Code Editor:

- **Same-tab injection**: If you already have the Earth Engine Code Editor open, clicking "Inject into Editor" will insert the code into the current editor
- **New-tab injection**: If the Code Editor isn't already open, clicking "Inject into Editor" will open it in a new tab and insert the code
- **Requires permissions**: This feature requires the extension to have permission to access and modify the Earth Engine website

## API Key Configuration

You can provide your OpenAI API key in two ways:

1. **Config File** (recommended for development): 
   - Edit the `config.js` file and add your API key
   - This file is excluded from git via .gitignore for security

2. **UI Storage**:
   - Enter your API key in the sidebar interface
   - Click "Save" to store it in Chrome's secure storage

## Examples

Here are some example prompts you can try:

- "Show NDVI over San Francisco for the year 2022 using Landsat 8"
- "Calculate forest loss in the Amazon between 2010 and 2020"
- "Create a time-lapse of urban growth in Tokyo over the last 10 years"
- "Generate a flood map for Bangladesh during monsoon season"

## Privacy Notice

Your OpenAI API key is stored locally in your browser using Chrome's storage sync API. Your prompts and generated code are sent to OpenAI's servers according to their [privacy policy](https://openai.com/policies/privacy-policy).
