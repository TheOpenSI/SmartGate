#!/usr/bin/env python3
import Jetson.GPIO as GPIO
import sys
import time

# Get the pin logical state from the Jetson Nano 
# 
# Usage: python3 get_pin.py <pin_number>
#
# pin_number: Pin index on the Jetson Nano
#

def main(pin):
    #Set up the GPIO pin
    GPIO.setmode(GPIO.BOARD)
    GPIO.setup(pin, GPIO.IN)

    try:
        print(f"Reading pin {pin}. Press Ctrl+C to stop.")
        while True:
            #Read state the pin
            pin_state = GPIO.input(pin)
            print(f"Pin {pin} state: {'HIGH' if pin_state else 'LOW'}")
            #Delay
            time.sleep(0.1) 
    except KeyboardInterrupt:
        print("\nKeyboard interrupt. Exiting program...")
    finally:
        #Clean up here
        GPIO.cleanup()  

if __name__ == "__main__":
    if len(sys.argv) != 2:
        print("[*] Usage: python3 get_pin.py <pin_number>")
        sys.exit(1)

    try:
        pin_number = int(sys.argv[1])
    except ValueError:
        print("[-] Please provide a valid pin number...")
        sys.exit(1)

    main(pin_number)