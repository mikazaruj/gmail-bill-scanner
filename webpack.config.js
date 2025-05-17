const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const webpack = require('webpack');
const dotenv = require('dotenv');

// Load environment variables from .env.local
const env = dotenv.config({ path: '.env.local' }).parsed || {};

// Create our environment variables to be injected into the app
const envKeys = Object.keys(env).reduce((prev, next) => {
  prev[`process.env.${next}`] = JSON.stringify(env[next]);
  return prev;
}, {});

// Add NODE_ENV to the environment variables
envKeys['process.env.NODE_ENV'] = JSON.stringify(process.env.NODE_ENV || 'development');

module.exports = {
  mode: process.env.NODE_ENV === 'production' ? 'production' : 'development',
  entry: {
    popup: path.join(__dirname, "src/popup/index.tsx"),
    options: path.join(__dirname, "src/options/index.tsx"),
    background: path.join(__dirname, "src/background/index.ts"),
    content: path.join(__dirname, "src/content/index.ts"),
    // Include the PDF worker as a separate entry point
    'pdf-worker': path.join(__dirname, "src/workers/pdf-worker.js"),
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.(js|jsx|ts|tsx)$/,
        exclude: /node_modules/,
        use: [
          {
            loader: 'babel-loader',
            options: {
              presets: [
                '@babel/preset-env',
                '@babel/preset-react',
                '@babel/preset-typescript'
              ],
              plugins: []
            }
          }
        ]
      },
      {
        test: /\.css$/,
        use: [
          MiniCssExtractPlugin.loader,
          {
            loader: 'css-loader',
            options: {
              importLoaders: 1,
            },
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: [
                  'tailwindcss',
                  ['autoprefixer', {
                    grid: true,
                    flexbox: true
                  }],
                ],
              },
            },
          },
        ]
      },
      {
        test: /\.(png|jpg|jpeg|gif|svg)$/,
        type: 'asset/resource',
        generator: {
          filename: 'assets/[name][ext]'
        }
      }
    ]
  },
  plugins: [
    new webpack.DefinePlugin({
      ...envKeys,
      'process': JSON.stringify({
        env: {
          NODE_ENV: process.env.NODE_ENV || 'development',
          ...env
        }
      })
    }),
    new MiniCssExtractPlugin({
      filename: '[name].css'
    }),
    new CopyPlugin({
      patterns: [
        { 
          from: 'public/manifest.json',
          transform: (content) => {
            const manifest = JSON.parse(content.toString());
            if (manifest.oauth2 && manifest.oauth2.client_id) {
              manifest.oauth2.client_id = process.env.GOOGLE_CLIENT_ID || 'YOUR_CLIENT_ID';
            }
            return JSON.stringify(manifest, null, 2);
          }
        },
        { from: 'public/icon.svg', to: 'icon.svg' },
        { from: 'public/icon128.png', to: 'icon128.png' },
        // Copy PDF.js worker files - make sure we have both the .min.js version and the regular one
        { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.js', to: 'pdf.worker.min.js' },
        { from: 'node_modules/pdfjs-dist/build/pdf.worker.js', to: 'pdf.worker.js' },
        // Also copy to the build directory for Node.js compatible imports
        { from: 'node_modules/pdfjs-dist/build/pdf.worker.js', to: 'build/pdf.worker.js' },
        // Create a directory for PDF.js libraries that will be imported by the worker
        { from: 'node_modules/pdfjs-dist/build/pdf.min.js', to: 'lib/pdf.js' },
        { from: 'node_modules/pdfjs-dist/build/pdf.worker.min.js', to: 'lib/pdf.worker.js' },
        // Copy the PDF processor HTML and JS from public directory
        { from: 'public/pdf-processor.html', to: 'pdf-processor.html' },
        { from: 'public/pdf-processor-ui.js', to: 'pdf-processor-ui.js' },
        // Copy the offscreen PDF processor HTML
        { from: 'public/offscreen-pdf-processor.html', to: 'offscreen-pdf-processor.html' },
        // Copy local PDF.js files for CSP compliance
        { from: 'public/pdfjs/pdf.min.js', to: 'pdfjs/pdf.min.js' },
        { from: 'public/pdfjs/pdf.worker.min.js', to: 'pdfjs/pdf.worker.min.js' },
      ],
    }),
    // Use HtmlWebpackPlugin to generate HTML files - use different names to avoid conflicts
    new HtmlWebpackPlugin({
      template: './public/popup.html',
      filename: 'popup.html',
      chunks: ['popup'],
      cache: false,
      inject: true
    }),
    new HtmlWebpackPlugin({
      template: './public/options.html',
      filename: 'options.html',
      chunks: ['options'],
      cache: false,
      inject: true
    }),
  ],
  resolve: {
    extensions: ['.js', '.jsx', '.ts', '.tsx', '.css'],
    alias: {
      '~': path.resolve(__dirname, 'src'),
    }
  },
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
    // Disable code splitting for extension to avoid messaging issues
    splitChunks: false
  },
  devtool: process.env.NODE_ENV === 'production' ? false : 'inline-source-map'
}; 