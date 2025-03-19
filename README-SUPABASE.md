# Supabase Integration for Moon AI Trading Platform

This guide explains how to connect your Supabase database to the Moon AI Trading Platform frontend.

## Files Overview

- `supabase-integration.js`: JavaScript module that provides functions for interacting with Supabase
- `supabase-demo.html`: Simple demo showing how to use the Supabase integration
- `revol`:utionary-platform-supabase.html The main trading platform frontend

## Setup Instructions

### 1. Supabase Configuration

The `supabase-integration.js` file is already configured with your Supabase credentials:

```javascript
// Supabase credentials from .env file
const SUPABASE_URL = 'https://ieenpdvsgzfmygpejdth.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW5wZHZzZ3pmbXlncGVqZHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNDM4NzYsImV4cCI6MjA1NTcxOTg3Nn0.fhtZBitpJzOO5woa0QBy_TEFDwjkrVwneTYX4x2SPtg';
```

If you need to change these credentials, update them in the `supabase-integration.js` file.

### 2. Testing the Connection

You can test the connection to your Supabase database using the `supabase-demo.html` file:

1. Open the `supabase-demo.html` file in a web browser
2. Click the "Check Connection" button to verify the connection to Supabase
3. Try the other buttons to test different Supabase functions

### 3. Integrating with the Trading Platform

The `revolutionary-platform-supabase.html` file is already set up to use the `supabase-integration.js` module. The integration happens in the script section:

```javascript
// Import functions from supabase-integration.js
import {
  supabaseClient,
  signUp,
  signIn,
  signOut,
  onAuthStateChange,
  getMarketData,
  convertCandlestickData,
  subscribeToMarketData,
  getWatchlists,
  getSocialSentiment,
  getNews,
  getPrediction
} from './supabase-integration.js';
```

## Available Functions

The `supabase-integration.js` module provides the following functions:

### Authentication

- `signUp(email, password)`: Register a new user
- `signIn(email, password)`: Log in an existing user
- `signOut()`: Log out the current user
- `onAuthStateChange(callback)`: Subscribe to auth state changes
- `getCurrentUser()`: Get the current user

### Data Operations

- `getMarketData(symbol, timeframe)`: Fetch market data for a symbol and timeframe
- `convertCandlestickData(data)`: Convert API data to format needed for chart
- `subscribeToMarketData(symbol, callback)`: Subscribe to real-time market data updates
- `getWatchlists(userId)`: Get user watchlists
- `getSocialSentiment(symbol)`: Get social sentiment data for a symbol
- `getNews(symbol, limit)`: Get news articles for a symbol
- `getPrediction(symbol, horizon)`: Get AI prediction for a symbol
- `saveUserPreferences(preferences)`: Save user preferences
- `getUserPreferences()`: Get user preferences
- `checkConnection()`: Check if Supabase connection is healthy

## Database Setup

The Supabase integration requires specific tables to be set up in your Supabase database. We've provided a SQL script to create these tables and add sample data.

### Setting Up the Database

1. Log in to your Supabase dashboard at https://app.supabase.com/
2. Select your project
3. Go to the SQL Editor
4. Copy the contents of the `supabase-setup.sql` file or upload the file directly
5. Run the SQL script to create the necessary tables and sample data

Alternatively, you can use the Supabase CLI to run the script:

```bash
supabase db execute --file supabase-setup.sql
```

### Database Schema

The script creates the following tables:

1. `market_data`: Stores market data for different symbols
   - `symbol`: Stock symbol (e.g., 'AAPL')
   - `interval`: Data interval (e.g., '1h', '1d')
   - `timestamp`: Timestamp for the data point
   - `open`, `high`, `low`, `close`: Price data
   - `volume`: Trading volume

2. `social_sentiment`: Stores social media sentiment data
   - `symbol`: Stock symbol
   - `timestamp`: Timestamp for the sentiment data
   - `score`: Overall sentiment score
   - `bullish`, `bearish`, `neutral`: Percentage of each sentiment
   - `total_mentions`: Total mentions on social media

3. `news`: Stores news articles
   - `symbol`: Related stock symbol
   - `title`: News article title
   - `source`: News source
   - `published_at`: Publication timestamp
   - `summary`: Article summary

4. `ai_predictions`: Stores AI-generated predictions
   - `symbol`: Stock symbol
   - `horizon`: Prediction time horizon (e.g., '1d', '7d')
   - `timestamp`: When the prediction was made
   - `target_price`: Predicted price
   - `confidence`: Confidence level
   - `resistance`, `support`: Technical levels
   - `reasoning`: Explanation for the prediction

5. `user_profiles`: Stores user profile information
   - `user_id`: User ID from auth
   - `email`: User email
   - `created_at`: Account creation timestamp
   - `last_login`: Last login timestamp

6. `watchlists`: Stores user watchlists
   - `id`: Watchlist ID
   - `user_id`: User ID
   - `name`: Watchlist name
   - `created_at`: Creation timestamp

7. `watchlist_items`: Stores items in watchlists
   - `id`: Item ID
   - `watchlist_id`: Watchlist ID
   - `symbol`: Stock symbol
   - `added_at`: When the item was added

8. `user_preferences`: Stores user preferences
   - `user_id`: User ID
   - `preferences`: JSON object with preferences
   - `updated_at`: Last update timestamp

9. `health_check`: Simple table for connection testing
   - `id`: Record ID
   - `status`: Status text (e.g., 'ok')
   - `checked_at`: Timestamp of the check

### Sample Data

The script also inserts sample data for testing:

- Market data for AAPL (5 hourly candles)
- Social sentiment data for AAPL
- News articles for AAPL
- AI prediction for AAPL

### Row Level Security (RLS)

The script sets up Row Level Security policies to protect your data:

- Public tables (market_data, social_sentiment, news, ai_predictions) allow read access to all users
- Private tables (user_profiles, watchlists, watchlist_items, user_preferences) restrict access to the owner of the data

## Testing the Connection

### Using the Local Server (Recommended)

Due to browser security restrictions, you may encounter issues when opening the HTML files directly from the filesystem. To avoid these issues, you can use the included local server:

1. Make sure you have Node.js installed on your system
2. Run the server script:
   ```bash
   # Make the script executable (if not already)
   chmod +x start-server.sh
   
   # Start the server
   ./start-server.sh
   ```
3. Open your browser and navigate to `http://localhost:3000`
4. Click on `test-connection.html` to run the connection test
5. The test will:
   - Verify the connection to Supabase
   - List available tables
   - Check the database schema
   - Verify sample data exists

This test will help identify any issues with your Supabase setup before trying to use the main application.

### Opening Files Directly (Alternative)

If you prefer to open the files directly:

1. Open `test-connection.html` in a web browser
2. Click the "Run Connection Test" button

Note: This method may not work in all browsers due to security restrictions when loading JavaScript modules from the filesystem.

## Installation

You can install the Supabase integration files into your Moon AI Platform project using the provided script:

```bash
# Make the script executable (if not already)
chmod +x copy-to-project.sh

# Run the script
./copy-to-project.sh
```

This will copy the following files to the `../../anthro-project/moon-ai-platform/frontend` directory:
- `supabase-integration.js`
- `test-supabase-connection.js`
- `test-connection.html`
- `README-SUPABASE.md`

## Running the Application

To run the application:

1. Make sure all files are in the same directory
2. Open `revolutionary-platform-supabase.html` in a web browser
3. The application will connect to Supabase and load data

Alternatively, you can use the simpler demo:

1. Open `supabase-demo.html` in a web browser
2. Use the buttons to test different Supabase functions

## Troubleshooting

If you encounter issues:

1. Run the connection test using `test-connection.html` to identify specific problems
2. Check the browser console for error messages
3. Verify your Supabase credentials are correct
4. Ensure your Supabase database has the required tables
5. Check that you have the necessary permissions set up in Supabase

## Security Considerations

- The Supabase anon key is exposed in the frontend code. This is acceptable for development but for production, consider using environment variables or a backend proxy.
- Ensure your Supabase Row Level Security (RLS) policies are properly configured to protect your data.
