// Earth Agent bundled implementation for Chrome extension
// This file contains a bundled version of the Earth Agent functionality
// with all dependencies included and no ES module imports

// Configuration fallback
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

// Global model reference
let openAImodel = null;

// Tool for fetching the Earth Engine dataset catalog
const fetchEarthEngineCatalog = async () => {
  try {
    // Log the process for debugging
    console.log("Fetching Earth Engine catalog from GitHub...");
    
    // Use the URL from config
    const response = await fetch(config.earthAgent.catalogUrl);
    if (!response.ok) {
      throw new Error('Failed to fetch Earth Engine catalog');
    }
    
    const catalog = await response.json();
    console.log(`Retrieved ${catalog.length} datasets from Earth Engine catalog`);
    
    // Extract key information to reduce token size but preserve necessary info
    const processedCatalog = catalog.map(dataset => ({
      id: dataset.id,
      title: dataset.title,
      type: dataset.type,
      tags: dataset.tags || "",
      start_date: dataset.start_date,
      end_date: dataset.end_date,
      provider: dataset.provider
    }));
    
    return JSON.stringify({
      full_catalog_size: catalog.length,
      datasets: processedCatalog
    });
  } catch (error) {
    console.error("Error fetching Earth Engine catalog:", error);
    return `Error fetching catalog: ${error.message}`;
  }
};

// Tool for analyzing which datasets are appropriate for a task
const analyzeDatasets = async (args) => {
  try {
    // Parse the catalog
    const catalogData = JSON.parse(args.catalog);
    const datasets = catalogData.datasets;
    
    // Log for debugging
    console.log(`Analyzing ${datasets.length} datasets for task: ${args.task}`);
    
    // Group datasets by tags to make browsing more efficient
    const datasetsByTags = {};
    datasets.forEach(dataset => {
      if (dataset.tags) {
        const tags = dataset.tags.split(',').map(tag => tag.trim());
        tags.forEach(tag => {
          if (!datasetsByTags[tag]) {
            datasetsByTags[tag] = [];
          }
          datasetsByTags[tag].push(dataset);
        });
      }
    });
    
    // Find keywords in the task
    const taskLower = args.task.toLowerCase();
    const potentialKeywords = [
      'landsat', 'sentinel', 'modis', 'dem', 'elevation', 'land cover', 
      'temperature', 'precipitation', 'climate', 'vegetation', 'ndvi', 
      'water', 'forest', 'urban', 'agriculture', 'flood', 'fire', 'snow',
      'ice', 'population', 'nighttime', 'lights', 'air quality', 'drought',
      'rainfall', 'soil', 'geology', 'bathymetry', 'ocean', 'coral', 'weather'
    ];
    
    const detectedKeywords = potentialKeywords.filter(keyword => 
      taskLower.includes(keyword.toLowerCase())
    );
    
    // Find potential relevant datasets based on task keywords
    const relevantDatasetIds = new Set();
    const keywordMatches = {};
    
    detectedKeywords.forEach(keyword => {
      // Direct tag matches
      if (datasetsByTags[keyword]) {
        datasetsByTags[keyword].forEach(dataset => {
          relevantDatasetIds.add(dataset.id);
          if (!keywordMatches[dataset.id]) {
            keywordMatches[dataset.id] = [];
          }
          keywordMatches[dataset.id].push(`Tag match: ${keyword}`);
        });
      }
      
      // Title matches
      datasets.forEach(dataset => {
        if (dataset.title.toLowerCase().includes(keyword.toLowerCase())) {
          relevantDatasetIds.add(dataset.id);
          if (!keywordMatches[dataset.id]) {
            keywordMatches[dataset.id] = [];
          }
          keywordMatches[dataset.id].push(`Title match: ${keyword}`);
        }
      });
    });
    
    // Get the relevant datasets
    const relevantDatasets = datasets.filter(dataset => relevantDatasetIds.has(dataset.id));
    
    // Add commonly used important datasets if not already included
    const importantDatasets = [
      "COPERNICUS/S2_SR", "LANDSAT/LC08/C02/T1_L2", "MODIS/006/MOD13Q1", 
      "NASA/NASADEM_HGT/001", "COPERNICUS/S1_GRD", "ESA/WorldCover/v100"
    ];
    
    const additionalDatasets = datasets.filter(dataset => 
      importantDatasets.includes(dataset.id) && !relevantDatasetIds.has(dataset.id)
    );
    
    // Prepare results
    return JSON.stringify({
      task: args.task,
      detected_keywords: detectedKeywords,
      relevant_datasets: relevantDatasets.map(dataset => ({
        ...dataset,
        match_reasons: keywordMatches[dataset.id] || []
      })),
      additional_important_datasets: additionalDatasets,
      total_datasets_available: datasets.length,
      total_potential_matches: relevantDatasets.length + additionalDatasets.length
    });
  } catch (error) {
    console.error("Error analyzing datasets:", error);
    return `Error analyzing datasets: ${error.message}`;
  }
};

// Tool for recommending specific datasets for a task
const recommendDatasets = async (args) => {
  try {
    // Parse the analysis data
    const analysisData = JSON.parse(args.analysis_data);
    
    // Make an OpenAI API call to get dataset recommendations
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: config.earthAgent.model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: `You are an expert in Earth Engine datasets. Given a task and potential datasets, recommend the best datasets for the task.
            
            Consider:
            1. Temporal coverage - select datasets that cover the time period needed
            2. Spatial resolution - select appropriate resolution for the task
            3. Data type - select datasets with bands/attributes needed for the task
            4. Update frequency - select datasets that are most current for the task
            5. Provider reliability - prioritize datasets from reliable sources
            
            Return a JSON object with:
            - "selected_datasets": Array of dataset objects with "id", "title", and "reason" (explanation for why this dataset is appropriate)
            - "browsing_process": Detailed explanation of how you browsed through the catalog and evaluated datasets. Be specific about why certain datasets were considered and others rejected.
            - "dataset_comparisons": Array of dataset comparison objects showing datasets you considered but didn't select, with "id" and "reason_not_selected"
            - "analysis": Overall explanation of why these datasets are best for this task`
          },
          {
            role: 'user',
            content: `Recommend the best Earth Engine datasets for this task: "${analysisData.task}".
            
            I've analyzed the full Earth Engine catalog (${analysisData.total_datasets_available} datasets) and found these potentially relevant datasets based on the task keywords (${analysisData.detected_keywords.join(', ')}):
            
            RELEVANT DATASETS:
            ${JSON.stringify(analysisData.relevant_datasets, null, 2)}
            
            ADDITIONAL IMPORTANT DATASETS that might be relevant:
            ${JSON.stringify(analysisData.additional_important_datasets, null, 2)}
            
            Please review these datasets and recommend the best ones for this specific task. IMPORTANT: Be diverse in your recommendations and don't always default to the same datasets. Show your detailed comparison process, explaining which datasets you considered but decided against and why.`
          }
        ],
        response_format: { type: "json_object" },
        temperature: 0.4,
        max_tokens: 1500
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error recommending datasets');
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Dataset recommendation error:", error);
    return `Error recommending datasets: ${error.message}`;
  }
};

// Tool for generating Earth Engine code with recommended datasets
const generateCode = async (args) => {
  try {
    // Parse the recommendations
    const recommendations = JSON.parse(args.dataset_recommendations);
    const task = args.task;
    
    // Make an OpenAI API call to generate code
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${config.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: config.earthAgent.model || 'gpt-4o',
        messages: [
          {
            role: 'system',
            content: 'You are an expert in Google Earth Engine programming. Generate efficient, well-commented JavaScript code for the Earth Engine Code Editor. Focus on practical implementation using the recommended datasets, with proper error handling and visualization.'
          },
          {
            role: 'user',
            content: `Create Google Earth Engine JavaScript code for this task: "${task}". Use these specific datasets: ${JSON.stringify(recommendations.selected_datasets)}. Analysis provided: ${recommendations.analysis}`
          }
        ],
        temperature: config.earthAgent.temperature || 0.3,
        max_tokens: 2048
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error?.message || 'Error generating code');
    }
    
    const data = await response.json();
    return data.choices[0].message.content.trim();
  } catch (error) {
    console.error("Code generation error:", error);
    return `Error generating code: ${error.message}`;
  }
};

// Main function to run the Earth Agent
async function runEarthAgent(task, apiKey, updateCallback) {
  try {
    // Use the provided API key or fallback to config
    config.OPENAI_API_KEY = apiKey || config.OPENAI_API_KEY;
    
    if (!config.OPENAI_API_KEY) {
      throw new Error("API key is required to run Earth Agent");
    }
    
    // Basic workflow steps for dataset selection and code generation
    updateCallback("🔍 Earth Agent: Fetching Earth Engine dataset catalog...");
    
    // Step 1: Fetch catalog
    const catalogResponse = await fetchEarthEngineCatalog();
    
    // Step 2: Analyze datasets
    updateCallback("🔍 Earth Agent: Analyzing datasets for your task...");
    const analysisResponse = await analyzeDatasets({
      task: task,
      catalog: catalogResponse
    });
    
    // Step 3: Recommend datasets
    updateCallback("🔍 Earth Agent: Recommending the best datasets for your task...");
    const recommendationsResponse = await recommendDatasets({
      analysis_data: analysisResponse
    });
    
    // Step 4: Generate code
    updateCallback("⚙️ Earth Agent: Generating Earth Engine code with selected datasets...");
    const codeResponse = await generateCode({
      task: task,
      dataset_recommendations: recommendationsResponse
    });
    
    // Parse the recommendations for display
    try {
      const recommendations = JSON.parse(recommendationsResponse);
      
      // Display dataset recommendations
      let output = "🔍 DATASET BROWSING PROCESS:\n";
      output += recommendations.browsing_process || "No browsing process provided.";
      output += "\n\n🌍 RECOMMENDED DATASETS:\n";
      
      if (recommendations.selected_datasets) {
        recommendations.selected_datasets.forEach((dataset, index) => {
          output += `${index + 1}. ${dataset.id} (${dataset.title || ""})\n   - ${dataset.reason || ""}\n`;
        });
      }
      
      output += "\n📊 ANALYSIS:\n";
      output += recommendations.analysis || "No analysis provided.";
      
      updateCallback(output);
      
      // Wait a moment before showing the final code
      setTimeout(() => {
        updateCallback(codeResponse);
      }, 1000);
    } catch (e) {
      // If parsing fails, just show the code
      updateCallback(codeResponse);
    }
    
    return codeResponse;
  } catch (error) {
    console.error("Earth Agent Error:", error);
    throw error;
  }
} 