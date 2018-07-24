const path = require('path')
const nodeExternals = require('webpack-node-externals')
const copy = require('copy-webpack-plugin')

module.exports = (env) => ({
  mode: "development",
  entry: './src/index.ts',
  output: {
    filename: 'bundle.js',
    path: path.resolve(__dirname, 'dist')
  },
  target: 'node',
  externals: [nodeExternals()],
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      }
    ]
  },
  plugins: [
    new copy([
      { from: 'web' },
    ])
  ],  // node: {
  //   fs: 'empty',
  //   net: 'empty',
  //   child_process: 'empty'
  // },
  // module: {
  //   noParse: [/aws-sdk.js/]
  // },
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  }
})