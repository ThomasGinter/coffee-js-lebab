const fs = require('fs').promises;
const path = require('path');
const axios = require('axios');

// Configuration
const API_KEY = process.env.XAI_API_KEY; // Required environment variable
const API_URL = 'https://api.x.ai/v1/chat/completions';
const MODEL = process.env.XAI_MODEL || 'grok-2-1212'; // Default to grok-2-1212 if not set

// Function to extract JavaScript code from response
function extractJavaScriptCode(responseText) {
  const jsBlockStart = '```javascript';
  const jsBlockEnd = '```';
  const startIndex = responseText.indexOf(jsBlockStart) + jsBlockStart.length;
  const endIndex = responseText.lastIndexOf(jsBlockEnd);

  if (startIndex === -1 || endIndex === -1 || startIndex >= endIndex) {
    throw new Error('Could not extract JavaScript code from response');
  }

  return responseText.slice(startIndex, endIndex).trim();
}

async function convertFile(filePath) {
  try {
    const content = await fs.readFile(filePath, 'utf8');
    const prompt = `Convert this ES5 JavaScript code to ES2024, using modern syntax and features where applicable:\n\n${content}`;

    const response = await axios.post(
        API_URL,
        {
          model: MODEL,
          messages: [
            { role: 'system', content: 'You are a JavaScript expert specializing in code modernization.' },
            { role: 'user', content: prompt },
          ],
          max_tokens: 4096, // Adjust based on file size
          temperature: 0.2, // Low for precision
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${API_KEY}`,
          },
        }
    );

    const rawContent = response.data.choices[0].message.content;
    const newContent = extractJavaScriptCode(rawContent); // Extract only JS code
    await fs.writeFile(filePath, newContent, 'utf8');
    console.log(`Converted: ${filePath} using model: ${MODEL}`);
  } catch (error) {
    console.error(`Error converting ${filePath}:`, error.message);
  }
}

async function processDirectory(dir) {
  const files = await fs.readdir(dir);
  for (const file of files) {
    const fullPath = path.join(dir, file);
    const stats = await fs.stat(fullPath);
    if (stats.isFile() && file.endsWith('.js')) {
      await convertFile(fullPath);
    } else if (stats.isDirectory()) {
      await processDirectory(fullPath); // Recursive for subdirectories
    }
  }
}

// Backup original files (optional but recommended)
async function backupDirectory(srcDir, backupDir) {
  await fs.mkdir(backupDir, { recursive: true });
  const files = await fs.readdir(srcDir);
  for (const file of files) {
    const srcPath = path.join(srcDir, file);
    const destPath = path.join(backupDir, file);
    const stats = await fs.stat(srcPath);
    if (stats.isFile()) {
      await fs.copyFile(srcPath, destPath);
    } else if (stats.isDirectory()) {
      await backupDirectory(srcPath, destPath);
    }
  }
  console.log(`Backup created at: ${backupDir}`);
}

// Run the conversion
async function main(targetDir) {
  if (!targetDir) {
    throw new Error('Target directory not provided. Usage: node convert.js <directory>');
  }

  if (!API_KEY) {
    throw new Error('XAI_API_KEY environment variable not set. Please set it with your Grok API key.');
  }

  const absoluteTargetDir = path.resolve(targetDir); // Convert to absolute path
  const backupDir = `${absoluteTargetDir}_backup`;

  // Validate target directory exists
  try {
    await fs.access(absoluteTargetDir);
  } catch (error) {
    throw new Error(`Target directory '${absoluteTargetDir}' does not exist or is inaccessible.`);
  }

  console.log(`Using model: ${MODEL}`);
  console.log(`Processing directory: ${absoluteTargetDir}`);
  await backupDirectory(absoluteTargetDir, backupDir);
  await processDirectory(absoluteTargetDir);
  console.log('Conversion complete!');
}

// Parse command-line arguments and run
const args = process.argv.slice(2); // Skip 'node' and script name
const targetDir = args[0]; // First argument is the target directory

main(targetDir).catch((error) => {
  console.error(error.message);
  process.exit(1); // Exit with error code
});