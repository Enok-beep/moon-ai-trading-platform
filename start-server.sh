#!/bin/bash

# Script to start the local server for testing Supabase integration

echo "Starting local server for Supabase integration testing..."
echo "This will serve the HTML files on http://localhost:3001"

# Check if Node.js is installed
if ! command -v node &> /dev/null; then
    echo "Error: Node.js is not installed."
    echo "Please install Node.js to run this server."
    exit 1
fi

# Run the server
node serve-files.js

# This script will keep running until you press Ctrl+C to stop it
