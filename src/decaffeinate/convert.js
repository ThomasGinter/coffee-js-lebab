#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { glob } = require('glob');
const { convert } = require('decaffeinate');
const { program } = require('commander');
const fsExtra = require('fs-extra');
const { ESLint } = require('eslint');

// Set up command line arguments
program
  .version('1.0.0')
  .description('Convert CoffeeScript files to JavaScript')
  .argument('<path>', 'Path to a CoffeeScript file or directory to convert')
  .option('--preserve-commonjs', 'Preserve CommonJS module syntax', false)
  .option('--keep-original', 'Keep the original CoffeeScript files', false)
  .option('--no-backup', 'Skip backup creation for directory conversion', true)
  .option('--preview', 'Preview conversion without writing files', false)
  .option('--lint', 'Lint files after conversion', false)
  .option('--fix', 'Automatically fix linting issues when possible', false)
  .option('--eslint-config <path>', 'Path to ESLint config file', '.eslintrc.js')
  .parse(process.argv);

const options = program.opts();
const targetPath = program.args[0];
const basePath = path.dirname(path.resolve(targetPath));
process.chdir(basePath);


// Initialize ESLint instance
let eslint = null;
if (options.lint) {
  const eslintOptions = {
    fix: options.fix,
    ignore: false,
    overrideConfig: [
      {
        ignores: [`!${path.dirname(basePath)}/**`]
      },
      {
        files: ['**/*.js'],
        languageOptions: {
          globals: {
            ...require('globals').node,  // Adds Node.js globals
            ...require('globals').es2023 // Adds ES2023 globals
          }
        }
      }
    ],
    // Use working directory option
    cwd: process.cwd()
  };

  if (options.eslintConfig && fs.existsSync(path.resolve(options.eslintConfig))) {
    eslintOptions.overrideConfigFile = path.resolve(options.eslintConfig);
  }

  eslint = new ESLint(eslintOptions);
  // console.log(`Initialized eslint with config: ${JSON.stringify(eslintOptions, null, 2)}`);
}

// Conversion options for decaffeinate
const decaffeinateOptions = {
  preferLet: false,
  loose: false,
  useJS: false
};

if (options.preserveCommonjs) {
  decaffeinateOptions.useCS2 = false; // Ensures CommonJS is preserved
}

async function lintFile(filePath) {
  try {
    console.log(`Linting: ${filePath}`);
    const results = await eslint.lintFiles(filePath);

    if (options.fix) {
      await ESLint.outputFixes(results);
    }

    const formatter = await eslint.loadFormatter('stylish');
    const resultText = formatter.format(results);

    if (resultText) {
      console.log(resultText);
    } else {
      console.log(`✓ No lint issues found in ${filePath}`);
    }

    // Check if there are errors (not just warnings)
    const hasErrors = results.some(result =>
      result.errorCount > 0
    );

    return !hasErrors;
  } catch (error) {
    console.error(`Error linting ${filePath}: ${error.message}`);
    return false;
  }
}

async function convertFile(filePath) {
  try {
    console.log(`Converting: ${filePath}`);
    const coffeeSource = fs.readFileSync(filePath, 'utf8');

    // Pre-process source to fix debugger statements in promise chains
    const processedSource = coffeeSource.replace(
        /\.then\s*\(\s*\([^)]*\)\s*->\s*\n\s*debugger\s*\n/g,
        '.then(($1) => {\n  debugger;\n  return undefined;\n'
    ).replace(
        /\.catch\s*\(\s*\([^)]*\)\s*->\s*\n\s*debugger\s*\n/g,
        '.catch(($1) => {\n  debugger;\n  return undefined;\n'
    );

    const result = convert(processedSource, decaffeinateOptions);

    // Create the output file path (replace .coffee with .js)
    const outputPath = filePath.replace(/\.coffee$/, '.js');

    if (options.preview) {
      console.log(`\nPreview of conversion for ${filePath}:`);
      console.log('----------------------------------------');
      console.log(result.code);
      console.log('----------------------------------------');
      console.log(`Preview complete for: ${filePath} -> ${outputPath}`);
      return true;
    }

    // Write the converted JavaScript to the file
    fs.writeFileSync(outputPath, result.code, 'utf8');

    // Lint the file if linting is enabled
    if (options.lint && !options.preview) {
      const lintSuccess = await lintFile(outputPath);
      if (!lintSuccess) {
        console.warn(`Linting found errors in ${outputPath}`);
      }
    }

    // Delete the original file if not keeping originals
    if (!options.keepOriginal) {
      fs.unlinkSync(filePath);
    }

    console.log(`Successfully converted: ${outputPath}`);
    return true;
  } catch (error) {
    console.error(`Error converting ${filePath}: ${error.message}`);
    return false;
  }
}

async function backupDirectory(sourceDir) {
  const backupDir = `${sourceDir}_backup_${Date.now()}`;
  console.log(`Creating backup at: ${backupDir}`);

  try {
    await fsExtra.copy(sourceDir, backupDir);
    console.log(`Backup created successfully at: ${backupDir}`);
    return backupDir;
  } catch (error) {
    console.error(`Error creating backup: ${error.message}`);
    throw error;
  }
}

async function processDirectory(directory) {
  try {
    // Validate the directory exists
    if (!fs.existsSync(directory)) {
      console.error(`Directory does not exist: ${directory}`);
      process.exit(1);
    }

    // Find all .coffee files in the directory and subdirectories
    const files = await glob(`${directory}/**/*.coffee`);

    if (files.length === 0) {
      console.log('No CoffeeScript files found.');
      return;
    }

    if (options.preview) {
      console.log(`Preview mode: Found ${files.length} CoffeeScript files that would be converted:`);
      files.forEach((file, index) => {
        console.log(`${index + 1}. ${file} -> ${file.replace(/\.coffee$/, '.js')}`);
      });
      return;
    }

    // Create backup if enabled
    if (options.backup) {
      await backupDirectory(directory);
    } else {
      console.log('Skipping backup as --no-backup option was specified');
    }

    console.log(`Found ${files.length} CoffeeScript files to convert.`);

    // Process each file
    let successCount = 0;
    for (const file of files) {
      const success = await convertFile(file);
      if (success) successCount++;
    }

    console.log(`Conversion complete! ${successCount} of ${files.length} files converted successfully.`);
  } catch (error) {
    console.error(`Error processing directory: ${error.message}`);
    process.exit(1);
  }
}

async function main() {
  const absolutePath = path.resolve(targetPath);

  if (!fs.existsSync(absolutePath)) {
    console.error(`Path does not exist: ${absolutePath}`);
    process.exit(1);
  }

  console.log(`Processing path: ${absolutePath}`);
  console.log(`Options: ${JSON.stringify(options, null, 2)}`);

  const stats = fs.statSync(absolutePath);

  if (stats.isFile()) {
    // Process single file
    if (!absolutePath.endsWith('.coffee')) {
      console.error('The specified file is not a CoffeeScript file (.coffee)');
      process.exit(1);
    }
    await convertFile(absolutePath);
  } else if (stats.isDirectory()) {
    // Process directory
    await processDirectory(absolutePath);
  } else {
    console.error('The specified path is neither a file nor a directory');
    process.exit(1);
  }
}

// Run the script
main().catch(error => {
  console.error(error);
  process.exit(1);
});