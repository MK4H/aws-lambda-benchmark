const path = require("path")
const objectHash = require('object-hash');


const eslintCacheIdentifier = objectHash(require("./.eslintrc.js"));

module.exports = {
    entry: path.resolve(__dirname, "src", "handler.ts"),
    output: {
        path: path.resolve(__dirname, "publish"),
        filename: "handler.js",
        libraryTarget: 'commonjs'
    },
    target: "node",
    mode: "production",
    module: {
        rules: [
            {
				test: /\.ts$/,
				loader: "ts-loader",
				exclude: /node_modules/,
            },
            {
                test: /\.ts$/,
                loader: "eslint-loader",
                exclude: /node_modules/,
                options: {
                    cache: true,
                    cacheIdentifer: eslintCacheIdentifier,
                    emitError: true,
                    emitWarning: true,
                    failOnError: true,
                    failOnWarning: false
                },
            }
		],
    },
    externals: /aws-sdk.*/i,
    resolve: {
        extensions: [".ts", ".js"]
    }
}