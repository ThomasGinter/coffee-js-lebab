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

// Convert a single CoffeeScript file
async function convertFile(filePath) {
    try {
        const content = await fs.readFile(filePath, 'utf8');
        const prompt = `Convert the following CoffeeScript 1.2 code to modern ES2023 JavaScript. Maintain the CommonJS module syntax (use require and module.exports). Use modern JavaScript features such as arrow functions, template literals, destructuring, and other ES2023 features where appropriate. Ensure the converted code is functionally equivalent to the original CoffeeScript code. Provide the converted JavaScript code wrapped in a markdown code block with the language specified as javascript:\n\n${content}`;

        const response = await axios.post(
            API_URL,
            {
                model: MODEL,
                messages: [
                    { role: 'system', content: 'You are a CoffeeScript and JavaScript expert specializing in code conversion.' },
                    { role: 'user', content: prompt },
                ],
                max_tokens: 4096, // Adjust based on file size if needed
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
        const newContent = extractJavaScriptCode(rawContent);
        const jsFilePath = filePath.replace(/\.coffee$/, '.js');
        await fs.writeFile(jsFilePath, newContent, 'utf8');
        await fs.unlink(filePath); // Delete the original .coffee file
        console.log(`Converted ${filePath} to ${jsFilePath} using model: ${MODEL}`);
    } catch (error) {
        console.error(`Error converting ${filePath}:`, error.message);
    }
}

// Process all .coffee files in a directory recursively
async function processDirectory(dir) {
    const files = await fs.readdir(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stats = await fs.stat(fullPath);
        if (stats.isFile() && file.endsWith('.coffee')) {
            await convertFile(fullPath);
        } else if (stats.isDirectory()) {
            await processDirectory(fullPath); // Recursive for subdirectories
        }
    }
}

// Backup the original directory
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

// Main execution function
async function main(targetDir) {
    if (!targetDir) {
        throw new Error('Target directory not provided. Usage: node convert.js <directory>');
    }

    if (!API_KEY) {
        throw new Error('XAI_API_KEY environment variable not set. Please set it with your Grok API key.');
    }

    const absoluteTargetDir = path.resolve(targetDir);
    const backupDir = `${absoluteTargetDir}_backup`;

    try {
        await fs.access(absoluteTargetDir);
    } catch (error) {
        throw new Error(`Target directory '${absoluteTargetDir}' does not exist or is inaccessible.`);
    }

    console.log(`Using model: ${MODEL}`);
    console.log(`Processing CoffeeScript files in directory: ${absoluteTargetDir}`);
    await backupDirectory(absoluteTargetDir, backupDir);
    await processDirectory(absoluteTargetDir);
    console.log('CoffeeScript to JavaScript conversion complete!');
}

// Run the script with command-line argument
const args = process.argv.slice(2);
const targetDir = args[0];

main(targetDir).catch((error) => {
    console.error(error.message);
    process.exit(1);
});