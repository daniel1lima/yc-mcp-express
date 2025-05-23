const express = require('express');
const router = express.Router();
const SwaggerParser = require('swagger-parser');
const { createClient } = require('redis');
const axios = require('axios');
const yaml = require('js-yaml');

// Initialize Redis client
const redisClient = createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

// Connect to Redis
(async () => {
  try {
    await redisClient.connect();
    console.log('Connected to Redis');
  } catch (error) {
    console.error('Redis connection error:', error);
  }
})();

// Helper function to store paths in Redis
async function storePathsInRedis(paths) {
  try {
    console.log('Storing paths in Redis:', Object.keys(paths));
    
    // Store each path as a separate key
    for (const [path, pathInfo] of Object.entries(paths)) {
      const key = `path:${path}`;
      const value = JSON.stringify(pathInfo);
      console.log(`Storing key: ${key}`);
      await redisClient.set(key, value);
      
      // Verify the value was stored
      const storedValue = await redisClient.get(key);
      console.log(`Verified stored value for ${key}:`, storedValue ? 'Success' : 'Failed');
    }

    // Store list of all paths
    const allPaths = Object.keys(paths);
    console.log('Storing all paths list:', allPaths);
    await redisClient.set('all_paths', JSON.stringify(allPaths));
    
    // Verify all paths were stored
    const storedPaths = await redisClient.get('all_paths');
    console.log('Verified stored paths list:', storedPaths ? 'Success' : 'Failed');
    
    console.log('Successfully stored all paths in Redis');
  } catch (error) {
    console.error('Error storing paths in Redis:', error);
    throw error;
  }
}

router.post('/full-spec', async (req, res) => {
  try {
    if (!req.body) {
      return res.status(400).json({ error: 'OpenAPI specification is required' });
    }

    console.log('Received OpenAPI spec, processing...');
    const api = await SwaggerParser.dereference(req.body);
    
    // Store paths in Redis
    if (api.paths) {
      console.log('Found paths in API spec:', Object.keys(api.paths));
      await storePathsInRedis(api.paths);
    } else {
      console.log('No paths found in API spec');
    }

    // Transform paths into detailed format
    const detailedPaths = api.paths ? Object.entries(api.paths).map(([path, pathInfo]) => {
      const methods = {};
      for (const [method, details] of Object.entries(pathInfo)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          methods[method] = {
            summary: details.summary,
            description: details.description,
          };
        }
      }
      return {
        path,
        data: methods
      };
    }) : [];

    res.json({
      paths: detailedPaths,
      message: 'Paths stored in Redis successfully'
    });
  } catch (error) {
    console.error('Error processing OpenAPI specification:', error);
    res.status(400).json({
      error: 'Invalid OpenAPI specification',
      details: error.message
    });
  }
});


// Modified endpoint to get a single path and send to Python backend
router.get('/paths', async (req, res) => {
  try {
    const path = req.query.path;
    console.log(`Retrieving data for path: ${path}`);
    
    const key = `path:${path}`;
    const pathInfo = await redisClient.get(key);
    
    if (!pathInfo) {
      console.log(`No data found for path: ${path}`);
      return res.status(404).json({ error: 'Path not found in database' });
    }

    const parsedPathInfo = JSON.parse(pathInfo);
    console.log(`Successfully retrieved data for path: ${path}`);

    // Send to Python backend
    const pythonEndpoint = process.env.PYTHON_ENDPOINT || 'http://localhost:8000';
    const response = await axios.post(`${pythonEndpoint}/api/flow-start`, {
      flowType: 'single-tool-raw',
      pipelineInputs: [
        {
          input_name: 'input',
          value: JSON.stringify({
            path,
            data: parsedPathInfo
          })
        }
      ]
    }, {
      headers: {
        'Content-Type': 'application/json'
      }
    });

    res.json({
      path,
      pythonResponse: response.data
    });
  } catch (error) {
    console.error('Error processing path request:', error);
    res.status(500).json({
      error: 'Error processing request',
      details: error.message
    });
  }
});

router.post('/full-spec-from-url', async (req, res) => {
  try {
    const { url } = req.body;
    
    if (!url) {
      return res.status(400).json({ error: 'URL is required' });
    }

    console.log('Fetching OpenAPI spec from URL:', url);
    
    // Fetch the specification from the URL
    const response = await axios.get(url);
    let specData = response.data;

    console.log('Response type:', typeof specData);
    
    // Convert string content to object
    if (typeof specData === 'string') {
      try {
        // Try parsing as JSON first
        specData = JSON.parse(specData);
        console.log('Successfully parsed as JSON');
      } catch (e) {
        console.log(e)
        try {
          // If JSON parsing fails, try parsing as YAML
          specData = yaml.load(specData);
          console.log('Successfully parsed as YAML');
        } catch (yamlError) {
          console.log(yamlError)
          console.error('Failed to parse as both JSON and YAML');
          throw new Error('Content is neither valid JSON nor YAML');
        }
      }
    }

    console.log('Parsed spec type:', typeof specData);
    console.log('Received OpenAPI spec, processing...');
    
    const api = await SwaggerParser.dereference(specData);
    
    // Store paths in Redis
    if (api.paths) {
      console.log('Found paths in API spec:', Object.keys(api.paths));
      await storePathsInRedis(api.paths);
    } else {
      console.log('No paths found in API spec');
    }

    // Transform paths into detailed format
    const detailedPaths = api.paths ? Object.entries(api.paths).map(([path, pathInfo]) => {
      const methods = {};
      for (const [method, details] of Object.entries(pathInfo)) {
        if (['get', 'post', 'put', 'delete', 'patch'].includes(method)) {
          methods[method] = {
            summary: details.summary,
            description: details.description,
          };
        }
      }
      return {
        path,
        data: methods
      };
    }) : [];

    res.json({
      paths: detailedPaths,
      message: 'Paths stored in Redis successfully'
    });
  } catch (error) {
    console.error('Error processing OpenAPI specification:', error);
    if (error.response) {
      // Handle axios error (URL fetch failed)
      res.status(400).json({
        error: 'Failed to fetch OpenAPI specification',
        details: error.message
      });
    } else {
      // Handle parsing error
      res.status(400).json({
        error: 'Invalid OpenAPI specification',
        details: error.message
      });
    }
  }
});

module.exports = router; 