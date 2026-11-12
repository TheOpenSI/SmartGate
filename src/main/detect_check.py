import time
import cv2
import imutils
from json_config import JsonConfig
from YoloDetTRT import YoloTRT

# Prints what the model detects in the live camera view, 4 times a second for about 10 seconds.
# No door, no PIR, no web server. Use it to see what the model reports for the empty roof,
# for your hand, or for a picture of an animal held in front of the camera.
# Run from /app/src/main:  python3 detect_check.py     (Ctrl+C stops it early)

model = YoloTRT(JsonConfig().get_model_config())

pipeline = (
    "nvarguscamerasrc sensor-id=0 ! "
    "video/x-raw(memory:NVMM), width=1280, height=720, "
    "format=(string)NV12, framerate=(fraction)30/1 ! "
    "nvvidconv flip-method=0 ! "
    "video/x-raw, width=640, height=480, format=(string)BGRx ! "
    "videoconvert ! "
    "video/x-raw, format=(string)BGR ! appsink"
)
cap = cv2.VideoCapture(pipeline, cv2.CAP_GSTREAMER)

try:
    for i in range(40):
        ok, img = cap.read()
        if not ok:
            print("no frame from the camera")
            break
        img = imutils.resize(img, width=600)
        detections, t = model.Inference(img)
        print(i, [(d['class'], round(float(d['conf']), 2)) for d in detections])
        time.sleep(0.25)
finally:
    cap.release()
