import http.server
import socketserver
import json
import os
import sys

# Change directory to the script's directory to serve files correctly
os.chdir(os.path.dirname(os.path.abspath(__file__)))

PORT = 8000
MAPS_DIR = 'maps'

class GameRequestHandler(http.server.SimpleHTTPRequestHandler):
    def do_GET(self):
        # API: Get all maps
        if self.path == '/api/maps':
            maps = {}
            if os.path.exists(MAPS_DIR):
                for filename in os.listdir(MAPS_DIR):
                    if filename.endswith('.json'):
                        map_name = filename[:-5] # remove .json
                        try:
                            with open(os.path.join(MAPS_DIR, filename), 'r', encoding='utf-8') as f:
                                maps[map_name] = json.load(f)
                        except Exception as e:
                            print(f"Error loading map {filename}: {e}")
            
            self.send_response(200)
            self.send_header('Content-Type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps(maps).encode('utf-8'))
            return

        # Default static file serving
        super().do_GET()

    def do_DELETE(self):
        # API: Delete map
        if self.path.startswith('/api/maps'):
            try:
                # Parse query params or just take the name from the query string ?name=...
                # Simpler: Expect {"name": "mapname"} in body or handle url parsing
                # Let's use reading body for consistency with POST, or query param. 
                # Query param is standard for DELETE usually.
                
                from urllib.parse import urlparse, parse_qs
                query = parse_qs(urlparse(self.path).query)
                map_name = query.get('name', [None])[0]
                
                if not map_name:
                    content_length = int(self.headers['Content-Length'])
                    if content_length > 0:
                        body = self.rfile.read(content_length).decode('utf-8')
                        data = json.loads(body)
                        map_name = data.get('name')

                if not map_name:
                     raise ValueError("No map name provided")

                # Sanitize
                safe_name = "".join([c for c in map_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
                file_path = os.path.join(MAPS_DIR, f"{safe_name}.json")

                if os.path.exists(file_path):
                    os.remove(file_path)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "success", "message": f"Map '{safe_name}' deleted"}).encode('utf-8'))
                else:
                    self.send_error(404, "Map not found")
            
            except Exception as e:
                print(f"Error deleting map: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
        
        # API: Get rigging data
        if self.path == '/api/rig':
            rig_path = 'hand_rig.json'
            if os.path.exists(rig_path):
                try:
                    with open(rig_path, 'r', encoding='utf-8') as f:
                        data = json.load(f)
                    self.send_response(200)
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps(data).encode('utf-8'))
                except Exception as e:
                    self.send_error(500, str(e))
            else:
                # Return empty default
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({}).encode('utf-8'))
            return

        self.send_error(404)

    def do_POST(self):
        # API: Save rigging data
        if self.path == '/api/rig':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                rig_data = json.loads(post_data.decode('utf-8'))
                with open('hand_rig.json', 'w', encoding='utf-8') as f:
                    json.dump(rig_data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": "Rig saved"}).encode('utf-8'))
            except Exception as e:
                self.send_error(500, str(e))
            return

        # API: Save map
        if self.path == '/api/maps':
            content_length = int(self.headers['Content-Length'])
            post_data = self.rfile.read(content_length)
            
            try:
                map_data = json.loads(post_data.decode('utf-8'))
                map_name = map_data.get('name')
                
                if not map_name:
                    raise ValueError("No map name provided")
                
                # Sanitize filename (basic)
                safe_name = "".join([c for c in map_name if c.isalpha() or c.isdigit() or c in (' ', '-', '_')]).strip()
                if not safe_name:
                    raise ValueError("Invalid map name")

                if not os.path.exists(MAPS_DIR):
                    os.makedirs(MAPS_DIR)

                file_path = os.path.join(MAPS_DIR, f"{safe_name}.json")
                
                # Check if exists (Prevent Overwrite)
                if os.path.exists(file_path):
                    self.send_response(409) # Conflict
                    self.send_header('Content-Type', 'application/json')
                    self.end_headers()
                    self.wfile.write(json.dumps({"status": "error", "message": "Map with this name already exists"}).encode('utf-8'))
                    return
                
                with open(file_path, 'w', encoding='utf-8') as f:
                    json.dump(map_data, f, ensure_ascii=False, indent=2)
                
                self.send_response(200)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": f"Map '{safe_name}' saved"}).encode('utf-8'))
                
            except Exception as e:
                print(f"Error saving map: {e}")
                self.send_response(500)
                self.send_header('Content-Type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": str(e)}).encode('utf-8'))
            return
            
        self.send_error(404)

print(f"Starting Game Server on port {PORT}...")
print(f"Maps directory: {os.path.abspath(MAPS_DIR)}")

# Allow address reuse to prevent "Address already in use" errors on restart
socketserver.TCPServer.allow_reuse_address = True

with socketserver.TCPServer(("", PORT), GameRequestHandler) as httpd:
    try:
        # Open browser in a separate thread after a slight delay
        def open_browser():
            import time
            import webbrowser
            time.sleep(1.5) # Wait for server to start
            webbrowser.open(f'http://localhost:{PORT}')
            print("Browser tab opened!")

        import threading
        threading.Thread(target=open_browser, daemon=True).start()

        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\nShutting down server...")
        httpd.shutdown()
