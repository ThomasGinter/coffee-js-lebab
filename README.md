# coffee-js-lebab

This Node.js project uses Grok to modernize your codebase by converting older JavaScript or CoffeeScript files to modern JavaScript standards. It works on a directory level, creating a backup of the original files before performing conversions.

There are two conversion scripts available:

1. **`src/es5_es2024/convert.js`** - Converts ES5 JavaScript files to ES2024.
2. **`src/coffeescript1.2_es2023_commonjs/convert.js`** - Converts CoffeeScript 1.2 files to ES2023 JavaScript while maintaining CommonJS syntax.
3. **`src/decaffeinate/convert.js`** - Converts CoffeeScript files to JavaScript using the decaffeinate library.
4. **`src/coffee_javascript/convert.js`** - Converts CoffeeScript to JavaScript using LLMs (OpenAI, Grok, or Claude).

---

## Environment Variables

Both scripts require the `XAI_API_KEY` environment variable to be set with your Grok API key. Optionally, you can set `XAI_MODEL` to specify the Grok model to use (defaults to `grok-2-1212` if not set).

### MacOS/Linux

```bash
export XAI_API_KEY='your_api_key_here'
export XAI_MODEL='grok-2-1212'  # Optional, defaults to this if unset
```

### Windows

```cmd
set XAI_API_KEY=your_api_key_here
set XAI_MODEL=grok-2-1212  # Optional, defaults to this if unset
```

## Usage

### Converting from ES5 JavaScript to ES2024

```bash
node src/es5_es2024/convert.js /path/to/directory
```

What it does:
- Creates a backup of the target directory.
- Converts each `.js` file in the directory and its subdirectories from ES5 to ES2024.
- Overwrites the original `.js` files with the converted code.

### Converting from CoffeeScript 1.2 to ES2023 JavaScript

```bash
node src/coffeescript1.2_es2023_commonjs/convert.js /path/to/directory
```

What it does:
- Creates a backup of the target directory.
- Converts each `.coffee` file in the directory and its subdirectories to ES2023 JavaScript with CommonJS syntax.
- Saves the converted code as `.js` files and deletes the original `.coffee` files.

### Converting from CoffeeScript to JavaScript using decaffeinate

```bash
node src/decaffeinate/convert.js /path/to/file.coffee
# OR
node src/decaffeinate/convert.js /path/to/directory
```

What it does:


- Converts CoffeeScript files to JavaScript using the decaffeinate library
- Creates a backup of the target directory (if converting a directory) unless --no-backup is specified
- Saves the converted code as .js files and deletes the original .coffee files unless --keep-original is specified

```
Options:
--preserve-commonjs - Preserves CommonJS module syntax
--keep-original - Keeps the original CoffeeScript files
--no-backup - Skips backup creation for directory conversion
--preview - Previews conversion without writing files
--lint - Lints files after conversion
--fix - Automatically fixes linting issues when possible
--eslint-config <path> - Path to ESLint config file (defaults to .eslintrc.js)
```

### Converting from CoffeeScript to JavaScript using LLMs (OpenAI, Grok, or Claude)

```bash
node src/coffee_javascript/convert.js
```

What it does:


- Converts CoffeeScript to JavaScript using your choice of LLM (OpenAI, Grok, or Claude)
- Interactive prompts guide you through the conversion process
- Handles large files by intelligently breaking them into chunks
- Uses AST-based parsing with fallback to line-based chunking for complex files
- Saves converted code as .js files in the same directory structure
- Requirements:
  - Requires LLM_API_KEY environment variable to be set
  - May require additional prompt files (system.md and optionally user.md)