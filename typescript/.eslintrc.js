module.exports = {
    parser: "@typescript-eslint/parser",
    parserOptions: {
        ecmaVersion: 2019,
        sourceType: "module",
        project: "tsconfig.json"
    },
    plugins: [
        "@typescript-eslint"
    ],
    extends: [
        "airbnb-typescript/base",
        "eslint:recommended",
        "plugin:@typescript-eslint/eslint-recommended",
        "plugin:@typescript-eslint/recommended"
    ],
    rules: {
        "max-classes-per-file": "off",
        "@typescript-eslint/indent": ["error", 4],
        "@typescript-eslint/quotes": ["error", "double", {"allowTemplateLiterals": true}],
        "comma-dangle": ["error", "never"],
        "no-console": "off",
        "class-methods-use-this": "off",
        "object-curly-newline": ["error", {
            "ObjectExpression": { "multiline": true, "minProperties": 3, "consistent": true},
            "ObjectPattern": { "multiline": true },
            "ImportDeclaration": { "multiline": true, "minProperties": 5, "consistent": true},
            "ExportDeclaration": { "multiline": true, "minProperties": 3 }
        }],
        "prefer-destructuring": "off",
        "@typescript-eslint/brace-style": ["error", "stroustrup"],
        "object-shorthand": ["error", "consistent-as-needed"],
        // Lambda requires the handler to be exported without default
        "import/prefer-default-export": "off",
        "quote-props": ["error", "consistent-as-needed"],
        "operator-linebreak": ["error", "after"],
        "no-plusplus": "off",
        "@typescript-eslint/lines-between-class-members": ["error", "always", { exceptAfterSingleLine: true }],
        "import/extensions": ["error", "ignorePackages", {
            "js": "never",
            "ts": "never"
        }],
        "no-param-reassign": ["error", { "props": false }],
        "@typescript-eslint/space-before-function-paren": ["error", "never"],
        "import/no-extraneous-dependencies": ["error", {"packageDir": ['./']}]
    },
}