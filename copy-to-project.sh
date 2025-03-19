#!/bin/bash

# Script to copy the Supabase integration files to the Moon AI Platform project

# Define source and destination directories
SOURCE_DIR="."
DEST_DIR="../../anthro-project/moon-ai-platform/frontend"

# Check if destination directory exists
if [ ! -d "$DEST_DIR" ]; then
  echo "Error: Destination directory $DEST_DIR does not exist."
  exit 1
fi

# Copy the supabase-integration.js file
echo "Copying supabase-integration.js to $DEST_DIR..."
cp "$SOURCE_DIR/supabase-integration.js" "$DEST_DIR/"

# Check if the copy was successful
if [ $? -eq 0 ]; then
  echo "✅ Successfully copied supabase-integration.js"
else
  echo "❌ Failed to copy supabase-integration.js"
  exit 1
fi

# Copy the test files (optional)
echo "Copying test files to $DEST_DIR..."
cp "$SOURCE_DIR/test-supabase-connection.js" "$DEST_DIR/"
cp "$SOURCE_DIR/test-connection.html" "$DEST_DIR/"

# Check if the copies were successful
if [ $? -eq 0 ]; then
  echo "✅ Successfully copied test files"
else
  echo "⚠️ Some test files may not have been copied"
fi

# Copy the server files (optional)
echo "Copying server files to $DEST_DIR..."
cp "$SOURCE_DIR/serve-files.js" "$DEST_DIR/"
cp "$SOURCE_DIR/start-server.sh" "$DEST_DIR/"

# Check if the copies were successful
if [ $? -eq 0 ]; then
  echo "✅ Successfully copied server files"
else
  echo "⚠️ Some server files may not have been copied"
fi

# Make the server script executable
chmod +x "$DEST_DIR/start-server.sh"

# Copy the README file (optional)
echo "Copying README-SUPABASE.md to $DEST_DIR..."
cp "$SOURCE_DIR/README-SUPABASE.md" "$DEST_DIR/"

# Check if the copy was successful
if [ $? -eq 0 ]; then
  echo "✅ Successfully copied README-SUPABASE.md"
else
  echo "⚠️ Failed to copy README-SUPABASE.md"
fi

echo ""
# Copy the SQL setup file
echo "Copying SQL setup file to $DEST_DIR..."
cp "$SOURCE_DIR/supabase-setup.sql" "$DEST_DIR/"

# Check if the copy was successful
if [ $? -eq 0 ]; then
  echo "✅ Successfully copied supabase-setup.sql"
else
  echo "⚠️ Failed to copy supabase-setup.sql"
fi

echo "=== SUMMARY ==="
echo "Files copied to $DEST_DIR:"
echo "- supabase-integration.js"
echo "- test-supabase-connection.js"
echo "- test-connection.html"
echo "- serve-files.js"
echo "- start-server.sh"
echo "- supabase-setup.sql"
echo "- README-SUPABASE.md"
echo ""
echo "You can now use the Supabase integration in your Moon AI Platform project."
echo ""
echo "To test the connection to your Supabase database:"
echo "1. Navigate to the frontend directory: cd $DEST_DIR"
echo "2. Start the local server: ./start-server.sh"
echo "3. Open your browser and go to: http://localhost:3000"
echo "4. Click on test-connection.html to run the test"
