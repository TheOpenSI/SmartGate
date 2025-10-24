import cv2
import Jetson.GPIO as io
import torch

dispW = 480
dispH = 360
flip = 2
camSet = 'nvarguscamerasrc ! video/x-raw(memory:NVMM), width=3264, height=2464, format=NV12, framerate=21/1 ! nvvidconv flip-method='+str(flip)+' ! video/x-raw, width='+str(dispW)+', height='+str(dispH)+', format=BGRx ! videoconvert ! video/x-raw, format=BGR ! appsink'
cam = cv2.VideoCapture(camSet)
while True:
    ret, frame = cam.read()
    cv2.imshow('piCam', frame)
    if cv2.waitKey(1) == ord('q'):
        break
cam.release()
cv2.destroyAllWindows()