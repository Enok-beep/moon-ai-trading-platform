import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm';

// Supabase credentials from .env file
const SUPABASE_URL = 'https://ieenpdvsgzfmygpejdth.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW5wZHZzZ3pmbXlncGVqZHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNDM4NzYsImV4cCI6MjA1NTcxOTg3Nn0.fhtZBitpJzOO5woa0QBy_TEFDwjkrVwneTYX4x2SPtg';

// Create Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// User Authentication Functions
/**
 * Sign up a new user
 * @param {string} email - User's email address
 * @param {string} password - User's chosen password
 * @returns {Promise<object>} - Supabase auth response
 */
async function signUp(email, password) {
  try {
    console.log('Attempting to sign up with email:', email);
    
    const { data, error } = await supabaseClient.auth.signUp({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign up error:', error);
      console.error('Error details:', JSON.stringify(error));
      return { error };
    }
    
    console.log('Sign up successful, data:', data);
    
    // If successful, create user profile entry
    if (data?.user) {
      console.log('Creating user profile for user ID:', data.user.id);
      
      const { error: profileError } = await supabaseClient
        .from('user_profiles')
        .insert([{ 
          user_id: data.user.id,
          email: data.user.email,
          created_at: new Date().toISOString()
        }]);
        
      if (profileError) {
        console.error('Error creating user profile:', profileError);
        console.error('Profile error details:', JSON.stringify(profileError));
      } else {
        console.log('User profile created successfully');
      }
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected sign up error:', err);
    console.error('Error stack:', err.stack);
    return { data: null, error: { message: 'An unexpected error occurred: ' + err.message } };
  }
}

/**
 * Sign in an existing user
 * @param {string} email - User's email address
 * @param {string} password - User's password
 * @returns {Promise<object>} - Supabase auth response
 */
async function signIn(email, password) {
  try {
    console.log('Attempting to sign in with email:', email);
    
    const { data, error } = await supabaseClient.auth.signInWithPassword({
      email,
      password,
    });
    
    if (error) {
      console.error('Sign in error:', error);
      console.error('Error details:', JSON.stringify(error));
      return { error };
    }
    
    console.log('Sign in successful, data:', data);
    
    // Update last login time
    if (data?.user) {
      console.log('Updating last login time for user ID:', data.user.id);
      
      const { error: updateError } = await supabaseClient
        .from('user_profiles')
        .update({ last_login: new Date().toISOString() })
        .eq('user_id', data.user.id);
        
      if (updateError) {
        console.error('Error updating last login:', updateError);
        console.error('Update error details:', JSON.stringify(updateError));
      } else {
        console.log('Last login time updated successfully');
      }
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected sign in error:', err);
    console.error('Error stack:', err.stack);
    return { data: null, error: { message: 'An unexpected error occurred: ' + err.message } };
  }
}

/**
 * Sign out the current user
 * @returns {Promise<object>} - Supabase auth response
 */
async function signOut() {
  try {
    const { error } = await supabaseClient.auth.signOut();
    return { error };
  } catch (err) {
    console.error('Sign out error:', err);
    return { error: { message: 'An error occurred during sign out' } };
  }
}

/**
 * Subscribe to auth state changes
 * @param {Function} callback - Function to call on auth state change
 * @returns {Function} - Unsubscribe function
 */
function onAuthStateChange(callback) {
  return supabaseClient.auth.onAuthStateChange(callback);
}

/**
 * Get current user
 * @returns {Object|null} - Current user or null if not authenticated
 */
async function getCurrentUser() {
  try {
    console.log('Getting current user...');
    const { data, error } = await supabaseClient.auth.getUser();
    
    if (error) {
      console.error('Error getting current user:', error);
      console.error('Error details:', JSON.stringify(error));
      return null;
    }
    
    console.log('Current user data:', data);
    return data?.user || null;
  } catch (err) {
    console.error('Unexpected error getting current user:', err);
    console.error('Error stack:', err.stack);
    return null;
  }
}

// Data Fetching Functions
/**
 * Fetch market data for a symbol and timeframe
 * @param {string} symbol - Stock or asset symbol (e.g., 'AAPL')
 * @param {string} timeframe - Timeframe for data (e.g., '1d', '1w', '1m')
 * @returns {Promise<object>} - Market data response
 */
async function getMarketData(symbol, timeframe) {
  try {
    // Convert timeframe to appropriate interval for query
    const interval = convertTimeframeToInterval(timeframe);
    const limit = getDataLimitFromTimeframe(timeframe);
    
    const { data, error } = await supabaseClient
      .from('market_data')
      .select('*')
      .eq('symbol', symbol)
      .eq('interval', interval)
      .order('timestamp', { ascending: true })
      .limit(limit);
      
    if (error) {
      console.error('Error fetching market data:', error);
      return { data: [], error };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error fetching market data:', err);
    return { data: [], error: { message: 'Failed to fetch market data' } };
  }
}

/**
 * Convert API data to format needed for chart
 * @param {Array} data - Raw data from API
 * @returns {Array} - Formatted data for chart
 */
function convertCandlestickData(data) {
  if (!data || !Array.isArray(data)) return [];
  
  return data.map(candle => ({
    timestamp: new Date(candle.timestamp).getTime(),
    open: parseFloat(candle.open),
    high: parseFloat(candle.high),
    low: parseFloat(candle.low),
    close: parseFloat(candle.close),
    volume: parseInt(candle.volume, 10)
  }));
}

/**
 * Subscribe to real-time market data updates
 * @param {string} symbol - Stock or asset symbol
 * @param {Function} callback - Function to call on data update
 * @returns {Function} - Unsubscribe function
 */
function subscribeToMarketData(symbol, callback) {
  try {
    // Subscribe to the market_data table for real-time updates
    const subscription = supabaseClient
      .channel('market_data_updates')
      .on(
        'postgres_changes',
        {
          event: '*', // Listen for all events (INSERT, UPDATE, DELETE)
          schema: 'public',
          table: 'market_data',
          filter: `symbol=eq.${symbol}`,
        },
        (payload) => {
          callback(payload);
        }
      )
      .subscribe();
      
    // Return a function to unsubscribe
    return () => {
      supabaseClient.removeChannel(subscription);
    };
  } catch (err) {
    console.error('Error setting up real-time subscription:', err);
    // Return a no-op function so calling code doesn't break
    return () => {};
  }
}

/**
 * Get user watchlists
 * @param {string} userId - User ID (optional, uses current user if not provided)
 * @returns {Promise<object>} - Watchlists response
 */
async function getWatchlists(userId = null) {
  try {
    console.log('Getting watchlists...');
    
    // If userId not provided, use current user
    let user = userId;
    if (!user) {
      const currentUser = await getCurrentUser();
      user = currentUser?.id;
      console.log('Using current user ID:', user);
    }
    
    if (!user) {
      console.error('User not authenticated');
      return { data: [], error: { message: 'User not authenticated' } };
    }
    
    const { data, error } = await supabaseClient
      .from('watchlists')
      .select(`
        id,
        name,
        created_at,
        watchlist_items (
          id,
          symbol,
          added_at
        )
      `)
      .eq('user_id', user);
      
    if (error) {
      console.error('Error fetching watchlists:', error);
      console.error('Error details:', JSON.stringify(error));
      return { data: [], error };
    }
    
    console.log('Watchlists data:', data);
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error fetching watchlists:', err);
    console.error('Error stack:', err.stack);
    return { data: [], error: { message: 'Failed to fetch watchlists: ' + err.message } };
  }
}

/**
 * Get social sentiment data for a symbol
 * @param {string} symbol - Stock or asset symbol
 * @returns {Promise<object>} - Sentiment data response
 */
async function getSocialSentiment(symbol) {
  try {
    const { data, error } = await supabaseClient
      .from('social_sentiment')
      .select('*')
      .eq('symbol', symbol)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
      
    if (error) {
      console.error('Error fetching social sentiment:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error fetching social sentiment:', err);
    return { data: null, error: { message: 'Failed to fetch sentiment data' } };
  }
}

/**
 * Get news articles for a symbol
 * @param {string} symbol - Stock or asset symbol
 * @param {number} limit - Maximum number of articles to return
 * @returns {Promise<object>} - News data response
 */
async function getNews(symbol, limit = 5) {
  try {
    const { data, error } = await supabaseClient
      .from('news')
      .select('*')
      .eq('symbol', symbol)
      .order('published_at', { ascending: false })
      .limit(limit);
      
    if (error) {
      console.error('Error fetching news:', error);
      return { data: [], error };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error fetching news:', err);
    return { data: [], error: { message: 'Failed to fetch news' } };
  }
}

/**
 * Get AI prediction for a symbol
 * @param {string} symbol - Stock or asset symbol
 * @param {string} horizon - Prediction time horizon (e.g., '1d', '7d', '30d')
 * @returns {Promise<object>} - Prediction data response
 */
async function getPrediction(symbol, horizon = '7d') {
  try {
    const { data, error } = await supabaseClient
      .from('ai_predictions')
      .select('*')
      .eq('symbol', symbol)
      .eq('horizon', horizon)
      .order('timestamp', { ascending: false })
      .limit(1)
      .single();
      
    if (error) {
      console.error('Error fetching prediction:', error);
      return { data: null, error };
    }
    
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error fetching prediction:', err);
    return { data: null, error: { message: 'Failed to fetch prediction data' } };
  }
}

/**
 * Save user preferences
 * @param {Object} preferences - User preferences to save
 * @returns {Promise<object>} - Response from save operation
 */
async function saveUserPreferences(preferences) {
  try {
    console.log('Saving user preferences...');
    
    const user = await getCurrentUser();
    
    if (!user) {
      console.error('User not authenticated');
      return { error: { message: 'User not authenticated' } };
    }
    
    console.log('Saving preferences for user ID:', user.id);
    
    const { data, error } = await supabaseClient
      .from('user_preferences')
      .upsert({
        user_id: user.id,
        preferences: preferences,
        updated_at: new Date().toISOString()
      });
      
    if (error) {
      console.error('Error saving preferences:', error);
      console.error('Error details:', JSON.stringify(error));
      return { error };
    }
    
    console.log('Preferences saved successfully');
    return { data, error: null };
  } catch (err) {
    console.error('Unexpected error saving preferences:', err);
    console.error('Error stack:', err.stack);
    return { error: { message: 'Failed to save preferences: ' + err.message } };
  }
}

/**
 * Get user preferences
 * @returns {Promise<object>} - User preferences response
 */
async function getUserPreferences() {
  try {
    console.log('Getting user preferences...');
    
    const user = await getCurrentUser();
    
    if (!user) {
      console.error('User not authenticated');
      return { data: null, error: { message: 'User not authenticated' } };
    }
    
    console.log('Getting preferences for user ID:', user.id);
    
    const { data, error } = await supabaseClient
      .from('user_preferences')
      .select('preferences')
      .eq('user_id', user.id)
      .single();
      
    if (error) {
      console.error('Error fetching preferences:', error);
      console.error('Error details:', JSON.stringify(error));
      return { data: null, error };
    }
    
    console.log('Preferences data:', data);
    return { data: data?.preferences, error: null };
  } catch (err) {
    console.error('Unexpected error fetching preferences:', err);
    console.error('Error stack:', err.stack);
    return { data: null, error: { message: 'Failed to fetch preferences: ' + err.message } };
  }
}

// Helper Functions
/**
 * Convert UI timeframe to database interval
 * @param {string} timeframe - UI timeframe ('1d', '1w', etc.)
 * @returns {string} - Database interval
 */
function convertTimeframeToInterval(timeframe) {
  const mapping = {
    '1d': '1h',     // For 1 day view, use hourly data
    '1w': '4h',     // For 1 week view, use 4-hour data
    '1m': '1d',     // For 1 month view, use daily data
    '3m': '1d',     // For 3 month view, use daily data
    '1y': '1w',     // For 1 year view, use weekly data
    'all': '1m'     // For all time view, use monthly data
  };
  
  return mapping[timeframe] || '1d';
}

/**
 * Determine how many data points to fetch based on timeframe
 * @param {string} timeframe - UI timeframe
 * @returns {number} - Number of data points to fetch
 */
function getDataLimitFromTimeframe(timeframe) {
  const mapping = {
    '1d': 24,       // 24 hourly points for a day
    '1w': 42,       // 42 4-hour points for a week
    '1m': 30,       // 30 daily points for a month
    '3m': 90,       // 90 daily points for 3 months
    '1y': 52,       // 52 weekly points for a year
    'all': 120      // 120 monthly points for all time
  };
  
  return mapping[timeframe] || 50;
}

/**
 * Check if Supabase connection is healthy
 * @returns {Promise<boolean>} - True if connection is healthy
 */
async function checkConnection() {
  try {
    // Try to fetch a single row from the health_check table first
    const { data: healthData, error: healthError } = await supabaseClient
      .from('health_check')
      .select('status')
      .limit(1);
      
    if (!healthError && healthData && healthData.length > 0) {
      return true;
    }
    
    // If health_check table doesn't exist, try market_data as a fallback
    const { error } = await supabaseClient
      .from('market_data')
      .select('count(*)')
      .limit(1);
    
    if (error) {
      console.error('Connection health check failed:', error.message);
      
      // Check if the error is because the table doesn't exist
      if (error.message.includes('does not exist')) {
        console.error('The required tables do not exist in your Supabase database.');
        console.error('Please run the supabase-setup.sql script to create the necessary tables.');
      }
      
      return false;
    }
    
    return true;
  } catch (err) {
    console.error('Connection health check failed:', err);
    return false;
  }
}

// Export all functions
export {
  supabaseClient,
  signUp,
  signIn,
  signOut,
  onAuthStateChange,
  getCurrentUser,
  getMarketData,
  convertCandlestickData,
  subscribeToMarketData,
  getWatchlists,
  getSocialSentiment,
  getNews,
  getPrediction,
  saveUserPreferences,
  getUserPreferences,
  checkConnection
};
