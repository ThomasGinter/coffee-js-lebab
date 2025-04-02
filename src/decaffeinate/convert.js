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
    .option('--eslint-config <path>', 'Path to ESLint config file', 'eslint.config.cjs');

// Conversion options for decaffeinate
const decaffeinateOptions = {
  preferLet: false,
  loose: false,
  useJS: false
};

async function lintFile(filePath, eslint, options) {
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

    const hasErrors = results.some(result => result.errorCount > 0);
    return !hasErrors;
  } catch (error) {
    console.error(`Error linting ${filePath}: ${error.message}`);
    return false;
  }
}

async function convertFile(filePath, options, eslint) {
  try {
    console.log(`Converting: ${filePath}`);
    const coffeeSource = fs.readFileSync(filePath, 'utf8');

    const processedSource = coffeeSource.replace(
        /\.then\s*\(\s*\(([^)]*)\)\s*->\s*\n\s*debugger\s*\n/g,
        '.then(($1) => {\n  debugger;\n  return undefined;\n'
    ).replace(
        /\.catch\s*\(\s*\(([^)]*)\)\s*->\s*\n\s*debugger\s*\n/g,
        '.catch(($1) => {\n  debugger;\n  return undefined;\n'
    );

    const result = convert(processedSource, decaffeinateOptions);
    const outputPath = filePath.replace(/\.coffee$/, '.js');

    if (options.preview) {
      console.log(`\nPreview of conversion for ${filePath}:`);
      console.log('----------------------------------------');
      console.log(result.code);
      console.log('----------------------------------------');
      console.log(`Preview complete: ${filePath}`);
    } else {
      fs.writeFileSync(outputPath, result.code, 'utf8');
      console.log(`Converted file written: ${outputPath}`);

      if (options.lint && eslint) {
        await lintFile(outputPath, eslint, options);
      }
    }

    if (!options.keepOriginal && !options.preview) {
      fs.unlinkSync(filePath);
      console.log(`Original file removed: ${filePath}`);
    }

  } catch (error) {
    console.error(`Error converting ${filePath}: ${error.message}`);
  }
}

async function main() {
  // Conditional commander parsing and main execution logic goes here
  if (require.main === module) {
    program.parse(process.argv);
    const options = program.opts();
    const targetPath = program.args[0];
    const basePath = path.dirname(path.resolve(targetPath));

    process.chdir(basePath);

    if (options.preserveCommonjs) {
      decaffeinateOptions.useCS2 = false; // Ensures CommonJS is preserved
    }

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
                ...require('globals').node,
                ...require('globals').es2023
              }
            }
          }
        ],
        cwd: process.cwd()
      };

      if (options.eslintConfig && fs.existsSync(path.resolve(options.eslintConfig))) {
        eslintOptions.overrideConfigFile = path.resolve(options.eslintConfig);
      }

      eslint = new ESLint(eslintOptions);
    }

    let files = [];
    const fullTargetPath = path.resolve(targetPath);
    if (fs.statSync(fullTargetPath).isDirectory()) {
      files = await glob('**/*.coffee', {cwd: fullTargetPath, absolute: true});
      if (!options.noBackup && !options.preview) {
        const backupPath = `${fullTargetPath}_backup_${Date.now()}`;
        fsExtra.copySync(fullTargetPath, backupPath);
        console.log(`Backup created at: ${backupPath}`);
      }
    } else {
      files = [fullTargetPath];
    }

    for (const file of files) {
      await convertFile(file, options, eslint);
    }
  }
}

if(require.main === module) {
  main().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

module.exports = {
  lintFile,
  convertFile,
  decaffeinateOptions  // You might export config objects too, depending on your test design.
};