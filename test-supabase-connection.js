// Test script for Supabase connection
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.38.4/+esm';

// Supabase credentials
const SUPABASE_URL = 'https://ieenpdvsgzfmygpejdth.supabase.co';
const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImllZW5wZHZzZ3pmbXlncGVqZHRoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDAxNDM4NzYsImV4cCI6MjA1NTcxOTg3Nn0.fhtZBitpJzOO5woa0QBy_TEFDwjkrVwneTYX4x2SPtg';

// Create Supabase client
const supabaseClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// Function to test connection
async function testConnection() {
  console.log('Testing connection to Supabase...');
  
  try {
    // Try to fetch a single row from the health_check table first
    // This is a simpler table that should exist for basic connection testing
    const { data: healthData, error: healthError } = await supabaseClient
      .from('health_check')
      .select('*')
      .limit(1);
    
    if (!healthError && healthData && healthData.length > 0) {
      console.log('✅ Connection successful!');
      console.log('Health check data:', healthData);
      return true;
    }
    
    // If health_check table doesn't exist, try market_data as a fallback
    const { data, error } = await supabaseClient
      .from('market_data')
      .select('*')
      .limit(1);
    
    if (error) {
      console.error('❌ Connection test failed:', error.message);
      
      // Check if the error is because the table doesn't exist
      if (error.message.includes('does not exist')) {
        console.error('The required tables do not exist in your Supabase database.');
        console.error('Please run the supabase-setup.sql script to create the necessary tables.');
      }
      
      return false;
    }
    
    console.log('✅ Connection successful!');
    console.log('Data sample:', data);
    return true;
  } catch (err) {
    console.error('❌ Connection test failed with exception:', err.message);
    return false;
  }
}

// Function to list available tables
async function listTables() {
  console.log('\nListing available tables...');
  
  try {
    const { data, error } = await supabaseClient
      .rpc('list_tables');
    
    if (error) {
      console.error('❌ Failed to list tables:', error.message);
      return;
    }
    
    if (data && data.length > 0) {
      console.log('Available tables:');
      data.forEach(table => {
        console.log(`- ${table}`);
      });
    } else {
      console.log('No tables found or you do not have permission to view them.');
    }
  } catch (err) {
    console.error('❌ Failed to list tables with exception:', err.message);
    
    // Fallback: try to query specific tables we expect to exist
    console.log('\nTrying to check specific tables...');
    const tables = [
      'market_data',
      'social_sentiment',
      'news',
      'ai_predictions',
      'user_profiles',
      'watchlists',
      'watchlist_items',
      'user_preferences'
    ];
    
    for (const table of tables) {
      try {
        const { data, error } = await supabaseClient
          .from(table)
          .select('count(*)')
          .limit(1);
        
        if (!error) {
          console.log(`✅ Table '${table}' exists`);
        } else {
          console.log(`❌ Table '${table}' not found or not accessible`);
        }
      } catch (tableErr) {
        console.log(`❌ Error checking table '${table}':`, tableErr.message);
      }
    }
  }
}

// Function to check database schema
async function checkSchema() {
  console.log('\nChecking database schema...');
  
  const tables = [
    'market_data',
    'social_sentiment',
    'news',
    'ai_predictions',
    'user_profiles',
    'watchlists',
    'watchlist_items',
    'user_preferences'
  ];
  
  for (const table of tables) {
    try {
      // Try to get column information
      const { data, error } = await supabaseClient
        .rpc('get_table_columns', { table_name: table });
      
      if (error) {
        console.error(`❌ Failed to get columns for '${table}':`, error.message);
        continue;
      }
      
      if (data && data.length > 0) {
        console.log(`\nTable '${table}' columns:`);
        data.forEach(column => {
          console.log(`- ${column.column_name} (${column.data_type})`);
        });
      } else {
        console.log(`No columns found for table '${table}' or you do not have permission.`);
      }
    } catch (err) {
      console.error(`❌ Error checking schema for '${table}':`, err.message);
    }
  }
}

// Function to check for sample data
async function checkSampleData() {
  console.log('\nChecking for sample data...');
  
  const tables = [
    'market_data',
    'social_sentiment',
    'news',
    'ai_predictions'
  ];
  
  for (const table of tables) {
    try {
      const { data, error, count } = await supabaseClient
        .from(table)
        .select('*', { count: 'exact' })
        .limit(1);
      
      if (error) {
        console.error(`❌ Failed to check data in '${table}':`, error.message);
        continue;
      }
      
      if (count > 0) {
        console.log(`✅ Table '${table}' has data (${count} rows)`);
        console.log(`Sample:`, data[0]);
      } else {
        console.log(`⚠️ Table '${table}' appears to be empty`);
      }
    } catch (err) {
      console.error(`❌ Error checking data for '${table}':`, err.message);
    }
  }
}

// Run all tests
async function runAllTests() {
  console.log('=== SUPABASE CONNECTION TEST ===');
  console.log('URL:', SUPABASE_URL);
  
  const isConnected = await testConnection();
  
  if (isConnected) {
    await listTables();
    await checkSchema();
    await checkSampleData();
    
    console.log('\n=== TEST SUMMARY ===');
    console.log('✅ Connection to Supabase successful');
    console.log('You can now use the supabase-integration.js module in your application.');
  } else {
    console.log('\n=== TEST SUMMARY ===');
    console.log('❌ Connection to Supabase failed');
    console.log('Please check your credentials and network connection.');
  }
}

// Export the runAllTests function
export { runAllTests };

// Auto-run the tests if this script is executed directly
if (typeof window !== 'undefined' && !window.isImported) {
  runAllTests().catch(err => {
    console.error('Unhandled error during tests:', err);
  });
}
