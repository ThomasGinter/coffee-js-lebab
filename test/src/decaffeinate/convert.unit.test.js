const { expect } = require('chai');
const sinon = require('sinon');
const mockFs = require('mock-fs');
const { ESLint } = require('eslint');
const fs = require('fs');

const proxyquire = require('proxyquire');

// Create stubs
const decaffeinateStub = {
    convert: sinon.stub().returns({
        code: 'console.log("Hello, World");'
    })
};

// Import module with stubs
const convertModule = proxyquire('../../../src/decaffeinate/convert', {
    'decaffeinate': decaffeinateStub
});
const { lintFile, convertFile } = convertModule;

describe('CoffeeScript Conversion Module', () => {
    let eslintStub, eslintInstanceStub, optionsMock;

    beforeEach(() => {
        mockFs({
            'test.coffee': 'console.log "Hello, World"',
            'test.js': ''
        });

        // Create stubbed ESLint instance for reuse
        eslintInstanceStub = sinon.createStubInstance(ESLint);
        eslintStub = eslintInstanceStub.lintFiles.resolves([
            {
                filePath: 'test.js',
                errorCount: 0,
                warningCount: 0,
                messages: [],
            },
        ]);

        eslintInstanceStub.loadFormatter.resolves({
            format: sinon.stub().returns(''),
        });

        sinon.stub(ESLint, 'outputFixes').resolves();

        // Mock options as actual convert.js would produce
        optionsMock = {
            fix: false,
            lint: true,
            keepOriginal: false,
            preview: false
        };

        // Reset the stub counter
        decaffeinateStub.convert.resetHistory();

    });

    afterEach(() => {
        sinon.restore();
        mockFs.restore();
    });

    describe('lintFile', () => {
        it('should successfully lint a JavaScript file without errors', async () => {
            const result = await lintFile('test.js', eslintInstanceStub, optionsMock);
            expect(eslintStub.calledOnce).to.be.true;
            expect(result).to.be.true;
        });

        it('should report failure if ESLint finds errors', async () => {
            eslintStub.resolves([
                {
                    filePath: 'test.js',
                    errorCount: 1,
                    warningCount: 0,
                    messages: [{ severity: 2, message: 'Unexpected error' }],
                },
            ]);

            const result = await lintFile('test.js', eslintInstanceStub, optionsMock);
            expect(eslintStub.calledOnce).to.be.true;
            expect(result).to.be.false;
        });

        it('should log formatter output when lint issues are found', async () => {
            eslintStub.resolves([
                {
                    filePath: 'test.js',
                    errorCount: 0,
                    warningCount: 1,
                    messages: [{ severity: 1, message: 'Just a warning' }],
                },
            ]);

            eslintInstanceStub.loadFormatter.resolves({
                format: sinon.stub().returns('Formatted output')
            });

            const consoleLogStub = sinon.stub(console, 'log');
            await lintFile('test.js', eslintInstanceStub, optionsMock);
            expect(consoleLogStub.calledWith('Formatted output')).to.be.true;
            consoleLogStub.restore();
        });
    });

    describe('convertFile', () => {
        it('should read a CoffeeScript file and convert to JavaScript', async () => {
            const readStub = sinon.spy(fs, 'readFileSync');
            await convertFile('test.coffee', optionsMock, eslintInstanceStub);
            expect(readStub.calledOnceWith('test.coffee', 'utf8')).to.be.true;
            expect(decaffeinateStub.convert.calledOnce).to.be.true;

            const outputExists = fs.existsSync('test.js');
            expect(outputExists).to.be.true;
            const outputContent = fs.readFileSync('test.js', 'utf8');
            expect(outputContent).to.equal('console.log("Hello, World");');

            readStub.restore();
        });

        it('should handle syntax pre-processing before conversion', async () => {
            const coffeeContent = '.then (result) ->\n    debugger\n';
            fs.writeFileSync('test.coffee', coffeeContent);

            await convertFile('test.coffee', optionsMock, eslintInstanceStub);
            expect(decaffeinateStub.convert.calledOnce).to.be.true;
        });

        it('should remove original file unless keepOriginal is true', async () => {
            await convertFile('test.coffee', optionsMock, eslintInstanceStub);
            const originalExists = fs.existsSync('test.coffee');
            expect(originalExists).to.be.false;
        });

        it('should keep original file if keepOriginal option is true', async () => {
            optionsMock.keepOriginal = true;
            await convertFile('test.coffee', optionsMock, eslintInstanceStub);
            const originalExists = fs.existsSync('test.coffee');
            expect(originalExists).to.be.true;
        });
    });
});