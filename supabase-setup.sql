-- Supabase Database Setup Script
-- This script creates the necessary tables for the Moon AI Trading Platform

-- Market Data Table
CREATE TABLE IF NOT EXISTS public.market_data (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    interval TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    open NUMERIC NOT NULL,
    high NUMERIC NOT NULL,
    low NUMERIC NOT NULL,
    close NUMERIC NOT NULL,
    volume INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS market_data_symbol_interval_idx ON public.market_data (symbol, interval);
CREATE INDEX IF NOT EXISTS market_data_timestamp_idx ON public.market_data (timestamp);

-- Social Sentiment Table
CREATE TABLE IF NOT EXISTS public.social_sentiment (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    score NUMERIC NOT NULL,
    bullish NUMERIC NOT NULL,
    bearish NUMERIC NOT NULL,
    neutral NUMERIC NOT NULL,
    total_mentions INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS social_sentiment_symbol_idx ON public.social_sentiment (symbol);
CREATE INDEX IF NOT EXISTS social_sentiment_timestamp_idx ON public.social_sentiment (timestamp);

-- News Table
CREATE TABLE IF NOT EXISTS public.news (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    title TEXT NOT NULL,
    source TEXT NOT NULL,
    published_at TIMESTAMPTZ NOT NULL,
    summary TEXT,
    url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS news_symbol_idx ON public.news (symbol);
CREATE INDEX IF NOT EXISTS news_published_at_idx ON public.news (published_at);

-- AI Predictions Table
CREATE TABLE IF NOT EXISTS public.ai_predictions (
    id SERIAL PRIMARY KEY,
    symbol TEXT NOT NULL,
    horizon TEXT NOT NULL,
    timestamp TIMESTAMPTZ NOT NULL,
    target_price NUMERIC NOT NULL,
    confidence NUMERIC NOT NULL,
    resistance NUMERIC,
    support NUMERIC,
    reasoning TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS ai_predictions_symbol_horizon_idx ON public.ai_predictions (symbol, horizon);
CREATE INDEX IF NOT EXISTS ai_predictions_timestamp_idx ON public.ai_predictions (timestamp);

-- User Profiles Table
CREATE TABLE IF NOT EXISTS public.user_profiles (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    email TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    last_login TIMESTAMPTZ,
    CONSTRAINT user_profiles_user_id_key UNIQUE (user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS user_profiles_user_id_idx ON public.user_profiles (user_id);

-- Watchlists Table
CREATE TABLE IF NOT EXISTS public.watchlists (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT watchlists_user_id_name_key UNIQUE (user_id, name)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS watchlists_user_id_idx ON public.watchlists (user_id);

-- Watchlist Items Table
CREATE TABLE IF NOT EXISTS public.watchlist_items (
    id SERIAL PRIMARY KEY,
    watchlist_id INTEGER NOT NULL REFERENCES public.watchlists(id) ON DELETE CASCADE,
    symbol TEXT NOT NULL,
    added_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT watchlist_items_watchlist_id_symbol_key UNIQUE (watchlist_id, symbol)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS watchlist_items_watchlist_id_idx ON public.watchlist_items (watchlist_id);

-- User Preferences Table
CREATE TABLE IF NOT EXISTS public.user_preferences (
    id SERIAL PRIMARY KEY,
    user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    preferences JSONB NOT NULL,
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    CONSTRAINT user_preferences_user_id_key UNIQUE (user_id)
);

-- Create index for faster queries
CREATE INDEX IF NOT EXISTS user_preferences_user_id_idx ON public.user_preferences (user_id);

-- Health Check Table (for connection testing)
CREATE TABLE IF NOT EXISTS public.health_check (
    id SERIAL PRIMARY KEY,
    status TEXT NOT NULL,
    checked_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert a record into the health check table
INSERT INTO public.health_check (status) VALUES ('ok') ON CONFLICT DO NOTHING;

-- Sample Data for Testing

-- Insert sample market data for AAPL
INSERT INTO public.market_data (symbol, interval, timestamp, open, high, low, close, volume)
VALUES 
('AAPL', '1h', NOW() - INTERVAL '5 HOUR', 180.25, 182.50, 179.75, 181.30, 1500000),
('AAPL', '1h', NOW() - INTERVAL '4 HOUR', 181.30, 183.20, 180.90, 182.75, 1350000),
('AAPL', '1h', NOW() - INTERVAL '3 HOUR', 182.75, 184.10, 182.40, 183.50, 1420000),
('AAPL', '1h', NOW() - INTERVAL '2 HOUR', 183.50, 183.90, 182.80, 183.20, 1280000),
('AAPL', '1h', NOW() - INTERVAL '1 HOUR', 183.20, 184.50, 183.00, 184.25, 1350000);

-- Insert sample social sentiment data for AAPL
INSERT INTO public.social_sentiment (symbol, timestamp, score, bullish, bearish, neutral, total_mentions)
VALUES 
('AAPL', NOW(), 0.75, 65, 15, 20, 5000);

-- Insert sample news data for AAPL
INSERT INTO public.news (symbol, title, source, published_at, summary, url)
VALUES 
('AAPL', 'Apple Announces New iPhone Model', 'Tech News', NOW() - INTERVAL '1 DAY', 'Apple has announced the latest iPhone model with improved features and performance.', 'https://example.com/news/apple-new-iphone'),
('AAPL', 'Apple Reports Strong Quarterly Earnings', 'Financial Times', NOW() - INTERVAL '2 DAY', 'Apple exceeded analyst expectations with strong quarterly earnings report.', 'https://example.com/news/apple-earnings');

-- Insert sample AI prediction for AAPL
INSERT INTO public.ai_predictions (symbol, horizon, timestamp, target_price, confidence, resistance, support, reasoning)
VALUES 
('AAPL', '7d', NOW(), 190.50, 85, 195.00, 185.00, 'Based on technical indicators and recent earnings report, AAPL is likely to continue its upward trend.');

-- Set up Row Level Security (RLS) policies

-- Enable RLS on tables
ALTER TABLE public.user_profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlists ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.watchlist_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;

-- Create policies for user_profiles
CREATE POLICY "Users can view their own profile"
  ON public.user_profiles FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update their own profile"
  ON public.user_profiles FOR UPDATE
  USING (auth.uid() = user_id);

-- Create policies for watchlists
CREATE POLICY "Users can view their own watchlists"
  ON public.watchlists FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own watchlists"
  ON public.watchlists FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own watchlists"
  ON public.watchlists FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own watchlists"
  ON public.watchlists FOR DELETE
  USING (auth.uid() = user_id);

-- Create policies for watchlist_items
CREATE POLICY "Users can view their own watchlist items"
  ON public.watchlist_items FOR SELECT
  USING (
    watchlist_id IN (
      SELECT id FROM public.watchlists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create their own watchlist items"
  ON public.watchlist_items FOR INSERT
  WITH CHECK (
    watchlist_id IN (
      SELECT id FROM public.watchlists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their own watchlist items"
  ON public.watchlist_items FOR UPDATE
  USING (
    watchlist_id IN (
      SELECT id FROM public.watchlists WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their own watchlist items"
  ON public.watchlist_items FOR DELETE
  USING (
    watchlist_id IN (
      SELECT id FROM public.watchlists WHERE user_id = auth.uid()
    )
  );

-- Create policies for user_preferences
CREATE POLICY "Users can view their own preferences"
  ON public.user_preferences FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can create their own preferences"
  ON public.user_preferences FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own preferences"
  ON public.user_preferences FOR UPDATE
  USING (auth.uid() = user_id);

-- Allow public access to market_data, social_sentiment, news, and ai_predictions
ALTER TABLE public.market_data ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_sentiment ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.news ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ai_predictions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.health_check ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow public read access to market_data"
  ON public.market_data FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Allow public read access to social_sentiment"
  ON public.social_sentiment FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Allow public read access to news"
  ON public.news FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Allow public read access to ai_predictions"
  ON public.ai_predictions FOR SELECT
  TO authenticated, anon
  USING (true);

CREATE POLICY "Allow public read access to health_check"
  ON public.health_check FOR SELECT
  TO authenticated, anon
  USING (true);
