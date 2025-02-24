# grok-js-lebab

This Node.js project uses Grok to modernize your codebase by converting older JavaScript or CoffeeScript files to modern JavaScript standards. It works on a directory level, creating a backup of the original files before performing conversions.

There are two conversion scripts available:

1. **`src/es5_es2024/convert.js`** - Converts ES5 JavaScript files to ES2024.
2. **`src/coffeescript1.2_es2023_commonjs/convert.js`** - Converts CoffeeScript 1.2 files to ES2023 JavaScript while maintaining CommonJS syntax.

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
