# grok-js-lebab
This node.js project uses Grok to update ES5 javascript files to ES2024.  It works on a directory level, first creating a backup, then overwriting each .js file with the converted result one at a time.

## Usage

### Environment Variables

MacOS/Linux

export XAI_API_KEY='your_api_key_here'
export XAI_MODEL='grok-2-1212'  # Optional, defaults to this if unset

Windows

set XAI_API_KEY=your_api_key_here
set XAI_MODEL=grok-2-1212  # Optional, defaults to this if unset

### Command

node convert.js <directory>
