const path = require('path')
const copy = require('copy-webpack-plugin')

module.exports = (env) => ({
  mode: "development",
  entry: './src/web.ts',
  output: {
    filename: 'client.js',
    path: path.resolve(__dirname, 'dist')
  },
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
  ],
  resolve: {
    extensions: ['.tsx', '.ts', '.js']
  }
})