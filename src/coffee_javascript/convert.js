const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const inquirer = require('inquirer');
const { Configuration, OpenAIApi } = require('openai');
const glob = require('glob');

// Check for LLM_API_KEY at the start
if (!process.env.LLM_API_KEY) {
    console.error('LLM_API_KEY environment variable is not set');
    process.exit(1);
}

// Configuration for each LLM, including available models
const llmConfigs = {
    'OpenAI': {
        name: 'OpenAI',
        tokenLimit: 4096,
        models: ['gpt-3.5-turbo', 'gpt-4'],
        call: async (prompt, model) => {
            const configuration = new Configuration({ apiKey: process.env.LLM_API_KEY });
            const openai = new OpenAIApi(configuration);
            const response = await openai.createCompletion({
                model: model,
                prompt: prompt,
                max_tokens: 1000,
                temperature: 0.2,
            });
            return response.data.choices[0].text.trim();
        },
    },
    'Grok': {
        name: 'Grok',
        tokenLimit: 8192,
        models: ['grok-2-1212', 'grok-beta'],
        call: async (prompt, model) => {
            // Placeholder for Grok API call
            return `Simulated Grok response for model "${model}" and prompt: "${prompt.substring(0, 50)}..."`;
        },
    },
    'Claude': {
        name: 'Claude',
        tokenLimit: 2048,
        models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'],
        call: async (prompt, model) => {
            // Placeholder for Claude API call
            return `Simulated Claude response for model "${model}" and prompt: "${prompt.substring(0, 50)}..."`;
        },
    },
};

// Questions for user input
const llmQuestion = {
    type: 'list',
    name: 'llm',
    message: 'Select the LLM to use (ensure LLM_API_KEY is set for your choice):',
    choices: ['OpenAI', 'Grok', 'Claude'],
};

const questions = [
    {
        type: 'input',
        name: 'sourceVersion',
        message: 'Enter the CoffeeScript version (e.g., 1.2 or 2.x):',
        default: '2.x',
    },
    {
        type: 'input',
        name: 'destVersion',
        message: 'Enter the destination JavaScript version (e.g., ES5, ES6):',
        default: 'ES6',
    },
    {
        type: 'input',
        name: 'caveats',
        message: 'Enter any additional caveats or instructions:',
    },
    {
        type: 'input',
        name: 'inputPath',
        message: 'Enter the path to the CoffeeScript file or directory:',
    },
];

// Main function to orchestrate the program
async function main() {
    // Select LLM
    const { llm } = await inquirer.prompt([llmQuestion]);
    const selectedLLM = llmConfigs[llm];
    if (!selectedLLM) {
        throw new Error(`Invalid LLM selected: ${llm}`);
    }

    // Select model for the chosen LLM
    const modelQuestion = {
        type: 'list',
        name: 'model',
        message: `Select the model for ${selectedLLM.name}:`,
        choices: selectedLLM.models,
    };
    const { model } = await inquirer.prompt([modelQuestion]);

    // Read system prompt from system.md
    const systemPrompt = fs.readFileSync('system.md', 'utf8');
    console.log('Loaded system prompt from system.md');

    // Get user input
    const answers = await inquirer.prompt(questions);

    // Handle translation prompt (reuse existing or generate new)
    let translationPrompt;
    if (fs.existsSync('user.md')) {
        const existingPrompt = fs.readFileSync('user.md', 'utf8');
        const { useExisting } = await inquirer.prompt([
            {
                type: 'confirm',
                name: 'useExisting',
                message: `Use existing translation prompt:\n${existingPrompt}`,
                default: true,
            },
        ]);
        translationPrompt = useExisting ? existingPrompt : await generateTranslationPrompt(systemPrompt, answers, selectedLLM, model);
    } else {
        translationPrompt = await generateTranslationPrompt(systemPrompt, answers, selectedLLM, model);
    }
    fs.writeFileSync('user.md', translationPrompt);
    console.log('Translation prompt saved to user.md');

    // Process the input path (file or directory)
    const inputPath = answers.inputPath;
    if (!fs.existsSync(inputPath)) {
        throw new Error(`Input path ${inputPath} does not exist`);
    }
    if (fs.lstatSync(inputPath).isDirectory()) {
        console.log(`Processing directory: ${inputPath}`);
        await processDirectory(inputPath, translationPrompt, selectedLLM, model);
    } else {
        console.log(`Processing file: ${inputPath}`);
        await processFile(inputPath, translationPrompt, selectedLLM, model);
    }
    console.log('Translation completed successfully');
}

// Generate a translation prompt using the selected LLM and model
async function generateTranslationPrompt(systemPrompt, answers, llmConfig, model) {
    const metaPrompt = `
${systemPrompt}

Based on the following user input, generate a suitable translation prompt for converting CoffeeScript to JavaScript.

User input:
- Source language: ${answers.sourceVersion}
- Destination language: ${answers.destVersion}
- Additional caveats: ${answers.caveats}

The translation prompt should be clear and specific, instructing the LLM on how to perform the translation accurately.
  `;
    return callLLM(metaPrompt, llmConfig, model);
}

// Process a directory of CoffeeScript files
async function processDirectory(dirPath, translationPrompt, llmConfig, model) {
    const lockFile = path.join(dirPath, '.lock');
    let filesToProcess;

    // Check for existing .lock file to resume processing
    if (fs.existsSync(lockFile)) {
        filesToProcess = fs.readFileSync(lockFile, 'utf8').split('\n').filter(Boolean);
        console.log(`Resuming from .lock file with ${filesToProcess.length} files remaining`);
    } else {
        filesToProcess = glob.sync(path.join(dirPath, '**/*.coffee')).map(file => path.resolve(file));
        if (filesToProcess.length === 0) {
            console.log('No CoffeeScript files found in directory');
            return;
        }
        fs.writeFileSync(lockFile, filesToProcess.join('\n'));
        console.log(`Found ${filesToProcess.length} CoffeeScript files to process`);
    }

    // Process each file and update .lock file
    for (const file of filesToProcess.slice()) {
        try {
            await processFile(file, translationPrompt, llmConfig, model);
            filesToProcess = filesToProcess.filter(f => f !== file);
            fs.writeFileSync(lockFile, filesToProcess.join('\n'));
        } catch (error) {
            console.error(`Failed to process ${file}: ${error.message}`);
        }
    }

    // Clean up .lock file when done
    fs.unlinkSync(lockFile);
    console.log(`Directory processing complete, removed ${lockFile}`);
}

// Process a single CoffeeScript file
async function processFile(filePath, translationPrompt, llmConfig, model) {
    if (!filePath.endsWith('.coffee')) {
        console.log(`Skipping non-CoffeeScript file: ${filePath}`);
        return;
    }
    const code = fs.readFileSync(filePath, 'utf8');
    const tokenCount = estimateTokenCount(code);
    let translatedCode;

    if (tokenCount <= llmConfig.tokenLimit - 500) {
        translatedCode = await translateCode(code, translationPrompt, llmConfig, model);
    } else {
        const chunks = chunkCode(code, llmConfig.tokenLimit);
        console.log(`File ${filePath} exceeds token limit (${tokenCount} tokens), split into ${chunks.length} chunks`);
        const translatedChunks = await Promise.all(
            chunks.map(async (chunk, index) => {
                try {
                    return await translateCode(chunk, translationPrompt, llmConfig, model);
                } catch (error) {
                    console.error(`Error translating chunk ${index + 1} of ${filePath}: ${error.message}`);
                    throw error;
                }
            })
        );
        translatedCode = translatedChunks.join('\n');
    }

    const outputPath = filePath.replace(/\.coffee$/, '.js');
    fse.ensureDirSync(path.dirname(outputPath));
    fs.writeFileSync(outputPath, translatedCode);
    console.log(`Translated ${filePath} to ${outputPath} (${tokenCount} tokens)`);
}

// Estimate token count (1 token ≈ 4 characters)
function estimateTokenCount(code) {
    return Math.ceil(code.length / 4);
}

// Chunk code into groups of lines within token limit
function chunkCode(code, tokenLimit) {
    const lines = code.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentCount = 0;

    for (const line of lines) {
        const lineTokenCount = estimateTokenCount(line);
        if (currentCount + lineTokenCount > tokenLimit - 500) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentCount = 0;
            }
        }
        currentChunk.push(line);
        currentCount += lineTokenCount;
    }
    if (currentChunk.length > 0) {
        chunks.push(currentChunk.join('\n'));
    }
    return chunks;
}

// Translate code using the selected LLM and model
async function translateCode(code, translationPrompt, llmConfig, model) {
    const prompt = `${translationPrompt}\n\nCode:\n${code}`;
    return callLLM(prompt, llmConfig, model);
}

// Generalized function to call the selected LLM with the chosen model
async function callLLM(prompt, llmConfig, model) {
    if (!llmConfig.models.includes(model)) {
        throw new Error(`Invalid model "${model}" for ${llmConfig.name}`);
    }
    return llmConfig.call(prompt, model);
}

// Execute the program
main().catch(error => {
    console.error('Program failed:', error.message);
    process.exit(1);
});