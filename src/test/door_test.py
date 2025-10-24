import io_control as io
import numpy as np
import time
import cv2

reqClose = 0

io.set_all_pins()

def initDoor():
    io.set_val('ENB', True)
    return True

def openDoor():
    io.set_val('IN3', False)
    io.set_val('IN4', True)
    return True

def closeDoor():
    io.set_val('IN3', True)
    io.set_val('IN4', False)
    return True

initDoor()
cv2.imshow('Frame', np.zeros(shape=[512,512,3],dtype=np.uint8))

for i in range(500):
    openDoor()
    print('Opening')
    time.sleep(0.4)
io.all_pins_off()