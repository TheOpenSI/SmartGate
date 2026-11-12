import time
import Jetson.GPIO as GPIO
import io_control as io
from door_control import DoorControl

# Bench test for the stepper door code. No camera, no web server.
# Opens for 4 seconds, stops, closes for 4 seconds, stops, then switches every coil off.
# At 0.25 s per step that is about 16 steps (a third of a turn) each way.
# To test the Hall sensors, hold the magnet at the OPEN sensor (pin 11) while it is opening.

io.set_all_pins()
door = DoorControl()

try:
    print("Opening for 4 seconds...")
    door.open_door()
    time.sleep(4)
    print("opening flag:", door.is_door_opening, " closing flag:", door.is_door_closing)
    door.stop_door()
    print("after stop -> opening flag:", door.is_door_opening, " closing flag:", door.is_door_closing)

    time.sleep(1)

    print("Closing for 4 seconds...")
    door.close_door()
    time.sleep(4)
    door.stop_door()
    print("Done.")
finally:
    io.all_pins_off()
    GPIO.cleanup()
