// Earth Engine Agent implementation using LangGraph architecture
import { ChatOpenAI } from "@langchain/openai";
import { createSupervisor } from "@langchain/langgraph-supervisor";
import { createReactAgent } from "@langchain/langgraph/prebuilt";
import { tool } from "@langchain/core/tools";
import { z } from "zod";
import { StringOutputParser } from "@langchain/core/output_parsers";
import config from "./config.js";

// Initialize the LLM with the API key
let model = null;

// Tool for fetching the Earth Engine dataset catalog
const fetchEarthEngineCatalog = tool(
  async () => {
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
  },
  {
    name: "fetch_earth_engine_catalog",
    description: "Fetches the complete Earth Engine dataset catalog from GitHub.",
    schema: z.object({})
  }
);

// Tool for analyzing which datasets are appropriate for a task
const analyzeDatasets = tool(
  async (args) => {
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
      
      // Prepare results for the LLM to review
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
  },
  {
    name: "analyze_datasets",
    description: "Analyzes the Earth Engine catalog to find datasets that may be relevant to the user's task.",
    schema: z.object({
      task: z.string().describe("The user's Earth Engine task description"),
      catalog: z.string().describe("The Earth Engine catalog JSON string")
    })
  }
);

// Tool for recommending specific datasets for a task
const recommendDatasets = tool(
  async (args) => {
    try {
      // Parse the analysis data
      const analysisData = JSON.parse(args.analysis_data);
      
      // Make a real OpenAI API call to get dataset recommendations
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
      const content = data.choices[0].message.content.trim();
      return content;
    } catch (error) {
      console.error("Dataset recommendation error:", error);
      return `Error recommending datasets: ${error.message}`;
    }
  },
  {
    name: "recommend_datasets",
    description: "Recommends the most appropriate Earth Engine datasets for a specific task.",
    schema: z.object({
      analysis_data: z.string().describe("The prepared analysis data including task and catalog summary")
    })
  }
);

// Tool for generating Earth Engine code with recommended datasets
const generateCode = tool(
  async (args) => {
    try {
      // Parse the recommendations
      const recommendations = JSON.parse(args.dataset_recommendations);
      const task = args.task;
      
      // Make a real OpenAI API call to generate code
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
  },
  {
    name: "generate_code",
    description: "Generates Earth Engine JavaScript code using the recommended datasets.",
    schema: z.object({
      task: z.string().describe("The user's Earth Engine task description"),
      dataset_recommendations: z.string().describe("JSON string containing the recommended datasets")
    })
  }
);

// Create specialized agents
const catalogAgent = createReactAgent({
  llm: null, // Will be set when API key is available
  tools: [fetchEarthEngineCatalog, analyzeDatasets],
  name: "catalog_expert",
  prompt: "You are an expert in Earth Engine datasets. Your job is to fetch and analyze the Earth Engine catalog to prepare it for dataset recommendation."
});

const datasetRecommenderAgent = createReactAgent({
  llm: null, // Will be set when API key is available
  tools: [recommendDatasets],
  name: "dataset_recommender",
  prompt: "You are an expert in recommending Earth Engine datasets. Based on the user's task and catalog information, recommend the most appropriate datasets."
});

const codeGeneratorAgent = createReactAgent({
  llm: null, // Will be set when API key is available
  tools: [generateCode],
  name: "code_generator",
  prompt: "You are an expert Earth Engine programmer. Generate efficient, well-commented JavaScript code for the Earth Engine Code Editor using the recommended datasets."
});

// Create supervisor workflow
let workflow = null;

// Function to initialize the Earth Agent with an API key
export function initializeEarthAgent(apiKey) {
  // Use the provided API key or fallback to the one in config
  const openAIApiKey = apiKey || config.OPENAI_API_KEY;
  
  if (!openAIApiKey) {
    throw new Error("API key is required to initialize Earth Agent");
  }

  model = new ChatOpenAI({ 
    openAIApiKey: openAIApiKey,
    modelName: config.earthAgent.model || 'gpt-4o',
    temperature: config.earthAgent.temperature || 0.2
  });

  // Set the model for each agent
  catalogAgent.llm = model;
  datasetRecommenderAgent.llm = model;
  codeGeneratorAgent.llm = model;

  // Create the supervisor workflow
  workflow = createSupervisor({
    agents: [catalogAgent, datasetRecommenderAgent, codeGeneratorAgent],
    llm: model,
    prompt:
      "You are the Earth Agent supervisor managing a team of specialists. " +
      "For Earth Engine dataset catalog operations, use catalog_expert. " +
      "For dataset recommendations, use dataset_recommender. " +
      "For generating Earth Engine code, use code_generator. " +
      "Coordinate these agents to fulfill user requests for Earth Engine code generation."
  });

  // Compile the workflow
  return workflow.compile();
}

// Main function to run the Earth Agent
export async function runEarthAgent(task, apiKey, updateCallback) {
  try {
    // Initialize if not already initialized
    const earthAgentApp = initializeEarthAgent(apiKey);
    
    // Update status
    if (updateCallback) {
      updateCallback("🔍 Earth Agent: Initializing specialized agents...");
    }
    
    // Create a function to capture agent outputs
    const agentOutputs = {};
    let displayedBrowsingProcess = false;
    
    // Intercept and process messages from the workflow
    const processAgentMessage = (message) => {
      try {
        const agentName = message.sender?.name || "unknown";
        const content = message.message?.content || "";
        
        // Store agent outputs for final processing
        agentOutputs[agentName] = content;
        
        // Show real-time updates from each agent
        if (agentName === "catalog_expert" && content.includes("datasets")) {
          updateCallback(`🔍 Earth Agent: Retrieved Earth Engine dataset catalog with ${
            JSON.parse(content).full_catalog_size || "many"} datasets.`);
        } 
        else if (agentName === "dataset_recommender" && content.includes("selected_datasets")) {
          try {
            const recommendations = JSON.parse(content);
            
            // Extract the browsing process and recommendations
            if (recommendations.browsing_process && !displayedBrowsingProcess) {
              displayedBrowsingProcess = true;
              
              let output = "🔍 DATASET BROWSING PROCESS:\n";
              output += recommendations.browsing_process;
              output += "\n\n🌍 RECOMMENDED DATASETS:\n";
              
              if (recommendations.selected_datasets) {
                recommendations.selected_datasets.forEach((dataset, index) => {
                  output += `${index + 1}. ${dataset.id} (${dataset.title || ""})\n   - ${dataset.reason || ""}\n`;
                });
              }
              
              output += "\n📊 ANALYSIS:\n";
              output += recommendations.analysis || "";
              
              // Show dataset comparisons
              if (recommendations.dataset_comparisons) {
                output += `\n\n"dataset_comparisons": ${JSON.stringify(recommendations.dataset_comparisons)}`;
              }
              
              updateCallback(output);
            }
          } catch (e) {
            console.error("Error parsing dataset recommendations:", e);
          }
        }
        else if (agentName === "code_generator") {
          updateCallback(`⚙️ Earth Agent: Generating Earth Engine code with selected datasets...\n`);
        }
      } catch (error) {
        console.error("Error processing agent message:", error);
      }
    };
    
    // Execute the workflow with callbacks
    const result = await earthAgentApp.invoke({
      messages: [
        {
          role: "user",
          content: `Generate Earth Engine code for this task: ${task}`
        }
      ],
      configurable: {
        traceCallbacks: {
          message: processAgentMessage
        }
      }
    });
    
    // Extract the final code from the result
    const finalMessage = result.messages[result.messages.length - 1];
    
    // Check if we received a valid response
    if (!finalMessage || !finalMessage.content) {
      throw new Error("Failed to generate Earth Engine code");
    }
    
    return finalMessage.content;
    
  } catch (error) {
    console.error("Earth Agent Error:", error);
    throw error;
  }
} 