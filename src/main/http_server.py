import os
import cv2
import http.server
import socketserver
import io as python_io
from PIL import Image
import threading
from queue import Queue
import json
import psutil
from door_control import DoorControl

### HTTP Server Handler. ###

#Global variable to store the latest frame
latest_frame = None
gate_status  = None

# Global queue to communicate between HTTP server and main thread
command_queue = Queue()

#This class is to create a multi-threaded server that can handle multiple client requests concurrently
class ThreadedHTTPServer(socketserver.ThreadingMixIn, socketserver.TCPServer):
    allow_reuse_address = True
    daemon_threads      = True

class HTTPHandler(http.server.BaseHTTPRequestHandler):
    #On GET request
    def do_GET(self):
        #--- Main page request. ---
        if self.path == '/':
            self.send_response(200)
            self.send_header('Content-type', 'text/html')
            self.end_headers()
            #self.wfile.write(b'<html><body><img src="/stream" width="600" height="400"></body></html>')
            self.wfile.write(Read_Web_Page('../web/index.html'))

        #--- Camera stream request. ---
        elif self.path == '/stream':
            self.send_response(200)
            self.send_header('Content-type', 'multipart/x-mixed-replace; boundary=frame')
            self.end_headers()

            try:
                while True:
                    if latest_frame is not None:
                        _, jpeg = cv2.imencode('.jpg', latest_frame)
                        self.wfile.write(b'--frame\r\n')
                        self.send_header('Content-type', 'image/jpeg')
                        self.send_header('Content-length', len(jpeg))
                        self.end_headers()
                        self.wfile.write(jpeg.tobytes())
                        self.wfile.write(b'\r\n')

            except Exception as e:
                print(f"[-] Streaming error: {str(e)}")

        #--- SmartGate status request. ---
        elif self.path == '/status':
            self.send_response(200)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            status = get_jetson_status()
            self.wfile.write(json.dumps(status).encode('utf-8'))

        else:
            #Obtain any other web resources contained relatively within the 'web/' directory
            print('Obtaining static resources...')
            file_path = os.path.join('../web', self.path[1:])
            if os.path.exists(file_path):
                self.send_response(200)
                #Dictionary to set the Content-type header depending on file extension
                mime_types = {
                    '.css' : 'text/css',
                    '.js'  : 'application/javascript',
                    '.html': 'text/html',
                    '.jpg' : 'image/jpeg',
                    '.png' : 'image/png'
                }
                file_ext = os.path.splitext(file_path)[1]
                content_type = mime_types.get(file_ext, 'application/octet-stream')
                self.send_header('Content-type', content_type)
                self.end_headers()
                with open(file_path, 'rb') as file:
                    self.wfile.write(file.read())
            else:
                #Send 404. Requested content not found
                self.send_response(404)
                self.end_headers()
                self.wfile.write(b"<h1>[-] Error: File resource not found<h1>")

    def do_POST(self):
        content_length = int(self.headers['Content-Length'])
        post_data = self.rfile.read(content_length)

        try:
            data = json.loads(post_data.decode('utf-8'))
            command = data.get('command')

            if command in ['OPEN_DOOR', 'CLOSE_DOOR']:
                command_queue.put(command)
                self.send_response(200)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "success", "message": f"Command {command} received"}).encode('utf-8'))
            else:
                self.send_response(400)
                self.send_header('Content-type', 'application/json')
                self.end_headers()
                self.wfile.write(json.dumps({"status": "error", "message": "Invalid command"}).encode('utf-8'))
        except json.JSONDecodeError:
            self.send_response(400)
            self.send_header('Content-type', 'application/json')
            self.end_headers()
            self.wfile.write(json.dumps({"status": "error", "message": "Invalid JSON"}).encode('utf-8'))

#Set the frame to be passed to web server
def set_latest_frame(frame):
    global latest_frame
    latest_frame = frame

#Set the door_controller reference to read door status 
def set_door_controller_reference(door_controller : DoorControl):
    global gate_status
    gate_status = door_controller

#Obtain the statistics from the SmartGate (Jetson Nano and board)
def get_jetson_status():
    cpu_temp = psutil.sensors_temperatures()['thermal-fan-est'][0].current
    cpu_usage = psutil.cpu_percent()
    memory = psutil.virtual_memory()
    disk = psutil.disk_usage('/')

    door_state = "N/A"
    if gate_status.is_door_fully_closed():
        door_state = "Closed"
    elif gate_status.is_door_fully_open():
        door_state = "Open"

    return {
        "cpu_temperature": f"{cpu_temp:.1f}°C",
        "cpu_usage": f"{cpu_usage}%",
        "memory_usage": f"{memory.percent}%",
        "disk_usage": f"{disk.percent}%",
        "door_state" : door_state,
        "is_door_closing": gate_status.is_door_closing,
        "is_door_opening": gate_status.is_door_opening
    }

#Read HTML web page from file
def Read_Web_Page(html_path):
    try:
        with open(html_path, 'rb') as file:
            return file.read()
    except:
        return b"Error: File path could not be found"

#Initialize and run server listener
def Initialize_Server(server_config : dict) -> ThreadedHTTPServer:
    #with socketserver.TCPServer(("", port), HTTPHandler) as httpd:
    #    print('[+] Running server under port {port}')
    #    httpd.serve_forever()

    #Ensure to obtain port number from configuration. Default port would be '8000'
    port = server_config.get('port', 8000)

    server = ThreadedHTTPServer(("", port), HTTPHandler)
    print(f'[+] Running server under port {port}')
    server_thread = threading.Thread(target=server.serve_forever)
    server_thread.daemon = True
    server_thread.start()
    return server

def Shutdown_Server(server):
    print("[+] Shutting down the server...")
    server.shutdown()
    server.server_close()

def Fetch_Queued_Command():
    if not command_queue.empty():
        return command_queue.get()
    return None