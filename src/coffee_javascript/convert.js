const fs = require('fs');
const path = require('path');
const fse = require('fs-extra');
const { select, input, confirm } = require('@inquirer/prompts');
const { Configuration, OpenAIApi } = require('openai');
const glob = require('glob');
const { parse } = require('decaffeinate-parser');
const axios = require('axios');

// Check for LLM_API_KEY at the start
if (!process.env.LLM_API_KEY) {
    console.error('LLM_API_KEY environment variable is not set');
    process.exit(1);
}

// Configuration for each LLM, including token limits and response tokens
const llmConfigs = {
    'OpenAI': {
        name: 'OpenAI',
        tokenLimit: 4096,
        maxResponseTokens: 1000,
        models: ['gpt-3.5-turbo', 'gpt-4'],
        call: async (prompt, model, llmConfig) => {
            const configuration = new Configuration({ apiKey: process.env.LLM_API_KEY });
            const openai = new OpenAIApi(configuration);
            const response = await openai.createCompletion({
                model: model,
                prompt: prompt,
                max_tokens: llmConfig.maxResponseTokens,
                temperature: 0.2,
            });
            return response.data.choices[0].text.trim();
        },
    },
    'Grok': {
        name: 'Grok',
        tokenLimit: 8192,
        maxResponseTokens: 2000,
        models: ['grok-2-1212', 'grok-beta'],
        url: 'https://api.x.ai/v1/chat/completions',
        call: async (prompt, model, llmConfig) => {
            try {
                // Split the prompt to separate system prompt and user content
                const parts = prompt.split('\n\nCode:\n');
                const systemPrompt = parts[0];
                const userContent = parts.length > 1 ? parts[1] : '';
                
                const response = await axios.post(llmConfig.url, {
                    model: model,
                    messages: [
                        {
                            role: 'system',
                            content: systemPrompt
                        },
                        {
                            role: 'user',
                            content: userContent ? `Please convert this CoffeeScript code to JavaScript:\n\n${userContent}` : 'Please provide guidance on converting CoffeeScript to JavaScript.'
                        }
                    ],
                    max_tokens_to_sample: llmConfig.maxResponseTokens,
                    temperature: 0.2,
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                
                // Extract the content from the assistant's message
                return response.data.choices[0].message.content.trim();
            } catch (error) {
                console.error(`Error calling Grok API:`, error.message);
                throw error;
            }
        },
    },
    'Claude': {
        name: 'Claude',
        tokenLimit: 2048,
        maxResponseTokens: 500,
        models: ['claude-3-7-sonnet-20250219', 'claude-3-5-sonnet-20241022'],
        url: 'https://api.anthropic.com/v1/messages', // Hypothetical API endpoint
        call: async (prompt, model, llmConfig) => {
            try {
                const response = await axios.post(llmConfig.url, {
                    model: model,
                    prompt: prompt,
                    max_tokens: llmConfig.maxResponseTokens,
                    temperature: 0.2,
                }, {
                    headers: {
                        'Authorization': `Bearer ${process.env.LLM_API_KEY}`,
                        'Content-Type': 'application/json'
                    }
                });
                return response.data.completion.trim(); // Assuming Claude response structure
            } catch (error) {
                console.error(`Error calling Claude API:`, error.message);
                throw error;
            }
        },
    },
};

// User input questions
const llmQuestion = {
    type: 'list',
    name: 'llm',
    message: 'Select the LLM to use (ensure LLM_API_KEY is set for your choice):',
    choices: ['OpenAI', 'Grok', 'Claude'],
};

const questions = [
    { type: 'input', name: 'sourceVersion', message: 'Enter the CoffeeScript version (e.g., 1.2 or 2.x):', default: '2.x' },
    { type: 'input', name: 'destVersion', message: 'Enter the destination JavaScript version (e.g., ES5, ES6):', default: 'ES6' },
    { type: 'input', name: 'caveats', message: 'Enter any additional caveats or instructions:' },
    { type: 'input', name: 'inputPath', message: 'Enter the path to the CoffeeScript file or directory:' },
];

// Main function
async function main() {
    console.log('Welcome to the CoffeeScript to JavaScript converter');
    const llm = await select({
        message: 'Select the LLM to use (ensure LLM_API_KEY is set for your choice):',
        choices: [
            { value: 'OpenAI' },
            { value: 'Grok' },
            { value: 'Claude' }
        ]
    });
    const selectedLLM = llmConfigs[llm];
    if (!selectedLLM) throw new Error(`Invalid LLM selected: ${llm}`);

    const model = await select({
        message: `Select the model for ${selectedLLM.name}:`,
        choices: selectedLLM.models.map(m => ({ value: m }))
    });

    const systemPrompt = fs.readFileSync('system.md', 'utf8');
    console.log('Loaded system prompt from system.md');

    // Replace questions array with individual prompts
    const sourceVersion = await input({
        message: 'Enter the CoffeeScript version (e.g., 1.2 or 2.x):',
        default: '1.2'
    });
    const destVersion = await input({
        message: 'Enter the destination JavaScript version (e.g., ES5, ES6):',
        default: 'ES2023'
    });
    const caveats = await input({
        message: 'Enter any additional caveats or instructions:',
        default: 'Preserve the commonjs syntax for module exports where applicable.'
    });
    const inputPath = await input({
        message: 'Enter the path to the CoffeeScript file or directory:',
        default: '/Users/tginter/dev/estateguru/eg/common/automatedReviews.coffee'
    });

    const answers = { sourceVersion, destVersion, caveats, inputPath };

    let translationPrompt;
    if (fs.existsSync('user.md')) {
        const existingPrompt = fs.readFileSync('user.md', 'utf8');
        const useExisting = await confirm({
            message: `Use existing translation prompt:\n${existingPrompt}`,
            default: true
        });
        translationPrompt = useExisting ?
            existingPrompt :
            await generateTranslationPrompt(answers, selectedLLM, model);
    } else {
        translationPrompt = await generateTranslationPrompt(answers, selectedLLM, model);
    }
    fs.writeFileSync('user.md', translationPrompt);
    console.log('Translation prompt saved to user.md');

    if (!fs.existsSync(inputPath)) throw new Error(`Input path ${inputPath} does not exist`);
    if (fs.lstatSync(inputPath).isDirectory()) {
        console.log(`Processing directory: ${inputPath}`);
        await processDirectory(inputPath, translationPrompt, selectedLLM, model);
    } else {
        console.log(`Processing file: ${inputPath}`);
        await processFile(inputPath, translationPrompt, selectedLLM, model);
    }
    console.log('Translation completed successfully');
}

// Generate translation prompt
async function generateTranslationPrompt(answers, llmConfig, model) {
    const metaPrompt = `
Convert CoffeeScript ${answers.sourceVersion} to JavaScript ${answers.destVersion}.  ${answers.caveats}
  `;
    return metaPrompt;
}

// Process directory
async function processDirectory(dirPath, translationPrompt, llmConfig, model) {
    const lockFile = path.join(dirPath, '.lock');
    let filesToProcess;

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

    for (const file of filesToProcess.slice()) {
        try {
            await processFile(file, translationPrompt, llmConfig, model);
            filesToProcess = filesToProcess.filter(f => f !== file);
            fs.writeFileSync(lockFile, filesToProcess.join('\n'));
        } catch (error) {
            console.error(`Failed to process ${file}: ${error.message}`);
        }
    }
    fs.unlinkSync(lockFile);
    console.log(`Directory processing complete, removed ${lockFile}`);
}

// Process single file with AST-based chunking
async function processFile(filePath, translationPrompt, llmConfig, model) {
    if (!filePath.endsWith('.coffee')) {
        console.log(`Skipping non-CoffeeScript file: ${filePath}`);
        return;
    }
    const code = fs.readFileSync(filePath, 'utf8');
    const translationPromptTokens = estimateTokenCount(translationPrompt);
    const effectiveInputLimit = llmConfig.tokenLimit - llmConfig.maxResponseTokens;
    const maxChunkTokens = effectiveInputLimit - translationPromptTokens;
    if (maxChunkTokens <= 0) throw new Error(`Translation prompt is too large for the LLM's token limit.`);

    try {
        const ast = parse(code);
        const topLevelNodes = ast.body;
        if (topLevelNodes.length === 0) {
            console.log(`No top-level nodes found in ${filePath}, skipping.`);
            return;
        }
        const nodeCodes = topLevelNodes.map(node => code.substring(node.start, node.end));
        const nodeTokenCounts = nodeCodes.map(estimateTokenCount);

        // Group nodes into chunks
        const chunks = [];
        let currentChunk = [];
        let currentTokenCount = 0;

        for (let i = 0; i < topLevelNodes.length; i++) {
            const nodeTokenCount = nodeTokenCounts[i];
            if (currentTokenCount + nodeTokenCount > maxChunkTokens) {
                if (currentChunk.length > 0) {
                    chunks.push(currentChunk);
                    currentChunk = [];
                    currentTokenCount = 0;
                }
                if (nodeTokenCount > maxChunkTokens) throw new Error(`Top-level node is too large to process.`);
            }
            currentChunk.push(i);
            currentTokenCount += nodeTokenCount;
        }
        if (currentChunk.length > 0) chunks.push(currentChunk);

        // Translate each chunk
        const translatedChunks = [];
        for (const chunkIndices of chunks) {
            const firstIndex = chunkIndices[0];
            const lastIndex = chunkIndices[chunkIndices.length - 1];
            const chunkCode = code.substring(topLevelNodes[firstIndex].start, topLevelNodes[lastIndex].end);
            const prompt = `${translationPrompt}\n\nCode:\n${chunkCode}`;
            const translatedChunk = await callLLM(prompt, llmConfig, model);
            translatedChunks.push(translatedChunk);
        }

        const translatedCode = translatedChunks.join('\n\n');
        const outputPath = filePath.replace(/\.coffee$/, '.js');
        fse.ensureDirSync(path.dirname(outputPath));
        fs.writeFileSync(outputPath, translatedCode);
        console.log(`Translated ${filePath} to ${outputPath} using AST-based chunking`);
    } catch (error) {
        console.warn(`AST parsing failed for ${filePath}: ${error.message}, falling back to line-based chunking`);
        const tokenCount = estimateTokenCount(code);
        let translatedCode;
        if (translationPromptTokens + tokenCount <= effectiveInputLimit) {
            const prompt = `${translationPrompt}\n\nCode:\n${code}`;
            translatedCode = await callLLM(prompt, llmConfig, model);
        } else {
            const chunks = chunkCode(code, maxChunkTokens);
            console.log(`File ${filePath} split into ${chunks.length} chunks`);
            const translatedChunks = await Promise.all(
                chunks.map(async chunk => {
                    const prompt = `${translationPrompt}\n\nCode:\n${chunk}`;
                    return await callLLM(prompt, llmConfig, model);
                })
            );
            translatedCode = translatedChunks.join('\n');
        }
        const outputPath = filePath.replace(/\.coffee$/, '.js');
        fse.ensureDirSync(path.dirname(outputPath));
        fs.writeFileSync(outputPath, translatedCode);
        console.log(`Translated ${filePath} to ${outputPath} using line-based chunking`);
    }
}

// Estimate token count (1 token ≈ 4 characters)
function estimateTokenCount(text) {
    return Math.ceil(text.length / 4);
}

// Line-based chunking (for fallback)
function chunkCode(code, maxTokens) {
    const lines = code.split('\n');
    const chunks = [];
    let currentChunk = [];
    let currentCount = 0;

    for (const line of lines) {
        const lineTokenCount = estimateTokenCount(line);
        if (currentCount + lineTokenCount > maxTokens) {
            if (currentChunk.length > 0) {
                chunks.push(currentChunk.join('\n'));
                currentChunk = [];
                currentCount = 0;
            }
        }
        currentChunk.push(line);
        currentCount += lineTokenCount;
    }
    if (currentChunk.length > 0) chunks.push(currentChunk.join('\n'));
    return chunks;
}

// Call LLM with model validation
async function callLLM(prompt, llmConfig, model) {
    if (!llmConfig.models.includes(model)) throw new Error(`Invalid model "${model}" for ${llmConfig.name}`);
    return llmConfig.call(prompt, model, llmConfig);
}

// Run the program
main().catch(error => {
    console.error('Program failed:', error.message);
    process.exit(1);
});