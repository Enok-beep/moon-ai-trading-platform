// Simple HTTP server to serve the HTML files locally
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the directory name in ES modules
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = 3001;

// MIME types for different file extensions
const MIME_TYPES = {
  '.html': 'text/html',
  '.js': 'text/javascript',
  '.mjs': 'text/javascript',
  '.css': 'text/css',
  '.json': 'application/json',
  '.csv': 'text/csv',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
};

// Create the server
const server = http.createServer((req, res) => {
  console.log(`Request: ${req.method} ${req.url}`);
  
  // Get the file path
  let filePath = '.' + req.url;
  if (filePath === './') {
    // Serve index.html for the root path
    filePath = './index.html';
  }
  
  // Get the file extension
  const extname = path.extname(filePath);
  
  // Set the content type based on the file extension
  const contentType = MIME_TYPES[extname] || 'application/octet-stream';
  
  // Read the file
  fs.readFile(path.join(__dirname, filePath.substring(1)), (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        console.log(`File not found: ${filePath}`);
        
        // Check if we should serve one of our HTML files
        if (req.url === '/') {
          // Serve a directory listing
          fs.readdir(__dirname, (err, files) => {
            if (err) {
              res.writeHead(500);
              res.end('Error listing directory');
              return;
            }
            
            // Filter for HTML files
            const htmlFiles = files.filter(file => path.extname(file) === '.html');
            
            // Create a simple HTML page with links to the HTML files
            let html = `
            <!DOCTYPE html>
            <html>
            <head>
              <title>Supabase Integration Files</title>
              <style>
                body {
                  font-family: Arial, sans-serif;
                  max-width: 800px;
                  margin: 0 auto;
                  padding: 20px;
                  line-height: 1.6;
                }
                h1 {
                  color: #6c5ce7;
                }
                ul {
                  list-style-type: none;
                  padding: 0;
                }
                li {
                  margin-bottom: 10px;
                }
                a {
                  display: block;
                  padding: 10px 15px;
                  background-color: #6c5ce7;
                  color: white;
                  text-decoration: none;
                  border-radius: 5px;
                  transition: background-color 0.2s;
                }
                a:hover {
                  background-color: #a29bfe;
                }
                .description {
                  margin-top: 5px;
                  color: #666;
                }
              </style>
            </head>
            <body>
              <h1>Supabase Integration Files</h1>
              <p>Click on a file to open it:</p>
              <ul>
            `;
            
            // Add links to the HTML files with descriptions
            const descriptions = {
              'supabase-demo.html': 'A demo application to test Supabase integration functions',
              'test-connection.html': 'A tool to test your connection to Supabase',
              'revolutionary-platform-supabase.html': 'The main trading platform with Supabase integration'
            };
            
            htmlFiles.forEach(file => {
              const description = descriptions[file] || '';
              html += `
                <li>
                  <a href="${file}">${file}</a>
                  <div class="description">${description}</div>
                </li>
              `;
            });
            
            html += `
              </ul>
              <p>Server running at <a href="http://localhost:${PORT}" style="display: inline; padding: 2px 5px;">http://localhost:${PORT}</a></p>
            </body>
            </html>
            `;
            
            res.writeHead(200, { 'Content-Type': 'text/html' });
            res.end(html);
          });
          return;
        }
        
        // File not found
        res.writeHead(404);
        res.end('404 Not Found');
        return;
      }
      
      // Server error
      res.writeHead(500);
      res.end(`Server Error: ${err.code}`);
      return;
    }
    
    // Success
    res.writeHead(200, { 'Content-Type': contentType });
    res.end(content, 'utf-8');
  });
});

// Start the server
server.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}/`);
  console.log(`Available files:`);
  
  // List available HTML files
  fs.readdir(__dirname, (err, files) => {
    if (err) {
      console.error('Error listing directory:', err);
      return;
    }
    
    const htmlFiles = files.filter(file => path.extname(file) === '.html');
    htmlFiles.forEach(file => {
      console.log(`- http://localhost:${PORT}/${file}`);
    });
  });
});
