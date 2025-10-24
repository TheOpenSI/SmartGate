#!/usr/bin/env python3
import sys
import Jetson.GPIO as GPIO

# set the pin logical state from the Jetson Nano
# 
# Usage: python3 set_pin.py <pin_number> <state>
#
# pin_number: Pin index on the Jetson Nano
# state: Set pin state (0 for LOW, 1 for HIGH)

def set_pin_state(pin, state):
    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(pin, GPIO.OUT)
    
    #Set the pin to the desired state
    if state == 1:
        GPIO.output(pin, GPIO.HIGH)
        print(f"Pin {pin} set to HIGH")
    elif state == 0:
        GPIO.output(pin, GPIO.LOW)
        print(f"Pin {pin} set to LOW")
    else:
        print("Invalid state. Use 1 for HIGH or 0 for LOW.")
    
    #Clean up here
    #GPIO.cleanup()

if __name__ == "__main__":
    #Check for correct number of arguments
    if len(sys.argv) != 3:
        print("Usage: python3 set_pin.py <pin_number> <state>")
        sys.exit(1)
    
    try:
        pin_number = int(sys.argv[1])
        state = int(sys.argv[2])
        
        #Set the pin to specified state
        set_pin_state(pin_number, state)
        
    except ValueError:
        print("Invalid input. Please provide integer values for pin number and state.")
        sys.exit(1)