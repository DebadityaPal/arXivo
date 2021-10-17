module.exports = {
    parser: '@typescript-eslint/parser',
    plugins: ['svelte3', '@typescript-eslint'],
    parserOptions: {
        ecmaVersion: 2020,
        sourceType: 'module',
    },
    overrides: [
        {
            files: ['*.svelte'],
            processor: 'svelte3/svelte3',
        },
    ],
    extends: ['plugin:@typescript-eslint/recommended', 'prettier', 'plugin:prettier/recommended'],
    rules: {
        'no-prototype-builtins': 'error',
        '@typescript-eslint/no-var-requires': 'warn',
        'no-dupe-class-members': 'off',
        'no-unused-vars': 'off',
        '@typescript-eslint/no-unused-vars': ['error', { ignoreRestSiblings: true }],
        indent: ['off'],
        semi: ['error', 'always'],
        'new-cap': ['off'],
        'comma-dangle': ['warn', 'always-multiline'],
    },
    settings: {
        'svelte3/typescript': true,
        'svelte3/ignore-styles': () => true,
    },
};
